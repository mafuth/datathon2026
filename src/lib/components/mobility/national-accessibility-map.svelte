<script lang="ts">
  import type {
    Map as MapLibreMap,
    Marker as MapLibreMarker,
    Popup as MapLibrePopup,
    MapMouseEvent,
    MapOptions
  } from 'maplibre-gl';

  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import X from '@lucide/svelte/icons/x';
  import { mount, onMount, tick, unmount } from 'svelte';
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
  import type { ProposalServiceFilter } from './proposal-builder.svelte';
  import type { ScenarioOperation, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';
  import type { AddServiceSelection } from '$lib/mobility/service-catalog';

  import { SERVICE_DRAG_MIME, serviceCatalogEntry } from '$lib/mobility/service-catalog';

  import { Button } from '$components/ui/button';
  import * as Tabs from '$components/ui/tabs';

  import { config } from '$config';

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
  import ProposalBuilder from './proposal-builder.svelte';
  import ProposalLauncher from './proposal-launcher.svelte';
  import ServiceDetailsPopup from './service-details-popup.svelte';
  import ServiceMapMarker from './service-map-marker.svelte';

  type Coordinate = [number, number];

  type Props = {
    presentationActive?: boolean;
    presentationStep?: PresentationStep | null;
  };

  let { presentationActive = false, presentationStep = null }: Props = $props();

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

  type PresentationRestoreState = {
    center: Coordinate;
    zoom: number;
    selectedIslandId: string | null;
    selectedDemandCategory: IslandDemandCategory;
    analyticsOpen: boolean;
    islandAnalyticsOpen: boolean;
  };

  const EMPTY_ISLAND_COLLECTION: IslandCollection = { type: 'FeatureCollection', features: [] };
  const EMPTY_SCORE_FIELD_COLLECTION: ScoreFieldCollection = { type: 'FeatureCollection', features: [] };
  const EMPTY_SERVICE_HEXES: IslandServiceHexes = { type: 'FeatureCollection', features: [] };
  const EMPTY_PRESENTATION_MAP: PresentationStep['mapData'] = { type: 'FeatureCollection', features: [] };
  const STORY_CAMERA_DURATION = 1100;
  const STORY_UI_LEAD = 150;
  const STORY_SCROLL_DURATION = 760;
  const STORY_JOURNEY_DEFAULT_DURATION = 2200;
  const STORY_JOURNEY_DEFAULT_START_DURATION = 700;
  const STORY_JOURNEY_DEFAULT_OVERVIEW_DURATION = 900;
  const STORY_JOURNEY_SCROLL_PAUSE = 180;
  const SELECTED_DEMAND_HEX_OPACITY = 0.9;
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
    { label: 'Health', color: '#bf4f55', icon: Hospital },
    { label: 'Education', color: '#4b6fa8', icon: School },
    { label: 'Transport', color: '#b47a3c', icon: Route }
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
  let proposalMode = $state(false);
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
  let proposalQuery = $state('');
  let proposalServiceFilter = $state<ProposalServiceFilter>('all');
  let proposalPending = $state(false);
  let proposalError = $state<string | null>(null);
  let draftOperations = $state<ScenarioOperation[]>([]);
  let moveServiceId = $state<string | null>(null);
  let proposalLastMessage = $state<string | null>(null);
  let addServiceDraft = $state<AddServiceSelection | null>(null);
  let suppressMapClickUntil = 0;
  let mountedServiceMarkers: MountedServiceMarker[] = [];
  let activeServicePopup: MountedServicePopup | null = null;
  let presentationRestoreState: PresentationRestoreState | null = null;
  let appliedPresentationStepId: string | null = null;
  let storyFocusStepId = $state<string | null>(null);
  let storyAnimationToken = 0;
  let storyScrollFrame: number | null = null;
  let presentationJourneyToken = 0;
  let presentationJourneyFrame: number | null = null;
  let presentationJourneyResolve: ((completed: boolean) => void) | null = null;
  let nationalMetrics = $derived([
    { key: 'health', label: 'Health', value: analyticsData?.national.categories.health?.score },
    { key: 'education', label: 'Schools', value: analyticsData?.national.categories.education?.score },
    { key: 'transport', label: 'Getting around', value: analyticsData?.national.categories.transport?.score }
  ]);
  let selectedIsland = $derived(analyticsData?.islands.find((island) => island.id === selectedIslandId) ?? null);

  function premiumLoadingExit(_node: Element, { duration = 820 }: { duration?: number } = {}) {
    const transitionDuration = prefersReducedMotion.current ? 0 : duration;

    return {
      duration: transitionDuration,
      easing: cubicOut,
      css: (t: number) => `opacity: ${t}; filter: blur(${(1 - t) * 3.5}px);`
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

  let visibleProposalServices = $derived.by(() => filterProposalServices(islandServices?.services ?? []));

  function selectIslandById(id: string, centroid?: Coordinate): void {
    if (proposalPending) return;
    if (proposalMode && selectedIslandId && selectedIslandId !== id) {
      closeServicePopup();
      stopMoveMode();
      stopAddServiceMode();
      draftOperations = [];
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

  function presentationCameraPadding(): { top: number; right: number; bottom: number; left: number } {
    const isMobile = (mapElement?.clientWidth ?? 0) <= 640;
    if (isMobile) return { top: 170, right: 24, bottom: 180, left: 24 };
    return { top: 145, right: 350, bottom: 125, left: 330 };
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
    if (coordinates.length < 2) return [...coordinates];

    const clampedProgress = Math.min(1, Math.max(0, progress));
    const segmentLengths = coordinates.slice(1).map((coordinate, index) => {
      const previous = coordinates[index];
      return Math.hypot(coordinate[0] - previous[0], coordinate[1] - previous[1]);
    });
    const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
    if (totalLength === 0) return [coordinates[0], coordinates.at(-1)!];
    if (clampedProgress <= 0) return [coordinates[0], coordinates[0]];
    if (clampedProgress >= 1) return [...coordinates];

    const targetLength = totalLength * clampedProgress;
    let travelled = 0;
    for (let index = 0; index < segmentLengths.length; index += 1) {
      const segmentLength = segmentLengths[index];
      if (travelled + segmentLength < targetLength) {
        travelled += segmentLength;
        continue;
      }

      const start = coordinates[index];
      const end = coordinates[index + 1];
      const ratio = segmentLength === 0 ? 0 : (targetLength - travelled) / segmentLength;
      return [
        ...coordinates.slice(0, index + 1),
        [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]
      ];
    }

    return [...coordinates];
  }

  function journeyCoordinateAtProgress(coordinates: readonly Coordinate[], progress: number): Coordinate {
    return visibleJourneyCoordinates(coordinates, progress).at(-1) ?? coordinates[0] ?? MALDIVES_CENTER;
  }

  function presentationMapDataForStep(step: PresentationStep, revealProgress = 1): PresentationStep['mapData'] {
    const highlighted = new Set(step.mapHighlightIds);
    return {
      type: 'FeatureCollection',
      features: step.mapData.features.map((feature) => {
        const geometry =
          feature.id === step.journey?.featureId && feature.geometry.type === 'LineString'
            ? {
                type: 'LineString' as const,
                coordinates: visibleJourneyCoordinates(feature.geometry.coordinates, revealProgress)
              }
            : feature.geometry;
        return {
          ...feature,
          geometry,
          properties: {
            ...feature.properties,
            focus: highlighted.has(feature.id)
          }
        };
      })
    };
  }

  function applyPresentationCamera(step: PresentationStep): void {
    if (!mapInstance) return;

    const reducedMotion = prefersReducedMotion.current;
    const duration = reducedMotion ? 0 : STORY_CAMERA_DURATION;
    const bounds = step.camera.fitCoordinates
      ? presentationBounds(step.camera.fitCoordinates as readonly Coordinate[])
      : null;

    if (bounds) {
      mapInstance.fitBounds(bounds, {
        padding: presentationCameraPadding(),
        maxZoom: step.camera.maxZoom ?? step.camera.zoom,
        duration,
        easing: storyEase,
        essential: !reducedMotion
      });
      return;
    }

    mapInstance.easeTo({
      center: step.camera.center,
      zoom: step.camera.zoom,
      duration,
      easing: storyEase,
      essential: !reducedMotion
    });
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
    presentationJourneyResolve?.(false);
    presentationJourneyResolve = null;
  }

  function waitForPresentationJourney(duration: number, token: number): Promise<boolean> {
    if (duration <= 0) return Promise.resolve(token === presentationJourneyToken);
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(token === presentationJourneyToken), duration);
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

  async function animatePresentationJourney(step: PresentationStep): Promise<void> {
    const journey = step.journey;
    if (!mapInstance || !journey) return;

    const token = ++presentationJourneyToken;
    const reducedMotion = prefersReducedMotion.current;
    const startDuration = reducedMotion ? 0 : (journey.startDuration ?? STORY_JOURNEY_DEFAULT_START_DURATION);
    const duration = reducedMotion ? 0 : (journey.duration ?? STORY_JOURNEY_DEFAULT_DURATION);
    const overviewDuration = reducedMotion ? 0 : (journey.overviewDuration ?? STORY_JOURNEY_DEFAULT_OVERVIEW_DURATION);
    const route = step.mapData.features.find(
      (feature) => feature.id === journey.featureId && feature.geometry.type === 'LineString'
    );
    if (!route || route.geometry.type !== 'LineString') return;

    setSourceData('presentation-map', presentationMapDataForStep(step, 0));
    const startedAtSelectedIsland = step.selectedIslandId
      ? focusPresentationIsland(step.selectedIslandId, startDuration)
      : false;
    if (!startedAtSelectedIsland) {
      mapInstance.easeTo({
        center: journey.start.center,
        zoom: journey.start.zoom,
        duration: startDuration,
        easing: storyEase,
        essential: !reducedMotion
      });
    }
    if (!(await waitForPresentationJourney(startDuration, token))) return;
    const journeyZoomLevel = mapInstance.getZoom();

    const completed = await new Promise<boolean>((resolve) => {
      presentationJourneyResolve = resolve;
      const startTime = performance.now();
      const frame = (now: number) => {
        if (token !== presentationJourneyToken) {
          presentationJourneyFrame = null;
          presentationJourneyResolve = null;
          resolve(false);
          return;
        }

        const progress = duration === 0 ? 1 : Math.min(1, (now - startTime) / duration);
        const center = journeyCoordinateAtProgress(route.geometry.coordinates, progress);
        mapInstance?.jumpTo({
          center,
          zoom: journey.keepZoom ? journeyZoomLevel : journeyZoom(progress, journey)
        });
        setSourceData('presentation-map', presentationMapDataForStep(step, progress));
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
    if (!completed || token !== presentationJourneyToken || !mapInstance) return;

    if (journey.arrivalIslandId) activatePresentationIsland(journey.arrivalIslandId);
    setSourceData('presentation-map', presentationMapDataForStep(step));
    if (journey.arrivalIslandId && focusPresentationIsland(journey.arrivalIslandId, overviewDuration)) return;
    mapInstance.easeTo({
      center: journey.overview.center,
      zoom: journey.overview.zoom,
      duration: overviewDuration,
      easing: storyEase,
      essential: !reducedMotion
    });
  }

  function cancelStoryAnimations(): void {
    storyAnimationToken += 1;
    if (storyScrollFrame !== null) {
      window.cancelAnimationFrame(storyScrollFrame);
      storyScrollFrame = null;
    }
  }

  function startStoryAnimation(): number {
    storyAnimationToken += 1;
    if (storyScrollFrame !== null) {
      window.cancelAnimationFrame(storyScrollFrame);
      storyScrollFrame = null;
    }
    return storyAnimationToken;
  }

  function storyDelay(duration: number, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(token === storyAnimationToken), duration);
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
      const startTime = performance.now();
      const frame = (now: number) => {
        if (token !== storyAnimationToken) {
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
    await tick();
    if (!presentationActive || presentationStep?.id !== step.id) return false;
    if (!(await storyDelay(STORY_UI_LEAD, token))) return false;
    if (!presentationActive || presentationStep?.id !== step.id) return false;

    const scrollTargets = step.scrollTargets ?? [];
    updateStoryUiHighlights([...step.uiTargets, ...scrollTargets]);

    if (scrollTargets.length === 0) {
      storyFocusStepId = step.id;
      return true;
    }

    for (const [index, scrollTarget] of scrollTargets.entries()) {
      const target = document.querySelector<HTMLElement>(`[data-story-target="${scrollTarget}"]`);
      if (!target) return false;
      if (!(await animateStoryScroll(target, token))) return false;
      if (index < scrollTargets.length - 1 && !(await storyDelay(STORY_JOURNEY_SCROLL_PAUSE, token))) return false;
    }
    storyFocusStepId = step.id;
    return true;
  }

  function clearStoryUiHighlights(): void {
    document.querySelectorAll<HTMLElement>('[data-story-focus="true"]').forEach((element) => {
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
      selectedIslandId,
      selectedDemandCategory,
      analyticsOpen,
      islandAnalyticsOpen
    };
  }

  function applyPresentationStep(step: PresentationStep): void {
    if (!mapInstance) return;

    mapInstance.stop();
    cancelPresentationJourney();
    cancelStoryAnimations();
    clearStoryUiHighlights();
    closeServicePopup();
    stopMoveMode();
    stopAddServiceMode();
    proposalMode = false;
    proposalPending = false;
    proposalError = null;
    proposalLastMessage = null;
    draftOperations = [];
    analyticsOpen = step.panel === 'national-analytics';
    if (analyticsOpen) void loadAnalytics();
    islandAnalyticsOpen = step.panel === 'island-analytics';
    storyFocusStepId = null;
    islandProfile = null;
    islandServices = null;
    islandProfileRequest += 1;
    islandServicesRequest += 1;

    if (step.selectedIslandId) {
      selectedIslandId = step.selectedIslandId;
      selectedDemandCategory = 'all';
      prepareSelectedIslandOverlay(step.selectedIslandId);
      void loadIslandProfile(step.selectedIslandId);
      void loadIslandServices(step.selectedIslandId);
    } else {
      returnToNational();
    }

    setSourceData('presentation-map', presentationMapDataForStep(step, step.journey ? 0 : 1));
    if (step.journey) void animatePresentationJourney(step);
    else if (!step.selectedIslandId || !focusPresentationIsland(step.selectedIslandId)) applyPresentationCamera(step);
  }

  function restoreAfterPresentation(): void {
    if (!mapInstance) return;
    mapInstance.stop();
    cancelPresentationJourney();
    cancelStoryAnimations();
    const restore = presentationRestoreState;
    presentationRestoreState = null;
    appliedPresentationStepId = null;
    clearStoryUiHighlights();
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
      duration: reducedMotion ? 0 : 700,
      essential: !reducedMotion
    });
  }

  function focusIsland(island: IslandSearchOption, duration = 850): void {
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
          duration: reducedMotion ? 0 : duration,
          essential: !reducedMotion
        });
        return;
      }
    }

    mapInstance.flyTo({
      center: island.centroid,
      zoom: Math.max(mapInstance.getZoom(), 10),
      duration: reducedMotion ? 0 : duration,
      essential: !reducedMotion
    });
  }

  function focusPresentationIsland(id: string, duration = 850): boolean {
    const island = islandCollection.features.find((feature) => feature.properties.id === id);
    if (!island) return false;

    focusIsland(
      {
        id,
        name: island.properties.name,
        atollName: island.properties.atollName,
        centroid: island.properties.centroid,
        score: island.properties.score
      },
      duration
    );
    return true;
  }

  function focusService(service: IslandMapService): void {
    const coordinates = service.coordinates;
    if (!mapInstance || !coordinates) return;

    const reducedMotion = prefersReducedMotion.current;
    mapInstance.easeTo({
      center: coordinates,
      zoom: Math.max(mapInstance.getZoom(), 15.5),
      duration: reducedMotion ? 0 : 650,
      essential: !reducedMotion
    });
    openServicePopup(service);
  }

  function selectSearchIsland(island: IslandSearchOption): void {
    selectIslandById(island.id, island.centroid);
  }

  function focusAnalyticsIsland(island: AnalyticsIsland): void {
    selectIslandById(island.id, island.centroid);
  }

  function activatePresentationIsland(id: string): void {
    selectedIslandId = id;
    selectedDemandCategory = 'all';
    analyticsOpen = false;
    islandAnalyticsOpen = true;
    islandProfile = null;
    islandProfileError = null;
    islandServices = null;
    islandServicesError = null;
    islandProfileRequest += 1;
    islandServicesRequest += 1;
    prepareSelectedIslandOverlay(id);
    void loadIslandProfile(id);
    void loadIslandServices(id);
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

  function stopMoveMode(): void {
    moveServiceId = null;
    if (mapInstance) mapInstance.getCanvas().style.cursor = '';
  }

  function stopAddServiceMode(): void {
    addServiceDraft = null;
    if (!moveServiceId && mapInstance) mapInstance.getCanvas().style.cursor = '';
  }

  function startAddService(selection: AddServiceSelection): void {
    if (!proposalMode) return;
    stopMoveMode();
    closeServicePopup();
    addServiceDraft = selection;
    proposalError = null;
    if (mapInstance) mapInstance.getCanvas().style.cursor = 'crosshair';
  }

  function startMoveService(service: IslandMapService): void {
    if (!proposalMode || !service.eligibility?.canMove) return;
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

  async function applyDraftOperation(operation: ScenarioOperation): Promise<void> {
    if (!selectedIslandId || proposalPending) return;
    if (!islandServices?.baselineVersion) {
      proposalError = islandServicesLoading
        ? 'Service data is still loading. Try again in a moment.'
        : 'Service data is unavailable for this island.';
      return;
    }

    const nextOperations = [...draftOperations, operation];
    proposalPending = true;
    proposalError = null;
    closeServicePopup();

    try {
      const response = await fetch('/api/v1/scenarios/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baselineVersion: islandServices.baselineVersion,
          selectedIslandId,
          operations: nextOperations
        })
      });
      const payload = (await response.json()) as ScenarioPreviewResponse | { error?: string };
      if (!response.ok) throw new Error('error' in payload && payload.error ? payload.error : 'Draft update failed.');

      const preview = payload as ScenarioPreviewResponse;
      draftOperations = nextOperations;
      islandServices = preview;
      proposalLastMessage = preview.operations.at(-1)?.message ?? null;
      setSourceData('selected-service-hexes', preview.hexes);
      applySelectedIslandMask(selectedIslandId);
      renderServiceMarkers(preview, filterProposalServices(preview.services));
      fadeDemandHexesTo(SELECTED_DEMAND_HEX_OPACITY, selectedIslandId);
      if (operation.kind === 'move_service') stopMoveMode();
      if (operation.kind === 'add_service') {
        stopAddServiceMode();
        const result = preview.operations.find((entry) => entry.operationId === operation.operationId);
        const addedService = result ? preview.services.find((service) => service.id === result.serviceId) : null;
        if (addedService) openServicePopup(addedService);
      }
    } catch (error) {
      proposalError = error instanceof Error ? error.message : 'Draft update failed.';
    } finally {
      proposalPending = false;
    }
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
    if (!proposalMode || !selectedIslandId || proposalPending) return;
    if (!event.dataTransfer?.types.includes(SERVICE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleMapDrop(event: DragEvent): void {
    if (!mapInstance || !proposalMode || !selectedIslandId || proposalPending) return;
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
        proposalMode,
        onUpgrade: (targetSubtype: string) => upgradeService(service, targetSubtype),
        onMove: () => startMoveService(service),
        onDelete: () => deleteService(service)
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

  function renderServiceMarkers(
    data: IslandServicesResponse,
    services: readonly IslandMapService[] = data.services
  ): void {
    if (!mapInstance || !maplibreMarkerConstructor) return;
    removeServiceMarkers();

    for (const service of services) {
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
      '#edf8e9',
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', weightProperty], 0],
        0,
        '#e5f5e0',
        0.1,
        '#a1d99b',
        0.22,
        '#fee08b',
        0.34,
        '#fdae61',
        0.46,
        '#f46d43',
        0.6,
        '#d73027',
        0.78,
        '#b2182b',
        1,
        '#67000d'
      ]
    ];
  }

  function demandFillOpacityExpression(category: IslandDemandCategory, multiplier = 1): unknown[] {
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
        0.08,
        0.08,
        0.18,
        0.2,
        0.34,
        0.35,
        0.52,
        0.5,
        0.72,
        0.7,
        0.86,
        1,
        0.98
      ]
    ];
    return multiplier === 1 ? opacity : ['*', opacity, multiplier];
  }

  function demandAvailabilityFilter(category: IslandDemandCategory): unknown[] {
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

  $effect(() => {
    if (!proposalMode || !islandServices || !selectedIslandId || !mapInstance) return;
    renderServiceMarkers(islandServices, visibleProposalServices);
  });

  $effect(() => {
    if (!presentationActive || !presentationStep || !mapReady || !mapInstance) return;
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
    if (presentationStep.scrollTargets?.length && (islandProfileLoading || analyticsLoading)) return;
    void focusStoryUi(presentationStep);
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
    const firstRoadLayerIndex = baseLayers.findIndex(
      (layer) => layer.type === 'line' && layer['source-layer'] === 'transportation'
    );
    const layersBeforeRoads = firstRoadLayerIndex === -1 ? baseLayers : baseLayers.slice(0, firstRoadLayerIndex);
    const roadLayers = firstRoadLayerIndex === -1 ? [] : baseLayers.slice(firstRoadLayerIndex);
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
        'selected-service-hexes': { type: 'geojson', data: EMPTY_SERVICE_HEXES },
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
            'fill-color': '#a1a1aa',
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
            'fill-opacity-transition': { duration: 700, delay: 0 },
            'fill-outline-color': 'rgba(255, 255, 255, 0.22)'
          }
        },
        ...roadLayers,
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
        },
        {
          id: 'presentation-route-verified',
          type: 'line',
          source: 'presentation-map',
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'verified']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0f766e',
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
            'line-color': '#f97316',
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
            'line-color': '#22c55e',
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
            'circle-color': ['match', ['get', 'kind'], 'proposal', '#22c55e', 'narrative', '#f97316', '#0f766e'],
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
            'circle-stroke-color': '#ffffff',
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
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 11, 13, 13],
            'text-anchor': 'top',
            'text-offset': [0, 1],
            'text-allow-overlap': true,
            'text-ignore-placement': true
          },
          paint: {
            'text-color': '#18181b',
            'text-opacity': ['case', ['boolean', ['get', 'focus'], false], 1, 0.35],
            'text-opacity-transition': { duration: 520, delay: 0 },
            'text-halo-color': '#ffffff',
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
      stopMoveMode();
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

  function createProposal(): void {
    closeServicePopup();
    proposalQuery = '';
    proposalServiceFilter = 'all';
    proposalPending = false;
    proposalError = null;
    proposalLastMessage = null;
    draftOperations = [];
    addServiceDraft = null;
    stopMoveMode();
    proposalMode = true;
  }

  function closeProposalMode(): void {
    closeServicePopup();
    stopMoveMode();
    proposalMode = false;
    proposalQuery = '';
    proposalServiceFilter = 'all';
    proposalError = null;
    proposalLastMessage = null;
    draftOperations = [];
    addServiceDraft = null;
    if (selectedIslandId) void loadIslandServices(selectedIslandId);
  }
</script>

<svelte:head>
  <title>{config.app.name} | Accessibility map</title>
  <meta name="description" content="National accessibility score map for the Maldives." />
</svelte:head>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && moveServiceId) stopMoveMode();
    else if (event.key === 'Escape' && addServiceDraft) stopAddServiceMode();
  }}
