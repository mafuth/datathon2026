import type { IslandServiceChange, IslandServicesResponse } from '$components/mobility/island-services';

import * as v from 'valibot';

import { ADDABLE_SERVICE_SUBTYPES, ADDABLE_SERVICE_TYPES } from './service-catalog';

const operationId = v.pipe(v.string(), v.minLength(1), v.maxLength(80));
const serviceId = v.pipe(v.string(), v.minLength(1), v.maxLength(160));
const coordinate = v.pipe(v.number(), v.check(Number.isFinite, 'Coordinate must be finite.'));

export const scenarioOperationSchema = v.variant('kind', [
  v.object({
    operationId,
    kind: v.literal('add_service'),
    serviceType: v.picklist(ADDABLE_SERVICE_TYPES),
    subtype: v.picklist(ADDABLE_SERVICE_SUBTYPES),
    coordinates: v.tuple([coordinate, coordinate]),
    name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)))
  }),
  v.object({
    operationId,
    kind: v.literal('upgrade_service'),
    serviceId,
    targetSubtype: v.pipe(v.string(), v.minLength(1), v.maxLength(80))
  }),
  v.object({
    operationId,
    kind: v.literal('move_service'),
    serviceId,
    coordinates: v.tuple([coordinate, coordinate])
  }),
  v.object({
    operationId,
    kind: v.literal('delete_service'),
    serviceId
  })
]);

export const scenarioPreviewRequestSchema = v.object({
  baselineVersion: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  selectedIslandId: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
  operations: v.pipe(v.array(scenarioOperationSchema), v.maxLength(100))
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
};
