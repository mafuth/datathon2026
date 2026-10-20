<script lang="ts">
  import type { Map as MapLibreMap, Marker as MapLibreMarker, Popup as MapLibrePopup, MapOptions } from 'maplibre-gl';

  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import { mount, onMount, unmount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';

  import 'maplibre-gl/dist/maplibre-gl.css';

  import type { IslandProfile } from './island-profile';
  import type { IslandDemandCategory, IslandServiceHexes, IslandServicesResponse } from './island-services';
  import type { AnalyticsData, AnalyticsIsland } from './national-analytics-card.svelte';
  import type { IslandSearchOption } from './national-score-card.svelte';

  import * as Tabs from '$components/ui/tabs';

  import IslandAnalyticsCard from './island-analytics-card.svelte';
  import IslandScoreCard from './island-score-card.svelte';
  import { ISLAND_DEMAND_CATEGORIES } from './island-services';
  import {
    buildZoomInterpolation,
    NATIONAL_ISLAND_FILL_OPACITY_STOPS,
    NATIONAL_ISLAND_FILL_START_ZOOM,
    NATIONAL_SCORE_FIELD_OPACITY_STOPS,
    NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM
  } from './national-accessibility-map-style';
  import NationalAnalyticsCard from './national-analytics-card.svelte';
  import NationalScoreCard from './national-score-card.svelte';
  import ServiceDetailsPopup from './service-details-popup.svelte';
  import ServiceMapMarker from './service-map-marker.svelte';

  type Coordinate = [number, number];

  type MapStyleDocument = {
    [key: string]: unknown;
    sources?: Record<string, unknown>;
    layers?: Array<Record<string, unknown>>;
  };

  type IslandFeature = {
    type: 'Feature';
    id: string;
    geometry: { type: string; coordinates: unknown };
    properties: {
      id: string;
      name: string;
      atollName: string;
      centroid?: Coordinate;
      score: number | null;
      scoreStatus: 'numeric' | 'unavailable';
    };
  };

  type IslandCollection = {
    type: 'FeatureCollection';
    features: IslandFeature[];
  };

  type ScoreFieldCollection = {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: string;
      geometry: { type: 'Point'; coordinates: Coordinate };
      properties: { islandId: string; score: number };
    }>;
  };

  type MountedServiceMarker = {
    marker: MapLibreMarker;
    component: ReturnType<typeof mount>;
  };

  type MountedServicePopup = {
    popup: MapLibrePopup;
    component: ReturnType<typeof mount>;
  };

  const EMPTY_ISLAND_COLLECTION: IslandCollection = { type: 'FeatureCollection', features: [] };
  const EMPTY_SCORE_FIELD_COLLECTION: ScoreFieldCollection = { type: 'FeatureCollection', features: [] };
  const EMPTY_SERVICE_HEXES: IslandServiceHexes = { type: 'FeatureCollection', features: [] };
  const SELECTED_DEMAND_HEX_OPACITY = 0.42;
  const OSM_ROAD_CLASSES = [
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'minor',
    'service',
    'track',
    'path',
    'cycleway',
    'footway',
    'pedestrian',
    'steps'
  ] as const;
  const MALDIVES_CENTER: Coordinate = [73.2, 3.4];
  const SERVICE_MARKER_LEGEND = [
    { label: 'Health services', color: '#bf4f55', icon: Hospital },
    { label: 'Education services', color: '#4b6fa8', icon: School },
    { label: 'Transport services', color: '#b47a3c', icon: Route }
  ] as const;
  const ANIMATED_EMOJI_BASE_URL =
    'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/';
  const LOADING_MESSAGES = [
    {
      title: 'The islands are arguing over who gets rendered first.',
      emoji: 'People%20with%20activities/Man%20Gesturing%20No%20Light%20Skin%20Tone.png',
      alt: 'Man Gesturing No Light Skin Tone'
    },
    {
      title: 'Counting islands without losing the plot.',
      emoji: 'People%20with%20professions/Man%20Technologist%20Light%20Skin%20Tone.png',
      alt: 'Man Technologist Light Skin Tone'
    },
    {
      title: 'The data is swimming over.',
      emoji: 'People%20with%20activities/Man%20Swimming%20Light%20Skin%20Tone.png',
      alt: 'Man Swimming Light Skin Tone'
    },
    {
      title: 'Asking the map to stop pretending it is still asleep.',
      emoji: 'People%20with%20activities/Person%20in%20Bed%20Light%20Skin%20Tone.png',
      alt: 'Person in Bed Light Skin Tone'
    },
    {
      title: 'Untangling a few suspiciously complicated spreadsheets.',
      emoji: 'People%20with%20professions/Man%20Office%20Worker%20Light%20Skin%20Tone.png',
      alt: 'Man Office Worker Light Skin Tone'
    },
    {
      title: 'Polishing the pixels until they behave.',
      emoji: 'People%20with%20professions/Man%20Artist%20Light%20Skin%20Tone.png',
      alt: 'Man Artist Light Skin Tone'
    },
    {
      title: 'Convincing the score to reveal its secrets.',
      emoji: 'People%20with%20professions/Man%20Detective%20Light%20Skin%20Tone.png',
      alt: 'Man Detective Light Skin Tone'
    },
    {
      title: 'The map is finding its balance before the big entrance.',
      emoji: 'People%20with%20activities/Man%20in%20Lotus%20Position%20Light%20Skin%20Tone.png',
      alt: 'Man in Lotus Position Light Skin Tone'
    }
  ] as const;

  let mapElement: HTMLDivElement;
  let mapInstance: MapLibreMap | null = null;
  let maplibreMarkerConstructor: typeof import('maplibre-gl').Marker | null = null;
  let maplibrePopupConstructor: typeof import('maplibre-gl').Popup | null = null;
  let mapReady = $state(false);
  let heatmapLoading = $state(true);
  let heatmapError = $state(false);
  let loadingMessage = $state<(typeof LOADING_MESSAGES)[number]>(LOADING_MESSAGES[0]);
  let islandCollection = $state<IslandCollection>(EMPTY_ISLAND_COLLECTION);
  let islandDetailLoaded = false;
  let islandDetailLoading = false;
  let analyticsOpen = $state(false);
  let islandAnalyticsOpen = $state(false);
  let selectedIslandId = $state<string | null>(null);
  let analyticsLoading = $state(false);
  let analyticsError = $state<string | null>(null);
  let analyticsData = $state<AnalyticsData | null>(null);
  let islandProfile = $state<IslandProfile | null>(null);
  let islandProfileLoading = $state(false);
  let islandProfileError = $state<string | null>(null);
  let islandProfileRequest = 0;
  let islandServices = $state<IslandServicesResponse | null>(null);
  let islandServicesLoading = $state(false);
  let islandServicesError = $state<string | null>(null);
  let islandServicesRequest = 0;
  let selectedDemandCategory = $state<IslandDemandCategory>('all');
  let mountedServiceMarkers: MountedServiceMarker[] = [];
  let activeServicePopup: MountedServicePopup | null = null;
  let nationalMetrics = $derived([
    { key: 'health', label: 'Health', value: analyticsData?.national.categories.health?.score },
    { key: 'education', label: 'Schools', value: analyticsData?.national.categories.education?.score },
    { key: 'transport', label: 'Getting around', value: analyticsData?.national.categories.transport?.score }
  ]);
  let selectedIsland = $derived(analyticsData?.islands.find((island) => island.id === selectedIslandId) ?? null);

  function selectIslandById(id: string, centroid?: Coordinate): void {
    selectedIslandId = id;
    selectedDemandCategory = 'all';
    analyticsOpen = false;
    islandAnalyticsOpen = true;
    prepareSelectedIslandOverlay(id);
    void loadIslandProfile(id);
    void loadIslandServices(id);

    const island = islandCollection.features.find((feature) => feature.properties.id === id);
    focusIsland({
      id,
      name: island?.properties.name ?? selectedIsland?.name ?? 'Island',
      atollName: island?.properties.atollName ?? selectedIsland?.atollName ?? '',
      centroid: island?.properties.centroid ?? centroid,
      score: island?.properties.score ?? selectedIsland?.overall.score ?? null
    });

    if (!analyticsData) void loadAnalytics();
  }

  function collectCoordinates(value: unknown, points: Coordinate[]): void {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      points.push([value[0], value[1]]);
      return;
    }
    for (const child of value) collectCoordinates(child, points);
  }

  function islandBounds(feature: IslandFeature): [Coordinate, Coordinate] | null {
    const points: Coordinate[] = [];
    collectCoordinates(feature.geometry.coordinates, points);
    if (points.length === 0) return null;

    let west = points[0][0];
    let south = points[0][1];
    let east = points[0][0];
    let north = points[0][1];

    for (const [longitude, latitude] of points.slice(1)) {
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

  function islandCameraPadding(): { top: number; right: number; bottom: number; left: number } {
    const isMobile = (mapElement?.clientWidth ?? 0) <= 640;
    if (isMobile) return { top: 210, right: 24, bottom: 190, left: 24 };
    return { top: 155, right: 370, bottom: 135, left: 350 };
  }

  function boundsFitAtCurrentZoom(
    bounds: [Coordinate, Coordinate],
    padding: { top: number; right: number; bottom: number; left: number }
  ): boolean {
    if (!mapInstance || !mapElement.clientWidth || !mapElement.clientHeight) return false;

    const [[west, south], [east, north]] = bounds;
    const projectedCorners = [
      mapInstance.project([west, south]),
      mapInstance.project([west, north]),
      mapInstance.project([east, south]),
      mapInstance.project([east, north])
    ];
    const left = padding.left;
    const right = mapElement.clientWidth - padding.right;
    const top = padding.top;
    const bottom = mapElement.clientHeight - padding.bottom;

    return projectedCorners.every(
      (point) => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
    );
  }

  function returnToNational(): void {
    selectedIslandId = null;
    islandAnalyticsOpen = false;
    islandProfile = null;
    islandProfileError = null;
    islandProfileRequest += 1;
    islandServices = null;
    islandServicesError = null;
    islandServicesLoading = false;
    islandServicesRequest += 1;
    resetSelectedIslandOverlay();
  }

  function focusIsland(island: IslandSearchOption): void {
    if (!mapInstance || !island.centroid) return;
    const reducedMotion = prefersReducedMotion.current;
    const feature = islandCollection.features.find((candidate) => candidate.properties.id === island.id);
    const bounds = feature ? islandBounds(feature) : null;

    if (bounds) {
      const padding = islandCameraPadding();
      const camera = mapInstance.cameraForBounds(bounds, {
        padding,
        maxZoom: 14
      });
      const currentZoom = mapInstance.getZoom();

      if (camera?.center) {
        const fittedZoom = camera.zoom ?? currentZoom;
        const keepCurrentZoom = fittedZoom < currentZoom && boundsFitAtCurrentZoom(bounds, padding);
        mapInstance.easeTo({
          center: camera.center,
          zoom: keepCurrentZoom ? currentZoom : fittedZoom,
          duration: reducedMotion ? 0 : 850,
          essential: !reducedMotion
        });
        return;
      }
    }

    mapInstance.flyTo({
      center: island.centroid,
      zoom: Math.max(mapInstance.getZoom(), 10),
      duration: reducedMotion ? 0 : 850,
      essential: !reducedMotion
    });
  }

  function selectSearchIsland(island: IslandSearchOption): void {
    selectIslandById(island.id, island.centroid);
  }

  function focusAnalyticsIsland(island: AnalyticsIsland): void {
    selectIslandById(island.id, island.centroid);
  }

  async function loadAnalytics(): Promise<void> {
    if (analyticsData || analyticsLoading) return;
    analyticsLoading = true;
    analyticsError = null;
    try {
      const response = await fetch('/api/map/analytics', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Analytics request failed with status ${response.status}`);
      analyticsData = (await response.json()) as AnalyticsData;
    } catch (error) {
      analyticsError = error instanceof Error ? error.message : 'Analytics could not be loaded.';
    } finally {
      analyticsLoading = false;
    }
  }

  async function loadIslandProfile(id: string): Promise<void> {
    const requestId = ++islandProfileRequest;
    islandProfile = null;
    islandProfileLoading = true;
    islandProfileError = null;
    try {
      const response = await fetch(`/api/map/islands/${encodeURIComponent(id)}/profile`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Island profile request failed with status ${response.status}`);
      const profile = (await response.json()) as IslandProfile;
      if (requestId === islandProfileRequest) islandProfile = profile;
    } catch (error) {
      if (requestId === islandProfileRequest) {
        islandProfileError = error instanceof Error ? error.message : 'Island profile could not be loaded.';
      }
    } finally {
      if (requestId === islandProfileRequest) islandProfileLoading = false;
    }
  }

  function serviceMarkerLabel(service: IslandServicesResponse['services'][number]): string {
    return service.name ?? `${service.subtype.replaceAll('_', ' ')} ${service.serviceType}`;
  }

  function closeServicePopup(): void {
    const mountedPopup = activeServicePopup;
    if (!mountedPopup) return;
    activeServicePopup = null;
    mountedPopup.popup.remove();
    void unmount(mountedPopup.component);
  }

  function openServicePopup(service: IslandServicesResponse['services'][number]): void {
    if (!mapInstance || !maplibrePopupConstructor || !service.coordinates) return;
    closeServicePopup();

    const popupElement = document.createElement('div');
    const popup = new maplibrePopupConstructor({
      closeButton: false,
      closeOnClick: true,
      maxWidth: 'min(20rem, calc(100vw - 1rem))',
      offset: 20
    });
    const component = mount(ServiceDetailsPopup, {
      target: popupElement,
      props: {
        service,
        onClose: () => popup.remove()
      }
    });
    popup.on('close', () => {
      if (activeServicePopup?.popup !== popup) return;
      activeServicePopup = null;
      void unmount(component);
    });
    activeServicePopup = { popup, component };
    popup.setLngLat(service.coordinates).setDOMContent(popupElement).addTo(mapInstance);
  }

  function removeServiceMarkers(animate = false): void {
    closeServicePopup();
    const markers = mountedServiceMarkers;
    mountedServiceMarkers = [];
    const reducedMotion = prefersReducedMotion.current;

    for (const { marker, component } of markers) {
      const element = marker.getElement().querySelector<HTMLElement>('[data-service-marker]');
      if (animate && element && !reducedMotion) {
        element.classList.add('service-marker-exiting');
        window.setTimeout(() => {
          marker.remove();
          void unmount(component);
        }, 240);
      } else {
        marker.remove();
        void unmount(component);
      }
    }
  }

  function renderServiceMarkers(data: IslandServicesResponse): void {
    if (!mapInstance || !maplibreMarkerConstructor) return;
    removeServiceMarkers();

    for (const service of data.services) {
      if (!service.coordinates) continue;
      const host = document.createElement('div');
      const component = mount(ServiceMapMarker, {
        target: host,
        props: {
          serviceType: service.serviceType,
          label: serviceMarkerLabel(service),
          onSelect: () => openServicePopup(service)
        }
      });
      const marker = new maplibreMarkerConstructor({ element: host, anchor: 'center' });
      marker.setLngLat(service.coordinates).addTo(mapInstance);
      mountedServiceMarkers.push({ marker, component });
    }
  }

  function setSourceData(sourceId: string, data: unknown): void {
    (mapInstance?.getSource(sourceId) as { setData: (value: unknown) => void } | undefined)?.setData(data);
  }

  function setLayerOpacity(layerId: string, property: 'fill-opacity' | 'line-opacity', value: number): void {
    if (mapInstance?.getLayer(layerId)) mapInstance.setPaintProperty(layerId, property, value as never);
  }

  function setLayerVisibility(layerId: string, visibility: 'visible' | 'none'): void {
    if (mapInstance?.getLayer(layerId)) mapInstance.setLayoutProperty(layerId, 'visibility', visibility);
  }

  function setLayerFilter(layerId: string, filter: unknown): void {
    if (mapInstance?.getLayer(layerId)) mapInstance.setFilter(layerId, filter as never);
  }

  function osmRoadFilter(): unknown[] {
    return [
      'all',
      ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
      ['match', ['get', 'class'], OSM_ROAD_CLASSES, true, false],
      ['!=', ['get', 'brunnel'], 'tunnel']
    ];
  }

  function selectedIslandRoadFilter(id: string): unknown[] {
    const feature = islandCollection.features.find((candidate) => candidate.properties.id === id);
    const baseFilter = osmRoadFilter();

    if (feature && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      return [...baseFilter.slice(0, 1), ...baseFilter.slice(1), ['within', feature.geometry]];
    }

    return baseFilter;
  }

  function demandStatusProperty(category: IslandDemandCategory): string {
    if (category === 'health') return 'healthStatus';
    if (category === 'education') return 'educationStatus';
    if (category === 'transport') return 'transportStatus';
    return 'allStatus';
  }

  function demandColorExpression(category: IslandDemandCategory): unknown[] {
    const weightProperty = demandWeightProperty(category);
    const statusProperty = demandStatusProperty(category);
    return [
      'case',
      ['==', ['get', statusProperty], 'unavailable'],
      '#aeb7b3',
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', weightProperty], 0],
        0,
        '#edf8e9',
        0.25,
        '#c7e9c0',
        0.5,
        '#fee08b',
        0.75,
        '#fdae61',
        1,
        '#d73027'
      ]
    ];
  }

  function demandFillOpacityExpression(category: IslandDemandCategory, multiplier = 1): unknown[] {
    const weightProperty = demandWeightProperty(category);
    const statusProperty = demandStatusProperty(category);
    const opacity = [
      'case',
      ['==', ['get', statusProperty], 'unavailable'],
      0,
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', weightProperty], 0],
        0,
        0.02,
        0.08,
        0.08,
        0.25,
        0.2,
        0.5,
        0.38,
        0.75,
        0.58,
        1,
        0.82
      ]
    ];
    return multiplier === 1 ? opacity : ['*', opacity, multiplier];
  }

  function demandAvailabilityFilter(category: IslandDemandCategory): unknown[] {
    if (category === 'all') {
      return [
        'any',
        ['!=', ['get', 'healthStatus'], 'unavailable'],
        ['!=', ['get', 'educationStatus'], 'unavailable'],
        ['!=', ['get', 'transportStatus'], 'unavailable']
      ];
    }
    return ['!=', ['get', demandStatusProperty(category)], 'unavailable'];
  }

  function fadeLayerTo(
    layerId: string,
    property: 'fill-opacity' | 'line-opacity',
    target: number,
    islandId?: string
  ): void {
    setLayerOpacity(layerId, property, 0);
    if (prefersReducedMotion.current) {
      setLayerOpacity(layerId, property, target);
      return;
    }
    window.requestAnimationFrame(() => {
      if (islandId && selectedIslandId !== islandId) return;
      setLayerOpacity(layerId, property, target);
    });
  }

  function setDemandHexOpacity(multiplier: number): void {
    if (!mapInstance?.getLayer('selected-service-demand-hexes')) return;
    mapInstance.setPaintProperty(
      'selected-service-demand-hexes',
      'fill-opacity',
      demandFillOpacityExpression(selectedDemandCategory, multiplier) as never
    );
  }

  function fadeDemandHexesTo(target: number, islandId?: string): void {
    setDemandHexOpacity(0);
    if (prefersReducedMotion.current) {
      setDemandHexOpacity(target);
      return;
    }
    window.requestAnimationFrame(() => {
      if (islandId && selectedIslandId !== islandId) return;
      setDemandHexOpacity(target);
    });
  }

  function applySelectedIslandMask(id: string): void {
    if (!mapInstance) return;
    mapInstance.setFilter('island-fill', ['!=', ['get', 'id'], id]);
    mapInstance.setFilter('national-score-fields', ['!=', ['get', 'islandId'], id]);
    mapInstance.setFilter('island-outline', ['!=', ['get', 'id'], id]);
    mapInstance.setFilter('island-labels', ['!=', ['get', 'id'], id]);
    mapInstance.setFilter('selected-island-fill', ['==', ['get', 'id'], id]);
    mapInstance.setFilter('selected-island-outline', ['==', ['get', 'id'], id]);
    mapInstance.setFilter('selected-service-demand-hexes', demandAvailabilityFilter(selectedDemandCategory));
    setLayerFilter('selected-island-road-casing', selectedIslandRoadFilter(id));
    setLayerFilter('selected-island-road-inner', selectedIslandRoadFilter(id));
    setLayerVisibility('selected-island-road-casing', 'visible');
    setLayerVisibility('selected-island-road-inner', 'visible');
  }

  function prepareSelectedIslandOverlay(id: string): void {
    setSourceData('selected-service-hexes', EMPTY_SERVICE_HEXES);
    removeServiceMarkers(true);
    applySelectedIslandMask(id);
    fadeLayerTo('selected-island-fill', 'fill-opacity', 0.45, id);
    fadeLayerTo('selected-island-outline', 'line-opacity', 1, id);
    setDemandHexOpacity(0);
  }

  function resetSelectedIslandOverlay(): void {
    removeServiceMarkers(true);
    if (!mapInstance) return;
    mapInstance.setFilter('island-fill', null);
    mapInstance.setFilter('national-score-fields', null);
    mapInstance.setFilter('island-outline', null);
    mapInstance.setFilter('island-labels', null);
    mapInstance.setFilter('selected-island-fill', ['==', ['get', 'id'], '']);
    mapInstance.setFilter('selected-island-outline', ['==', ['get', 'id'], '']);
    mapInstance.setFilter('selected-service-demand-hexes', ['==', ['get', 'allStatus'], '']);
    setLayerFilter('selected-island-road-casing', ['==', ['get', 'class'], '']);
    setLayerFilter('selected-island-road-inner', ['==', ['get', 'class'], '']);
    setLayerVisibility('selected-island-road-casing', 'none');
    setLayerVisibility('selected-island-road-inner', 'none');
    setSourceData('selected-service-hexes', EMPTY_SERVICE_HEXES);
    setLayerOpacity('selected-island-fill', 'fill-opacity', 0);
    setLayerOpacity('selected-island-outline', 'line-opacity', 0);
    setDemandHexOpacity(0);
  }

  async function loadIslandServices(id: string): Promise<void> {
    const requestId = ++islandServicesRequest;
    islandServices = null;
    islandServicesLoading = true;
    islandServicesError = null;
    try {
      const response = await fetch(`/api/map/islands/${encodeURIComponent(id)}/services`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Island services request failed with status ${response.status}`);
      const data = (await response.json()) as IslandServicesResponse;
      if (requestId !== islandServicesRequest) return;
      islandServices = data;
      setSourceData('selected-service-hexes', data.hexes);
      applySelectedIslandMask(id);
      renderServiceMarkers(data);
      fadeDemandHexesTo(SELECTED_DEMAND_HEX_OPACITY, id);
    } catch (error) {
      if (requestId === islandServicesRequest) {
        islandServicesError = error instanceof Error ? error.message : 'Island services could not be loaded.';
      }
    } finally {
      if (requestId === islandServicesRequest) islandServicesLoading = false;
    }
  }

  function demandWeightProperty(category: IslandDemandCategory): string {
    if (category === 'health') return 'healthWeight';
    if (category === 'education') return 'educationWeight';
    if (category === 'transport') return 'transportWeight';
    return 'allWeight';
  }

  function demandCategoryLabel(category: IslandDemandCategory): string {
    if (category === 'health') return 'Health';
    if (category === 'education') return 'Education';
    if (category === 'transport') return 'Transport';
    return 'All demand';
  }

  $effect(() => {
    if (!mapInstance?.getLayer('selected-service-demand-hexes')) return;
    mapInstance.setPaintProperty(
      'selected-service-demand-hexes',
      'fill-color',
      demandColorExpression(selectedDemandCategory) as never
    );
    mapInstance.setPaintProperty(
      'selected-service-demand-hexes',
      'fill-opacity',
      demandFillOpacityExpression(selectedDemandCategory, SELECTED_DEMAND_HEX_OPACITY) as never
    );
    mapInstance.setFilter('selected-service-demand-hexes', demandAvailabilityFilter(selectedDemandCategory) as never);
  });

  async function openAnalytics(): Promise<void> {
    analyticsOpen = true;
    await loadAnalytics();
  }

  async function buildMapStyle(): Promise<NonNullable<MapOptions['style']>> {
    let baseStyle: MapStyleDocument;

    try {
      const response = await fetch('https://tiles.openfreemap.org/styles/positron');
      if (!response.ok) throw new Error(`Base map request failed with status ${response.status}`);
      baseStyle = (await response.json()) as MapStyleDocument;
    } catch {
      baseStyle = {
        version: 8,
        sources: {},
        layers: [{ id: 'fallback-background', type: 'background', paint: { 'background-color': '#f1f5f3' } }]
      };
    }

    const baseLayers = Array.isArray(baseStyle.layers)
      ? baseStyle.layers.filter((layer) => layer.type !== 'symbol')
      : [];
    const selectedRoadLayers = baseStyle.sources?.openmaptiles
      ? [
          {
            id: 'selected-island-road-casing',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            minzoom: 8,
            layout: {
              visibility: 'none',
              'line-cap': 'round',
              'line-join': 'round'
            },
            filter: osmRoadFilter(),
            paint: {
              'line-color': '#38574f',
              'line-opacity': 0.88,
              'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 8, 1.4, 11, 2.8, 14, 5]
            }
          },
          {
            id: 'selected-island-road-inner',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            minzoom: 8,
            layout: {
              visibility: 'none',
              'line-cap': 'round',
              'line-join': 'round'
            },
            filter: osmRoadFilter(),
            paint: {
              'line-color': '#f8fbf8',
              'line-opacity': 0.96,
              'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 8, 0.55, 11, 1.3, 14, 2.6]
            }
          }
        ]
      : [];
    const scoreColor = [
      'case',
      ['==', ['get', 'scoreStatus'], 'unavailable'],
      '#aeb7b3',
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'score'], 0],
        0,
        '#d73027',
        25,
        '#fc8d59',
        50,
        '#fee08b',
        75,
        '#91cf60',
        100,
        '#1a9850'
      ]
    ];

    return {
      ...baseStyle,
      sources: {
        ...(baseStyle.sources ?? {}),
        islands: { type: 'geojson', data: EMPTY_ISLAND_COLLECTION },
        'score-fields': { type: 'geojson', data: EMPTY_SCORE_FIELD_COLLECTION },
        'selected-service-hexes': { type: 'geojson', data: EMPTY_SERVICE_HEXES }
      },
      layers: [
        ...baseLayers,
        {
          id: 'national-score-fields',
          type: 'circle',
          source: 'score-fields',
          maxzoom: NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM,
          paint: {
            'circle-color': scoreColor,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4.4, 5, 5.4, 7, 6.4, 10, 6.8, 11],
            'circle-opacity': buildZoomInterpolation(NATIONAL_SCORE_FIELD_OPACITY_STOPS),
            'circle-blur': 0.34,
            'circle-stroke-width': 0
          }
        },
        {
          id: 'island-fill',
          type: 'fill',
          source: 'islands',
          minzoom: NATIONAL_ISLAND_FILL_START_ZOOM,
          paint: {
            'fill-color': scoreColor,
            'fill-opacity': buildZoomInterpolation(NATIONAL_ISLAND_FILL_OPACITY_STOPS)
          }
        },
        {
          id: 'selected-island-fill',
          type: 'fill',
          source: 'islands',
          filter: ['==', ['get', 'id'], ''],
          paint: {
            'fill-color': '#8fd19e',
            'fill-opacity': 0,
            'fill-opacity-transition': { duration: 240, delay: 0 }
          }
        },
        {
          id: 'selected-service-demand-hexes',
          type: 'fill',
          source: 'selected-service-hexes',
          filter: ['!=', ['get', 'allStatus'], 'unavailable'],
          paint: {
            'fill-color': demandColorExpression('all'),
            'fill-opacity': demandFillOpacityExpression('all', SELECTED_DEMAND_HEX_OPACITY),
            'fill-opacity-transition': { duration: 700, delay: 0 },
            'fill-outline-color': 'rgba(255, 255, 255, 0.22)'
          }
        },
        ...selectedRoadLayers,
        {
          id: 'island-outline',
          type: 'line',
          source: 'islands',
          minzoom: NATIONAL_ISLAND_FILL_START_ZOOM,
          paint: {
            'line-color': '#6f8580',
            'line-opacity': 0.68,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4.4, 0.35, 11, 1.2]
          }
        },
        {
          id: 'island-labels',
          type: 'symbol',
          source: 'islands',
          minzoom: 6.2,
          layout: {
            'text-field': [
              'format',
              ['concat', ['get', 'atollName'], ' · ', ['get', 'name']],
              {},
              '\n',
              {},
              ['concat', ['to-string', ['round', ['get', 'score']]], '%'],
              {}
            ],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 6.2, 9, 10, 12],
            'text-anchor': 'top',
            'text-offset': [0, 0.7],
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': '#19332f',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-halo-blur': 0.15
          }
        },
        {
          id: 'selected-island-outline',
          type: 'line',
          source: 'islands',
          filter: ['==', ['get', 'id'], ''],
          paint: {
            'line-color': '#101820',
            'line-opacity': 0,
            'line-opacity-transition': { duration: 240, delay: 0 },
            'line-width': ['interpolate', ['linear'], ['zoom'], 5.5, 1.5, 10, 2.8, 16, 3.6]
          }
        }
      ]
    } as unknown as NonNullable<MapOptions['style']>;
  }

  onMount(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    document.documentElement.style.colorScheme = 'light';

    let disposed = false;

    void (async () => {
      const maplibre = await import('maplibre-gl');
      if (disposed) return;
      maplibreMarkerConstructor = maplibre.Marker;
      maplibrePopupConstructor = maplibre.Popup;

      maplibre.setWorkerUrl(
        import.meta.env.DEV
          ? new URL('maplibre-gl/dist/maplibre-gl-worker-dev.mjs', import.meta.url).href
          : new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href
      );

      mapInstance = new maplibre.Map({
        container: mapElement,
        style: await buildMapStyle(),
        center: MALDIVES_CENTER,
        zoom: 5.2,
        minZoom: 4.4,
        maxZoom: 16,
        maxPitch: 0,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false
      });

      mapInstance.once('load', () => {
        if (!mapInstance) return;
        void loadIslandGeometry();
        mapInstance.on('zoomend', () => {
          if (mapInstance && mapInstance.getZoom() >= 6.2) void loadIslandGeometry(true);
        });
        mapInstance.on('click', 'island-fill', (event) => {
          const feature = event.features?.[0];
          const id = feature?.properties?.id ?? feature?.id;
          if (typeof id === 'string') selectIslandById(id, feature?.properties?.centroid as Coordinate | undefined);
        });
        mapInstance.on('mouseenter', 'island-fill', () => {
          if (mapInstance) mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'island-fill', () => {
          if (mapInstance) mapInstance.getCanvas().style.cursor = '';
        });
        mapReady = true;
        if (mapInstance.getLayer('selected-service-demand-hexes')) {
          mapInstance.setPaintProperty(
            'selected-service-demand-hexes',
            'fill-color',
            demandColorExpression(selectedDemandCategory) as never
          );
          mapInstance.setPaintProperty(
            'selected-service-demand-hexes',
            'fill-opacity',
            demandFillOpacityExpression(selectedDemandCategory, SELECTED_DEMAND_HEX_OPACITY) as never
          );
          mapInstance.setFilter(
            'selected-service-demand-hexes',
            demandAvailabilityFilter(selectedDemandCategory) as never
          );
        }
        if (selectedIslandId) {
          prepareSelectedIslandOverlay(selectedIslandId);
          if (islandServices) {
            setSourceData('selected-service-hexes', islandServices.hexes);
            renderServiceMarkers(islandServices);
            fadeDemandHexesTo(SELECTED_DEMAND_HEX_OPACITY, selectedIslandId);
          }
        }
        void loadAnalytics();
      });
    })();

    return () => {
      disposed = true;
      removeServiceMarkers();
      mapInstance?.remove();
      mapInstance = null;
      maplibreMarkerConstructor = null;
      maplibrePopupConstructor = null;
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = '';
    };
  });

  async function loadIslandGeometry(detail = false): Promise<void> {
    if (detail && (islandDetailLoaded || islandDetailLoading)) return;
    if (detail) islandDetailLoading = true;
    else {
      loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)] ?? LOADING_MESSAGES[0];
      heatmapLoading = true;
      heatmapError = false;
    }
    try {
      const response = await fetch(`/api/map/islands${detail ? '?detail=true' : ''}`);
      if (!response.ok) throw new Error(`Island geometry request failed with status ${response.status}`);
      const islands = (await response.json()) as IslandCollection;
      islandCollection = islands;
      (mapInstance?.getSource('islands') as { setData: (data: IslandCollection) => void } | undefined)?.setData(
        islands
      );
      if (selectedIslandId) {
        setLayerFilter('selected-island-road-casing', selectedIslandRoadFilter(selectedIslandId));
        setLayerFilter('selected-island-road-inner', selectedIslandRoadFilter(selectedIslandId));
      }
      const scoreFields: ScoreFieldCollection = {
        type: 'FeatureCollection',
        features: islands.features.flatMap((island) => {
          if (island.properties.scoreStatus !== 'numeric' || island.properties.score === null) return [];
          return {
            type: 'Feature',
            id: island.id,
            geometry: { type: 'Point', coordinates: island.properties.centroid ?? [0, 0] },
            properties: { islandId: island.properties.id, score: island.properties.score }
          };
        })
      };
      (
        mapInstance?.getSource('score-fields') as { setData: (data: ScoreFieldCollection) => void } | undefined
      )?.setData(scoreFields);
      islandDetailLoaded = true;
    } catch (error) {
      if (!detail) heatmapError = true;
      console.error('Island geometry could not be loaded.', error);
    } finally {
      if (detail) islandDetailLoading = false;
      else heatmapLoading = false;
    }
  }

  function retryHeatmap(): void {
    void loadIslandGeometry();
  }
</script>

<svelte:head>
  <title>Mobility Sandbox MV | Accessibility map</title>
  <meta name="description" content="National accessibility score map for the Maldives." />
</svelte:head>

<div class="map-shell">
  <div
    bind:this={mapElement}
    class="map-canvas"
    role="application"
    aria-label={selectedIslandId ? 'Selected island service demand map' : 'National Maldives accessibility score map'}
    aria-busy={mapReady && !islandServicesLoading ? 'false' : 'true'}
  ></div>

  {#if heatmapLoading}
    <div class="heatmap-loading" role="status" aria-live="polite">
      <div class="loading-card">
        <p class="loading-brand">Mobility Sandbox MV</p>
        <div class="loading-center">
          <img
            src={`${ANIMATED_EMOJI_BASE_URL}${loadingMessage.emoji}`}
            alt={loadingMessage.alt}
            width="64"
            height="64"
          />
          <h1>{loadingMessage.title}</h1>
        </div>
        <div class="loading-status">
          <span>Loading data</span>
          <span class="loading-spinner" aria-hidden="true"></span>
        </div>
      </div>
    </div>
  {:else if heatmapError}
    <div class="heatmap-loading" role="alert">
      <div class="loading-card error-card">
        <p class="loading-brand">Mobility Sandbox MV</p>
        <p>Map unavailable. Try again.</p>
        <button type="button" onclick={retryHeatmap}>Retry map</button>
      </div>
    </div>
  {/if}

  {#if selectedIslandId}
    <section class="selected-map-controls" aria-label="Selected island service demand controls">
      <div class="selected-map-heading">
        <div>
          <p class="selected-map-eyebrow">Selected island</p>
          <h2>{islandServices?.island.name ?? selectedIsland?.name ?? 'Island services'}</h2>
        </div>
        {#if islandServicesLoading}<span class="selected-map-spinner" aria-label="Loading service demand"></span>{/if}
      </div>

      <p class="selected-map-caption">Service markers and demand intensity</p>
      <div class="service-marker-legend" aria-label="Service marker colors">
        <span><i class="marker-dot marker-dot-health"></i>Health</span>
        <span><i class="marker-dot marker-dot-education"></i>Education</span>
        <span><i class="marker-dot marker-dot-transport"></i>Transport</span>
      </div>
      <Tabs.Root bind:value={selectedDemandCategory} class="demand-tabs">
        <Tabs.List class="demand-tabs-list" aria-label="Demand category">
          {#each ISLAND_DEMAND_CATEGORIES as category (category)}
            <Tabs.Trigger value={category}>{demandCategoryLabel(category)}</Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>

      {#if islandServicesError}
        <p class="selected-map-state" role="alert">{islandServicesError}</p>
      {:else if islandServices && islandServices.summary.hexFeatureCount === 0}
        <p class="selected-map-state" role="status">
          No services with valid coordinates are available for this island.
        </p>
      {:else if islandServices}
        <p class="selected-map-state" role="status">
          {islandServices.summary.mappedCoordinateCount} services mapped · {demandCategoryLabel(selectedDemandCategory)}
        </p>
      {/if}
    </section>
  {/if}

  <div class="national-panel-slot" aria-live="polite">
    {#if selectedIslandId}
      <IslandScoreCard
        island={selectedIsland}
        loading={!mapReady || analyticsLoading || !selectedIsland}
        error={Boolean(analyticsError)}
      />
    {:else}
      <NationalScoreCard
        title="Mobility Sandbox MV"
        caption="National score"
        overall={analyticsData?.national.score}
        metrics={nationalMetrics}
        islands={islandCollection.features.map((feature) => ({
          id: feature.properties.id,
          name: feature.properties.name,
          atollName: feature.properties.atollName,
          centroid: feature.properties.centroid,
          score: feature.properties.score
        }))}
        onIslandSelect={selectSearchIsland}
        onAnalyticsOpen={openAnalytics}
        loading={!mapReady || analyticsLoading}
        error={Boolean(analyticsError)}
      />
    {/if}
  </div>

  <NationalAnalyticsCard
    bind:open={analyticsOpen}
    data={analyticsData}
    loading={analyticsLoading}
    error={analyticsError}
    onIslandSelect={focusAnalyticsIsland}
  />

  <IslandAnalyticsCard
    bind:open={islandAnalyticsOpen}
    island={selectedIsland}
    profile={islandProfile}
    loading={analyticsLoading || islandProfileLoading || !selectedIsland}
    error={analyticsError ?? islandProfileError}
    onClose={returnToNational}
  />

  <section class="map-legend" aria-label={selectedIslandId ? 'Service demand legend' : 'Accessibility score legend'}>
    {#if selectedIslandId}
      <p class="legend-title">
        {selectedDemandCategory === 'all' ? 'All demand' : `${demandCategoryLabel(selectedDemandCategory)} demand`}
      </p>
      <div class="demand-scale" aria-hidden="true"></div>
      <div class="score-labels"><span>Low</span><span>High</span></div>
      <div class="score-unavailable"><span></span>No mapped demand</div>
      <div class="marker-legend-section">
        <p class="legend-section-title">Map markers</p>
        <ul class="marker-legend" aria-label="Map service markers">
          {#each SERVICE_MARKER_LEGEND as marker (marker.label)}
            {@const Icon = marker.icon}
            <li class="marker-legend-item">
              <span class="marker-legend-icon" style={`--marker-color: ${marker.color}`} aria-hidden="true">
                <Icon size={13} strokeWidth={2.5} />
              </span>
              <span>{marker.label}</span>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="legend-title">Accessibility score</p>
      <div class="score-scale" aria-hidden="true"></div>
      <div class="score-labels"><span>Low</span><span>High</span></div>
      <div class="score-unavailable"><span></span>No access / no data</div>
    {/if}
  </section>
</div>

<style>
  :global(html),
  :global(body),
  :global(body > div),
  :global(main) {
    width: 100%;
    min-height: 100%;
    margin: 0;
  }

  :global(body) {
    overflow: hidden;
    background: #dfe3e1;
  }

  .map-shell {
    position: relative;
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    background: #e9eeec;
    color: #101820;
  }

  .map-canvas {
    position: absolute;
    inset: 0;
  }

  :global(.maplibregl-popup) {
    z-index: 3;
  }

  .heatmap-loading {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: #ffffff;
  }

  .loading-card {
    display: grid;
    grid-template-rows: auto 1fr auto;
    align-items: center;
    justify-items: center;
    width: min(42rem, 100%);
    min-height: 100%;
    gap: 1.25rem;
    color: #19332f;
    text-align: center;
  }

  .loading-brand {
    margin: 0;
    color: #19332f;
    font-size: clamp(1rem, 1.8vw, 1.35rem);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .loading-center {
    display: grid;
    justify-items: center;
    gap: 1.25rem;
  }

  .loading-card img {
    width: clamp(7rem, 14vw, 11rem);
    height: clamp(7rem, 14vw, 11rem);
    object-fit: contain;
  }

  .loading-card h1 {
    margin: 0;
    max-width: 38rem;
    color: #19332f;
    font-size: clamp(1.7rem, 3.2vw, 3rem);
    font-weight: 850;
    letter-spacing: -0.04em;
    line-height: 1.08;
  }

  .loading-status {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    color: #66827c;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid #d7e4df;
    border-top-color: #3d947d;
    border-radius: 50%;
    animation: loading-spin 0.8s linear infinite;
  }

  .error-card button {
    margin-top: 0.75rem;
    padding: 0.6rem 0.9rem;
    border: 0;
    border-radius: 0.45rem;
    background: #19332f;
    color: #ffffff;
    cursor: pointer;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 700;
  }

  @keyframes loading-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-spinner,
    .selected-map-spinner {
      animation: none;
    }
  }

  .national-panel-slot {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 2;
    width: min(19rem, calc(100vw - 2rem));
  }

  .selected-map-controls {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 2;
    width: min(21rem, calc(100vw - 2rem));
    padding: 0.8rem;
    border: 1px solid rgb(16 24 32 / 14%);
    border-radius: 0.55rem;
    background: rgb(255 255 255 / 95%);
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 14%);
    color: #101820;
  }

  .selected-map-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .selected-map-eyebrow {
    margin: 0;
    color: #66827c;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .selected-map-heading h2 {
    overflow: hidden;
    margin: 0.18rem 0 0;
    font-size: 1.05rem;
    font-weight: 850;
    letter-spacing: -0.025em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-map-caption,
  .selected-map-state {
    margin: 0.55rem 0 0;
    color: #53606a;
    font-size: 0.62rem;
    line-height: 1.3;
  }

  .service-marker-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.7rem;
    margin-top: 0.55rem;
    color: #53606a;
    font-size: 0.57rem;
  }

  .service-marker-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .marker-dot {
    width: 0.45rem;
    height: 0.45rem;
    border: 1px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgb(16 24 32 / 16%);
  }

  .marker-dot-health {
    background: #bf4f55;
  }

  .marker-dot-education {
    background: #4b6fa8;
  }

  .marker-dot-transport {
    background: #b47a3c;
  }

  .selected-map-state[role='alert'] {
    color: #b42318;
  }

  :global(.demand-tabs) {
    margin-top: 0.65rem;
  }

  :global(.demand-tabs-list) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    width: 100%;
    background: #edf2ef;
  }

  :global(.demand-tabs-list [data-slot='tabs-trigger']) {
    min-width: 0;
    padding: 0.3rem 0.2rem;
    color: #53606a;
    font-size: 0.58rem;
  }

  :global(.demand-tabs-list [data-slot='tabs-trigger'][data-state='active']) {
    color: #19332f;
  }

  .selected-map-spinner {
    width: 0.85rem;
    height: 0.85rem;
    flex: 0 0 auto;
    border: 2px solid #d7e4df;
    border-top-color: #3d947d;
    border-radius: 50%;
    animation: loading-spin 0.8s linear infinite;
  }

  .map-legend {
    position: absolute;
    z-index: 2;
    border: 1px solid rgb(16 24 32 / 14%);
    border-radius: 0.55rem;
    background: rgb(255 255 255 / 94%);
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 14%);
  }

  .legend-title {
    margin: 0;
    color: #53606a;
    font-size: 0.64rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .map-legend {
    bottom: 1rem;
    left: 1rem;
    width: min(19rem, calc(100vw - 2rem));
    padding: 0.7rem 0.8rem;
    font-size: 0.7rem;
    line-height: 1.2;
    pointer-events: none;
  }

  .score-scale {
    height: 0.55rem;
    margin-top: 0.45rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #bf4f55 0%, #d98068 25%, #d5ad63 50%, #79a884 75%, #3d947d 100%);
  }

  .demand-scale {
    height: 0.55rem;
    margin-top: 0.45rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #edf8e9 0%, #c7e9c0 28%, #fee08b 52%, #fdae61 75%, #d73027 100%);
  }

  .score-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.25rem;
    color: #53606a;
    font-size: 0.62rem;
  }

  .score-unavailable {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.55rem;
    color: #53606a;
    font-size: 0.62rem;
  }

  .score-unavailable span {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: #aeb7b3;
  }

  .marker-legend-section {
    margin-top: 0.7rem;
    padding-top: 0.65rem;
    border-top: 1px solid #e1e6e3;
  }

  .legend-section-title {
    margin: 0;
    color: #53606a;
    font-size: 0.6rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .marker-legend {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    margin: 0.45rem 0 0;
    padding: 0;
    list-style: none;
  }

  .marker-legend-item {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.35rem;
    color: #53606a;
    font-size: 0.6rem;
    line-height: 1.15;
  }

  .marker-legend-item > span:last-child {
    overflow-wrap: anywhere;
  }

  .marker-legend-icon {
    display: grid;
    width: 1.35rem;
    height: 1.35rem;
    flex: 0 0 auto;
    place-items: center;
    border: 2px solid #ffffff;
    border-radius: 50%;
    background: var(--marker-color);
    color: #ffffff;
    box-shadow: 0 0.12rem 0.35rem rgb(16 24 32 / 18%);
  }

  :global(.marker-legend-icon svg) {
    display: block;
    width: 13px;
    height: 13px;
    stroke: currentColor;
  }

  @media (max-width: 640px) {
    .national-panel-slot {
      top: 0.75rem;
      left: 0.75rem;
    }

    .selected-map-controls {
      top: auto;
      right: 0.75rem;
      bottom: 8.8rem;
      left: 0.75rem;
      width: auto;
    }

    .map-legend {
      right: 0.75rem;
      bottom: 0.75rem;
      left: 0.75rem;
      width: auto;
    }
  }
</style>
