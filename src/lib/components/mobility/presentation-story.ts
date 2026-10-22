import type { PresentationVehicleMode } from './presentation-vehicle';

import generatedAirportHospitalRoute from '../../../../data/mobility/derived/hulhule-airport-tree-top-route.json';
import retainedStaffPickup from '../../../../data/mobility/derived/hulhumale-airport-staff-pickup.json';

export type PresentationCoordinate = [number, number];

export type PresentationFeatureKind = 'verified' | 'narrative' | 'proposal';
export type PresentationUiTarget =
  | 'national-score'
  | 'island-score'
  | 'island-demand'
  | 'island-analytics'
  | 'island-elderly-population'
  | 'national-analytics';
export type PresentationScrollTarget =
  | 'island-population'
  | 'island-elderly-population'
  | 'island-health-demand'
  | 'island-connections'
  | 'national-focus-areas';
export type PresentationPanel = 'island-analytics' | 'national-analytics' | null;

export type PresentationJourney = {
  featureId: string;
  vehicle?: PresentationVehicleMode;
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

export type PresentationTimingBasis = 'timetable' | 'estimate' | 'unknown';

export type PresentationLegTiming = {
  seconds: number | null;
  basis: PresentationTimingBasis;
  label: string;
};

export type PresentationStepTiming = {
  patient?: PresentationLegTiming;
  staff?: PresentationLegTiming;
  /** Screen playback only; never used to calculate journey time. */
  playbackDuration?: number;
  unconfirmed?: { patient?: string; staff?: string };
};

export type PresentationStep = {
  id: string;
  eyebrow: string;
  title: string;
  speakerCues: readonly PresentationCue[];
  note?: string;
  showOutboundDemand?: boolean;
  /** Analytics context, independent of the animated map selection. */
  evidenceIslandId?: string;
  timing?: PresentationStepTiming;
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
const VASHAFARU: PresentationCoordinate = [73.16241, 6.89618];
const VASHAFARU_CENTROID: PresentationCoordinate = [73.1597513889, 6.8976038889];
const DHIHDDHOO: PresentationCoordinate = [73.11511, 6.8881];
const DHIHDDHOO_CENTROID: PresentationCoordinate = [73.1109283333, 6.8881094444];
const HANIMAADHOO: PresentationCoordinate = [73.17379, 6.76686];
const HANIMAADHOO_CENTROID: PresentationCoordinate = [73.1696577778, 6.7539208333];
const HANIMAADHOO_AIRPORT: PresentationCoordinate = [73.167818, 6.745275];
const HULHULE_AIRPORT: PresentationCoordinate = [73.528856, 4.191794];
const HULHUMALE_CENTROID: PresentationCoordinate = [73.5424630556, 4.2220713889];
const TREE_TOP_HOSPITAL: PresentationCoordinate = [73.539012, 4.212707];

// Precomputed against the normalized island coastlines. Landward harbor records
// stop at exterior shore for display; no land apron is added to ferry traces.
const BAARAH_TO_VASHAFARU: PresentationCoordinate[] = [
  [73.20989945587992, 6.819330558547142],
  [73.19759674604421, 6.826634019920911],
  [73.15581512410996, 6.8630253199923645],
  VASHAFARU
];
const VASHAFARU_TO_DHIHDDHOO: PresentationCoordinate[] = [
  VASHAFARU,
  [73.16251304493578, 6.895661958124881],
  [73.14541835087054, 6.882071294176967],
  DHIHDDHOO
];
const DHIHDDHOO_TO_HANIMAADHOO: PresentationCoordinate[] = [
  DHIHDDHOO,
  [73.13696110324895, 6.86624889675105],
  [73.1734394519078, 6.767092274239246],
  [73.17377552358154, 6.766867718326037]
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
const STAFF_ORIGIN: PresentationCoordinate = [
  ...retainedStaffPickup.initial_walk.origin.coordinates
] as PresentationCoordinate;
const STAFF_BUS_STOP: PresentationCoordinate = [
  ...retainedStaffPickup.initial_walk.destination.coordinates
] as PresentationCoordinate;
const STAFF_AIRPORT_STOP: PresentationCoordinate = [
  ...retainedStaffPickup.bus_ride.destination.coordinates
] as PresentationCoordinate;
const STAFF_TERMINAL: PresentationCoordinate = [
  ...retainedStaffPickup.terminal_walk.destination.coordinates
] as PresentationCoordinate;
const STAFF_WALK: PresentationCoordinate[] = retainedStaffPickup.initial_walk.geometry.coordinates.map(
  ([longitude, latitude]): PresentationCoordinate => [longitude, latitude]
);
const STAFF_BUS: PresentationCoordinate[] = retainedStaffPickup.bus_ride.geometry.coordinates.map(
  ([longitude, latitude]): PresentationCoordinate => [longitude, latitude]
);
const STAFF_TERMINAL_CONNECTOR: PresentationCoordinate[] = retainedStaffPickup.terminal_walk.geometry.coordinates.map(
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
  features: [point('baarah', BAARAH, 'verified', 'Baarah · 07:35')]
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
    line('vashafaru-dhihdhoo', VASHAFARU_TO_DHIHDDHOO, 'verified', 'RTL ferry · S1C5 · plotted sea path'),
    point('vashafaru', VASHAFARU, 'verified', 'Vashafaru · 07:55'),
    point('dhihdhoo', DHIHDDHOO, 'verified', 'Dhihdhoo · 08:10')
  ]
};

const FERRY_TO_HANIMAADHOO: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    line('dhihdhoo-hanimaadhoo', DHIHDDHOO_TO_HANIMAADHOO, 'verified', 'RTL ferry · S1C6 · plotted sea path'),
    point('dhihdhoo', DHIHDDHOO, 'verified', 'Dhihdhoo · 11:00'),
    point('hanimaadhoo', HANIMAADHOO, 'verified', 'Hanimaadhoo · 11:25')
  ]
};

