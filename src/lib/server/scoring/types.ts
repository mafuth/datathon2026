import type {
  Island,
  JobLocation,
  Population,
  Service,
  TransportConnection,
  TransportRoute,
  VehicleCount
} from '../../db/models';

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
  vehicleCounts: VehicleCount[];
  services: Service[];
  jobLocations?: JobLocation[];
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

export type SustainabilityFactorKey = 'privateVehicles' | 'busLand' | 'jettyMarine' | 'airportAir';

export type SustainabilityPollutionFactor = {
  key: SustainabilityFactorKey;
  mode: 'private' | 'land' | 'marine' | 'air';
  pollutionFactor: number;
  demand: number | null;
  relianceMultiplier: number | null;
  pollution: number | null;
  grossPollution: number | null;
  avoidedPrivatePollution: number | null;
  contributionPercent: number | null;
  demandSource: 'vehicle_counts' | 'modeled_transport_demand' | 'population_air_proxy' | 'unavailable';
};

export type VehicleCategoryBreakdown = {
  category: string;
  total: number;
  sharePercent: number;
  pollutionFactor: number;
  pollutionContribution: number;
};

export type SustainabilityScoreResult = ScoreComponent & {
  totalPopulation: number | null;
  vehicleTotal: number | null;
  vehiclesPerThousandPopulation: number | null;
  privateVehiclePollution: number | null;
  publicTransportReliance: number | null;
  publicTransportShiftedDemand: number | null;
  publicTransportBenefit: number | null;
  pollutionFactors: Record<SustainabilityFactorKey, SustainabilityPollutionFactor>;
  pollutionPressure: number | null;
  sustainabilityScore: number | null;
  vehicleCategoryBreakdown: VehicleCategoryBreakdown[];
};

export type SustainabilityScoreDto = SustainabilityScoreResult;

export type EmploymentCategory = {
  key: string;
  label: string;
  count: number;
  subcategories: EmploymentSubcategory[];
};

export type EmploymentSubcategory = {
  key: string;
  label: string;
  count: number;
};

export type EmploymentScoreResult = ScoreComponent & {
  foreignPopulation: number;
  foreignPopulationSource: 'observed' | 'assumed_zero';
  workingAgePopulation: number | null;
  jobLocationCount: number;
  foreignPerWorkingAge: number | null;
  foreignPerJobLocation: number | null;
  jobLocationsPerThousandWorkingAge: number | null;
  pressureScore: number | null;
  supplyScore: number | null;
  categories: EmploymentCategory[];
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
  distanceM?: number | null;
  hopCount?: number;
  pathIslandIds?: string[];
  pathConnectionIds?: string[];
  knownConnectivity?: boolean;
};

export type DemandAllocationResult = {
  byIsland: Map<string, DemandSummary>;
  byOriginNeed: Map<string, DemandAllocation>;
  byOriginCohort: Map<string, DemandAllocation>;
  hospitalOverlays: DemandAllocation[];
  educationOverlays: DemandAllocation[];
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
  careTransferDemand: number | null;
  educationTransferDemand: number | null;
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
  educationTransferDemand: number;
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
  educationTransferDemand: number;
  averageLoad: number | null;
  score: number | null;
};

export type TransportDemandResult = {
  workingDemand: number;
  studentDemand: number;
  elderlyDemand: number;
  careTransferDemand: number;
  educationTransferDemand: number;
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
  employment: EmploymentScoreResult;
  sustainability: SustainabilityScoreResult;
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
  employment: EmploymentScoreResult;
  sustainability: SustainabilityScoreResult;
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
