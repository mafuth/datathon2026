import type { MarineCoordinate } from '../../src/lib/server/scoring/marine-routing';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it } from 'vitest';

import { createMarineRouter } from '../../src/lib/server/scoring/marine-routing';

const rectangle = (left: number, bottom: number, right: number, top: number): MarineCoordinate[] => [
  [left, bottom],
  [right, bottom],
  [right, top],
  [left, top],
  [left, bottom]
];

function snapshot(geometries: unknown[]): Pick<ScoringSnapshot, 'islands'> {
  return {
    islands: geometries.map((geometry, index) => ({
      id: `island-${index}`,
      name: `Island ${index}`,
      islandType: 'inhabited',
      atollId: 'atoll',
      latitude: 0,
      longitude: 0,
      landAreaKm2: null,
      geoJson: JSON.stringify(geometry)
    }))
  };
}

function polygon(rings: MarineCoordinate[][]) {
  return { type: 'Polygon', coordinates: rings };
}

/** Independent sampling catches interior crossings in the rectangular routing fixtures. */
function staysOutsideRectangles(path: MarineCoordinate[], rectangles: [number, number, number, number][]): boolean {
  for (let index = 1; index < path.length; index++) {
    for (let step = 0; step <= 100; step++) {
      const t = step / 100;
      const x = path[index - 1][0] + (path[index][0] - path[index - 1][0]) * t;
      const y = path[index - 1][1] + (path[index][1] - path[index - 1][1]) * t;
      if (
        rectangles.some(
          ([left, bottom, right, top]) => x > left + 1e-9 && x < right - 1e-9 && y > bottom + 1e-9 && y < top - 1e-9
        )
      )
        return false;
    }
  }
  return true;
}

