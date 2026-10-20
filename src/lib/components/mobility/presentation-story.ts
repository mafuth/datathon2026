import generatedAirportHospitalRoute from '../../../../data/mobility/derived/hulhule-airport-tree-top-route.json';

export type PresentationCoordinate = [number, number];

export type PresentationFeatureKind = 'verified' | 'narrative' | 'proposal';
export type PresentationUiTarget =
  | 'national-score'
  | 'island-score'
  | 'island-demand'
  | 'island-analytics'
  | 'island-elderly-population'
  | 'national-analytics';
export type PresentationScrollTarget = 'island-elderly-population' | 'island-health-demand' | 'national-focus-areas';
export type PresentationPanel = 'island-analytics' | 'national-analytics' | null;

export type PresentationJourney = {
  featureId: string;
  start: { center: PresentationCoordinate; zoom: number };
  end: { center: PresentationCoordinate; zoom: number };
  overview: { center: PresentationCoordinate; zoom: number };
  arrivalIslandId?: string;
  travelZoom?: number;
  keepZoom?: boolean;
  duration?: number;
  startDuration?: number;
  overviewDuration?: number;
};

export type PresentationMapFeature = {
  type: 'Feature';
  id: string;
  geometry:
    | { type: 'Point'; coordinates: PresentationCoordinate }
    | { type: 'LineString'; coordinates: PresentationCoordinate[] };
  properties: {
    kind: PresentationFeatureKind;
    focus?: boolean;
    name?: string;
    mode?: string;
  };
};

export type PresentationMapData = {
  type: 'FeatureCollection';
  features: PresentationMapFeature[];
};

export type PresentationFact = {
  label: string;
  value: string;
  tone?: 'default' | 'critical' | 'muted';
};

export type PresentationCue = {
  kind: 'speech' | 'direction';
  text: string;
};

export type PresentationStep = {
  id: string;
  eyebrow: string;
  title: string;
  speakerCues: readonly PresentationCue[];
  note?: string;
  facts: readonly PresentationFact[];
  source: string;
  camera: {
    center: PresentationCoordinate;
    zoom: number;
    fitCoordinates?: readonly PresentationCoordinate[];
    maxZoom?: number;
  };
  selectedIslandId?: string | null;
  panel?: PresentationPanel;
  uiTargets: readonly PresentationUiTarget[];
  scrollTargets?: readonly PresentationScrollTarget[];
  journey?: PresentationJourney;
  mapHighlightIds: readonly string[];
  mapData: PresentationMapData;
};

const BAARAH: PresentationCoordinate = [73.21018, 6.81929];
const BAARAH_CENTROID: PresentationCoordinate = [73.2083825, 6.8166613889];
const BAARASHU_HEALTH_CENTRE: PresentationCoordinate = [73.2126251, 6.8176671];
const VASHAFARU: PresentationCoordinate = [73.16241, 6.89618];
const VASHAFARU_CENTROID: PresentationCoordinate = [73.1597513889, 6.8976038889];
const DHIHDDHOO: PresentationCoordinate = [73.11511, 6.8881];
const DHIHDDHOO_CENTROID: PresentationCoordinate = [73.1109283333, 6.8881094444];
const HANIMAADHOO: PresentationCoordinate = [73.17379, 6.76686];
const HANIMAADHOO_CENTROID: PresentationCoordinate = [73.1696577778, 6.7539208333];
const HANIMAADHOO_AIRPORT: PresentationCoordinate = [73.167818, 6.745275];
const HULHULE_AIRPORT: PresentationCoordinate = [73.528856, 4.191794];
const HULHUMALE_TERMINAL: PresentationCoordinate = [73.537247, 4.217005];
const HULHUMALE_CENTROID: PresentationCoordinate = [73.5424630556, 4.2220713889];
const TREE_TOP_HOSPITAL: PresentationCoordinate = [73.539012, 4.212707];

