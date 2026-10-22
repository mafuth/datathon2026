import type { PresentationLegTiming, PresentationStep } from './presentation-story';

import { PRESENTATION_STEPS } from './presentation-story';

export type PresentationTimeline = {
  patientElapsedSeconds: number;
  staffElapsedSeconds: number | null;
  patientClockLabel: 'Arriving from Baarah to Hulhumalé';
  staffClockLabel: 'Airport pickup';
  patientTimingIncomplete: boolean;
  staffTimingIncomplete: boolean;
  timingIncomplete: boolean;
  patientIncludesEstimates: boolean;
  staffIncludesEstimates: boolean;
  patientCurrentLeg: PresentationLegTiming | null;
  staffCurrentLeg: PresentationLegTiming | null;
  patientTimingNote: string | null;
  staffTimingNote: string | null;
};

function calculateTimeline(
  stepId: string,
  progress = 1,
  steps: readonly PresentationStep[] = PRESENTATION_STEPS
): PresentationTimeline {
  const index = steps.findIndex((step) => step.id === stepId);
  const fraction = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  const elapsed = { patient: 0, staff: 0 };
  const incomplete = { patient: false, staff: false };
  const estimated = { patient: false, staff: false };
  const notes: { patient: string[]; staff: string[] } = { patient: [], staff: [] };
  let staffStarted = false;

  for (let position = 0; position <= index; position += 1) {
    const timing = steps[position].timing;
    if (!timing) continue;
    for (const clock of ['patient', 'staff'] as const) {
      const leg = timing[clock];
      const unconfirmed = timing.unconfirmed?.[clock];
      if (clock === 'staff' && (leg || unconfirmed)) staffStarted = true;
      if (unconfirmed) {
        incomplete[clock] = true;
        notes[clock].push(unconfirmed);
      }
      if (!leg) continue;
      if (leg.seconds === null || !Number.isFinite(leg.seconds) || leg.seconds < 0 || leg.basis === 'unknown') {
        incomplete[clock] = true;
        notes[clock].push(leg.label);
        continue;
      }
      elapsed[clock] += leg.seconds * (position === index ? fraction : 1);
      estimated[clock] ||= leg.basis === 'estimate';
    }
  }

  return {
    patientElapsedSeconds: elapsed.patient,
    staffElapsedSeconds: staffStarted ? elapsed.staff : null,
    patientClockLabel: 'Arriving from Baarah to Hulhumalé',
    staffClockLabel: 'Airport pickup',
    patientTimingIncomplete: incomplete.patient,
    staffTimingIncomplete: incomplete.staff,
    timingIncomplete: incomplete.patient || incomplete.staff,
    patientIncludesEstimates: estimated.patient,
    staffIncludesEstimates: estimated.staff,
    patientCurrentLeg: index >= 0 ? (steps[index].timing?.patient ?? null) : null,
    staffCurrentLeg: index >= 0 ? (steps[index].timing?.staff ?? null) : null,
    patientTimingNote: notes.patient.length ? [...new Set(notes.patient)].join(' · ') : null,
    staffTimingNote: notes.staff.length ? [...new Set(notes.staff)].join(' · ') : null
  };
}

const storyStarts = new Map(PRESENTATION_STEPS.map((step) => [step.id, calculateTimeline(step.id, 0)]));

function elapsedLegSeconds(leg: PresentationLegTiming | null, fraction: number): number {
  if (!leg || leg.seconds === null || !Number.isFinite(leg.seconds) || leg.seconds < 0 || leg.basis === 'unknown')
    return 0;
  return leg.seconds * fraction;
}

/** Derive from story position, so back, restart and interrupted animations cannot accumulate time. */
export function presentationTimelineForStep(
  stepId: string,
  progress = 1,
  steps: readonly PresentationStep[] = PRESENTATION_STEPS
): PresentationTimeline {
  const start = steps === PRESENTATION_STEPS ? storyStarts.get(stepId) : null;
  if (!start) return calculateTimeline(stepId, progress, steps);
  const fraction = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  return {
    ...start,
    patientElapsedSeconds: start.patientElapsedSeconds + elapsedLegSeconds(start.patientCurrentLeg, fraction),
    staffElapsedSeconds:
      start.staffElapsedSeconds === null
        ? null
        : start.staffElapsedSeconds + elapsedLegSeconds(start.staffCurrentLeg, fraction)
  };
}
