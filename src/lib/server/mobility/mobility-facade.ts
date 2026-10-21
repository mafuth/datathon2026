import type { IslandServiceChange } from '$components/mobility/island-services';
import type { ScenarioPreviewRequest, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadIslandContext, loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { getIslandServices, IslandServicesNotFoundError } from '$lib/server/scoring/island-services';

import { projectScenario, ScenarioDomainError } from './scenario-engine';

type BaselineArtifact = { schema_version?: unknown };
let baselineVersionCache: { modifiedAt: number; value: string } | null = null;

function baselineVersion(): string {
  const path = resolve(process.cwd(), 'data/mobility/normalized/current-db-baseline.json');
  let modifiedAt = 0;
  try {
    modifiedAt = statSync(path).mtimeMs;
  } catch {
    // Fall back to the default version below when the optional artifact is unavailable.
  }
  if (baselineVersionCache?.modifiedAt === modifiedAt) return baselineVersionCache.value;

  let value = 'current-db-mobility-baseline-v1';
  try {
    const artifact = JSON.parse(readFileSync(path, 'utf8')) as BaselineArtifact;
    if (typeof artifact.schema_version === 'string') value = artifact.schema_version;
  } catch {
    // Keep the stable fallback when the optional artifact is unavailable.
  }
  baselineVersionCache = { modifiedAt, value };
  return value;
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
  async getIslandServices(islandId: string) {
    return { ...(await getIslandServices(islandId)), baselineVersion: baselineVersion() };
  }

  async previewScenario(input: ScenarioPreviewRequest): Promise<ScenarioPreviewResponse> {
    const currentBaselineVersion = baselineVersion();
    if (input.baselineVersion !== currentBaselineVersion) {
      throw new ScenarioDomainError(
        'BASELINE_VERSION_MISMATCH',
        `Draft baseline ${input.baselineVersion} does not match ${currentBaselineVersion}.`,
        409
      );
    }

    const [snapshot, islandRow] = await Promise.all([
      loadScoringSnapshot({ includeResidentialDemandPoints: true }),
      loadIslandContext(input.selectedIslandId)
    ]);
    if (!islandRow)
      throw new ScenarioDomainError('ISLAND_NOT_FOUND', `Island ${input.selectedIslandId} was not found.`, 404);

    const projection = projectScenario(snapshot, islandRow.island, input.selectedIslandId, input.operations);
    const services = await getIslandServices(input.selectedIslandId, projection.snapshot, islandRow);
    const projectedServices = services.services.map((service) => ({
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
      services: projectedServices,
      operations: projection.results,
      serviceChanges: changesForServices(projectedServices, projection.changes, projection.deleted),
      limitations: [
        ...services.limitations,
        'Draft changes are temporary and are not persisted.',
        'Draft scoring remains a partial planning estimate and is not an approved policy score.'
      ]
    };
  }
}

export const mobilityFacade = new MobilityFacade();

export { IslandServicesNotFoundError };
