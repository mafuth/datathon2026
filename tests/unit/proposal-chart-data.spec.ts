import type { ProposalCostItem } from '../../src/lib/mobility/proposal-planning';

import { describe, expect, it } from 'vitest';

import {
  proposalCostTreemap,
  proposalCostWaterfall,
  proposalUnitFill
} from '../../src/lib/mobility/proposal-chart-data';

function item(id: string, capital: number, annual = 0, costAvailable = true): ProposalCostItem {
  return {
    operationId: id,
    serviceId: `service-${id}`,
    label: `Improvement ${id}`,
    kind: 'add_service',
    capital,
    annual,
    basis: 'Fixture allowance',
    sourceIds: [],
    estimated: true,
    costAvailable
  };
}

describe('proposal chart evidence', () => {
  it('makes every funding increment additive and reconciles to the supplied ten-year total', () => {
    const steps = proposalCostWaterfall({ capital: 120, annual: 20, tenYear: 320 });
    expect(steps.map(({ value }) => value)).toEqual([120, 20, 80, 100, 320]);
    expect(steps.map(({ start, end }) => [start, end])).toEqual([
      [0, 120],
      [120, 140],
      [140, 220],
      [220, 320],
      [0, 320]
    ]);
    expect(steps.slice(0, -1).reduce((sum, step) => sum + step.value, 0)).toBe(steps.at(-1)?.value);
  });

  it('retains zero cost steps without inventing a minimum positive allowance', () => {
    const steps = proposalCostWaterfall({ capital: 0, annual: 0, tenYear: 0 });
    expect(steps.every((step) => step.start === 0 && step.end === 0 && step.value === 0)).toBe(true);
    expect(proposalCostTreemap({ items: [item('zero', 0), item('unknown', 100, 10, false)] })).toEqual([]);
  });

  it('bounds the treemap to top five plus Other, with proportional areas and exact known costs', () => {
    const items = [
      item('a', 100, 10),
      item('b', 150),
      item('c', 100),
      item('d', 75),
      item('e', 50),
      item('f', 30),
      item('g', 20),
      item('zero', 0),
      item('unknown', 1_000, 100, false)
    ];
    const tiles = proposalCostTreemap({ items });
    expect(tiles.map(({ id, value, itemCount }) => ({ id, value, itemCount }))).toEqual([
      { id: 'a', value: 200, itemCount: 1 },
      { id: 'b', value: 150, itemCount: 1 },
      { id: 'c', value: 100, itemCount: 1 },
      { id: 'd', value: 75, itemCount: 1 },
      { id: 'e', value: 50, itemCount: 1 },
      { id: 'other', value: 50, itemCount: 2 }
    ]);
    const total = 625;
    const canvasArea = 360 * 180;
    expect(tiles.reduce((sum, tile) => sum + tile.value, 0)).toBe(total);
    expect(tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0)).toBeCloseTo(canvasArea);
    for (const tile of tiles) {
      expect(tile.share).toBeCloseTo(tile.value / total);
      expect((tile.width * tile.height) / canvasArea).toBeCloseTo(tile.share);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x + tile.width).toBeLessThanOrEqual(360 + 1e-10);
      expect(tile.y + tile.height).toBeLessThanOrEqual(180 + 1e-10);
    }
    for (let left = 0; left < tiles.length; left += 1) {
      for (let right = left + 1; right < tiles.length; right += 1) {
        const a = tiles[left];
        const b = tiles[right];
        const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        expect(overlapWidth * overlapHeight).toBeCloseTo(0);
      }
    }
  });

  it('uses stable identifiers to break equal-cost ties and gives one positive item the whole frame', () => {
    expect(proposalCostTreemap({ items: [item('b', 10), item('a', 10)] }).map(({ id }) => id)).toEqual(['a', 'b']);
    expect(proposalCostTreemap({ items: [item('single', 10)] })[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 360,
      height: 180,
      share: 1
    });
  });

  it('preserves fractional tiles for facilities and budget shares, with bounded empty/full cells', () => {
    expect([0, 1, 2, 3].map((index) => proposalUnitFill(5, 2, index))).toEqual([1, 1, 0.5, 0]);
    expect(proposalUnitFill(57.25, 1, 57)).toBe(0.25);
    expect(proposalUnitFill(0, 1, 0)).toBe(0);
    expect(proposalUnitFill(120, 1, 99)).toBe(1);
  });
});
