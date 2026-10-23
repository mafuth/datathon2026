import * as v from 'valibot';

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(160));
const finite = () =>
  v.pipe(
    v.number(),
    v.check((value: number) => Number.isFinite(value))
  );
const common = {
  operationId: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  headwayMinutes: v.pipe(finite(), v.minValue(5), v.maxValue(1440)),
  startHour: v.pipe(finite(), v.integer(), v.minValue(0), v.maxValue(23)),
  endHour: v.pipe(finite(), v.integer(), v.minValue(1), v.maxValue(24)),
  serviceDaysPerWeek: v.pipe(finite(), v.integer(), v.minValue(1), v.maxValue(7)),
  vehicleCount: v.pipe(finite(), v.integer(), v.minValue(1), v.maxValue(100))
};

export const proposalTransportOperationSchemas = [
  v.object({ ...common, kind: v.literal('add_bus_service'), routeId: identifier }),
  v.object({
    ...common,
    kind: v.literal('add_ferry_service'),
    originStopId: v.optional(identifier),
    destinationStopId: v.optional(identifier),
    stopIds: v.optional(v.pipe(v.array(identifier), v.minLength(2), v.maxLength(24))),
    speedKph: v.pipe(finite(), v.minValue(5), v.maxValue(80))
  })
] as const;

export const proposalTransportOperationSchema = v.variant('kind', [...proposalTransportOperationSchemas]);
export type ProposalTransportOperation = v.InferOutput<typeof proposalTransportOperationSchema>;
export type TransportCoordinate = [number, number];
export type ProposalTransportGeometry = { type: 'MultiLineString'; coordinates: TransportCoordinate[][] };

export type ProposalTransportOptions = {
  islandId: string;
  islandName: string;
  busRoutes: Array<{
    id: string;
    name: string;
    distanceKm: number;
    stopCount: number;
    geometry?: ProposalTransportGeometry;
  }>;
  origins: Array<{ id: string; name: string; islandId: string; islandName: string; coordinates: TransportCoordinate }>;
  destinations: Array<{
    id: string;
    name: string;
    islandId: string;
    islandName: string;
    coordinates: TransportCoordinate;
  }>;
  eligibleDestinations: Array<{
    id: string;
    name: string;
    islandId: string;
    islandName: string;
    atollId: string;
    atollName: string | null;
    coordinates: TransportCoordinate;
  }>;
  baselineFerryChains: Array<{
    routeId: string;
    routeName: string;
    stopIds: string[];
    islandIds: string[];
  }>;
  assumptions: string[];
};

export type ProposalTransportPlan = {
  operationId: string;
  mode: 'bus' | 'ferry';
  label: string;
  geometry: ProposalTransportGeometry;
  distanceKm: number;
  speedKph: number;
  headwayMinutes: number;
  startHour: number;
  endHour: number;
  serviceDaysPerWeek: number;
  vehicleCount: number;
  departuresPerDirectionPerDay: number;
  proposedExpectedWaitMinutes: number;
  bidirectional: boolean;
  capital: number;
  annual: number;
  assumptions: string[];
};

export const TRANSPORT_PLANNING_ASSUMPTIONS = [
  'These are proposed services, not a published timetable. Current waiting time and waiting-time savings are unknown.',
  'Proposed expected wait is half the regular headway for uniformly arriving passengers during the operating window only. No service is assumed outside that window or on non-operating days.',
  'More departures do not shorten walking distance to a stop or landing place.',
  'Fleet sizing assumes a return trip and turnaround: 20 km/h and 10 minutes for bus; the selected sailing speed and 20 minutes for ferry.',
  'Retained planning allowances: MVR 3m per bus plus MVR 30 per vehicle-km; MVR 15m per ferry plus MVR 100 per vessel-km. Land and new terminals are excluded.'
];

export function transportDistanceKm(from: TransportCoordinate, to: TransportCoordinate): number {
  const rad = Math.PI / 180;
  const latitudeDelta = (to[1] - from[1]) * rad;
  const longitudeDelta = (to[0] - from[0]) * rad;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(from[1] * rad) * Math.cos(to[1] * rad) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export type ProposalBusRouteSnap = {
  coordinates: TransportCoordinate;
  routeId: string;
  routeName: string;
  distanceMeters: number;
};

export function snapToProposalBusRoute(
  coordinates: TransportCoordinate,
  routes: readonly Pick<ProposalTransportOptions['busRoutes'][number], 'id' | 'name' | 'geometry'>[],
  maxDistanceMeters = 35
): ProposalBusRouteSnap | null {
  if (
    !coordinates.every(Number.isFinite) ||
    Math.abs(coordinates[0]) > 180 ||
    Math.abs(coordinates[1]) > 90 ||
    !Number.isFinite(maxDistanceMeters) ||
    maxDistanceMeters < 0
  )
    return null;
  const longitudeScale = Math.cos((coordinates[1] * Math.PI) / 180);
  const longitudeDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;
  let closest: ProposalBusRouteSnap | null = null;
  for (const route of routes) {
    for (const line of route.geometry?.coordinates ?? []) {
      for (let index = 1; index < line.length; index += 1) {
        const from = line[index - 1];
        const to = line[index];
        if (!from.every(Number.isFinite) || !to.every(Number.isFinite)) continue;
        const startX = longitudeDelta(coordinates[0], from[0]) * longitudeScale;
        const startY = from[1] - coordinates[1];
        const deltaLongitude = longitudeDelta(from[0], to[0]);
        const dx = deltaLongitude * longitudeScale;
        const dy = to[1] - from[1];
        const squareLength = dx * dx + dy * dy;
        const fraction = squareLength === 0 ? 0 : Math.min(1, Math.max(0, -(startX * dx + startY * dy) / squareLength));
        const snapped: TransportCoordinate = [
          ((from[0] + deltaLongitude * fraction + 540) % 360) - 180,
          from[1] + dy * fraction
        ];
        const distanceMeters = transportDistanceKm(coordinates, snapped) * 1000;
        if (distanceMeters <= maxDistanceMeters + 0.000001 && (!closest || distanceMeters < closest.distanceMeters)) {
          closest = { coordinates: snapped, routeId: route.id, routeName: route.name, distanceMeters };
        }
      }
    }
  }
  return closest;
}

export function transportMinimumFleet(
  mode: 'bus' | 'ferry',
  distanceKm: number,
  headwayMinutes: number,
  speedKph = 20
): number {
  if (
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0 ||
    !Number.isFinite(headwayMinutes) ||
    headwayMinutes <= 0 ||
    !Number.isFinite(speedKph) ||
    speedKph <= 0
  )
    return 0;
  return Math.max(
    1,
    Math.ceil(
      (((2 * distanceKm) / (mode === 'bus' ? 20 : speedKph)) * 60 + (mode === 'bus' ? 10 : 20)) / headwayMinutes
    )
  );
}

export function transportDeparturesPerDirection(startHour: number, endHour: number, headwayMinutes: number): number {
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(headwayMinutes) ||
    endHour <= startHour ||
    headwayMinutes <= 0
  )
    return 0;
  return Math.max(0, Math.ceil(((endHour - startHour) * 60) / headwayMinutes));
}
