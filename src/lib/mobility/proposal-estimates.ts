import type { ConnectionNetworkResponse } from './connection-network-contracts';
import type { ScenarioOperation } from './scenario-contracts';
import type { IslandServicesResponse } from '$components/mobility/island-services';

import * as v from 'valibot';

const amount = v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(1e12)));
export const costAssumptionSchema = v.object({ upfront: amount, annual: amount });
export const planningAssumptionsSchema = v.object({
  costs: v.record(v.string(), costAssumptionSchema),
  annualTripsPerUnit: amount,
  returnFare: amount
});
export type CostAssumption = v.InferOutput<typeof costAssumptionSchema>;
export type PlanningAssumptions = v.InferOutput<typeof planningAssumptionsSchema>;
export function emptyPlanningAssumptions(): PlanningAssumptions {
  return { costs: {}, annualTripsPerUnit: null, returnFare: null };
}

export type ResidentTravelAssumptionInputs = {
  islandId: string;
  network: ConnectionNetworkResponse | null;
  eligibleDemandUnits?: number | null;
};

export type ResidentTravelAssumptionResult = {
  annualTripsPerUnit: number;
  returnFare: number;
  modes: Array<'marine' | 'air'>;
  confidence: 'derived' | 'fallback';
};

const FERRY_RETURN_FARE = 90;
const AIR_RETURN_FARE = 2200;

export function deriveResidentTravelAssumptions({
  islandId,
  network,
  eligibleDemandUnits
}: ResidentTravelAssumptionInputs): ResidentTravelAssumptionResult {
  const links =
    network?.connections.filter((link) => link.fromIslandId === islandId || link.toIslandId === islandId) ?? [];
  const modes = [
    ...new Set(
      links
        .filter((link) => link.fromIslandId !== link.toIslandId)
        .map((link) => link.mode)
        .filter((mode): mode is 'marine' | 'air' => mode === 'marine' || mode === 'air')
    )
  ];
  const fareValues = modes.map((mode) => (mode === 'air' ? AIR_RETURN_FARE : FERRY_RETURN_FARE));
  const returnFare = fareValues.length
    ? fareValues.reduce((sum, fare) => sum + fare, 0) / fareValues.length
    : FERRY_RETURN_FARE;
  const annualTripsPerUnit = modes.includes('air') ? 24 : modes.includes('marine') ? 12 : 6;
  return {
    annualTripsPerUnit:
      eligibleDemandUnits && eligibleDemandUnits > 0
        ? Math.max(annualTripsPerUnit, Math.min(24, 6 + eligibleDemandUnits / 100))
        : annualTripsPerUnit,
    returnFare,
    modes,
    confidence: network ? 'derived' : 'fallback'
  };
}
export type CostEstimate = CostAssumption & {
  basis: string;
  confidence: 'default' | 'partial' | 'unknown';
  avoidedAnnual: number | null;
};

const SERVICE_COSTS: Record<string, CostEstimate> = {
  clinic: {
    upfront: 8_000_000,
    annual: 750_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a community clinic; land excluded.',
    confidence: 'default'
  },
  health_center: {
    upfront: 25_000_000,
    annual: 2_000_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a health centre; land excluded.',
    confidence: 'default'
  },
  hospital: {
    upfront: 120_000_000,
    annual: 10_000_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a small Level 1 hospital; land excluded.',
    confidence: 'default'
  },
  preschool: {
    upfront: 12_000_000,
    annual: 1_000_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a preschool; land excluded.',
    confidence: 'default'
  },
  school: {
    upfront: 25_000_000,
    annual: 2_500_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a small school extension; land excluded.',
    confidence: 'default'
  },
  high_school: {
    upfront: 45_000_000,
    annual: 4_000_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a secondary school facility; land excluded.',
    confidence: 'default'
  },
  tertiary: {
    upfront: 60_000_000,
    annual: 6_000_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a tertiary facility; land excluded.',
    confidence: 'default'
  },
  bus_stop: {
    upfront: 250_000,
    annual: 50_000,
    avoidedAnnual: 0,
    basis: 'Shelter, seating, signage, lighting and boarding pad; vehicles excluded.',
    confidence: 'default'
  },
  bus_station: {
    upfront: 8_000_000,
    annual: 500_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a small bus station; land and vehicles excluded.',
    confidence: 'default'
  },
  public_transport: {
    upfront: 1_500_000,
    annual: 250_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a local public-transport facility; vehicles excluded.',
    confidence: 'partial'
  },
  port: {
    upfront: 35_000_000,
    annual: 1_250_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a small port improvement; dredging and land excluded.',
    confidence: 'partial'
  },
  jetty: {
    upfront: 12_000_000,
    annual: 375_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a small jetty improvement; marine works excluded.',
    confidence: 'partial'
  },
  airport: {
    upfront: 250_000_000,
    annual: 12_500_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a regional airport facility; runway and aviation approvals excluded.',
    confidence: 'partial'
  },
  air_terminal: {
    upfront: 40_000_000,
    annual: 2_500_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for an airport terminal; runway and aircraft excluded.',
    confidence: 'partial'
  },
  helipad: {
    upfront: 8_000_000,
    annual: 500_000,
    avoidedAnnual: 0,
    basis: 'Planning allowance for a helipad; aircraft and aviation operations excluded.',
    confidence: 'partial'
  }
};

