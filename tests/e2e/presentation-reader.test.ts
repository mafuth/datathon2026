import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

test('slide 14 opens the health demand detail on the model tab', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('body').press('Shift+L');

  const reader = page.getByRole('complementary', { name: 'Presentation reader' });
  await expect(reader).toBeVisible({ timeout: 30_000 });

  for (let slide = 2; slide <= 14; slide += 1) {
    await page.keyboard.press('ArrowRight');
    await expect(reader.locator('.reader-slide-count strong')).toHaveText(String(slide).padStart(2, '0'), {
      timeout: 30_000
    });
    const error = await reader.locator('.reader-error').textContent();
    expect(error).toBeNull();

    if (slide === 7) {
      await expect(reader).not.toContainText('Scene target is unavailable');
    }
    if (slide === 12) {
      await expect(page.locator('[data-presentation-target="island-analytics"]')).toBeVisible();
      await expect(page.locator('[data-presentation-target="inbound-care-value"]')).toBeVisible();
    }
  }

  await expect(page.locator('[data-presentation-target="island-details-tab"]')).toHaveAttribute(
    'data-state',
    'active',
    {
      timeout: 10_000
    }
  );
  await expect(page.locator('[data-presentation-target="health-demand-card"]')).toBeVisible();
  await expect(page.locator('[data-presentation-target="health-demand-percent"]')).toBeVisible();
  await expect(reader).not.toContainText('Scene target is unavailable');
  expect(runtimeErrors).toEqual([]);
});
