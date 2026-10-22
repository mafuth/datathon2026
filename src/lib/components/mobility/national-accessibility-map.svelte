<script lang="ts">
  import type {
    FilterSpecification,
    GeoJSONSource,
    Map as MapLibreMap,
    Marker as MapLibreMarker,
    Popup as MapLibrePopup,
    MapMouseEvent,
    MapOptions,
    PaddingOptions
  } from 'maplibre-gl';

  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import X from '@lucide/svelte/icons/x';
  import { mount, onMount, tick, unmount, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { prefersReducedMotion } from 'svelte/motion';

  import 'maplibre-gl/dist/maplibre-gl.css';

  import type { IslandProfile } from './island-profile';
  import type {
    IslandDemandCategory,
    IslandMapService,
    IslandServiceHexes,
    IslandServicesResponse
  } from './island-services';
  import type { AnalyticsData, AnalyticsIsland } from './national-analytics-card.svelte';
  import type { IslandSearchOption } from './national-score-card.svelte';
  import type { PresentationStep } from './presentation-story';
  import type { PresentationVehicleMarker } from './presentation-vehicle';
  import type { ProposalServiceFilter } from './proposal-builder.svelte';
  import type { ClusterMarkerData } from './service-marker-clustering';
  import type { IslandConnectionsResponse } from '$lib/mobility/island-connections';
  import type { ProposalTransportPlan } from '$lib/mobility/proposal-transport';
  import type { ScenarioOperation } from '$lib/mobility/scenario-contracts';
  import type { AddServiceSelection } from '$lib/mobility/service-catalog';

  import { themeColor, themeColorChannels, themeToken } from '$lib/config/theme/theme-tokens';
  import { createMapDataClient } from '$lib/mobility/map-data-client';
  import { SERVICE_DRAG_MIME, serviceCatalogEntry } from '$lib/mobility/service-catalog';
  import { serviceMarkerLabel } from '$lib/mobility/service-icons';

  import { Button } from '$components/ui/button';

  import { config } from '$config';

  import IslandConnectionControls from './island-connection-controls.svelte';
  import { createIslandConnectionLayers, ISLAND_CONNECTION_HIT_LAYER_IDS } from './island-connection-layers';
  import { pointWithinGeometryGrace } from './island-geometry';
  import IslandScoreCard from './island-score-card.svelte';
  import { ISLAND_DEMAND_CATEGORIES } from './island-services';
  import {
    buildZoomInterpolation,
    NATIONAL_ISLAND_FILL_OPACITY_STOPS,
    NATIONAL_ISLAND_FILL_START_ZOOM,
    NATIONAL_SCORE_FIELD_OPACITY_STOPS,
    NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM
  } from './national-accessibility-map-style';
  import NationalScoreCard from './national-score-card.svelte';
  import { presentationRoutePosition, presentationRouteReveal } from './presentation-route';
  import { presentationEvidenceIslandId } from './presentation-story';
  import PresentationStoryPanel from './presentation-story-panel.svelte';
  import { presentationTimelineForStep } from './presentation-timeline';
  import {
    createPresentationVehicle,
    preloadPresentationVehicles,
    presentationVehicleBearing
  } from './presentation-vehicle';
  import ProposalLauncher from './proposal-launcher.svelte';
  import ProposalLocationMarker from './proposal-location-marker.svelte';
  import ProposalMapControls from './proposal-map-controls.svelte';
  import { newProposalOperationId, ProposalWorkspace } from './proposal-workspace.svelte';
  import { SCORE_MOODS } from './score-presentation';
  import ServiceClusterMarker from './service-cluster-marker.svelte';
  import ServiceDetailsPopup from './service-details-popup.svelte';
  import ServiceMapMarker from './service-map-marker.svelte';
  import {
    clusterMarkerLabel,
    EMPTY_SERVICE_MARKERS,
    isProposalServiceMarker,
    SERVICE_MARKER_ANCHOR_LAYER_ID,
    SERVICE_MARKER_CLUSTER_MAX_ZOOM,
    SERVICE_MARKER_CLUSTER_RADIUS,
    SERVICE_MARKER_COLORS,
    SERVICE_MARKER_SOURCE_ID,
    serviceMarkerCollection,
    serviceMarkerPositionsMatch
  } from './service-marker-clustering';

  type Coordinate = [number, number];

  type Props = {
    presentationActive?: boolean;
    presentationStep?: PresentationStep | null;
    readerMode?: boolean;
  };

  let { presentationActive = false, presentationStep = null, readerMode = false }: Props = $props();

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
    element: HTMLElement | null;
    coordinates: Coordinate;
    scale: number | null;
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

  type PresentationRestoreState = {
    center: Coordinate;
    zoom: number;
    padding: PaddingOptions;
    selectedIslandId: string | null;
    selectedDemandCategory: IslandDemandCategory;
    analyticsOpen: boolean;
    islandAnalyticsOpen: boolean;
    proposalMode: boolean;
  };

  type PresentationPhase = 'idle' | 'entering' | 'travelling' | 'arriving' | 'settled';

  const EMPTY_ISLAND_COLLECTION: IslandCollection = { type: 'FeatureCollection', features: [] };
  const EMPTY_SERVICE_HEXES: IslandServiceHexes = { type: 'FeatureCollection', features: [] };
  const EMPTY_PRESENTATION_MAP: PresentationStep['mapData'] = { type: 'FeatureCollection', features: [] };
  const EMPTY_TRANSPORT_PLANS: readonly ProposalTransportPlan[] = [];
  const STORY_CAMERA_DURATION = 1100;
  const STORY_UI_LEAD = 320;
  const STORY_SCROLL_DURATION = 760;
  const STORY_JOURNEY_DEFAULT_DURATION = 2200;
  const STORY_JOURNEY_DEFAULT_START_DURATION = 700;
  const STORY_JOURNEY_DEFAULT_OVERVIEW_DURATION = 900;
  const STORY_JOURNEY_SCROLL_PAUSE = 180;
  const PRESENTATION_ISLAND_CLEAR_PAUSE = 280;
  const SELECTED_DEMAND_HEX_OPACITY = 1;
  const SELECTED_SERVICE_MARKER_GRACE_METERS = 150;
  const SELECTED_ISLAND_FILL_COLOR = themeColor('--mobility-map-demand-0');
  const SELECTED_ISLAND_FILL_OPACITY = 0.92;
  const SELECTED_ISLAND_LOADING_START_COLOR = themeColor('--mobility-map-text');
  const SELECTED_ISLAND_LOADING_MID_COLOR = themeColor('--mobility-map-road-casing');
  const SELECTED_ISLAND_LOADING_END_COLOR = themeColor('--mobility-map-halo');
  const SELECTED_ISLAND_LOADING_MIN_OPACITY = 0.22;
  const SELECTED_ISLAND_LOADING_MAX_OPACITY = 0.46;
  const SELECTED_ISLAND_LOADING_INTERVAL = 72;
  const SELECTED_ISLAND_LOADING_CYCLE = 1200;
  const SELECTED_DEMAND_REVEAL_DURATION = 1500;
  const SELECTED_DEMAND_REVEAL_INTERVAL = 96;
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
  let islandDockElement = $state<HTMLDivElement>();
  let viewportWidth = $state(1280);
  let mapInstance: MapLibreMap | null = null;
  let maplibreMarkerConstructor: typeof import('maplibre-gl').Marker | null = null;
  let maplibrePopupConstructor: typeof import('maplibre-gl').Popup | null = null;
  let mapStyleController: AbortController | null = null;
  let baseRoadLayerIds = $state<string[]>([]);
  let mapReady = $state(false);
  let heatmapLoading = $state(true);
  let heatmapError = $state(false);
  let loadingMessage = $state<(typeof LOADING_MESSAGES)[number]>(LOADING_MESSAGES[0]);
  const mapData = createMapDataClient();
  let islandCollection = $state.raw<IslandCollection>(EMPTY_ISLAND_COLLECTION);
  let islandOverviewLoaded = false;
  let islandOverviewLoading = false;
  let islandDetailLoaded = false;
  let islandDetailLoading = $state(false);
  let islandDetailRequest: Promise<void> | null = null;
  let analyticsOpen = $state(false);
  let islandAnalyticsOpen = $state(false);
  let mapLayersOpen = $state(false);
  let proposalMode = $state(false);
  let selectedIslandId = $state<string | null>(null);
  let islandDockOccluded = $derived(selectedIslandId !== null && islandAnalyticsOpen && viewportWidth <= 1024);
  let analyticsLoading = $state(false);
  let analyticsError = $state<string | null>(null);
  let analyticsData = $state.raw<AnalyticsData | null>(null);
  let islandProfile = $state.raw<IslandProfile | null>(null);
  let islandProfileLoading = $state(false);
  let islandProfileError = $state<string | null>(null);
  let islandProfileRequest = 0;
  let presentationProfile = $state.raw<IslandProfile | null>(null);
  let presentationProfileLoading = $state(false);
  let presentationProfileError = $state<string | null>(null);
  let presentationProfileRequest = 0;
  let presentationEvidenceId = $derived(
    presentationActive && presentationStep ? presentationEvidenceIslandId(presentationStep) : null
  );
  let presentationIsland = $derived(
    analyticsData?.islands.find((island) => island.id === presentationEvidenceId) ?? null
  );
  let islandServices = $state.raw<IslandServicesResponse | null>(null);
  let islandServicesLoading = $state(false);
  let islandServicesError = $state<string | null>(null);
  let islandServicesRequest = 0;
  let islandConnections = $state.raw<IslandConnectionsResponse | null>(null);
  let islandConnectionsLoading = $state(false);
  let islandConnectionsError = $state<string | null>(null);
  let islandConnectionsRequest = 0;
  let showConnectionRoutes = $state(true);
  let showInboundConnections = $state(false);
  let focusedInboundOriginId = $state<string | null>(null);
  let connectionLayers: ReturnType<typeof createIslandConnectionLayers> | null = null;
  let selectedDemandCategory = $state<IslandDemandCategory>('all');
  let proposalQuery = $state('');
  let proposalServiceFilter = $state<ProposalServiceFilter>('all');
  const proposal = new ProposalWorkspace();
  let proposalPending = $derived(proposal.pending);
  let activeDemandCategory = $derived(proposalMode ? proposal.comparisonLens : selectedDemandCategory);
  let moveServiceId = $state<string | null>(null);
  let addServiceDraft = $state<AddServiceSelection | null>(null);
  let serviceDragOverMap = $state(false);
  let proposalLocationMarker: MapLibreMarker | null = null;
  let proposalLocationComponent: ReturnType<typeof mount> | null = null;
  let selectedProposalCellId = $state<string | null>(null);
  let suppressMapClickUntil = 0;
  // MapLibre marker instances are imperative bookkeeping, not rendered Svelte state.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let mountedServiceMarkers = new Map<string, MountedServiceMarker>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let serviceMarkerServices = new Map<string, IslandMapService>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let clusteredMarkerServices = new Map<string, IslandMapService>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let individualProposalServices = new Map<string, IslandMapService>();
  let serviceMarkerSyncFrame: number | null = null;
  let serviceMarkerSourceDirty = false;
  let lastServiceMarkerSync = -Infinity;
  let serviceGeometry: IslandFeature['geometry'] | null = null;
  let serviceGeometryMembership = new WeakMap<IslandMapService, boolean>();
  const appliedSourceData = new WeakMap<GeoJSONSource, unknown>();
  const presentationMapData = new WeakMap<PresentationStep, PresentationStep['mapData']>();
  let selectedIslandLoadingTimer: number | null = null;
  let demandRevealTimer: number | null = null;
  let demandRevealToken = 0;
  let demandRevealProgress = 1;
  let serviceFocusToken = 0;
  let activeServicePopup: MountedServicePopup | null = null;
  let presentationRestoreState: PresentationRestoreState | null = null;
  let appliedPresentationStepId: string | null = null;
  let storyFocusStepId = $state<string | null>(null);
  let presentationReadyStepId = $state<string | null>(null);
  let storyAnimationToken = 0;
  let storyScrollFrame: number | null = null;
  let storyScrollResolve: ((completed: boolean) => void) | null = null;
  let storyDelayTimeout: number | null = null;
  let storyDelayResolve: ((completed: boolean) => void) | null = null;
  let presentationTransitionToken = 0;
  let presentationJourneyToken = 0;
  let presentationJourneyFrame: number | null = null;
  let presentationJourneyResolve: ((completed: boolean) => void) | null = null;
  let presentationVehicleMarker: PresentationVehicleMarker | null = null;
  let presentationCameraCleanup: (() => void) | null = null;
  let presentationPhase = $state<PresentationPhase>('idle');
  let presentationProgress = $state(0);
  let presentationProgressStepId = $state<string | null>(null);
  let currentPresentationProgress = $derived(
    presentationStep?.id === presentationProgressStepId ? presentationProgress : 0
  );
  let presentationTimeline = $derived(
    presentationTimelineForStep(presentationStep?.id ?? '', currentPresentationProgress)
  );
  let nationalMetrics = $derived([
    { key: 'health', label: 'Health', value: analyticsData?.national.categories.health?.score },
    { key: 'education', label: 'Schools', value: analyticsData?.national.categories.education?.score },
    { key: 'transport', label: 'Getting around', value: analyticsData?.national.categories.transport?.score },
    { key: 'employment', label: 'Jobs', value: analyticsData?.national.categories.employment?.score },
    { key: 'sustainability', label: 'Sustainability', value: analyticsData?.national.categories.sustainability?.score }
  ]);
  let selectedIsland = $derived(analyticsData?.islands.find((island) => island.id === selectedIslandId) ?? null);
  let selectedIslandLoading = $derived(
    selectedIslandId !== null && (analyticsLoading || islandProfileLoading || islandServicesLoading)
  );

  function premiumLoadingExit(_node: Element, { duration = 220 }: { duration?: number } = {}) {
    const transitionDuration = prefersReducedMotion.current ? 0 : duration;

    return {
      duration: transitionDuration,
      easing: cubicOut,
      css: (t: number) => `opacity: ${t};`
    };
  }

  function filterProposalServices(services: readonly IslandMapService[]): IslandMapService[] {
    const normalizedQuery = proposalQuery.trim().toLowerCase();
    return services.filter((service) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${service.name ?? ''} ${service.subtype} ${service.id}`.toLowerCase().includes(normalizedQuery);
      const matchesType = proposalServiceFilter === 'all' || service.serviceType === proposalServiceFilter;
      return matchesQuery && matchesType;
    });
  }

  let proposalMapDisplay = $derived(proposal.display);
  const proposalLocationPresentation = $derived.by(() => {
    const staged = proposal.staged;
    const operation = staged?.operations.at(-1);
    const service =
      operation && 'serviceId' in operation
        ? proposalMapDisplay?.services.find((entry) => entry.id === operation.serviceId)
        : null;
    return {
      serviceType: operation?.kind === 'add_service' ? operation.serviceType : (service?.serviceType ?? 'transport'),
      subtype: operation?.kind === 'add_service' ? operation.subtype : (service?.subtype ?? 'public_transport'),
      label: staged?.label ?? 'Pending proposal location',
      status: proposal.pending
        ? 'Checking location…'
        : staged?.error
          ? 'Placement needs attention'
          : staged?.preview?.costs.withinBudget === false
            ? 'Over budget · review costs'
            : 'Confirm in proposal'
    };
  });
  let visibleProposalServices = $derived.by(() => {
    const services = filterProposalServices(proposalMapDisplay?.services ?? []);
    const staged = proposal.staged;
    if (proposal.comparisonView !== 'after' || !staged || staged.suggestions) return services;
    const operation = staged.operations.at(-1);
    const pendingServiceId =
      operation?.kind === 'add_service'
        ? `draft:${operation.operationId}`
        : operation && 'serviceId' in operation
          ? operation.serviceId
          : null;
    // The pending pin already represents this point. Restoring the service when
    // staged clears also triggers reconciliation when the accepted preview is
    // the same object that was already displayed before confirmation.
    return pendingServiceId ? services.filter((service) => service.id !== pendingServiceId) : services;
  });
  let proposalTransportPlans = $derived.by(() => {
    if (!proposalMode || proposal.comparisonView !== 'after') return EMPTY_TRANSPORT_PLANS;
    const plans = (proposal.staged?.preview ?? proposal.accepted)?.transportPlans;
    return plans?.length ? plans : EMPTY_TRANSPORT_PLANS;
  });
  let selectedProposalArea = $derived.by(() => {
    if (!selectedProposalCellId) return null;
    const property =
      proposal.comparisonLens === 'health'
        ? 'healthWeight'
        : proposal.comparisonLens === 'education'
          ? 'educationWeight'
          : 'transportWeight';
    const before = proposal.baseline?.hexes.features.find((feature) => String(feature.id) === selectedProposalCellId);
    const proposed = proposal.comparisonView === 'after' ? proposal.display : proposal.accepted;
    const after = proposed?.hexes.features.find((feature) => String(feature.id) === selectedProposalCellId);
    return {
      id: selectedProposalCellId,
      before: before?.properties[property] ?? null,
      after: after?.properties[property] ?? null,
      label: `${demandCategoryLabel(proposal.comparisonLens)} demand pressure${proposed === proposal.staged?.preview ? ' · pending preview' : ''}`
    };
  });

  function selectIslandById(id: string, centroid?: Coordinate): void {
    if (proposalPending) return;
    if (proposalMode && selectedIslandId && selectedIslandId !== id) {
      closeServicePopup();
      stopMoveMode();
      stopAddServiceMode();
      proposal.suspend();
      selectedProposalCellId = null;
    }
    selectedIslandId = id;
    selectedDemandCategory = 'all';
    analyticsOpen = false;
    islandAnalyticsOpen = false;
    mapLayersOpen = false;
    focusedInboundOriginId = null;
    showConnectionRoutes = true;
    showInboundConnections = false;
    prepareSelectedIslandOverlay(id);
    void loadIslandGeometry(true);
    void loadIslandProfile(id);
    void loadIslandServices(id);
    void loadIslandConnections(id);

    const island = islandCollection.features.find((feature) => feature.properties.id === id);
    void tick().then(() => {
      if (selectedIslandId !== id) return;
      void focusIsland({
        id,
        name: island?.properties.name ?? selectedIsland?.name ?? 'Island',
        atollName: island?.properties.atollName ?? selectedIsland?.atollName ?? '',
        centroid: island?.properties.centroid ?? centroid,
        score: island?.properties.score ?? selectedIsland?.overall.score ?? null
      });
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
    const width = mapElement?.clientWidth ?? viewportWidth;
    const isMobile = width <= 640;
    if (isMobile) {
      const height = mapElement?.clientHeight ?? 800;
      const dockHeight = islandDockOccluded ? 0 : (islandDockElement?.offsetHeight ?? 300);
      return { top: Math.min(dockHeight + 24, Math.max(24, height - 160)), right: 24, bottom: 32, left: 24 };
    }
    const left = islandAnalyticsOpen && width <= 1024 ? 24 : 350;
    const right = islandAnalyticsOpen ? Math.min(520, Math.max(24, width - left - 144)) : 48;
    return { top: 60, right, bottom: 48, left };
  }

  function proposalCameraPadding(): Required<PaddingOptions> {
    const height = mapElement?.clientHeight ?? 800;
    return (mapElement?.clientWidth ?? 0) <= 640
      ? { top: 24, right: 24, bottom: Math.min(height * 0.52 + 144, height - 120), left: 24 }
      : { top: 40, right: 32, bottom: 144, left: 430 };
  }

  function proposalCameraOffset(): [number, number] {
    const padding = proposalCameraPadding();
    return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
  }

  function fitProposalIsland(): void {
    if (!proposalMode || !mapInstance || !selectedIslandId) return;
    const feature = islandCollection.features.find((island) => island.properties.id === selectedIslandId);
    const bounds = feature ? islandBounds(feature) : null;
    if (!bounds) return;
    mapInstance.fitBounds(bounds, {
      padding: proposalCameraPadding(),
      maxZoom: 15,
      duration: prefersReducedMotion.current ? 0 : 450,
      linear: true
    });
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
    islandConnections = null;
    islandConnectionsError = null;
    islandConnectionsLoading = false;
    islandConnectionsRequest += 1;
    focusedInboundOriginId = null;
    resetSelectedIslandOverlay();
  }

  function showNationalMap(): void {
    returnToNational();
    mapInstance?.easeTo({
      center: MALDIVES_CENTER,
      zoom: 5.2,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      duration: prefersReducedMotion.current ? 0 : 500
    });
  }

  async function loadIslandConnections(id: string, refresh = false): Promise<void> {
    const requestId = ++islandConnectionsRequest;
    islandConnections = null;
    islandConnectionsLoading = true;
    islandConnectionsError = null;
    try {
      const data = await mapData.request<IslandConnectionsResponse>(
        `/api/map/islands/${encodeURIComponent(id)}/connections`,
        { refresh }
      );
      if (requestId === islandConnectionsRequest && selectedIslandId === id) islandConnections = data;
    } catch (error) {
      if (requestId === islandConnectionsRequest) {
        islandConnectionsError = error instanceof Error ? error.message : 'Connections could not be loaded.';
      }
    } finally {
      if (requestId === islandConnectionsRequest) islandConnectionsLoading = false;
    }
  }

  function fitIslandConnections(view: 'routes' | 'inbound' | 'all' = 'routes'): void {
    if (!mapInstance || !connectionLayers) return;
    const bounds = connectionLayers.bounds(view);
    if (!bounds) return;
    mapInstance.fitBounds(bounds, {
      padding: islandCameraPadding(),
      maxZoom: 14.5,
      duration: prefersReducedMotion.current ? 0 : 500
    });
  }

  function exploreIslandConnections(): void {
    islandAnalyticsOpen = false;
    mapLayersOpen = true;
    showConnectionRoutes = true;
    showInboundConnections = true;
    void tick().then(() => fitIslandConnections('routes'));
  }

  function focusInboundOrigin(id: string | null): void {
    focusedInboundOriginId = id;
    if (id) {
      showInboundConnections = true;
      void tick().then(() => fitIslandConnections('inbound'));
    }
  }

  function refocusSelectedIsland(): void {
    if (!selectedIslandId) return;
    const feature = islandCollection.features.find((island) => island.properties.id === selectedIslandId);
    if (!feature) return;
    focusedInboundOriginId = null;
    void focusIsland(
      {
        ...feature.properties,
        centroid: feature.properties.centroid,
        score: feature.properties.score
      },
      500
    );
  }

  function presentationCameraPadding(): { top: number; right: number; bottom: number; left: number } {
    const width = mapElement?.clientWidth ?? 1280;
    const height = mapElement?.clientHeight ?? 800;
    if (width <= 700 && height > 600)
      return { top: 24, right: 24, bottom: Math.min(height * 0.9, height - 140) + 24, left: 24 };
    if (width <= 700) return { top: 24, right: 24, bottom: 24, left: 24 };
    const panelWidth = Math.min(760, Math.max(460, width * 0.44));
    return { top: 48, right: panelWidth + 40, bottom: 48, left: 24 };
  }

  function presentationBounds(coordinates: readonly Coordinate[]): [Coordinate, Coordinate] | null {
    if (coordinates.length < 2) return null;

    let west = coordinates[0][0];
    let south = coordinates[0][1];
    let east = coordinates[0][0];
    let north = coordinates[0][1];

    for (const [longitude, latitude] of coordinates.slice(1)) {
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

  function visibleJourneyCoordinates(coordinates: readonly Coordinate[], progress: number): Coordinate[] {
    return presentationRouteReveal(coordinates, progress);
  }

  function journeyCoordinateAtProgress(coordinates: readonly Coordinate[], progress: number): Coordinate {
    return presentationRoutePosition(coordinates, progress, MALDIVES_CENTER);
  }

  function presentationMapDataForStep(step: PresentationStep, revealProgress = 1): PresentationStep['mapData'] {
    let prepared = presentationMapData.get(step);
    if (!prepared) {
      const highlighted = new Set(step.mapHighlightIds);
      prepared = {
        type: 'FeatureCollection',
        features: step.mapData.features.map((feature) => ({
          ...feature,
          properties: { ...feature.properties, focus: highlighted.has(feature.id) }
        }))
      };
      presentationMapData.set(step, prepared);
    }
    if (revealProgress >= 1 || !step.journey) return prepared;

    return {
      type: 'FeatureCollection',
      features: prepared.features.map((feature) => {
        if (feature.id !== step.journey?.featureId || feature.geometry.type !== 'LineString') return feature;
        return {
          ...feature,
          geometry: {
            type: 'LineString' as const,
            coordinates: visibleJourneyCoordinates(feature.geometry.coordinates, revealProgress)
          }
        };
      })
    };
  }

  function applyPresentationCamera(step: PresentationStep, isCurrent: () => boolean): Promise<boolean> {
    if (!mapInstance) return Promise.resolve(false);

    const reducedMotion = prefersReducedMotion.current;
    const duration = reducedMotion ? 0 : STORY_CAMERA_DURATION;
    const bounds = step.camera.fitCoordinates
      ? presentationBounds(step.camera.fitCoordinates as readonly Coordinate[])
      : null;

    if (bounds) {
      return runPresentationCamera(
        () =>
          mapInstance?.fitBounds(bounds, {
            padding: presentationCameraPadding(),
            absolutePadding: true,
            maxZoom: step.camera.maxZoom ?? step.camera.zoom,
            duration,
            easing: storyEase,
            essential: !reducedMotion
          }),
        duration,
        isCurrent
      );
    }

    return runPresentationCamera(
      () =>
        mapInstance?.easeTo({
          center: step.camera.center,
          zoom: step.camera.zoom,
          duration,
          easing: storyEase,
          essential: !reducedMotion
        }),
      duration,
      isCurrent
    );
  }

  function storyEase(progress: number): number {
    return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
  }

  function cancelPresentationJourney(): void {
    presentationJourneyToken += 1;
    if (presentationJourneyFrame !== null) {
      window.cancelAnimationFrame(presentationJourneyFrame);
      presentationJourneyFrame = null;
    }
    presentationCameraCleanup?.();
    presentationCameraCleanup = null;
    presentationJourneyResolve?.(false);
    presentationJourneyResolve = null;
    presentationVehicleMarker?.remove();
    presentationVehicleMarker = null;
    presentationPhase = 'idle';
  }

  function cancelPresentationTransition(): void {
    presentationTransitionToken += 1;
    presentationReadyStepId = null;
    cancelPresentationJourney();
    cancelStoryAnimations();
  }

  function waitForPresentationCamera(duration: number, isCurrent: () => boolean): Promise<boolean> {
    if (duration <= 0 || !mapInstance) {
      presentationCameraCleanup?.();
      presentationCameraCleanup = null;
      return Promise.resolve(isCurrent());
    }

    const map = mapInstance;
    return new Promise((resolve) => {
      let settled = false;
      let timeout: number | null = null;
      let cleanup: () => void;
      let handleMoveEnd: () => void;

      const finish = (completed: boolean) => {
        if (settled) return;
        settled = true;
        map.off('moveend', handleMoveEnd);
        if (timeout !== null) window.clearTimeout(timeout);
        if (presentationCameraCleanup === cleanup) presentationCameraCleanup = null;
        resolve(completed && isCurrent());
      };
      handleMoveEnd = () => finish(true);
      cleanup = () => finish(false);

      presentationCameraCleanup?.();
      presentationCameraCleanup = cleanup;
      map.on('moveend', handleMoveEnd);
      timeout = window.setTimeout(() => finish(true), duration + 250);
    });
  }

  function runPresentationCamera(action: () => void, duration: number, isCurrent: () => boolean): Promise<boolean> {
    if (!mapInstance || !isCurrent()) return Promise.resolve(false);
    const completion = waitForPresentationCamera(duration, isCurrent);
    action();
    return completion;
  }

  function waitForPresentationPause(duration: number, isCurrent: () => boolean): Promise<boolean> {
    if (duration <= 0) return Promise.resolve(isCurrent());
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(isCurrent()), duration);
    });
  }

  function journeyZoom(progress: number, journey: NonNullable<PresentationStep['journey']>): number {
    const travelZoom = journey.travelZoom ?? Math.min(journey.start.zoom, journey.end.zoom) - 1;
    if (progress < 0.28) {
      const localProgress = progress / 0.28;
      return journey.start.zoom + (travelZoom - journey.start.zoom) * storyEase(localProgress);
    }
    if (progress < 0.72) return travelZoom;
    const localProgress = (progress - 0.72) / 0.28;
    return travelZoom + (journey.end.zoom - travelZoom) * storyEase(localProgress);
  }

  async function animatePresentationJourney(step: PresentationStep, transitionToken: number): Promise<boolean> {
    const journey = step.journey;
    if (!mapInstance || !journey) return false;

    const journeyToken = ++presentationJourneyToken;
    const isCurrent = () =>
      transitionToken === presentationTransitionToken &&
      journeyToken === presentationJourneyToken &&
      presentationActive &&
      presentationStep?.id === step.id &&
      mapInstance !== null;
    const reducedMotion = prefersReducedMotion.current;
    const startDuration = reducedMotion ? 0 : (journey.startDuration ?? STORY_JOURNEY_DEFAULT_START_DURATION);
    const duration = reducedMotion ? 0 : (journey.duration ?? STORY_JOURNEY_DEFAULT_DURATION);
    const overviewDuration = reducedMotion ? 0 : (journey.overviewDuration ?? STORY_JOURNEY_DEFAULT_OVERVIEW_DURATION);
    const route = step.mapData.features.find(
      (feature) => feature.id === journey.featureId && feature.geometry.type === 'LineString'
    );
    if (!route || route.geometry.type !== 'LineString') return false;
    const routeCoordinates = route.geometry.coordinates;

    if (journey.vehicle && maplibreMarkerConstructor) {
      presentationVehicleMarker = createPresentationVehicle(
        mapInstance,
        maplibreMarkerConstructor,
        journey.vehicle,
        journeyCoordinateAtProgress(routeCoordinates, 0)
      );
    }
    const vehicle = presentationVehicleMarker;
    const updateVehicle = (progress: number, moving: boolean) => {
      if (!vehicle) return;
      const position = journeyCoordinateAtProgress(routeCoordinates, progress);
      const behind = journeyCoordinateAtProgress(routeCoordinates, Math.max(0, progress - 0.003));
      const ahead = journeyCoordinateAtProgress(routeCoordinates, Math.min(1, progress + 0.003));
      vehicle.update(position, presentationVehicleBearing(behind, ahead), moving && !reducedMotion);
    };
    updateVehicle(0, false);

    presentationPhase = 'entering';
    setSourceData('presentation-map', presentationMapDataForStep(step, 0));
    if (
      !(await runPresentationCamera(
        () =>
          mapInstance?.easeTo({
            center: journey.start.center,
            zoom: journey.start.zoom,
            duration: startDuration,
            easing: storyEase,
            essential: !reducedMotion
          }),
        startDuration,
        isCurrent
      ))
    )
      return false;
    presentationPhase = 'travelling';
    const journeyZoomLevel = mapInstance.getZoom();

    const completed = await new Promise<boolean>((resolve) => {
      presentationJourneyResolve = resolve;
      const startTime = performance.now();
      let lastDataFrame = -1;
      const frame = (now: number) => {
        if (!isCurrent()) {
          presentationJourneyFrame = null;
          presentationJourneyResolve = null;
          resolve(false);
          return;
        }

        const progress = duration === 0 ? 1 : Math.min(1, (now - startTime) / duration);
        const center = journeyCoordinateAtProgress(routeCoordinates, progress);
        mapInstance?.jumpTo({
          center,
          zoom: journey.keepZoom ? journeyZoomLevel : journeyZoom(progress, journey)
        });
        // Camera and vehicle stay smooth while worker uploads and chart updates
        // run at 30 fps rather than on every display refresh (including 120 Hz).
        const dataFrame = Math.floor((now - startTime) / (1000 / 30));
        if (progress === 1 || dataFrame !== lastDataFrame) {
          lastDataFrame = dataFrame;
          presentationProgress = progress;
          setSourceData('presentation-map', presentationMapDataForStep(step, progress));
        }
        updateVehicle(progress, progress < 1);
        if (progress < 1) {
          presentationJourneyFrame = window.requestAnimationFrame(frame);
          return;
        }

        presentationJourneyFrame = null;
        presentationJourneyResolve = null;
        resolve(true);
      };

      presentationJourneyFrame = window.requestAnimationFrame(frame);
    });
    if (!completed || !isCurrent() || !mapInstance) return false;

    presentationPhase = 'arriving';
    setSourceData(
      'presentation-map',
      journey.arrivalIslandId ? EMPTY_PRESENTATION_MAP : presentationMapDataForStep(step, 1)
    );
    if (!(await waitForPresentationPause(PRESENTATION_ISLAND_CLEAR_PAUSE, isCurrent))) return false;
    if (journey.arrivalIslandId) {
      const arrivalIsland = islandCollection.features.find(
        (feature) => feature.properties.id === journey.arrivalIslandId
      );
      const cameraCompleted = arrivalIsland
        ? await focusPresentationIsland(journey.arrivalIslandId, overviewDuration, isCurrent)
        : await runPresentationCamera(
            () =>
              mapInstance?.easeTo({
                center: journey.overview.center,
                zoom: journey.overview.zoom,
                duration: overviewDuration,
                easing: storyEase,
                essential: !reducedMotion
              }),
            overviewDuration,
            isCurrent
          );
      if (!cameraCompleted || !isCurrent()) return false;
      activatePresentationIsland(journey.arrivalIslandId);
    } else if (
      !(await runPresentationCamera(
        () =>
          mapInstance?.easeTo({
            center: journey.overview.center,
            zoom: journey.overview.zoom,
            duration: overviewDuration,
            easing: storyEase,
            essential: !reducedMotion
          }),
        overviewDuration,
        isCurrent
      ))
    ) {
      return false;
    }

    presentationPhase = 'settled';
    vehicle?.remove();
    if (presentationVehicleMarker === vehicle) presentationVehicleMarker = null;
    return true;
  }

  function cancelStoryAnimations(): void {
    storyAnimationToken += 1;
    if (storyScrollFrame !== null) {
      window.cancelAnimationFrame(storyScrollFrame);
      storyScrollFrame = null;
    }
    storyScrollResolve?.(false);
    storyScrollResolve = null;
    if (storyDelayTimeout !== null) {
      window.clearTimeout(storyDelayTimeout);
      storyDelayTimeout = null;
    }
    storyDelayResolve?.(false);
    storyDelayResolve = null;
  }

  function animatePresentationClock(step: PresentationStep, isCurrent: () => boolean): Promise<boolean> {
    const duration = prefersReducedMotion.current ? 0 : (step.timing?.playbackDuration ?? 0);
    presentationPhase = 'travelling';
    return new Promise((resolve) => {
      presentationJourneyResolve = resolve;
      const started = performance.now();
      let lastDataFrame = -1;
      const frame = (now: number) => {
        if (!isCurrent()) {
          presentationJourneyFrame = null;
          presentationJourneyResolve = null;
          resolve(false);
          return;
        }
        const progress = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
        const dataFrame = Math.floor((now - started) / (1000 / 30));
        if (progress === 1 || dataFrame !== lastDataFrame) {
          lastDataFrame = dataFrame;
          presentationProgress = progress;
        }
        if (progress < 1) {
          presentationJourneyFrame = window.requestAnimationFrame(frame);
          return;
        }
        presentationJourneyFrame = null;
        presentationJourneyResolve = null;
        resolve(true);
      };
      presentationJourneyFrame = window.requestAnimationFrame(frame);
    });
  }

  function startStoryAnimation(): number {
    cancelStoryAnimations();
    return storyAnimationToken;
  }

  function storyDelay(duration: number, token: number): Promise<boolean> {
    if (duration <= 0) return Promise.resolve(token === storyAnimationToken);
    return new Promise((resolve) => {
      if (storyDelayTimeout !== null) window.clearTimeout(storyDelayTimeout);
      storyDelayResolve?.(false);
      storyDelayResolve = resolve;
      storyDelayTimeout = window.setTimeout(() => {
        storyDelayTimeout = null;
        storyDelayResolve = null;
        resolve(token === storyAnimationToken);
      }, duration);
    });
  }

  function animateStoryScroll(target: HTMLElement, token: number): Promise<boolean> {
    const container = target.closest<HTMLElement>('[data-story-scroll-container]');
    if (!container) {
      target.scrollIntoView({
        behavior: prefersReducedMotion.current ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest'
      });
      return Promise.resolve(token === storyAnimationToken);
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop =
      container.scrollTop +
      targetRect.top -
      containerRect.top -
      Math.max(0, (container.clientHeight - targetRect.height) / 2);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const startTop = container.scrollTop;
    const endTop = Math.min(maxScrollTop, Math.max(0, targetTop));

    if (prefersReducedMotion.current || Math.abs(endTop - startTop) < 1) {
      container.scrollTop = endTop;
      return Promise.resolve(token === storyAnimationToken);
    }

    return new Promise((resolve) => {
      storyScrollResolve = resolve;
      const startTime = performance.now();
      const frame = (now: number) => {
        if (token !== storyAnimationToken) {
          storyScrollFrame = null;
          storyScrollResolve = null;
          resolve(false);
          return;
        }

        const progress = Math.min(1, (now - startTime) / STORY_SCROLL_DURATION);
        container.scrollTop = startTop + (endTop - startTop) * storyEase(progress);
        if (progress < 1) {
          storyScrollFrame = window.requestAnimationFrame(frame);
          return;
        }

        storyScrollFrame = null;
        storyScrollResolve = null;
        resolve(true);
      };

      storyScrollFrame = window.requestAnimationFrame(frame);
    });
  }

  function updateStoryUiHighlights(targets: readonly string[]): void {
    const targetSet = new Set(targets);
    document.querySelectorAll<HTMLElement>('[data-story-target]').forEach((element) => {
      const target = element.dataset.storyTarget;
      element.toggleAttribute('data-story-focus', target ? targetSet.has(target) : false);
    });
  }

  async function focusStoryUi(step: PresentationStep): Promise<boolean> {
    const token = startStoryAnimation();
    try {
      if (analyticsOpen) await import('./national-analytics-card.svelte');
      if (islandAnalyticsOpen) await import('./island-analytics-card.svelte');
    } catch {
      return false;
    }
    await tick();
    if (!presentationActive || presentationStep?.id !== step.id) return false;
    if (!(await storyDelay(STORY_UI_LEAD, token))) return false;
    if (!presentationActive || presentationStep?.id !== step.id) return false;

    const scrollTargets = step.scrollTargets ?? [];
    updateStoryUiHighlights(step.uiTargets);

    if (scrollTargets.length === 0) {
      storyFocusStepId = step.id;
      return true;
    }

    for (const [index, scrollTarget] of scrollTargets.entries()) {
      const target = document.querySelector<HTMLElement>(`[data-story-target="${scrollTarget}"]`);
      if (!target) return false;
      if (!(await animateStoryScroll(target, token))) return false;
      updateStoryUiHighlights([...step.uiTargets, scrollTarget]);
      if (index < scrollTargets.length - 1 && !(await storyDelay(STORY_JOURNEY_SCROLL_PAUSE, token))) return false;
    }
    storyFocusStepId = step.id;
    return true;
  }

  function clearStoryUiHighlights(): void {
    document.querySelectorAll<HTMLElement>('[data-story-focus]').forEach((element) => {
      element.removeAttribute('data-story-focus');
    });
    storyFocusStepId = null;
  }

  function savePresentationState(): void {
    if (!mapInstance || presentationRestoreState) return;
    const center = mapInstance.getCenter();
    presentationRestoreState = {
      center: [center.lng, center.lat],
      zoom: mapInstance.getZoom(),
      padding: mapInstance.getPadding(),
      selectedIslandId,
      selectedDemandCategory,
      analyticsOpen,
      islandAnalyticsOpen,
      proposalMode
    };
  }

  async function runPresentationStep(step: PresentationStep, transitionToken: number): Promise<void> {
    const isCurrent = () =>
      transitionToken === presentationTransitionToken &&
      presentationActive &&
      presentationStep?.id === step.id &&
      mapInstance !== null;

    let cameraCompleted: boolean;
    if (step.journey) {
      cameraCompleted = await animatePresentationJourney(step, transitionToken);
    } else if (step.selectedIslandId) {
      cameraCompleted = await focusPresentationIsland(step.selectedIslandId, STORY_CAMERA_DURATION, isCurrent);
      if (!cameraCompleted && isCurrent()) cameraCompleted = await applyPresentationCamera(step, isCurrent);
    } else {
      cameraCompleted = await applyPresentationCamera(step, isCurrent);
    }

    if (!cameraCompleted || !isCurrent()) return;

    if (step.selectedIslandId && !step.journey) {
      presentationPhase = 'arriving';
      setSourceData('presentation-map', EMPTY_PRESENTATION_MAP);
      if (!(await waitForPresentationPause(PRESENTATION_ISLAND_CLEAR_PAUSE, isCurrent))) return;
      activatePresentationIsland(step.selectedIslandId);
    }

    if (!step.journey && step.timing && !(await animatePresentationClock(step, isCurrent))) return;
    presentationProgress = 1;

    if (!isCurrent()) return;
    presentationPhase = 'settled';
    await tick();
    if (isCurrent()) presentationReadyStepId = step.id;
  }

  function applyPresentationStep(step: PresentationStep): void {
    if (!mapInstance) return;

    cancelPresentationTransition();
    mapInstance.stop();
    clearStoryUiHighlights();
    closeServicePopup();
    stopMoveMode();
    stopAddServiceMode();
    proposal.suspend();
    proposalMode = false;
    presentationPhase = 'entering';
    presentationProgressStepId = step.id;
    presentationProgress = 0;
    analyticsOpen = false;
    islandAnalyticsOpen = false;
    storyFocusStepId = null;
    returnToNational();
    mapInstance.setPadding(presentationCameraPadding());
    setLayerVisibility('island-labels', 'none');

    setSourceData('presentation-map', presentationMapDataForStep(step, step.journey ? 0 : 1));
    void runPresentationStep(step, presentationTransitionToken);
  }

  function restoreAfterPresentation(): void {
    cancelPresentationTransition();
    if (!mapInstance) return;
    mapInstance.stop();
    presentationPhase = 'idle';
    const restore = presentationRestoreState;
    presentationRestoreState = null;
    appliedPresentationStepId = null;
    clearStoryUiHighlights();
    setLayerVisibility('island-labels', 'visible');
    setSourceData('presentation-map', EMPTY_PRESENTATION_MAP);
    stopMoveMode();
    stopAddServiceMode();

    if (restore?.selectedIslandId) {
      selectedIslandId = restore.selectedIslandId;
      selectedDemandCategory = restore.selectedDemandCategory;
      prepareSelectedIslandOverlay(restore.selectedIslandId);
      void loadIslandProfile(restore.selectedIslandId);
      void loadIslandServices(restore.selectedIslandId);
      analyticsOpen = restore.analyticsOpen;
      islandAnalyticsOpen = restore.islandAnalyticsOpen;
      proposalMode = restore.proposalMode;
    } else {
      returnToNational();
      selectedDemandCategory = restore?.selectedDemandCategory ?? 'all';
      analyticsOpen = restore?.analyticsOpen ?? false;
    }

    if (!restore) return;
    const reducedMotion = prefersReducedMotion.current;
    mapInstance.easeTo({
      center: restore.center,
      zoom: restore.zoom,
      padding: restore.padding,
      duration: reducedMotion ? 0 : 700,
      essential: !reducedMotion
    });
  }

  function focusIsland(
    island: IslandSearchOption,
    duration = 850,
    isCurrent: () => boolean = () => true
  ): Promise<boolean> {
    if (!mapInstance || !island.centroid) return Promise.resolve(false);
    const map = mapInstance;
    const reducedMotion = prefersReducedMotion.current;
    const feature = islandCollection.features.find((candidate) => candidate.properties.id === island.id);
    const bounds = feature ? islandBounds(feature) : null;

    if (bounds) {
      const padding = presentationActive ? presentationCameraPadding() : islandCameraPadding();
      const camera = mapInstance.cameraForBounds(bounds, {
        padding,
        absolutePadding: presentationActive,
        maxZoom: 14
      });
      const currentZoom = mapInstance.getZoom();

      if (camera?.center) {
        const fittedZoom = camera.zoom ?? currentZoom;
        const keepCurrentZoom = fittedZoom < currentZoom && boundsFitAtCurrentZoom(bounds, padding);
        return runPresentationCamera(
          () =>
            map.easeTo({
              center: camera.center,
              zoom: keepCurrentZoom ? currentZoom : fittedZoom,
              duration: reducedMotion ? 0 : duration,
              essential: !reducedMotion
            }),
          reducedMotion ? 0 : duration,
          isCurrent
        );
      }
    }

    return runPresentationCamera(
      () =>
        map.flyTo({
          center: island.centroid!,
          zoom: Math.max(map.getZoom(), 10),
          duration: reducedMotion ? 0 : duration,
          essential: !reducedMotion
        }),
      reducedMotion ? 0 : duration,
      isCurrent
    );
  }

  function focusPresentationIsland(
    id: string,
    duration = 850,
    isCurrent: () => boolean = () => true
  ): Promise<boolean> {
    const island = islandCollection.features.find((feature) => feature.properties.id === id);
    if (!island) return Promise.resolve(false);
    if (!island.properties.centroid) return Promise.resolve(isCurrent());

    return focusIsland(
      {
        id,
        name: island.properties.name,
        atollName: island.properties.atollName,
        centroid: island.properties.centroid,
        score: island.properties.score
      },
      duration,
      isCurrent
    );
  }

  async function focusService(service: IslandMapService): Promise<void> {
    const coordinates = service.coordinates;
    if (!mapInstance || !coordinates) return;

    if (proposalMode) {
      proposal.comparisonView = 'after';
      proposalQuery = '';
      proposalServiceFilter = 'all';
      await tick();
      if (!mapInstance) return;
    }

    closeServicePopup();
    const focusToken = serviceFocusToken;
    const reducedMotion = prefersReducedMotion.current;
    mapInstance.easeTo({
      center: coordinates,
      zoom: Math.max(mapInstance.getZoom(), 15.5),
      offset: proposalMode ? proposalCameraOffset() : [0, 0],
      duration: reducedMotion ? 0 : 650,
      essential: !reducedMotion
    });

    const openFocusedService = () => {
      if (focusToken !== serviceFocusToken || !mapInstance) return;
      if (proposalMode || serviceMarkerServices.has(service.id)) openServicePopup(service);
    };
    if (mapInstance.getZoom() > SERVICE_MARKER_CLUSTER_MAX_ZOOM) openFocusedService();
    else mapInstance.once('idle', openFocusedService);
  }

  function selectSearchIsland(island: IslandSearchOption): void {
    selectIslandById(island.id, island.centroid);
  }

  function focusAnalyticsIsland(island: AnalyticsIsland): void {
    selectIslandById(island.id, island.centroid);
  }

  function activatePresentationIsland(id: string): void {
    selectedIslandId = id;
    selectedDemandCategory = 'transport';
    analyticsOpen = false;
    islandAnalyticsOpen = false;
    islandProfile = null;
    islandProfileError = null;
    islandServices = null;
    islandServicesError = null;
    islandProfileRequest += 1;
    islandServicesRequest += 1;
    prepareSelectedIslandOverlay(id);
    void loadIslandProfile(id);
    if (!analyticsData) void loadAnalytics();
  }

  async function loadAnalytics(refresh = false): Promise<void> {
    if (analyticsLoading || (analyticsData && !refresh)) return;
    analyticsLoading = true;
    analyticsError = null;
    try {
      analyticsData = await mapData.request<AnalyticsData>('/api/map/analytics', { refresh });
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
      const profile = await mapData.request<IslandProfile>(`/api/map/islands/${encodeURIComponent(id)}/profile`);
      if (requestId === islandProfileRequest) islandProfile = profile;
    } catch (error) {
      if (requestId === islandProfileRequest) {
        islandProfileError = error instanceof Error ? error.message : 'Island profile could not be loaded.';
      }
    } finally {
      if (requestId === islandProfileRequest) islandProfileLoading = false;
    }
  }

  async function loadPresentationProfile(id: string, refresh = false): Promise<void> {
    const requestId = ++presentationProfileRequest;
    presentationProfile = null;
    presentationProfileLoading = true;
    presentationProfileError = null;
    try {
      const profile = await mapData.request<IslandProfile>(`/api/map/islands/${encodeURIComponent(id)}/profile`, {
        refresh
      });
      if (requestId === presentationProfileRequest) presentationProfile = profile;
    } catch (error) {
      if (requestId === presentationProfileRequest)
        presentationProfileError = error instanceof Error ? error.message : 'Island details could not be loaded.';
    } finally {
      if (requestId === presentationProfileRequest) presentationProfileLoading = false;
    }
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
    serviceMarkerSourceDirty = true;
    scheduleServiceMarkerFrame();
  }

  function scheduleServiceMarkerScaleSync(): void {
    scheduleServiceMarkerFrame();
  }

  function scheduleServiceMarkerViewportSync(): void {
    // Source tiles can stay unchanged during a pan. Refresh entering markers
    // without querying all source features on every camera animation frame.
    if (performance.now() - lastServiceMarkerSync >= 80) scheduleServiceMarkerSync();
  }

  function scheduleServiceMarkerFrame(): void {
    if (serviceMarkerSyncFrame !== null) return;
    serviceMarkerSyncFrame = window.requestAnimationFrame(() => {
      serviceMarkerSyncFrame = null;
      if (serviceMarkerSourceDirty) {
        serviceMarkerSourceDirty = false;
        syncServiceMarkers();
      } else {
        for (const mounted of mountedServiceMarkers.values()) updateMountedServiceMarkerScale(mounted);
      }
    });
  }

  function removeMountedServiceMarker(mounted: MountedServiceMarker, animate = false): void {
    const element = mounted.element;
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
    const scale = serviceMarkerScale(mounted.kind);
    if (mounted.scale === scale) return;
    mounted.scale = scale;
    mounted.element?.style.setProperty('--marker-scale', String(scale));
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
    if (!proposalMode || proposalPending) return;
    proposal.cancel();
    stopMoveMode();
    closeServicePopup();
    proposal.comparisonLens = selection.serviceType;
    proposal.comparisonView = 'after';
    proposalQuery = '';
    if (proposalServiceFilter !== 'all') proposalServiceFilter = selection.serviceType;
    addServiceDraft = selection;
    if (mapInstance) mapInstance.getCanvas().style.cursor = 'crosshair';
  }

  function startMoveService(service: IslandMapService): void {
    if (!proposalMode || proposalPending || !service.eligibility?.canMove) return;
    proposal.cancel();
    stopAddServiceMode();
    closeServicePopup();
    moveServiceId = service.id;
    if (mapInstance) mapInstance.getCanvas().style.cursor = 'crosshair';
  }

  function operationId(): string {
    return newProposalOperationId();
  }

  async function applyDraftOperation(operation: ScenarioOperation): Promise<void> {
    if (!selectedIslandId || proposalPending) return;
    if (!islandServices?.baselineVersion) {
      proposal.error = islandServicesLoading
        ? 'Service data is still loading. Try again in a moment.'
        : 'Service data is unavailable for this island.';
      return;
    }

    closeServicePopup();
    const service =
      'serviceId' in operation ? proposal.display?.services.find((entry) => entry.id === operation.serviceId) : null;
    const label =
      operation.kind === 'add_service'
        ? `Add ${serviceCatalogEntry(operation.serviceType, operation.subtype)?.label ?? operation.subtype}`
        : operation.kind === 'move_service'
          ? `Move ${service?.name ?? 'service'}`
          : operation.kind === 'delete_service'
            ? `Remove ${service?.name ?? 'service'}`
            : operation.kind === 'upgrade_service'
              ? `Upgrade to ${operation.targetSubtype.replaceAll('_', ' ')}`
              : operation.kind === 'downgrade_service'
                ? `Downgrade to ${operation.targetSubtype.replaceAll('_', ' ')}`
                : 'Add transport service';
    stopMoveMode();
    stopAddServiceMode();
    await proposal.stage(
      operation,
      label,
      'coordinates' in operation ? operation.coordinates : (service?.coordinates ?? undefined)
    );
    const plan = proposal.staged?.preview?.transportPlans.find((entry) => entry.operationId === operation.operationId);
    const first = plan?.geometry.coordinates[0]?.[0];
    if (first && proposal.staged) proposal.staged = { ...proposal.staged, coordinates: first };
    if (plan) focusProposalTransport(operation.operationId);
  }

  function focusProposalTransport(operationId: string): void {
    const preview = proposal.staged?.preview ?? proposal.accepted;
    const plan = preview?.transportPlans.find((entry) => entry.operationId === operationId);
    if (plan && mapInstance) {
      proposal.comparisonView = 'after';
      const points = plan.geometry.coordinates.flat();
      if (points.length) {
        const west = Math.min(...points.map((point) => point[0]));
        const east = Math.max(...points.map((point) => point[0]));
        const south = Math.min(...points.map((point) => point[1]));
        const north = Math.max(...points.map((point) => point[1]));
        mapInstance.fitBounds(
          [
            [west, south],
            [east, north]
          ],
          {
            padding: proposalCameraPadding(),
            maxZoom: 15,
            duration: prefersReducedMotion.current ? 0 : 500
          }
        );
      }
    }
  }

  function confirmProposalPlacement(): void {
    if (proposal.confirm()) {
      stopMoveMode();
      stopAddServiceMode();
    }
  }

  function cancelProposalPlacement(): void {
    proposal.cancel();
    stopMoveMode();
    stopAddServiceMode();
  }

  function duplicateProposalService(service: IslandMapService): void {
    const entry = serviceCatalogEntry(service.serviceType, service.subtype);
    if (entry)
      startAddService({
        serviceType: entry.serviceType,
        subtype: entry.subtype,
        name: service.name ? `${service.name} copy` : null
      });
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
    if (service.id.startsWith('draft:')) {
      closeServicePopup();
      void proposal.remove(service.id.slice('draft:'.length));
      return;
    }
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
    if (!proposalMode || !selectedIslandId || proposalPending) return;
    if (!event.dataTransfer?.types.includes(SERVICE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    serviceDragOverMap = true;
  }

  function handleMapDragLeave(event: DragEvent): void {
    if (!(event.relatedTarget instanceof Node) || !mapElement.contains(event.relatedTarget)) serviceDragOverMap = false;
  }

  function clearServiceDrag(): void {
    serviceDragOverMap = false;
  }

  function handleMapDrop(event: DragEvent): void {
    serviceDragOverMap = false;
    if (!mapInstance || !proposalMode || !selectedIslandId || proposalPending) return;
    const selection = parseServiceDragPayload(event.dataTransfer?.getData(SERVICE_DRAG_MIME) ?? null);
    if (!selection) return;

    event.preventDefault();
    event.stopPropagation();
    const bounds = mapElement.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      return;
    const point = mapInstance.unproject([event.clientX - bounds.left, event.clientY - bounds.top]);
    suppressMapClickUntil = Date.now() + 300;
    startAddService(selection);
    applyAddServiceAt([point.lng, point.lat], selection);
  }

  function handleMapProposalClick(event: MapMouseEvent): void {
    if (!proposalMode || proposalPending || Date.now() < suppressMapClickUntil) return;

    if (addServiceDraft) {
      applyAddServiceAt([event.lngLat.lng, event.lngLat.lat], addServiceDraft);
      return;
    }

    if (!moveServiceId) {
      const feature = mapInstance?.queryRenderedFeatures(event.point, { layers: ['selected-service-demand-hexes'] })[0];
      if (feature?.id !== undefined) selectedProposalCellId = String(feature.id);
      return;
    }
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
        proposalMode,
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
    serviceMarkerServices.clear();
    clusteredMarkerServices.clear();
    individualProposalServices.clear();
    setSourceData(SERVICE_MARKER_SOURCE_ID, EMPTY_SERVICE_MARKERS);
    scheduleServiceMarkerSync();
  }

  function renderServiceMarkers(
    data: IslandServicesResponse,
    services: readonly IslandMapService[] = data.services,
    preservePopup = false
  ): void {
    if (!mapInstance || !maplibreMarkerConstructor) return;
    const visibleServices = filterServicesToSelectedIsland(services);
    if (
      !preservePopup ||
      (activeServicePopup && !visibleServices.some((service) => service.id === activeServicePopup?.serviceId))
    )
      closeServicePopup();
    const nextServices = new Map<string, IslandMapService>(
      visibleServices.flatMap((service) => (service.coordinates ? [[service.id, service] as const] : []))
    );
    serviceMarkerServices = nextServices;
    // Keep proposal changes individually visible at the dropped location. Baseline
    // services still cluster, without absorbing the new icon after confirmation.
    individualProposalServices = new Map(
      proposalMode ? [...nextServices].filter(([, service]) => isProposalServiceMarker(service)) : []
    );
    const clusteredServices = new Map([...nextServices].filter(([id]) => !individualProposalServices.has(id)));
    const positionsChanged = !serviceMarkerPositionsMatch(clusteredMarkerServices, clusteredServices);
    clusteredMarkerServices = clusteredServices;
    if (positionsChanged)
      setSourceData(SERVICE_MARKER_SOURCE_ID, serviceMarkerCollection([...clusteredServices.values()]));
    scheduleServiceMarkerSync();
  }

  function filterServicesToSelectedIsland(services: readonly IslandMapService[]): IslandMapService[] {
    if (!selectedIslandId) return [...services];

    const island = islandCollection.features.find((feature) => feature.properties.id === selectedIslandId);
    if (!island) return [...services];

    // Source responses are immutable. Reuse exact boundary checks while searching,
    // changing the demand lens, or switching between the same proposal views.
    if (serviceGeometry !== island.geometry) {
      serviceGeometry = island.geometry;
      serviceGeometryMembership = new WeakMap();
    }

    return services.filter((service) => {
      if (!service.coordinates) return true;
      let within = serviceGeometryMembership.get(service);
      if (within === undefined) {
        within = pointWithinGeometryGrace(service.coordinates, island.geometry, SELECTED_SERVICE_MARKER_GRACE_METERS);
        serviceGeometryMembership.set(service, within);
      }
      return within;
    });
  }

  function mountIndividualServiceMarker(service: IslandMapService): MountedServiceMarker | null {
    if (!mapInstance || !maplibreMarkerConstructor || !service.coordinates) return null;
    const host = document.createElement('div');
    const proposed = proposalMode && isProposalServiceMarker(service);
    host.classList.toggle('proposal-service-marker', proposed);
    if (proposed) host.dataset.proposedService = service.id;
    const component = mount(ServiceMapMarker, {
      target: host,
      props: {
        serviceType: service.serviceType,
        subtype: service.subtype,
        label: `${proposed ? 'Proposed ' : ''}${serviceMarkerLabel(service)}`,
        onSelect: () => {
          const current = serviceMarkerServices.get(service.id);
          if (current) openServicePopup(current);
        }
      }
    });
    const marker = new maplibreMarkerConstructor({ element: host, anchor: 'center' });
    marker.getElement().style.zIndex = proposed ? '14' : '10';
    marker.setLngLat(service.coordinates).addTo(mapInstance);
    const mounted: MountedServiceMarker = {
      key: `service:${service.id}`,
      signature: `service:${service.id}:${service.serviceType}:${service.subtype}:${serviceMarkerLabel(service)}:${proposed}`,
      kind: 'service',
      marker,
      component,
      element: host.querySelector<HTMLElement>('[data-service-marker]'),
      coordinates: [...service.coordinates],
      scale: null
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
        onSelect: () => {
          const coordinates = marker.getLngLat();
          void expandServiceCluster({ ...cluster, coordinates: [coordinates.lng, coordinates.lat] });
        }
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
      component,
      element: host.querySelector<HTMLElement>('[data-service-cluster-marker]'),
      coordinates: [...cluster.coordinates],
      scale: null
    };
    updateMountedServiceMarkerScale(mounted);
    return mounted;
  }

  function syncServiceMarkers(): void {
    if (!mapInstance || !maplibreMarkerConstructor || !mapInstance.getSource(SERVICE_MARKER_SOURCE_ID)) return;

    lastServiceMarkerSync = performance.now();
    const map = mapInstance;
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const withinViewport = (coordinates: Coordinate): boolean => {
      const point = map.project(coordinates);
      // Keep a margin for markers approaching the viewport during a pan.
      return point.x >= -128 && point.y >= -128 && point.x <= width + 128 && point.y <= height + 128;
    };
    // This is a single-frame reconciliation plan, not reactive application state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const desired = new Map<string, DesiredServiceMarker>();
    for (const service of individualProposalServices.values()) {
      if (!service.coordinates || !withinViewport(service.coordinates)) continue;
      desired.set(`service:${service.id}`, {
        key: `service:${service.id}`,
        signature: `service:${service.id}:${service.serviceType}:${service.subtype}:${serviceMarkerLabel(service)}:true`,
        kind: 'service',
        coordinates: service.coordinates,
        service
      });
    }
    const features = mapInstance.querySourceFeatures(SERVICE_MARKER_SOURCE_ID) as ServiceMarkerQueryFeature[];
    for (const feature of features) {
      const properties = feature.properties ?? {};
      const isCluster = properties.cluster === true || properties.cluster === 'true';
      if (isCluster) {
        const cluster = clusterMarkerData(feature);
        if (!cluster || !withinViewport(cluster.coordinates)) continue;
        desired.set(`cluster:${cluster.clusterId}`, {
          key: `cluster:${cluster.clusterId}`,
          signature: `cluster:${cluster.clusterId}:${cluster.total}:${cluster.healthCount}:${cluster.educationCount}:${cluster.transportCount}`,
          kind: 'cluster',
          cluster
        });
        continue;
      }

      const serviceId = typeof properties.serviceId === 'string' ? properties.serviceId : null;
      if (serviceId && individualProposalServices.has(serviceId)) continue;
      const service = serviceId ? serviceMarkerServices.get(serviceId) : undefined;
      const coordinates = markerFeatureCoordinates(feature);
      if (!service || !coordinates || !withinViewport(coordinates)) continue;
      desired.set(`service:${service.id}`, {
        key: `service:${service.id}`,
        signature: `service:${service.id}:${service.serviceType}:${service.subtype}:${serviceMarkerLabel(service)}:false`,
        kind: 'service',
        coordinates,
        service
      });
    }

    if (activeServicePopup && !serviceMarkerServices.has(activeServicePopup.serviceId)) closeServicePopup();

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
        const coordinates = next.kind === 'service' ? next.coordinates : next.cluster.coordinates;
        if (current.coordinates[0] !== coordinates[0] || current.coordinates[1] !== coordinates[1]) {
          current.coordinates = [...coordinates];
          current.marker.setLngLat(coordinates);
        }
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
    const source = mapInstance?.getSource(sourceId) as GeoJSONSource | undefined;
    if (!source || appliedSourceData.get(source) === data) return;
    source.setData(data as Parameters<GeoJSONSource['setData']>[0]);
    appliedSourceData.set(source, data);
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

  function demandColorExpression(category: IslandDemandCategory): unknown[] {
    const weightProperty = demandWeightProperty(category);
    const statusProperty = demandStatusProperty(category);
    return [
      'case',
      ['==', ['get', statusProperty], 'unavailable'],
      themeColor('--mobility-map-no-data'),
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', weightProperty], 0],
        0,
        themeColor('--mobility-map-demand-0'),
        0.01,
        themeColor('--mobility-map-demand-1'),
        0.03,
        themeColor('--mobility-map-demand-2'),
        0.06,
        themeColor('--mobility-map-demand-3'),
        0.1,
        themeColor('--mobility-map-demand-4'),
        0.16,
        themeColor('--mobility-map-demand-5'),
        0.22,
        themeColor('--mobility-map-demand-6'),
        0.3,
        themeColor('--mobility-map-demand-7')
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
      demandFillOpacityExpression(activeDemandCategory, multiplier, revealProgress) as never
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

  function hexFeatureCenter(feature: IslandServiceHexes['features'][number]): Coordinate | null {
    const ring = feature.geometry.coordinates[0];
    if (!ring || ring.length === 0) return null;
    const totals = ring.reduce(
      (result, [longitude, latitude]) => {
        result[0] += longitude;
        result[1] += latitude;
        return result;
      },
      [0, 0]
    );
    return [totals[0] / ring.length, totals[1] / ring.length];
  }

  function coordinateDistanceMeters(first: Coordinate, second: Coordinate): number {
    const latitude = ((first[1] + second[1]) / 2) * (Math.PI / 180);
    const longitudeMeters = (first[0] - second[0]) * 111_320 * Math.cos(latitude);
    const latitudeMeters = (first[1] - second[1]) * 110_574;
    return Math.hypot(longitudeMeters, latitudeMeters);
  }

  function demandHexesWithRevealPhases(
    hexes: IslandServiceHexes,
    services: readonly IslandMapService[]
  ): IslandServiceHexes {
    const serviceCoordinates = services.flatMap((service) => (service.coordinates ? [service.coordinates] : []));
    if (serviceCoordinates.length === 0) {
      return {
        ...hexes,
        features: hexes.features.map((feature) => ({
          ...feature,
          properties: { ...feature.properties, revealPhase: 0 }
        }))
      };
    }

    const distances = hexes.features.map((feature) => {
      const center = hexFeatureCenter(feature);
      return center
        ? Math.min(...serviceCoordinates.map((service) => coordinateDistanceMeters(center, service)))
        : null;
    });
    const validDistances = distances.filter((distance): distance is number => distance !== null);
    const maximumDistance = Math.max(1, ...validDistances);

    return {
      ...hexes,
      features: hexes.features.map((feature, index) => ({
        ...feature,
        properties: {
          ...feature.properties,
          revealPhase: Number(((distances[index] ?? maximumDistance) / maximumDistance).toFixed(3))
        }
      }))
    };
  }

  function startDemandHeatmapReveal(
    hexes: IslandServiceHexes,
    services: readonly IslandMapService[],
    islandId: string
  ): void {
    stopDemandHeatmapReveal();
    setSourceData('selected-service-hexes', demandHexesWithRevealPhases(hexes, services));

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

  function applySelectedIslandFocus(id: string): void {
    if (!mapInstance) return;
    setBaseRoadVisibility('visible');
    // Keep the surrounding islands visible; only the selected island uses the demand overlay.
    mapInstance.setFilter('island-fill', ['!=', ['get', 'id'], id]);
    mapInstance.setFilter('national-score-fields', ['!=', ['get', 'islandId'], id]);
    mapInstance.setFilter('island-outline', ['!=', ['get', 'id'], id]);
    mapInstance.setFilter('island-labels', null);
    mapInstance.setFilter('selected-island-fill', ['==', ['get', 'id'], id]);
    mapInstance.setFilter('selected-island-loading', ['==', ['get', 'id'], id]);
    mapInstance.setFilter('selected-island-outline', ['==', ['get', 'id'], id]);
    mapInstance.setFilter('selected-service-demand-hexes', demandAvailabilityFilter(activeDemandCategory));
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
    applySelectedIslandFocus(id);
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
      const data = await mapData.request<IslandServicesResponse>(`/api/map/islands/${encodeURIComponent(id)}/services`);
      if (requestId !== islandServicesRequest) return;
      islandServices = data;
      applySelectedIslandFocus(id);
      startDemandHeatmapReveal(data.hexes, data.services, id);
      renderServiceMarkers(data);
      if (proposalMode) void proposal.open(data);
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
      demandColorExpression(activeDemandCategory) as never
    );
    mapInstance.setPaintProperty(
      'selected-service-demand-hexes',
      'fill-opacity',
      demandFillOpacityExpression(activeDemandCategory, SELECTED_DEMAND_HEX_OPACITY, demandRevealProgress) as never
    );
    mapInstance.setFilter('selected-service-demand-hexes', demandAvailabilityFilter(activeDemandCategory) as never);
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
    const display = proposalMapDisplay;
    if (!mapReady || !proposalMode || !display || !selectedIslandId || !mapInstance) return;
    untrack(() => {
      applySelectedIslandFocus(selectedIslandId!);
      setSourceData('selected-service-hexes', display.hexes);
      stopDemandHeatmapReveal();
      demandRevealProgress = 1;
      setDemandHexOpacity(SELECTED_DEMAND_HEX_OPACITY);
    });
  });

  $effect(() => {
    const display = proposalMapDisplay;
    const visible = visibleProposalServices;
    if (!mapReady || !proposalMode || !display || !selectedIslandId || !mapInstance) return;
    untrack(() => {
      renderServiceMarkers(display, visible);
    });
  });

  $effect(() => {
    const staged = proposal.staged;
    if (
      !mapReady ||
      !mapInstance ||
      !maplibreMarkerConstructor ||
      !proposalMode ||
      proposal.comparisonView !== 'after' ||
      !staged ||
      staged.suggestions
    ) {
      proposalLocationMarker?.remove();
      proposalLocationMarker = null;
      if (proposalLocationComponent) void unmount(proposalLocationComponent);
      proposalLocationComponent = null;
      return;
    }
    if (!proposalLocationMarker) {
      const element = document.createElement('div');
      element.className = 'proposal-location-preview';
      element.style.zIndex = '16';
      proposalLocationComponent = mount(ProposalLocationMarker, {
        target: element,
        props: {
          get serviceType() {
            return proposalLocationPresentation.serviceType;
          },
          get subtype() {
            return proposalLocationPresentation.subtype;
          },
          get label() {
            return proposalLocationPresentation.label;
          },
          get status() {
            return proposalLocationPresentation.status;
          }
        }
      });
      proposalLocationMarker = new maplibreMarkerConstructor({ element, anchor: 'bottom' })
        .setLngLat(staged.coordinates)
        .addTo(mapInstance);
    }
    proposalLocationMarker.setLngLat(staged.coordinates);
  });

  $effect(() => {
    if (!mapReady || !connectionLayers) return;
    connectionLayers.update(
      !presentationActive && !proposalMode && islandConnections?.islandId === selectedIslandId
        ? islandConnections
        : null,
      {
        routes: showConnectionRoutes,
        inbound: showInboundConnections,
        category: selectedDemandCategory,
        focusedOriginId: focusedInboundOriginId
      }
    );
  });

  $effect(() => {
    if (!mapReady || !mapInstance) return;
    const plans = proposalTransportPlans;
    const data = {
      type: 'FeatureCollection' as const,
      features: plans.map((plan) => ({
        type: 'Feature' as const,
        id: plan.operationId,
        properties: { mode: plan.mode, label: plan.label },
        geometry: plan.geometry
      }))
    };
    if (!mapInstance.getSource('proposal-transport-routes')) {
      mapInstance.addSource('proposal-transport-routes', { type: 'geojson', data });
      mapInstance.addLayer({
        id: 'proposal-transport-route-casing',
        type: 'line',
        source: 'proposal-transport-routes',
        paint: { 'line-color': themeColor('--mobility-map-halo'), 'line-width': 7, 'line-opacity': 0.9 }
      });
      mapInstance.addLayer({
        id: 'proposal-transport-route-line',
        type: 'line',
        source: 'proposal-transport-routes',
        paint: {
          'line-color': [
            'match',
            ['get', 'mode'],
            'ferry',
            themeColor('--mobility-route-ferry'),
            themeColor('--mobility-route-bus')
          ],
          'line-width': 3.5,
          'line-dasharray': [3, 1.5]
        }
      });
    } else setSourceData('proposal-transport-routes', data);
  });

  $effect(() => {
    const id = presentationEvidenceId;
    if (id) void loadPresentationProfile(id);
    else {
      presentationProfileRequest += 1;
      presentationProfile = null;
      presentationProfileLoading = false;
      presentationProfileError = null;
    }
  });

  $effect(() => {
    if (!presentationActive) return;
    preloadPresentationVehicles();
    if (!presentationStep || !mapReady || !mapInstance) return;
    savePresentationState();
    if (appliedPresentationStepId === presentationStep.id) return;
    appliedPresentationStepId = presentationStep.id;
    applyPresentationStep(presentationStep);
  });

  $effect(() => {
    if (presentationActive || !mapReady || !mapInstance || !presentationRestoreState) return;
    restoreAfterPresentation();
  });

  $effect(() => {
    if (!presentationActive || !presentationStep || !mapReady || !mapInstance) return;
    if (storyFocusStepId === presentationStep.id) return;
    if (presentationPhase !== 'settled' || presentationReadyStepId !== presentationStep.id) return;
    if (presentationStep.scrollTargets?.length && (islandProfileLoading || analyticsLoading)) return;
    void focusStoryUi(presentationStep);
  });

  async function openAnalytics(): Promise<void> {
    analyticsOpen = true;
    await loadAnalytics();
  }

  async function buildMapStyle(): Promise<NonNullable<MapOptions['style']>> {
    let baseStyle: MapStyleDocument;
    const controller = new AbortController();
    mapStyleController = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch('https://tiles.openfreemap.org/styles/positron', { signal: controller.signal });
      if (!response.ok) throw new Error(`Base map request failed with status ${response.status}`);
      baseStyle = (await response.json()) as MapStyleDocument;
    } catch {
      baseStyle = {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'fallback-background',
            type: 'background',
            paint: { 'background-color': themeColor('--mobility-map-land') }
          }
        ]
      };
    } finally {
      window.clearTimeout(timeout);
      if (mapStyleController === controller) mapStyleController = null;
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
              'line-color': themeColor('--mobility-map-road-casing'),
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
              'line-color': themeColor('--mobility-map-road'),
              'line-opacity': 0.96,
              'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 8, 0.55, 11, 1.3, 14, 2.6]
            }
          }
        ]
      : [];
    const scoreColor = [
      'case',
      ['==', ['get', 'scoreStatus'], 'unavailable'],
      themeColor('--mobility-subtle'),
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
        islands: { type: 'geojson', data: islandCollection },
        'score-fields': { type: 'geojson', data: islandScoreFields(islandCollection) },
        'selected-service-hexes': { type: 'geojson', data: EMPTY_SERVICE_HEXES },
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
        },
        'presentation-map': { type: 'geojson', data: EMPTY_PRESENTATION_MAP }
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
            'fill-outline-color': `rgba(${themeColorChannels('--mobility-map-halo')
              .map((channel) => Math.round(channel * 255))
              .join(', ')}, 0.22)`
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
            'line-color': themeColor('--mobility-map-road-casing'),
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
            'text-font': [themeToken('--mobility-map-font')],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              6.2,
              Number(themeToken('--mobility-map-label-size')),
              10,
              Number(themeToken('--mobility-map-label-size')) + 1
            ],
            'text-anchor': 'top',
            'text-offset': [0, 0.7],
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': themeColor('--mobility-map-text'),
            'text-halo-color': themeColor('--mobility-map-halo'),
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
            'line-color': themeColor('--mobility-map-outline'),
            'line-opacity': 0,
            'line-opacity-transition': { duration: 240, delay: 0 },
            'line-width': ['interpolate', ['linear'], ['zoom'], 5.5, 1.5, 10, 2.8, 16, 3.6]
          }
        },
        {
          id: 'presentation-route-verified',
          type: 'line',
          source: 'presentation-map',
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'verified']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': themeColor('--mobility-accent'),
            'line-opacity': ['case', ['boolean', ['get', 'focus'], false], 0.96, 0.2],
            'line-opacity-transition': { duration: 520, delay: 0 },
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['boolean', ['get', 'focus'], false], 2.8, 1.5],
              8,
              ['case', ['boolean', ['get', 'focus'], false], 4.6, 2.5],
              13,
              ['case', ['boolean', ['get', 'focus'], false], 6.5, 3.6]
            ],
            'line-width-transition': { duration: 520, delay: 0 }
          }
        },
        {
          id: 'presentation-route-narrative',
          type: 'line',
          source: 'presentation-map',
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'narrative']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': themeColor('--mobility-map-demand-5'),
            'line-dasharray': [1.4, 1.1],
            'line-opacity': ['case', ['boolean', ['get', 'focus'], false], 0.96, 0.2],
            'line-opacity-transition': { duration: 520, delay: 0 },
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['boolean', ['get', 'focus'], false], 2.6, 1.4],
              8,
              ['case', ['boolean', ['get', 'focus'], false], 4.2, 2.3],
              13,
              ['case', ['boolean', ['get', 'focus'], false], 6, 3.4]
            ],
            'line-width-transition': { duration: 520, delay: 0 }
          }
        },
        {
          id: 'presentation-route-proposal',
          type: 'line',
          source: 'presentation-map',
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'proposal']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': themeColor('--mobility-success'),
            'line-dasharray': [0.8, 1.4],
            'line-opacity': ['case', ['boolean', ['get', 'focus'], false], 1, 0.2],
            'line-opacity-transition': { duration: 520, delay: 0 },
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['boolean', ['get', 'focus'], false], 3, 1.5],
              8,
              ['case', ['boolean', ['get', 'focus'], false], 5, 2.6],
              13,
              ['case', ['boolean', ['get', 'focus'], false], 7, 3.8]
            ],
            'line-width-transition': { duration: 520, delay: 0 }
          }
        },
        {
          id: 'presentation-route-points',
          type: 'circle',
          source: 'presentation-map',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': [
              'match',
              ['get', 'kind'],
              'proposal',
              themeColor('--mobility-success'),
              'narrative',
              themeColor('--mobility-map-demand-5'),
              themeColor('--mobility-accent')
            ],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['boolean', ['get', 'focus'], false], 6, 3.5],
              8,
              ['case', ['boolean', ['get', 'focus'], false], 8, 5],
              13,
              ['case', ['boolean', ['get', 'focus'], false], 10, 6]
            ],
            'circle-opacity': ['case', ['boolean', ['get', 'focus'], false], 1, 0.34],
            'circle-opacity-transition': { duration: 520, delay: 0 },
            'circle-stroke-color': themeColor('--mobility-map-halo'),
            'circle-stroke-width': ['case', ['boolean', ['get', 'focus'], false], 3, 1.5]
          }
        },
        {
          id: 'presentation-route-labels',
          type: 'symbol',
          source: 'presentation-map',
          filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'name']],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': [themeToken('--mobility-map-font')],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              Number(themeToken('--mobility-map-label-size')),
              8,
              Number(themeToken('--mobility-map-label-size')),
              13,
              Number(themeToken('--mobility-map-label-size')) + 2
            ],
            'text-anchor': 'top',
            'text-offset': [0, 1],
            'text-allow-overlap': true,
            'text-ignore-placement': true
          },
          paint: {
            'text-color': themeColor('--mobility-map-text'),
            'text-opacity': ['case', ['boolean', ['get', 'focus'], false], 1, 0.35],
            'text-opacity-transition': { duration: 520, delay: 0 },
            'text-halo-color': themeColor('--mobility-map-halo'),
            'text-halo-width': 2,
            'text-halo-blur': 0.2
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
    // Capture drops before the map canvas or a service marker can consume the event.
    mapElement.addEventListener('dragover', handleMapDragOver, true);
    mapElement.addEventListener('drop', handleMapDrop, true);
    mapElement.addEventListener('dragleave', handleMapDragLeave, true);
    window.addEventListener('dragend', clearServiceDrag);
    const unsubscribeSources = mapData.subscribeInvalidation(() => {
      // Refresh visible source views when any validated response identifies a new baseline.
      const hadDetail = islandDetailLoaded;
      islandOverviewLoaded = false;
      islandDetailLoaded = false;
      void loadAnalytics(true);
      void loadIslandGeometry(hadDetail, true);
      if (presentationEvidenceId) void loadPresentationProfile(presentationEvidenceId, true);
      if (selectedIslandId) {
        void loadIslandProfile(selectedIslandId);
        void loadIslandServices(selectedIslandId);
        void loadIslandConnections(selectedIslandId);
      }
    });

    // Public data, the renderer and the external style are independent startup work.
    void loadIslandGeometry();
    void loadAnalytics();
    const styleRequest = buildMapStyle();

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

      const style = await styleRequest;
      if (disposed) return;
      mapInstance = new maplibre.Map({
        container: mapElement,
        style,
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
        // Data may have arrived before MapLibre created its sources.
        syncIslandGeometry();
        connectionLayers = createIslandConnectionLayers(mapInstance, maplibre.Popup);
        mapInstance.on('zoomend', () => {
          if (mapInstance && mapInstance.getZoom() >= 6.2) void loadIslandGeometry(true);
        });
        // MapLibre moves mounted markers itself. Only zoom changes their scale;
        // source events reconcile clusters when the tile/zoom contents change.
        mapInstance.on('zoom', scheduleServiceMarkerScaleSync);
        mapInstance.on('move', scheduleServiceMarkerViewportSync);
        mapInstance.on('moveend', scheduleServiceMarkerSync);
        mapInstance.on('resize', scheduleServiceMarkerSync);
        // Frame against MapLibre's updated viewport, after its resize has completed.
        mapInstance.on('resize', fitProposalIsland);
        mapInstance.on('sourcedata', (event) => {
          if (event.sourceId === SERVICE_MARKER_SOURCE_ID) scheduleServiceMarkerSync();
        });
        mapInstance.on('click', 'island-fill', (event) => {
          if (proposalPending || moveServiceId || addServiceDraft) return;
          const connectionHitLayers = ISLAND_CONNECTION_HIT_LAYER_IDS.filter((id) => mapInstance?.getLayer(id));
          if (
            connectionHitLayers.length &&
            mapInstance?.queryRenderedFeatures(event.point, { layers: connectionHitLayers }).length
          )
            return;
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
            demandColorExpression(activeDemandCategory) as never
          );
          mapInstance.setPaintProperty(
            'selected-service-demand-hexes',
            'fill-opacity',
            demandFillOpacityExpression(activeDemandCategory, SELECTED_DEMAND_HEX_OPACITY) as never
          );
          mapInstance.setFilter(
            'selected-service-demand-hexes',
            demandAvailabilityFilter(activeDemandCategory) as never
          );
        }
        if (selectedIslandId) {
          prepareSelectedIslandOverlay(selectedIslandId);
          if (islandServices) {
            startDemandHeatmapReveal(islandServices.hexes, islandServices.services, selectedIslandId);
            renderServiceMarkers(islandServices);
          }
        }
      });
    })();

    return () => {
      disposed = true;
      islandProfileRequest += 1;
      islandServicesRequest += 1;
      islandConnectionsRequest += 1;
      presentationProfileRequest += 1;
      mapStyleController?.abort();
      mapElement.removeEventListener('dragover', handleMapDragOver, true);
      mapElement.removeEventListener('drop', handleMapDrop, true);
      mapElement.removeEventListener('dragleave', handleMapDragLeave, true);
      window.removeEventListener('dragend', clearServiceDrag);
      unsubscribeSources();
      proposal.suspend();
      proposalLocationMarker?.remove();
      if (proposalLocationComponent) void unmount(proposalLocationComponent);
      stopMoveMode();
      cancelPresentationTransition();
      stopDemandHeatmapReveal();
      stopSelectedIslandLoadingPulse();
      hideSelectedIslandFill();
      removeServiceMarkers();
      connectionLayers?.dispose();
      connectionLayers = null;
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

  function islandScoreFields(islands: IslandCollection): ScoreFieldCollection {
    return {
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
  }

  function syncIslandGeometry(): void {
    setSourceData('islands', islandCollection);
    setSourceData('score-fields', islandScoreFields(islandCollection));
  }

  function loadIslandGeometry(detail = false, refresh = false): Promise<void> {
    if (detail && islandDetailRequest) return islandDetailRequest;
    const request = fetchIslandGeometry(detail, refresh);
    if (detail) {
      islandDetailRequest = request;
      void request.finally(() => {
        if (islandDetailRequest === request) islandDetailRequest = null;
      });
    }
    return request;
  }

  async function fetchIslandGeometry(detail: boolean, refresh: boolean): Promise<void> {
    if (detail && (islandDetailLoading || (islandDetailLoaded && !refresh))) return;
    if (!detail && (islandOverviewLoading || (!refresh && (islandOverviewLoaded || islandDetailLoaded)))) return;
    if (detail) islandDetailLoading = true;
    else {
      islandOverviewLoading = true;
      loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)] ?? LOADING_MESSAGES[0];
      heatmapLoading = true;
      heatmapError = false;
    }
    try {
      const islands = await mapData.request<IslandCollection>(`/api/map/islands${detail ? '?detail=true' : ''}`, {
        refresh
      });
      // A slower overview must never replace the exact boundaries loaded after zooming in.
      if (!detail && islandDetailLoaded) return;
      islandCollection = islands;
      syncIslandGeometry();
      if (selectedIslandId) {
        const roadFilter = selectedIslandRoadFilter(selectedIslandId);
        setLayerFilter('selected-island-road-casing', roadFilter);
        setLayerFilter('selected-island-road-inner', roadFilter);
        if (islandServices) {
          const display = proposalMode ? (proposal.display ?? islandServices) : islandServices;
          renderServiceMarkers(display, proposalMode ? visibleProposalServices : display.services, true);
        }
      }
      if (detail) islandDetailLoaded = true;
      else islandOverviewLoaded = true;
    } catch (error) {
      if (!detail) heatmapError = true;
      console.error('Island geometry could not be loaded.', error);
    } finally {
      if (detail) islandDetailLoading = false;
      else {
        islandOverviewLoading = false;
        heatmapLoading = false;
      }
    }
  }

  function retryHeatmap(): void {
    void loadIslandGeometry();
  }

  function createProposal(): void {
    closeServicePopup();
    proposalQuery = '';
    proposalServiceFilter = 'all';
    addServiceDraft = null;
    stopMoveMode();
    proposalMode = true;
    const islandId = selectedIslandId;
    void loadIslandGeometry(true).then(async () => {
      await tick();
      if (selectedIslandId === islandId) fitProposalIsland();
    });
    if (islandServices) void proposal.open(islandServices);
  }

  async function suggestProposal(priorities: IslandDemandCategory[]): Promise<void> {
    const islandId = selectedIslandId;
    await loadIslandGeometry(true);
    if (!proposalMode || !islandId || selectedIslandId !== islandId) return;
    if (!islandDetailLoaded) {
      proposal.error = 'Exact island boundaries could not be loaded. Please try finding options again.';
      return;
    }
    await proposal.suggest(
      priorities.filter((priority): priority is 'health' | 'education' | 'transport' => priority !== 'all'),
      islandCollection.features.find((feature) => feature.properties.id === islandId)?.geometry
    );
  }

  function closeProposalMode(): void {
    closeServicePopup();
    stopMoveMode();
    proposal.suspend();
    proposalMode = false;
    proposalQuery = '';
    proposalServiceFilter = 'all';
    addServiceDraft = null;
    if (selectedIslandId) void loadIslandServices(selectedIslandId);
  }
</script>

<svelte:head>
  <title>{config.app.name} | Accessibility map</title>
  <meta name="description" content="National accessibility score map for the Maldives." />
</svelte:head>

<svelte:window
  bind:innerWidth={viewportWidth}
  onkeydown={(event) => {
    if (event.key === 'Escape' && proposal.staged) cancelProposalPlacement();
    else if (event.key === 'Escape' && moveServiceId) stopMoveMode();
    else if (event.key === 'Escape' && addServiceDraft) stopAddServiceMode();
  }}
/>

<div
  class="map-shell mobility-theme"
  data-presentation-phase={presentationActive ? presentationPhase : 'idle'}
  data-presentation-step={presentationActive ? presentationStep?.id : undefined}
>
  <div
    bind:this={mapElement}
    class="map-canvas"
    class:service-drop-active={serviceDragOverMap}
    role="application"
    aria-label={selectedIslandId
      ? 'Selected island demand and residential access map'
      : 'National Maldives accessibility score map'}
    aria-busy={mapReady && !selectedIslandLoading ? 'false' : 'true'}
  ></div>

  {#if serviceDragOverMap}
    <p class="service-drop-hint" role="status">Drop to preview this location</p>
  {/if}

  {#if heatmapLoading || !mapReady}
    <div class="heatmap-loading" role="status" aria-live="polite" out:premiumLoadingExit>
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
        <Button type="button" onclick={retryHeatmap}>Retry map</Button>
      </div>
    </div>
  {/if}

  {#if presentationActive && presentationStep}
    <PresentationStoryPanel
      step={presentationStep}
      profile={presentationProfile}
      island={presentationIsland}
      loading={presentationProfileLoading}
      error={presentationProfileError}
      patientElapsedSeconds={presentationTimeline.patientElapsedSeconds}
      staffElapsedSeconds={presentationTimeline.staffElapsedSeconds}
      patientTimingIncomplete={presentationTimeline.patientTimingIncomplete}
      staffTimingIncomplete={presentationTimeline.staffTimingIncomplete}
      patientTimingLabel={presentationTimeline.patientCurrentLeg?.label}
      staffTimingLabel={presentationTimeline.staffCurrentLeg?.label}
      patientTimingNote={presentationTimeline.patientTimingNote}
      staffTimingNote={presentationTimeline.staffTimingNote}
      journeyProgress={currentPresentationProgress}
      travelling={presentationPhase === 'entering' || presentationPhase === 'travelling'}
    />
  {/if}

  {#if !presentationActive}
    <div
      bind:this={islandDockElement}
      class={`national-panel-slot${selectedIslandId ? ' island-selected' : ''}${proposalMode ? ' proposal-mode-left' : ''}`}
      class:analytics-dock-hidden={islandDockOccluded}
      aria-hidden={proposalMode || islandDockOccluded}
      inert={proposalMode || islandDockOccluded}
      aria-live="polite"
    >
      {#key selectedIslandId}
        {#if selectedIslandId}
          <div class="island-dock-heading">
            <Button variant="ghost" size="sm" class="all-islands-button" onclick={showNationalMap}>
              <ArrowLeft size={14} aria-hidden="true" />All islands
            </Button>
            <span>Selected island</span>
          </div>
          <div class="island-dock-score">
            <IslandScoreCard
              island={selectedIsland}
              loading={!mapReady || analyticsLoading || !selectedIsland}
              error={Boolean(analyticsError)}
              embedded
            />
          </div>
        {:else}
          <NationalScoreCard
            title={config.app.name}
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
      {/key}
      {#if selectedIslandId}
        <details class="map-layers" bind:open={mapLayersOpen}>
          <summary>
            <span>Map layers</span>
            <span class="layer-summary">
              {showConnectionRoutes
                ? showInboundConnections
                  ? 'Routes + demand'
                  : 'Routes'
                : showInboundConnections
                  ? 'Inbound demand'
                  : 'Island'}
            </span>
          </summary>
          <div class="selected-map-controls">
            <p class="selected-map-caption">Demand lens</p>
            <div class="demand-tabs-list" role="group" aria-label="Demand category">
              {#each ISLAND_DEMAND_CATEGORIES as category (category)}
                <Button
                  variant="ghost"
                  size="xs"
                  aria-pressed={selectedDemandCategory === category}
                  onclick={() => {
                    selectedDemandCategory = category;
                    focusedInboundOriginId = null;
                  }}>{demandCategoryLabel(category)}</Button
                >
              {/each}
            </div>
            <IslandConnectionControls
              data={islandConnections}
              loading={islandConnectionsLoading}
              error={islandConnectionsError}
              routes={showConnectionRoutes}
              inbound={showInboundConnections}
              category={selectedDemandCategory}
              focusedOriginId={focusedInboundOriginId}
              onRoutesChange={(value) => (showConnectionRoutes = value)}
              onInboundChange={(value) => (showInboundConnections = value)}
              onOriginChange={focusInboundOrigin}
              onFitRoutes={() => fitIslandConnections('routes')}
              onFitInbound={() => fitIslandConnections('inbound')}
              onIslandView={refocusSelectedIsland}
              onRetry={() => selectedIslandId && void loadIslandConnections(selectedIslandId, true)}
            />
            {#if islandServicesError}
              <p class="selected-map-state" role="alert">{islandServicesError}</p>
            {/if}
            <section class="island-map-key" aria-label="Demand and residential access gap legend">
              <p class="legend-title">
                {selectedDemandCategory === 'all'
                  ? 'Demand + residential access gap'
                  : `${demandCategoryLabel(selectedDemandCategory)} pressure + access gap`}
              </p>
              <div class="demand-scale" aria-hidden="true"></div>
              <div class="score-labels"><span>Low</span><span>High</span></div>
              <div class="score-unavailable"><span></span>No mapped demand</div>
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
            </section>
          </div>
        </details>
        <nav class="island-map-actions" aria-label="Selected island actions">
          <Button
            variant={islandAnalyticsOpen ? 'secondary' : 'outline'}
            class="island-view-button"
            aria-expanded={islandAnalyticsOpen}
            aria-controls="island-analytics-dialog"
            onclick={() => (islandAnalyticsOpen = !islandAnalyticsOpen)}
          >
            {islandAnalyticsOpen ? 'Hide details' : 'Island details'}
          </Button>
          <ProposalLauncher onCreate={createProposal} />
        </nav>
      {/if}
    </div>
  {/if}

  {#if analyticsOpen && !presentationActive}
    {#await import('./national-analytics-card.svelte')}
      <p class="deferred-panel-state" role="status">Loading national analytics…</p>
    {:then { default: NationalAnalyticsCard }}
      <NationalAnalyticsCard
        bind:open={analyticsOpen}
        data={analyticsData}
        loading={analyticsLoading}
        error={analyticsError}
        onIslandSelect={focusAnalyticsIsland}
        {proposalMode}
      />
    {:catch}
      <div class="deferred-panel-state" role="alert">
        <p>Analytics could not be loaded. Close and reopen to retry.</p>
        <Button variant="outline" onclick={() => (analyticsOpen = false)}>Close analytics</Button>
      </div>
    {/await}
  {/if}

  {#if islandAnalyticsOpen && !presentationActive}
    {#await import('./island-analytics-card.svelte')}
      <p class="deferred-panel-state" role="status">Loading island analytics…</p>
    {:then { default: IslandAnalyticsCard }}
      {#key `${selectedIslandId ?? 'national'}:${presentationActive ? (presentationStep?.id ?? '') : ''}`}
        <IslandAnalyticsCard
          bind:open={islandAnalyticsOpen}
          island={selectedIsland}
          profile={islandProfile}
          loading={analyticsLoading || islandProfileLoading || !selectedIsland}
          error={analyticsError ?? islandProfileError}
          onClose={() => (islandAnalyticsOpen = false)}
          connectionsOnMap={!presentationActive}
          onExploreConnections={exploreIslandConnections}
          autoExpandConnections={presentationActive && presentationStep?.id === 'ferry-dhihdhoo-hanimaadhoo'}
          {proposalMode}
        />
      {/key}
    {:catch}
      <div class="deferred-panel-state" role="alert">
        <p>Island analytics could not be loaded. Close and reopen to retry.</p>
        <Button variant="outline" onclick={returnToNational}>Back to national map</Button>
      </div>
    {/await}
  {/if}

  {#if !readerMode && !presentationActive && !selectedIslandId}
    <section
      class={`map-legend${proposalMode ? ' proposal-mode-left' : ''}`}
      aria-hidden={proposalMode}
      aria-label="Accessibility score legend"
    >
      <p class="legend-title">Accessibility score</p>
      <div class="score-scale" aria-hidden="true"></div>
      <div class="score-labels"><span>Low</span><span>High</span></div>
      <div class="score-unavailable"><span></span>No access / no data</div>
    </section>
  {/if}

  {#if proposalMode}
    {#if selectedIslandId}
      {#await import('./proposal-builder.svelte')}
        <p class="deferred-panel-state" role="status">Loading proposal tools…</p>
      {:then { default: ProposalBuilder }}
        <ProposalBuilder
          services={proposal.accepted?.services ?? islandServices?.services ?? []}
          bind:query={proposalQuery}
          bind:serviceFilter={proposalServiceFilter}
          pending={proposalPending || islandServicesLoading || islandDetailLoading}
          moveActive={moveServiceId !== null}
          error={proposal.error ?? islandServicesError}
          message={proposal.message}
          settings={proposal.settings}
          onSettingsChange={(settings) => void proposal.updateSettings(settings)}
          costs={proposal.costs}
          impact={proposal.impact}
          transportPlans={proposal.accepted?.transportPlans ?? []}
          transportOptions={proposal.transportOptions}
          transportOptionsLoading={proposal.baseline?.island.id !== selectedIslandId ||
            proposal.transportOptionsLoading}
          transportOptionsError={proposal.baseline?.island.id === selectedIslandId
            ? proposal.transportOptionsError
            : null}
          onLoadTransportOptions={() =>
            proposal.baseline?.island.id === selectedIslandId ? proposal.retryTransportOptions() : Promise.resolve()}
          operations={proposal.operations}
          pendingPlacement={proposal.pendingPlacement}
          onConfirmPlacement={confirmProposalPlacement}
          onCancelPlacement={cancelProposalPlacement}
          onUndo={() => void proposal.undo()}
          onRemoveOperation={(id) => void proposal.remove(id)}
          onSelectOperation={focusProposalTransport}
          onDuplicateService={duplicateProposalService}
          onMoveService={startMoveService}
          onSuggest={(priorities) => void suggestProposal(priorities)}
          suggesting={proposal.pending && proposal.staged?.suggestions === true}
          suggestions={proposal.suggestions}
          suggestionsAllowed={proposal.suggestionsAllowed}
          onAcceptSuggestions={confirmProposalPlacement}
          onCancelSuggestions={cancelProposalPlacement}
          onSelectSuggestion={(id) => {
            const operation = proposal.staged?.operations.find((entry) => entry.operationId === id);
            if (operation?.kind === 'add_service' && mapInstance)
              mapInstance.easeTo({
                center: operation.coordinates,
                offset: proposalCameraOffset(),
                zoom: 16,
                duration: prefersReducedMotion.current ? 0 : 450
              });
          }}
          onEstimatePlacement={(estimate) => void proposal.updatePendingEstimate(estimate)}
          reviewCurrent={proposal.reviewCurrent}
          exporting={proposal.exporting}
          exportError={proposal.exportError}
          onDownloadPdf={() => void proposal.downloadPdf()}
          onRefreshImpact={() => void proposal.refresh()}
          selectedArea={selectedProposalArea}
          {selectedIslandId}
          onPreviewTransport={(operation) => void applyDraftOperation(operation)}
          onCancelMove={stopMoveMode}
          onSelectService={focusService}
          activeSelection={addServiceDraft}
          addServiceLabel={addServiceDraft
            ? serviceCatalogEntry(addServiceDraft.serviceType, addServiceDraft.subtype)?.label
            : null}
          onStartAddService={startAddService}
          onCancelAdd={stopAddServiceMode}
        />
      {:catch}
        <p class="deferred-panel-state" role="alert">Proposal tools could not be loaded. Close and reopen to retry.</p>
      {/await}
    {/if}
    {#if selectedIslandId}
      <ProposalMapControls
        bind:view={proposal.comparisonView}
        bind:lens={proposal.comparisonLens}
        pending={proposalPending}
        current={proposal.reviewCurrent}
        preview={!!proposal.staged?.preview && proposal.display === proposal.staged.preview}
      />
    {/if}
    <Button
      class="proposal-mode-close"
      variant="outline"
      size="icon"
      type="button"
      aria-label="Exit proposal mode"
      title="Exit proposal mode"
      onclick={closeProposalMode}
    >
      <X aria-hidden="true" />
    </Button>
  {/if}
</div>

<style>
  .service-drop-active {
    outline: 3px solid var(--mobility-accent);
    outline-offset: -3px;
  }
  .service-drop-hint {
    position: absolute;
    z-index: 19;
    top: 1rem;
    left: calc(50% + 12rem);
    transform: translateX(-50%);
    max-width: calc(100vw - 27rem);
    margin: 0;
    padding: 0.65rem 1rem;
    border: 1px solid var(--mobility-border-strong);
    border-radius: 999px;
    background: var(--mobility-surface);
    color: var(--mobility-accent);
    box-shadow: var(--mobility-shadow-panel);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-medium);
    pointer-events: none;
  }
  @media (max-width: 640px) {
    .service-drop-hint {
      top: 4.5rem;
      left: 50%;
      max-width: calc(100vw - 2rem);
    }
  }
  .deferred-panel-state {
    position: absolute;
    z-index: 30;
    top: 5rem;
    right: 1rem;
    max-width: min(24rem, calc(100vw - 2rem));
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--mobility-radius-panel);
    background: var(--background);
    box-shadow: var(--mobility-shadow-panel);
  }

  :global(.proposal-location-preview) {
    pointer-events: none;
  }
  :global(.proposal-service-marker .service-marker-icon) {
    outline: 2px dashed var(--mobility-accent);
    outline-offset: 4px;
  }

  :global(html),
  :global(body),
  :global(main) {
    width: 100%;
    min-height: 100%;
    margin: 0;
  }

  :global(body) {
    overflow: hidden;
    background: var(--mobility-surface-muted);
  }

  .map-shell {
    position: relative;
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    background: var(--mobility-surface-muted);
    color: var(--mobility-ink);
    color-scheme: light;
  }

  .map-canvas {
    position: absolute;
    inset: 0;
  }

  :global([data-story-target]) {
    outline: 2px solid transparent;
    outline-offset: 4px;
    transition:
      outline-color 320ms ease,
      box-shadow 420ms ease;
  }

  :global([data-story-focus]) {
    outline: 3px solid var(--mobility-warning);
    box-shadow:
      0 0 0 7px color-mix(in srgb, var(--mobility-warning) 16%, transparent),
      var(--mobility-shadow-panel);
    animation: story-focus-pulse 2.4s ease-in-out 2;
  }

  :global([data-story-target='island-elderly-population'][data-story-focus]) {
    outline-color: var(--mobility-info);
    background: var(--mobility-info-soft);
    box-shadow:
      0 0 0 7px color-mix(in srgb, var(--mobility-info) 18%, transparent),
      var(--mobility-shadow-panel);
    animation-name: story-focus-pulse-elderly;
  }

  @keyframes story-focus-pulse {
    0%,
    100% {
      outline-color: var(--mobility-warning);
    }
    50% {
      outline-color: var(--mobility-warning-soft);
    }
  }

  @keyframes story-focus-pulse-elderly {
    0%,
    100% {
      outline-color: var(--mobility-info);
    }
    50% {
      outline-color: var(--mobility-info-soft);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global([data-story-focus]) {
      animation: none;
    }
    :global([data-story-target='island-elderly-population'][data-story-focus]) {
      animation: none;
    }
    :global([data-story-target]) {
      transition: none;
    }
  }

  .national-panel-slot,
  .map-legend {
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

  .proposal-mode-right {
    transform: translate3d(calc(100% + 2rem), 0, 0) scale(0.985);
    opacity: 0;
    pointer-events: none;
  }

  :global(.proposal-mode-close) {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 30;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid var(--mobility-border-strong);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface);
    color: var(--mobility-accent);
    box-shadow: var(--mobility-shadow-panel);
  }

  :global(.proposal-mode-close:hover) {
    border-color: var(--mobility-accent);
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
  }

  @media (prefers-reduced-motion: reduce) {
    .national-panel-slot,
    .map-legend {
      transition: none;
      will-change: auto;
    }
  }

  :global(.maplibregl-popup) {
    z-index: 12;
  }

  :global(.island-network-popup) {
    max-width: 16.25rem;
    padding: 0.875rem 2rem 0.875rem 1rem;
    color: var(--mobility-ink);
    font-family: var(--mobility-font-body);
  }

  :global(.maplibregl-popup-close-button) {
    top: 0.3rem;
    right: 0.3rem;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: var(--mobility-radius-small);
    color: var(--mobility-muted);
    font-size: var(--mobility-text-lg);
    transition: background-color var(--mobility-duration-fast) ease;
  }

  :global(.maplibregl-popup-close-button:hover) {
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
  }

  .heatmap-loading {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: var(--mobility-surface);
    will-change: opacity;
  }

  .loading-card {
    display: grid;
    grid-template-rows: auto 1fr auto;
    align-items: center;
    justify-items: center;
    width: min(42rem, 100%);
    min-height: 100%;
    gap: 1.25rem;
    color: var(--mobility-ink);
    text-align: center;
  }

  .loading-brand {
    margin: 0;
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xl);
    font-weight: var(--mobility-font-weight-bold);
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
    color: var(--mobility-ink);
    font-size: var(--mobility-text-display);
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: -0.04em;
    line-height: 1.08;
  }

  .loading-status {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-bold);
  }

  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--mobility-border-strong);
    border-top-color: var(--mobility-muted);
    border-radius: 50%;
    animation: loading-spin 0.8s linear infinite;
  }

  @keyframes loading-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-spinner {
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

  .national-panel-slot.island-selected {
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
    scrollbar-width: thin;
    scroll-padding-bottom: 4rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-panel);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-panel);
    color: var(--mobility-text);
  }

  .national-panel-slot.analytics-dock-hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .island-dock-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.45rem 0.9rem 0;
  }

  .island-dock-heading > span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .island-dock-heading :global(.all-islands-button) {
    height: 2rem;
    gap: 0.35rem;
    padding-inline: 0.3rem;
    font-size: var(--mobility-text-sm);
  }

  .island-dock-score {
    padding: 0.55rem 1rem 0;
  }

  .map-layers {
    margin-inline: 1rem;
    border-top: 1px solid var(--mobility-border);
  }

  .map-layers > summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.5rem;
    padding-block: 0.6rem;
    border-radius: var(--mobility-radius-small);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    list-style: none;
    cursor: pointer;
  }

  .map-layers > summary::-webkit-details-marker {
    display: none;
  }

  .map-layers > summary:hover {
    color: var(--mobility-accent);
  }

  .map-layers > summary:focus-visible {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 2px;
  }

  .map-layers > summary::after {
    width: 0.4rem;
    height: 0.4rem;
    flex: 0 0 auto;
    margin-left: 0.15rem;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    content: '';
    transform: translateY(-2px) rotate(45deg);
    transition: transform var(--mobility-duration-fast) var(--mobility-ease);
  }

  .map-layers[open] > summary::after {
    transform: translateY(2px) rotate(225deg);
  }

  .layer-summary {
    margin-left: auto;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
  }

  .island-map-actions {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: 0.85fr 1.35fr;
    align-items: center;
    gap: 0.45rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--mobility-border);
    background: var(--mobility-surface);
  }

  .island-map-actions :global(.island-view-button) {
    min-width: 0;
    height: 2.375rem;
    padding: 0.55rem 0.4rem;
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    box-shadow: none;
  }

  .selected-map-controls {
    padding-bottom: 0.85rem;
  }

  .island-map-key {
    margin-top: 0.85rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--mobility-border);
  }

  .selected-map-caption,
  .selected-map-state {
    margin: 0.55rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.3;
  }

  .selected-map-state[role='alert'] {
    color: var(--mobility-danger-ink);
  }

  .demand-tabs-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.1rem;
    width: 100%;
    margin: 0.4rem 0 0.8rem;
    padding: 0.15rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }

  .demand-tabs-list :global(button) {
    min-width: 0;
    height: 1.8rem;
    padding: 0.3rem 0.2rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .demand-tabs-list :global(button[aria-pressed='true']) {
    background: var(--mobility-surface);
    color: var(--mobility-accent);
    box-shadow: var(--mobility-shadow-card);
  }

  .map-legend {
    position: absolute;
    z-index: 2;
    border: 1px solid var(--mobility-border-strong);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-panel);
  }

  .legend-title {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .map-legend {
    bottom: 1rem;
    left: 1rem;
    width: min(19rem, calc(100vw - 2rem));
    padding: 0.7rem 0.8rem;
    font-size: var(--mobility-text-sm);
    line-height: 1.2;
    pointer-events: none;
  }

  .score-scale {
    height: 0.55rem;
    margin-top: 0.45rem;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--mobility-map-score-0),
      var(--mobility-map-score-1),
      var(--mobility-map-score-2),
      var(--mobility-map-score-3),
      var(--mobility-map-score-4)
    );
  }

  .demand-scale {
    height: 0.55rem;
    margin-top: 0.45rem;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--mobility-map-demand-0),
      var(--mobility-map-demand-1),
      var(--mobility-map-demand-2),
      var(--mobility-map-demand-3),
      var(--mobility-map-demand-4),
      var(--mobility-map-demand-5),
      var(--mobility-map-demand-6),
      var(--mobility-map-demand-7)
    );
  }

  .score-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.25rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .score-unavailable {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.55rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .score-unavailable span {
    width: 0.65rem;
    height: 0.65rem;
    border: 1px solid var(--mobility-border);
    border-radius: 50%;
    background: var(--mobility-map-no-data);
  }

  .marker-legend {
    display: grid;
    grid-template-columns: repeat(3, max-content);
    justify-content: space-between;
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
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
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
    border: 2px solid var(--mobility-surface);
    border-radius: 50%;
    background: var(--marker-color);
    color: var(--mobility-on-accent);
    box-shadow: var(--mobility-shadow-card);
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

    .national-panel-slot.island-selected {
      max-height: 55dvh;
    }

    .map-legend {
      right: 0.75rem;
      bottom: 0.75rem;
      left: 0.75rem;
      width: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .map-layers > summary::after {
      transition: none;
    }
  }
</style>