/>

<div class="map-shell">
  <div
    bind:this={mapElement}
    class="map-canvas"
    role="application"
    aria-label={selectedIslandId
      ? 'Selected island demand and residential access map'
      : 'National Maldives accessibility score map'}
    aria-busy={mapReady && !islandServicesLoading ? 'false' : 'true'}
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

  {#if selectedIslandId}
    <section
      class={`selected-map-controls${proposalMode ? ' proposal-mode-right' : ''}`}
      aria-hidden={proposalMode}
      aria-label="Selected island demand and residential access controls"
      data-story-target="island-demand"
    >
      <div class="selected-map-heading">
        <div>
          <p class="selected-map-eyebrow">Selected island</p>
          <h2>{islandServices?.island.name ?? selectedIsland?.name ?? 'Island services'}</h2>
        </div>
        {#if islandServicesLoading}<span class="selected-map-spinner" aria-label="Loading service demand"></span>{/if}
      </div>

      <p class="selected-map-caption">Demand pressure + residential access gap</p>
      <div class="service-marker-legend" aria-label="Service marker types">
        {#each SERVICE_MARKER_LEGEND as marker (marker.label)}
          {@const Icon = marker.icon}
          <span>
            <i class="marker-dot" style={`--marker-color: ${marker.color}`}><Icon size={11} strokeWidth={2.5} /></i>
            {marker.label.replace(' services', '')}
          </span>
        {/each}
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
          {islandServices.summary.mappedCoordinateCount} services · {islandServices.summary.residentialBuildingCount} residential
          buildings · {demandCategoryLabel(selectedDemandCategory)}
        </p>
      {/if}
    </section>
  {/if}

  <div
    class={`national-panel-slot${proposalMode ? ' proposal-mode-left' : ''}`}
    aria-hidden={proposalMode}
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
  </div>

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
    onClose={returnToNational}
    {proposalMode}
  />

  <section
    class={`map-legend${proposalMode ? ' proposal-mode-left' : ''}`}
    aria-hidden={proposalMode}
    aria-label={selectedIslandId ? 'Demand and residential access gap legend' : 'Accessibility score legend'}
  >
    {#if selectedIslandId}
      <p class="legend-title">
        {selectedDemandCategory === 'all'
          ? 'Demand + residential access gap'
          : `${demandCategoryLabel(selectedDemandCategory)} pressure + access gap`}
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

  {#if selectedIslandId && islandAnalyticsOpen && !proposalMode}
    <ProposalLauncher onCreate={createProposal} />
  {/if}

  {#if proposalMode}
    {#if selectedIslandId}
      <ProposalBuilder
        services={islandServices?.services ?? []}
        bind:query={proposalQuery}
        bind:serviceFilter={proposalServiceFilter}
        pending={proposalPending || islandServicesLoading}
        moveActive={moveServiceId !== null}
        error={proposalError}
        message={proposalLastMessage}
        onCancelMove={stopMoveMode}
        onSelectService={focusService}
        activeSelection={addServiceDraft}
        addServiceLabel={addServiceDraft
          ? serviceCatalogEntry(addServiceDraft.serviceType, addServiceDraft.subtype)?.label
          : null}
        onStartAddService={startAddService}
        onCancelAdd={stopAddServiceMode}
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

  :global([data-story-target]) {
    outline: 2px solid transparent;
    outline-offset: 4px;
    transition:
      outline-color 320ms ease,
      box-shadow 420ms ease;
  }

  :global([data-story-focus='true']) {
    outline: 3px solid #f97316;
    box-shadow:
      0 0 0 7px rgb(249 115 22 / 16%),
      0 0.7rem 2rem rgb(16 24 32 / 14%);
    animation: story-focus-pulse 2.4s ease-in-out 2;
  }

  @keyframes story-focus-pulse {
    0%,
    100% {
      outline-color: #f97316;
    }
    50% {
      outline-color: #fdba74;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global([data-story-focus='true']) {
      animation: none;
    }
    :global([data-story-target]) {
      transition: none;
    }
  }

  .national-panel-slot,
  .map-legend,
  .selected-map-controls {
    will-change: transform, opacity;
    backface-visibility: hidden;
    transition:
      transform 480ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 320ms ease-out;
  }

  .national-panel-slot {
    transition-delay: 0ms;
  }

  .selected-map-controls {
    transition-delay: 35ms;
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
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 999px;
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-accent, #09090b);
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 12%);
  }

  :global(.proposal-mode-close:hover) {
    border-color: var(--mobility-accent, #09090b);
    background: var(--mobility-accent-soft, #f4f4f5);
    color: var(--mobility-accent, #09090b);
  }

  @media (prefers-reduced-motion: reduce) {
    .national-panel-slot,
    .map-legend,
    .selected-map-controls {
      transition: none;
      will-change: auto;
    }
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

  .selected-map-controls {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 2;
    width: min(21rem, calc(100vw - 2rem));
    padding: 0.8rem;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.55rem;
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 12%);
    color: var(--mobility-text, #09090b);
  }

  .selected-map-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .selected-map-eyebrow {
    margin: 0;
    color: var(--mobility-focus, #3f3f46);
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
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
    line-height: 1.3;
  }

  .service-marker-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.7rem;
    margin-top: 0.55rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.57rem;
  }

  .service-marker-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .marker-dot {
    display: grid;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    border: 0;
    border-radius: 50%;
    background: var(--marker-color);
    color: #ffffff;
    box-shadow: 0 0.12rem 0.35rem rgb(16 24 32 / 14%);
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

  :global(.demand-tabs-list [data-slot='tabs-trigger']) {
    min-width: 0;
    padding: 0.3rem 0.2rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.58rem;
  }

  :global(.demand-tabs-list [data-slot='tabs-trigger'][data-state='active']) {
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
    background: var(--mobility-surface, #ffffff);
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
    background: linear-gradient(
      90deg,
      #e5f5e0 0%,
      #a1d99b 10%,
      #fee08b 22%,
      #fdae61 34%,
      #f46d43 46%,
      #d73027 60%,
      #b2182b 78%,
      #67000d 100%
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
