import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function selectHulhumale(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const search = page.getByRole('textbox', { name: 'Search for an island' });
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.fill('Hulhumal');
  await page
    .getByRole('option', { name: /Hulhumal/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'All islands', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Island details', exact: true })).toBeVisible();
}

async function expectReadableControl(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  const contrast = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (rgb: number[]) =>
      rgb.reduce((sum, channel, index) => {
        const value = channel / 255;
        return (
          sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]
        );
      }, 0);
    const foreground = luminance(channels(style.color));
    const background = luminance(channels(style.backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast, 'Selected and primary controls need readable text contrast').toBeGreaterThanOrEqual(4.5);
}

test('island dock, map layers and all analytics views work with readable selected controls', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectHulhumale(page);

  const breakdown = page.locator('details.score-breakdown');
  await expect(breakdown).not.toHaveAttribute('open', '');
  await breakdown.locator('summary').click();
  await expect(breakdown).toHaveAttribute('open', '');
  await expect(breakdown.getByTestId('island-score-comparison')).toBeVisible();
  await breakdown.locator('summary').click();

  const layers = page.locator('details.map-layers');
  await expect(layers).not.toHaveAttribute('open', '');
  await layers.locator(':scope > summary').click();
  for (const [label, initial] of [
    ['Transport routes', true],
    ['Inbound demand', false]
  ] as const) {
    const toggle = layers.getByRole('button', { name: label, exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', String(initial));
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', String(!initial));
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', String(initial));
  }
  await layers.locator(':scope > summary').click();
  await expectReadableControl(page.getByRole('button', { name: 'Create a proposal', exact: true }));

  const open = page.getByRole('button', { name: 'Island details', exact: true });
  await open.click();
  const analytics = page.getByRole('dialog', { name: 'Island details and analytics' });
  const close = analytics.getByRole('button', { name: 'Close island analytics' });
  await expect(analytics).toBeVisible({ timeout: 30_000 });
  await expect(close).toBeFocused();
  await expect(analytics.getByRole('heading', { name: 'Where connections matter most' })).toBeVisible({
    timeout: 30_000
  });
  for (const [tab, heading] of [
    ['People & services', 'Population'],
    ['Model detail', 'What makes up this score?'],
    ['Access', 'Where connections matter most']
  ]) {
    await analytics.getByRole('tab', { name: tab, exact: true }).click();
    await expect(analytics.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('data-state', 'active');
    await expect(analytics.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expectReadableControl(analytics.getByRole('tab', { name: tab, exact: true }));
    await page.screenshot({ path: testInfo.outputPath(`analytics-${tab.toLowerCase().replaceAll(' ', '-')}.png`) });
  }
  await close.click();
  await expect(analytics).toBeHidden();
  await expect(open).toBeFocused();
  await open.press('Enter');
  await expect(close).toBeFocused();
  await close.press('Escape');
  await expect(analytics).toBeHidden();
  await expect(open).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test('national analytics returns keyboard focus to its score explanation control', async ({ page }) => {
  test.setTimeout(120_000);
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const open = page.locator('button[aria-controls="national-analytics-dialog"]');
  await expect(open).toBeVisible({ timeout: 60_000 });
  await expect(open).toHaveAttribute('aria-haspopup', 'dialog');
  await open.click();
  const analytics = page.getByRole('dialog', { name: 'National accessibility analytics' });
  const close = analytics.getByRole('button', { name: 'Close analytics', exact: true });
  await expect(analytics).toBeVisible({ timeout: 30_000 });
  await expect(close).toBeFocused();
  await close.click();
  await expect(analytics).toBeHidden();
  await expect(open).toBeFocused();
  await open.press('Enter');
  await expect(close).toBeFocused();
  await close.press('Escape');
  await expect(analytics).toBeHidden();
  await expect(open).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

for (const viewport of [
  { width: 360, height: 780 },
  { width: 768, height: 1024 }
]) {
  test(`island analytics stays accessible without page overflow at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const runtimeErrors = collectRuntimeErrors(page);
    await page.setViewportSize(viewport);
    await selectHulhumale(page);
    const open = page.getByRole('button', { name: 'Island details', exact: true });
    await open.click();
    const analytics = page.getByRole('dialog', { name: 'Island details and analytics' });
    const close = analytics.getByRole('button', { name: 'Close island analytics' });
    await expect(analytics).toBeVisible({ timeout: 30_000 });
    await expect(close).toBeVisible();
    await expect(close).toBeFocused();
    await expect(analytics.getByRole('tab', { name: 'Model detail', exact: true })).toBeVisible({ timeout: 30_000 });
    await analytics.getByRole('tab', { name: 'Model detail', exact: true }).click();
    const bounds = await analytics.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await analytics.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`analytics-${viewport.width}px.png`) });
    await close.click();
    await expect(analytics).toBeHidden();
    await expect(open).toBeVisible();
    await expect(open).toBeFocused();
    expect(runtimeErrors).toEqual([]);
  });
}
