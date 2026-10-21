import type { VehicleCount } from '../../db/models';
import type {
  SustainabilityFactorKey,
  SustainabilityPollutionFactor,
  SustainabilityScoreDto,
  SustainabilityScoreResult,
  VehicleCategoryBreakdown
} from './types';

import { scoringConfig } from './config';

export type SustainabilityTransportDemand = {
  land: number | null;
  marine: number | null;
  air: number | null;
};

export type SustainabilityScoreInput = {
  totalPopulation: number | null;
  vehicleCounts: VehicleCount[];
  transportDemand: SustainabilityTransportDemand;
  airLinkExists: boolean;
};

const sustainabilityConfig = scoringConfig.sustainability;

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function configuredCategoryFactor(category: string): { factor: number; known: boolean } {
  const configured =
    sustainabilityConfig.vehicleCategoryPollutionFactors[
      category as keyof typeof sustainabilityConfig.vehicleCategoryPollutionFactors
    ];
  if (typeof configured === 'number') return { factor: configured, known: true };
  return { factor: sustainabilityConfig.vehicleCategoryPollutionFactors.other, known: false };
}

function vehicleRowsByCategory(vehicleCounts: VehicleCount[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of vehicleCounts) {
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.total);
  }
  return totals;
}

function breakdownFor(
  categoryTotals: Map<string, number>,
  vehicleTotal: number,
  privateModeFactor: number
): { breakdown: VehicleCategoryBreakdown[]; privatePollution: number; limitations: string[] } {
  const detailedCategories = [...categoryTotals.entries()].filter(([category]) => category !== 'total');
  const rows: Array<[string, number]> =
    detailedCategories.length > 0 ? detailedCategories : categoryTotals.has('total') ? [['total', vehicleTotal]] : [];
  const limitations: string[] = [];
  if (detailedCategories.length === 0 && categoryTotals.has('total')) {
    limitations.push('Only an aggregate vehicle total is available; the configured total-category factor is used.');
  }
  const breakdown = rows
    .map(([category, total]) => {
      const { factor, known } = configuredCategoryFactor(category);
      if (!known) limitations.push(`Vehicle category ${category} uses the configured other-category pollution factor.`);
      return {
        category,
        total,
        sharePercent: vehicleTotal > 0 ? round((total / vehicleTotal) * 100) : 0,
        pollutionFactor: factor,
        pollutionContribution: round(total * factor * privateModeFactor)
      };
    })
    .sort((left, right) => right.total - left.total || left.category.localeCompare(right.category));

  return {
    breakdown,
    privatePollution: round(breakdown.reduce((sum, row) => sum + row.pollutionContribution, 0)),
    limitations
  };
}

function factor(
  key: SustainabilityFactorKey,
  mode: SustainabilityPollutionFactor['mode'],
  pollutionFactor: number,
  demand: number | null,
  relianceMultiplier: number | null,
  pollution: number | null,
  grossPollution: number | null,
  avoidedPrivatePollution: number | null,
  demandSource: SustainabilityPollutionFactor['demandSource']
): SustainabilityPollutionFactor {
  return {
    key,
    mode,
    pollutionFactor,
    demand,
    relianceMultiplier,
    pollution,
    grossPollution,
    avoidedPrivatePollution,
    contributionPercent: null,
    demandSource
  };
}

function withContributionShares(
  factors: Record<SustainabilityFactorKey, SustainabilityPollutionFactor>,
  contributionDenominator: number
): Record<SustainabilityFactorKey, SustainabilityPollutionFactor> {
  return Object.fromEntries(
    Object.entries(factors).map(([key, value]) => [
      key,
      {
        ...value,
        contributionPercent: value.pollution === null ? null : round((value.pollution / contributionDenominator) * 100)
      }
    ])
  ) as Record<SustainabilityFactorKey, SustainabilityPollutionFactor>;
}

function nonNegative(value: number | null): number {
  return value === null ? 0 : Math.max(0, value);
}

function equivalentGroundDemand(
  demand: number | null,
  totalGroundDemand: number,
  totalPopulation: number | null,
  publicTransportReliance: number | null
): number | null {
  if (demand === null) return null;
  if (totalPopulation === null || totalPopulation <= 0 || publicTransportReliance === null) return null;
  if (totalGroundDemand <= 0) return 0;

  const coverage = clamp(totalGroundDemand / totalPopulation);
  return round(totalPopulation * coverage * publicTransportReliance * (nonNegative(demand) / totalGroundDemand));
}