const AIRPORT_LEG: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    line('hanimaadhoo-hulhule', HANIMAADHOO_TO_HULHULE, 'narrative', 'Modeled air link · schedule unavailable'),
    point('hanimaadhoo-airport', HANIMAADHOO_AIRPORT, 'verified', 'Hanimaadhoo Airport · VRMH', 'airport'),
    point('hulhule-airport', HULHULE_AIRPORT, 'verified', 'Hulhule / Velana · VRMM', 'airport')
  ]
};

const DHIHDDHOO_WAIT: PresentationMapData = {
  type: 'FeatureCollection',
  features: [point('dhihdhoo', DHIHDDHOO, 'verified', 'Dhihdhoo · 08:10–11:00', 'terminal')]
};

const HANIMAADHOO_CONNECTION: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    point('hanimaadhoo', HANIMAADHOO, 'verified', 'Hanimaadhoo harbour', 'terminal'),
    point('hanimaadhoo-airport', HANIMAADHOO_AIRPORT, 'verified', 'Hanimaadhoo Airport · VRMH', 'airport')
  ]
};

const CARE_LAST_MILE: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    point('hulhule-airport', HULHULE_AIRPORT, 'verified', 'Hulhule / Velana · VRMM', 'airport'),
    point(
      'staff-airport-terminal',
      STAFF_TERMINAL,
      'narrative',
      'Retained pickup endpoint · separate airport anchor',
      'airport'
    ),
    line('hulhule-tree-top-road', HULHULE_TO_TREE_TOP, 'verified', 'OpenStreetMap road graph · generated route'),
    point('tree-top-hospital', TREE_TOP_HOSPITAL, 'verified', 'Tree Top Hospital', 'hospital')
  ]
};

const STAFF_WALK_MAP: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    point('staff-origin', STAFF_ORIGIN, 'narrative', 'Hulhumalé pickup origin · 15:20'),
    line('staff-origin-bus-stop', STAFF_WALK, 'narrative', 'Retained walking network estimate'),
    point('staff-bus-stop', STAFF_BUS_STOP, 'verified', 'Hiya Flats Stop 2 · R9', 'bus')
  ]
};

const STAFF_WAIT_MAP: PresentationMapData = {
  type: 'FeatureCollection',
  features: [point('staff-bus-stop', STAFF_BUS_STOP, 'verified', 'Hiya Flats Stop 2 · wait until 16:05', 'bus')]
};

const STAFF_BUS_MAP: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    point('staff-bus-stop', STAFF_BUS_STOP, 'verified', 'Hiya Flats Stop 2 · 16:05', 'bus'),
    line('staff-r9-airport', STAFF_BUS, 'narrative', 'Retained R9 display path · airport corridor schematic'),
    point('staff-airport-stop', STAFF_AIRPORT_STOP, 'verified', 'VIA Domestic Terminal · 16:11', 'bus')
  ]
};

