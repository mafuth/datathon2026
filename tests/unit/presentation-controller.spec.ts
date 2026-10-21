import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import { PresentationController } from '../../src/lib/components/mobility/presentation-controller.svelte';
import { PRESENTATION_STEPS } from '../../src/lib/components/mobility/presentation-story';

function keydown(key: string, shiftKey = false): KeyboardEvent {
  return {
    key,
    shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: null,
    preventDefault: vi.fn()
  } as unknown as KeyboardEvent;
}

describe('presentation controller modes', () => {
  it('separates clean presentation mode from reader mode without resetting the story step', () => {
    const controller = new PresentationController();

    controller.handleKeydown(keydown('p', true));
    flushSync();
    expect(controller.mode).toBe('presentation');
    expect(controller.active).toBe(true);

    controller.next();
    flushSync();
    expect(controller.stepIndex).toBe(1);

    controller.handleKeydown(keydown('l', true));
    flushSync();
    expect(controller.mode).toBe('reader');
    expect(controller.stepIndex).toBe(1);

    controller.handleKeydown(keydown('p', true));
    flushSync();
    expect(controller.mode).toBe('presentation');
    expect(controller.stepIndex).toBe(1);
  });

  it('exits only when the active shortcut is pressed again', () => {
    const controller = new PresentationController();

    controller.handleKeydown(keydown('l', true));
    flushSync();
    expect(controller.mode).toBe('reader');

    controller.handleKeydown(keydown('l', true));
    flushSync();
    expect(controller.mode).toBeNull();
    expect(controller.active).toBe(false);
    expect(controller.stepIndex).toBe(0);
  });

  it('keeps travel slides unselected until their arrival island is activated', () => {
    expect(PRESENTATION_STEPS.filter((step) => step.journey).every((step) => step.selectedIslandId === null)).toBe(
      true
    );
  });
});
