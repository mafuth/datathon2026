import type { ScenarioOperation } from './scenario-contracts';
import type {
  IslandMapService,
  IslandServicesResponse,
  ServiceDemandCategory,
  ServiceDemandStatus
} from '$components/mobility/island-services';

import { serviceCatalogEntry } from './service-catalog';

export type ProposalSettings = {
  name: string;
  capitalLimit: number;
  annualLimit: number;
};

export const DEFAULT_PROPOSAL_SETTINGS: ProposalSettings = {
  name: 'Island access proposal',
  capitalLimit: 50_000_000,
  annualLimit: 12_000_000
};

export type ProposalCostItem = {
  operationId: string;
  serviceId: string;
  label: string;
  kind: ScenarioOperation['kind'];
  capital: number;
  annual: number;
  basis: string;
  sourceIds: string[];
  estimated: boolean;
  costAvailable: boolean;
};

export type ProposalCosts = {
  currency: 'MVR';
  revision: string;
  capital: number;
  annual: number;
  oneYear: number;
  fiveYear: number;
  tenYear: number;
  withinBudget: boolean;
  complete: boolean;
  capitalRemaining: number;
  annualRemaining: number;
  items: ProposalCostItem[];
  limitations: string[];
};

export type ProposalCategoryImpact = {
  category: ServiceDemandCategory;
  label: string;
  beforeDemand: number | null;
  afterDemand: number | null;
  demandChange: number | null;
  beforePressure: number | null;
  afterPressure: number | null;
  beforeServiceCount: number;
  afterServiceCount: number;
  status: ServiceDemandStatus;
};

export type ProposalImpact = {
  categories: ProposalCategoryImpact[];
  changedServiceCount: number;
  addedServiceCount: number;
  removedServiceCount: number;
  baselineServiceCount: number;
  proposedServiceCount: number;
  limitations: string[];
};

export const PROPOSAL_COST_SOURCES = [
  {
    id: 'sto-diesel-2026-03',
    title: 'STO: diesel price revision, March 2026',
    url: 'https://sto.mv/newsroom/news/22/fuel-price-revision-march-2026',
    qualification:
      'Retained MVR 17.54/litre effective 5 March 2026. This dated fuel proxy is not an operator bulk contract or a current supplier quotation.'
  },
  {
    id: 'maldives-btr-2024',
    title: 'Maldives First Biennial Transparency Report, Tables 12 and 28',
    url: 'https://unfccc.int/sites/default/files/resource/MDV-BTR%201-Nov2024.pdf',
    qualification:
      'Retained inventory proxies: passenger ferry 39 litres/hour and diesel urban bus 0.42 litres/km. Older survey assumptions, not observed local fleet running costs.'
  },
  {
    id: 'health-project-register',
    title: 'Ministry of Health contracted health projects register',
    url: 'https://health.gov.mv/storage/uploads/QoQROJwv/vrrrri7d.pdf',
    qualification:
      'Retained 2025 construction benchmarks for small Level 1 hospitals around MVR 105–114m. Scopes differ; annual running costs are separate planning assumptions.'
  },
  {
    id: 'education-inguraidhoo-2022',
    title: 'Ministry of Education: Inguraidhoo school PSIP contract',
    url: 'https://old.moe.gov.mv/en/article/view/781/PSIP-projects',
    qualification:
      'Historical MVR 16.96m classroom/staff-room/hall extension benchmark. The retained MVR 25m allowance adds scope and contingency; this is not a full campus quotation.'
  }
] as const;

type AssetAllowance = { capital: number; annual: number; basis: string; sourceIds: string[] };

const STOP_ALLOWANCE: AssetAllowance = {
  capital: 250_000,
  annual: 0,
  basis:
    'Retained MVR 250,000 sheltered accessible stop allowance: shelter, seating, signage, lighting and boarding pad. Land and major road works excluded. No separate stop maintenance allowance is available; bus operations must be costed separately.',
  sourceIds: []
};

const SCHOOL_ALLOWANCE: AssetAllowance = {
  capital: 25_000_000,
  annual: 5_000_000,
  basis:
    'Retained allowance for a small school building or extension: MVR 25m capital and MVR 5m annual staffing, materials, utilities and maintenance. Not a complete large campus; land excluded. Annual cost is a provisional planning assumption.',
  sourceIds: ['education-inguraidhoo-2022']
};

const HOSPITAL_ALLOWANCE: AssetAllowance = {
  capital: 120_000_000,
  annual: 20_000_000,
  basis:
    'Retained allowance for a roughly 30-bed Level 1 hospital: MVR 120m capital and MVR 20m annual staffing, utilities, supplies and maintenance. Land and specialist scope excluded. Annual cost is a provisional planning assumption.',
  sourceIds: ['health-project-register']
};

