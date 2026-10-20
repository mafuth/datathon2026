<script lang="ts">
  import type { Map as MapLibreMap, MapOptions } from 'maplibre-gl';

  import { onMount } from 'svelte';

  import 'maplibre-gl/dist/maplibre-gl.css';

  import type { AnalyticsData, AnalyticsIsland } from './national-analytics-card.svelte';
  import type { IslandSearchOption } from './national-score-card.svelte';

  import NationalAnalyticsCard from './national-analytics-card.svelte';
  import NationalScoreCard from './national-score-card.svelte';

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
      properties: { score: number };
    }>;
  };

  const EMPTY_ISLAND_COLLECTION: IslandCollection = { type: 'FeatureCollection', features: [] };
  const EMPTY_SCORE_FIELD_COLLECTION: ScoreFieldCollection = { type: 'FeatureCollection', features: [] };
  const MALDIVES_CENTER: Coordinate = [73.2, 3.4];
  const ANIMATED_EMOJI_BASE_URL =
    'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/';
  const LOADING_MESSAGES = [
    {
      title: 'The islands are arguing over who gets rendered first.',
      emoji: 'Beaming%20Face%20with%20Smiling%20Eyes.png',
      alt: 'Beaming Face with Smiling Eyes'
    },
    {
      title: 'Counting islands without losing the plot.',
      emoji: 'Thinking%20Face.png',
      alt: 'Thinking Face'
    },
    {
      title: 'The data is swimming over.',
      emoji: 'Smiling%20Face.png',
      alt: 'Smiling Face'
    },
    {
      title: 'Asking the map to stop pretending it is still asleep.',
      emoji: 'Zzz.png',
      alt: 'Zzz Face'
    },
    {
      title: 'Untangling a few suspiciously complicated spreadsheets.',
      emoji: 'Face%20with%20Monocle.png',
      alt: 'Face with Monocle'
    },
    {
      title: 'Polishing the pixels until they behave.',
      emoji: 'Slightly%20Smiling%20Face.png',
      alt: 'Slightly Smiling Face'
    },
    {
      title: 'Convincing the score to reveal its secrets.',
      emoji: 'Worried%20Face.png',
      alt: 'Worried Face'
    },
    {
      title: 'The map is stretching before its big entrance.',
      emoji: 'Smiling%20Face.png',
      alt: 'Smiling Face'
    }
  ] as const;

  let mapElement: HTMLDivElement;
  let mapInstance: MapLibreMap | null = null;
  let mapReady = $state(false);
  let heatmapLoading = $state(true);
  let heatmapError = $state(false);
  let loadingMessage = $state<(typeof LOADING_MESSAGES)[number]>(LOADING_MESSAGES[0]);
  let islandCollection = $state<IslandCollection>(EMPTY_ISLAND_COLLECTION);
  let islandDetailLoaded = false;
  let islandDetailLoading = false;
  let analyticsOpen = $state(false);
  let analyticsLoading = $state(false);
  let analyticsError = $state<string | null>(null);
  let analyticsData = $state<AnalyticsData | null>(null);
  let nationalMetrics = $derived([
    { key: 'health', label: 'Health', value: analyticsData?.national.categories.health?.score },
    { key: 'education', label: 'Schools', value: analyticsData?.national.categories.education?.score },
    { key: 'transport', label: 'Getting around', value: analyticsData?.national.categories.transport?.score }
  ]);

  function focusIsland(island: IslandSearchOption): void {
    if (!mapInstance || !island.centroid) return;
    mapInstance.flyTo({ center: island.centroid, zoom: 10, duration: 900, essential: true });
  }

  function focusAnalyticsIsland(island: AnalyticsIsland): void {
    const mapIsland = islandCollection.features.find((feature) => feature.properties.id === island.id);
    const centroid = mapIsland?.properties.centroid ?? island.centroid;
    if (centroid) {
      focusIsland({
        id: island.id,
        name: island.name,
        atollName: island.atollName,
        centroid,
        score: island.overall.score
      });
    }
  }

  async function loadAnalytics(): Promise<void> {
    if (analyticsData || analyticsLoading) return;
    analyticsLoading = true;
    analyticsError = null;
    try {
      const response = await fetch('/api/map/analytics');
      if (!response.ok) throw new Error(`Analytics request failed with status ${response.status}`);
      analyticsData = (await response.json()) as AnalyticsData;
    } catch (error) {
      analyticsError = error instanceof Error ? error.message : 'Analytics could not be loaded.';
    } finally {
      analyticsLoading = false;
    }
  }

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
        'score-fields': { type: 'geojson', data: EMPTY_SCORE_FIELD_COLLECTION }
      },
      layers: [
        ...baseLayers,
        {
          id: 'national-score-fields',
          type: 'circle',
          source: 'score-fields',
          maxzoom: 6.8,
          paint: {
            'circle-color': scoreColor,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4.4, 5, 5.4, 7, 6.4, 10, 6.8, 11],
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 4.4, 0.72, 5.8, 0.58, 6.8, 0],
            'circle-blur': 0.12,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4.4, 0.55, 6.4, 0.9]
          }
        },
        {
          id: 'island-fill',
          type: 'fill',
          source: 'islands',
          minzoom: 5.8,
          paint: {
            'fill-color': scoreColor,
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4.4, 0.82, 7, 0.92]
          }
        },
        {
          id: 'island-outline',
          type: 'line',
          source: 'islands',
          minzoom: 5.8,
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
        mapReady = true;
        void loadAnalytics();
      });
    })();

    return () => {
      disposed = true;
      mapInstance?.remove();
      mapInstance = null;
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
      const scoreFields: ScoreFieldCollection = {
        type: 'FeatureCollection',
        features: islands.features.map((island) => ({
          type: 'Feature',
          id: island.id,
          geometry: { type: 'Point', coordinates: island.properties.centroid ?? [0, 0] },
          properties: { score: island.properties.score ?? 0 }
        }))
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
    aria-label="National Maldives accessibility score map"
    aria-busy={mapReady ? 'false' : 'true'}
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

  <div class="national-panel-slot" aria-live="polite">
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
      onIslandSelect={focusIsland}
      onAnalyticsOpen={openAnalytics}
      loading={!mapReady || analyticsLoading}
      error={Boolean(analyticsError)}
    />
  </div>

  <NationalAnalyticsCard
    bind:open={analyticsOpen}
    data={analyticsData}
    loading={analyticsLoading}
    error={analyticsError}
    onIslandSelect={focusAnalyticsIsland}
  />

  <section class="map-legend" aria-label="Accessibility score legend">
    <p class="legend-title">Accessibility score</p>
    <div class="score-scale" aria-hidden="true"></div>
    <div class="score-labels"><span>Low</span><span>High</span></div>
    <div class="score-unavailable"><span></span>No access / no data</div>
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
