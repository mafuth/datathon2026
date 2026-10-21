import { expect, test } from '@playwright/test';

test('analytics labels inbound demand and preserves zero category values', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Why/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Why/i }).click();
  await expect(page.getByRole('heading', { name: /Why/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Score drivers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'External demand hotspots' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inbound demand origins' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Most inaccessible islands' })).toBeVisible();
  await expect(page.getByText('Priority', { exact: true })).toHaveCount(0);
  await expect(page.getByText('partial', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Inbound estimated need from other islands')).toHaveCount(0);
  await expect(page.getByText('Each factor is weighted by the population it serves.')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Transport' }).click();
  await expect(page.getByText(/0%/).first()).toBeVisible();
});