const STAFF_TERMINAL_MAP: PresentationMapData = {
  type: 'FeatureCollection',
  features: [
    point('staff-airport-stop', STAFF_AIRPORT_STOP, 'verified', 'VIA Domestic Terminal', 'bus'),
    line(
      'staff-airport-terminal-walk',
      STAFF_TERMINAL_CONNECTOR,
      'narrative',
      'Retained model snap connector · not observed walking'
    ),
    point('staff-airport-terminal', STAFF_TERMINAL, 'narrative', 'Retained pickup endpoint', 'airport')
  ]
};

export const PRESENTATION_STEPS: readonly PresentationStep[] = [
  {
    id: 'opening',
    evidenceIslandId: 'island:640',
    eyebrow: 'The last few kilometres',
    title: 'A medical emergency is also a mobility emergency.',
    speakerCues: [
      direction('[SCREEN: Map of the Maldives. Let the map settle.]'),
      direction('[Look at the judges.]'),
      speech('Last year, my mom had a stroke in Haa Alifu Baarah.'),
      direction('[PAUSE]')
    ],
    note: 'An illustrative journey using retained timetables and clearly marked estimates.',
    facts: [],
    source: 'Personal story · transport reconstruction',
    camera: { center: [73.2, 3.4], zoom: 4.7 },
    selectedIslandId: null,
    uiTargets: [],
    mapHighlightIds: [],
    mapData: EMPTY_PRESENTATION_MAP
  },
  {
    id: 'baarah',
    eyebrow: '01 / Baarah · Haa Alifu',
    title: 'The journey starts before the first crossing.',
    speakerCues: [
      direction('[SCREEN: Locate Baarah and its harbour.]'),
      speech('To reach treatment beyond Baarah, my mother first had to leave the island.'),
      speech('Follow the connections: a ferry, another island, an airport, and the final road journey.'),
      direction('[PAUSE]')
    ],
    note: 'The retained timetable illustrates the connections, not the original emergency itinerary.',
    showOutboundDemand: true,
    facts: [
      { label: 'Purpose', value: 'Travel for treatment' },
      { label: 'First departure', value: '07:35 · Baarah' },
      { label: 'Airport connection', value: 'Via Hanimaadhoo' }
    ],
    source: 'Personal story · retained RTL ferry timetable',
    camera: { center: BAARAH_CENTROID, zoom: 12.8 },
    selectedIslandId: 'island:640',
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['baarah'],
    mapData: BAARAH_ONLY
  },
  {
    id: 'ferry-baarah-vashafaru',
    eyebrow: '02 / Baarah → Vashafaru',
    title: 'The first crossing takes twenty minutes.',
    speakerCues: [
      direction('[SCREEN: Follow the ferry.]'),
      speech('The retained timetable leaves Baarah at 7:35 and reaches Vashafaru at 7:55.'),
      speech('That is twenty minutes of travel, with more connections ahead.')
    ],
    note: 'Twenty timetable minutes; the plotted sea path is schematic.',
    showOutboundDemand: true,
    timing: { patient: { seconds: 20 * 60, basis: 'timetable', label: 'Baarah → Vashafaru · 20 min' } },
    facts: [
      { label: 'RTL route', value: 'S1C5' },
      { label: 'Crossing', value: '07:35–07:55 · 20 min' },
      { label: 'Next connection', value: 'Continue to Dhihdhoo' }
    ],
    source: 'Retained RTL ferry snapshot · effective October 2026',
    camera: { center: VASHAFARU_CENTROID, zoom: 12.8 },
    journey: {
      featureId: 'baarah-vashafaru',
      vehicle: 'ferry',
      start: { center: BAARAH, zoom: 12.8 },
      end: { center: VASHAFARU, zoom: 12.8 },
      overview: { center: VASHAFARU_CENTROID, zoom: 12.8 },
      arrivalIslandId: 'island:611',
      keepZoom: true,
      duration: 1900,
      startDuration: 650,
      overviewDuration: 850
    },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['baarah-vashafaru', 'baarah', 'vashafaru'],
    mapData: FERRY_BAARAH_VASHAFARU
  },
  {
    id: 'ferry-vashafaru-dhihdhoo',
    eyebrow: '03 / Vashafaru → Dhihdhoo',
    title: 'Fifteen more minutes brings the next handoff.',
    speakerCues: [
      direction('[SCREEN: Continue to Dhihdhoo.]'),
      speech('The same route reaches Dhihdhoo at 8:10.'),
      speech('The crossing is short. The next connection is where time builds up.')
    ],
    note: 'Fifteen more timetable minutes; explanations pause the clock.',
    showOutboundDemand: true,
    timing: { patient: { seconds: 15 * 60, basis: 'timetable', label: 'Vashafaru → Dhihdhoo · 15 min' } },
    facts: [
      { label: 'RTL route', value: 'S1C5' },
      { label: 'Crossing', value: '07:55–08:10 · 15 min' },
      { label: 'Travel so far', value: '35 min' }
    ],
    source: 'Retained RTL ferry snapshot · effective October 2026',
    camera: { center: DHIHDDHOO_CENTROID, zoom: 12.8 },
    journey: {
      featureId: 'vashafaru-dhihdhoo',
      vehicle: 'ferry',
      start: { center: VASHAFARU, zoom: 12.8 },
      end: { center: DHIHDDHOO, zoom: 12.8 },
      overview: { center: DHIHDDHOO_CENTROID, zoom: 12.8 },
      arrivalIslandId: 'island:625',
      keepZoom: true,
      duration: 1900,
      startDuration: 700,
      overviewDuration: 850
    },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['vashafaru-dhihdhoo', 'vashafaru', 'dhihdhoo'],
    mapData: FERRY_TO_DHIHDDHOO
  },
  {
    id: 'wait-dhihdhoo',
    evidenceIslandId: 'island:625',
    eyebrow: '04 / Waiting at Dhihdhoo',
    title: 'The boat stops. The journey clock keeps going.',
    speakerCues: [
      direction('[SCREEN: Hold at Dhihdhoo while the clock advances.]'),
      speech('Arrival is at 8:10. The onward ferry leaves at eleven.'),
      speech('That connection adds two hours and fifty minutes without moving towards the airport.')
    ],
    note: 'The retained times imply this wait if both services connect that day.',
    timing: {
      patient: { seconds: 170 * 60, basis: 'timetable', label: 'Dhihdhoo connection wait · 2 h 50 min' },
      playbackDuration: 3500
    },
    facts: [
      { label: 'Arrive', value: '08:10' },
      { label: 'Depart', value: '11:00 · S1C6' },
      { label: 'Connection wait', value: '2 h 50 min', tone: 'critical' }
    ],
    source: 'Gap calculated from retained RTL ferry times',
    camera: { center: DHIHDDHOO_CENTROID, zoom: 12.8 },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['dhihdhoo'],
    mapData: DHIHDDHOO_WAIT
  },
  {
    id: 'ferry-dhihdhoo-hanimaadhoo',
    eyebrow: '05 / Dhihdhoo → Hanimaadhoo',
    title: 'The next ferry reaches the airport island.',
    speakerCues: [
      direction('[SCREEN: Follow the onward ferry.]'),
      speech('At eleven, the next ferry leaves for Hanimaadhoo.'),
      speech('It arrives at the harbour at 11:25. The airport transfer still lies ahead.')
    ],
    note: 'Harbour arrival still leaves the airport transfer ahead.',
    showOutboundDemand: true,
    timing: { patient: { seconds: 25 * 60, basis: 'timetable', label: 'Dhihdhoo → Hanimaadhoo · 25 min' } },
    facts: [
      { label: 'RTL route', value: 'S1C6' },
      { label: 'Crossing', value: '11:00–11:25 · 25 min' },
      { label: 'Baarah to Hulhumalé so far', value: '3 h 50 min' }
    ],
    source: 'Retained RTL ferry snapshot · effective October 2026',
    camera: { center: HANIMAADHOO_CENTROID, zoom: 12.4 },
    journey: {
      featureId: 'dhihdhoo-hanimaadhoo',
      vehicle: 'ferry',
      start: { center: DHIHDDHOO, zoom: 12.4 },
      end: { center: HANIMAADHOO, zoom: 12.4 },
      overview: { center: HANIMAADHOO_CENTROID, zoom: 12.4 },
      arrivalIslandId: 'island:684',
      keepZoom: true,
      duration: 2200,
      startDuration: 700,
      overviewDuration: 950
    },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['dhihdhoo-hanimaadhoo', 'dhihdhoo', 'hanimaadhoo'],
    mapData: FERRY_TO_HANIMAADHOO
  },
  {
    id: 'airport-connection',
    evidenceIslandId: 'island:684',
    eyebrow: '06 / Harbour → Hanimaadhoo Airport',
    title: 'A transfer and check-in allowance comes next.',
    speakerCues: [
      direction('[SCREEN: Locate the harbour and airport. Hold the map.]'),
      speech('We allow ninety minutes for getting from the harbour through airport check-in.'),
      speech('That is a planning assumption. The actual flight departure wait is missing from the data.')
    ],
    note: 'This transfer and check-in allowance is an estimate, not a confirmed flight connection.',
    timing: {
      patient: { seconds: 90 * 60, basis: 'estimate', label: 'Harbour transfer + check-in allowance · 90 min' },
      playbackDuration: 3500
    },
    facts: [
      { label: 'Allowance', value: '90 min · estimate' },
      { label: 'Includes', value: 'Harbour transfer + check-in' },
      { label: 'Actual flight wait', value: 'Not recorded', tone: 'critical' }
    ],
    source: 'Retained planning assumption · flight timetable unavailable',
    camera: { center: HANIMAADHOO_CENTROID, zoom: 12.4 },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['hanimaadhoo', 'hanimaadhoo-airport'],
    mapData: HANIMAADHOO_CONNECTION
  },
  {
    id: 'flight-to-hulhule',
    evidenceIslandId: 'island:1442',
    eyebrow: '07 / Hanimaadhoo → Velana',
    title: 'The flight reaches a different airport, not the destination.',
    speakerCues: [
      direction('[SCREEN: Follow the aircraft to Velana.]'),
      speech('Then comes the flight to Velana.'),
      speech('We show a forty-five-minute flight estimate. The departure wait remains unknown.'),
      speech('The clock for arriving from Baarah to Hulhumalé is a subtotal, not a confirmed arrival time.')
    ],
    note: 'Flight time is estimated, the air path is schematic, and the actual departure wait is unknown.',
    timing: {
      patient: { seconds: 45 * 60, basis: 'estimate', label: 'Hanimaadhoo → Velana flight · 45 min estimate' },
      unconfirmed: { patient: 'Flight departure wait unknown.' }
    },
    facts: [
      { label: 'Flight', value: 'VRMH → VRMM' },
      { label: 'Travel estimate', value: '45 min · wait unknown' },
      { label: 'Baarah to Hulhumalé subtotal', value: '6 h 05 min + unknown wait', tone: 'critical' }
    ],
    source: 'Airport records · retained flight-time assumption · no flight timetable',
    camera: { center: HULHULE_AIRPORT, zoom: 12.2 },
    journey: {
      featureId: 'hanimaadhoo-hulhule',
      vehicle: 'aircraft',
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
    uiTargets: [],
    mapHighlightIds: ['hanimaadhoo-hulhule', 'hanimaadhoo-airport', 'hulhule-airport'],
    mapData: AIRPORT_LEG
  },
  {
    id: 'staff-walk-to-stop',
    evidenceIslandId: 'island:1442',
    eyebrow: '08 / A separate pickup example · Hulhumalé',
    title: 'Someone must get to the airport to meet her.',
    speakerCues: [
      direction('[SCREEN: Start the separate airport pickup clock in Hulhumalé.]'),
      speech('Now follow the person making the airport pickup.'),
      speech('This retained example starts in Hulhumalé with a thirteen-minute walk to the R9 stop.'),
      speech('It has its own clock. It is not a confirmed connection to that flight.')
    ],
    note: 'A separate Saturday 10 October 2026 pickup example, not synchronized with the flight.',
    timing: {
      staff: {
        seconds: retainedStaffPickup.initial_walk.duration_minutes * 60,
        basis: 'estimate',
        label: 'Walk to Hiya Flats Stop 2 · about 13 min estimate'
      }
    },
    facts: [
      { label: 'Independent example', value: 'Hulhumalé · 15:20 start' },
      { label: 'Walk to stop', value: 'About 13 min · estimate' },
      { label: 'Boarding point', value: 'Hiya Flats Stop 2' }
    ],
    source: 'Retained airport-pickup routing example · 10 October 2026',
    camera: { center: STAFF_BUS_STOP, zoom: 14.2 },
    journey: {
      featureId: 'staff-origin-bus-stop',
      vehicle: 'walk',
      start: { center: STAFF_ORIGIN, zoom: 14.2 },
      end: { center: STAFF_BUS_STOP, zoom: 14.2 },
      overview: { center: STAFF_BUS_STOP, zoom: 14.2 },
      keepZoom: true,
      duration: 5000,
      startDuration: 650,
      overviewDuration: 650
    },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['staff-origin-bus-stop', 'staff-origin', 'staff-bus-stop'],
    mapData: STAFF_WALK_MAP
  },
  {
    id: 'staff-wait-for-bus',
    evidenceIslandId: 'island:1442',
    eyebrow: '09 / Waiting for R9',
    title: 'The bus wait is longer than the walk and ride together.',
    speakerCues: [
      direction('[SCREEN: Keep the pickup marker at the bus stop.]'),
      speech('In this example, the R9 departure is at 16:05.'),
      speech('The wait at the stop is almost thirty-two minutes. The marker stays still while the clock advances.')
    ],
    note: 'This wait belongs to the retained example; it is not a typical wait claim.',
    timing: {
      staff: {
        seconds: retainedStaffPickup.bus_wait.duration_minutes * 60,
        basis: 'estimate',
        label: 'Example R9 wait · about 32 min'
      },
      playbackDuration: 3500
    },
    facts: [
      { label: 'Bus route', value: 'R9 · airport direction' },
      { label: 'Retained departure', value: '16:05' },
      { label: 'Example wait', value: 'About 32 min', tone: 'critical' }
    ],
    source: 'Retained routing example · derived wait for 10 October 2026',
    camera: { center: STAFF_BUS_STOP, zoom: 14.2 },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['staff-bus-stop'],
    mapData: STAFF_WAIT_MAP
  },
  {
    id: 'staff-bus-to-airport',
    evidenceIslandId: 'island:1442',
    eyebrow: '10 / R9 → Velana Domestic Terminal',
    title: 'The bus ride itself is only six minutes.',
    speakerCues: [
      direction('[SCREEN: Follow R9 along the retained road path.]'),
      speech('The retained R9 trip runs from 16:05 to 16:11.'),
      speech('Six minutes on the bus follows much longer time spent reaching and waiting at the stop.')
    ],
    note: 'Retained R9 stop times; the airport-side display corridor is schematic.',
    timing: {
      staff: {
        seconds: retainedStaffPickup.bus_ride.duration_minutes * 60,
        basis: 'timetable',
        label: 'R9 to VIA Domestic Terminal · 6 min'
      }
    },
    facts: [
      { label: 'Bus route', value: 'R9' },
      { label: 'Ride', value: '16:05–16:11 · 6 min' },
      { label: 'Alight', value: 'VIA Domestic Terminal' }
    ],
    source: 'Retained R9 timetable and routing example · 10 October 2026',
    camera: { center: STAFF_AIRPORT_STOP, zoom: 14 },
    journey: {
      featureId: 'staff-r9-airport',
      vehicle: 'bus',
      start: { center: STAFF_BUS_STOP, zoom: 14.2 },
      end: { center: STAFF_AIRPORT_STOP, zoom: 14.2 },
      overview: { center: STAFF_AIRPORT_STOP, zoom: 14.2 },
      travelZoom: 13.3,
      duration: 5000,
      startDuration: 650,
      overviewDuration: 650
    },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['staff-r9-airport', 'staff-bus-stop', 'staff-airport-stop'],
    mapData: STAFF_BUS_MAP
  },
  {
    id: 'staff-walk-to-terminal',
    evidenceIslandId: 'island:1442',
    eyebrow: '11 / Airport stop → pickup point',
    title: 'A short walk completes the airport pickup.',
    speakerCues: [
      direction('[SCREEN: Show the final approach to the pickup point.]'),
      speech('The retained route estimates about twenty-four seconds for the final approach.'),
      speech('That completes a fifty-one-minute pickup example, with the meeting point still unconfirmed.')
    ],
    note: 'Final approach estimated; the meeting point and flight connection are unconfirmed.',
    timing: {
      staff: {
        seconds: retainedStaffPickup.terminal_walk.duration_minutes * 60,
        basis: 'estimate',
        label: 'Final approach · about 24 s estimate'
      }
    },
    facts: [
      { label: 'Final approach', value: 'About 24 s · estimate' },
      { label: 'Pickup subtotal', value: 'About 51 min' },
      { label: 'Flight connection', value: 'Independent example' }
    ],
    source: 'Retained airport-pickup routing example · 10 October 2026',
    camera: { center: STAFF_TERMINAL, zoom: 16 },
    journey: {
      featureId: 'staff-airport-terminal-walk',
      vehicle: 'walk',
      start: { center: STAFF_AIRPORT_STOP, zoom: 15.5 },
      end: { center: STAFF_TERMINAL, zoom: 16 },
      overview: { center: STAFF_TERMINAL, zoom: 15.5 },
      keepZoom: true,
      duration: 1800,
      startDuration: 450,
      overviewDuration: 650
    },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['staff-airport-terminal-walk', 'staff-airport-stop', 'staff-airport-terminal'],
    mapData: STAFF_TERMINAL_MAP
  },
  {
    id: 'road-to-care',
    evidenceIslandId: 'island:1442',
    eyebrow: '12 / Velana → Tree Top Hospital',
    title: 'The road journey is the final transport leg.',
    speakerCues: [
      direction('[SCREEN: Follow the road route to Tree Top Hospital.]'),
      speech('From the airport, the retained road route to Tree Top is another thirteen-minute estimate.'),
      speech('Ferries, connection waits, a flight, a pickup and the final road leg all matter to access.'),
      speech('Arriving from Baarah to Hulhumalé and the independent airport pickup example keep separate clocks.')
    ],
    note: 'Time spent meeting the patient and transferring at the airport is unconfirmed.',
    timing: {
      patient: {
        seconds: generatedAirportHospitalRoute.duration_s,
        basis: 'estimate',
        label: 'Airport → Tree Top road route · 13 min estimate'
      },
      staff: {
        seconds: generatedAirportHospitalRoute.duration_s,
        basis: 'estimate',
        label: 'Airport → Tree Top road route · 13 min estimate'
      },
      unconfirmed: {
        patient: 'Pickup waiting/handoff unknown.',
        staff: 'Pickup handoff/reposition unknown.'
      }
    },
    facts: [
      { label: 'Road route', value: '6.57 km · estimate' },
      { label: 'Drive estimate', value: '13 min' },
      { label: 'Pickup + road subtotal', value: 'About 64 min + handoff', tone: 'muted' }
    ],
    source: 'Retained OpenStreetMap/OSRM route · generated 20 October 2026',
    camera: { center: HULHUMALE_CENTROID, zoom: 13.8 },
    journey: {
      featureId: 'hulhule-tree-top-road',
      vehicle: 'car',
      start: { center: HULHULE_AIRPORT, zoom: 13.8 },
      end: { center: TREE_TOP_HOSPITAL, zoom: 14.5 },
      overview: { center: TREE_TOP_HOSPITAL, zoom: 14.5 },
      travelZoom: 14.2,
      duration: 2800,
      startDuration: 800,
      overviewDuration: 1000
    },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: ['hulhule-tree-top-road', 'hulhule-airport', 'tree-top-hospital'],
    mapData: CARE_LAST_MILE
  },
  {
    id: 'close',
    evidenceIslandId: 'island:1442',
    eyebrow: '13 / The whole connection chain',
    title: 'Access depends on every connection working.',
    speakerCues: [
      direction('[SCREEN: Hold the journey subtotals.]'),
      speech('It is my mother’s story. The transport problem is the chain of connections.'),
      speech('The crossing, the wait, the airport transfer, and the pickup are all parts of that chain.'),
      speech('Showing the gaps in the evidence is part of showing the journey honestly.'),
      direction('[LONG PAUSE]')
    ],
    note: 'Illustrative subtotals; flight and pickup waits remain unconfirmed.',
    facts: [
      { label: 'Baarah to Hulhumalé + road', value: '6 h 18 min + unknown waits' },
      { label: 'Airport pickup + road', value: 'About 64 min + handoff' },
      { label: 'Planning question', value: 'Which connection can improve?' }
    ],
    source: 'Retained transport evidence · illustrative planning assumptions',
    camera: { center: [73.35, 5.45], zoom: 5.7 },
    selectedIslandId: null,
    panel: null,
    uiTargets: [],
    mapHighlightIds: [],
    mapData: EMPTY_PRESENTATION_MAP
  }
];

export const EMPTY_PRESENTATION_MAP_DATA: PresentationMapData = EMPTY_PRESENTATION_MAP;

export function presentationEvidenceIslandId(step: PresentationStep): string | null {
  return step.evidenceIslandId ?? step.selectedIslandId ?? step.journey?.arrivalIslandId ?? null;
}
