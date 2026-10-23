import type { IslandMapService, IslandServiceChange } from '$components/mobility/island-services';
import type { ConnectionNetworkResponse } from '$lib/mobility/connection-network-contracts';
import type { ScenarioPreviewRequest, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildProposalImpact,
  calculateProposalCosts,
  DEFAULT_PROPOSAL_SETTINGS
} from '$lib/mobility/proposal-planning';
import { scoringConfig } from '$lib/server/scoring/config';
import { loadIslandContext, loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { getIslandServices, IslandServicesNotFoundError } from '$lib/server/scoring/island-services';

import { buildConnectionNetwork } from './connection-network';
import { loadConnectionNetworkSource } from './connection-network-data';
import { loadPresentationStory } from './presentation-story';
import { proposalBaselineVersion } from './proposal-baseline';
import { ProposalProjectionCache } from './proposal-projection-cache';
import { getProposalTransportOptions } from './proposal-transport';
import { projectScenario, ScenarioDomainError } from './scenario-engine';

const projectedServicesCache = new ProposalProjectionCache(getIslandServices);
const baselineServicesCache = new WeakMap<
  Awaited<ReturnType<typeof loadScoringSnapshot>>,
  Map<string, Promise<Awaited<ReturnType<typeof getIslandServices>>>>
>();

function cachedIslandServices(
  snapshot: Awaited<ReturnType<typeof loadScoringSnapshot>>,
  islandId: string,
  islandRow: NonNullable<Awaited<ReturnType<typeof loadIslandContext>>>
): Promise<Awaited<ReturnType<typeof getIslandServices>>> {
  let byIsland = baselineServicesCache.get(snapshot);
  if (!byIsland) {
    byIsland = new Map();
    baselineServicesCache.set(snapshot, byIsland);
  }
  const cached = byIsland.get(islandId);
  if (cached) return cached;
  const request = getIslandServices(islandId, snapshot, islandRow).catch((error: unknown) => {
    byIsland?.delete(islandId);
    throw error;
  });
  byIsland.set(islandId, request);
  return request;
}

type BaselineArtifact = { schema_version?: unknown };
let baselineVersionCache: { modifiedAt: number; size: number; value: string } | null = null;
let connectionNetworkCache: ConnectionNetworkResponse | null = null;
let connectionNetworkRequest: { version: string; request: Promise<ConnectionNetworkResponse> } | null = null;

function baselineVersion(): string {
  const path = resolve(process.cwd(), 'data/mobility/normalized/current-db-baseline.json');
  try {
    const stat = statSync(path);
    const modifiedAt = stat.mtimeMs;
    const size = stat.size;
    if (baselineVersionCache?.modifiedAt === modifiedAt && baselineVersionCache.size === size)
      return baselineVersionCache.value;
    const content = readFileSync(path);
    const artifact = JSON.parse(content.toString('utf8')) as BaselineArtifact;
    const model = typeof artifact.schema_version === 'string' ? artifact.schema_version : 'unknown-schema';
    const value = `${model}:${createHash('sha256').update(content).update(JSON.stringify(scoringConfig)).digest('hex').slice(0, 16)}`;
    baselineVersionCache = { modifiedAt, size, value };
    return value;
  } catch {
    return 'current-db-mobility-baseline-v1:unavailable';
  }
}

function changesForServices(
  services: ScenarioPreviewResponse['services'],
  changes: Map<string, 'added' | 'upgraded' | 'downgraded' | 'moved'>,
  deleted: Set<string>
): Record<string, IslandServiceChange> {
  return Object.fromEntries([
    ...services.map((service) => [service.id, changes.get(service.id) ?? 'unchanged']),
    ...[...deleted].map((serviceId) => [serviceId, 'deleted'])
  ]) as Record<string, IslandServiceChange>;
}

export class MobilityFacade {
  async getPresentationStory() {
    return loadPresentationStory();
  }

  async getConnectionNetwork(): Promise<ConnectionNetworkResponse> {
    const currentBaselineVersion = baselineVersion();
    if (connectionNetworkCache?.baselineVersion === currentBaselineVersion) return connectionNetworkCache;
    if (connectionNetworkRequest?.version === currentBaselineVersion) return connectionNetworkRequest.request;

    const request = loadConnectionNetworkSource().then((source) => ({
      ...buildConnectionNetwork(source),
      baselineVersion: currentBaselineVersion
    }));
    const pending = { version: currentBaselineVersion, request };
    connectionNetworkRequest = pending;
    void request.then(
      (response) => {
        if (connectionNetworkRequest !== pending) return;
        connectionNetworkRequest = null;
        connectionNetworkCache = response;
      },
      () => {
        if (connectionNetworkRequest === pending) connectionNetworkRequest = null;
      }
    );
    return request;
  }

  async getIslandServices(islandId: string) {
    const snapshot = await loadScoringSnapshot({ includeResidentialDemandPoints: true });
    return { ...(await getIslandServices(islandId, snapshot)), baselineVersion: proposalBaselineVersion(snapshot) };
  }

  async getProposalTransportOptions(islandId: string) {
    const snapshot = await loadScoringSnapshot({ includeResidentialDemandPoints: false });
    return getProposalTransportOptions(snapshot, islandId);
  }

  async previewScenario(input: ScenarioPreviewRequest): Promise<ScenarioPreviewResponse> {
    const [snapshot, islandRow] = await Promise.all([
      loadScoringSnapshot({ includeResidentialDemandPoints: true }),
      loadIslandContext(input.selectedIslandId)
    ]);
    if (!islandRow)
      throw new ScenarioDomainError('ISLAND_NOT_FOUND', `Island ${input.selectedIslandId} was not found.`, 404);
    const currentBaselineVersion = proposalBaselineVersion(snapshot);
    if (input.baselineVersion !== currentBaselineVersion) {
      throw new ScenarioDomainError(
        'BASELINE_VERSION_MISMATCH',
        `Draft baseline ${input.baselineVersion} does not match ${currentBaselineVersion}.`,
        409
      );
    }

    const projection = projectScenario(snapshot, islandRow.island, input.selectedIslandId, input.operations);
    const baseline = {
      ...(await cachedIslandServices(snapshot, input.selectedIslandId, islandRow)),
      baselineVersion: currentBaselineVersion
    };
    const services = input.operations.length
      ? await projectedServicesCache.get(
          input.selectedIslandId,
          snapshot,
          input.operations,
          projection.snapshot,
          islandRow,
          baseline.services
        )
      : baseline;
    const proposal = input.proposal ?? {
      ...DEFAULT_PROPOSAL_SETTINGS,
      name: `${islandRow.island.name} access proposal`
    };
    const costs = calculateProposalCosts(input.operations, baseline.services, proposal, projection.transportCosts);
    const projectedServices: IslandMapService[] = services.services.map((service) => ({
      ...service,
      change: projection.changes.get(service.id) ?? 'unchanged'
    }));

    return {
      ...services,
      status: 'draft',
      draftOnly: true,
      persisted: false,
      baselineVersion: currentBaselineVersion,
      selectedIslandId: input.selectedIslandId,
      baseline,
      services: projectedServices,
      proposal,
      costs,
      impact: buildProposalImpact(baseline, { ...services, services: projectedServices }),
      transportPlans: projection.transportPlans,
      operations: projection.results,
      serviceChanges: changesForServices(projectedServices, projection.changes, projection.deleted),
      limitations: [
        ...services.limitations,
        'Draft changes are not persisted on the server; the browser may autosave operations locally.',
        'Draft scoring remains a partial planning estimate and is not an approved policy score.'
      ]
    };
  }

  async createProposalReport(input: ScenarioPreviewRequest): Promise<Uint8Array> {
    const preview = await this.previewScenario(input);
    const { buildProposalReport } = await import('./proposal-report');
    return buildProposalReport(input, preview);
  }
}

export const mobilityFacade = new MobilityFacade();

export { IslandServicesNotFoundError };
