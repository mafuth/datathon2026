import { describe, expect, it } from 'vitest';

import { pointWithinGeometryGrace } from '../../src/lib/components/mobility/island-geometry';
import {
  buildZoomInterpolation,
  NATIONAL_ISLAND_FILL_OPACITY_STOPS,
  NATIONAL_ISLAND_FILL_START_ZOOM,
  NATIONAL_SCORE_FIELD_OPACITY_STOPS,
  NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM
} from '../../src/lib/components/mobility/national-accessibility-map-style';
import {
  clusterMarkerLabel,
  serviceClusterBackground,
  serviceMarkerCollection
} from '../../src/lib/components/mobility/service-marker-clustering';
import { themeColor } from '../../src/lib/config/theme/theme-tokens';

describe('national accessibility map zoom handoff', () => {
  it('keeps score fields visible past the old cutoff and crossfades island fill', () => {
    expect(NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM).toBe(7.4);
    expect(NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM).toBeGreaterThan(6.8);
    expect(NATIONAL_ISLAND_FILL_START_ZOOM).toBe(5.8);
    expect(NATIONAL_SCORE_FIELD_OPACITY_STOPS).toEqual([
      [4.4, 0.58],
      [5.8, 0.46],
      [7.4, 0]
    ]);
    expect(NATIONAL_ISLAND_FILL_OPACITY_STOPS).toEqual([
      [5.8, 0.18],
      [7.4, 0.92]
    ]);
    expect(buildZoomInterpolation(NATIONAL_SCORE_FIELD_OPACITY_STOPS)).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      4.4,
      0.58,
      5.8,
      0.46,
      7.4,
      0
    ]);
  });
});

describe('selected-island service marker clustering', () => {
  it('keeps only mapped services in the clustered source', () => {
    const collection = serviceMarkerCollection([
      { id: 'health-1', serviceType: 'health', coordinates: [73, 3] },
      { id: 'school-1', serviceType: 'education', coordinates: null },
      { id: 'transport-1', serviceType: 'transport', coordinates: [73.001, 3.001] }
    ]);

    expect(collection.features).toHaveLength(2);
    expect(collection.features.map((feature) => feature.properties.serviceId)).toEqual(['health-1', 'transport-1']);
  });

  it('describes mixed clusters and preserves proportional category colors', () => {
    const cluster = {
      clusterId: 4,
      coordinates: [73, 3] as [number, number],
      total: 4,
      healthCount: 2,
      educationCount: 1,
      transportCount: 1
    };

    expect(clusterMarkerLabel(cluster)).toBe('4 services: 2 health, 1 education, 1 transport');
    expect(serviceClusterBackground(cluster)).toBe(
      `conic-gradient(${themeColor('--mobility-chart-health')} 0% 50%, ${themeColor('--mobility-chart-education')} 50% 75%, ${themeColor('--mobility-chart-transport')} 75% 100%)`
    );
  });
});

describe('selected-island marker geometry grace', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [73, 3],
        [73.001, 3],
        [73.001, 3.001],
        [73, 3.001],
        [73, 3]
      ]
    ]
  };

  it('accepts points inside the island and slightly beyond its boundary', () => {
    expect(pointWithinGeometryGrace([73.0005, 3.0005], polygon, 0)).toBe(true);
    expect(pointWithinGeometryGrace([73.0018, 3.0005], polygon, 100)).toBe(true);
  });

  it('rejects points beyond the marker grace distance', () => {
    expect(pointWithinGeometryGrace([73.003, 3.0005], polygon, 100)).toBe(false);
  });
});
