import type { Island, Population, Service, TransportConnection, TransportRoute } from '../../db/models';

export type ScoreStatus = 'numeric' | 'partial' | 'unavailable';

export type ScoringSnapshot = {
  islands: Island[];
  population: Population[];
  services: Service[];
  connections: TransportConnection[];
  routes: TransportRoute[];
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
  destinationIslandId: string | null;
  routeType: 'local' | 'land' | 'marine' | 'airport' | 'unavailable';
  status: ScoreStatus;
  limitations: string[];
};

export type AirportAccess = {
  available: boolean;
  source: 'own_airport' | 'direct_land_connection' | 'unavailable';
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
  healthPressure: number | null;
  educationPressure: number | null;
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
  transferDemand: number | null;
  totalDemand: number | null;
  capacity: number | null;
  pressure: number | null;
  factor: number | null;
  scoreImpact: number | null;
  status: ScoreStatus;
  limitation: string | null;
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
  };
  crowdedness: CrowdednessResult;
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
  externalDemand: ScoreComponent;
  islandCount: number;
  inhabitedIslandCount: number;
  scoredIslandCount: number;
  partialIslandCount: number;
  unavailableIslandCount: number;
  scores: IslandScoreResult[];
  limitations: string[];
};
