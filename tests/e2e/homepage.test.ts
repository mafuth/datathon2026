import { expect, test } from '@playwright/test';

test('home page loads the national accessibility map and island search', async ({ page }) => {
  await page.goto('/');

  const map = page.getByRole('application', { name: 'National Maldives accessibility score map' });
  const score = page.getByRole('region', { name: 'National mobility score' });

  await expect(page).toHaveTitle(/Accessibility map/);
  await expect(map).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
  await expect(score).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
  await expect(score.getByRole('textbox', { name: 'Search for an island' })).toBeVisible();
  await expect(score.getByRole('button', { name: /^Why / })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Accessibility score legend' })).toBeVisible();
});

test('national score analytics can be opened and closed', async ({ page }) => {
  await page.goto('/');

  const score = page.getByRole('region', { name: 'National mobility score' });
  const analytics = page.getByRole('dialog', { name: 'National accessibility analytics' });

  await expect(score.getByRole('button', { name: /^Why / })).toBeVisible({ timeout: 15_000 });
  await score.getByRole('button', { name: /^Why / }).click();

  await expect(analytics).toBeVisible();
  await expect(analytics.getByRole('heading', { name: 'Score drivers' })).toBeVisible();
  await analytics.getByRole('button', { name: 'Close analytics' }).click();

  await expect(analytics).toBeHidden();
  await expect(score.getByRole('textbox', { name: 'Search for an island' })).toBeVisible();
});
