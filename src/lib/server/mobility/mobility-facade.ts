import type { IslandServiceChange } from '$components/mobility/island-services';
import type { ScenarioPreviewRequest, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Atoll, Island } from '$models';
import { eq } from 'drizzle-orm';

import db from '$lib/server/database';
import { loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { getIslandServices, IslandServicesNotFoundError } from '$lib/server/scoring/island-services';

import { projectScenario, ScenarioDomainError } from './scenario-engine';

type BaselineArtifact = { schema_version?: unknown };

function baselineVersion(): string {
  try {
    const artifact = JSON.parse(
      readFileSync(resolve(process.cwd(), 'data/mobility/normalized/current-db-baseline.json'), 'utf8')
    ) as BaselineArtifact;
    return typeof artifact.schema_version === 'string' ? artifact.schema_version : 'current-db-mobility-baseline-v1';
  } catch {
    return 'current-db-mobility-baseline-v1';
  }
}

function changesForServices(
  services: ScenarioPreviewResponse['services'],
  changes: Map<string, 'added' | 'upgraded' | 'moved'>,
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

    const [snapshot, islandRows] = await Promise.all([
      loadScoringSnapshot({ includeResidentialDemandPoints: true }),
      db
        .select({ island: Island, atollName: Atoll.name })
        .from(Island)
        .innerJoin(Atoll, eq(Island.atollId, Atoll.id))
        .where(eq(Island.id, input.selectedIslandId))
        .limit(1)
    ]);
    const islandRow = islandRows[0];
    if (!islandRow)
      throw new ScenarioDomainError('ISLAND_NOT_FOUND', `Island ${input.selectedIslandId} was not found.`, 404);

    const projection = projectScenario(snapshot, islandRow.island, input.selectedIslandId, input.operations);
    const services = await getIslandServices(input.selectedIslandId, projection.snapshot);
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
