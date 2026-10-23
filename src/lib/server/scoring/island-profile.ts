import type { ScoringIsland, ScoringSnapshot, SustainabilityScoreDto } from './types';
import type {
  IslandDemandMetric,
  IslandDemandProfile,
  IslandPopulationBand,
  IslandProfile,
  IslandProfileScore,
  IslandServiceGroup,
  IslandServiceItem,
  IslandTransportConnection
} from '$components/mobility/island-profile';
import type { Island, Service, TransportConnection } from '$models';

import { loadIslandContext, loadScoringSnapshot } from './database-input';
import { getIslandScore } from './island-score';
import { sustainabilityDto } from './sustainability-score';

export type IslandProfileWithSustainability = IslandProfile & {
  sustainability: SustainabilityScoreDto;
};

const populationBandDefinitions = [
  { key: 'child_population_0_14', label: 'Children 0-14', overlapping: false },
  { key: 'child_population_0_17', label: 'Children 0-17', overlapping: true },
  { key: 'adolescent_population_10_19', label: 'Adolescents 10-19', overlapping: true },
  { key: 'youth_population_15_24', label: 'Youth 15-24', overlapping: true },
  { key: 'working_age_population_15_64', label: 'Working age 15-64', overlapping: false },
  { key: 'youth_population_18_35', label: 'Youth 18-35', overlapping: true },
  { key: 'elderly_population_65_plus', label: 'Elderly 65+', overlapping: false }
] as const;

const serviceGroupDefinitions = [
  { key: 'health', label: 'Health' },
  { key: 'education', label: 'Education' },
  { key: 'transport', label: 'Transport' }
] as const;

const serviceLabels: Record<string, string> = {
  airport: 'Airport',
  air_terminal: 'Air terminal',
  bus_station: 'Bus station',
  bus_stop: 'Bus stop',
  clinic: 'Clinic',
  college: 'College',
  ferry_terminal: 'Ferry terminal',
  health_center: 'Health centre',
  helipad: 'Helipad',
  hospital: 'Hospital',
  jetty: 'Jetty',
  port: 'Port',
  preschool: 'Preschool',
  public_transport: 'Public transport',
  school: 'School',
  high_school: 'High school',
  tertiary: 'Tertiary education'
};

const hubLabels: Record<string, string> = {
  airport: 'Airport',
  ferry_terminal: 'Ferry terminal',
  land_gateway: 'Land gateway',
  transfer: 'Transfer hub'
};

