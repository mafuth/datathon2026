import type { Island, Population, Service, TransportConnection, TransportRoute } from '../../db/models';

export type ScoreStatus = 'numeric' | 'partial' | 'unavailable';

export type TransportStopMode = 'land' | 'marine' | 'air';

export type TransportStop = {
  id: string;
  name: string | null;
  islandId: string;
  subtype: string;
  latitude: number | null;
  longitude: number | null;
  routeIds: string[];
};

export type TransportRouteStop = {
  routeId: string;
  stopId: string;
  islandId: string;
  sequence: number;
};

export type ResidentialDemandPoint = {
  id: string;
  islandId: string;
  coordinates: [number, number];
  weight: number;
};

export type ScoringSnapshot = {
  islands: Island[];
  population: Population[];
  services: Service[];
  connections: TransportConnection[];
  routes: TransportRoute[];
  transportStops: TransportStop[];
  routeStops: TransportRouteStop[];
  /** Spatial heat-map input only. Score calculators intentionally ignore it. */
  residentialDemandPoints?: ResidentialDemandPoint[];
};

export type ScoreComponent = {
  baseScore: number | null;
  score: number | null;
  adjustmentFactor: number | null;
  status: ScoreStatus;
  coverageRatio: number;
  denominatorPopulation: number | null;
  numericPopulation: number | null;
  evidenceCount: number;
  limitations: string[];
};

export type ServiceScore = {
  key: string;
  score: number | null;
  demand: number | null;
  demandSource: 'local' | 'outbound' | 'unserved';
  destinationIslandId: string | null;
  routeType: 'local' | 'land' | 'marine' | 'airport' | 'unavailable';
  status: ScoreStatus;
  limitations: string[];
};

export type DemandMetric = {
  local: number;
  inbound: number;
  outbound: number;
  unserved: number;
  combined: number;
  demandPercent: number | null;
  outboundPercent: number | null;
};

export type InboundDemandSource = {
  originIslandId: string;
  health: number;
  education: number;
  total: number;
};

export type DemandSummary = {
  population: number | null;
  health: DemandMetric;
  education: DemandMetric;
  healthByNeed: Record<string, DemandMetric>;
  educationByNeed: Record<string, DemandMetric>;
  inboundSources: InboundDemandSource[];
};

export type DemandAllocation = {
  originIslandId: string;
  destinationIslandId: string | null;
  category: 'health' | 'education';
  needKey: string;
  demand: number;
  routeType: ServiceScore['routeType'];
  routeFactor: number;
  serviceSubtype: string | null;
};

export type DemandAllocationResult = {
  byIsland: Map<string, DemandSummary>;
  byOriginNeed: Map<string, DemandAllocation>;
  byOriginCohort: Map<string, DemandAllocation>;
};

export type AirportAccess = {
  available: boolean;
  source: 'own_airport' | 'land_connection' | 'unavailable';
  airportIslandId: string | null;
};

export type CrowdednessResult = {
  score: number | null;
  populationDensity: number | null;
  population: number | null;
  landAreaKm2: number | null;
  areaSource: 'database' | 'unavailable';
  pressure: number | null;
  healthFactor: number | null;
  educationFactor: number | null;
  status: ScoreStatus;
};

export type ExternalDemandResult = {
  inboundHealthDemand: number | null;
  inboundEducationDemand: number | null;
  localHealthDemand: number | null;
  localEducationDemand: number | null;
  outboundHealthDemand: number | null;
  outboundEducationDemand: number | null;
  healthPressure: number | null;
  educationPressure: number | null;
  inboundHealthPressure: number | null;
  inboundEducationPressure: number | null;
  healthFactor: number | null;
  educationFactor: number | null;
  status: ScoreStatus;
  limitations: string[];
};

export type HubDemandImpact = {
  hubId: string;
  hubType: 'airport' | 'ferry_terminal' | 'land_gateway' | 'transfer';
  localDemand: number | null;
  incomingDemand: number | null;
  outboundDemand: number | null;
  transferDemand: number | null;
  totalDemand: number | null;
  capacity: number | null;
  pressure: number | null;
  factor: number | null;
  scoreImpact: number | null;
  status: ScoreStatus;
  limitation: string | null;
};

export type TransportDemandStop = {
  stopId: string;
  stopName: string | null;
  islandId: string;
  subtype: string;
  mode: TransportStopMode;
  routeIds: string[];
  connectedIslandIds: string[];
  localDemand: number;
  connectedDemand: number;
  workingDemand: number;
  studentDemand: number;
  elderlyDemand: number;
  careTransferDemand: number;
  totalDemand: number;
  capacity: number;
  loadRatio: number;
  score: number;
  status: ScoreStatus;
  limitation: string | null;
};

export type TransportDemandModeSummary = {
  stopCount: number;
  totalDemand: number;
  careTransferDemand: number;
  averageLoad: number | null;
  score: number | null;
};

export type TransportDemandResult = {
  workingDemand: number;
  studentDemand: number;
  elderlyDemand: number;
  careTransferDemand: number;
  totalDemand: number;
  averageLoad: number | null;
  score: number | null;
  modes: {
    land: TransportDemandModeSummary;
    marine: TransportDemandModeSummary;
    air: TransportDemandModeSummary;
  };
  stops: TransportDemandStop[];
  hubImpacts: HubDemandImpact[];
};

export type IslandScoreResult = {
  islandId: string;
  islandName: string;
  overall: ScoreComponent;
  health: ScoreComponent & { breakdown: ServiceScore[]; adjustedScore: number | null };
  education: ScoreComponent & { breakdown: ServiceScore[]; adjustedScore: number | null };
  transport: ScoreComponent & {
    land: ScoreComponent;
    marine: ScoreComponent;
    air: ScoreComponent;
    hubImpacts: HubDemandImpact[];
    demand: TransportDemandResult;
  };
  crowdedness: CrowdednessResult;
  demand: DemandSummary;
  externalDemand: ExternalDemandResult;
  airportAccess: AirportAccess;
  limitations: string[];
  assumptions: string[];
  evidence: {
    populationRows: number;
    healthServices: number;
    educationServices: number;
    transportServices: number;
    transportConnections: number;
  };
};

export type NationalScoreResult = {
  score: number | null;
  status: ScoreStatus;
  health: ScoreComponent;
  education: ScoreComponent;
  transport: ScoreComponent & {
    land: ScoreComponent;
    marine: ScoreComponent;
    air: ScoreComponent;
  };
  crowdedness: ScoreComponent;
  demand: DemandSummary;
  externalDemand: ScoreComponent;
  islandCount: number;
  inhabitedIslandCount: number;
  scoredIslandCount: number;
  partialIslandCount: number;
  unavailableIslandCount: number;
  scores: IslandScoreResult[];
  limitations: string[];
};
