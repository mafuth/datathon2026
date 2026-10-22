import type { IslandMapService, IslandServiceChange } from '$components/mobility/island-services';
import type { ScenarioPreviewRequest, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';

import {
  buildProposalImpact,
  calculateProposalCosts,
  DEFAULT_PROPOSAL_SETTINGS
} from '$lib/mobility/proposal-planning';
import { loadIslandContext, loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { getIslandServices, IslandServicesNotFoundError } from '$lib/server/scoring/island-services';

import { BaselineServicesCache } from './baseline-services-cache';
import { proposalBaselineVersion } from './proposal-baseline';
import { ProposalProjectionCache } from './proposal-projection-cache';
import { getProposalTransportOptions } from './proposal-transport';
import { projectScenario, ScenarioDomainError } from './scenario-engine';

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
  private readonly baselineServices = new BaselineServicesCache(getIslandServices);
  private readonly projectedServices = new ProposalProjectionCache(getIslandServices);

  async getProposalTransportOptions(islandId: string) {
    return getProposalTransportOptions(await loadScoringSnapshot(), islandId);
  }

  async getIslandServices(islandId: string) {
    const snapshot = await loadScoringSnapshot({ includeResidentialDemandPoints: true });
    return {
      ...(await this.baselineServices.get(islandId, snapshot)),
      baselineVersion: proposalBaselineVersion(snapshot)
    };
  }

  async previewScenario(input: ScenarioPreviewRequest): Promise<ScenarioPreviewResponse> {
    const [snapshot, islandRow] = await Promise.all([
      loadScoringSnapshot({ includeResidentialDemandPoints: true }),
      loadIslandContext(input.selectedIslandId)
    ]);
    const currentBaselineVersion = proposalBaselineVersion(snapshot);
    if (input.baselineVersion !== currentBaselineVersion) {
      throw new ScenarioDomainError(
        'BASELINE_VERSION_MISMATCH',
        'Baseline data changed since this proposal was prepared. Reload the island and review the draft against the current baseline.',
        409
      );
    }
    if (!islandRow)
      throw new ScenarioDomainError('ISLAND_NOT_FOUND', `Island ${input.selectedIslandId} was not found.`, 404);

    const projection = projectScenario(snapshot, islandRow.island, input.selectedIslandId, input.operations);
    const baselineRequest = this.baselineServices.get(input.selectedIslandId, snapshot);
    const [baseline, services] = await Promise.all([
      baselineRequest,
      input.operations.length === 0
        ? baselineRequest
        : this.projectedServices.get(input.selectedIslandId, snapshot, input.operations, projection.snapshot)
    ]);
    const proposal = input.proposal ?? { ...DEFAULT_PROPOSAL_SETTINGS };
    const costs = calculateProposalCosts(input.operations, baseline.services, proposal, projection.transportCosts);
    const projectedServices = services.services.map((service): IslandMapService => ({
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
      proposal,
      costs,
      transportPlans: projection.transportPlans,
      impact: buildProposalImpact(baseline, { ...services, services: projectedServices }),
      limitations: [
        ...services.limitations,
        'Draft changes do not update the server baseline. Saved drafts remain in this browser.',
        'Draft scoring remains a partial planning estimate and is not an approved policy score.'
      ]
    };
  }

  async createProposalReport(input: ScenarioPreviewRequest): Promise<Uint8Array> {
    const preview = await this.previewScenario(input);
    if (!preview.costs.complete) {
      throw new ScenarioDomainError(
        'PROPOSAL_COST_UNAVAILABLE',
        'Obtain a scoped cost estimate for every proposed change before exporting the decision brief.'
      );
    }
    if (!preview.costs.withinBudget) {
      throw new ScenarioDomainError(
        'PROPOSAL_BUDGET_EXCEEDED',
        'This proposal exceeds its capital or annual running limit. Adjust the accepted proposal or its limits before export.'
      );
    }
    const { buildProposalReport } = await import('./proposal-report');
    return buildProposalReport(input, preview);
  }
}

export const mobilityFacade = new MobilityFacade();

export { IslandServicesNotFoundError };