export class IslandProfileNotFoundError extends Error {
  constructor(islandId: string) {
    super(`Island ${islandId} was not found`);
    this.name = 'IslandProfileNotFoundError';
  }
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function demandMetric(metric: {
  local: number;
  inbound: number;
  outbound: number;
  unserved: number;
  combined: number;
  demandPercent: number | null;
  outboundPercent: number | null;
}): IslandDemandMetric {
  return {
    local: round(metric.local),
    inbound: round(metric.inbound),
    outbound: round(metric.outbound),
    unserved: round(metric.unserved),
    combined: round(metric.combined),
    demandPercent: metric.demandPercent === null ? null : round(metric.demandPercent * 100),
    outboundPercent: metric.outboundPercent === null ? null : round(metric.outboundPercent * 100)
  };
}

function profileScore(component: {
  score: number | null;
  status: string;
  coverageRatio: number;
  evidenceCount: number;
}): IslandProfileScore {
  return {
    score: component.score,
    status: component.status,
    coverageRatio: component.coverageRatio,
    evidenceCount: component.evidenceCount
  };
}

function serviceLabel(subtype: string): string {
  return (
    serviceLabels[subtype] ?? subtype.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function populationBands(records: Array<{ ageCategory: string; amount: number }>, total: number | null) {
  return populationBandDefinitions.flatMap(({ key, label, overlapping }): IslandPopulationBand[] => {
    const record = records.find((entry) => entry.ageCategory === key);
    if (!record) return [];
    return [
      {
        key,
        label,
        amount: record.amount,
        share: total && total > 0 ? round((record.amount / total) * 100) : null,
        overlapping
      }
    ];
  });
}

function populationAmount(records: Array<{ ageCategory: string; amount: number }>, category: string): number | null {
  return records.find((record) => record.ageCategory === category)?.amount ?? null;
}

function groupServices(services: Service[]): IslandServiceGroup[] {
  return serviceGroupDefinitions.map(({ key, label }) => {
    const itemsBySubtype = new Map<string, IslandServiceItem>();
    for (const service of services.filter((entry) => entry.serviceType === key)) {
      const item = itemsBySubtype.get(service.subtype) ?? {
        key: service.subtype,
        label: serviceLabel(service.subtype),
        count: 0,
        names: []
      };
      item.count += 1;
      if (service.name && item.names.length < 3 && !item.names.includes(service.name)) item.names.push(service.name);
      itemsBySubtype.set(service.subtype, item);
    }
    const items = [...itemsBySubtype.values()].sort((left, right) => right.count - left.count);
    return { key, label, total: items.reduce((sum, item) => sum + item.count, 0), items };
  });
}

function connectionType(connection: TransportConnection): string {
  return connection.connectionType.replaceAll('_', ' ');
}

function connectionDetails(
  island: Island,
  connections: TransportConnection[],
  islandsById: Map<string, ScoringIsland>,
  routesById: Map<string, { name: string | null; routeType: string }>
): IslandTransportConnection[] {
  return connections
    .filter((connection) => connection.fromIslandId === island.id || connection.toIslandId === island.id)
    .map((connection) => {
      const outgoing = connection.fromIslandId === island.id;
      const neighborId = outgoing ? connection.toIslandId : connection.fromIslandId;
      const neighbor = islandsById.get(neighborId);
      const route = connection.routeId ? routesById.get(connection.routeId) : undefined;
      return {
        id: connection.id,
        type: connectionType(connection),
        routeType: route?.routeType ?? connection.connectionType,
        directionality: connection.directionality,
        direction: outgoing ? 'outgoing' : 'incoming',
        distanceM: connection.distanceM,
        routeName: route?.name ?? null,
        source: connection.source,
        modeled: connection.modeled,
        neighbor: neighbor
          ? {
              id: neighbor.id,
              name: neighbor.name,
              atollName: neighbor.atollName ?? null,
              islandType: neighbor.islandType
            }
          : null
      } satisfies IslandTransportConnection;
    })
    .sort((left, right) => (left.neighbor?.name ?? '').localeCompare(right.neighbor?.name ?? ''));
}

function connectionCounts(connections: IslandTransportConnection[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const connection of connections) counts.set(connection.type, (counts.get(connection.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

function demandProfile(
  records: Array<{ ageCategory: string; amount: number }>,
  total: number | null,
  score: Awaited<ReturnType<typeof getIslandScore>>,
  services: Service[],
  islands: ScoringIsland[]
): IslandDemandProfile {
  const childPopulation =
    populationAmount(records, 'child_population_0_14') ?? populationAmount(records, 'child_population_0_17');
  const adolescentPopulation = populationAmount(records, 'adolescent_population_10_19');
  const youthPopulation =
    populationAmount(records, 'youth_population_18_35') ?? populationAmount(records, 'youth_population_15_24');
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const islandById = new Map(islands.map((island) => [island.id, island]));
  const healthDemandSummary = demandMetric(score.demand.health);
  const educationDemandSummary = demandMetric(score.demand.education);
  const allAgeDemand = score.demand.healthByNeed.primary ? demandMetric(score.demand.healthByNeed.primary) : null;
  const youngerCareDemand = score.demand.healthByNeed.maternal_child
    ? demandMetric(score.demand.healthByNeed.maternal_child)
    : null;
  const childCareDemand = score.demand.healthByNeed.maternal_child
    ? demandMetric(score.demand.healthByNeed.maternal_child)
    : null;
  const elderlyCareDemand = score.demand.healthByNeed.chronic_elderly
    ? demandMetric(score.demand.healthByNeed.chronic_elderly)
    : null;
  const hospitalDemand = score.demand.healthByNeed.hospital_emergency
    ? demandMetric(score.demand.healthByNeed.hospital_emergency)
    : null;

  return {
    health: {
      populationBasis: total,
      childPopulation,
      elderlyPopulation: populationAmount(records, 'elderly_population_65_plus'),
      demand: healthDemandSummary,
      allAgeDemand,
      youngerCareDemand,
      childCareDemand,
      elderlyCareDemand,
      hospitalDemand,
      inboundDemand: score.externalDemand.inboundHealthDemand,
      outboundDemand: score.externalDemand.outboundHealthDemand,
      pressure: score.externalDemand.healthPressure
    },
    education: {
      childPopulation,
      adolescentPopulation,
      youthPopulation,
      demand: educationDemandSummary,
      inboundDemand: score.externalDemand.inboundEducationDemand,
      outboundDemand: score.externalDemand.outboundEducationDemand,
      pressure: score.externalDemand.educationPressure
    },
    transport: {
      residentPopulation: total,
      inboundPopulation:
        (score.externalDemand.inboundHealthDemand ?? 0) + (score.externalDemand.inboundEducationDemand ?? 0),
      outboundPopulation:
        (score.externalDemand.outboundHealthDemand ?? 0) + (score.externalDemand.outboundEducationDemand ?? 0),
      workingDemand: score.transport.demand.workingDemand,
      studentDemand: score.transport.demand.studentDemand,
      elderlyDemand: score.transport.demand.elderlyDemand,
      careTransferDemand: score.transport.demand.careTransferDemand,
      educationTransferDemand: score.transport.demand.educationTransferDemand,
      totalDemand: score.transport.demand.totalDemand,
      averageLoad: score.transport.demand.averageLoad,
      score: score.transport.demand.score,
      modes: score.transport.demand.modes,
      stops: score.transport.demand.stops.map((stop) => ({
        stopId: stop.stopId,
        islandId: stop.islandId,
        stopName: stop.stopName,
        subtype: stop.subtype,
        mode: stop.mode,
        connectedIslandIds: stop.connectedIslandIds,
        localDemand: stop.localDemand,
        connectedDemand: stop.connectedDemand,
        workingDemand: stop.workingDemand,
        studentDemand: stop.studentDemand,
        elderlyDemand: stop.elderlyDemand,
        careTransferDemand: stop.careTransferDemand,
        educationTransferDemand: stop.educationTransferDemand,
        totalDemand: stop.totalDemand,
        capacity: stop.capacity,
        loadRatio: stop.loadRatio,
        score: stop.score
      })),
      hubs: score.transport.hubImpacts.map((hub) => ({
        id: hub.hubId,
        label: serviceById.get(hub.hubId)?.name ?? hubLabels[hub.hubType] ?? 'Transport hub',
        type: hub.hubType,
        localDemand: hub.localDemand,
        incomingDemand: hub.incomingDemand,
        outboundDemand: hub.outboundDemand,
        transferDemand: hub.transferDemand,
        careTransferDemand: hub.careTransferDemand,
        educationTransferDemand: hub.educationTransferDemand,
        totalDemand: hub.totalDemand,
        capacity: hub.capacity,
        pressure: hub.pressure,
        status: hub.status
      }))
    },
    inboundSources: score.demand.inboundSources
      .map((source) => ({
        originIslandId: source.originIslandId,
        originName: islandById.get(source.originIslandId)?.name ?? source.originIslandId,
        originAtollName: islandById.get(source.originIslandId)?.atollName ?? 'Unknown atoll',
        health: round(source.health),
        education: round(source.education),
        total: round(source.total)
      }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          `${left.originAtollName} ${left.originName}`.localeCompare(`${right.originAtollName} ${right.originName}`) ||
          left.originIslandId.localeCompare(right.originIslandId)
      )
  };
}

export async function getIslandProfile(islandId: string): Promise<IslandProfileWithSustainability> {
  const normalizedId = islandId.trim();
  if (!normalizedId) throw new IslandProfileNotFoundError(islandId);

  const [snapshot, island] = await Promise.all([loadScoringSnapshot(), loadIslandContext(normalizedId)]);
  if (!island) throw new IslandProfileNotFoundError(normalizedId);

  const score = await getIslandScore(normalizedId, snapshot);
  return buildIslandProfile(island.island, island.atollName, snapshot, score);
}

function buildIslandProfile(
  island: Island,
  atollName: string,
  snapshot: ScoringSnapshot,
  score: Awaited<ReturnType<typeof getIslandScore>>
): IslandProfileWithSustainability {
  const populationRecords = snapshot.population.filter((record) => record.islandId === island.id);
  const totalRecord = populationRecords.find((record) => record.ageCategory === 'total');
  const total = totalRecord?.amount ?? score.overall.denominatorPopulation;
  const islandServices = snapshot.services.filter((service) => service.islandId === island.id);
  const islandsById = new Map(snapshot.islands.map((entry) => [entry.id, entry]));
  const routesById = new Map(
    snapshot.routes.map((route) => [route.id, { name: route.name, routeType: route.routeType }])
  );
  const directConnections = connectionDetails(island, snapshot.connections, islandsById, routesById);
  const airportIsland = score.airportAccess.airportIslandId
    ? islandsById.get(score.airportAccess.airportIslandId)
    : null;

  return {
    island: {
      id: island.id,
      name: island.name,
      atollName,
      islandType: island.islandType,
      landAreaKm2: island.landAreaKm2
    },
    population: { total, bands: populationBands(populationRecords, total) },
    services: groupServices(islandServices),
    connections: { direct: directConnections, byType: connectionCounts(directConnections) },
    transportAccess: {
      land: profileScore(score.transport.land),
      marine: profileScore(score.transport.marine),
      air: profileScore(score.transport.air),
      airport: {
        available: score.airportAccess.available,
        source: score.airportAccess.source,
        islandName: airportIsland?.name ?? null
      }
    },
    employment: {
      score: score.employment.score,
      status: score.employment.status,
      coverageRatio: score.employment.coverageRatio,
      evidenceCount: score.employment.evidenceCount,
      foreignPopulation: score.employment.foreignPopulation,
      foreignPopulationSource: score.employment.foreignPopulationSource,
      workingAgePopulation: score.employment.workingAgePopulation,
      jobLocationCount: score.employment.jobLocationCount,
      foreignPerWorkingAge: score.employment.foreignPerWorkingAge,
      foreignPerJobLocation: score.employment.foreignPerJobLocation,
      jobLocationsPerThousandWorkingAge: score.employment.jobLocationsPerThousandWorkingAge,
      pressureScore: score.employment.pressureScore,
      supplyScore: score.employment.supplyScore,
      categories: score.employment.categories,
      limitations: score.employment.limitations
    },
    sustainability: sustainabilityDto(score.sustainability),
    demand: demandProfile(populationRecords, total, score, islandServices, snapshot.islands)
  };
}
