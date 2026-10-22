import type { PresentationLegTiming, PresentationTimingBasis } from './presentation-story';

import { PRESENTATION_STEPS } from './presentation-story';
import { presentationTimelineForStep } from './presentation-timeline';

export type PresentationJourneyClock = 'patient' | 'staff';
export type PresentationJourneyPart = 'travel' | 'wait' | 'transfer';
export type PresentationJourneySegment = {
  stepId: string;
  stepIndex: number;
  label: string;
  seconds: number;
  basis: PresentationTimingBasis;
  part: PresentationJourneyPart;
  start: number;
};

const segmentLabels: Record<string, string> = {
  'ferry-baarah-vashafaru': 'Ferry to Vashafaru',
  'ferry-vashafaru-dhihdhoo': 'Ferry to Dhihdhoo',
  'wait-dhihdhoo': 'Dhihdhoo connection wait',
  'ferry-dhihdhoo-hanimaadhoo': 'Ferry to Hanimaadhoo',
  'airport-connection': 'Airport transfer + check-in',
  'flight-to-hulhule': 'Flight to Velana',
  'staff-walk-to-stop': 'Walk to bus stop',
  'staff-wait-for-bus': 'R9 bus wait',
  'staff-bus-to-airport': 'R9 bus ride',
  'staff-walk-to-terminal': 'Walk to pickup point',
  'road-to-care': 'Road to Tree Top'
};

const waitStepIds = new Set(['wait-dhihdhoo', 'staff-wait-for-bus']);

function buildSegments(clock: PresentationJourneyClock): PresentationJourneySegment[] {
  let start = 0;
  return PRESENTATION_STEPS.flatMap((step, stepIndex) => {
    const timing = step.timing?.[clock];
    if (
      !timing ||
      timing.seconds === null ||
      !Number.isFinite(timing.seconds) ||
      timing.seconds < 0 ||
      timing.basis === 'unknown'
    )
      return [];
    const segment: PresentationJourneySegment = {
      stepId: step.id,
      stepIndex,
      label: segmentLabels[step.id] ?? timing.label,
      seconds: timing.seconds,
      basis: timing.basis,
      part: waitStepIds.has(step.id) ? 'wait' : step.id === 'airport-connection' ? 'transfer' : 'travel',
      start
    };
    start += timing.seconds;
    return [segment];
  });
}

export const PRESENTATION_JOURNEY_SEGMENTS = {
  patient: buildSegments('patient'),
  staff: buildSegments('staff')
} satisfies Record<PresentationJourneyClock, PresentationJourneySegment[]>;

const totalKnownSeconds = {
  patient: PRESENTATION_JOURNEY_SEGMENTS.patient.reduce((total, segment) => total + segment.seconds, 0),
  staff: PRESENTATION_JOURNEY_SEGMENTS.staff.reduce((total, segment) => total + segment.seconds, 0)
};
const stepWaits = new Map(
  PRESENTATION_STEPS.map((step, stepIndex) => {
    const waits = (clock: PresentationJourneyClock): { before: number; current: number } => {
      const segments = PRESENTATION_JOURNEY_SEGMENTS[clock].filter((segment) => segment.part === 'wait');
      return {
        before: segments.reduce((total, segment) => total + (segment.stepIndex < stepIndex ? segment.seconds : 0), 0),
        current: segments.find((segment) => segment.stepIndex === stepIndex)?.seconds ?? 0
      };
    };
    return [step.id, { stepIndex, patient: waits('patient'), staff: waits('staff') }] as const;
  })
);

export function presentationJourneySummary(
  stepId: string,
  progress = 1
): {
  stepIndex: number;
  progress: number;
  patientWaitSeconds: number;
  staffWaitSeconds: number;
  patientTotalKnownSeconds: number;
  staffTotalKnownSeconds: number;
  patientElapsedSeconds: number;
  staffElapsedSeconds: number | null;
  patientIncomplete: boolean;
  staffIncomplete: boolean;
  currentLeg: PresentationLegTiming | null;
  currentClock: PresentationJourneyClock | null;
  currentIsWait: boolean;
} {
  const waits = stepWaits.get(stepId);
  const stepIndex = waits?.stepIndex ?? -1;
  const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const timeline = presentationTimelineForStep(stepId, fraction);
  const currentClock = timeline.staffCurrentLeg ? 'staff' : timeline.patientCurrentLeg ? 'patient' : null;

  return {
    stepIndex,
    progress: fraction,
    patientWaitSeconds: waits ? waits.patient.before + waits.patient.current * fraction : 0,
    staffWaitSeconds: waits ? waits.staff.before + waits.staff.current * fraction : 0,
    patientTotalKnownSeconds: totalKnownSeconds.patient,
    staffTotalKnownSeconds: totalKnownSeconds.staff,
    patientElapsedSeconds: timeline.patientElapsedSeconds,
    staffElapsedSeconds: timeline.staffElapsedSeconds,
    patientIncomplete: timeline.patientTimingIncomplete,
    staffIncomplete: timeline.staffTimingIncomplete,
    currentLeg: timeline.staffCurrentLeg ?? timeline.patientCurrentLeg,
    currentClock,
    currentIsWait: waitStepIds.has(stepId)
  };
}
