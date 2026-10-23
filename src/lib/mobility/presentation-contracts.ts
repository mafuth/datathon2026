import * as v from 'valibot';

export const presentationCoordinateSchema = v.tuple([v.number(), v.number()]);
const geometrySchema = v.object({
  type: v.literal('LineString'),
  coordinates: v.array(presentationCoordinateSchema)
});
const timingBasisSchema = v.picklist(['timetable', 'estimate', 'unknown']);
export const presentationSectionSchema = v.object({
  id: v.string(),
  title: v.string(),
  narration: v.string(),
  camera: v.object({
    fitGeometry: v.string(),
    padding: v.object({ top: v.number(), right: v.number(), bottom: v.number(), left: v.number() }),
    maxZoom: v.number()
  }),
  evidence: v.object({ source: v.string(), basis: timingBasisSchema, label: v.string() }),
  timing: v.object({ seconds: v.nullable(v.number()), basis: timingBasisSchema, pauseAtEnd: v.literal(true) }),
  branch: v.picklist(['patient', 'pickup', 'merged']),
  mode: v.picklist(['ferry', 'wait', 'transfer', 'aircraft', 'walk', 'bus', 'handoff', 'ambulance']),
  trimStartLocationId: v.optional(v.string()),
  trimEndLocationId: v.optional(v.string()),
  geometry: geometrySchema
});
const locationSchema = v.object({ id: v.string(), name: v.string(), coordinates: presentationCoordinateSchema });
export const presentationStorySchema = v.object({
  schemaVersion: v.literal('presentation-story-journey-v1'),
  id: v.string(),
  originIslandId: v.literal('island:640'),
  destinationIslandId: v.literal('island:1442'),
  locations: v.record(v.string(), locationSchema),
  labels: v.array(v.object({ name: v.string(), coordinates: presentationCoordinateSchema })),
  sections: v.array(presentationSectionSchema),
  timeline: v.object({
    patientColor: v.string(),
    destinationColor: v.string(),
    criticalPathSeconds: v.number(),
    criticalPathLabel: v.string(),
    unknownWaits: v.array(v.string()),
    mergeLocationId: v.literal('airport:VRMM')
  })
});

export type PresentationCoordinate = v.InferOutput<typeof presentationCoordinateSchema>;
export type PresentationSection = v.InferOutput<typeof presentationSectionSchema>;
export type PresentationStory = v.InferOutput<typeof presentationStorySchema>;