const ASSET_ALLOWANCES: Record<string, AssetAllowance> = {
  clinic: {
    capital: 8_000_000,
    annual: 750_000,
    basis: 'Planning allowance for a community clinic; land and specialist equipment excluded.',
    sourceIds: []
  },
  health_center: {
    capital: 25_000_000,
    annual: 2_000_000,
    basis: 'Planning allowance for a health centre; land and specialist equipment excluded.',
    sourceIds: []
  },
  hospital: HOSPITAL_ALLOWANCE,
  preschool: {
    capital: 12_000_000,
    annual: 1_000_000,
    basis: 'Planning allowance for a preschool; land excluded.',
    sourceIds: []
  },
  school: SCHOOL_ALLOWANCE,
  high_school: {
    capital: 45_000_000,
    annual: 4_000_000,
    basis: 'Planning allowance for a secondary school facility; land excluded.',
    sourceIds: ['education-inguraidhoo-2022']
  },
  tertiary: {
    capital: 60_000_000,
    annual: 6_000_000,
    basis: 'Planning allowance for a tertiary education facility; land and specialist teaching scope excluded.',
    sourceIds: []
  },
  bus_stop: STOP_ALLOWANCE,
  bus_station: {
    capital: 8_000_000,
    annual: 500_000,
    basis: 'Planning allowance for a small bus station; land, road reconstruction and vehicles excluded.',
    sourceIds: []
  },
  public_transport: {
    capital: 1_500_000,
    annual: 250_000,
    basis: 'Planning allowance for a local public-transport facility; vehicles and route operations excluded.',
    sourceIds: []
  },
  port: {
    capital: 35_000_000,
    annual: 1_250_000,
    basis: 'Planning allowance for a small port improvement; dredging, reclamation and land excluded.',
    sourceIds: []
  },
  jetty: {
    capital: 12_000_000,
    annual: 375_000,
    basis: 'Planning allowance for a small jetty improvement; major marine works excluded.',
    sourceIds: []
  },
  airport: {
    capital: 250_000_000,
    annual: 12_500_000,
    basis: 'Planning allowance for a regional airport facility; runway, land and aviation approvals excluded.',
    sourceIds: []
  },
  air_terminal: {
    capital: 40_000_000,
    annual: 2_500_000,
    basis: 'Planning allowance for an airport terminal; runway and aircraft excluded.',
    sourceIds: []
  },
  helipad: {
    capital: 8_000_000,
    annual: 500_000,
    basis: 'Planning allowance for a helipad; aircraft and aviation operations excluded.',
    sourceIds: []
  }
};

function assetAllowance(serviceType: string, subtype: string): AssetAllowance | null {
  if (!['health', 'education', 'transport'].includes(serviceType)) return null;
  return ASSET_ALLOWANCES[subtype] ?? null;
}