describe('coastline-aware marine display routing', () => {
  it('keeps unobstructed water endpoints and reuses the index for an immutable snapshot', () => {
    const data = snapshot([polygon([rectangle(0, 0, 1, 1)])]);
    const router = createMarineRouter(data);
    expect(createMarineRouter(data)).toBe(router);
    expect(router.coastlineComplete).toBe(true);
    expect(router.landPolygonCount).toBe(1);
    expect(router.route([-1, 2], [2, 2])).toEqual([
      [-1, 2],
      [2, 2]
    ]);
    expect(router.resolveEndpoint([-1, 2])).toEqual({
      original: [-1, 2],
      shoreline: [-1, 2],
      snapped: false,
      distanceKm: 0
    });
  });

  it('routes around an intervening island instead of emitting its direct land-crossing chord', () => {
    const router = createMarineRouter(snapshot([polygon([rectangle(0, 0, 1, 1)])]));
    const path = router.route([-1, 0.5], [2, 0.5]);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(2);
    expect(path![0]).toEqual([-1, 0.5]);
    expect(path!.at(-1)).toEqual([2, 0.5]);
    expect(staysOutsideRectangles(path!, [[0, 0, 1, 1]])).toBe(true);
    expect(
      router.isWaterPath([
        [-1, 0.5],
        [2, 0.5]
      ])
    ).toBe(false);
  });

  it('checks all islands and all MultiPolygon parts on every output segment', () => {
    const router = createMarineRouter(
      snapshot([
        { type: 'MultiPolygon', coordinates: [[rectangle(0, 0, 1, 1)], [rectangle(2, 0, 3, 1)]] },
        polygon([rectangle(4, 0, 5, 1)])
      ])
    );
    const path = router.route([-1, 0.5], [6, 0.5]);
    expect(router.landPolygonCount).toBe(3);
    expect(path).not.toBeNull();
    expect(
      staysOutsideRectangles(path!, [
        [0, 0, 1, 1],
        [2, 0, 3, 1],
        [4, 0, 5, 1]
      ])
    ).toBe(true);
  });

  it('discovers islands that block the detour even when they do not intersect the original chord', () => {
    const rectangles: [number, number, number, number][] = [
      [0, 0, 1, 1],
      [-0.8, 0.8, 0.2, 1.2],
      [-0.8, -0.2, 0.2, 0.2]
    ];
    const router = createMarineRouter(snapshot(rectangles.map((box) => polygon([rectangle(...box)]))));
    const path = router.route([-1, 0.5], [2, 0.5]);
    expect(path).not.toBeNull();
    expect(staysOutsideRectangles(path!, rectangles)).toBe(true);
  });

  it('finds a water exit from a concave bay instead of treating its convex envelope as land', () => {
    const coast: MarineCoordinate[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [3, 4],
      [3, 1],
      [1, 1],
      [1, 4],
      [0, 4],
      [0, 0]
    ];
    const router = createMarineRouter(snapshot([polygon([coast])]));
    const path = router.route([2, 2], [5, 2]);
    expect(path).not.toBeNull();
    expect(path!.some((point) => point[1] >= 4)).toBe(true);
    expect(router.isWaterPath(path!)).toBe(true);
    expect(
      path!
        .slice(1)
        .reduce((total, point, index) => total + Math.hypot(point[0] - path![index][0], point[1] - path![index][1]), 0)
    ).toBeLessThan(8);
  });

  it('follows the exact coast through a bent narrow harbor whose mouth is outside the local vertex neighborhood', () => {
    const corners: MarineCoordinate[] = [
      [0, 0],
      [10, 0],
      [10, 7],
      [5, 7],
      [5, 3],
      [4, 3],
      [4, 8],
      [10, 8],
      [10, 10],
      [0, 10],
      [0, 0]
    ];
    const coast = corners
      .slice(1)
      .flatMap((end, index) =>
        Array.from(
          { length: 100 },
          (_, step) =>
            [
              (corners[index][0] + ((end[0] - corners[index][0]) * step) / 100) * 0.001,
              (corners[index][1] + ((end[1] - corners[index][1]) * step) / 100) * 0.001
            ] as MarineCoordinate
        )
      );
    const router = createMarineRouter(snapshot([polygon([coast])]));
    const path = router.route([0.0045, 0.0035], [0.012, 0.0075]);
    expect(path).not.toBeNull();
    expect(path!.some(([x, y]) => x >= 0.005 && y >= 0.007 && y <= 0.008)).toBe(true);
    expect(router.isWaterPath(path!)).toBe(true);
    expect(
      path!
        .slice(1)
        .reduce((total, point, index) => total + Math.hypot(point[0] - path![index][0], point[1] - path![index][1]), 0)
    ).toBeLessThan(0.016);
    expect(router.route([0.012, 0.0075], [0.0045, 0.0035])).toEqual([...path!].reverse());
  });

  it('treats holes as water while refusing a route out of a closed lagoon through its land barrier', () => {
    const router = createMarineRouter(snapshot([polygon([rectangle(0, 0, 4, 4), rectangle(1, 1, 3, 3)])]));
    expect(router.route([1.2, 1.2], [2.8, 2.8])).toEqual([
      [1.2, 1.2],
      [2.8, 2.8]
    ]);
    expect(router.resolveEndpoint([2, 2])?.snapped).toBe(false);
    expect(
      router.isWaterPath([
        [2, 2],
        [5, 2]
      ])
    ).toBe(false);
    expect(router.route([2, 2], [5, 2])).toBeNull();
  });

  it('snaps an inland terminal to exterior shore and discloses the displacement without drawing an apron', () => {
    const router = createMarineRouter(snapshot([polygon([rectangle(0, 0, 1, 1)])]));
    const result = router.routeDetailed([0.5, 0.5], [2, 0.5]);
    expect(result).not.toBeNull();
    expect(result!.start.original).toEqual([0.5, 0.5]);
    expect(result!.start.snapped).toBe(true);
    expect(result!.start.distanceKm).toBeGreaterThan(0);
    expect(result!.coordinates[0]).toEqual(result!.start.shoreline);
    expect(result!.coordinates).not.toContainEqual([0.5, 0.5]);
    expect(staysOutsideRectangles(result!.coordinates, [[0, 0, 1, 1]])).toBe(true);
    expect(router.isWaterPath([[0.5, 0.5], result!.start.shoreline])).toBe(false);
  });

  it('keeps a shoreline snap outside the union of overlapping island polygons', () => {
    const router = createMarineRouter(snapshot([polygon([rectangle(0, 0, 2, 2)]), polygon([rectangle(1, 1, 3, 3)])]));
    const endpoint = router.resolveEndpoint([1.8, 1.8]);
    expect(endpoint).not.toBeNull();
    expect(endpoint!.snapped).toBe(true);
    expect(
      staysOutsideRectangles(
        [endpoint!.shoreline, endpoint!.shoreline],
        [
          [0, 0, 2, 2],
          [1, 1, 3, 3]
        ]
      )
    ).toBe(true);
    const result = router.routeDetailed([1.8, 1.8], [4, 4]);
    expect(result).not.toBeNull();
    expect(
      staysOutsideRectangles(result!.coordinates, [
        [0, 0, 2, 2],
        [1, 1, 3, 3]
      ])
    ).toBe(true);
  });

  it('permits tangency and travel along shore but detects land between boundary vertices', () => {
    const router = createMarineRouter(snapshot([polygon([rectangle(0, 0, 1, 1)])]));
    expect(
      router.isWaterPath([
        [-1, -1],
        [0, 0],
        [1, 0],
        [2, -1]
      ])
    ).toBe(true);
    expect(
      router.isWaterPath([
        [0, 0],
        [1, 1]
      ])
    ).toBe(false);
    expect(
      router.isWaterPath([
        [-1, 0.5],
        [0, 0.5],
        [1, 0.5],
        [2, 0.5]
      ])
    ).toBe(false);
  });

  it('splits at boundary intersections instead of relying on midpoint or fixed-step collision sampling', () => {
    const router = createMarineRouter(snapshot([polygon([rectangle(0.1234567, 0, 0.1234577, 1)])]));
    expect(
      router.isWaterPath([
        [-100, 0.5],
        [100, 0.5]
      ])
    ).toBe(false);
    expect(
      router.isWaterPath([
        [-100, 1.1],
        [100, 1.1]
      ])
    ).toBe(true);
  });

  it('preserves precision and protects symmetric route-cache results from caller mutation', () => {
    const router = createMarineRouter(snapshot([polygon([rectangle(0, 0, 1, 1)])]));
    const first = router.routeDetailed([-1.123456789, 0.5], [2, 0.5])!;
    const expected = structuredClone(first);
    first.coordinates[0][0] = 999;
    first.start.original[0] = 999;
    expect(router.routeDetailed([-1.123456789, 0.5], [2, 0.5])).toEqual(expected);
    const reverse = router.routeDetailed([2, 0.5], [-1.123456789, 0.5])!;
    expect(reverse.coordinates).toEqual([...expected.coordinates].reverse());
    expect(reverse.start).toEqual(expected.end);
    expect(reverse.end).toEqual(expected.start);
    const endpoint = router.resolveEndpoint([0.5, 0.5])!;
    const endpointSnapshot = structuredClone(endpoint);
    endpoint.shoreline[0] = 999;
    endpoint.original[0] = 999;
    expect(router.resolveEndpoint([0.5, 0.5])).toEqual(endpointSnapshot);
  });

  it('accepts GeoJSON feature wrappers and ring orientations without changing hole semantics', () => {
    const router = createMarineRouter(
      snapshot([
        {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: polygon([rectangle(0, 0, 4, 4).reverse(), rectangle(1, 1, 3, 3).reverse()])
            }
          ]
        }
      ])
    );
    expect(
      router.isWaterPath([
        [1.5, 1.5],
        [2.5, 2.5]
      ])
    ).toBe(true);
    expect(
      router.isWaterPath([
        [-1, 2],
        [5, 2]
      ])
    ).toBe(false);
  });

  it('fails closed on incomplete coastlines, invalid inputs or unsupported antimeridian shapes', () => {
    for (const data of [
      snapshot([]),
      snapshot([{}]),
      snapshot([{ type: 'Polygon', coordinates: [rectangle(-179, 0, 179, 1)] }])
    ]) {
      const router = createMarineRouter(data);
      expect(router.coastlineComplete).toBe(false);
      expect(router.route([0, 0], [1, 1])).toBeNull();
      expect(
        router.isWaterPath([
          [0, 0],
          [1, 1]
        ])
      ).toBe(false);
    }
    const router = createMarineRouter(snapshot([polygon([rectangle(0, 0, 1, 1)])]));
    expect(router.route([NaN, 2], [2, 2])).toBeNull();
    expect(router.route([181, 2], [2, 2])).toBeNull();
    expect(router.isWaterPath([])).toBe(false);
  });
});
