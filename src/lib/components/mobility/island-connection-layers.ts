import type {
  ConnectionCoordinate,
  IslandConnectionRouteProperties,
  IslandConnectionsResponse,
  IslandInboundFlowProperties
} from '$lib/mobility/island-connections';
import type { GeoJSONSource, MapLayerMouseEvent, Map as MapLibreMap, Popup as MapLibrePopup } from 'maplibre-gl';

import { themeColor } from '$lib/config/theme/theme-tokens';

import { SERVICE_MARKER_ANCHOR_LAYER_ID } from './service-marker-clustering';

export type IslandConnectionLayerOptions = {
  routes: boolean;
  inbound: boolean;
  category: 'all' | 'health' | 'education' | 'transport';
  focusedOriginId?: string | null;
};

export const ISLAND_CONNECTION_HIT_LAYER_IDS = ['island-network-route-hit', 'island-network-inbound-hit'] as const;
export const MAX_VISIBLE_INBOUND_FLOWS = 12;

const ROUTE_SOURCE = 'island-network-routes';
const INBOUND_SOURCE = 'island-network-inbound';
const ENDPOINT_SOURCE = 'island-network-endpoints';
const TERMINAL_SOURCE = 'island-network-terminals';
const LAYER_IDS = [
  'island-network-route-casing',
  'island-network-route-bus',
  'island-network-route-ferry',
  'island-network-route-air',
  'island-network-route-land',
  'island-network-route-bus-schematic',
  'island-network-route-ferry-schematic',
  'island-network-route-air-schematic',
  'island-network-route-land-schematic',
  'island-network-terminals',
  'island-network-inbound-casing',
  'island-network-inbound-line',
  'island-network-endpoints',
  ...ISLAND_CONNECTION_HIT_LAYER_IDS
] as const;
const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] };
const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

type DisplayFlow = {
  type: 'Feature';
  id: string;
  geometry: { type: 'LineString'; coordinates: ConnectionCoordinate[] };
  properties: IslandInboundFlowProperties & { demand: number; intensity: number; focused: boolean; dimmed: boolean };
};

export function islandInboundDemandValue(
  flow: Pick<IslandInboundFlowProperties, 'health' | 'education' | 'total'>,
  category: IslandConnectionLayerOptions['category']
): number {
  const demand = category === 'health' ? flow.health : category === 'education' ? flow.education : flow.total;
  return Number.isFinite(demand) ? Math.max(0, demand) : 0;
}

/** Select the strongest links before making geometry, keeping map work bounded. */
export function visibleIslandInboundFeatures(
  data: IslandConnectionsResponse,
  category: IslandConnectionLayerOptions['category'],
  focusedOriginId: string | null = null
): IslandConnectionsResponse['inbound']['features'] {
  const sorted = data.inbound.features
    .filter((flow) => islandInboundDemandValue(flow.properties, category) > 0)
    .toSorted(
      (left, right) =>
        islandInboundDemandValue(right.properties, category) - islandInboundDemandValue(left.properties, category) ||
        left.properties.originIslandId.localeCompare(right.properties.originIslandId)
    );
  const visible = sorted.slice(0, MAX_VISIBLE_INBOUND_FLOWS);
  if (focusedOriginId && !visible.some((flow) => flow.properties.originIslandId === focusedOriginId)) {
    const focused = sorted.find((flow) => flow.properties.originIslandId === focusedOriginId);
    if (focused) visible.splice(MAX_VISIBLE_INBOUND_FLOWS - 1, 1, focused);
  }
  return visible;
}

function validCoordinate(coordinate: ConnectionCoordinate | null | undefined): coordinate is ConnectionCoordinate {
  return Boolean(
    coordinate && coordinate.every(Number.isFinite) && Math.abs(coordinate[0]) <= 180 && Math.abs(coordinate[1]) <= 90
  );
}

/** A schematic curve separates demand relationships from recorded route geometry. */
export function inboundFlowArc(coordinates: ConnectionCoordinate[]): ConnectionCoordinate[] {
  const start = coordinates[0];
  const end = coordinates.at(-1);
  if (!validCoordinate(start) || !validCoordinate(end)) return [];
  const longitudeScale = Math.max(0.1, Math.cos(((start[1] + end[1]) * Math.PI) / 360));
  const dx = (end[0] - start[0]) * longitudeScale;
  const dy = end[1] - start[1];
  const bend = 0.13;
  const control: ConnectionCoordinate = [
    (start[0] + end[0]) / 2 - (dy * bend) / longitudeScale,
    (start[1] + end[1]) / 2 + dx * bend
  ];
  return Array.from({ length: 25 }, (_, index): ConnectionCoordinate => {
    const fraction = index / 24;
    const remaining = 1 - fraction;
    return [
      remaining ** 2 * start[0] + 2 * remaining * fraction * control[0] + fraction ** 2 * end[0],
      remaining ** 2 * start[1] + 2 * remaining * fraction * control[1] + fraction ** 2 * end[1]
    ];
  });
}

