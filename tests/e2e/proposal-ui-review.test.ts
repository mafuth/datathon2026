import type { Locator, Page } from '@playwright/test';

import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib';

import { config } from '../../src/lib/config/config.server';

test.setTimeout(150_000);

async function openProposal(page: Page): Promise<{ builder: Locator; summary: Locator }> {
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
  await create.click();
  const builder = page.locator('.proposal-builder-panel');
  const summary = page.getByRole('region', { name: 'Proposal summary' });
  await expect(builder).toBeVisible({ timeout: 45_000 });
  await expect(builder).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
  await expect(summary).toBeVisible();
  return { builder, summary };
}

function attachment(pdf: PDFDocument, filename: string): Record<string, unknown> {
  const names = pdf.catalog
    .lookup(PDFName.of('Names'), PDFDict)
    .lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    .lookup(PDFName.of('Names'), PDFArray);
  for (let index = 0; index < names.size(); index += 2) {
    if (names.lookup(index, PDFHexString).decodeText() !== filename) continue;
    const stream = names
      .lookup(index + 1, PDFDict)
      .lookup(PDFName.of('EF'), PDFDict)
      .lookup(PDFName.of('F'));
    if (!(stream instanceof PDFRawStream)) throw new Error(`Expected ${filename} to contain an embedded file stream`);
    return JSON.parse(new TextDecoder().decode(decodePDFRawStream(stream).decode())) as Record<string, unknown>;
  }
  throw new Error(`Missing ${filename}`);
}

function labels(pdf: PDFDocument): string {
  return pdf
    .getPages()
    .map((page) => {
      const value = page.node.Contents();
      const streams =
        value instanceof PDFArray
          ? Array.from({ length: value.size() }, (_, index) => value.lookup(index, PDFRawStream))
          : value instanceof PDFRawStream
            ? [value]
            : [];
      const operators = streams
        .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
        .join('\n');
      return [...operators.matchAll(/<([0-9A-F]+)>\s*Tj/gi)]
        .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
        .join('\n');
    })
    .join('\n');
}

test('creates a priced proposal, verifies its PDF evidence, and closes proposal mode', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const { builder, summary } = await openProposal(page);
  const services = builder.getByRole('list', { name: 'Services on selected island' }).getByRole('button');
  let acceptedOperation = '';
  for (let index = 0; index < (await services.count()); index += 1) {
    await services.nth(index).click();
    const upgrade = page.locator('.service-details-popup').getByRole('button', { name: 'Upgrade', exact: true });
    if (await upgrade.isEnabled()) {
      await upgrade.click();
      await expect(summary.locator('.proposal-summary-changes li')).toHaveCount(1, { timeout: 45_000 });
      acceptedOperation =
        (await summary.locator('.proposal-summary-changes li span').first().textContent())?.trim() ?? '';
      break;
    }
  }
  expect(acceptedOperation).not.toBe('');
  await expect(summary.locator('.proposal-summary-changes li').first()).not.toContainText('Unpriced');

  await expect(builder.getByText('Planning assumptions', { exact: true })).toHaveCount(0);
  await expect(page.locator('.proposal-review-dialog')).toHaveCount(0);
  await expect(summary.getByRole('heading', { name: 'Cost' })).toBeVisible();
  await expect(summary.getByRole('heading', { name: 'Modeled benefit' })).toBeVisible();
  await expect(summary.getByLabel('Cost projection chart')).toBeVisible();
  await expect(summary.getByLabel('Budget usage chart')).toBeVisible();
  await expect(summary.getByLabel('Facility comparison chart')).toBeVisible();
  await expect(summary.getByLabel('Ten-year cost composition chart')).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Save as defaults' })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Restore defaults' })).toBeVisible();
  await expect(summary).not.toContainText(/operationId|serviceId|draft:/i);

  const colors = await summary.evaluate((element) => {
    const style = getComputedStyle(element);
    return { scheme: style.colorScheme, background: style.backgroundColor, color: style.color };
  });
  expect(colors.scheme).toContain('light');
  expect(colors.background).toBe('rgb(255, 255, 255)');
  expect(colors.color).toBe('rgb(9, 9, 11)');
  const width = await summary.evaluate((element) => element.getBoundingClientRect().width);
  expect(width).toBeGreaterThanOrEqual(500);

  const upfrontBudget = summary.getByLabel('Upfront budget (MVR)');
  const annualBudget = summary.getByLabel('Annual budget (MVR)');
  await upfrontBudget.fill('73000000');
  await upfrontBudget.blur();
  await annualBudget.fill('9000000');
  await annualBudget.blur();
  await summary.getByRole('button', { name: 'Save as defaults' }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('mobility:proposal:defaults:v1')))
    .toContain('73000000');
  await summary.getByRole('button', { name: 'Restore defaults' }).click();
  await expect(upfrontBudget).toHaveValue('50000000');
  await expect(annualBudget).toHaveValue('12000000');
  await upfrontBudget.fill('73000000');
  await upfrontBudget.blur();
  await annualBudget.fill('9000000');
  await annualBudget.blur();
  await expect(summary).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });

  const downloadButton = summary.getByRole('button', { name: 'Download proposal PDF', exact: true });
  await expect(downloadButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(pdf.getAuthor()).toBe(config.app.name);

  const input = attachment(pdf, 'proposal-input.json') as {
    selectedIslandId?: string;
    proposal?: { capitalLimit?: number; annualLimit?: number };
    operations?: { operationId?: string }[];
  };
  const evidence = attachment(pdf, 'proposal-evidence.json') as {
    island?: { name?: string };
    costs?: { items?: { operationId?: string; label?: string; costAvailable?: boolean }[] };
  };
  expect(input.selectedIslandId).toBeTruthy();
  expect(input.proposal).toMatchObject({ capitalLimit: 73_000_000, annualLimit: 9_000_000 });
  expect(input.operations).toHaveLength(1);
  expect(evidence.island?.name).toMatch(/Hulhumal/i);
  expect(evidence.costs?.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operationId: input.operations?.[0]?.operationId,
        label: acceptedOperation,
        costAvailable: true
      })
    ])
  );
  const pdfLabels = labels(pdf);
  expect(pdfLabels).toContain(`Generated by ${config.app.name}`);
  expect(pdfLabels).toContain('FUNDING THE PROPOSAL');
  expect(pdfLabels).toContain('Budget use and planning cost');
  expect(pdfLabels).toContain('What changes');
  expect(pdfLabels).toContain('Itemised cost basis');
  expect(pdfLabels).toContain('DRAFT  |  Planning estimates; not an approved investment decision');
  expect(pdfLabels).toContain(acceptedOperation);

  await summary.getByRole('button', { name: 'Close proposal', exact: true }).click();
  await expect(summary).toBeHidden();
  await expect(page.getByRole('button', { name: 'Create a proposal', exact: true })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