export function proposalAllowance(subtype: string): AssetAllowance | null {
  const allowance = ASSET_ALLOWANCES[subtype];
  return allowance ? { ...allowance, sourceIds: [...allowance.sourceIds] } : null;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function scopedAllowance(operation: ScenarioOperation, fallback: AssetAllowance | null): AssetAllowance | null {
  if ('estimate' in operation && operation.estimate) {
    return {
      capital: operation.estimate.capital,
      annual: operation.estimate.annual,
      basis: `User supplied project scope: ${operation.estimate.basis}. This is an explicit planning assumption, not a verified supplier quotation.`,
      sourceIds: []
    };
  }
  return fallback;
}

const proposalMoneyFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

export function formatProposalMoney(value: number): string {
  return `MVR ${proposalMoneyFormatter.format(value)}`;
}

export function calculateProposalCosts(
  operations: readonly ScenarioOperation[],
  baselineServices: readonly IslandMapService[],
  settings: ProposalSettings = DEFAULT_PROPOSAL_SETTINGS,
  transportItems: readonly ProposalCostItem[] = []
): ProposalCosts {
  const active = new Map(
    baselineServices.map((service) => [service.id, { ...service, additionId: null as string | null }])
  );
  const items = new Map<string, ProposalCostItem>();

  for (const operation of operations) {
    if (operation.kind === 'add_bus_service' || operation.kind === 'add_ferry_service') {
      const authoritativeItem = transportItems.find((item) => item.operationId === operation.operationId);
      items.set(
        operation.operationId,
        authoritativeItem ?? {
          operationId: operation.operationId,
          serviceId: `draft:${operation.operationId}`,
          label: operation.kind === 'add_bus_service' ? 'Proposed bus service' : 'Proposed ferry connection',
          kind: operation.kind,
          capital: 0,
          annual: 0,
          basis:
            'A current server calculation of route length, operating window, vehicle count and proposed frequency is required.',
          sourceIds: [],
          estimated: true,
          costAvailable: false
        }
      );
      continue;
    }
    if (operation.kind === 'add_service') {
      const id = `draft:${operation.operationId}`;
      const allowance = scopedAllowance(operation, assetAllowance(operation.serviceType, operation.subtype));
      const label =
        operation.name?.trim() ||
        serviceCatalogEntry(operation.serviceType, operation.subtype)?.label ||
        operation.subtype.replaceAll('_', ' ');
      active.set(id, {
        id,
        name: label,
        subtype: operation.subtype,
        serviceType: operation.serviceType,
        coordinates: operation.coordinates,
        demand: {} as IslandMapService['demand'],
        additionId: operation.operationId
      });
      items.set(operation.operationId, {
        operationId: operation.operationId,
        serviceId: id,
        label,
        kind: operation.kind,
        capital: allowance?.capital ?? 0,
        annual: allowance?.annual ?? 0,
        basis:
          allowance?.basis ??
          'No retained project allowance is available for this facility. Obtain a scoped capital and operating estimate before committing it.',
        sourceIds: allowance?.sourceIds ?? [],
        estimated: true,
        costAvailable: allowance !== null
      });
      continue;
    }

    const service = active.get(operation.serviceId);
    if (!service) continue;

    if (operation.kind === 'delete_service') {
      active.delete(service.id);
      if (service.additionId) {
        items.delete(service.additionId);
        for (const [id, item] of items) if (item.serviceId === service.id) items.delete(id);
      } else {
        for (const [id, item] of items) if (item.serviceId === service.id) items.delete(id);
        const allowance = scopedAllowance(operation, null);
        items.set(operation.operationId, {
          operationId: operation.operationId,
          serviceId: service.id,
          label: `Remove ${service.name || service.subtype.replaceAll('_', ' ')}`,
          kind: operation.kind,
          capital: allowance?.capital ?? 0,
          annual: allowance?.annual ?? 0,
          basis:
            allowance?.basis ??
            'No demolition, closure liability or operating saving is inferred. A scoped closure estimate is required before implementation.',
          sourceIds: [],
          estimated: true,
          costAvailable: allowance !== null
        });
      }
      continue;
    }

    if (operation.kind === 'move_service') {
      if (!service.additionId) {
        const allowance = scopedAllowance(operation, null);
        for (const [id, item] of items)
          if (item.serviceId === service.id && item.kind === 'move_service') items.delete(id);
        items.set(operation.operationId, {
          operationId: operation.operationId,
          serviceId: service.id,
          label: `Relocate ${service.name || service.subtype.replaceAll('_', ' ')}`,
          kind: operation.kind,
          capital: allowance?.capital ?? 0,
          annual: allowance?.annual ?? 0,
          basis:
            allowance?.basis ??
            'Relocating an existing facility needs a project-specific estimate. Changing the site of an unbuilt draft addition keeps its original allowance.',
          sourceIds: [],
          estimated: true,
          costAvailable: allowance !== null
        });
      }
      continue;
    }

    const transition = operation.kind === 'upgrade_service' ? 'upgrade' : 'downgrade';
    const allowance = scopedAllowance(operation, assetAllowance(service.serviceType, operation.targetSubtype));
    if (service.additionId) {
      const item = items.get(service.additionId);
      if (item) {
        items.set(service.additionId, {
          ...item,
          label: operation.targetSubtype.replaceAll('_', ' '),
          capital: allowance?.capital ?? 0,
          annual: allowance?.annual ?? 0,
          basis: allowance?.basis ?? `A project-specific allowance is required for this ${transition}.`,
          sourceIds: allowance?.sourceIds ?? [],
          costAvailable: allowance !== null
        });
      }
    } else {
      for (const [id, item] of items)
        if (item.serviceId === service.id && (item.kind === 'upgrade_service' || item.kind === 'downgrade_service'))
          items.delete(id);
      items.set(operation.operationId, {
        operationId: operation.operationId,
        serviceId: service.id,
        label: `${transition === 'upgrade' ? 'Upgrade' : 'Downgrade'} ${service.name || service.subtype.replaceAll('_', ' ')} to ${operation.targetSubtype.replaceAll('_', ' ')}`,
        kind: operation.kind,
        capital: allowance?.capital ?? 0,
        annual: allowance?.annual ?? 0,
        basis: allowance
          ? operation.estimate
            ? allowance.basis
            : `Conservative full replacement allowance; no unverified value of existing assets or operating savings is deducted. ${allowance.basis}`
          : `No retained allowance is available for this ${transition}. Obtain a scoped capital and annual operating estimate; no operating savings are inferred.`,
        sourceIds: allowance?.sourceIds ?? [],
        estimated: true,
        costAvailable: allowance !== null
      });
    }
    active.set(service.id, { ...service, subtype: operation.targetSubtype });
  }

  const result = [...items.values()];
  const capital = money(result.reduce((sum, item) => sum + item.capital, 0));
  const annual = money(result.reduce((sum, item) => sum + item.annual, 0));
  const complete = result.every((item) => item.costAvailable);
  return {
    currency: 'MVR',
    revision: 'mvr-local-planning-2026-10-22',
    capital,
    annual,
    oneYear: money(capital + annual),
    fiveYear: money(capital + annual * 5),
    tenYear: money(capital + annual * 10),
    withinBudget: complete && capital <= settings.capitalLimit && annual <= settings.annualLimit,
    complete,
    capitalRemaining: money(settings.capitalLimit - capital),
    annualRemaining: money(settings.annualLimit - annual),
    items: result,
    limitations: [
      'Retained MVR planning allowances reviewed 20 October 2026; these are not supplier quotations or a government appropriation.',
      'Capital and annual cash running limits are independent. Multi-year totals are capital plus recurring annual cost; no inflation, financing, discounting, fare income or residual value is inferred.',
      'Land, reclamation, major civil works and site-specific permissions need separate assessment.',
      ...(!complete
        ? ['One or more changes have no cost allowance. Their zero subtotal is unknown cost, not a free intervention.']
        : [])
    ]
  };
}

function categoryStats(services: readonly IslandMapService[], category: ServiceDemandCategory) {
  const relevant = services.filter((service) => service.serviceType === category);
  const demands = relevant.map((service) => service.demand[category]);
  const values = demands
    .map((demand) => demand.value)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const pressures = demands
    .map((demand) => demand.loadRatio)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    count: relevant.length,
    demand: values.length > 0 ? money(values.reduce((sum, value) => sum + value, 0)) : null,
    pressure: pressures.length > 0 ? money(pressures.reduce((sum, value) => sum + value, 0) / pressures.length) : null,
    status:
      values.length === 0
        ? 'unavailable'
        : demands.every((demand) => demand.status === 'numeric')
          ? 'numeric'
          : 'partial'
  } satisfies { count: number; demand: number | null; pressure: number | null; status: ServiceDemandStatus };
}