const BAARAH_TO_VASHAFARU: PresentationCoordinate[] = [
  BAARAH,
  [73.2038, 6.8364],
  [73.1946, 6.8588],
  [73.1804, 6.8802],
  VASHAFARU
];
const VASHAFARU_TO_DHIHDDHOO: PresentationCoordinate[] = [
  VASHAFARU,
  [73.1518, 6.8992],
  [73.1371, 6.8986],
  [73.13, 6.8908],
  [73.1225, 6.8908],
  DHIHDDHOO
];
const DHIHDDHOO_TO_HANIMAADHOO: PresentationCoordinate[] = [
  DHIHDDHOO,
  [73.121, 6.8695],
  [73.1353, 6.8362],
  [73.1492, 6.8001],
  [73.1632, 6.7782],
  HANIMAADHOO
];
const HANIMAADHOO_TO_HULHULE: PresentationCoordinate[] = [
  HANIMAADHOO_AIRPORT,
  [73.22, 6.35],
  [73.28, 5.7],
  [73.36, 5.02],
  [73.44, 4.46],
  HULHULE_AIRPORT
];

const HULHULE_TO_TREE_TOP: PresentationCoordinate[] = generatedAirportHospitalRoute.geometry.coordinates.map(
  ([longitude, latitude]): PresentationCoordinate => [longitude, latitude]
);

const EMPTY_PRESENTATION_MAP: PresentationMapData = {
  type: 'FeatureCollection',
  features: []
};

function point(
  id: string,
  coordinates: PresentationCoordinate,
  kind: PresentationFeatureKind,
  name: string,
  mode = 'location'
): PresentationMapFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates },
    properties: { kind, name, mode }
  };
}

function line(
  id: string,
  coordinates: PresentationCoordinate[],
  kind: PresentationFeatureKind,
  mode: string
): PresentationMapFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'LineString', coordinates },
    properties: { kind, mode }
  };
}

function speech(text: string): PresentationCue {
  return { kind: 'speech', text };
}

function direction(text: string): PresentationCue {
  return { kind: 'direction', text };
}

const BAARAH_ONLY: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    point('baarah', BAARAH, 'verified', 'Baarah · 07:35'),
    point('baarashu-health-centre', BAARASHU_HEALTH_CENTRE, 'verified', 'Baarashu Health Centre', 'health')
  ]
};

const FERRY_BAARAH_VASHAFARU: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    line('baarah-vashafaru', BAARAH_TO_VASHAFARU, 'verified', 'RTL ferry · S1C5 · plotted sea path'),
    point('baarah', BAARAH, 'verified', 'Baarah · 07:35'),
    point('vashafaru', VASHAFARU, 'verified', 'Vashafaru · 07:55')
  ]
};

const FERRY_TO_DHIHDDHOO: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    ...FERRY_BAARAH_VASHAFARU.features,
    line('vashafaru-dhihdhoo', VASHAFARU_TO_DHIHDDHOO, 'verified', 'RTL ferry · S1C5 · plotted sea path'),
    point('dhihdhoo', DHIHDDHOO, 'verified', 'Dhihdhoo · 08:10')
  ]
};

const FERRY_TO_HANIMAADHOO: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    ...FERRY_TO_DHIHDDHOO.features,
    line('dhihdhoo-hanimaadhoo', DHIHDDHOO_TO_HANIMAADHOO, 'verified', 'RTL ferry · S1C6 · plotted sea path'),
    point('hanimaadhoo', HANIMAADHOO, 'verified', 'Hanimaadhoo · 11:25')
  ]
};

const AIRPORT_LEG: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    ...FERRY_TO_HANIMAADHOO.features,
    line('hanimaadhoo-hulhule', HANIMAADHOO_TO_HULHULE, 'narrative', 'Modeled air link · schedule unavailable'),
    point('hanimaadhoo-airport', HANIMAADHOO_AIRPORT, 'verified', 'Hanimaadhoo Airport · VRMH', 'airport'),
    point('hulhule-airport', HULHULE_AIRPORT, 'verified', 'Hulhule / Velana · VRMM', 'airport')
  ]
};

const CARE_LAST_MILE: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    ...AIRPORT_LEG.features,
    point('hulhumale-terminal', HULHUMALE_TERMINAL, 'verified', 'Hulhumale · ferry terminal', 'terminal'),
    line('hulhule-tree-top-road', HULHULE_TO_TREE_TOP, 'verified', 'OpenStreetMap road graph · generated route'),
    point('tree-top-hospital', TREE_TOP_HOSPITAL, 'verified', 'Tree Top Hospital', 'hospital')
  ]
};

