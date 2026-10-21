export const ISLAND_DEMAND_CATEGORIES = ['all', 'health', 'education', 'transport'] as const;

export type IslandDemandCategory = (typeof ISLAND_DEMAND_CATEGORIES)[number];
export type ServiceDemandCategory = Exclude<IslandDemandCategory, 'all'>;
export type ServiceDemandStatus = 'numeric' | 'partial' | 'unavailable';
export type IslandServiceChange = 'unchanged' | 'added' | 'upgraded' | 'downgraded' | 'moved' | 'deleted';

export type IslandServiceSubtypeOption = {
  targetSubtype: string;
  label: string;
};

export type IslandServiceEligibility = {
  canUpgrade: boolean;
  upgrades: IslandServiceSubtypeOption[];
  canDowngrade: boolean;
  downgrades: IslandServiceSubtypeOption[];
  canMove: boolean;
  canDelete: boolean;
};

export type IslandServiceDemand = {
  value: number | null;
  local: number | null;
  inbound: number | null;
  connected: number | null;
  transfer: number | null;
  careTransfer: number | null;
  educationTransfer: number | null;
  total: number | null;
  loadRatio: number | null;
  score: number | null;
  status: ServiceDemandStatus;
  source: 'population-allocation' | 'transport-stop' | 'unavailable';
  byNeed: Record<string, number>;
};

export type IslandMapService = {
  id: string;
  serviceType: ServiceDemandCategory;
  subtype: string;
  name: string | null;
  coordinates: [number, number] | null;
  change?: IslandServiceChange;
  eligibility?: IslandServiceEligibility;
  demand: {
    health: IslandServiceDemand;
    education: IslandServiceDemand;
    transport: IslandServiceDemand;
  };
};

export type IslandServiceHexes = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: { type: 'Polygon'; coordinates: [number, number][][] };
    properties: {
      healthWeight: number;
      educationWeight: number;
      transportWeight: number;
      allWeight: number;
      healthStatus: ServiceDemandStatus;
      educationStatus: ServiceDemandStatus;
      transportStatus: ServiceDemandStatus;
      allStatus: ServiceDemandStatus;
      revealPhase?: number;
    };
  }>;
};

export type IslandServicesResponse = {
  status: ServiceDemandStatus | 'draft';
  baselineVersion?: string;
  island: {
    id: string;
    name: string;
    atollName: string;
    centroid: [number, number];
  };
  services: IslandMapService[];
  hexes: IslandServiceHexes;
  summary: {
    serviceCount: number;
    mappedCoordinateCount: number;
    hexFeatureCount: number;
    numericDemandCount: number;
    unavailableDemandCount: number;
    residentialBuildingCount: number;
  };
  limitations: string[];
};