export function buildProposalImpact(baseline: IslandServicesResponse, preview: IslandServicesResponse): ProposalImpact {
  const beforeIds = new Set(baseline.services.map((service) => service.id));
  const afterIds = new Set(preview.services.map((service) => service.id));
  const addedServiceCount = preview.services.filter((service) => !beforeIds.has(service.id)).length;
  const removedServiceCount = baseline.services.filter((service) => !afterIds.has(service.id)).length;
  const changedServiceCount =
    preview.services.filter((service) => service.change && service.change !== 'unchanged').length + removedServiceCount;
  const labels = { health: 'Healthcare', education: 'Education', transport: 'Public transport' };
  const categories = (['health', 'education', 'transport'] as const).map((category) => {
    const before = categoryStats(baseline.services, category);
    const after = categoryStats(preview.services, category);
    return {
      category,
      label: labels[category],
      beforeDemand: before.demand,
      afterDemand: after.demand,
      demandChange: before.demand !== null && after.demand !== null ? money(after.demand - before.demand) : null,
      beforePressure: before.pressure,
      afterPressure: after.pressure,
      beforeServiceCount: before.count,
      afterServiceCount: after.count,
      status:
        before.status === 'unavailable' || after.status === 'unavailable'
          ? 'unavailable'
          : before.status === 'partial' || after.status === 'partial'
            ? 'partial'
            : 'numeric'
    } satisfies ProposalCategoryImpact;
  });
  return {
    categories,
    changedServiceCount,
    addedServiceCount,
    removedServiceCount,
    baselineServiceCount: baseline.services.length,
    proposedServiceCount: preview.services.length,
    limitations: [
      'Demand totals count modeled service allocations. The same person can contribute to multiple needs or stops; these are not unique residents gaining access.',
      'Pressure is the mean available modeled transport load ratio; healthcare and education pressure may be unavailable.',
      'Map hexagons show the native facility-demand and residential-distance proxy. Their colour changes do not establish journey minutes, reachable population or an approved accessibility score.',
      'Education subtype coverage values are configured heatmap proxies, not measured student places, staffing levels or service capacity.',
      'Adding a boarding point does not establish a scheduled bus or ferry service. No timetable, frequency, route feasibility or waiting-time benefit is inferred.'
    ]
  };
}
