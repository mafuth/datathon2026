import type { Locator, Page } from '@playwright/test';

import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.setTimeout(150_000);

async function openProposal(page: Page): Promise<Locator> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const score = page.getByRole('region', { name: 'National mobility score' });
  await expect(score).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
  await score.getByRole('textbox', { name: 'Search for an island' }).fill('Hulhumal');
  await page
    .getByRole('option', { name: /Hulhumal/i })
    .first()
    .click();
  const create = page.getByRole('button', { name: 'Create a proposal', exact: true });
  await expect(create).toBeVisible({ timeout: 30_000 });
  await expectReadableControl(create);
  await create.click();
  const builder = page.locator('.proposal-builder-panel');
  await expect(builder).toBeVisible({ timeout: 45_000 });
  await expect(builder).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
  return builder;
}

async function expectReadableControl(control: Locator): Promise<void> {
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
  // Auto-retry through the short selected-state colour transition before assessing its resting contrast.
  await expect
    .poll(async () => {
      const colors = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return { foreground: style.color, background: style.backgroundColor };
      });
      const first = luminance(colors.foreground);
      const second = luminance(colors.background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    })
    .toBeGreaterThanOrEqual(4.5);
}

async function islandPlacementPoint(page: Page): Promise<{ x: number; y: number }> {
  await expect(page.locator('[data-service-marker], [data-service-cluster-marker]').first()).toBeVisible({
    timeout: 30_000
  });
  const builder = await page.locator('.proposal-builder-panel').boundingBox();
  const viewport = page.viewportSize();
  if (!builder || !viewport) throw new Error('Proposal workspace has no visible dimensions.');
  // Use a visible mapped service as the geographic reference, and place beside its marker.
  // This follows what a user can see without reaching into MapLibre or application state.
  const points = await page.locator('[data-service-marker], [data-service-cluster-marker]').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.right + 7, y: box.y + box.height / 2, width: box.width, height: box.height };
    })
  );
  const candidates = points.filter(
    (point) =>
      point.width > 0 &&
      point.height > 0 &&
      point.x > builder.x + builder.width + 35 &&
      point.x < viewport.width - 60 &&
      point.y > 100 &&
      point.y < viewport.height - 180
  );
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - viewport.width * 0.7, a.y - viewport.height * 0.5) -
      Math.hypot(b.x - viewport.width * 0.7, b.y - viewport.height * 0.5)
  );
  if (!candidates.length) throw new Error('No unobscured island service is available for a visible map placement.');
  return candidates[0];
}

async function confirmPlacement(page: Page, builder: Locator): Promise<void> {
  const confirmation = builder.getByRole('region', { name: 'Review pending change' });
  await expect(confirmation).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-proposal-location]')).toBeVisible();
  const add = confirmation.getByRole('button', { name: 'Add to proposal', exact: true });
  await expect(add).toBeEnabled({ timeout: 45_000 });
  await expectReadableControl(add);
  await add.click();
  await expect(confirmation).toBeHidden();
  await expect(builder.getByRole('heading', { name: /Your improvements/ })).toHaveText(/Your improvements\s*1/);
  await expect(page.locator('.proposal-service-marker [data-service-marker]').first()).toBeVisible({ timeout: 30_000 });
}

