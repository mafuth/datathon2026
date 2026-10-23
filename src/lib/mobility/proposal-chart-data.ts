import type { ProposalCosts } from './proposal-planning';

export type ProposalCostTile = {
  id: string;
  label: string;
  value: number;
  itemCount: number;
  share: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function proposalCostWaterfall(costs: Pick<ProposalCosts, 'capital' | 'annual' | 'tenYear'>) {
  const finite = (value: number) => (Number.isFinite(value) && value >= 0 ? value : 0);
  const capital = finite(costs.capital);
  const annual = finite(costs.annual);
  const tenYear = finite(costs.tenYear);
  const amounts = [capital, annual, annual * 4, annual * 5];
  const labels = ['Upfront', 'Year 1', 'Years 2–5', 'Years 6–10'];
  let cumulative = 0;
  const steps = amounts.map((value, index) => {
    const start = cumulative;
    cumulative += value;
    return { id: String(index), label: labels[index], value, start, end: cumulative, total: false };
  });
  return [...steps, { id: 'total', label: '10-year total', value: tenYear, start: 0, end: tenYear, total: true }];
}

/** A bounded binary treemap: all areas use the same capital + ten annual allowances measure. */
export function proposalCostTreemap(costs: Pick<ProposalCosts, 'items'>): ProposalCostTile[] {
  const sorted = costs.items
    .filter((item) => item.costAvailable)
    .map((item) => ({ id: item.operationId, label: item.label, value: item.capital + item.annual * 10, itemCount: 1 }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((left, right) => right.value - left.value || left.id.localeCompare(right.id));
  const entries = sorted.slice(0, 5);
  if (sorted.length > 5) {
    const rest = sorted.slice(5);
    entries.push({
      id: 'other',
      label: 'Other improvements',
      value: rest.reduce((sum, item) => sum + item.value, 0),
      itemCount: rest.length
    });
  }
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  if (!total) return [];
  const result: ProposalCostTile[] = [];
  function split(items: typeof entries, x: number, y: number, width: number, height: number): void {
    const value = items.reduce((sum, item) => sum + item.value, 0);
    if (items.length === 1) {
      result.push({ ...items[0], share: value / total, x, y, width, height });
      return;
    }
    let firstValue = items[0].value;
    let boundary = 1;
    while (
      boundary < items.length - 1 &&
      Math.abs(firstValue + items[boundary].value - value / 2) < Math.abs(firstValue - value / 2)
    ) {
      firstValue += items[boundary].value;
      boundary += 1;
    }
    const ratio = firstValue / value;
    if (width >= height) {
      split(items.slice(0, boundary), x, y, width * ratio, height);
      split(items.slice(boundary), x + width * ratio, y, width * (1 - ratio), height);
    } else {
      split(items.slice(0, boundary), x, y, width, height * ratio);
      split(items.slice(boundary), x, y + height * ratio, width, height * (1 - ratio));
    }
  }
  split(entries, 0, 0, 360, 180);
  return result;
}

export function proposalUnitFill(value: number, unitsPerCell: number, index: number): number {
  return Math.max(0, Math.min(1, value / unitsPerCell - index));
}
