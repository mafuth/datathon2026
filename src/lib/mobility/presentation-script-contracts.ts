import * as v from 'valibot';

const pauseSchema = v.picklist(['normal', 'pause', 'long']);

const actionSchema = v.variant('type', [
  v.object({ type: v.literal('click'), target: v.string() }),
  v.object({
    type: v.literal('hover'),
    target: v.string(),
    cursorOffset: v.optional(v.tuple([v.number(), v.number()]))
  }),
  v.object({
    type: v.literal('input'),
    target: v.string(),
    text: v.string(),
    textVariants: v.optional(v.array(v.string()))
  }),
  v.object({ type: v.literal('key'), target: v.string(), key: v.string() }),
  v.object({ type: v.literal('scroll'), target: v.string(), amount: v.number() }),
  v.object({ type: v.literal('zoom'), target: v.string(), amount: v.number() }),
  v.object({ type: v.literal('drag'), target: v.string(), to: v.string() }),
  v.object({ type: v.literal('focus-service'), target: v.string() }),
  v.object({ type: v.literal('wait-for-target'), target: v.string() }),
  v.object({ type: v.literal('wait-for-map-idle') }),
  v.object({ type: v.literal('wait-for-tab'), target: v.string() }),
  v.object({
    type: v.literal('wait-for-proposal-state'),
    state: v.picklist(['ready', 'settled', 'transport'])
  }),
  v.object({ type: v.literal('wait-for-journey-section'), sectionId: v.string() }),
  v.object({ type: v.literal('pause-journey') }),
  v.object({ type: v.literal('wait-for-proposal-export') }),
  v.object({ type: v.literal('wait-for-recommendation') }),
  v.object({ type: v.literal('wait'), ms: v.number() })
]);

export const presentationScriptSchema = v.object({
  schemaVersion: v.literal('presentation-script-v1'),
  title: v.string(),
  durationSeconds: v.number(),
  steps: v.array(
    v.object({
      id: v.string(),
      speech: v.object({
        text: v.string(),
        pause: pauseSchema,
        presenterNote: v.optional(v.string())
      }),
      actions: v.array(actionSchema)
    })
  )
});

export type PresentationScript = v.InferOutput<typeof presentationScriptSchema>;
export type PresentationAction = PresentationScript['steps'][number]['actions'][number];
