import type { ProposalCosts, ProposalImpact, ProposalSettings } from './proposal-planning';
import type { ProposalTransportPlan } from './proposal-transport';
import type { IslandServiceChange, IslandServicesResponse } from '$components/mobility/island-services';

import * as v from 'valibot';

import { proposalTransportOperationSchemas } from './proposal-transport';
import { ADDABLE_SERVICE_SUBTYPES, ADDABLE_SERVICE_TYPES } from './service-catalog';

const operationId = v.pipe(v.string(), v.minLength(1), v.maxLength(80));
const serviceId = v.pipe(v.string(), v.minLength(1), v.maxLength(160));
const coordinate = v.pipe(
  v.number(),
  v.check((value: number) => Number.isFinite(value), 'Coordinate must be finite.')
);
const scopedEstimate = v.optional(
  v.object({
    capital: v.pipe(
      v.number(),
      v.check((value: number) => Number.isFinite(value)),
      v.minValue(0),
      v.maxValue(1_000_000_000_000)
    ),
    annual: v.pipe(
      v.number(),
      v.check((value: number) => Number.isFinite(value)),
      v.minValue(0),
      v.maxValue(1_000_000_000_000)
    ),
    basis: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500))
  })
);

export const scenarioOperationSchema = v.variant('kind', [
  ...proposalTransportOperationSchemas,
  v.object({
    operationId,
    kind: v.literal('add_service'),
    serviceType: v.picklist(ADDABLE_SERVICE_TYPES),
    subtype: v.picklist(ADDABLE_SERVICE_SUBTYPES),
    coordinates: v.tuple([coordinate, coordinate]),
    name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120))),
    estimate: scopedEstimate
  }),
  v.object({
    operationId,
    kind: v.literal('upgrade_service'),
    serviceId,
    targetSubtype: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
    estimate: scopedEstimate
  }),
  v.object({
    operationId,
    kind: v.literal('downgrade_service'),
    serviceId,
    targetSubtype: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
    estimate: scopedEstimate
  }),
  v.object({
    operationId,
    kind: v.literal('move_service'),
    serviceId,
    coordinates: v.tuple([coordinate, coordinate]),
    estimate: scopedEstimate
  }),
  v.object({
    operationId,
    kind: v.literal('delete_service'),
    serviceId,
    estimate: scopedEstimate
  })
]);

export const scenarioPreviewRequestSchema = v.object({
  baselineVersion: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  selectedIslandId: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
  operations: v.pipe(v.array(scenarioOperationSchema), v.maxLength(100)),
  proposal: v.optional(
    v.object({
      name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
      capitalLimit: v.pipe(
        v.number(),
        v.check((value: number) => Number.isFinite(value)),
        v.minValue(0),
        v.maxValue(1_000_000_000_000)
      ),
      annualLimit: v.pipe(
        v.number(),
        v.check((value: number) => Number.isFinite(value)),
        v.minValue(0),
        v.maxValue(1_000_000_000_000)
      )
    })
  )
});

export type ScenarioOperation = v.InferOutput<typeof scenarioOperationSchema>;
export type ScenarioPreviewRequest = v.InferOutput<typeof scenarioPreviewRequestSchema>;

export type ScenarioOperationResult = {
  operationId: string;
  kind: ScenarioOperation['kind'];
  serviceId: string;
  status: 'applied';
  message: string;
};

export type ScenarioPreviewResponse = Omit<IslandServicesResponse, 'status'> & {
  status: 'draft';
  draftOnly: true;
  persisted: false;
  baselineVersion: string;
  selectedIslandId: string;
  operations: ScenarioOperationResult[];
  serviceChanges: Record<string, IslandServiceChange>;
  proposal: ProposalSettings;
  costs: ProposalCosts;
  impact: ProposalImpact;
  transportPlans: ProposalTransportPlan[];
};
