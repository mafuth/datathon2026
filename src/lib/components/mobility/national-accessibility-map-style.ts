export type ZoomStop = readonly [number, number];

export const NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM = 7.4;
export const NATIONAL_ISLAND_FILL_START_ZOOM = 5.8;

export const NATIONAL_SCORE_FIELD_OPACITY_STOPS = [
  [4.4, 0.58],
  [NATIONAL_ISLAND_FILL_START_ZOOM, 0.46],
  [NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM, 0]
] as const satisfies readonly ZoomStop[];

export const NATIONAL_ISLAND_FILL_OPACITY_STOPS = [
  [NATIONAL_ISLAND_FILL_START_ZOOM, 0.18],
  [NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM, 0.92]
] as const satisfies readonly ZoomStop[];

export function buildZoomInterpolation(stops: readonly ZoomStop[]): unknown[] {
  return ['interpolate', ['linear'], ['zoom'], ...stops.flatMap(([zoom, value]) => [zoom, value])];
}
