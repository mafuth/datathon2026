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

export type SustainabilityVehicleCategory = {
  category: string;
  total: number;
  sharePercent: number;
  pollutionFactor: number;
  pollutionContribution: number;
};

export type SustainabilityScore = {
  baseScore: number | null;
  score: number | null;
  adjustmentFactor: number | null;
  status: string;
  coverageRatio: number;
  denominatorPopulation: number | null;
  numericPopulation: number | null;
  evidenceCount: number;
  limitations: string[];
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
  vehicleCategoryBreakdown: SustainabilityVehicleCategory[];
};

export const SUSTAINABILITY_PROVENANCE =
  "Source: Maldives Bureau of Statistics Statistical Yearbook 2024, Table 11.6 (2018 registration totals). Male' and Hulhumale' use published locality counts; Addu and Other atolls are allocated planning estimates, not observed island registrations. Resort, industrial, uninhabited, and zero-population island registrations remain unknown.";

export const SUSTAINABILITY_BATTERY_NOTE =
  'Battery scooters have zero modeled tailpipe pollution in this proxy; electricity and lifecycle emissions are unavailable.';

export const SUSTAINABILITY_FACTORS = [
  {
    key: 'privateVehicles',
    label: 'Private vehicles',
    note: 'Vehicle counts weighted by category',
    color: 'var(--mobility-chart-transport)'
  },
  {
    key: 'busLand',
    label: 'Bus / land',
    note: 'Net bus benefit versus private travel',
    color: 'var(--mobility-chart-education)'
  },
  {
    key: 'jettyMarine',
    label: 'Jetty / marine',
    note: 'Net ferry benefit versus private travel',
    color: 'var(--mobility-accent)'
  },
  {
    key: 'airportAir',
    label: 'Airport / air',
    note: 'High-impact air demand or population proxy',
    color: 'var(--mobility-chart-transfer)'
  }
] as const satisfies ReadonlyArray<{
  key: SustainabilityFactorKey;
  label: string;
  note: string;
  color: string;
}>;

export function vehicleCategoryLabel(category: string): string {
  return category.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