function cloneCost(cost: CostEstimate): CostEstimate {
  return { ...cost };
}

export function operationAllowance(operation: ScenarioOperation): CostEstimate {
  if (operation.kind === 'add_service')
    return cloneCost(
      SERVICE_COSTS[operation.subtype] ?? {
        upfront: null,
        annual: null,
        avoidedAnnual: 0,
        basis: 'No planning allowance is available for this service.',
        confidence: 'unknown'
      }
    );
  if (operation.kind === 'move_service')
    return {
      upfront: 0,
      annual: 0,
      avoidedAnnual: 0,
      basis: 'Existing service relocation within the island; no incremental allowance.',
      confidence: 'default'
    };
  if (operation.kind === 'delete_service')
    return {
      upfront: 0,
      annual: 0,
      avoidedAnnual: null,
      basis: 'Deletion has no new investment; avoided operating cost depends on the existing service.',
      confidence: 'partial'
    };
  if (!('targetSubtype' in operation)) {
    return {
      upfront: null,
      annual: null,
      avoidedAnnual: 0,
      basis: 'Enter the incremental upgrade or downgrade package and annual running cost.',
      confidence: 'unknown'
    };
  }
  const target = SERVICE_COSTS[operation.targetSubtype];
  return target
    ? {
        ...cloneCost(target),
        basis: `Planning allowance for the ${operation.targetSubtype.replaceAll('_', ' ')} transition; source-service delta is not available.`,
        confidence: 'partial'
      }
    : {
        upfront: null,
        annual: null,
        avoidedAnnual: 0,
        basis: 'Enter the incremental upgrade or downgrade package and annual running cost.',
        confidence: 'unknown'
      };
}

export function estimateProposalCosts(operations: readonly ScenarioOperation[], assumptions: PlanningAssumptions) {
  const items = operations
    .filter((operation) => operation.kind !== 'move_service')
    .map((operation) => {
      const estimate = operationAllowance(operation);
      const override = assumptions.costs[operation.operationId];
      return { operation, ...estimate, ...(override ?? {}), custom: override !== undefined };
    });
  const total = (field: 'upfront' | 'annual') => ({
    known: items.reduce((sum, item) => sum + (typeof item[field] === 'number' ? item[field] : 0), 0),
    missing: items.filter((item) => item[field] === null).length
  });
  const avoidedAnnual = {
    known: items.reduce((sum, item) => sum + (item.avoidedAnnual ?? 0), 0),
    missing: items.filter((item) => item.avoidedAnnual === null).length
  };
  return { items, upfront: total('upfront'), annual: total('annual'), avoidedAnnual };
}

export function compareProposalDemand(
  baseline: IslandServicesResponse | null,
  projected: IslandServicesResponse | null
) {
  if (!baseline || !projected || baseline.island.id !== projected.island.id) return null;
  const before = baseline.planningDemand;
  const after = projected.planningDemand;
  const categories = (['health', 'education'] as const).map((category) => {
    const a = before?.[category];
    const b = after?.[category];
    return {
      category,
      before: a ?? null,
      after: b ?? null,
      avoided: a && b ? Math.max(0, a.outbound - b.outbound) : null,
      // A disappearance into unserved demand is not a resident travel benefit.
      eligible: a && b ? Math.max(0, Math.min(a.outbound - b.outbound, b.local - a.local)) : null
    };
  });
  const terminals = baseline.services
    .filter((service) => service.serviceType === 'transport')
    .flatMap((service) => {
      const next = projected.services.find((candidate) => candidate.id === service.id);
      const a = service.demand.transport;
      const b = next?.demand.transport;
      if (!b || a.status === 'unavailable' || b.status === 'unavailable' || a.total === null || b.total === null)
        return [];
      return [
        { id: service.id, label: service.name ?? service.subtype.replaceAll('_', ' '), before: a.total, after: b.total }
      ];
    });
  return { categories, terminals };
}

export function estimateTravelSavings(
  impact: ReturnType<typeof compareProposalDemand>,
  assumptions: PlanningAssumptions
): number | null {
  if (
    !impact ||
    typeof assumptions.annualTripsPerUnit !== 'number' ||
    typeof assumptions.returnFare !== 'number' ||
    impact.categories.some((category) => category.eligible === null)
  )
    return null;
  const annualTripsPerUnit = assumptions.annualTripsPerUnit;
  const returnFare = assumptions.returnFare;
  const result =
    impact.categories.reduce((sum, category) => sum + (category.eligible ?? 0), 0) * annualTripsPerUnit * returnFare;
  return Number.isFinite(result) ? result : null;
}

export function formatPlanningNumber(value: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
}