test('proposal click placement, undo, drag placement, budget edits and chart PDF export', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const builder = await openProposal(page);
  const point = await islandPlacementPoint(page);

  await builder.getByRole('button', { name: 'Bus stop', exact: true }).click();
  await expect(
    builder.getByRole('status').filter({ hasText: 'Click inside the island to place Bus stop.' })
  ).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await confirmPlacement(page, builder);
  await builder.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(builder.getByRole('heading', { name: /Your improvements/ })).toHaveText(/Your improvements\s*0/);
  await expect(page.locator('.proposal-service-marker [data-service-marker]')).toHaveCount(0);

  const canvas = page.locator('.maplibregl-canvas');
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds) throw new Error('Map canvas is not visible.');
  await builder.getByRole('button', { name: 'Bus stop', exact: true }).dragTo(canvas, {
    targetPosition: { x: point.x - canvasBounds.x, y: point.y - canvasBounds.y }
  });
  await confirmPlacement(page, builder);

  await builder.getByRole('button', { name: 'Edit limits', exact: true }).click();
  await builder.getByRole('spinbutton', { name: 'Upfront limit (MVR)', exact: true }).fill('60000000');
  await builder.getByRole('spinbutton', { name: 'Annual running limit (MVR)', exact: true }).fill('15000000');
  await builder.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(builder).toHaveAttribute('aria-busy', 'false');
  await expect(builder.locator('.proposal-budget-totals').first()).toContainText('60m');
  await expect(builder.locator('.proposal-budget-totals').first()).toContainText('15m');

  await builder.getByRole('button', { name: 'Review full impact', exact: true }).click();
  const review = page.locator('.proposal-review-dialog');
  await expect(review).toBeVisible({ timeout: 45_000 });
  await expect(review).toContainText('1 accepted change');
  await expect(review.locator('[data-proposal-chart="costs"]')).toBeVisible();
  await expect(review.getByText('Draft proposal', { exact: true })).toBeVisible();
  await expectReadableControl(review.getByText('Draft proposal', { exact: true }));
  await review.locator('[data-proposal-chart="demand"]').scrollIntoViewIfNeeded();
  await expect(review.locator('[data-proposal-chart="demand"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('proposal-review-desktop.png') });
  const downloadButton = review.getByRole('button', { name: 'Download proposal PDF', exact: true });
  await expect(downloadButton).toBeEnabled({ timeout: 45_000 });
  const downloadReady = page.waitForEvent('download', { timeout: 60_000 });
  await downloadButton.click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  await download.saveAs(testInfo.outputPath('proposal-review.pdf'));
  const path = await download.path();
  if (!path) throw new Error('The proposal PDF was not saved.');
  const pdf = await readFile(path);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(2000);
  await review.getByRole('button', { name: 'Back to map', exact: true }).click();
  await expect(review).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test('proposal priority contrast, suggestions and compact bus/ferry controls', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const builder = await openProposal(page);
  await builder.getByRole('tab', { name: 'Suggest a draft', exact: true }).click();
  const transport = builder.getByRole('button', { name: 'Transport', exact: true });
  await expect(transport).toHaveAttribute('data-state', 'on');
  await expectReadableControl(transport);
  const education = builder.getByRole('button', { name: 'Education', exact: true });
  await education.click();
  await expect(education).toHaveAttribute('data-state', 'on');
  await expectReadableControl(education);
  await builder.getByRole('button', { name: 'Find options within my budget', exact: true }).click();
  await expect(builder.getByRole('list', { name: 'Suggested improvements' })).toBeVisible({ timeout: 45_000 });
  await expect(builder.getByRole('button', { name: 'Add suggested draft', exact: true })).toBeEnabled({
    timeout: 45_000
  });
  await builder.getByRole('button', { name: 'Cancel suggestions', exact: true }).click();
  await builder.getByRole('tab', { name: 'Place improvements', exact: true }).click();
  await builder.getByText('Bus & ferry services', { exact: true }).click();
  const planner = builder.getByRole('region', { name: 'Plan bus and ferry services' });
  await expect(planner).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
  await expect(planner.getByRole('button', { name: 'Bus', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const route = planner.getByLabel('Route & direction', { exact: true });
  await route.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('option').first().click();
  await planner.getByRole('button', { name: 'Ferry', exact: true }).click();
  const destination = planner.getByLabel('To · destination landing', { exact: true });
  await destination.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('option').first().click();
  await expect(planner.getByRole('button', { name: 'Preview ferry connection', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('proposal-transport-controls.png') });
});

test('360px proposal workspace, comparison pills and review stay usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const builder = await openProposal(page);
  const comparison = page.getByRole('navigation', { name: 'Compare the proposal on the map' });
  for (const element of [builder, comparison]) {
    const bounds = await element.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(361);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(801);
  }
  await comparison.getByRole('button', { name: 'Without proposal', exact: true }).click();
  await expect(comparison.getByRole('button', { name: 'Without proposal', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expectReadableControl(comparison.getByRole('button', { name: 'Without proposal', exact: true }));
  await comparison.getByRole('button', { name: 'With proposal', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('proposal-mobile-workspace.png') });
  await builder.getByRole('button', { name: 'Review full impact', exact: true }).click();
  const review = page.locator('.proposal-review-dialog');
  await expect(review).toBeVisible({ timeout: 45_000 });
  const bounds = await review.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.width).toBeLessThanOrEqual(360);
  await expect(review.getByRole('button', { name: 'Back to map', exact: true })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Download proposal PDF', exact: true })).toBeVisible();
  await expect.poll(() => review.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('proposal-review-mobile.png') });
  await review.getByRole('button', { name: 'Back to map', exact: true }).click();
  await builder.getByRole('button', { name: 'Make room for the map', exact: true }).click();
  await expect(builder.getByRole('button', { name: 'Expand proposal panel', exact: true })).toBeVisible();
  await expect(builder.getByRole('button', { name: 'Review full impact', exact: true })).toBeVisible();
});
