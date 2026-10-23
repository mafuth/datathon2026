<script lang="ts">
  import type {
    FilterSpecification,
    GeoJSONSource,
    Map as MapLibreMap,
    Marker as MapLibreMarker,
    Popup as MapLibrePopup,
    MapMouseEvent,
    MapOptions
  } from 'maplibre-gl';

  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import { mount, onMount, unmount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { prefersReducedMotion } from 'svelte/motion';
  import { SvelteMap } from 'svelte/reactivity';
  import * as v from 'valibot';

  import 'maplibre-gl/dist/maplibre-gl.css';

  import type { IslandProfile } from './island-profile';
  import type { IslandSearchOption } from './island-search.svelte';
  import type {
    IslandDemandCategory,
    IslandMapService,
    IslandServiceHexes,
    IslandServicesResponse
  } from './island-services';
  import type { AnalyticsData, AnalyticsIsland } from './national-analytics-card.svelte';
  import type { ProposalRecommendation, ProposalServiceFilter } from './proposal-workspace.svelte';
  import type { ClusterMarkerData } from './service-marker-clustering';
  import type { ConnectionNetworkResponse } from '$lib/mobility/connection-network-contracts';
  import type { PresentationCoordinate, PresentationStory } from '$lib/mobility/presentation-contracts';
  import type { PresentationScript } from '$lib/mobility/presentation-script-contracts';
  import type { ProposalSettings } from '$lib/mobility/proposal-planning';
  import type { ProposalTransportOperation, ProposalTransportOptions } from '$lib/mobility/proposal-transport';
  import type { ScenarioOperation, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';
  import type { AddServiceSelection } from '$lib/mobility/service-catalog';

  import { presentationScriptSchema } from '$lib/mobility/presentation-script-contracts';
  import { DEFAULT_PROPOSAL_SETTINGS } from '$lib/mobility/proposal-planning';
  import { transportDistanceKm, transportMinimumFleet } from '$lib/mobility/proposal-transport';
  import { SERVICE_DRAG_MIME, serviceCatalogEntry } from '$lib/mobility/service-catalog';

  import * as Tabs from '$components/ui/tabs';

  import { config } from '$config';

  import IslandAnalyticsCard from './island-analytics-card.svelte';
  import { pointWithinGeometryGrace } from './island-geometry';
  import IslandScoreCard from './island-score-card.svelte';
  import IslandSearch from './island-search.svelte';
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
  import { runPresentationAction, wait } from './presentation-actions';
  import { PresentationController } from './presentation-controller.svelte';
  import PresentationCursor from './presentation-cursor.svelte';
  import PresentationReader from './presentation-reader.svelte';
  import PresentationRecommendationCard from './presentation-recommendation-card.svelte';
  import PresentationTimeline from './presentation-timeline.svelte';
  import ProposalFinancialSummary from './proposal-financial-summary.svelte';
  import ProposalLauncher from './proposal-launcher.svelte';
  import ProposalWorkspace from './proposal-workspace.svelte';
  import { SCORE_MOODS } from './score-presentation';
  import ServiceClusterMarker from './service-cluster-marker.svelte';
  import ServiceDetailsPopup from './service-details-popup.svelte';
  import ServiceMapMarker from './service-map-marker.svelte';
  import {
    clusterMarkerLabel,
    EMPTY_SERVICE_MARKERS,
    SERVICE_MARKER_ANCHOR_LAYER_ID,
    SERVICE_MARKER_CLUSTER_MAX_ZOOM,
    SERVICE_MARKER_CLUSTER_RADIUS,
    SERVICE_MARKER_COLORS,
    SERVICE_MARKER_SOURCE_ID,
    serviceMarkerCollection
  } from './service-marker-clustering';

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
      employmentScore: number | null;
      sustainabilityScore: number | null;
      pollutionPressure: number | null;
      scoreStatus: 'numeric' | 'unavailable';
    };
  };

  type IslandCollection = {
    type: 'FeatureCollection';
    features: IslandFeature[];
  };

  type IslandMaskCollection = {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: 'selected-island-mask';
      geometry: { type: 'Polygon'; coordinates: Coordinate[][] };
      properties: Record<string, never>;
    }>;
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
    key: string;
    signature: string;
    kind: 'service' | 'cluster';
    marker: MapLibreMarker;
    component: ReturnType<typeof mount>;
  };

  type MountedServicePopup = {
    serviceId: string;
    popup: MapLibrePopup;
    component: ReturnType<typeof mount>;
  };

  type ServiceMarkerQueryFeature = {
    id?: string | number;
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown> | null;
  };

  type DesiredServiceMarker =
    | {
        key: string;
        signature: string;
        kind: 'service';
        coordinates: Coordinate;
        service: IslandMapService;
      }
    | {
        key: string;
        signature: string;
        kind: 'cluster';
        cluster: ClusterMarkerData;
      };

  const EMPTY_ISLAND_COLLECTION: IslandCollection = { type: 'FeatureCollection', features: [] };
  const EMPTY_SCORE_FIELD_COLLECTION: ScoreFieldCollection = { type: 'FeatureCollection', features: [] };
  const EMPTY_SERVICE_HEXES: IslandServiceHexes = { type: 'FeatureCollection', features: [] };
  const EMPTY_SELECTED_ISLAND_MASK: IslandMaskCollection = { type: 'FeatureCollection', features: [] };
  const PRESENTATION_SOURCE_ID = 'presentation-story';
  const PRESENTATION_LINE_LAYER_ID = 'presentation-story-lines';
  const PRESENTATION_POINT_SOURCE_ID = 'presentation-position';
  const PRESENTATION_POINT_LAYER_ID = 'presentation-position-marker';
  const PROPOSAL_TRANSPORT_SOURCE_ID = 'proposal-transport-routes';
  const PROPOSAL_TRANSPORT_LINE_LAYER_ID = 'proposal-transport-lines';
  const BAARAH_ISLAND_ID = 'island:640';
  const BAARAH_HEALTH_CENTRE_SERVICE_ID = 'manual:google-maps:baarashu-health-centre';
  const HANIMAADHOO_ISLAND_ID = 'island:684';
  const RECOMMENDED_FERRY_SPEED_KPH = 30;
  const RECOMMENDED_FERRY_HEADWAY_MINUTES = 240;
  const RECOMMENDED_FERRY_START_HOUR = 6;
  const RECOMMENDED_FERRY_END_HOUR = 18;
  const RECOMMENDED_FERRY_DAYS = 6;
  const SELECTED_DEMAND_HEX_OPACITY = 1;
  const SELECTED_SERVICE_MARKER_GRACE_METERS = 150;
  const SELECTED_ISLAND_FILL_COLOR = '#e5f5e0';
  const SELECTED_ISLAND_FILL_OPACITY = 0.92;
  const SELECTED_ISLAND_MASK_COLOR = '#c2c8ca';
  const SELECTED_ISLAND_LOADING_START_COLOR = '#18181b';
  const SELECTED_ISLAND_LOADING_MID_COLOR = '#71717a';
  const SELECTED_ISLAND_LOADING_END_COLOR = '#ffffff';
  const SELECTED_ISLAND_LOADING_MIN_OPACITY = 0.22;
  const SELECTED_ISLAND_LOADING_MAX_OPACITY = 0.46;
  const SELECTED_ISLAND_LOADING_INTERVAL = 72;
  const SELECTED_ISLAND_LOADING_CYCLE = 1200;
  const SELECTED_DEMAND_REVEAL_DURATION = 240;
  const SELECTED_DEMAND_REVEAL_INTERVAL = 32;
  const SELECTED_DEMAND_REVEAL_WAVE_WIDTH = 0.22;
  const SERVICE_MARKER_EXIT_DURATION = 460;
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
  const DESTINATION_ISLAND_ID = 'island:1442';
  const TREE_TOP_SERVICE_ID = 'facility:health:362';
  const SERVICE_MARKER_LEGEND = [
    { label: 'Health', color: SERVICE_MARKER_COLORS.health, icon: Hospital },
    { label: 'Education', color: SERVICE_MARKER_COLORS.education, icon: School },
    { label: 'Transport', color: SERVICE_MARKER_COLORS.transport, icon: Route }
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
  let baseRoadLayerIds = $state<string[]>([]);
  let mapReady = $state(false);
  let heatmapLoading = $state(true);
  let heatmapError = $state(false);
  let loadingMessage = $state<(typeof LOADING_MESSAGES)[number]>(LOADING_MESSAGES[0]);
  let islandCollection = $state<IslandCollection>(EMPTY_ISLAND_COLLECTION);
  let islandDetailLoaded = false;
  let islandDetailLoading = false;
  let analyticsOpen = $state(false);
  let islandAnalyticsOpen = $state(false);
  let proposalMode = $state(false);
  let selectedIslandId = $state<string | null>(null);
  let analyticsLoading = $state(false);
  let analyticsError = $state<string | null>(null);
  let analyticsData = $state<AnalyticsData | null>(null);
  let connectionNetwork = $state<ConnectionNetworkResponse | null>(null);
  let connectionNetworkLoading = $state(false);
  let connectionNetworkError = $state<string | null>(null);
  const presentation = new PresentationController();
  let presentationStory = $state.raw<PresentationStory | null>(null);
  let presentationFrame: number | null = null;
  let presentationRun = 0;
  let presentationAutoPlay = $state(false);
  let presentationAdvanceTimer: number | null = null;
  let readerScript = $state.raw<PresentationScript | null>(null);
  let readerActive = $state(false);
  let readerCardVisible = $state(false);
  let readerPlaying = $state(false);
  let readerStepIndex = $state(0);
  let readerActionIndex = $state(0);
  let readerRemainingSeconds = $state(270);
  let readerActionError = $state<string | null>(null);
  let readerActionRun = 0;
  let readerTimer: number | null = null;
  let islandProfile = $state<IslandProfile | null>(null);
  let islandProfileLoading = $state(false);
  let islandProfileError = $state<string | null>(null);
  let islandProfileRequest = 0;
  const islandProfileCache = new SvelteMap<string, IslandProfile>();
  let islandServices = $state<IslandServicesResponse | null>(null);
  let islandServicesLoading = $state(false);
  let islandServicesError = $state<string | null>(null);
  let islandServicesRequest = 0;
  const islandServicesCache = new SvelteMap<string, IslandServicesResponse>();
  let selectedDemandCategory = $state<IslandDemandCategory>('all');
  let proposalQuery = $state('');
  let proposalServiceFilter = $state<ProposalServiceFilter>('all');
  let proposalPending = $state(false);
  let proposalError = $state<string | null>(null);
  let draftOperations = $state<ScenarioOperation[]>([]);
  let draftCursor = $state(0);
  let draftPreview = $state.raw<ScenarioPreviewResponse | null>(null);
  let proposalExporting = $state(false);
  let proposalExportComplete = $state(false);
  let proposalView = $state<'baseline' | 'proposal'>('proposal');
  let proposalRequest = 0;
  let proposalSettings = $state<ProposalSettings>({ ...DEFAULT_PROPOSAL_SETTINGS });
  let editableProposal = $derived(
    proposalMode &&
      proposalView === 'proposal' &&
      !proposalPending &&
      !islandServicesLoading &&
      Boolean(islandServices?.baselineVersion)
  );
  let moveServiceId = $state<string | null>(null);
  let proposalLastMessage = $state<string | null>(null);
  let addServiceDraft = $state<AddServiceSelection | null>(null);
  let proposalRecommendation = $state.raw<ProposalRecommendation | null>(null);
  let recommendationOperation = $state.raw<ScenarioOperation | null>(null);
  let ignoredRecommendationOperationId = $state<string | null>(null);
  let recommendationPending = $state(false);
  let recommendationStarting = $state(false);
  let recommendationKey: string | null = null;
  let recommendationRequest = 0;
  let recommendationAbortController: AbortController | null = null;
  const recommendationOptionsCache = new SvelteMap<string, ProposalTransportOptions>();
  const recommendationOptionsRequests = new SvelteMap<string, Promise<ProposalTransportOptions>>();
  type BaarahRecommendationCacheEntry = {
    recommendation: ProposalRecommendation;
    operation: ProposalTransportOperation;
  };
  const baarahRecommendationCache = new SvelteMap<string, BaarahRecommendationCacheEntry>();
  const BAARAH_RECOMMENDATION_CACHE_LIMIT = 16;
  const BAARAH_RECOMMENDATION_CACHE_DELAY_MS = 500;
  const BAARAH_RECOMMENDATION_STORAGE_KEY = 'mobility:baarah-recommendations:v1';
  let recommendationUndoOperations = $state.raw<ScenarioOperation[] | null>(null);
  let transportEditorOperation = $state.raw<ProposalTransportOperation | null>(null);
  let proposalPreview = $derived(draftPreview);
  let proposalHeatmapHexes = $state.raw<IslandServiceHexes | null>(null);
  let proposalHeatmapTask = 0;
  let displayedServices = $derived.by(() => {
    const displayed =
      proposalMode && proposalView === 'proposal' ? (proposalPreview ?? islandServices) : islandServices;
    if (!displayed || !proposalMode || proposalView !== 'proposal' || !proposalPreview) return displayed;
    return { ...displayed, hexes: proposalHeatmapHexes ?? displayed.hexes };
  });
  let proposalBuilderTab = $state<'services' | 'transport'>('services');
  let suppressMapClickUntil = 0;
  // MapLibre marker instances are imperative bookkeeping, not rendered Svelte state.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let mountedServiceMarkers = new Map<string, MountedServiceMarker>();
  let serviceMarkerServices = new SvelteMap<string, IslandMapService>();
  let serviceMarkerSyncFrame: number | null = null;
  let selectedIslandLoadingTimer: number | null = null;
  let demandRevealTimer: number | null = null;
  let demandRevealToken = 0;
  let demandRevealProgress = 1;
  let lastProposalHeatmapHexes: IslandServiceHexes | null = null;
  let serviceFocusToken = 0;
  let islandFocusRequest = 0;
  let activeServicePopup: MountedServicePopup | null = null;
  let selectedIsland = $derived(analyticsData?.islands.find((island) => island.id === selectedIslandId) ?? null);
  let selectedIslandLoading = $derived(
    selectedIslandId !== null && (analyticsLoading || islandProfileLoading || islandServicesLoading)
  );

  function premiumLoadingExit(_node: Element, { duration = 820 }: { duration?: number } = {}) {
    const transitionDuration = prefersReducedMotion.current ? 0 : duration;

    return {
      duration: transitionDuration,
      easing: cubicOut,
      css: (t: number) => `opacity: ${t}; filter: blur(${(1 - t) * 3.5}px);`
    };
  }

  function selectIslandById(id: string, centroid?: Coordinate): void {
    if (proposalPending) return;
    if (proposalMode && selectedIslandId === id) return;
    if (presentation.active) clearPresentation();
    const focusRequest = ++islandFocusRequest;
    if (proposalMode && selectedIslandId && selectedIslandId !== id) {
      closeServicePopup();
      stopMoveMode();
      stopAddServiceMode();
      clearTransportEditState();
      draftOperations = [];
      draftCursor = 0;
      draftPreview = null;
      proposalError = null;
      proposalLastMessage = null;
    }
    selectedIslandId = id;
    selectedDemandCategory = 'all';
    analyticsOpen = false;
    islandAnalyticsOpen = true;
    prepareSelectedIslandOverlay(id);
    void loadIslandProfile(id);
    void loadIslandServices(id);

    const island = islandCollection.features.find((feature) => feature.properties.id === id);
    const islandCentroid = island?.properties.centroid;
    void focusIsland(
      {
        id,
        name: island?.properties.name ?? selectedIsland?.name ?? 'Island',
        atollName: island?.properties.atollName ?? selectedIsland?.atollName ?? '',
        centroid: isValidCoordinate(islandCentroid) ? islandCentroid : centroid,
        score: island?.properties.score ?? selectedIsland?.overall.score ?? null
      },
      850,
      () => focusRequest === islandFocusRequest && selectedIslandId === id
    );

    if (!analyticsData) void loadAnalytics();
  }

  function isValidCoordinate(value: unknown): value is Coordinate {
    if (!Array.isArray(value) || value.length < 2) return false;
    const [longitude, latitude] = value;
    return (
      typeof longitude === 'number' &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90
    );
  }

  function isValidMapCenter(value: unknown): boolean {
    if (isValidCoordinate(value)) return true;
    if (!value || typeof value !== 'object') return false;
    const center = value as { lng?: unknown; lat?: unknown };
    return (
      typeof center.lng === 'number' &&
      Number.isFinite(center.lng) &&
      center.lng >= -180 &&
      center.lng <= 180 &&
      typeof center.lat === 'number' &&
      Number.isFinite(center.lat) &&
      center.lat >= -90 &&
      center.lat <= 90
    );
  }

  function collectCoordinates(value: unknown, points: Coordinate[]): void {
    if (!Array.isArray(value)) return;
    if (isValidCoordinate(value)) {
      points.push(value);
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
    if (proposalMode) {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const stacked = window.matchMedia('(max-width: 64rem)').matches;
      return stacked
        ? { top: 16, right: 16, bottom: Math.round((mapElement?.clientHeight ?? 600) * 0.6) + 1.5 * rem, left: 16 }
        : { top: 24, right: 34 * rem, bottom: 24, left: 24 * rem };
    }
    if (isMobile) return { top: 210, right: 24, bottom: 190, left: 24 };
    return { top: 155, right: 370, bottom: 135, left: 350 };
  }

  function safeCameraPadding(padding: { top: number; right: number; bottom: number; left: number }) {
    const width = Math.max(1, mapElement?.clientWidth ?? 1);
    const height = Math.max(1, mapElement?.clientHeight ?? 1);
    const horizontal = padding.left + padding.right;
    const vertical = padding.top + padding.bottom;
    const scale = Math.min(
      1,
      horizontal > 0 ? Math.max(0, width - 32) / horizontal : 1,
      vertical > 0 ? Math.max(0, height - 32) / vertical : 1
    );
    return {
      top: padding.top * scale,
      right: padding.right * scale,
      bottom: padding.bottom * scale,
      left: padding.left * scale
    };
  }

  async function waitForMapIdle(timeout = 2200): Promise<boolean> {
    const started = performance.now();
    while (!mapInstance && performance.now() - started < timeout) await wait(80);
    const map = mapInstance;
    if (!map) return false;

    return new Promise((resolve) => {
      let timer: number | null = null;
      let settled = false;
      let onIdle: () => void;
      let onMoveEnd: () => void;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        if (timer !== null) window.clearTimeout(timer);
        map.off('idle', onIdle);
        map.off('moveend', onMoveEnd);
        resolve(result);
      };
      onIdle = () => finish(true);
      onMoveEnd = () => finish(true);

      map.on('idle', onIdle);
      map.on('moveend', onMoveEnd);
      timer = window.setTimeout(() => finish(!map.isMoving()), timeout);
      if (!map.isMoving()) window.setTimeout(() => finish(true), 80);
    });
  }

  async function resetMapToNational(): Promise<boolean> {
    if (!mapInstance) return false;
    const reducedMotion = prefersReducedMotion.current;
    try {
      mapInstance.easeTo({
        center: MALDIVES_CENTER,
        zoom: 5.2,
        duration: reducedMotion ? 0 : 650,
        essential: !reducedMotion
      });
    } catch {
      return false;
    }
    return waitForMapIdle();
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
    islandFocusRequest += 1;
    if (proposalMode) closeProposalMode();
    closeServicePopup();
    analyticsOpen = false;
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
    void resetMapToNational();
  }

  async function focusIsland(
    island: IslandSearchOption,
    duration = 850,
    isCurrent: () => boolean = () => true
  ): Promise<boolean> {
    if (!mapInstance) return false;
    const map = mapInstance;
    const reducedMotion = prefersReducedMotion.current;
    map.stop();
    const feature = islandCollection.features.find((candidate) => candidate.properties.id === island.id);
    const bounds = feature ? islandBounds(feature) : null;
    if (!bounds && !isValidCoordinate(island.centroid)) return false;

    if (bounds) {
      const padding = safeCameraPadding(islandCameraPadding());
      let camera: ReturnType<typeof map.cameraForBounds> | null = null;
      try {
        camera = map.cameraForBounds(bounds, { padding, maxZoom: 14 });
      } catch {
        // Keep the fallback camera path below.
      }
      const currentZoom = mapInstance.getZoom();

      if (camera?.center && isValidMapCenter(camera.center)) {
        const fittedZoom = camera.zoom ?? currentZoom;
        const keepCurrentZoom = fittedZoom < currentZoom && boundsFitAtCurrentZoom(bounds, padding);
        if (!isCurrent()) return Promise.resolve(false);
        map.stop();
        map.easeTo({
          center: camera.center,
          zoom: keepCurrentZoom ? currentZoom : fittedZoom,
          duration: reducedMotion ? 0 : duration,
          essential: !reducedMotion
        });
        await waitForMapIdle();
        return isCurrent();
      }
    }

    if (bounds) {
      try {
        if (!isCurrent()) return false;
        map.stop();
        map.fitBounds(bounds, {
          padding: safeCameraPadding(islandCameraPadding()),
          maxZoom: 14,
          duration: reducedMotion ? 0 : duration
        });
        await waitForMapIdle();
        return isCurrent();
      } catch {
        // Fall through to the centroid when the bounds cannot be applied.
      }
    }

    if (!isValidCoordinate(island.centroid)) return false;
    if (!isCurrent()) return false;
    map.stop();
    map.flyTo({
      center: island.centroid,
      zoom: Math.max(map.getZoom(), 10),
      duration: reducedMotion ? 0 : duration,
      essential: !reducedMotion
    });
    await waitForMapIdle();
    return isCurrent();
  }

  async function focusService(
    service: IslandMapService,
    presentationFocus = false,
    openPopup = true
  ): Promise<boolean> {
    const coordinates = service.coordinates;
    if (!mapInstance || !isValidCoordinate(coordinates)) return false;

    closeServicePopup();
    const focusToken = serviceFocusToken;
    const reducedMotion = prefersReducedMotion.current;
    try {
      mapInstance.easeTo({
        center: coordinates,
        padding:
          presentationFocus || proposalMode
            ? safeCameraPadding(islandCameraPadding())
            : { top: 0, right: 0, bottom: 0, left: 0 },
        zoom: Math.min(mapInstance.getMaxZoom(), Math.max(mapInstance.getZoom(), 16)),
        duration: reducedMotion ? 0 : 650,
        essential: !reducedMotion
      });
    } catch {
      return false;
    }

    await waitForMapIdle();

    if (!openPopup) return true;

    const openFocusedService = () => {
      if (focusToken !== serviceFocusToken || !mapInstance) return;
      if (serviceMarkerServices.has(service.id)) openServicePopup(service);
    };
    if (mapInstance.getZoom() > SERVICE_MARKER_CLUSTER_MAX_ZOOM) openFocusedService();
    else mapInstance.once('idle', openFocusedService);
    return true;
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

  function isConnectionNetworkResponse(value: unknown): value is ConnectionNetworkResponse {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { islands?: unknown; connections?: unknown };
    return Array.isArray(candidate.islands) && Array.isArray(candidate.connections);
  }

  async function loadConnectionNetwork(): Promise<void> {
    if (connectionNetwork || connectionNetworkLoading) return;
    connectionNetworkLoading = true;
    connectionNetworkError = null;
    try {
      const response = await fetch('/api/v1/map/network', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Connection network request failed with status ${response.status}`);
      const payload: unknown = await response.json();
      if (!isConnectionNetworkResponse(payload)) throw new Error('Connection network returned an invalid response.');
      connectionNetwork = payload;
    } catch (error) {
      connectionNetworkError = error instanceof Error ? error.message : 'Connection network could not be loaded.';
    } finally {
      connectionNetworkLoading = false;
    }
  }

  async function loadIslandProfile(id: string): Promise<void> {
    const requestId = ++islandProfileRequest;
    islandProfile = null;
    islandProfileLoading = true;
    islandProfileError = null;
    try {
      const cachedProfile = islandProfileCache.get(id);
      if (cachedProfile) {
        if (requestId === islandProfileRequest) islandProfile = cachedProfile;
        return;
      }
      const response = await fetch(`/api/map/islands/${encodeURIComponent(id)}/profile`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Island profile request failed with status ${response.status}`);
      const profile = (await response.json()) as IslandProfile;
      islandProfileCache.set(id, profile);
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

  function isCoordinate(value: unknown): value is Coordinate {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number' &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    );
  }

  function signedRingArea(ring: readonly Coordinate[]): number {
    let area = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const current = ring[index];
      const next = ring[index + 1];
      if (!current || !next) continue;
      area += current[0] * next[1] - next[0] * current[1];
    }
    return area / 2;
  }

  function maskRing(value: unknown, clockwise: boolean): Coordinate[] | null {
    if (!Array.isArray(value)) return null;
    const ring = value.filter(isCoordinate);
    if (ring.length < 3) return null;

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last) return null;
    const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
    const area = signedRingArea(closed);
    const shouldReverse = clockwise ? area > 0 : area < 0;
    return shouldReverse ? [...closed].reverse() : closed;
  }

  function selectedIslandMask(id: string): IslandMaskCollection {
    const feature = islandCollection.features.find((candidate) => candidate.properties.id === id);
    if (!feature) return EMPTY_SELECTED_ISLAND_MASK;

    const coordinates = Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates : [];
    const rawOuterRings =
      feature.geometry.type === 'Polygon'
        ? [coordinates[0]]
        : feature.geometry.type === 'MultiPolygon'
          ? coordinates.flatMap((polygon) => (Array.isArray(polygon) ? [polygon[0]] : []))
          : [];
    const islandRings = rawOuterRings
      .map((ring) => maskRing(ring, true))
      .filter((ring): ring is Coordinate[] => ring !== null);
    const worldRing = maskRing(
      [
        [-180, -90],
        [180, -90],
        [180, 90],
        [-180, 90],
        [-180, -90]
      ],
      false
    );
    if (!worldRing || islandRings.length === 0) return EMPTY_SELECTED_ISLAND_MASK;

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'selected-island-mask',
          geometry: { type: 'Polygon', coordinates: [worldRing, ...islandRings] },
          properties: {}
        }
      ]
    };
  }

  function finiteMarkerNumber(value: unknown): number | null {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(number) ? number : null;
  }

  function markerFeatureCoordinates(feature: ServiceMarkerQueryFeature): Coordinate | null {
    if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (
      typeof longitude !== 'number' ||
      typeof latitude !== 'number' ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      return null;
    }
    return [longitude, latitude];
  }

  function clusterMarkerData(feature: ServiceMarkerQueryFeature): ClusterMarkerData | null {
    const properties = feature.properties ?? {};
    const clusterId = finiteMarkerNumber(properties.cluster_id);
    const total = finiteMarkerNumber(properties.point_count);
    const coordinates = markerFeatureCoordinates(feature);
    if (clusterId === null || total === null || !coordinates) return null;

    return {
      clusterId,
      coordinates,
      total: Math.max(2, Math.round(total)),
      healthCount: Math.max(0, Math.round(finiteMarkerNumber(properties.healthCount) ?? 0)),
      educationCount: Math.max(0, Math.round(finiteMarkerNumber(properties.educationCount) ?? 0)),
      transportCount: Math.max(0, Math.round(finiteMarkerNumber(properties.transportCount) ?? 0))
    };
  }

  function scheduleServiceMarkerSync(): void {
    if (serviceMarkerSyncFrame !== null) return;
    serviceMarkerSyncFrame = window.requestAnimationFrame(() => {
      serviceMarkerSyncFrame = null;
      syncServiceMarkers();
    });
  }

  function removeMountedServiceMarker(mounted: MountedServiceMarker, animate = false): void {
    const element = mounted.marker
      .getElement()
      .querySelector<HTMLElement>('[data-service-marker], [data-service-cluster-marker]');
    const reducedMotion = prefersReducedMotion.current;
    if (animate && element && !reducedMotion) {
      element.classList.add(mounted.kind === 'service' ? 'service-marker-exiting' : 'service-cluster-marker-exiting');
      window.setTimeout(() => {
        mounted.marker.remove();
        void unmount(mounted.component);
      }, SERVICE_MARKER_EXIT_DURATION);
      return;
    }
    mounted.marker.remove();
    void unmount(mounted.component);
  }

  function serviceMarkerScale(kind: MountedServiceMarker['kind']): number {
    if (!mapInstance) return 1;
    const zoom = Math.min(16, Math.max(8, mapInstance.getZoom()));
    const progress = (zoom - 8) / 8;
    const minimum = kind === 'cluster' ? 0.78 : 0.82;
    const range = kind === 'cluster' ? 0.34 : 0.42;
    return Number((minimum + progress * range).toFixed(3));
  }

  function updateMountedServiceMarkerScale(mounted: MountedServiceMarker): void {
    const element = mounted.marker
      .getElement()
      .querySelector<HTMLElement>('[data-service-marker], [data-service-cluster-marker]');
    element?.style.setProperty('--marker-scale', String(serviceMarkerScale(mounted.kind)));
  }

  function disposeMountedServiceMarkers(animate = false): void {
    const markers = [...mountedServiceMarkers.values()];
    mountedServiceMarkers.clear();
    for (const mounted of markers) removeMountedServiceMarker(mounted, animate);
  }

  function cancelPendingServiceFocus(): void {
    serviceFocusToken += 1;
  }

  function closeServicePopup(): void {
    cancelPendingServiceFocus();
    const mountedPopup = activeServicePopup;
    if (!mountedPopup) return;
    activeServicePopup = null;
    mountedPopup.popup.remove();
    void unmount(mountedPopup.component);
  }

  function stopMoveMode(): void {
    moveServiceId = null;
    if (mapInstance) mapInstance.getCanvas().style.cursor = '';
  }

  function stopAddServiceMode(): void {
    addServiceDraft = null;
    if (!moveServiceId && mapInstance) mapInstance.getCanvas().style.cursor = '';
  }

  function startAddService(selection: AddServiceSelection): void {
    if (!editableProposal) return;
    stopMoveMode();
    closeServicePopup();
    addServiceDraft = selection;
    proposalError = null;
    if (mapInstance) mapInstance.getCanvas().style.cursor = 'crosshair';
  }

  function startMoveService(service: IslandMapService): void {
    if (!editableProposal || !service.eligibility?.canMove) return;
    closeServicePopup();
    moveServiceId = service.id;
    proposalError = null;
    if (mapInstance) mapInstance.getCanvas().style.cursor = 'crosshair';
  }

  function operationId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function isBaarahHospitalUpgrade(operation: ScenarioOperation): boolean {
    if (
      selectedIslandId !== BAARAH_ISLAND_ID ||
      operation.kind !== 'upgrade_service' ||
      operation.targetSubtype !== 'hospital'
    )
      return false;
    return islandServices?.services.find((service) => service.id === operation.serviceId)?.serviceType === 'health';
  }

  function clearTransportEditState(): void {
    proposalPending = false;
  }

  async function applyDraftOperation(operation: ScenarioOperation): Promise<void> {
    if (!editableProposal) return;
    clearTransportEditState();
    recommendationUndoOperations = null;
    const startsRecommendation = isBaarahHospitalUpgrade(operation);
    const sourcePreview = draftPreview;
    const expectedProposalRequest = proposalRequest + 1;
    if (startsRecommendation) {
      proposalRecommendation = null;
      recommendationOperation = null;
      recommendationStarting = true;
    }
    const nextOperations = [...draftOperations.slice(0, draftCursor), operation];
    if (nextOperations.length > 100) {
      proposalError = 'This draft has reached the 100-operation limit. Undo an edit before replacing it.';
      recommendationStarting = false;
      return;
    }
    const previewPromise = previewDraftHistory(nextOperations, nextOperations.length, false);
    if (startsRecommendation && selectedIslandId && islandServices?.baselineVersion) {
      void prepareBaarahRecommendation({
        upgrade: operation,
        currentOperations: nextOperations,
        sourcePreview,
        sourcePreviewPromise: previewPromise,
        islandId: selectedIslandId,
        version: islandServices.baselineVersion,
        expectedProposalRequest
      });
    } else if (startsRecommendation) {
      recommendationStarting = false;
    }
    const applied = await previewPromise;
    if (!applied) {
      if (startsRecommendation) {
        recommendationRequest += 1;
        recommendationAbortController?.abort();
        recommendationStarting = false;
      }
      return;
    }
    if (operation.kind === 'move_service') stopMoveMode();
    if (operation.kind === 'add_service') {
      stopAddServiceMode();
      const result = draftPreview?.operations.find((entry) => entry.operationId === operation.operationId);
      const addedService = result ? draftPreview?.services.find((service) => service.id === result.serviceId) : null;
      if (addedService && editableProposal) openServicePopup(addedService);
    }
  }

  async function requestDraftPreview(
    islandId: string,
    baselineVersion: string,
    operations: ScenarioOperation[],
    settings: ProposalSettings = proposalSettings,
    signal?: AbortSignal
  ): Promise<ScenarioPreviewResponse> {
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
    const response = await fetch('/api/v1/scenarios/preview', {
      method: 'POST',
      signal: requestSignal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baselineVersion, selectedIslandId: islandId, operations, proposal: settings })
    });
    const payload = (await response.json()) as ScenarioPreviewResponse | { error?: string };
    if (!response.ok) throw new Error('error' in payload && payload.error ? payload.error : 'Draft preview failed.');
    const preview = payload as ScenarioPreviewResponse;
    if (
      preview.status !== 'draft' ||
      preview.selectedIslandId !== islandId ||
      preview.island?.id !== islandId ||
      preview.baselineVersion !== baselineVersion ||
      preview.baseline?.island?.id !== islandId ||
      preview.baseline.baselineVersion !== baselineVersion ||
      !Array.isArray(preview.operations) ||
      preview.operations.length !== operations.length ||
      preview.operations.some((result, index) => result.operationId !== operations[index]?.operationId)
    )
      throw new Error('The server returned an incompatible draft preview.');
    return preview;
  }

  async function previewDraftHistory(
    operations: ScenarioOperation[],
    cursor: number,
    startRecommendation = true
  ): Promise<ScenarioPreviewResponse | null> {
    const islandId = selectedIslandId;
    const version = islandServices?.baselineVersion;
    if (!proposalMode || !islandId || !version || proposalPending) return null;
    const request = ++proposalRequest;
    proposalPending = true;
    proposalError = null;
    closeServicePopup();
    stopMoveMode();
    stopAddServiceMode();
    try {
      const preview = await requestDraftPreview(islandId, version, operations.slice(0, cursor));
      if (request !== proposalRequest || selectedIslandId !== islandId || !proposalMode) return null;
      draftOperations = operations;
      draftCursor = cursor;
      scheduleProposalHeatmap(preview.baseline.hexes, preview.hexes);
      draftPreview = preview;
      islandServices = preview.baseline;
      proposalLastMessage = `${cursor} applied edit${cursor === 1 ? '' : 's'}. ${preview.operations.at(-1)?.message ?? 'Baseline restored.'}`;
      syncProposalTransportLayers();
      if (startRecommendation) void prepareBaarahRecommendation();
      return preview;
    } catch (error) {
      if (request === proposalRequest) proposalError = error instanceof Error ? error.message : 'Draft update failed.';
      return null;
    } finally {
      if (request === proposalRequest) proposalPending = false;
    }
  }

  function activeBaarahHospitalUpgrade(): ScenarioOperation | null {
    if (selectedIslandId !== BAARAH_ISLAND_ID) return null;
    const operations = draftOperations.slice(0, draftCursor);
    const upgrade =
      operations.findLast((operation) => {
        if (operation.kind !== 'upgrade_service' || operation.targetSubtype !== 'hospital') return false;
        const service = islandServices?.services.find((entry) => entry.id === operation.serviceId);
        return service?.serviceType === 'health';
      }) ?? null;
    return upgrade?.operationId === ignoredRecommendationOperationId ? null : upgrade;
  }

  function presentationJourneyMinutes(story: PresentationStory): number | null {
    const seconds = story.sections
      .filter((section) => section.branch === 'patient')
      .reduce((total, section) => total + (section.timing.seconds ?? 0), 0);
    return seconds > 0 ? Math.round(seconds / 60) : null;
  }

  function recommendationOptions(islandId: string, version: string): Promise<ProposalTransportOptions> {
    const key = `${islandId}:${version}`;
    const cached = recommendationOptionsCache.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = recommendationOptionsRequests.get(key);
    if (pending) return pending;
    const request = fetch(`/api/v1/scenarios/transport-options?islandId=${encodeURIComponent(islandId)}`)
      .then(async (response) => {
        const payload = (await response.json()) as ProposalTransportOptions | { error?: string };
        if (!response.ok || 'error' in payload)
          throw new Error('error' in payload ? payload.error : 'Transport options are unavailable.');
        const options = payload as ProposalTransportOptions;
        if (options.islandId !== islandId) throw new Error('Transport options belong to a different island.');
        recommendationOptionsCache.set(key, options);
        return options;
      })
      .finally(() => recommendationOptionsRequests.delete(key));
    recommendationOptionsRequests.set(key, request);
    return request;
  }

  function baarahRecommendationKey(
    islandId: string,
    version: string,
    operations: readonly ScenarioOperation[],
    settings: ProposalSettings
  ): string {
    return JSON.stringify([version, islandId, operations, settings], (key, value: unknown) =>
      key === 'operationId' ? undefined : value
    );
  }

  function baarahRecommendationHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function readStoredBaarahRecommendation(key: string): BaarahRecommendationCacheEntry | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = JSON.parse(localStorage.getItem(BAARAH_RECOMMENDATION_STORAGE_KEY) ?? '{}') as Record<
        string,
        BaarahRecommendationCacheEntry
      >;
      return stored[baarahRecommendationHash(key)] ?? null;
    } catch {
      return null;
    }
  }

  function persistBaarahRecommendation(key: string, entry: BaarahRecommendationCacheEntry): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = JSON.parse(localStorage.getItem(BAARAH_RECOMMENDATION_STORAGE_KEY) ?? '{}') as Record<
        string,
        BaarahRecommendationCacheEntry
      >;
      const hash = baarahRecommendationHash(key);
      stored[hash] = entry;
      const hashes = Object.keys(stored);
      while (hashes.length > BAARAH_RECOMMENDATION_CACHE_LIMIT) delete stored[hashes.shift()!];
      localStorage.setItem(BAARAH_RECOMMENDATION_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Browser storage may be disabled or full; memory caching still applies.
    }
  }

  function cachedBaarahRecommendation(key: string): BaarahRecommendationCacheEntry | null {
    const cached = baarahRecommendationCache.get(key);
    if (cached) {
      baarahRecommendationCache.delete(key);
      baarahRecommendationCache.set(key, cached);
      return cached;
    }
    const stored = readStoredBaarahRecommendation(key);
    if (stored) {
      cacheBaarahRecommendation(key, stored);
      return stored;
    }
    return null;
  }

  function cacheBaarahRecommendation(key: string, entry: BaarahRecommendationCacheEntry): void {
    baarahRecommendationCache.delete(key);
    baarahRecommendationCache.set(key, entry);
    while (baarahRecommendationCache.size > BAARAH_RECOMMENDATION_CACHE_LIMIT) {
      const oldest = baarahRecommendationCache.keys().next().value;
      if (oldest === undefined) break;
      baarahRecommendationCache.delete(oldest);
    }
    persistBaarahRecommendation(key, entry);
  }

  type BaarahRecommendationContext = {
    upgrade: ScenarioOperation;
    currentOperations: ScenarioOperation[];
    sourcePreview: ScenarioPreviewResponse | null;
    sourcePreviewPromise?: Promise<ScenarioPreviewResponse | null>;
    islandId: string;
    version: string;
    expectedProposalRequest?: number;
  };

  async function prepareBaarahRecommendation(context?: BaarahRecommendationContext): Promise<void> {
    const requestToken = ++recommendationRequest;
    const upgrade = context?.upgrade ?? activeBaarahHospitalUpgrade();
    const islandId = context?.islandId ?? selectedIslandId;
    const version = context?.version ?? islandServices?.baselineVersion;
    const sourcePreview = context?.sourcePreview ?? draftPreview;
    if (!upgrade || !islandId || !version || (!sourcePreview && !context?.sourcePreviewPromise)) {
      recommendationAbortController?.abort();
      recommendationAbortController = null;
      if (!upgrade) {
        proposalRecommendation = null;
        recommendationOperation = null;
        recommendationKey = null;
        recommendationStarting = false;
        recommendationPending = false;
      }
      return;
    }
    const currentOperations = context?.currentOperations ?? draftOperations.slice(0, draftCursor);
    const key = baarahRecommendationKey(islandId, version, currentOperations, proposalSettings);
    if (recommendationKey === key && recommendationPending) return;
    recommendationAbortController?.abort();
    const cached = cachedBaarahRecommendation(key);
    if (cached) {
      recommendationKey = key;
      recommendationStarting = false;
      recommendationPending = true;
      recommendationAbortController = null;
      await new Promise<void>((resolve) => window.setTimeout(resolve, BAARAH_RECOMMENDATION_CACHE_DELAY_MS));
      if (recommendationRequest !== requestToken || recommendationKey !== key || !proposalMode) {
        if (recommendationRequest === requestToken && recommendationKey === key) recommendationPending = false;
        return;
      }
      proposalRecommendation = cached.recommendation;
      recommendationOperation = { ...cached.operation, operationId: operationId() };
      recommendationPending = false;
      return;
    }
    const abortController = new AbortController();
    recommendationAbortController = abortController;
    recommendationPending = true;
    recommendationStarting = false;
    recommendationKey = key;
    try {
      const storyPromise = presentationStory
        ? Promise.resolve(presentationStory)
        : fetch('/api/v1/presentation/story', { signal: abortController.signal }).then(async (response) => {
            if (!response.ok) throw new Error('The current presentation journey is unavailable.');
            const story = (await response.json()) as PresentationStory;
            presentationStory = story;
            return story;
          });
      const [options, story] = await Promise.all([recommendationOptions(BAARAH_ISLAND_ID, version), storyPromise]);
      const pairs = options.origins.flatMap((origin) =>
        options.destinations
          .filter((destination) => destination.islandId === HANIMAADHOO_ISLAND_ID)
          .map((destination) => ({
            origin,
            destination,
            distanceKm: transportDistanceKm(origin.coordinates, destination.coordinates)
          }))
      );
      const pair = pairs.sort((a, b) => a.distanceKm - b.distanceKm)[0];
      if (!pair) throw new Error('Recorded Baarah and Hanimaadhoo landing places are required.');
      const { origin, destination, distanceKm } = pair;
      const currentJourneyMinutes = presentationJourneyMinutes(story);
      if (!currentJourneyMinutes) throw new Error('The current presentation journey has no usable timing evidence.');
      const recommendedJourneyMinutes = Math.round(
        RECOMMENDED_FERRY_HEADWAY_MINUTES / 2 + (distanceKm / RECOMMENDED_FERRY_SPEED_KPH) * 60
      );
      const ferryOperation: ScenarioOperation = {
        operationId: operationId(),
        kind: 'add_ferry_service',
        originStopId: origin.id,
        destinationStopId: destination.id,
        speedKph: RECOMMENDED_FERRY_SPEED_KPH,
        headwayMinutes: RECOMMENDED_FERRY_HEADWAY_MINUTES,
        startHour: RECOMMENDED_FERRY_START_HOUR,
        endHour: RECOMMENDED_FERRY_END_HOUR,
        serviceDaysPerWeek: RECOMMENDED_FERRY_DAYS,
        vehicleCount: transportMinimumFleet(
          'ferry',
          distanceKm,
          RECOMMENDED_FERRY_HEADWAY_MINUTES,
          RECOMMENDED_FERRY_SPEED_KPH
        )
      };
      const upgradeIndex = currentOperations.findIndex((operation) => operation.operationId === upgrade.operationId);
      if (upgradeIndex < 0) return;
      const recommendedOperations = currentOperations.slice();
      recommendedOperations[upgradeIndex] = ferryOperation;
      const recommendedPreview = await requestDraftPreview(
        islandId,
        version,
        recommendedOperations,
        proposalSettings,
        abortController.signal
      );
      const resolvedSourcePreview = sourcePreview ?? (await context?.sourcePreviewPromise);
      if (!resolvedSourcePreview) throw new Error('The original proposal preview was unavailable.');
      if (
        recommendationRequest !== requestToken ||
        recommendationKey !== key ||
        selectedIslandId !== islandId ||
        !proposalMode ||
        (context?.expectedProposalRequest !== undefined && proposalRequest > context.expectedProposalRequest) ||
        (context?.expectedProposalRequest === undefined &&
          activeBaarahHospitalUpgrade()?.operationId !== upgrade.operationId)
      )
        return;
      const sourceCosts = resolvedSourcePreview.costs;
      if (!sourceCosts.complete || !recommendedPreview.costs.complete)
        throw new Error('Complete cost allowances are required before comparing this recommendation.');
      const originalCapital = sourceCosts.capital;
      const originalAnnual = sourceCosts.annual;
      const recommendedCapital = recommendedPreview.costs.capital;
      const recommendedAnnual = recommendedPreview.costs.annual;
      const recommendation: ProposalRecommendation = {
        accessibilityImprovementPercent: Math.max(
          0,
          Math.round(((currentJourneyMinutes - recommendedJourneyMinutes) / currentJourneyMinutes) * 100)
        ),
        currentJourneyMinutes,
        recommendedJourneyMinutes,
        originalCapital,
        recommendedCapital,
        capitalSavings: Math.max(0, originalCapital - recommendedCapital),
        originalAnnual,
        recommendedAnnual,
        annualSavings: Math.max(0, originalAnnual - recommendedAnnual)
      };
      proposalRecommendation = recommendation;
      recommendationOperation = ferryOperation;
      cacheBaarahRecommendation(key, {
        recommendation,
        operation: ferryOperation
      });
    } catch (error) {
      if (recommendationRequest === requestToken && recommendationKey === key) {
        proposalRecommendation = null;
        recommendationOperation = null;
        proposalError =
          error instanceof Error ? error.message : 'The data wizard recommendation could not be evaluated.';
      }
    } finally {
      if (recommendationRequest === requestToken && recommendationKey === key) recommendationPending = false;
      if (recommendationAbortController === abortController) recommendationAbortController = null;
    }
  }

  async function applyBaarahRecommendation(): Promise<void> {
    const upgrade = activeBaarahHospitalUpgrade();
    if (!upgrade || recommendationOperation?.kind !== 'add_ferry_service' || !editableProposal) return;
    await applyTransportOperation(recommendationOperation, upgrade.operationId);
  }

  async function applyTransportOperation(
    operation: ProposalTransportOperation,
    replacementOperationId: string | null = null
  ): Promise<void> {
    if (!selectedIslandId || !islandServices?.baselineVersion) {
      proposalError = 'Select an island before applying a transport change.';
      return;
    }
    const operations = draftOperations.slice(0, draftCursor);
    const editingId = transportEditorOperation?.operationId;
    const replacedOperationId = replacementOperationId;
    if (replacedOperationId && !operations.some((entry) => entry.operationId === replacedOperationId)) {
      proposalError =
        'The hospital upgrade changed while the recommendation was being reviewed. Reopen the recommendation.';
      transportEditorOperation = null;
      return;
    }
    const replacement = { ...operation, operationId: editingId ?? operation.operationId } as ProposalTransportOperation;
    const targetId = replacedOperationId ?? editingId;
    const targetIndex = targetId ? operations.findIndex((entry) => entry.operationId === targetId) : operations.length;
    const nextOperations = operations.filter(
      (entry) => entry.operationId !== editingId && entry.operationId !== replacedOperationId
    );
    nextOperations.splice(Math.min(Math.max(targetIndex, 0), nextOperations.length), 0, replacement);
    const previousOperations = draftOperations.slice(0, draftCursor);
    const applied = await previewDraftHistory(nextOperations, nextOperations.length);
    if (!applied) return;
    recommendationUndoOperations = previousOperations;
    transportEditorOperation = null;
    proposalRecommendation = null;
    recommendationOperation = null;
    recommendationKey = null;
    proposalLastMessage = replacedOperationId
      ? 'Recommended ferry applied and the hospital upgrade removed.'
      : 'Transport route added to the proposal.';
  }

  function editTransportOperation(operationId: string): void {
    clearTransportEditState();
    const operation = draftOperations.slice(0, draftCursor).find((entry) => entry.operationId === operationId);
    if (operation?.kind === 'add_bus_service' || operation?.kind === 'add_ferry_service') {
      transportEditorOperation = operation;
    }
  }

  function removeTransportOperation(operationId: string): void {
    clearTransportEditState();
    const operations = draftOperations.slice(0, draftCursor);
    const nextOperations = operations.filter((entry) => entry.operationId !== operationId);
    recommendationUndoOperations = operations;
    transportEditorOperation = null;
    void previewDraftHistory(nextOperations, nextOperations.length);
  }

  function ignoreBaarahRecommendation(): void {
    ignoredRecommendationOperationId = activeBaarahHospitalUpgrade()?.operationId ?? null;
    proposalRecommendation = null;
    recommendationOperation = null;
    recommendationKey = null;
    recommendationStarting = false;
    recommendationPending = false;
  }

  async function updateProposalSettings(settings: ProposalSettings): Promise<void> {
    if (!editableProposal || proposalPending) return;
    clearTransportEditState();
    proposalSettings = settings;
    const refreshed = await previewDraftHistory([...draftOperations], draftCursor);
    if (!refreshed) proposalError = proposalError ?? 'Budget limits could not be updated.';
  }

  function changeDraftHistory(direction: -1 | 1): void {
    if (!editableProposal) return;
    if (direction === -1 && recommendationUndoOperations) {
      const operations = recommendationUndoOperations;
      recommendationUndoOperations = null;
      void previewDraftHistory(operations, operations.length);
      return;
    }
    const cursor = draftCursor + direction;
    if (cursor < 0 || cursor > draftOperations.length) return;
    void previewDraftHistory([...draftOperations], cursor);
  }

  function resetProposalDraft(): void {
    if (!editableProposal || proposalPending || !selectedIslandId) return;
    if (!window.confirm('Reset this proposal? All draft changes and custom cost estimates will be removed.')) return;
    closeServicePopup();
    stopMoveMode();
    stopAddServiceMode();
    clearTransportEditState();
    draftOperations = [];
    draftCursor = 0;
    draftPreview = null;
    proposalRecommendation = null;
    recommendationOperation = null;
    ignoredRecommendationOperationId = null;
    recommendationPending = false;
    recommendationStarting = false;
    recommendationKey = null;
    recommendationUndoOperations = null;
    transportEditorOperation = null;
    proposalSettings = { ...DEFAULT_PROPOSAL_SETTINGS };
    proposalError = null;
    proposalLastMessage = 'Draft reset. Island defaults restored.';
  }

  function proposalTransportCollection() {
    return {
      type: 'FeatureCollection' as const,
      features: (proposalView === 'proposal' ? (proposalPreview?.transportPlans ?? []) : []).flatMap((plan) =>
        plan.geometry.coordinates.map((coordinates, index) => ({
          type: 'Feature' as const,
          id: `${plan.operationId}:${index}`,
          properties: { operationId: plan.operationId, mode: plan.mode },
          geometry: { type: 'LineString' as const, coordinates }
        }))
      )
    };
  }

  function syncProposalTransportLayers(): void {
    if (!mapInstance) return;
    const data = proposalTransportCollection();
    const source = mapInstance.getSource(PROPOSAL_TRANSPORT_SOURCE_ID) as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else mapInstance.addSource(PROPOSAL_TRANSPORT_SOURCE_ID, { type: 'geojson', data });
    if (!mapInstance.getLayer(PROPOSAL_TRANSPORT_LINE_LAYER_ID)) {
      mapInstance.addLayer({
        id: PROPOSAL_TRANSPORT_LINE_LAYER_ID,
        type: 'line',
        source: PROPOSAL_TRANSPORT_SOURCE_ID,
        paint: {
          'line-color': ['match', ['get', 'mode'], 'ferry', '#2563eb', '#18181b'],
          'line-width': 5,
          'line-opacity': 0.92,
          'line-dasharray': [1.5, 1]
        }
      });
    }
  }

  function setProposalView(value: string): void {
    if (value !== 'baseline' && value !== 'proposal') return;
    closeServicePopup();
    stopMoveMode();
    stopAddServiceMode();
    proposalView = value;
    syncProposalTransportLayers();
  }

  function upgradeService(service: IslandMapService, targetSubtype: string): void {
    if (!service.eligibility?.canUpgrade) return;
    void applyDraftOperation({
      operationId: operationId(),
      kind: 'upgrade_service',
      serviceId: service.id,
      targetSubtype
    });
  }

  function downgradeService(service: IslandMapService, targetSubtype: string): void {
    if (!service.eligibility?.canDowngrade) return;
    void applyDraftOperation({
      operationId: operationId(),
      kind: 'downgrade_service',
      serviceId: service.id,
      targetSubtype
    });
  }

  function deleteService(service: IslandMapService): void {
    if (!service.eligibility?.canDelete) return;
    void applyDraftOperation({
      operationId: operationId(),
      kind: 'delete_service',
      serviceId: service.id
    });
  }

  function applyAddServiceAt(coordinates: Coordinate, selection: AddServiceSelection): void {
    void applyDraftOperation({
      operationId: operationId(),
      kind: 'add_service',
      serviceType: selection.serviceType,
      subtype: selection.subtype,
      coordinates,
      name: selection.name ?? undefined
    });
  }

  function parseServiceDragPayload(value: string | null): AddServiceSelection | null {
    if (!value) return null;

    try {
      const candidate = JSON.parse(value) as { serviceType?: unknown; subtype?: unknown };
      if (typeof candidate.serviceType !== 'string' || typeof candidate.subtype !== 'string') return null;
      const entry = serviceCatalogEntry(candidate.serviceType, candidate.subtype);
      if (!entry) return null;
      return { serviceType: entry.serviceType, subtype: entry.subtype, name: null };
    } catch {
      return null;
    }
  }

  function handleMapDragOver(event: DragEvent): void {
    if (!editableProposal || !selectedIslandId) return;
    if (!event.dataTransfer?.types.includes(SERVICE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleMapDrop(event: DragEvent): void {
    if (!mapInstance || !editableProposal || !selectedIslandId) return;
    const selection = parseServiceDragPayload(event.dataTransfer?.getData(SERVICE_DRAG_MIME) ?? null);
    if (!selection) return;

    event.preventDefault();
    const bounds = mapElement.getBoundingClientRect();
    const point = mapInstance.unproject([event.clientX - bounds.left, event.clientY - bounds.top]);
    suppressMapClickUntil = Date.now() + 300;
    startAddService(selection);
    applyAddServiceAt([point.lng, point.lat], selection);
  }

  function handleMapProposalClick(event: MapMouseEvent): void {
    if (!editableProposal) return;
    if (Date.now() < suppressMapClickUntil) return;

    if (addServiceDraft) {
      applyAddServiceAt([event.lngLat.lng, event.lngLat.lat], addServiceDraft);
      return;
    }

    if (!moveServiceId) return;
    void applyDraftOperation({
      operationId: operationId(),
      kind: 'move_service',
      serviceId: moveServiceId,
      coordinates: [event.lngLat.lng, event.lngLat.lat]
    });
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
        onClose: () => popup.remove(),
        proposalMode: editableProposal,
        onUpgrade: (targetSubtype: string) => upgradeService(service, targetSubtype),
        onDowngrade: (targetSubtype: string) => downgradeService(service, targetSubtype),
        onMove: () => startMoveService(service),
        onDelete: () => deleteService(service)
      }
    });
    popup.on('close', () => {
      if (activeServicePopup?.popup !== popup) return;
      activeServicePopup = null;
      void unmount(component);
    });
    activeServicePopup = { serviceId: service.id, popup, component };
    popup.setLngLat(service.coordinates).setDOMContent(popupElement).addTo(mapInstance);
  }

  function removeServiceMarkers(animate = false): void {
    closeServicePopup();
    disposeMountedServiceMarkers(animate);
    serviceMarkerServices = new SvelteMap();
    setSourceData(SERVICE_MARKER_SOURCE_ID, EMPTY_SERVICE_MARKERS);
    scheduleServiceMarkerSync();
  }

  function renderServiceMarkers(
    data: IslandServicesResponse,
    services: readonly IslandMapService[] = data.services
  ): void {
    if (!mapInstance || !maplibreMarkerConstructor) return;
    if (activeServicePopup) closeServicePopup();
    const visibleServices = filterServicesToSelectedIsland(services).filter((service) =>
      isValidCoordinate(service.coordinates)
    );
    serviceMarkerServices = new SvelteMap<string, IslandMapService>(
      visibleServices.flatMap((service) => (service.coordinates ? [[service.id, service] as const] : []))
    );
    setSourceData(SERVICE_MARKER_SOURCE_ID, serviceMarkerCollection(visibleServices));
    scheduleServiceMarkerSync();
  }

  function filterServicesToSelectedIsland(services: readonly IslandMapService[]): IslandMapService[] {
    if (!selectedIslandId) return [...services];

    const island = islandCollection.features.find((feature) => feature.properties.id === selectedIslandId);
    if (!island) return [...services];

    return services.filter(
      (service) =>
        !service.coordinates ||
        pointWithinGeometryGrace(service.coordinates, island.geometry, SELECTED_SERVICE_MARKER_GRACE_METERS)
    );
  }

  function mountIndividualServiceMarker(service: IslandMapService): MountedServiceMarker | null {
    if (!mapInstance || !maplibreMarkerConstructor || !service.coordinates) return null;
    const host = document.createElement('div');
    const component = mount(ServiceMapMarker, {
      target: host,
      props: {
        serviceType: service.serviceType,
        label: serviceMarkerLabel(service),
        presentationTarget:
          service.id === 'facility:health:362'
            ? 'tree-top-marker'
            : selectedIslandId === BAARAH_ISLAND_ID && service.id === BAARAH_HEALTH_CENTRE_SERVICE_ID
              ? 'baarah-health-centre'
              : undefined,
        onSelect: () => {
          const current = serviceMarkerServices.get(service.id);
          if (!current) return;
          openServicePopup(current);
        }
      }
    });
    const marker = new maplibreMarkerConstructor({ element: host, anchor: 'center' });
    marker.getElement().style.zIndex = '10';
    marker.setLngLat(service.coordinates).addTo(mapInstance);
    const mounted: MountedServiceMarker = {
      key: `service:${service.id}`,
      signature: `service:${service.id}:${service.serviceType}:${serviceMarkerLabel(service)}`,
      kind: 'service',
      marker,
      component
    };
    updateMountedServiceMarkerScale(mounted);
    return mounted;
  }

  function mountClusterMarker(cluster: ClusterMarkerData): MountedServiceMarker | null {
    if (!mapInstance || !maplibreMarkerConstructor) return null;
    const host = document.createElement('div');
    const component = mount(ServiceClusterMarker, {
      target: host,
      props: {
        total: cluster.total,
        healthCount: cluster.healthCount,
        educationCount: cluster.educationCount,
        transportCount: cluster.transportCount,
        label: clusterMarkerLabel(cluster),
        onSelect: () => void expandServiceCluster(cluster)
      }
    });
    const marker = new maplibreMarkerConstructor({ element: host, anchor: 'center' });
    marker.getElement().style.zIndex = '11';
    marker.setLngLat(cluster.coordinates).addTo(mapInstance);
    const mounted: MountedServiceMarker = {
      key: `cluster:${cluster.clusterId}`,
      signature: `cluster:${cluster.clusterId}:${cluster.total}:${cluster.healthCount}:${cluster.educationCount}:${cluster.transportCount}`,
      kind: 'cluster',
      marker,
      component
    };
    updateMountedServiceMarkerScale(mounted);
    return mounted;
  }

  function syncServiceMarkers(): void {
    if (!mapInstance || !maplibreMarkerConstructor || !mapInstance.getSource(SERVICE_MARKER_SOURCE_ID)) return;

    const desired = new SvelteMap<string, DesiredServiceMarker>();
    const features = mapInstance.querySourceFeatures(SERVICE_MARKER_SOURCE_ID) as ServiceMarkerQueryFeature[];
    for (const feature of features) {
      const properties = feature.properties ?? {};
      const isCluster = properties.cluster === true || properties.cluster === 'true';
      if (isCluster) {
        const cluster = clusterMarkerData(feature);
        if (!cluster) continue;
        desired.set(`cluster:${cluster.clusterId}`, {
          key: `cluster:${cluster.clusterId}`,
          signature: `cluster:${cluster.clusterId}:${cluster.total}:${cluster.healthCount}:${cluster.educationCount}:${cluster.transportCount}`,
          kind: 'cluster',
          cluster
        });
        continue;
      }

      const serviceId = typeof properties.serviceId === 'string' ? properties.serviceId : null;
      const service = serviceId ? serviceMarkerServices.get(serviceId) : undefined;
      const coordinates = markerFeatureCoordinates(feature);
      if (!service || !coordinates) continue;
      desired.set(`service:${service.id}`, {
        key: `service:${service.id}`,
        signature: `service:${service.id}:${service.serviceType}:${serviceMarkerLabel(service)}`,
        kind: 'service',
        coordinates,
        service
      });
    }

    if (activeServicePopup && !desired.has(`service:${activeServicePopup.serviceId}`)) closeServicePopup();

    for (const [key, mounted] of mountedServiceMarkers) {
      const next = desired.get(key);
      if (!next || next.signature !== mounted.signature || next.kind !== mounted.kind) {
        removeMountedServiceMarker(mounted);
        mountedServiceMarkers.delete(key);
      }
    }

    for (const [key, next] of desired) {
      const current = mountedServiceMarkers.get(key);
      if (current) {
        current.marker.setLngLat(next.kind === 'service' ? next.coordinates : next.cluster.coordinates);
        updateMountedServiceMarkerScale(current);
        continue;
      }

      const mounted =
        next.kind === 'service' ? mountIndividualServiceMarker(next.service) : mountClusterMarker(next.cluster);
      if (mounted) mountedServiceMarkers.set(key, mounted);
    }
  }

  async function expandServiceCluster(cluster: ClusterMarkerData): Promise<void> {
    if (!mapInstance) return;
    const source = mapInstance.getSource(SERVICE_MARKER_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    closeServicePopup();
    try {
      const expansionZoom = await source.getClusterExpansionZoom(cluster.clusterId);
      if (!mapInstance) return;
      const reducedMotion = prefersReducedMotion.current;
      mapInstance.easeTo({
        center: cluster.coordinates,
        zoom: Math.min(expansionZoom, mapInstance.getMaxZoom()),
        duration: reducedMotion ? 0 : 420,
        essential: !reducedMotion
      });
    } catch {
      scheduleServiceMarkerSync();
    }
  }

  function setSourceData(sourceId: string, data: unknown): void {
    (mapInstance?.getSource(sourceId) as { setData: (value: unknown) => void } | undefined)?.setData(data);
  }

  function setLayerOpacity(layerId: string, property: 'fill-opacity' | 'line-opacity', value: number): void {
    if (mapInstance?.getLayer(layerId)) mapInstance.setPaintProperty(layerId, property, value as never);
  }

  function setLayerColor(layerId: string, property: 'fill-color' | 'fill-outline-color', value: string): void {
    if (mapInstance?.getLayer(layerId)) mapInstance.setPaintProperty(layerId, property, value as never);
  }

  function mixHexColors(start: string, end: string, progress: number): string {
    const clampedProgress = Math.min(1, Math.max(0, progress));
    const startRgb = [0, 2, 4].map((index) => Number.parseInt(start.slice(index + 1, index + 3), 16));
    const endRgb = [0, 2, 4].map((index) => Number.parseInt(end.slice(index + 1, index + 3), 16));
    const channels = startRgb.map((channel, index) =>
      Math.round(channel + ((endRgb[index] ?? channel) - channel) * clampedProgress)
    );
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  function selectedIslandLoadingColor(progress: number): string {
    const clampedProgress = Math.min(1, Math.max(0, progress));
    if (clampedProgress <= 0.5) {
      return mixHexColors(SELECTED_ISLAND_LOADING_START_COLOR, SELECTED_ISLAND_LOADING_MID_COLOR, clampedProgress * 2);
    }
    return mixHexColors(
      SELECTED_ISLAND_LOADING_MID_COLOR,
      SELECTED_ISLAND_LOADING_END_COLOR,
      (clampedProgress - 0.5) * 2
    );
  }

  function setLayerVisibility(layerId: string, visibility: 'visible' | 'none'): void {
    if (mapInstance?.getLayer(layerId)) mapInstance.setLayoutProperty(layerId, 'visibility', visibility);
  }

  function setLayerFilter(layerId: string, filter: unknown): void {
    if (mapInstance?.getLayer(layerId)) mapInstance.setFilter(layerId, filter as never);
  }

  function setBaseRoadVisibility(visibility: 'visible' | 'none'): void {
    for (const layerId of baseRoadLayerIds) setLayerVisibility(layerId, visibility);
  }

  function hideSelectedIslandFill(): void {
    setLayerVisibility('selected-island-fill', 'none');
    setLayerOpacity('selected-island-fill', 'fill-opacity', 0);
  }

  function showSelectedIslandFill(): void {
    setLayerVisibility('selected-island-fill', 'visible');
    setLayerOpacity('selected-island-fill', 'fill-opacity', SELECTED_ISLAND_FILL_OPACITY);
  }

  function stopSelectedIslandLoadingPulse(): void {
    if (selectedIslandLoadingTimer !== null) {
      window.clearTimeout(selectedIslandLoadingTimer);
      selectedIslandLoadingTimer = null;
    }
    setLayerColor('selected-island-loading', 'fill-color', SELECTED_ISLAND_LOADING_START_COLOR);
    setLayerColor('selected-island-loading', 'fill-outline-color', SELECTED_ISLAND_LOADING_START_COLOR);
    setLayerVisibility('selected-island-loading', 'none');
    setLayerOpacity('selected-island-loading', 'fill-opacity', 0);
  }

  function startSelectedIslandLoadingPulse(): void {
    if (!mapInstance?.getLayer('selected-island-loading')) return;
    hideSelectedIslandFill();
    setLayerVisibility('selected-island-loading', 'visible');
    setLayerColor('selected-island-loading', 'fill-color', SELECTED_ISLAND_LOADING_START_COLOR);
    setLayerColor('selected-island-loading', 'fill-outline-color', SELECTED_ISLAND_LOADING_START_COLOR);
    setLayerOpacity('selected-island-loading', 'fill-opacity', SELECTED_ISLAND_LOADING_MIN_OPACITY);

    if (prefersReducedMotion.current) {
      if (selectedIslandLoadingTimer !== null) {
        window.clearTimeout(selectedIslandLoadingTimer);
        selectedIslandLoadingTimer = null;
      }
      setLayerOpacity(
        'selected-island-loading',
        'fill-opacity',
        (SELECTED_ISLAND_LOADING_MIN_OPACITY + SELECTED_ISLAND_LOADING_MAX_OPACITY) / 2
      );
      const reducedMotionColor = selectedIslandLoadingColor(0.5);
      setLayerColor('selected-island-loading', 'fill-color', reducedMotionColor);
      setLayerColor('selected-island-loading', 'fill-outline-color', reducedMotionColor);
      return;
    }

    if (!selectedIslandLoading || selectedIslandLoadingTimer !== null) return;
    const startedAt = performance.now();
    const pulse = () => {
      if (!selectedIslandLoading || !mapInstance?.getLayer('selected-island-loading')) {
        selectedIslandLoadingTimer = null;
        return;
      }

      const now = performance.now();
      const progress = (1 - Math.cos(((now - startedAt) / SELECTED_ISLAND_LOADING_CYCLE) * Math.PI * 2)) / 2;
      const loadingColor = selectedIslandLoadingColor(progress);
      setLayerColor('selected-island-loading', 'fill-color', loadingColor);
      setLayerColor('selected-island-loading', 'fill-outline-color', loadingColor);
      setLayerOpacity(
        'selected-island-loading',
        'fill-opacity',
        SELECTED_ISLAND_LOADING_MIN_OPACITY +
          progress * (SELECTED_ISLAND_LOADING_MAX_OPACITY - SELECTED_ISLAND_LOADING_MIN_OPACITY)
      );
      selectedIslandLoadingTimer = window.setTimeout(pulse, SELECTED_ISLAND_LOADING_INTERVAL);
    };

    pulse();
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
    if (!feature || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      return ['==', ['get', 'class'], ''];
    }

    return [...osmRoadFilter(), ['within', feature.geometry]];
  }

  function demandStatusProperty(category: IslandDemandCategory): string {
    if (category === 'health') return 'healthStatus';
    if (category === 'education') return 'educationStatus';
    if (category === 'transport') return 'transportStatus';
    return 'allStatus';
  }

  function demandDeltaProperty(category: IslandDemandCategory): string {
    if (category === 'health') return 'healthDelta';
    if (category === 'education') return 'educationDelta';
    if (category === 'transport') return 'transportDelta';
    return 'allDelta';
  }

  function proposalDeltaHexes(baseline: IslandServiceHexes, projected: IslandServiceHexes): IslandServiceHexes {
    const baselineById = new Map(baseline.features.map((feature) => [feature.id, feature.properties]));
    return {
      ...projected,
      features: projected.features.map((feature) => {
        const before = baselineById.get(feature.id);
        const healthDelta = feature.properties.healthWeight - (before?.healthWeight ?? 0);
        const educationDelta = feature.properties.educationWeight - (before?.educationWeight ?? 0);
        const transportDelta = feature.properties.transportWeight - (before?.transportWeight ?? 0);
        const deltas = [healthDelta, educationDelta, transportDelta];
        const allDelta = deltas.reduce((largest, value) => (Math.abs(value) > Math.abs(largest) ? value : largest), 0);
        return {
          ...feature,
          properties: {
            ...feature.properties,
            healthDelta,
            educationDelta,
            transportDelta,
            allDelta
          }
        };
      })
    };
  }

  function scheduleProposalHeatmap(baseline: IslandServiceHexes, projected: IslandServiceHexes): void {
    const task = ++proposalHeatmapTask;
    proposalHeatmapHexes = lastProposalHeatmapHexes ?? baseline;
    const update = () => {
      if (task !== proposalHeatmapTask || !proposalMode || !draftPreview) return;
      proposalHeatmapHexes = proposalDeltaHexes(baseline, projected);
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(update, { timeout: 250 });
    else window.setTimeout(update, 0);
  }

  function demandColorExpression(category: IslandDemandCategory): unknown[] {
    if (proposalMode && proposalView === 'proposal' && draftPreview) {
      const deltaProperty = demandDeltaProperty(category);
      return [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', deltaProperty], 0],
        -0.2,
        '#16a34a',
        -0.02,
        '#86efac',
        0,
        '#f4f4f5',
        0.02,
        '#fdba74',
        0.2,
        '#dc2626'
      ];
    }
    const weightProperty = demandWeightProperty(category);
    const statusProperty = demandStatusProperty(category);
    return [
      'case',
      ['==', ['get', statusProperty], 'unavailable'],
      '#edf8e9',
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', weightProperty], 0],
        0,
        '#e5f5e0',
        0.01,
        '#a1d99b',
        0.03,
        '#d9ef8b',
        0.06,
        '#fee08b',
        0.1,
        '#fdae61',
        0.16,
        '#f97316',
        0.22,
        '#ef4444',
        0.3,
        '#dc2626'
      ]
    ];
  }

  function demandRevealOpacityExpression(progress: number): unknown[] {
    const clampedProgress = Math.min(1, Math.max(0, progress));
    const waveHead = Math.min(1.001, clampedProgress + 0.001);
    const waveTail = Math.max(0, clampedProgress - SELECTED_DEMAND_REVEAL_WAVE_WIDTH);
    return ['interpolate', ['linear'], ['coalesce', ['get', 'revealPhase'], 0], waveTail, 1, waveHead, 0];
  }

  function demandFillOpacityExpression(category: IslandDemandCategory, multiplier = 1, revealProgress = 1): unknown[] {
    if (proposalMode && proposalView === 'proposal' && draftPreview) {
      const deltaProperty = demandDeltaProperty(category);
      return [
        '*',
        multiplier,
        ['interpolate', ['linear'], ['abs', ['coalesce', ['get', deltaProperty], 0]], 0, 0.08, 0.02, 0.45, 0.2, 0.9]
      ];
    }
    const weightProperty = demandWeightProperty(category);
    const statusProperty = demandStatusProperty(category);
    const opacity = [
      'case',
      ['==', ['get', statusProperty], 'unavailable'],
      0.16,
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', weightProperty], 0],
        0,
        0.18,
        0.01,
        0.28,
        0.03,
        0.4,
        0.06,
        0.55,
        0.1,
        0.7,
        0.16,
        0.88,
        0.22,
        0.96,
        0.3,
        1
      ]
    ];
    const weightedOpacity = multiplier === 1 ? opacity : ['*', opacity, multiplier];
    return revealProgress >= 1
      ? weightedOpacity
      : ['*', weightedOpacity, demandRevealOpacityExpression(revealProgress)];
  }

  function demandAvailabilityFilter(category: IslandDemandCategory): FilterSpecification {
    return ['has', demandStatusProperty(category)];
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

  function setDemandHexOpacity(multiplier: number, revealProgress = demandRevealProgress): void {
    if (!mapInstance?.getLayer('selected-service-demand-hexes')) return;
    mapInstance.setPaintProperty(
      'selected-service-demand-hexes',
      'fill-opacity',
      demandFillOpacityExpression(selectedDemandCategory, multiplier, revealProgress) as never
    );
  }

  function stopDemandHeatmapReveal(): void {
    demandRevealToken += 1;
    if (demandRevealTimer !== null) {
      window.clearTimeout(demandRevealTimer);
      demandRevealTimer = null;
    }
    demandRevealProgress = 1;
  }

  function startDemandHeatmapReveal(hexes: IslandServiceHexes, islandId: string): void {
    stopDemandHeatmapReveal();
    lastProposalHeatmapHexes = hexes;
    setSourceData('selected-service-hexes', hexes);

    if (prefersReducedMotion.current || hexes.features.length === 0) {
      demandRevealProgress = 1;
      setDemandHexOpacity(SELECTED_DEMAND_HEX_OPACITY, 1);
      return;
    }

    demandRevealProgress = 0;
    setDemandHexOpacity(SELECTED_DEMAND_HEX_OPACITY, demandRevealProgress);
    const token = demandRevealToken;
    const startedAt = performance.now();
    const reveal = () => {
      if (token !== demandRevealToken || selectedIslandId !== islandId || !mapInstance) {
        demandRevealTimer = null;
        return;
      }

      const progress = Math.min(1, (performance.now() - startedAt) / SELECTED_DEMAND_REVEAL_DURATION);
      demandRevealProgress = progress;
      setDemandHexOpacity(SELECTED_DEMAND_HEX_OPACITY, progress);
      if (progress >= 1) {
        demandRevealProgress = 1;
        demandRevealTimer = null;
        setDemandHexOpacity(SELECTED_DEMAND_HEX_OPACITY, 1);
        return;
      }
      demandRevealTimer = window.setTimeout(reveal, SELECTED_DEMAND_REVEAL_INTERVAL);
    };

    reveal();
  }

  function applySelectedIslandMask(id: string): void {
    if (!mapInstance) return;
    setBaseRoadVisibility('visible');
    mapInstance.setFilter('island-fill', ['==', ['get', 'id'], '']);
    mapInstance.setFilter('national-score-fields', ['==', ['get', 'islandId'], '']);
    mapInstance.setFilter('island-outline', ['==', ['get', 'id'], '']);
    mapInstance.setFilter('island-labels', ['==', ['get', 'id'], '']);
    mapInstance.setFilter('selected-island-fill', ['==', ['get', 'id'], id]);
    mapInstance.setFilter('selected-island-loading', ['==', ['get', 'id'], id]);
    mapInstance.setFilter('selected-island-outline', ['==', ['get', 'id'], id]);
    mapInstance.setFilter('selected-service-demand-hexes', demandAvailabilityFilter(selectedDemandCategory));
    setSourceData('selected-island-mask', selectedIslandMask(id));
    const roadFilter = selectedIslandRoadFilter(id);
    setLayerFilter('selected-island-road-casing', roadFilter);
    setLayerFilter('selected-island-road-inner', roadFilter);
    setLayerVisibility('selected-island-road-casing', 'visible');
    setLayerVisibility('selected-island-road-inner', 'visible');
  }

  function prepareSelectedIslandOverlay(id: string): void {
    stopDemandHeatmapReveal();
    setSourceData('selected-service-hexes', EMPTY_SERVICE_HEXES);
    removeServiceMarkers(true);
    applySelectedIslandMask(id);
    hideSelectedIslandFill();
    startSelectedIslandLoadingPulse();
    fadeLayerTo('selected-island-fill', 'fill-opacity', SELECTED_ISLAND_FILL_OPACITY, id);
    fadeLayerTo('selected-island-outline', 'line-opacity', 1, id);
    setDemandHexOpacity(0);
  }

  function resetSelectedIslandOverlay(): void {
    stopDemandHeatmapReveal();
    removeServiceMarkers(true);
    stopSelectedIslandLoadingPulse();
    hideSelectedIslandFill();
    if (!mapInstance) return;
    mapInstance.setFilter('island-fill', null);
    mapInstance.setFilter('national-score-fields', null);
    mapInstance.setFilter('island-outline', null);
    mapInstance.setFilter('island-labels', null);
    mapInstance.setFilter('selected-island-fill', ['==', ['get', 'id'], '']);
    mapInstance.setFilter('selected-island-loading', ['==', ['get', 'id'], '']);
    mapInstance.setFilter('selected-island-outline', ['==', ['get', 'id'], '']);
    mapInstance.setFilter('selected-service-demand-hexes', ['==', ['get', 'allStatus'], '']);
    setLayerFilter('selected-island-road-casing', ['==', ['get', 'class'], '']);
    setLayerFilter('selected-island-road-inner', ['==', ['get', 'class'], '']);
    setLayerVisibility('selected-island-road-casing', 'none');
    setLayerVisibility('selected-island-road-inner', 'none');
    setBaseRoadVisibility('visible');
    setSourceData('selected-island-mask', EMPTY_SELECTED_ISLAND_MASK);
    setSourceData('selected-service-hexes', EMPTY_SERVICE_HEXES);
    setLayerOpacity('selected-island-fill', 'fill-opacity', 0);
    setLayerOpacity('selected-island-outline', 'line-opacity', 0);
    setDemandHexOpacity(0);
  }

  async function loadIslandServices(id: string): Promise<void> {
    const requestId = ++islandServicesRequest;
    proposalRequest += 1;
    clearTransportEditState();
    proposalPending = false;
    draftPreview = null;
    draftOperations = [];
    draftCursor = 0;
    proposalError = null;
    proposalLastMessage = null;
    islandServices = null;
    islandServicesLoading = true;
    islandServicesError = null;
    try {
      const cachedServices = proposalMode ? null : islandServicesCache.get(id);
      if (cachedServices) {
        if (requestId !== islandServicesRequest) return;
        islandServices = cachedServices;
        applySelectedIslandMask(id);
        startDemandHeatmapReveal(cachedServices.hexes, id);
        renderServiceMarkers(cachedServices);
        return;
      }
      const fastProposalServices = proposalMode ? '?includeResidentialDemandPoints=false' : '';
      const response = await fetch(`/api/v1/islands/${encodeURIComponent(id)}/services${fastProposalServices}`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Island services request failed with status ${response.status}`);
      const data = (await response.json()) as IslandServicesResponse;
      if (requestId !== islandServicesRequest) return;
      if (!proposalMode) islandServicesCache.set(id, data);
      islandServices = data;
      if (id === BAARAH_ISLAND_ID) {
        void recommendationOptions(BAARAH_ISLAND_ID, data.baselineVersion ?? 'unknown').catch(() => {
          // The recommendation request will retry if the transport options are unavailable during warm-up.
        });
      }
      applySelectedIslandMask(id);
      startDemandHeatmapReveal(data.hexes, id);
      renderServiceMarkers(data);
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
    if (category === 'health') return 'Healthcare';
    if (category === 'education') return 'Education';
    if (category === 'transport') return 'Transport';
    return 'All';
  }

  $effect(() => {
    if (!mapReady || !mapInstance?.getLayer('selected-service-demand-hexes')) return;
    mapInstance.setPaintProperty(
      'selected-service-demand-hexes',
      'fill-color',
      demandColorExpression(selectedDemandCategory) as never
    );
    mapInstance.setPaintProperty(
      'selected-service-demand-hexes',
      'fill-opacity',
      demandFillOpacityExpression(selectedDemandCategory, SELECTED_DEMAND_HEX_OPACITY, demandRevealProgress) as never
    );
    mapInstance.setFilter('selected-service-demand-hexes', demandAvailabilityFilter(selectedDemandCategory) as never);
  });

  $effect(() => {
    if (!mapReady || !mapInstance) return;
    if (selectedIslandLoading) {
      startSelectedIslandLoadingPulse();
      return;
    }

    stopSelectedIslandLoadingPulse();
    if (selectedIslandId) showSelectedIslandFill();
    else hideSelectedIslandFill();
  });

  $effect(() => {
    if (!mapReady || !displayedServices || displayedServices.island.id !== selectedIslandId) return;
    // Comparison switches use settled opacity, so animation cannot imply a change in pressure.
    if (proposalMode) {
      stopDemandHeatmapReveal();
      if (displayedServices.hexes !== lastProposalHeatmapHexes) {
        setSourceData('selected-service-hexes', displayedServices.hexes);
        lastProposalHeatmapHexes = displayedServices.hexes;
      }
      setDemandHexOpacity(SELECTED_DEMAND_HEX_OPACITY, 1);
    }
    renderServiceMarkers(displayedServices);
    syncProposalTransportLayers();
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
        layers: [{ id: 'fallback-background', type: 'background', paint: { 'background-color': '#f4f4f5' } }]
      };
    }

    const baseLayers = Array.isArray(baseStyle.layers)
      ? baseStyle.layers.filter((layer) => layer.type !== 'symbol')
      : [];
    const isRoadLayer = (layer: (typeof baseLayers)[number]): boolean =>
      (layer.type === 'line' || layer.type === 'fill') && layer['source-layer'] === 'transportation';
    const layersBeforeRoads = baseLayers.filter((layer) => !isRoadLayer(layer));
    const roadLayers = baseLayers.filter(isRoadLayer);
    baseRoadLayerIds = roadLayers.flatMap((layer) => (typeof layer.id === 'string' ? [layer.id] : []));
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
              'line-color': '#52525b',
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
              'line-color': '#fafafa',
              'line-opacity': 0.96,
              'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 8, 0.55, 11, 1.3, 14, 2.6]
            }
          }
        ]
      : [];
    const scoreColor = [
      'case',
      ['==', ['get', 'scoreStatus'], 'unavailable'],
      '#a1a1aa',
      [
        'step',
        ['coalesce', ['get', 'score'], 0],
        SCORE_MOODS[0].color,
        ...SCORE_MOODS.slice(1).flatMap((mood) => [mood.min, mood.color])
      ]
    ];

    return {
      ...baseStyle,
      sources: {
        ...(baseStyle.sources ?? {}),
        islands: { type: 'geojson', data: EMPTY_ISLAND_COLLECTION },
        'score-fields': { type: 'geojson', data: EMPTY_SCORE_FIELD_COLLECTION },
        'selected-service-hexes': { type: 'geojson', data: EMPTY_SERVICE_HEXES },
        'selected-island-mask': { type: 'geojson', data: EMPTY_SELECTED_ISLAND_MASK },
        [SERVICE_MARKER_SOURCE_ID]: {
          type: 'geojson',
          data: EMPTY_SERVICE_MARKERS,
          cluster: true,
          clusterMinPoints: 2,
          clusterMaxZoom: SERVICE_MARKER_CLUSTER_MAX_ZOOM,
          clusterRadius: SERVICE_MARKER_CLUSTER_RADIUS,
          clusterProperties: {
            healthCount: ['+', ['case', ['==', ['get', 'serviceType'], 'health'], 1, 0]],
            educationCount: ['+', ['case', ['==', ['get', 'serviceType'], 'education'], 1, 0]],
            transportCount: ['+', ['case', ['==', ['get', 'serviceType'], 'transport'], 1, 0]]
          }
        }
      },
      layers: [
        ...layersBeforeRoads,
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
            'fill-color': SELECTED_ISLAND_FILL_COLOR,
            'fill-opacity': 0,
            'fill-opacity-transition': { duration: 240, delay: 0 }
          }
        },
        {
          id: 'selected-service-demand-hexes',
          type: 'fill',
          source: 'selected-service-hexes',
          filter: ['has', 'allStatus'],
          paint: {
            'fill-color': demandColorExpression('all'),
            'fill-opacity': demandFillOpacityExpression('all', SELECTED_DEMAND_HEX_OPACITY),
            'fill-opacity-transition': { duration: 260, delay: 0 },
            'fill-outline-color': 'rgba(255, 255, 255, 0.22)'
          }
        },
        {
          id: SERVICE_MARKER_ANCHOR_LAYER_ID,
          type: 'circle',
          source: SERVICE_MARKER_SOURCE_ID,
          paint: {
            'circle-radius': 1,
            'circle-opacity': 0
          }
        },
        ...roadLayers,
        {
          id: 'selected-island-mask',
          type: 'fill',
          source: 'selected-island-mask',
          paint: {
            'fill-color': SELECTED_ISLAND_MASK_COLOR,
            'fill-opacity': 1
          }
        },
        {
          id: 'selected-island-loading',
          type: 'fill',
          source: 'islands',
          filter: ['==', ['get', 'id'], ''],
          layout: { visibility: 'none' },
          paint: {
            'fill-color': SELECTED_ISLAND_LOADING_START_COLOR,
            'fill-opacity': 0,
            'fill-color-transition': { duration: 72, delay: 0 },
            'fill-opacity-transition': { duration: 140, delay: 0 },
            'fill-outline-color': SELECTED_ISLAND_LOADING_START_COLOR,
            'fill-outline-color-transition': { duration: 72, delay: 0 }
          }
        },
        ...selectedRoadLayers,
        {
          id: 'island-outline',
          type: 'line',
          source: 'islands',
          minzoom: NATIONAL_ISLAND_FILL_START_ZOOM,
          paint: {
            'line-color': '#71717a',
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
            'text-color': '#18181b',
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
            'line-color': '#09090b',
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

    void loadAnalytics();
    void loadConnectionNetwork();

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
        mapInstance.on('zoom', scheduleServiceMarkerSync);
        mapInstance.on('move', scheduleServiceMarkerSync);
        mapInstance.on('moveend', scheduleServiceMarkerSync);
        mapInstance.on('resize', scheduleServiceMarkerSync);
        mapInstance.on('sourcedata', (event) => {
          if (event.sourceId === SERVICE_MARKER_SOURCE_ID) scheduleServiceMarkerSync();
        });
        mapInstance.on('click', 'island-fill', (event) => {
          if (proposalPending || moveServiceId || addServiceDraft) return;
          const feature = event.features?.[0];
          const id = feature?.properties?.id ?? feature?.id;
          if (typeof id === 'string') selectIslandById(id, feature?.properties?.centroid as Coordinate | undefined);
        });
        mapInstance.on('mouseenter', 'island-fill', () => {
          if (mapInstance)
            mapInstance.getCanvas().style.cursor = moveServiceId || addServiceDraft ? 'crosshair' : 'pointer';
        });
        mapInstance.on('mouseleave', 'island-fill', () => {
          if (mapInstance) mapInstance.getCanvas().style.cursor = moveServiceId || addServiceDraft ? 'crosshair' : '';
        });
        mapInstance.on('click', handleMapProposalClick);
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
            startDemandHeatmapReveal(islandServices.hexes, selectedIslandId);
            renderServiceMarkers(islandServices);
          }
        }
      });
    })();

    return () => {
      disposed = true;
      proposalRequest += 1;
      islandServicesRequest += 1;
      stopMoveMode();
      stopDemandHeatmapReveal();
      stopSelectedIslandLoadingPulse();
      hideSelectedIslandFill();
      removeServiceMarkers();
      if (serviceMarkerSyncFrame !== null) {
        window.cancelAnimationFrame(serviceMarkerSyncFrame);
        serviceMarkerSyncFrame = null;
      }
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
        setSourceData('selected-island-mask', selectedIslandMask(selectedIslandId));
        const roadFilter = selectedIslandRoadFilter(selectedIslandId);
        setLayerFilter('selected-island-road-casing', roadFilter);
        setLayerFilter('selected-island-road-inner', roadFilter);
        if (islandServices) renderServiceMarkers(islandServices);
      }
      const scoreFields: ScoreFieldCollection = {
        type: 'FeatureCollection',
        features: islands.features.flatMap((island) => {
          if (
            island.properties.scoreStatus !== 'numeric' ||
            island.properties.score === null ||
            !isValidCoordinate(island.properties.centroid)
          )
            return [];
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

  async function downloadProposalPdf(): Promise<void> {
    if (!selectedIslandId || !islandServices?.baselineVersion || proposalPending || proposalExporting) return;
    proposalExporting = true;
    proposalExportComplete = false;
    proposalError = null;
    try {
      const response = await fetch('/api/v1/scenarios/report.pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baselineVersion: islandServices.baselineVersion,
          selectedIslandId,
          // Export the current accepted proposal operation history.
          operations: draftOperations.slice(0, draftCursor),
          proposal: proposalSettings
        })
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        let message = 'The proposal PDF could not be generated.';
        if (contentType.includes('application/json')) {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) message = payload.error;
        } else {
          const text = await response.text();
          if (text.trim()) message = text;
        }
        throw new Error(message);
      }
      if (!contentType.includes('application/pdf')) throw new Error('The server returned an invalid proposal report.');
      const blob = await response.blob();
      if (blob.size < 5) throw new Error('The generated proposal PDF is empty.');
      const signature = await blob.slice(0, 5).text();
      if (signature !== '%PDF-') throw new Error('The generated proposal report is not a valid PDF.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${
        islandServices.island.name
          .replace(/[^a-zA-Z0-9 _-]/g, '')
          .trim()
          .replace(/\\s+/g, '-') || 'island'
      }-proposal.pdf`;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      proposalExportComplete = true;
    } catch (error) {
      proposalError = error instanceof Error ? error.message : 'PDF export failed.';
    } finally {
      proposalExporting = false;
    }
  }

  function createProposal(): void {
    if (!selectedIslandId) return;
    closeServicePopup();
    proposalQuery = '';
    proposalServiceFilter = 'all';
    proposalPending = false;
    proposalError = null;
    proposalLastMessage = null;
    draftOperations = [];
    proposalRecommendation = null;
    proposalExportComplete = false;
    recommendationOperation = null;
    ignoredRecommendationOperationId = null;
    recommendationPending = false;
    recommendationStarting = false;
    recommendationKey = null;
    recommendationUndoOperations = null;
    transportEditorOperation = null;
    proposalBuilderTab = 'services';
    addServiceDraft = null;
    stopMoveMode();
    clearTransportEditState();
    proposalSettings = {
      ...DEFAULT_PROPOSAL_SETTINGS,
      name: `${islandServices?.island.name ?? 'Island'} access proposal`
    };
    proposalMode = true;
    proposalView = 'proposal';
    void loadIslandServices(selectedIslandId);
    const feature = islandCollection.features.find((island) => island.id === selectedIslandId);
    if (feature) {
      const focusRequest = ++islandFocusRequest;
      void focusIsland(
        feature.properties,
        850,
        () => focusRequest === islandFocusRequest && selectedIslandId === feature.properties.id
      );
    }
  }

  function visibleJourneyCoordinates(
    coordinates: readonly PresentationCoordinate[],
    progress: number
  ): PresentationCoordinate[] {
    if (coordinates.length < 2) return [...coordinates];
    const scaled = Math.min(1, Math.max(0, progress)) * (coordinates.length - 1);
    const index = Math.floor(scaled);
    const amount = scaled - index;
    const visible = coordinates.slice(0, index + 1);
    const from = coordinates[index];
    const to = coordinates[index + 1];
    if (from && to && amount > 0)
      visible.push([from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount]);
    if (visible.length === 1) visible.push(visible[0]);
    return visible;
  }

  function presentationCollection(story: PresentationStory, sectionIndex: number, progress = 1) {
    return {
      type: 'FeatureCollection' as const,
      features: story.sections.slice(0, sectionIndex + 1).flatMap((section, index) => {
        const coordinates = section.geometry.coordinates.filter(isValidCoordinate);
        if (coordinates.length === 0) return [];
        const lineCoordinates = coordinates.length === 1 ? [coordinates[0], coordinates[0]] : coordinates;
        return [
          {
            type: 'Feature' as const,
            id: section.id,
            properties: { mode: section.mode, branch: section.branch },
            geometry: {
              ...section.geometry,
              coordinates:
                index === sectionIndex ? visibleJourneyCoordinates(lineCoordinates, progress) : lineCoordinates
            }
          }
        ];
      })
    };
  }

  function ensurePresentationLayers(): void {
    if (!mapInstance || !presentationStory) return;
    if (!mapInstance.getSource(PRESENTATION_SOURCE_ID)) {
      mapInstance.addSource(PRESENTATION_SOURCE_ID, {
        type: 'geojson',
        data: presentationCollection(presentationStory, 0)
      });
      mapInstance.addLayer({
        id: PRESENTATION_LINE_LAYER_ID,
        type: 'line',
        source: PRESENTATION_SOURCE_ID,
        paint: {
          'line-color': ['match', ['get', 'branch'], 'pickup', '#f59e0b', 'merged', '#dc2626', '#16a34a'],
          'line-width': 5,
          'line-opacity': 0.92
        }
      });
    }
    if (!mapInstance.getSource(PRESENTATION_POINT_SOURCE_ID)) {
      mapInstance.addSource(PRESENTATION_POINT_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      mapInstance.addLayer({
        id: PRESENTATION_POINT_LAYER_ID,
        type: 'circle',
        source: PRESENTATION_POINT_SOURCE_ID,
        paint: {
          'circle-radius': 8,
          'circle-color': '#dc2626',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3
        }
      });
    }
  }

  function pointAlongLine(coordinates: PresentationCoordinate[], progress: number): PresentationCoordinate {
    if (coordinates.length < 2) return coordinates[0] ?? MALDIVES_CENTER;
    const scaled = Math.min(0.999999, Math.max(0, progress)) * (coordinates.length - 1);
    const index = Math.floor(scaled);
    const amount = scaled - index;
    const from = coordinates[index];
    const to = coordinates[index + 1] ?? from;
    return [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount];
  }

  function showPresentationSection(): void {
    if (!mapInstance || !presentationStory || !presentation.active) return;
    const story = presentationStory;
    const section = story.sections[presentation.sectionIndex];
    if (!section) return;
    const coordinates = section.geometry.coordinates.filter(isValidCoordinate);
    if (coordinates.length === 0) return;
    const run = ++presentationRun;
    presentation.setProgress(0);
    ensurePresentationLayers();
    (mapInstance.getSource(PRESENTATION_SOURCE_ID) as GeoJSONSource).setData(
      presentationCollection(presentationStory, presentation.sectionIndex, 0)
    );
    const longitudes = coordinates.map((coordinate) => coordinate[0]);
    const latitudes = coordinates.map((coordinate) => coordinate[1]);
    const bounds: [Coordinate, Coordinate] = [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)]
    ];
    const isPointSection = coordinates.every(
      (coordinate) => coordinate[0] === coordinates[0][0] && coordinate[1] === coordinates[0][1]
    );
    try {
      if (isPointSection) {
        mapInstance.easeTo({
          center: coordinates[0],
          zoom: Math.min(
            mapInstance.getMaxZoom(),
            section.id === 'flight-landing-handoff' ? 14.5 : section.camera.maxZoom
          ),
          duration: prefersReducedMotion.current ? 0 : 420,
          essential: !prefersReducedMotion.current
        });
      } else {
        mapInstance.fitBounds(bounds, {
          padding: safeCameraPadding(section.camera.padding),
          maxZoom: section.camera.maxZoom,
          duration: prefersReducedMotion.current ? 0 : 420
        });
      }
    } catch {
      try {
        mapInstance.easeTo({
          center: coordinates[0],
          zoom: Math.min(mapInstance.getMaxZoom(), section.camera.maxZoom),
          duration: prefersReducedMotion.current ? 0 : 300,
          essential: !prefersReducedMotion.current
        });
      } catch {
        // Route geometry remains useful even if the camera cannot move.
      }
    }
    const duration = prefersReducedMotion.current
      ? 0
      : section.mode === 'wait'
        ? 500
        : section.mode === 'handoff'
          ? 800
          : section.mode === 'aircraft'
            ? 2400
            : section.mode === 'ferry'
              ? 1800
              : section.mode === 'ambulance'
                ? 1400
                : section.mode === 'bus'
                  ? 1500
                  : section.mode === 'walk'
                    ? 1200
                    : 1400;
    const sectionPause = prefersReducedMotion.current
      ? 0
      : section.mode === 'wait' || section.mode === 'handoff'
        ? 700
        : 500;
    const started = performance.now();
    let arrivalCameraStarted = false;
    const animate = (time: number) => {
      if (run !== presentationRun || !presentation.active) return;
      const progress = duration === 0 ? 1 : Math.min(1, (time - started) / duration);
      presentation.setProgress(progress);
      if (section.mode === 'aircraft' && progress >= 0.72 && !arrivalCameraStarted) {
        arrivalCameraStarted = true;
        const arrival = coordinates[coordinates.length - 1];
        if (arrival) {
          try {
            mapInstance?.easeTo({
              center: arrival,
              zoom: Math.min(mapInstance.getMaxZoom(), 13.5),
              duration: prefersReducedMotion.current ? 0 : 900,
              essential: !prefersReducedMotion.current
            });
          } catch {
            // Keep the route animation running if an optional arrival camera is rejected.
          }
        }
      }
      const coordinate = pointAlongLine(coordinates, progress);
      (mapInstance?.getSource(PRESENTATION_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
        presentationCollection(story, presentation.sectionIndex, progress)
      );
      (mapInstance?.getSource(PRESENTATION_POINT_SOURCE_ID) as GeoJSONSource | undefined)?.setData({
        type: 'Feature',
        properties: { mode: section.mode },
        geometry: { type: 'Point', coordinates: coordinate }
      });
      if (progress < 1) {
        presentationFrame = requestAnimationFrame(animate);
      } else if (presentation.sectionIndex === story.sections.length - 1 && !readerActive) {
        completePresentation();
      } else if (readerActive && section.id === 'ambulance-tree-top') {
        presentationAutoPlay = false;
        if (presentationAdvanceTimer !== null) window.clearTimeout(presentationAdvanceTimer);
        presentationAdvanceTimer = null;
      } else if (presentationAutoPlay) {
        presentationAdvanceTimer = window.setTimeout(() => {
          presentationAdvanceTimer = null;
          if (run !== presentationRun || !presentation.active) return;
          presentation.next(story.sections.length);
          showPresentationSection();
        }, sectionPause);
      }
    };
    presentationFrame = requestAnimationFrame(animate);
  }

  async function startPresentation(destinationIslandId: string): Promise<void> {
    if (selectedIslandId !== BAARAH_ISLAND_ID || destinationIslandId !== DESTINATION_ISLAND_ID) return;
    const response = await fetch('/api/v1/presentation/story');
    if (!response.ok) return;
    presentationStory = (await response.json()) as PresentationStory;
    islandAnalyticsOpen = false;
    resetSelectedIslandOverlay();
    selectedIslandId = null;
    presentationAutoPlay = !readerActive;
    presentation.start();
    showPresentationSection();
  }

  async function startPresentationShortcut(): Promise<void> {
    if (readerActive) stopReader();
    if (presentation.active) clearPresentation();
    if (proposalMode) closeProposalMode();
    await startReaderSession(false);
  }

  function clearPresentation(): void {
    presentation.exit();
    presentationAutoPlay = false;
    presentationRun += 1;
    if (presentationAdvanceTimer !== null) window.clearTimeout(presentationAdvanceTimer);
    presentationAdvanceTimer = null;
    if (presentationFrame !== null) cancelAnimationFrame(presentationFrame);
    presentationFrame = null;
    if (mapInstance?.getLayer(PRESENTATION_POINT_LAYER_ID)) mapInstance.removeLayer(PRESENTATION_POINT_LAYER_ID);
    if (mapInstance?.getLayer(PRESENTATION_LINE_LAYER_ID)) mapInstance.removeLayer(PRESENTATION_LINE_LAYER_ID);
    if (mapInstance?.getSource(PRESENTATION_POINT_SOURCE_ID)) mapInstance.removeSource(PRESENTATION_POINT_SOURCE_ID);
    if (mapInstance?.getSource(PRESENTATION_SOURCE_ID)) mapInstance.removeSource(PRESENTATION_SOURCE_ID);
  }

  function completePresentation(): void {
    clearPresentation();
    selectIslandById(DESTINATION_ISLAND_ID);
  }

  async function loadReaderScript(): Promise<PresentationScript | null> {
    try {
      const response = await fetch('/presentation/presentation-script.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Reader script could not be loaded.');
      return v.parse(presentationScriptSchema, await response.json());
    } catch (error) {
      console.error('Presentation reader script failed:', error);
      readerActionError = 'The reader script could not be loaded.';
      return null;
    }
  }

  async function runReaderStep(): Promise<void> {
    const script = readerScript;
    const step = script?.steps[readerStepIndex];
    if (!script || !step || !readerPlaying) return;
    const run = ++readerActionRun;
    readerActionError = null;
    for (let index = readerActionIndex; index < step.actions.length; index += 1) {
      const action = step.actions[index];
      if (run !== readerActionRun || !readerPlaying || !readerActive) return;
      const completed = await runPresentationAction(action, {
        panMap: (delta, duration) => {
          if (!mapInstance || (delta[0] === 0 && delta[1] === 0)) return;
          mapInstance.panBy(delta, { duration, essential: true });
        },
        focusService: (target) => focusReaderService(target),
        waitForMapIdle: () => waitForMapIdle(),
        waitForProposalState,
        waitForJourneySection: (sectionId) => waitForReaderJourneySection(sectionId),
        pauseJourney: pauseReaderJourney,
        waitForProposalExport,
        waitForRecommendation
      });
      if (!completed) {
        readerActionError = `Scene target is unavailable: ${'target' in action ? action.target : action.type}`;
        return;
      }
      readerActionIndex = index + 1;
    }
    readerActionIndex = 0;
  }

  async function waitForReaderJourneySection(sectionId: string): Promise<boolean> {
    const started = performance.now();
    while (performance.now() - started < 24_000) {
      const targetIndex = presentationStory?.sections.findIndex((section) => section.id === sectionId) ?? -1;
      if (targetIndex >= 0 && presentation.active) {
        presentationAutoPlay = false;
        while (presentation.sectionIndex < targetIndex) {
          if (presentation.sectionProgress < 1) {
            await wait(120);
            continue;
          }
          presentation.next(presentationStory?.sections.length ?? 0);
          showPresentationSection();
        }
        if (presentation.sectionIndex === targetIndex && presentation.sectionProgress === 0) showPresentationSection();
        return true;
      }
      await wait(120);
    }
    return false;
  }

  async function pauseReaderJourney(): Promise<void> {
    const started = performance.now();
    while (presentation.active && presentation.sectionProgress < 1 && performance.now() - started < 5000)
      await wait(100);
    clearPresentation();
    if (selectedIslandId !== DESTINATION_ISLAND_ID) selectIslandById(DESTINATION_ISLAND_ID);
  }

  async function waitForProposalExport(): Promise<boolean> {
    const started = performance.now();
    while (performance.now() - started < 12_000) {
      if (proposalExportComplete) return true;
      if (!proposalExporting && proposalError) return false;
      await wait(150);
    }
    return false;
  }

  async function waitForRecommendation(): Promise<boolean> {
    const started = performance.now();
    while (performance.now() - started < 12_000) {
      if (proposalRecommendation && !recommendationPending && !recommendationStarting) return true;
      if (proposalError) return false;
      await wait(150);
    }
    return false;
  }

  async function waitForProposalState(state: 'ready' | 'settled' | 'transport'): Promise<boolean> {
    const started = performance.now();
    while (performance.now() - started < 10_000) {
      const ready =
        proposalMode &&
        selectedIslandId === BAARAH_ISLAND_ID &&
        !islandServicesLoading &&
        !proposalPending &&
        Boolean(islandServices?.baselineVersion);
      const settled =
        ready && Boolean(draftPreview?.costs) && Boolean(draftPreview?.impact) && draftOperations.length > 0;
      if (
        (state === 'ready' && ready) ||
        (state === 'settled' && settled) ||
        (state === 'transport' && proposalBuilderTab === 'transport')
      )
        return true;
      if (proposalError) return false;
      await wait(120);
    }
    return false;
  }

  async function focusReaderService(target: string): Promise<boolean> {
    const started = performance.now();

    while (performance.now() - started < 8000) {
      if (islandServicesLoading || islandServices?.island.id !== selectedIslandId) {
        await wait(150);
        continue;
      }
      const service =
        target === 'tree-top-marker'
          ? serviceMarkerServices.get(TREE_TOP_SERVICE_ID)
          : serviceMarkerServices.get(BAARAH_HEALTH_CENTRE_SERVICE_ID);
      if (service) {
        return focusService(service, true, false);
      }
      await wait(150);
    }
    return false;
  }

  async function startReaderSession(showCard: boolean): Promise<void> {
    if (readerActive) return;
    const script = await loadReaderScript();
    if (!script) return;
    clearPresentation();
    closeProposalMode();
    returnToNational();
    readerScript = script;
    readerStepIndex = 0;
    readerActionIndex = 0;
    readerRemainingSeconds = script.durationSeconds;
    readerActionError = null;
    readerCardVisible = showCard;
    readerActive = true;
    readerPlaying = true;
    void runReaderStep();
  }

  async function startReader(): Promise<void> {
    await startReaderSession(true);
  }

  function stopReader(): void {
    readerActionRun += 1;
    readerActive = false;
    readerCardVisible = false;
    readerPlaying = false;
    if (readerTimer !== null) window.clearInterval(readerTimer);
    readerTimer = null;
    readerScript = null;
    clearPresentation();
    returnToNational();
  }

  function toggleReader(): void {
    readerPlaying = !readerPlaying;
    if (readerPlaying) void runReaderStep();
    else readerActionRun += 1;
  }

  function nextReaderStep(): void {
    if (!readerScript || readerStepIndex >= readerScript.steps.length - 1) return;
    readerActionRun += 1;
    readerStepIndex += 1;
    readerActionIndex = 0;
    readerActionError = null;
    if (readerPlaying) void runReaderStep();
  }

  function previousReaderStep(): void {
    if (!readerScript || readerStepIndex === 0) return;
    readerActionRun += 1;
    readerStepIndex -= 1;
    readerActionIndex = 0;
    readerActionError = null;
    if (readerPlaying) void runReaderStep();
  }

  $effect(() => {
    if (!readerActive || !readerScript || readerTimer !== null) return;
    readerTimer = window.setInterval(() => {
      if (!readerPlaying) return;
      readerRemainingSeconds = Math.max(0, readerRemainingSeconds - 1);
      if (readerRemainingSeconds === 0) {
        readerPlaying = false;
        readerActionRun += 1;
      }
    }, 1000);
  });

  $effect(() => {
    const cursorLocked = readerActive || presentation.active;
    document.body.classList.toggle('presentation-cursor-hidden', cursorLocked);

    return () => {
      document.body.classList.remove('presentation-cursor-hidden');
    };
  });

  function exitPresentation(): void {
    clearPresentation();
    returnToNational();
  }

  function handlePresentationKey(event: KeyboardEvent): void {
    if (!presentation.active || !presentationStory) return;
    if (['ArrowRight', ' ', 'ArrowLeft', 'Escape', 'r', 'R'].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowRight' || event.key === ' ') presentation.next(presentationStory.sections.length);
    else if (event.key === 'ArrowLeft') presentation.previous();
    else if (event.key === 'r' || event.key === 'R') presentation.restart();
    else if (event.key === 'Escape') return exitPresentation();
    showPresentationSection();
  }

  function handleReaderKey(event: KeyboardEvent): void {
    if (!readerActive || isEditableKeyboardTarget(event.target)) return;
    if (!['ArrowRight', 'ArrowLeft', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowRight') nextReaderStep();
    else if (event.key === 'ArrowLeft') previousReaderStep();
    else toggleReader();
  }

  function isEditableKeyboardTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  }

  function handleGlobalPresentationKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (readerActive) stopReader();
      else if (presentation.active) exitPresentation();
      else if (moveServiceId) stopMoveMode();
      else if (addServiceDraft) stopAddServiceMode();
      return;
    }

    if (isEditableKeyboardTarget(event.target) || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
      return;

    const key = event.key.toLowerCase();
    if (key === 'l') {
      event.preventDefault();
      void startReader();
    } else if (key === 'p') {
      event.preventDefault();
      void startPresentationShortcut();
    }
  }

  function closeProposalMode(): void {
    proposalRequest += 1;
    islandServicesRequest += 1;
    proposalPending = false;
    clearTransportEditState();
    closeServicePopup();
    stopMoveMode();
    proposalMode = false;
    proposalQuery = '';
    proposalServiceFilter = 'all';
    proposalError = null;
    proposalLastMessage = null;
    draftOperations = [];
    draftCursor = 0;
    draftPreview = null;
    transportEditorOperation = null;
    proposalBuilderTab = 'services';
    addServiceDraft = null;
    if (mapInstance?.getLayer(PROPOSAL_TRANSPORT_LINE_LAYER_ID))
      mapInstance.removeLayer(PROPOSAL_TRANSPORT_LINE_LAYER_ID);
    if (mapInstance?.getSource(PROPOSAL_TRANSPORT_SOURCE_ID)) mapInstance.removeSource(PROPOSAL_TRANSPORT_SOURCE_ID);
    if (selectedIslandId) void loadIslandServices(selectedIslandId);
  }
</script>

{#snippet mapCategoryTabs()}
  <Tabs.Root bind:value={selectedDemandCategory} class="demand-tabs">
    <Tabs.List class="demand-tabs-list" aria-label="Map demand category">
      {#each ISLAND_DEMAND_CATEGORIES as category (category)}
        <Tabs.Trigger value={category}>{demandCategoryLabel(category)}</Tabs.Trigger>
      {/each}
    </Tabs.List>
  </Tabs.Root>
{/snippet}

{#snippet proposalMapControls()}
  <section aria-label="Proposal map comparison">
    <Tabs.Root class="demand-tabs" bind:value={() => proposalView, setProposalView}>
      <Tabs.List class="demand-tabs-list demand-tabs-list-comparison" aria-label="Compare baseline and proposal">
        <Tabs.Trigger value="baseline">Baseline</Tabs.Trigger>
        <Tabs.Trigger value="proposal">Proposal</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    {@render mapCategoryTabs()}
    <div class="demand-scale" aria-hidden="true"></div>
    <div class="score-labels"><span>Low pressure / gap</span><span>High</span></div>
    {#if displayedServices && displayedServices.summary.hexFeatureCount === 0}
      <p class="selected-map-state" role="status">No mapped demand data is available for this view.</p>
    {/if}
  </section>
{/snippet}

<svelte:head>
  <title>{config.app.name} | Accessibility map</title>
  <meta name="description" content="National accessibility score map for the Maldives." />
</svelte:head>

<svelte:window
  onkeydown={(event) => {
    handleGlobalPresentationKey(event);
    if (event.defaultPrevented) return;
    if (readerActive) return handleReaderKey(event);
    if (presentation.active) return handlePresentationKey(event);
  }}
/>

<div class="map-shell">
  <div
    bind:this={mapElement}
    class="map-canvas"
    data-presentation-target="map-canvas"
    role="application"
    aria-label={selectedIslandId
      ? 'Selected island demand and residential access map'
      : 'National Maldives accessibility score map'}
    aria-busy={mapReady && !selectedIslandLoading ? 'false' : 'true'}
    ondragover={handleMapDragOver}
    ondrop={handleMapDrop}
  ></div>

  {#if heatmapLoading}
    <div class="heatmap-loading" role="status" aria-live="polite" out:premiumLoadingExit={{ duration: 820 }}>
      <div class="loading-card">
        <p class="loading-brand">{config.app.name}</p>
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
        <p class="loading-brand">{config.app.name}</p>
        <p>Map unavailable. Try again.</p>
        <button type="button" onclick={retryHeatmap}>Retry map</button>
      </div>
    </div>
  {/if}

  <div
    class={`national-panel-slot${proposalMode ? ' proposal-mode-left' : ''}`}
    aria-hidden={proposalMode}
    inert={proposalMode}
    aria-live="polite"
  >
    {#key selectedIslandId}
      {#if selectedIslandId}
        <IslandScoreCard
          island={selectedIsland}
          loading={!mapReady || analyticsLoading || !selectedIsland}
          error={Boolean(analyticsError)}
        />
      {:else}
        <NationalScoreCard
          title={config.app.name}
          caption="National score"
          overall={analyticsData?.national.score}
          national={analyticsData?.national ?? null}
          onAnalyticsOpen={openAnalytics}
          loading={!mapReady || analyticsLoading}
          error={Boolean(analyticsError)}
        />
      {/if}
    {/key}
  </div>

  {#if !selectedIslandId}
    <div class="island-search-slot" aria-hidden={analyticsOpen || proposalMode} inert={analyticsOpen || proposalMode}>
      <IslandSearch
        islands={islandCollection.features.map((feature) => ({
          id: feature.properties.id,
          name: feature.properties.name,
          atollName: feature.properties.atollName,
          centroid: feature.properties.centroid,
          score: feature.properties.score
        }))}
        onIslandSelect={selectSearchIsland}
        loading={!mapReady || analyticsLoading}
      />
    </div>
  {/if}

  {#if selectedIslandId && !proposalMode}
    <button
      class="national-view-button"
      data-presentation-target="national-view"
      type="button"
      onclick={returnToNational}
    >
      Back to national view
    </button>
  {/if}

  <NationalAnalyticsCard
    bind:open={analyticsOpen}
    data={analyticsData}
    loading={analyticsLoading}
    error={analyticsError}
    onIslandSelect={focusAnalyticsIsland}
    {proposalMode}
  />

  <IslandAnalyticsCard
    bind:open={islandAnalyticsOpen}
    island={selectedIsland}
    profile={islandProfile}
    loading={analyticsLoading || islandProfileLoading || !selectedIsland}
    error={analyticsError ?? islandProfileError}
    network={connectionNetwork}
    networkLoading={connectionNetworkLoading}
    networkError={connectionNetworkError}
    onClose={returnToNational}
    onIslandSelect={(islandId) => selectIslandById(islandId)}
    onSimulate={startPresentation}
    {proposalMode}
  />

  <section
    class={`map-legend${proposalMode ? ' proposal-mode-left' : ''}`}
    aria-hidden={proposalMode}
    inert={proposalMode}
    aria-label={selectedIslandId ? 'Demand and residential access gap legend' : 'Accessibility score legend'}
  >
    {#if selectedIslandId}
      <div class="selected-map-heading">
        <p class="legend-title">
          {selectedDemandCategory === 'all'
            ? 'Demand + residential access gap'
            : `${demandCategoryLabel(selectedDemandCategory)} pressure + access gap`}
        </p>
        {#if islandServicesLoading}<span class="selected-map-spinner" aria-label="Loading service demand"></span>{/if}
      </div>
      {@render mapCategoryTabs()}
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
      {#if islandServicesError}
        <p class="selected-map-state" role="alert">{islandServicesError}</p>
      {:else if islandServices && islandServices.summary.hexFeatureCount === 0}
        <p class="selected-map-state" role="status">
          No services with valid coordinates are available for this island.
        </p>
      {:else if islandServices}
        <p class="selected-map-state" role="status">
          {islandServices.summary.mappedCoordinateCount} services · {islandServices.summary.residentialBuildingCount} residential
          buildings · {demandCategoryLabel(selectedDemandCategory)}
        </p>
      {/if}
    {:else}
      <p class="legend-title">Accessibility score</p>
      <div class="score-scale" aria-hidden="true"></div>
      <div class="score-labels"><span>Low</span><span>High</span></div>
      <div class="score-unavailable"><span></span>No access / no data</div>
    {/if}
  </section>

  {#if selectedIslandId && islandAnalyticsOpen && !proposalMode}
    <ProposalLauncher onCreate={createProposal} />
  {/if}

  {#if presentation.active && presentationStory}
    <PresentationTimeline
      story={presentationStory}
      sectionIndex={presentation.sectionIndex}
      sectionProgress={presentation.sectionProgress}
    />
  {/if}

  {#if readerActive || presentation.active}
    <PresentationCursor active={readerActive || presentation.active} />
  {/if}

  {#if readerActive && readerScript && readerCardVisible}
    <PresentationReader
      script={readerScript}
      stepIndex={readerStepIndex}
      remainingSeconds={readerRemainingSeconds}
      error={readerActionError}
    />
  {/if}

  {#if proposalMode}
    <div class="proposal-panels">
      {#if selectedIslandId}
        {#if proposalRecommendation || recommendationPending || recommendationStarting}
          <PresentationRecommendationCard
            recommendation={proposalRecommendation}
            pending={recommendationPending || recommendationStarting}
            onReview={applyBaarahRecommendation}
            onDismiss={ignoreBaarahRecommendation}
          />
        {/if}
        <ProposalFinancialSummary
          settings={proposalSettings}
          costs={proposalPreview?.costs ?? null}
          disabled={!editableProposal}
          onSettingsChange={(settings) => void updateProposalSettings(settings)}
          impact={proposalPreview?.impact ?? null}
          pending={proposalPending || islandServicesLoading}
          exporting={proposalExporting}
          error={proposalError ?? islandServicesError}
          onDownload={downloadProposalPdf}
          onClose={closeProposalMode}
        />
        <ProposalWorkspace
          services={displayedServices?.services ?? []}
          mapControls={proposalMapControls}
          readOnly={!editableProposal}
          canUndo={draftCursor > 0}
          canRedo={draftCursor < draftOperations.length}
          onUndo={() => changeDraftHistory(-1)}
          onRedo={() => changeDraftHistory(1)}
          onReset={resetProposalDraft}
          canReset={draftOperations.length > 0}
          bind:query={proposalQuery}
          bind:serviceFilter={proposalServiceFilter}
          pending={proposalPending || islandServicesLoading}
          moveActive={moveServiceId !== null}
          error={proposalError ?? islandServicesError}
          message={proposalLastMessage}
          onCancelMove={stopMoveMode}
          onSelectService={focusService}
          activeSelection={addServiceDraft}
          addServiceLabel={addServiceDraft
            ? serviceCatalogEntry(addServiceDraft.serviceType, addServiceDraft.subtype)?.label
            : null}
          onStartAddService={startAddService}
          onCancelAdd={stopAddServiceMode}
          selectedIslandId={selectedIslandId ?? ''}
          transportPlans={proposalPreview?.transportPlans ?? []}
          {transportEditorOperation}
          bind:builderTab={proposalBuilderTab}
          onApplyTransport={applyTransportOperation}
          onEditTransport={editTransportOperation}
          onRemoveTransport={removeTransportOperation}
        />
      {/if}
    </div>
  {/if}
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
    background: #e4e4e7;
  }

  .map-shell {
    --mobility-surface: #ffffff;
    --mobility-surface-soft: #fafafa;
    --mobility-surface-muted: #f4f4f5;
    --mobility-border: #e4e4e7;
    --mobility-border-strong: #d4d4d8;
    --mobility-text: #09090b;
    --mobility-muted: #71717a;
    --mobility-accent: #09090b;
    --mobility-accent-soft: #f4f4f5;
    --mobility-focus: #3f3f46;
    position: relative;
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    background: #f4f4f5;
    color: #09090b;
    color-scheme: light;
  }

  .map-canvas {
    position: absolute;
    inset: 0;
  }

  .national-panel-slot,
  .map-legend {
    will-change: transform, opacity;
    backface-visibility: hidden;
    transition:
      transform 480ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 320ms ease-out;
  }

  .national-panel-slot {
    transition-delay: 0ms;
  }

  .map-legend {
    transition-delay: 70ms;
  }

  .proposal-mode-left {
    transform: translate3d(calc(-100% - 2rem), 0, 0) scale(0.985);
    opacity: 0;
    pointer-events: none;
  }

  .proposal-panels {
    position: fixed;
    inset: 1rem;
    z-index: 20;
    display: grid;
    grid-template-columns: 22rem minmax(0, 1fr) 32rem;
    grid-template-rows: minmax(0, 1fr);
    align-items: start;
    gap: 1rem;
    pointer-events: none;
  }

  .proposal-panels > :global(*) {
    pointer-events: auto;
  }

  @media (max-width: 64rem) {
    .proposal-panels {
      inset: auto 0.75rem 0.75rem;
      height: 60dvh;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 2fr) minmax(0, 3fr);
      align-items: stretch;
      gap: 0.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .national-panel-slot,
    .map-legend {
      transition: none;
      will-change: auto;
    }
  }

  :global(.maplibregl-popup) {
    z-index: 40;
  }

  .heatmap-loading {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: var(--mobility-surface, #ffffff);
    will-change: opacity, filter;
  }

  .loading-card {
    display: grid;
    grid-template-rows: auto 1fr auto;
    align-items: center;
    justify-items: center;
    width: min(42rem, 100%);
    min-height: 100%;
    gap: 1.25rem;
    color: #09090b;
    text-align: center;
  }

  .loading-brand {
    margin: 0;
    color: #09090b;
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
    color: #09090b;
    font-size: clamp(1.7rem, 3.2vw, 3rem);
    font-weight: 850;
    letter-spacing: -0.04em;
    line-height: 1.08;
  }

  .loading-status {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    color: #71717a;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid #d4d4d8;
    border-top-color: #52525b;
    border-radius: 50%;
    animation: loading-spin 0.8s linear infinite;
  }

  .error-card button {
    margin-top: 0.75rem;
    padding: 0.6rem 0.9rem;
    border: 0;
    border-radius: 0.45rem;
    background: #18181b;
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

  .island-search-slot {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 3;
    transition: opacity 180ms ease-out;
  }

  .island-search-slot[aria-hidden='true'] {
    opacity: 0;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .island-search-slot {
      top: 0.65rem;
      right: 0.65rem;
    }
  }

  .selected-map-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .selected-map-state {
    margin: 0.55rem 0 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
    line-height: 1.3;
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
    border: 1px solid var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface-muted, #f4f4f5);
  }

  :global(.demand-tabs-list.demand-tabs-list-comparison) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  :global(.demand-tabs-list [data-slot='tabs-trigger']) {
    min-width: 0;
    padding: 0.3rem 0.2rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.58rem;
  }

  :global(.demand-tabs-list [data-slot='tabs-trigger'][data-state='active']),
  :global(.demand-tabs-list [data-slot='tabs-trigger'][data-active]) {
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-accent, #09090b);
    box-shadow: 0 1px 2px rgb(16 24 32 / 8%);
  }

  .selected-map-spinner {
    width: 0.85rem;
    height: 0.85rem;
    flex: 0 0 auto;
    border: 2px solid #d4d4d8;
    border-top-color: #52525b;
    border-radius: 50%;
    animation: loading-spin 0.8s linear infinite;
  }

  .map-legend {
    position: absolute;
    z-index: 2;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.55rem;
    background: #ffffff;
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 12%);
  }

  .legend-title {
    margin: 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.64rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .map-legend {
    bottom: 1rem;
    left: 1rem;
    width: min(19rem, calc(100vw - 2rem));
    padding: 0.7rem 0.8rem 1rem;
    font-size: 0.7rem;
    line-height: 1.2;
  }

  .map-legend :global(.demand-tabs) {
    margin-bottom: 0.85rem;
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
    background: linear-gradient(
      90deg,
      #e5f5e0 0%,
      #a1d99b 16%,
      #d9ef8b 32%,
      #fee08b 48%,
      #fdae61 64%,
      #f97316 80%,
      #ef4444 90%,
      #dc2626 100%
    );
  }

  .score-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.25rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
  }

  .score-unavailable {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.55rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
  }

  .score-unavailable span {
    width: 0.65rem;
    height: 0.65rem;
    border: 1px solid #c7e9c0;
    border-radius: 50%;
    background: #edf8e9;
  }

  .marker-legend-section {
    margin-top: 0.7rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--mobility-border, #e4e4e7);
  }

  .legend-section-title {
    margin: 0;
    color: var(--mobility-muted, #71717a);
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
    color: var(--mobility-muted, #71717a);
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

  .national-view-button {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 4;
    padding: 0.5rem 0.7rem;
    border: 1px solid #d4d4d8;
    border-radius: 999px;
    background: #ffffff;
    color: #18181b;
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 12%);
    font-size: 0.65rem;
    font-weight: 750;
  }

  .national-view-button:hover,
  .national-view-button:focus-visible {
    border-color: #18181b;
    background: #f4f4f5;
  }

  :global(.presentation-click-pulse) {
    animation: presentation-click-pulse 280ms ease-out;
  }

  @keyframes presentation-click-pulse {
    0% {
      box-shadow: 0 0 0 0 rgb(24 24 27 / 42%);
    }
    100% {
      box-shadow: 0 0 0 0.8rem rgb(24 24 27 / 0%);
    }
  }

  @media (max-width: 640px) {
    .national-panel-slot {
      top: 0.75rem;
      left: 0.75rem;
    }

    .map-legend {
      right: 0.75rem;
      bottom: 0.75rem;
      left: 0.75rem;
      width: auto;
    }
  }
</style>