export function createIslandConnectionLayers(map: MapLibreMap, PopupConstructor: typeof MapLibrePopup) {
  let currentData: IslandConnectionsResponse | null = null;
  let currentOptions: IslandConnectionLayerOptions | null = null;
  let displayFlows: DisplayFlow[] = [];
  let routeLookup = new Map<string, IslandConnectionRouteProperties>();
  let flowLookup = new Map<string, IslandInboundFlowProperties>();
  let popup: MapLibrePopup | null = null;
  let popupKey: string | null = null;
  let popupPinned = false;
  let disposed = false;
  let initialized = false;

  function sourceData(id: string, data: Parameters<GeoJSONSource['setData']>[0]): void {
    const source = map.getSource(id) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  function closePopup(): void {
    popup?.remove();
    popup = null;
    popupKey = null;
    popupPinned = false;
  }

  function popupContent(kind: 'route' | 'inbound', id: string): HTMLElement | null {
    const route = kind === 'route' ? routeLookup.get(id) : null;
    const flow = kind === 'inbound' ? flowLookup.get(id) : null;
    if (!route && !flow) return null;
    const content = document.createElement('div');
    content.className = 'island-network-popup';
    const title = document.createElement('strong');
    Object.assign(title.style, {
      display: 'block',
      fontSize: 'var(--mobility-text-base)',
      lineHeight: '1.4',
      marginBottom: '5px'
    });
    title.textContent = route ? route.label : `${flow!.originName} → ${currentData?.islandName ?? 'Selected island'}`;
    content.append(title);
    const detail = document.createElement('p');
    Object.assign(detail.style, { fontSize: 'var(--mobility-text-sm)', lineHeight: '1.5', margin: '0' });
    if (route) {
      const mode =
        route.mode === 'bus' ? 'Bus' : route.mode === 'ferry' ? 'Ferry' : route.mode === 'air' ? 'Air' : 'Land';
      detail.textContent = `${mode}${route.neighborName ? ` · ${route.neighborName}` : ''}`;
    } else {
      detail.textContent = `${numberFormat.format(islandInboundDemandValue(flow!, currentOptions?.category ?? 'all'))} modeled ${currentOptions?.category === 'health' ? 'health' : currentOptions?.category === 'education' ? 'education' : 'health + education'} demand`;
      const breakdown = document.createElement('p');
      Object.assign(breakdown.style, {
        fontSize: 'var(--mobility-text-xs)',
        lineHeight: '1.5',
        margin: '4px 0 0',
        color: 'var(--mobility-muted)'
      });
      breakdown.textContent = `Health ${numberFormat.format(flow!.health)} · Education ${numberFormat.format(flow!.education)}`;
      content.append(detail, breakdown);
    }
    if (route) {
      content.append(detail);
      if (route.departureName && route.arrivalName) {
        const terminals = document.createElement('p');
        Object.assign(terminals.style, {
          fontSize: 'var(--mobility-text-xs)',
          lineHeight: '1.5',
          margin: '4px 0 0',
          color: 'var(--mobility-muted)'
        });
        terminals.textContent = `${route.departureName} → ${route.arrivalName}`;
        content.append(terminals);
      }
    }
    const note = document.createElement('p');
    Object.assign(note.style, {
      fontSize: 'var(--mobility-text-xs)',
      lineHeight: '1.45',
      margin: '7px 0 0',
      color: 'var(--mobility-muted)'
    });
    note.textContent = route
      ? route.geometryBasis === 'coast-aware-water-path'
        ? `Modeled water path around mapped coastlines.${route.shorelineAdjusted ? ' Terminal access is shown at the shoreline.' : ''}`
        : route.geometryBasis === 'recorded-water-path'
          ? 'Recorded sailing geometry, checked against mapped coastlines and connected to its terminals.'
          : route.geometryBasis === 'airport-link'
            ? 'Airport-to-airport connection. The flight track is schematic.'
            : route.schematic
              ? `Schematic connection${route.modeled ? ' · modeled link' : ''}. Exact travel path is unavailable.`
              : `Recorded route geometry${route.modeled ? ' · modeled connection' : ''}.`
      : 'Modeled demand relationship, not a travel route or daily passenger count.';
    content.append(note);
    if (route?.terminalVerified === false) {
      const accessNote = document.createElement('p');
      Object.assign(accessNote.style, {
        fontSize: 'var(--mobility-text-xs)',
        lineHeight: '1.45',
        margin: '4px 0 0',
        color: 'var(--mobility-muted)'
      });
      accessNote.textContent = 'A mapped ferry route endpoint supplies access where a terminal marker is missing.';
      content.append(accessNote);
    }
    return content;
  }

  function showPopup(event: MapLayerMouseEvent, kind: 'route' | 'inbound', pinned: boolean): void {
    if (popupPinned && !pinned) return;
    const id = event.features?.[0]?.properties?.id;
    if (typeof id !== 'string') return;
    const key = `${kind}:${id}`;
    if (popupKey !== key || (pinned && !popupPinned)) {
      const content = popupContent(kind, id);
      if (!content) return;
      closePopup();
      const nextPopup = new PopupConstructor({
        closeButton: pinned,
        closeOnClick: pinned,
        offset: 12,
        maxWidth: '270px'
      })
        .setDOMContent(content)
        .setLngLat(event.lngLat)
        .addTo(map);
      popup = nextPopup;
      nextPopup.on('close', () => {
        if (popup !== nextPopup) return;
        popup = null;
        popupKey = null;
        popupPinned = false;
      });
      popupKey = key;
      popupPinned = pinned;
    } else popup?.setLngLat(event.lngLat);
  }

  const routeMove = (event: MapLayerMouseEvent) => showPopup(event, 'route', false);
  const inboundMove = (event: MapLayerMouseEvent) => showPopup(event, 'inbound', false);
  const enter = () => {
    map.getCanvas().style.cursor = 'pointer';
  };
  const leave = () => {
    map.getCanvas().style.cursor = '';
    if (!popupPinned) closePopup();
  };
  const routeClick = (event: MapLayerMouseEvent) => {
    event.preventDefault();
    event.originalEvent.stopPropagation();
    showPopup(event, 'route', true);
  };
  const inboundClick = (event: MapLayerMouseEvent) => {
    event.preventDefault();
    event.originalEvent.stopPropagation();
    showPopup(event, 'inbound', true);
  };

  function initialize(): void {
    if (initialized || disposed) return;
    initialized = true;
    for (const id of [ROUTE_SOURCE, INBOUND_SOURCE, ENDPOINT_SOURCE, TERMINAL_SOURCE])
      map.addSource(id, { type: 'geojson', data: EMPTY_COLLECTION });
    // Road casings sit above the service anchor; keep transport paths above roads
    // while leaving island labels and mounted service markers in front.
    const before = map.getLayer('island-labels')
      ? 'island-labels'
      : map.getLayer(SERVICE_MARKER_ANCHOR_LAYER_ID)
        ? SERVICE_MARKER_ANCHOR_LAYER_ID
        : undefined;
    map.addLayer(
      {
        id: 'island-network-route-casing',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': themeColor('--mobility-map-halo'), 'line-width': 3.8, 'line-opacity': 0.7 }
      },
      before
    );
    const modes = [
      { mode: 'bus', color: themeColor('--mobility-route-bus') },
      { mode: 'ferry', color: themeColor('--mobility-route-ferry') },
      { mode: 'air', color: themeColor('--mobility-route-air') },
      { mode: 'land', color: themeColor('--mobility-route-bus') }
    ];
    for (const { mode, color } of modes)
      for (const schematic of [false, true])
        map.addLayer(
          {
            id: `island-network-route-${mode}${schematic ? '-schematic' : ''}`,
            type: 'line',
            source: ROUTE_SOURCE,
            filter: ['all', ['==', ['get', 'mode'], mode], ['==', ['get', 'schematic'], schematic]],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': color,
              'line-width': mode === 'bus' ? 1.7 : 1.5,
              'line-opacity': 0.86,
              ...(schematic ? { 'line-dasharray': [3, 2] } : {})
            }
          },
          before
        );
    map.addLayer(
      {
        id: 'island-network-terminals',
        type: 'circle',
        source: TERMINAL_SOURCE,
        paint: {
          'circle-radius': 3,
          'circle-color': [
            'match',
            ['get', 'mode'],
            'ferry',
            themeColor('--mobility-route-ferry'),
            themeColor('--mobility-route-air')
          ],
          'circle-stroke-color': themeColor('--mobility-map-halo'),
          'circle-stroke-width': 1.5
        }
      },
      before
    );
    map.addLayer(
      {
        id: 'island-network-inbound-casing',
        type: 'line',
        source: INBOUND_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': themeColor('--mobility-warning-soft'),
          'line-width': ['+', 3, ['*', 3.5, ['get', 'intensity']], ['case', ['get', 'focused'], 1.3, 0]],
          'line-opacity': ['case', ['get', 'dimmed'], 0.12, 0.65]
        }
      },
      before
    );
    map.addLayer(
      {
        id: 'island-network-inbound-line',
        type: 'line',
        source: INBOUND_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'interpolate',
            ['linear'],
            ['get', 'intensity'],
            0,
            themeColor('--mobility-route-demand-low'),
            0.5,
            themeColor('--mobility-route-demand-mid'),
            1,
            themeColor('--mobility-route-demand')
          ],
          'line-width': ['+', 1.3, ['*', 3.5, ['get', 'intensity']], ['case', ['get', 'focused'], 1.3, 0]],
          'line-opacity': [
            'case',
            ['get', 'focused'],
            0.98,
            ['get', 'dimmed'],
            0.14,
            ['+', 0.4, ['*', 0.45, ['get', 'intensity']]]
          ]
        }
      },
      before
    );
    map.addLayer(
      {
        id: 'island-network-endpoints',
        type: 'circle',
        source: ENDPOINT_SOURCE,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 4.5, ['get', 'focused'], 4, 3],
          'circle-color': [
            'case',
            ['get', 'selected'],
            themeColor('--mobility-ink'),
            themeColor('--mobility-route-demand')
          ],
          'circle-stroke-color': themeColor('--mobility-map-halo'),
          'circle-stroke-width': 1.5,
          'circle-opacity': ['case', ['get', 'dimmed'], 0.18, 0.95],
          'circle-stroke-opacity': ['case', ['get', 'dimmed'], 0.18, 0.95]
        }
      },
      before
    );
    for (const [id, source] of [
      [ISLAND_CONNECTION_HIT_LAYER_IDS[0], ROUTE_SOURCE],
      [ISLAND_CONNECTION_HIT_LAYER_IDS[1], INBOUND_SOURCE]
    ])
      map.addLayer(
        {
          id,
          type: 'line',
          source,
          paint: { 'line-color': themeColor('--mobility-map-halo'), 'line-width': 14, 'line-opacity': 0 }
        },
        before
      );
    for (const id of ISLAND_CONNECTION_HIT_LAYER_IDS) {
      map.on('mouseenter', id, enter);
      map.on('mouseleave', id, leave);
    }
    map.on('mousemove', ISLAND_CONNECTION_HIT_LAYER_IDS[0], routeMove);
    map.on('mousemove', ISLAND_CONNECTION_HIT_LAYER_IDS[1], inboundMove);
    map.on('click', ISLAND_CONNECTION_HIT_LAYER_IDS[0], routeClick);
    map.on('click', ISLAND_CONNECTION_HIT_LAYER_IDS[1], inboundClick);
  }

  function update(data: IslandConnectionsResponse | null, options: IslandConnectionLayerOptions): void {
    if (disposed) return;
    if (
      data === currentData &&
      options.routes === currentOptions?.routes &&
      options.inbound === currentOptions?.inbound &&
      options.category === currentOptions?.category &&
      options.focusedOriginId === currentOptions?.focusedOriginId
    )
      return;
    if (!initialized && !data) return;
    initialize();
    const dataChanged = data !== currentData;
    const flowsChanged =
      dataChanged ||
      options.category !== currentOptions?.category ||
      options.focusedOriginId !== currentOptions?.focusedOriginId;
    closePopup();
    currentData = data;
    currentOptions = { ...options };
    if (dataChanged) {
      routeLookup = new Map(data?.routes.features.map((route) => [route.properties.id, route.properties]) ?? []);
      flowLookup = new Map(data?.inbound.features.map((flow) => [flow.properties.id, flow.properties]) ?? []);
      sourceData(ROUTE_SOURCE, data?.routes ?? EMPTY_COLLECTION);
      const terminals = new Map<
        string,
        {
          type: 'Feature';
          geometry: { type: 'Point'; coordinates: ConnectionCoordinate };
          properties: { mode: string };
        }
      >();
      for (const route of data?.routes.features ?? []) {
        if (route.properties.mode !== 'ferry' && route.properties.mode !== 'air') continue;
        const line = route.geometry.coordinates[0];
        if (!line?.length) continue;
        for (const coordinate of [line[0], line.at(-1)!])
          terminals.set(`${route.properties.mode}:${coordinate.join(',')}`, {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coordinate },
            properties: { mode: route.properties.mode }
          });
      }
      sourceData(TERMINAL_SOURCE, { type: 'FeatureCollection', features: [...terminals.values()] });
    }
    if (flowsChanged) {
      const visible = data ? visibleIslandInboundFeatures(data, options.category, options.focusedOriginId) : [];
      const maximum = Math.max(
        1,
        ...visible.map((flow) => islandInboundDemandValue(flow.properties, options.category))
      );
      displayFlows = visible.flatMap((flow): DisplayFlow[] => {
        const coordinates = inboundFlowArc(flow.geometry.coordinates);
        if (coordinates.length < 2) return [];
        const demand = islandInboundDemandValue(flow.properties, options.category);
        return [
          {
            type: 'Feature',
            id: flow.id,
            geometry: { type: 'LineString', coordinates },
            properties: {
              ...flow.properties,
              demand,
              intensity: Math.sqrt(demand / maximum),
              focused: flow.properties.originIslandId === options.focusedOriginId,
              dimmed: Boolean(options.focusedOriginId) && flow.properties.originIslandId !== options.focusedOriginId
            }
          }
        ];
      });
      sourceData(INBOUND_SOURCE, { type: 'FeatureCollection', features: displayFlows });
      const endpoints = displayFlows.map((flow) => ({
        type: 'Feature' as const,
        id: flow.id,
        geometry: { type: 'Point' as const, coordinates: flow.geometry.coordinates[0] },
        properties: { selected: false, focused: flow.properties.focused, dimmed: flow.properties.dimmed }
      }));
      if (validCoordinate(data?.center ?? undefined))
        endpoints.push({
          type: 'Feature',
          id: 'selected-island',
          geometry: { type: 'Point', coordinates: data!.center! },
          properties: { selected: true, focused: false, dimmed: false }
        });
      sourceData(ENDPOINT_SOURCE, { type: 'FeatureCollection', features: endpoints });
    }
    for (const id of LAYER_IDS) {
      const visible = id.includes('inbound') || id === 'island-network-endpoints' ? options.inbound : options.routes;
      map.setLayoutProperty(id, 'visibility', data && visible ? 'visible' : 'none');
    }
  }

  function bounds(view: 'routes' | 'inbound' | 'all'): [ConnectionCoordinate, ConnectionCoordinate] | null {
    if (!currentData) return null;
    const points: ConnectionCoordinate[] = [];
    if (view !== 'inbound')
      for (const route of currentData.routes.features)
        for (const line of route.geometry.coordinates) points.push(...line);
    if (view !== 'routes') {
      const focused = view === 'inbound' ? displayFlows.filter((flow) => flow.properties.focused) : [];
      for (const flow of focused.length ? focused : displayFlows) points.push(...flow.geometry.coordinates);
    }
    if (validCoordinate(currentData.center)) points.push(currentData.center);
    const valid = points.filter(validCoordinate);
    if (!valid.length) return null;
    let west = valid[0][0];
    let south = valid[0][1];
    let east = west;
    let north = south;
    for (const [longitude, latitude] of valid) {
      west = Math.min(west, longitude);
      south = Math.min(south, latitude);
      east = Math.max(east, longitude);
      north = Math.max(north, latitude);
    }
    return [
      [west, south],
      [east, north]
    ];
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    closePopup();
    if (!initialized) return;
    for (const id of ISLAND_CONNECTION_HIT_LAYER_IDS) {
      map.off('mouseenter', id, enter);
      map.off('mouseleave', id, leave);
    }
    map.off('mousemove', ISLAND_CONNECTION_HIT_LAYER_IDS[0], routeMove);
    map.off('mousemove', ISLAND_CONNECTION_HIT_LAYER_IDS[1], inboundMove);
    map.off('click', ISLAND_CONNECTION_HIT_LAYER_IDS[0], routeClick);
    map.off('click', ISLAND_CONNECTION_HIT_LAYER_IDS[1], inboundClick);
    for (const id of [...LAYER_IDS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of [TERMINAL_SOURCE, ENDPOINT_SOURCE, INBOUND_SOURCE, ROUTE_SOURCE])
      if (map.getSource(id)) map.removeSource(id);
    map.getCanvas().style.cursor = '';
  }

  return { update, bounds, dispose };
}
