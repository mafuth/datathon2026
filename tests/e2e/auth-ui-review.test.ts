import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

async function expectReadableText(locator: Locator): Promise<void> {
  const appearance = await locator.evaluate((element) => {
    const foreground = getComputedStyle(element);
    let ancestor: Element | null = element;
    let background = 'rgb(255, 255, 255)';
    while (ancestor) {
      const color = getComputedStyle(ancestor).backgroundColor;
      if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        background = color;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    return { color: foreground.color, background, size: Number.parseFloat(foreground.fontSize) };
  });
  const luminance = (color: string): number => {
    const channels = color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Unsupported computed color: ${color}`);
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const first = luminance(appearance.color);
  const second = luminance(appearance.background);
  expect((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)).toBeGreaterThanOrEqual(4.5);
  expect(appearance.size).toBeGreaterThanOrEqual(11);
}

async function expectSharedTypography(page: Page): Promise<void> {
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'MobiliX', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: /^Switch to .+ mode$/ })).toBeInViewport();
  const fonts = await page.getByRole('heading', { level: 1 }).evaluate((heading) => {
    const root = getComputedStyle(document.documentElement);
    const primaryFamily = (value: string) => value.split(',')[0].trim().replace(/['"]/g, '');
    return {
      heading: primaryFamily(getComputedStyle(heading).fontFamily),
      expectedHeading: primaryFamily(root.getPropertyValue('--mobility-font-heading')),
      body: primaryFamily(getComputedStyle(document.body).fontFamily),
      expectedBody: primaryFamily(root.getPropertyValue('--mobility-font-body')),
      headingSize: Number.parseFloat(getComputedStyle(heading).fontSize)
    };
  });
  expect(fonts.heading).toBe(fonts.expectedHeading);
  expect(fonts.body).toBe(fonts.expectedBody);
  expect(fonts.headingSize).toBeGreaterThanOrEqual(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 1440, height: 900 }
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`public auth is readable and navigable at ${viewport.width}px in ${colorScheme} system theme`, async ({
      page
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      const runtimeErrors: string[] = [];
      const mutationRequests: string[] = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      page.on('request', (request) => {
        if (request.method() !== 'GET' && request.method() !== 'HEAD') mutationRequests.push(request.url());
      });

      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      const heading = page.getByRole('heading', { name: 'Welcome back', exact: true });
      await expect(heading).toBeVisible();
      await expectSharedTypography(page);
      await expectReadableText(heading);
      await expectReadableText(page.locator('main header p'));
      await expectReadableText(page.getByRole('button', { name: 'Sign in', exact: true }));
      await expectReadableText(page.locator('label').filter({ hasText: /^Email$/ }));
      await expectReadableText(page.locator('label').filter({ hasText: /^Password$/ }));
      await expectReadableText(page.getByRole('link', { name: 'Forgot password?', exact: true }));

      const email = page.getByRole('textbox', { name: 'Email', exact: true });
      const password = page.getByLabel('Password', { exact: true });
      await expect(email).toBeVisible();
      await expect(email).toHaveValue('');
      await expect(password).toHaveValue('');
      await expect(password).toHaveAttribute('type', 'password');
      await page.getByRole('button', { name: 'Show password', exact: true }).click();
      await expect(password).toHaveAttribute('type', 'text');
      await page.getByRole('button', { name: 'Hide password', exact: true }).click();
      await expect(password).toHaveAttribute('type', 'password');
      await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveAttribute('href', '/register');
      await testInfo.attach('sign-in', {
        body: await page.screenshot({ path: testInfo.outputPath('sign-in.png'), fullPage: true }),
        contentType: 'image/png'
      });

      // Exercise genuine client validation before leaving the form, without
      // submitting credentials or sending a password-reset email.
      await email.fill('invalid-email');
      await password.focus();
      const emailError = page.getByRole('alert').filter({ hasText: 'Invalid email address' });
      await expect(emailError).toBeVisible();
      await expectReadableText(emailError);

      await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
      await expect(page).toHaveURL(/\/password$/);
      const resetHeading = page.getByRole('heading', { name: 'Reset password', exact: true });
      await expect(resetHeading).toBeVisible();
      await expectSharedTypography(page);
      await expectReadableText(resetHeading);
      await expectReadableText(page.locator('main header p'));
      await expectReadableText(page.getByRole('button', { name: 'Send reset link', exact: true }));
      await expectReadableText(page.getByRole('link', { name: 'Back to sign in', exact: true }));
      await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('');
      await testInfo.attach('password-reset', {
        body: await page.screenshot({ path: testInfo.outputPath('password-reset.png'), fullPage: true }),
        contentType: 'image/png'
      });

      await page.getByRole('link', { name: 'Back to sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(heading).toBeVisible();
      await expect(email).toHaveValue('');
      await expect(password).toHaveValue('');

      await page.getByRole('link', { name: 'Sign up', exact: true }).click();
      await expect(page).toHaveURL(/\/register$/);
      const registerHeading = page.getByRole('heading', { name: 'Create your account', exact: true });
      await expect(registerHeading).toBeVisible();
      await expectSharedTypography(page);
      await expectReadableText(registerHeading);
      await expectReadableText(page.locator('main header p'));
      await expectReadableText(page.getByRole('button', { name: 'Create account', exact: true }));
      for (const label of ['Name', 'Email', 'Password', 'Confirm password']) {
        await expectReadableText(page.locator('label').filter({ hasText: new RegExp(`^${label}$`) }));
        await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
      }
      await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
      await expect(page.getByLabel('Confirm password', { exact: true })).toHaveAttribute('type', 'password');
      const returnToLogin = page.getByRole('link', { name: 'Sign in', exact: true });
      await expectReadableText(returnToLogin);
      await testInfo.attach('registration', {
        body: await page.screenshot({ path: testInfo.outputPath('registration.png'), fullPage: true }),
        contentType: 'image/png'
      });
      await returnToLogin.click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(heading).toBeVisible();
      expect(mutationRequests).toEqual([]);
      expect(runtimeErrors).toEqual([]);
    });
  }
}
