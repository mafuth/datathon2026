import type { SustainabilityScore } from './sustainability-types';

export type IslandProfileScore = {
  score: number | null;
  status: string;
  coverageRatio: number;
  evidenceCount: number;
};

export type IslandPopulationBand = {
  key: string;
  label: string;
  amount: number;
  share: number | null;
  overlapping: boolean;
};

export type IslandServiceItem = {
  key: string;
  label: string;
  count: number;
  names: string[];
};

export type IslandServiceGroup = {
  key: 'health' | 'education' | 'transport';
  label: string;
  total: number;
  items: IslandServiceItem[];
};

export type IslandEmploymentProfile = {
  score: number | null;
  status: string;
  coverageRatio: number;
  evidenceCount: number;
  foreignPopulation: number;
  foreignPopulationSource: 'observed' | 'assumed_zero';
  workingAgePopulation: number | null;
  jobLocationCount: number;
  foreignPerWorkingAge: number | null;
  foreignPerJobLocation: number | null;
  jobLocationsPerThousandWorkingAge: number | null;
  pressureScore: number | null;
  supplyScore: number | null;
  categories: Array<{
    key: string;
    label: string;
    count: number;
    subcategories: Array<{ key: string; label: string; count: number }>;
  }>;
  limitations: string[];
};

export type IslandTransportConnection = {
  id: string;
  type: string;
  routeType: string;
  directionality: string;
  direction: 'incoming' | 'outgoing';
  distanceM: number | null;
  routeName: string | null;
  source: string;
  modeled: boolean;
  neighbor: {
    id: string;
    name: string;
  } | null;
};

export type IslandDemandMetric = {
  local: number;
  inbound: number;
  outbound: number;
  unserved: number;
  combined: number;
  demandPercent: number | null;
  outboundPercent: number | null;
};

export type IslandTransportDemandStop = {
  stopId: string;
  stopName: string | null;
  subtype: string;
  mode: 'land' | 'marine' | 'air';
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
};

export type IslandDemandProfile = {
  health: {
    populationBasis: number | null;
    childPopulation: number | null;
    elderlyPopulation: number | null;
    demand: IslandDemandMetric;
    allAgeDemand: IslandDemandMetric | null;
    youngerCareDemand: IslandDemandMetric | null;
    childCareDemand: IslandDemandMetric | null;
    elderlyCareDemand: IslandDemandMetric | null;
    hospitalDemand: IslandDemandMetric | null;
    inboundDemand: number | null;
    outboundDemand: number | null;
    pressure: number | null;
  };
  education: {
    childPopulation: number | null;
    adolescentPopulation: number | null;
    youthPopulation: number | null;
    demand: IslandDemandMetric;
    inboundDemand: number | null;
    outboundDemand: number | null;
    pressure: number | null;
  };
  transport: {
    residentPopulation: number | null;
    inboundPopulation: number | null;
    outboundPopulation: number | null;
    workingDemand: number;
    studentDemand: number;
    elderlyDemand: number;
    careTransferDemand: number;
    educationTransferDemand: number;
    totalDemand: number;
    averageLoad: number | null;
    score: number | null;
    modes: {
      land: {
        stopCount: number;
        totalDemand: number;
        careTransferDemand: number;
        educationTransferDemand: number;
        averageLoad: number | null;
        score: number | null;
      };
      marine: {
        stopCount: number;
        totalDemand: number;
        careTransferDemand: number;
        educationTransferDemand: number;
        averageLoad: number | null;
        score: number | null;
      };
      air: {
        stopCount: number;
        totalDemand: number;
        careTransferDemand: number;
        educationTransferDemand: number;
        averageLoad: number | null;
        score: number | null;
      };
    };
    stops: IslandTransportDemandStop[];
    hubs: Array<{
      id: string;
      label: string;
      type: string;
      localDemand: number | null;
      incomingDemand: number | null;
      outboundDemand: number | null;
      transferDemand: number | null;
      careTransferDemand: number | null;
      educationTransferDemand: number | null;
      totalDemand: number | null;
      capacity: number | null;
      pressure: number | null;
      status: string;
    }>;
  };
  inboundSources: Array<{
    originIslandId: string;
    originName: string;
    health: number;
    education: number;
    total: number;
  }>;
};

export type IslandProfile = {
  island: {
    id: string;
    name: string;
    atollName: string;
    islandType: string;
    landAreaKm2: number | null;
  };
  population: {
    total: number | null;
    bands: IslandPopulationBand[];
  };
  services: IslandServiceGroup[];
  connections: {
    direct: IslandTransportConnection[];
    byType: Array<{ type: string; count: number }>;
  };
  transportAccess: {
    land: IslandProfileScore;
    marine: IslandProfileScore;
    air: IslandProfileScore;
    airport: {
      available: boolean;
      source: string;
      islandName: string | null;
    };
  };
  employment: IslandEmploymentProfile;
  sustainability: SustainabilityScore;
  demand: IslandDemandProfile;
};