export const PRESENTATION_STEPS: readonly PresentationStep[] = [
  {
    id: 'opening',
    eyebrow: 'The last few kilometres',
    title: 'A medical emergency is also a mobility emergency.',
    speakerCues: [
      direction('[SCREEN: Map of the Maldives. Do not touch anything yet.]'),
      direction('[Look at the judges, not the screen.]'),
      speech('Last year, my mom had a stroke in Haa Alifu Baarah.'),
      direction('[PAUSE]')
    ],
    note: 'A personal story set against verified mobility evidence.',
    facts: [],
    source: 'Story opening',
    camera: { center: [73.2, 3.4], zoom: 4.7 },
    selectedIslandId: null,
    uiTargets: ['national-score'],
    mapHighlightIds: [],
    mapData: EMPTY_PRESENTATION_MAP
  },
  {
    id: 'baarah',
    eyebrow: '01 / Baarah · Haa Alifu',
    title: 'Local care exists. Urgent care does not.',
    speakerCues: [
      direction('[SCREEN: Select Baarah. Show the health-demand figures.]'),
      speech('Baarah has a health centre.'),
      speech('But that health centre cannot provide all the care my mother needs.'),
      speech('The model shows 414 people needing hospital care outside Baarah.'),
      speech('61 of them are elderly people.'),
      speech('That number is easy to read on a screen.'),
      speech('I put a face to it.'),
      speech('I see my mother.'),
      direction('[PAUSE]')
    ],
    note: 'Baarashu Health Centre is local care, but it cannot provide all the care represented in the model for Baarah.',
    facts: [
      { label: 'Population', value: '1,141' },
      { label: 'Elderly 65+', value: '61' },
      { label: 'People needing hospital care', value: '414', tone: 'critical' },
      { label: 'Baarashu Health Centre', value: '1 local centre' },
      { label: 'Care gap', value: 'Hospital care outside Baarah', tone: 'critical' },
      { label: 'Elderly people', value: '61', tone: 'critical' },
      { label: 'Care need', value: 'Hospital treatment' }
    ],
    source: 'Google Maps place record · OneMap · MBS · mobility analytics estimate',
    camera: { center: BAARAH_CENTROID, zoom: 12.8 },
    selectedIslandId: 'island:640',
    panel: 'island-analytics',
    uiTargets: ['island-score', 'island-demand', 'island-analytics'],
    scrollTargets: ['island-elderly-population', 'island-health-demand'],
    mapHighlightIds: ['baarah', 'baarashu-health-centre'],
    mapData: BAARAH_ONLY
  },
  {
    id: 'ferry-baarah-vashafaru',
    eyebrow: '02 / Baarah → Vashafaru',
    title: 'The first crossing leaves the island behind.',
    speakerCues: [
      direction('[SCREEN: Show the ferry route.]'),
      speech('At 7:35, she left Baarah.'),
      speech('But she did not go straight to an airport.'),
      speech('The ferry took her through Vashafaru first.')
    ],
    note: 'The timetable is verified. The plotted sea path is a modeled presentation path because the schedule has no vessel track geometry.',
    facts: [
      { label: 'RTL route', value: 'S1C5' },
      { label: 'Departure', value: '07:35 · Baarah' },
      { label: 'First stop', value: '07:55 · Vashafaru' },
      { label: 'Operating days', value: 'Sun–Thu, Sat' },
      { label: 'Sea track', value: 'Modeled for story', tone: 'muted' }
    ],
    source: 'RTL ferry snapshot · effective October 2026',
    camera: { center: VASHAFARU_CENTROID, zoom: 12.8 },
    journey: {
      featureId: 'baarah-vashafaru',
      start: { center: BAARAH, zoom: 12.8 },
      end: { center: VASHAFARU, zoom: 12.8 },
      overview: { center: VASHAFARU_CENTROID, zoom: 12.8 },
      arrivalIslandId: 'island:611',
      keepZoom: true,
      duration: 1900,
      startDuration: 650,
      overviewDuration: 850
    },
    selectedIslandId: 'island:640',
    panel: 'island-analytics',
    uiTargets: ['island-score', 'island-demand', 'island-analytics'],
    mapHighlightIds: ['baarah-vashafaru', 'baarah', 'vashafaru'],
    mapData: FERRY_BAARAH_VASHAFARU
  },
  {
    id: 'ferry-vashafaru-dhihdhoo',
    eyebrow: '03 / Vashafaru → Dhihdhoo',
    title: 'The journey is a chain of handoffs.',
    speakerCues: [
      direction('[SCREEN: Continue the ferry route to Dhihdhoo.]'),
      speech('The ferry continued through Dhihdhoo.'),
      speech('Every stop meant waiting for the next connection.'),
      speech('Every connection meant more time before she could reach a hospital.'),
      direction('[PAUSE]')
    ],
    note: "The route endpoint opens that island's analytics and keeps the map focused on the arriving island.",
    facts: [
      { label: 'RTL route', value: 'S1C5' },
      { label: 'Departure', value: '07:55 · Vashafaru' },
      { label: 'Arrival', value: '08:10 · Dhihdhoo' },
      { label: 'Transfer', value: 'One more island handoff' }
    ],
    source: 'RTL ferry snapshot · effective October 2026',
    camera: { center: DHIHDDHOO_CENTROID, zoom: 12.8 },
    journey: {
      featureId: 'vashafaru-dhihdhoo',
      start: { center: VASHAFARU, zoom: 12.8 },
      end: { center: DHIHDDHOO, zoom: 12.8 },
      overview: { center: DHIHDDHOO_CENTROID, zoom: 12.8 },
      arrivalIslandId: 'island:625',
      keepZoom: true,
      duration: 1900,
      startDuration: 700,
      overviewDuration: 850
    },
    selectedIslandId: 'island:611',
    panel: 'island-analytics',
    uiTargets: ['island-score', 'island-demand', 'island-analytics'],
    mapHighlightIds: ['vashafaru-dhihdhoo', 'vashafaru', 'dhihdhoo'],
    mapData: FERRY_TO_DHIHDDHOO
  },
  {
    id: 'ferry-dhihdhoo-hanimaadhoo',
    eyebrow: '04 / Dhihdhoo → Hanimaadhoo',
    title: 'Even the airport is still one connection away.',
    speakerCues: [
      direction('[SCREEN: Show the next ferry to Hanimaadhoo.]'),
      speech('At 11:00, she boarded another ferry.'),
      speech('At 11:25, she finally reached Hanimaadhoo Airport.'),
      direction('[PAUSE]'),
      speech('An airport is not a hospital.')
    ],
    note: 'The timetable is verified; the plotted sea path remains a modeled presentation path.',
    facts: [
      { label: 'RTL route', value: 'S1C6' },
      { label: 'Departure', value: '11:00 · Dhihdhoo' },
      { label: 'Arrival', value: '11:25 · Hanimaadhoo' },
      { label: 'Airport', value: 'VRMH' }
    ],
    source: 'RTL ferry snapshot · effective October 2026',
    camera: { center: HANIMAADHOO_CENTROID, zoom: 12.4 },
    journey: {
      featureId: 'dhihdhoo-hanimaadhoo',
      start: { center: DHIHDDHOO, zoom: 12.4 },
      end: { center: HANIMAADHOO, zoom: 12.4 },
      overview: { center: HANIMAADHOO_CENTROID, zoom: 12.4 },
      arrivalIslandId: 'island:684',
      keepZoom: true,
      duration: 2200,
      startDuration: 700,
      overviewDuration: 950
    },
    selectedIslandId: 'island:625',
    panel: 'island-analytics',
    uiTargets: ['island-score', 'island-demand', 'island-analytics'],
    mapHighlightIds: ['dhihdhoo-hanimaadhoo', 'dhihdhoo', 'hanimaadhoo'],
    mapData: FERRY_TO_HANIMAADHOO
  },
  {
    id: 'flight-to-hulhule',
    eyebrow: '05 / Hanimaadhoo → Hulhule',
    title: 'An airport is still not care.',
    speakerCues: [
      direction('[SCREEN: Show the flight to Hulhule.]'),
      speech('Then she flew to Hulhule.'),
      speech('But the distance is real.'),
      direction('[PAUSE]')
    ],
    note: 'Airport records are verified. The flight line is a modeled connection because flight schedules and tracks are not in the current dataset.',
    facts: [
      { label: 'Departure', value: 'Hanimaadhoo · VRMH' },
      { label: 'Arrival', value: 'Hulhule · VRMM' },
      { label: 'Connection', value: 'Airport to airport' }
    ],
    source: 'Airport records · modeled transport link',
    camera: { center: HULHULE_AIRPORT, zoom: 12.2 },
    journey: {
      featureId: 'hanimaadhoo-hulhule',
      start: { center: HANIMAADHOO_AIRPORT, zoom: 10.8 },
      end: { center: HULHULE_AIRPORT, zoom: 10.8 },
      overview: { center: HULHULE_AIRPORT, zoom: 12.2 },
      travelZoom: 10.8,
      duration: 9000,
      startDuration: 750,
      overviewDuration: 1000
    },
    selectedIslandId: null,
    panel: null,
    uiTargets: ['national-score'],
    mapHighlightIds: ['hanimaadhoo-hulhule', 'hanimaadhoo-airport', 'hulhule-airport'],
    mapData: AIRPORT_LEG
  },
  {
    id: 'road-to-care',
    eyebrow: '06 / Hulhule → Tree Top Hospital',
    title: 'Landing is not arriving.',
    speakerCues: [
      direction('[SCREEN: Select Hulhumalé. Show health demand.]'),
      speech('When she landed, it was raining.'),
      speech('After the ferries, the flight, and all that waiting, she still had to stand in a queue for treatment.'),
      direction('[PAUSE]'),
      speech('That is the gap in access.'),
      speech('Reaching the island is not the same as reaching care.'),
      speech('We make that pressure visible.'),
      direction('[LONG PAUSE]')
    ],
    note: 'Arrival activates Hulhumalé health demand and mapped services so the destination can be read as part of the access system.',
    facts: [
      { label: 'Origin', value: 'Hulhule / Velana · VRMM' },
      { label: 'Arrival', value: 'Hulhumalé' },
      { label: 'Care destination', value: 'Tree Top Hospital' },
      { label: 'Island view', value: 'Health demand and services' }
    ],
    source: 'Mobility analytics · mapped hospital and service records',
    camera: { center: HULHUMALE_CENTROID, zoom: 13.8 },
    journey: {
      featureId: 'hulhule-tree-top-road',
      start: { center: HULHULE_AIRPORT, zoom: 13.8 },
      end: { center: TREE_TOP_HOSPITAL, zoom: 14.5 },
      overview: { center: HULHUMALE_CENTROID, zoom: 13.8 },
      arrivalIslandId: 'island:1442',
      travelZoom: 14.2,
      duration: 2800,
      startDuration: 800,
      overviewDuration: 1000
    },
    selectedIslandId: null,
    uiTargets: ['island-score', 'island-demand', 'island-analytics'],
    mapHighlightIds: ['hulhule-tree-top-road', 'hulhule-airport', 'tree-top-hospital'],
    mapData: CARE_LAST_MILE
  },
  {
    id: 'close',
    eyebrow: '07 / The wider map',
    title: 'One story opens the wider map.',
    speakerCues: [
      direction('[SCREEN: Clear the route. Open national analytics.]'),
      speech('This is not just a route on a map.'),
      speech("It is my mother's journey."),
      speech('It is the ferries, the airport, the waiting, and the care she was still trying to reach.'),
      speech('We make that whole chain visible.'),
      speech('Not to make the journey look simple.'),
      speech('To show where it becomes difficult.'),
      direction('[LONG PAUSE]'),
      speech('My mother is one person.'),
      speech('But the data shows that this problem is bigger than one family.'),
      speech('Baarah is not the only island where demand and access are out of balance.'),
      direction('[LONG PAUSE]'),
      speech('That is what we are building: a way to see the gap before another family has to live through it.')
    ],
    note: 'The journey path is cleared so the national priority view can take over.',
    facts: [
      { label: 'View', value: 'National analytics' },
      { label: 'Focus', value: 'Most underserved areas' },
      { label: 'Next question', value: 'Where should attention go?' }
    ],
    source: 'Mobility Sandbox',
    camera: { center: [73.2, 3.4], zoom: 4.7 },
    selectedIslandId: null,
    panel: 'national-analytics',
    uiTargets: ['national-score', 'national-analytics'],
    scrollTargets: ['national-focus-areas'],
    mapHighlightIds: [],
    mapData: EMPTY_PRESENTATION_MAP
  }
];

export const EMPTY_PRESENTATION_MAP_DATA: PresentationMapData = EMPTY_PRESENTATION_MAP;