function equivalentAirDemand(demand: number | null, totalPopulation: number | null): number | null {
  if (demand === null) return null;
  if (totalPopulation === null || totalPopulation <= 0) return null;
  return round(totalPopulation * clamp(nonNegative(demand) / totalPopulation));
}

function publicModePollution(
  equivalentDemand: number | null,
  pollutionFactor: number,
  privateModeFactor: number
): { gross: number | null; avoided: number | null; net: number | null } {
  if (equivalentDemand === null) return { gross: null, avoided: null, net: null };

  const gross = round(equivalentDemand * pollutionFactor);
  const avoided = round(equivalentDemand * privateModeFactor);
  return { gross, avoided, net: round(gross - avoided) };
}

export function calculateSustainabilityScore(input: SustainabilityScoreInput): SustainabilityScoreResult {
  const totalPopulation = finite(input.totalPopulation);
  const rows = input.vehicleCounts;
  const categoryTotals = vehicleRowsByCategory(rows);
  const aggregateTotal = categoryTotals.get('total');
  const detailedTotal = [...categoryTotals.entries()]
    .filter(([category]) => category !== 'total')
    .reduce((sum, [, total]) => sum + total, 0);
  const vehicleTotal = rows.length === 0 ? null : aggregateTotal !== undefined ? aggregateTotal : detailedTotal;
  const vehiclesPerThousandPopulation =
    vehicleTotal !== null && totalPopulation !== null && totalPopulation > 0
      ? round((vehicleTotal / totalPopulation) * 1000)
      : null;
  const publicTransportReliance =
    vehiclesPerThousandPopulation === null
      ? null
      : round(
          clamp(
            1 - vehiclesPerThousandPopulation / sustainabilityConfig.publicTransportRelianceReferenceVehiclesPerThousand
          )
        );

  const privateModeFactor = sustainabilityConfig.modePollutionFactors.privateVehicle;
  const categoryResult =
    vehicleTotal === null
      ? { breakdown: [], privatePollution: null, limitations: [] as string[] }
      : breakdownFor(categoryTotals, vehicleTotal, privateModeFactor);

  const landDemand = finite(input.transportDemand.land);
  const marineDemand = finite(input.transportDemand.marine);
  const airDemand = finite(input.transportDemand.air);
  const airDemandValue =
    airDemand !== null
      ? airDemand
      : input.airLinkExists && totalPopulation !== null && totalPopulation > 0
        ? totalPopulation
        : null;
  const airDemandSource: SustainabilityPollutionFactor['demandSource'] =
    airDemand !== null ? 'modeled_transport_demand' : airDemandValue !== null ? 'population_air_proxy' : 'unavailable';
  const groundDemand = nonNegative(landDemand) + nonNegative(marineDemand);
  const publicTransportShiftedDemand =
    totalPopulation !== null && totalPopulation > 0 && publicTransportReliance !== null
      ? round(totalPopulation * clamp(groundDemand / totalPopulation) * publicTransportReliance)
      : null;
  const landEquivalentDemand = equivalentGroundDemand(
    landDemand,
    groundDemand,
    totalPopulation,
    publicTransportReliance
  );
  const marineEquivalentDemand = equivalentGroundDemand(
    marineDemand,
    groundDemand,
    totalPopulation,
    publicTransportReliance
  );
  const airEquivalentDemand = equivalentAirDemand(airDemandValue, totalPopulation);
  const busLand = publicModePollution(
    landEquivalentDemand,
    sustainabilityConfig.modePollutionFactors.busLand,
    privateModeFactor
  );
  const jettyMarine = publicModePollution(
    marineEquivalentDemand,
    sustainabilityConfig.modePollutionFactors.jettyMarine,
    privateModeFactor
  );
  const airPollution = publicModePollution(
    airEquivalentDemand,
    sustainabilityConfig.modePollutionFactors.airportAir,
    privateModeFactor
  );
  const publicTransportBenefit =
    publicTransportShiftedDemand === null
      ? null
      : round(Math.max(0, -(busLand.net ?? 0)) + Math.max(0, -(jettyMarine.net ?? 0)));
  const rawPollutionFactors = {
    privateVehicles: factor(
      'privateVehicles',
      'private',
      privateModeFactor,
      vehicleTotal,
      vehicleTotal === null ? null : 1,
      categoryResult.privatePollution,
      categoryResult.privatePollution,
      null,
      vehicleTotal === null ? 'unavailable' : 'vehicle_counts'
    ),
    busLand: factor(
      'busLand',
      'land',
      sustainabilityConfig.modePollutionFactors.busLand,
      landDemand,
      publicTransportReliance,
      busLand.net,
      busLand.gross,
      busLand.avoided,
      landDemand === null ? 'unavailable' : 'modeled_transport_demand'
    ),
    jettyMarine: factor(
      'jettyMarine',
      'marine',
      sustainabilityConfig.modePollutionFactors.jettyMarine,
      marineDemand,
      publicTransportReliance,
      jettyMarine.net,
      jettyMarine.gross,
      jettyMarine.avoided,
      marineDemand === null ? 'unavailable' : 'modeled_transport_demand'
    ),
    airportAir: factor(
      'airportAir',
      'air',
      sustainabilityConfig.modePollutionFactors.airportAir,
      airDemandValue,
      1,
      airPollution.net,
      airPollution.gross,
      airPollution.avoided,
      airDemandSource
    )
  } satisfies Record<SustainabilityFactorKey, SustainabilityPollutionFactor>;
  const netPollution = Object.values(rawPollutionFactors)
    .map((entry) => entry.pollution)
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const modeledPollution = round(Math.max(0, netPollution));
  const pollutionFactors = withContributionShares(rawPollutionFactors, Math.max(1, Math.abs(netPollution)));
  const pollutionPressure =
    rows.length > 0 && totalPopulation !== null && totalPopulation > 0
      ? round(modeledPollution / totalPopulation)
      : null;
  const sustainabilityScore =
    rows.length === 0 || pollutionPressure === null
      ? null
      : round(clamp(1 - pollutionPressure / sustainabilityConfig.pollutionPressureReference) * 100);
  const limitations = [
    'Vehicle data source: Maldives Bureau of Statistics Statistical Yearbook 2024, Table 11.6 (2018 registration totals); island rows for Addu and Other atolls are planning allocations, not observed island registrations. Resort, industrial, uninhabited, and zero-population island registrations remain unknown.',
    'Vehicle counts are a private-travel proxy; they do not measure trips, distance, occupancy, fuel type, or emissions.',
    'Battery scooters have zero modeled tailpipe pollution in this proxy; electricity and lifecycle emissions are unavailable.',
    'Factor effects are signed relative to the private-travel baseline; negative values indicate a modeled public-transport benefit, not measured emissions.',
    'Public transport reliance is inferred from the raw vehicle rate per 1,000 residents; observed mode split is unavailable.',
    'Bus and ferry demand is capped at one resident-equivalent ground demand per island before the relative mode benefit is calculated, because hub demand is not measured ridership.',
    'Air demand remains a high-impact addition and is capped at one resident-equivalent demand when normalized.',
    ...(rows.length === 0
      ? ['No vehicle-count rows are available; sustainability is unavailable rather than zero.']
      : []),
    ...(totalPopulation === null || totalPopulation <= 0
      ? ['A positive population denominator is required for the sustainability rate and score.']
      : []),
    ...(landDemand === null ? ['Modeled land transport demand is unavailable for the bus/land factor.'] : []),
    ...(marineDemand === null ? ['Modeled marine transport demand is unavailable for the jetty/marine factor.'] : []),
    ...(airDemand === null && input.airLinkExists
      ? ['Airport/air pollution uses population as a documented proxy because modeled air demand is unavailable.']
      : []),
    ...(airDemandValue === null ? ['No modeled airport/air demand or airport/air link is available.'] : []),
    ...categoryResult.limitations
  ];
  const scoreStatus = sustainabilityScore === null ? 'unavailable' : 'partial';

  return {
    baseScore: sustainabilityScore,
    score: sustainabilityScore,
    adjustmentFactor: sustainabilityScore === null ? null : 1,
    status: scoreStatus,
    coverageRatio: sustainabilityScore === null ? 0 : 1,
    denominatorPopulation: totalPopulation,
    numericPopulation: sustainabilityScore === null ? null : totalPopulation,
    evidenceCount: rows.length,
    limitations: [...new Set(limitations)],
    totalPopulation,
    vehicleTotal,
    vehiclesPerThousandPopulation,
    privateVehiclePollution: categoryResult.privatePollution,
    publicTransportReliance,
    publicTransportShiftedDemand,
    publicTransportBenefit,
    pollutionFactors,
    pollutionPressure,
    sustainabilityScore,
    vehicleCategoryBreakdown: categoryResult.breakdown
  };
}

export function sustainabilityDto(result: SustainabilityScoreResult): SustainabilityScoreDto {
  return {
    ...result,
    pollutionFactors: { ...result.pollutionFactors },
    vehicleCategoryBreakdown: result.vehicleCategoryBreakdown.map((entry) => ({ ...entry }))
  };
}
