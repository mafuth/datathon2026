import type { IslandConnectionsResponse } from '../../src/lib/mobility/island-connections';
import type { Map as MapLibreMap, Popup as MapLibrePopup } from 'maplibre-gl';

import { describe, expect, it } from 'vitest';

import {
  createIslandConnectionLayers,
  inboundFlowArc,
  islandInboundDemandValue,
  MAX_VISIBLE_INBOUND_FLOWS,
  visibleIslandInboundFeatures
} from '../../src/lib/components/mobility/island-connection-layers';

type Flow = IslandConnectionsResponse['inbound']['features'][number];

function flow(id: string, health: number, education: number): Flow {
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'LineString',
      coordinates: [
        [73.3, 4.3],
        [73.5, 4.2]
      ]
    },
    properties: {
      id,
      originIslandId: id,
      originName: id,
      destinationIslandId: 'destination',
      health,
      education,
      total: health + education,
      schematic: true
    }
  };
}

function data(features: Flow[]): IslandConnectionsResponse {
  return {
    islandId: 'destination',
    islandName: 'Destination',
    center: [73.5, 4.2],
    routes: { type: 'FeatureCollection', features: [] },
    inbound: { type: 'FeatureCollection', features },
    summary: {
      routeCount: 0,
      inboundSourceCount: features.length,
      mappedInboundSourceCount: features.length,
      maxInboundDemand: Math.max(0, ...features.map((feature) => feature.properties.total))
    },
    limitations: []
  };
}

describe('island inbound map links', () => {
  it('ranks by the chosen demand category, omits zero demand and preserves the source order', () => {
    const source = data([flow('education', 0, 500), flow('health', 100, 0), flow('neither', 0, 0)]);
    expect(visibleIslandInboundFeatures(source, 'all').map((feature) => feature.id)).toEqual(['education', 'health']);
    expect(visibleIslandInboundFeatures(source, 'health').map((feature) => feature.id)).toEqual(['health']);
    expect(visibleIslandInboundFeatures(source, 'education').map((feature) => feature.id)).toEqual(['education']);
    expect(source.inbound.features.map((feature) => feature.id)).toEqual(['education', 'health', 'neither']);
  });

  it('bounds rendered arcs and includes a focused origin even when it is outside the strongest links', () => {
    const source = data(Array.from({ length: 20 }, (_, index) => flow(`origin-${index}`, 100 - index, 0)));
    const ordinary = visibleIslandInboundFeatures(source, 'all');
    expect(ordinary).toHaveLength(MAX_VISIBLE_INBOUND_FLOWS);
    expect(ordinary.at(-1)?.id).toBe('origin-11');
    const focused = visibleIslandInboundFeatures(source, 'all', 'origin-19');
    expect(focused).toHaveLength(MAX_VISIBLE_INBOUND_FLOWS);
    expect(focused.at(-1)?.id).toBe('origin-19');
    expect(focused[0].id).toBe('origin-0');
  });

  it('does not propagate negative or non-finite demand into map style values', () => {
    expect(islandInboundDemandValue({ health: -5, education: 4, total: Number.NaN }, 'health')).toBe(0);
    expect(islandInboundDemandValue({ health: -5, education: 4, total: Number.NaN }, 'all')).toBe(0);
    expect(islandInboundDemandValue({ health: 2, education: Number.POSITIVE_INFINITY, total: 2 }, 'education')).toBe(0);
    expect(islandInboundDemandValue({ health: 2, education: 4, total: 6 }, 'transport')).toBe(6);
  });

  it('draws a finite schematic arc while retaining the exact origin and destination coordinates', () => {
    const coordinates: [number, number][] = [
      [73.2, 6.7],
      [73.5, 4.2]
    ];
    const arc = inboundFlowArc(coordinates);
    expect(arc).toHaveLength(25);
    expect(arc[0]).toEqual(coordinates[0]);
    expect(arc.at(-1)).toEqual(coordinates[1]);
    expect(arc[12]).not.toEqual([73.35, 5.45]);
    expect(arc.flat().every(Number.isFinite)).toBe(true);
    expect(coordinates).toHaveLength(2);
  });

  it('omits invalid geographic endpoints instead of sending invalid geometry to MapLibre', () => {
    expect(inboundFlowArc([])).toEqual([]);
    expect(
      inboundFlowArc([
        [Number.NaN, 4],
        [73, 4]
      ])
    ).toEqual([]);
    expect(
      inboundFlowArc([
        [73, 91],
        [73, 4]
      ])
    ).toEqual([]);
  });
});

describe('island connection map rendering', () => {
  function renderer() {
    const layers = new Map<string, Parameters<MapLibreMap['addLayer']>[0]>();
    const collections = new Map<string, unknown>();
    const sources = new Map<string, { setData: (data: unknown) => void }>();
    const map = {
      addSource(id: string) {
        sources.set(id, { setData: (value: unknown) => collections.set(id, value) });
      },
      getSource: (id: string) => sources.get(id),
      addLayer(layer: Parameters<MapLibreMap['addLayer']>[0]) {
        layers.set(layer.id, layer);
      },
      getLayer: (id: string) => layers.get(id),
      setLayoutProperty() {},
      on() {},
      off() {},
      getCanvas: () => ({ style: { cursor: '' } })
    } as unknown as MapLibreMap;
    class UnusedPopup {}
    const controller = createIslandConnectionLayers(map, UnusedPopup as unknown as typeof MapLibrePopup);
    return { controller, layers, collections };
  }

  it('uses dashed transport strokes only for schematic geometry in every travel mode', () => {
    const { controller, layers } = renderer();
    controller.update(data([]), { routes: true, inbound: false, category: 'all' });
    for (const mode of ['bus', 'ferry', 'air', 'land']) {
      expect(layers.get(`island-network-route-${mode}`)).toMatchObject({
        filter: ['all', ['==', ['get', 'mode'], mode], ['==', ['get', 'schematic'], false]]
      });
      expect(layers.get(`island-network-route-${mode}`)).not.toMatchObject({
        paint: { 'line-dasharray': [3, 2] }
      });
      expect(layers.get(`island-network-route-${mode}-schematic`)).toMatchObject({
        filter: ['all', ['==', ['get', 'mode'], mode], ['==', ['get', 'schematic'], true]],
        paint: { 'line-dasharray': [3, 2] }
      });
    }
  });

  it('dims other demand links and fits only the focused origin while retaining context geometry', () => {
    const { controller, collections } = renderer();
    const distant = flow('distant', 500, 0);
    distant.geometry.coordinates[0] = [73, 7];
    const nearby = flow('nearby', 50, 0);
    nearby.geometry.coordinates[0] = [73.4, 4.25];
    controller.update(data([distant, nearby]), {
      routes: true,
      inbound: true,
      category: 'all',
      focusedOriginId: 'nearby'
    });
    expect(collections.get('island-network-inbound')).toMatchObject({
      features: [
        { properties: { originIslandId: 'distant', focused: false, dimmed: true } },
        { properties: { originIslandId: 'nearby', focused: true, dimmed: false } }
      ]
    });
    expect(collections.get('island-network-endpoints')).toMatchObject({
      features: [
        { properties: { focused: false, dimmed: true } },
        { properties: { focused: true, dimmed: false } },
        { properties: { selected: true, dimmed: false } }
      ]
    });
    expect(controller.bounds('inbound')?.[1][1]).toBeLessThan(4.3);
    expect(controller.bounds('all')?.[1][1]).toBeGreaterThanOrEqual(7);
  });
});
