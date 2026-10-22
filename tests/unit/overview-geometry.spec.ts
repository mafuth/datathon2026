import { describe, expect, it } from 'vitest';

import { detailGeometry, overviewGeometry } from '../../src/lib/server/mobility/overview-geometry';

describe('initial overview coastlines', () => {
  it('reduces redundant coordinates while preserving closed rings, holes and the original detail', () => {
    const ring = Array.from({ length: 400 }, (_, index) => {
      const angle = (index / 400) * 2 * Math.PI;
      return [73 + Math.cos(angle) * 0.01, 4 + Math.sin(angle) * 0.01];
    });
    ring.push(ring[0]);
    const hole = [
      [73, 4],
      [73.001, 4],
      [73, 4.001],
      [73, 4]
    ];
    const original = { type: 'Polygon', coordinates: [ring, hole] };
    const serialized = JSON.stringify(original);
    const result = overviewGeometry(original).coordinates as number[][][];
    expect(result).toHaveLength(2);
    expect(result[0].length).toBeLessThan(ring.length / 4);
    expect(result[0][0]).toEqual(result[0].at(-1));
    expect(result[0].length).toBeGreaterThanOrEqual(4);
    expect(result[1]).toEqual(hole);
    expect(JSON.stringify(original)).toBe(serialized);
  });

  it('preserves small islands and supports multipolygons', () => {
    const tiny = [
      [73, 4],
      [73.00001, 4],
      [73, 4.00001],
      [73, 4]
    ];
    expect(overviewGeometry({ type: 'MultiPolygon', coordinates: [[tiny]] }).coordinates).toEqual([[tiny]]);
    const point = { type: 'Point', coordinates: [73, 4] };
    expect(overviewGeometry(point)).toBe(point);
  });
});

describe('detailed display coastlines', () => {
  it('retains vertices, closed rings, holes and altitude without changing source geometry', () => {
    const ring = [
      [73.123456789123, 4.212345678912, 12],
      [73.124456789123, 4.212345678912, 13],
      [73.123456789123, 4.213345678912, 14],
      [73.123456789123, 4.212345678912, 12]
    ];
    const hole = ring.map(([longitude, latitude, altitude]) => [longitude + 0.0001, latitude + 0.0001, altitude]);
    const original = { type: 'MultiPolygon', coordinates: [[ring, hole]] };
    const serialized = JSON.stringify(original);
    const output = detailGeometry(original).coordinates as number[][][][];
    expect(output[0]).toHaveLength(2);
    for (const [ringIndex, source] of [ring, hole].entries()) {
      const result = output[0][ringIndex];
      expect(result).toHaveLength(source.length);
      expect(result[0]).toEqual(result.at(-1));
      for (const [index, point] of result.entries()) {
        expect(Math.abs(point[0] - source[index][0])).toBeLessThanOrEqual(0.000000051);
        expect(Math.abs(point[1] - source[index][1])).toBeLessThanOrEqual(0.000000051);
        expect(point[2]).toBe(source[index][2]);
      }
    }
    expect(JSON.stringify(original)).toBe(serialized);
  });

  it('retains exact coordinates when precision reduction would collapse a polygon', () => {
    const tiny = [
      [73, 4],
      [73.00000001, 4],
      [73, 4.00000001],
      [73, 4]
    ];
    expect(detailGeometry({ type: 'Polygon', coordinates: [tiny] }).coordinates).toEqual([tiny]);
    const point = { type: 'Point', coordinates: [73, 4] };
    expect(detailGeometry(point)).toBe(point);
  });
});
