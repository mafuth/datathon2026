import type { PresentationStep, PresentationStepTiming } from '../../src/lib/components/mobility/presentation-story';

import { describe, expect, it } from 'vitest';

import pickup from '../../data/mobility/derived/hulhumale-airport-staff-pickup.json';
import { presentationJourneySummary } from '../../src/lib/components/mobility/presentation-journey-summary';
import { PRESENTATION_STEPS } from '../../src/lib/components/mobility/presentation-story';
import { presentationTimelineForStep } from '../../src/lib/components/mobility/presentation-timeline';

function step(id: string, timing?: PresentationStepTiming): PresentationStep {
  return { ...PRESENTATION_STEPS[0], id, timing };
}

function storyStep(id: string): PresentationStep {
  const result = PRESENTATION_STEPS.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing story step: ${id}`);
  return result;
}

describe('presentation journey clocks', () => {
  it('includes connection waits and assumptions in the Baarah to Hulhumalé subtotal without inventing missing waits', () => {
    const expectedMinutes = [
      ['opening', 0],
      ['baarah', 0],
      ['ferry-baarah-vashafaru', 20],
      ['ferry-vashafaru-dhihdhoo', 35],
      ['wait-dhihdhoo', 205],
      ['ferry-dhihdhoo-hanimaadhoo', 230],
      ['airport-connection', 320],
      ['flight-to-hulhule', 365],
      ['staff-walk-to-stop', 365],
      ['staff-wait-for-bus', 365],
      ['staff-bus-to-airport', 365],
      ['staff-walk-to-terminal', 365],
      ['road-to-care', 378],
      ['close', 378]
    ] as const;

    for (const [id, minutes] of expectedMinutes) {
      expect(presentationTimelineForStep(id).patientElapsedSeconds).toBeCloseTo(minutes * 60, 8);
    }
    const final = presentationTimelineForStep('close');
    expect(final.patientTimingIncomplete).toBe(true);
    expect(final.patientTimingNote).toContain('Flight departure wait unknown');
    expect(final.patientTimingNote).toContain('Pickup waiting/handoff unknown');
  });

  it('keeps the independent airport pickup clock separate and advances both clocks only for the shared road leg', () => {
    expect(presentationTimelineForStep('flight-to-hulhule').staffElapsedSeconds).toBeNull();
    expect(presentationTimelineForStep('staff-walk-to-stop', 0).staffElapsedSeconds).toBe(0);
    expect(presentationTimelineForStep('staff-wait-for-bus').staffElapsedSeconds).toBeCloseTo(45 * 60, 8);
    expect(presentationTimelineForStep('staff-bus-to-airport').staffElapsedSeconds).toBeCloseTo(51 * 60, 8);
    const airport = presentationTimelineForStep('staff-walk-to-terminal');
    expect(airport.staffElapsedSeconds).toBeCloseTo(pickup.duration_minutes * 60, 8);
    expect(airport.patientElapsedSeconds).toBe(365 * 60);
    expect(airport.staffTimingIncomplete).toBe(false);

    const roadHalfway = presentationTimelineForStep('road-to-care', 0.5);
    expect(roadHalfway.patientElapsedSeconds).toBeCloseTo((365 + 6.5) * 60, 8);
    expect(roadHalfway.staffElapsedSeconds).toBeCloseTo((pickup.duration_minutes + 6.5) * 60, 8);
    const final = presentationTimelineForStep('close');
    expect(final.staffElapsedSeconds).toBeCloseTo(64.396 * 60, 8);
    expect(final.staffTimingIncomplete).toBe(true);
    expect(final.staffTimingNote).toContain('Pickup handoff/reposition unknown');
    expect(final.patientClockLabel).toBe('Arriving from Baarah to Hulhumalé');
    expect(final.staffClockLabel).toBe('Airport pickup');
  });

  it('interpolates journey and stationary wait minutes continuously across every scene boundary', () => {
    for (let index = 1; index < PRESENTATION_STEPS.length; index += 1) {
      const previous = presentationTimelineForStep(PRESENTATION_STEPS[index - 1].id, 1);
      const current = presentationTimelineForStep(PRESENTATION_STEPS[index].id, 0);
      expect(current.patientElapsedSeconds).toBeCloseTo(previous.patientElapsedSeconds, 8);
      expect(current.staffElapsedSeconds ?? 0).toBeCloseTo(previous.staffElapsedSeconds ?? 0, 8);
    }
    const ferryWait = storyStep('wait-dhihdhoo');
    expect(ferryWait.journey).toBeUndefined();
    expect(ferryWait.mapData.features.every((feature) => feature.geometry.type === 'Point')).toBe(true);
    expect(presentationTimelineForStep(ferryWait.id, 0.5).patientElapsedSeconds).toBe((35 + 85) * 60);
    const busWait = storyStep('staff-wait-for-bus');
    expect(busWait.journey).toBeUndefined();
    expect(presentationTimelineForStep(busWait.id, 0.5).staffElapsedSeconds).toBeCloseTo((13.054 + 31.946 / 2) * 60, 8);
  });

  it('holds explanations and retains estimate and incomplete status after travel ends', () => {
    expect(presentationTimelineForStep('baarah', 0)).toEqual(presentationTimelineForStep('baarah', 1));
    expect(presentationTimelineForStep('close', 0)).toEqual(presentationTimelineForStep('close', 1));
    expect(presentationTimelineForStep('ferry-dhihdhoo-hanimaadhoo').patientIncludesEstimates).toBe(false);
    const connection = presentationTimelineForStep('airport-connection');
    expect(connection.patientIncludesEstimates).toBe(true);
    expect(connection.patientCurrentLeg?.basis).toBe('estimate');
    expect(presentationTimelineForStep('flight-to-hulhule', 0).patientTimingIncomplete).toBe(true);
    const final = presentationTimelineForStep('close');
    expect(final.patientCurrentLeg).toBeNull();
    expect(final.staffCurrentLeg).toBeNull();
    expect(final.patientIncludesEstimates).toBe(true);
    expect(final.staffIncludesEstimates).toBe(true);
    expect(final.timingIncomplete).toBe(true);
  });

  it('keeps unknown or invalid durations out of totals while preserving their evidence gaps', () => {
    const steps = [
      step('known', { patient: { seconds: 120, basis: 'timetable', label: 'Known crossing' } }),
      step('unknown', { patient: { seconds: null, basis: 'unknown', label: 'Departure wait unknown' } }),
      step('nonfinite', {
        staff: { seconds: Number.POSITIVE_INFINITY, basis: 'estimate', label: 'Missing walk time' }
      }),
      step('negative', { staff: { seconds: -10, basis: 'estimate', label: 'Invalid duration' } }),
      step('unspecified', { patient: { seconds: 999, basis: 'unknown', label: 'Departure wait unknown' } }),
      step('held')
    ];
    const result = presentationTimelineForStep('held', 1, steps);
    expect(result.patientElapsedSeconds).toBe(120);
    expect(result.staffElapsedSeconds).toBe(0);
    expect(result.patientTimingIncomplete).toBe(true);
    expect(result.staffTimingIncomplete).toBe(true);
    expect(result.patientTimingNote).toBe('Departure wait unknown');
    expect(result.staffTimingNote).toBe('Missing walk time · Invalid duration');
  });

  it('recomputes previous, restart and interrupted animation positions without accumulated state', () => {
    const interrupted = presentationTimelineForStep('flight-to-hulhule', 0.31);
    presentationTimelineForStep('close');
    expect(presentationTimelineForStep('opening').patientElapsedSeconds).toBe(0);
    expect(presentationTimelineForStep('opening').staffElapsedSeconds).toBeNull();
    expect(presentationTimelineForStep('opening').timingIncomplete).toBe(false);
    expect(presentationTimelineForStep('flight-to-hulhule', 0.31)).toEqual(interrupted);
    expect(presentationTimelineForStep('ferry-baarah-vashafaru', 0.5).patientElapsedSeconds).toBe(10 * 60);
    const unknownStep = presentationTimelineForStep('not-a-step');
    expect(unknownStep.patientElapsedSeconds).toBe(0);
    expect(unknownStep.staffElapsedSeconds).toBeNull();
    expect(unknownStep.timingIncomplete).toBe(false);
  });

  it.each([
    [Number.NaN, 0],
    [Number.NEGATIVE_INFINITY, 0],
    [-1, 0],
    [0.5, 600],
    [2, 1200],
    [Number.POSITIVE_INFINITY, 1200]
  ])('clamps playback progress %s to safe travel seconds', (progress, expected) => {
    expect(presentationTimelineForStep('ferry-baarah-vashafaru', progress).patientElapsedSeconds).toBe(expected);
  });

  it('uses travel durations independently of screen acceleration and reduced-motion playback', () => {
    const differentlyAnimated = PRESENTATION_STEPS.map((current) => ({
      ...current,
      timing: current.timing ? { ...current.timing, playbackDuration: 1 } : undefined,
      journey: current.journey ? { ...current.journey, duration: 999999, startDuration: 1 } : undefined
    }));
    for (const current of PRESENTATION_STEPS) {
      expect(presentationTimelineForStep(current.id, 1, differentlyAnimated)).toEqual(
        presentationTimelineForStep(current.id, 1)
      );
    }
    expect(presentationTimelineForStep('wait-dhihdhoo', 1).patientElapsedSeconds).toBe(205 * 60);
  });

  it('matches uncached custom stories at every scene and playback position without sharing mutable results', () => {
    const customStory = [...PRESENTATION_STEPS];
    for (const current of PRESENTATION_STEPS) {
      for (const progress of [Number.NaN, -1, 0, 0.25, 0.75, 1, 2, Number.POSITIVE_INFINITY]) {
        expect(presentationTimelineForStep(current.id, progress)).toEqual(
          presentationTimelineForStep(current.id, progress, customStory)
        );
      }
    }
    const result = presentationTimelineForStep('close');
    result.patientTimingNote = 'changed by a caller';
    result.patientElapsedSeconds = -1;
    expect(presentationTimelineForStep('close')).toEqual(presentationTimelineForStep('close', 1, customStory));
  });

  it('shows partial connection waits and retains independent known-duration scales throughout playback', () => {
    const patientWait = presentationJourneySummary('wait-dhihdhoo', 0.5);
    expect(patientWait.patientWaitSeconds).toBe(85 * 60);
    expect(patientWait.staffWaitSeconds).toBe(0);
    expect(patientWait.currentIsWait).toBe(true);
    const staffWait = presentationJourneySummary('staff-wait-for-bus', 0.5);
    expect(staffWait.patientWaitSeconds).toBe(170 * 60);
    expect(staffWait.staffWaitSeconds).toBeCloseTo((31.946 * 60) / 2, 8);
    expect(staffWait.patientTotalKnownSeconds).toBe(patientWait.patientTotalKnownSeconds);
    expect(staffWait.staffTotalKnownSeconds).toBe(patientWait.staffTotalKnownSeconds);
    expect(presentationJourneySummary('close').staffWaitSeconds).toBeCloseTo(31.946 * 60, 8);
    const unknown = presentationJourneySummary('not-a-step');
    expect(unknown.stepIndex).toBe(-1);
    expect(unknown.patientWaitSeconds).toBe(0);
    expect(unknown.staffWaitSeconds).toBe(0);
  });
});

describe('transport story evidence', () => {
  it('keeps the story focused and limits outbound modeled demand to relevant island stages', () => {
    expect(PRESENTATION_STEPS.every((current) => current.facts.length <= 3)).toBe(true);
    expect(PRESENTATION_STEPS.every((current) => !current.panel && current.uiTargets.length === 0)).toBe(true);
    expect(
      PRESENTATION_STEPS.filter((current) => current.journey).every((current) => current.selectedIslandId === null)
    ).toBe(true);
    expect(PRESENTATION_STEPS.filter((current) => current.showOutboundDemand).map((current) => current.id)).toEqual([
      'baarah',
      'ferry-baarah-vashafaru',
      'ferry-vashafaru-dhihdhoo',
      'ferry-dhihdhoo-hanimaadhoo'
    ]);
    expect(JSON.stringify(PRESENTATION_STEPS)).not.toMatch(/queue|employment|density|health systems/i);
  });

  it('uses the captured staff paths exactly and keeps the distinct airport anchors disconnected', () => {
    const legs = [
      ['staff-walk-to-stop', pickup.initial_walk],
      ['staff-bus-to-airport', pickup.bus_ride],
      ['staff-walk-to-terminal', pickup.terminal_walk]
    ] as const;
    for (const [id, retained] of legs) {
      const current = storyStep(id);
      const feature = current.mapData.features.find((candidate) => candidate.id === current.journey?.featureId);
      expect(feature?.geometry).toEqual(retained.geometry);
      expect(current.journey?.start.center).toEqual(retained.origin.coordinates);
      expect(current.journey?.end.center).toEqual(retained.destination.coordinates);
      expect(current.timing?.staff?.seconds).toBe(retained.duration_minutes * 60);
    }
    const terminal = storyStep('staff-walk-to-terminal');
    const road = storyStep('road-to-care');
    expect(terminal.journey?.end.center).not.toEqual(road.journey?.start.center);
    expect(road.mapData.features.filter((feature) => feature.geometry.type === 'LineString')).toHaveLength(1);
    expect(road.timing?.unconfirmed?.patient).toBeTruthy();
    expect(road.timing?.unconfirmed?.staff).toBeTruthy();
    expect(road.note).toMatch(/airport.*unconfirmed/i);
    expect(terminal.timing?.staff?.basis).toBe('estimate');
    expect(terminal.note).toMatch(/estimated.*unconfirmed/i);
    expect(storyStep('staff-bus-to-airport').note).toMatch(/schematic/i);
    expect(storyStep('staff-walk-to-stop').note).toMatch(/separate Saturday 10 October 2026/i);
  });
});
