import type { PresentationStep } from './presentation-story';

import { PRESENTATION_STEPS } from './presentation-story';

export type PresentationMode = 'presentation' | 'reader';

export class PresentationController {
  readonly steps = PRESENTATION_STEPS;
  readonly totalSteps = PRESENTATION_STEPS.length;
  mode = $state<PresentationMode | null>(null);
  active = $derived(this.mode !== null);
  stepIndex = $state(0);
  currentStep = $derived(this.steps[this.stepIndex] ?? this.steps[0]!);

  enter(mode: PresentationMode = 'presentation'): void {
    if (this.mode === null) this.stepIndex = 0;
    this.mode = mode;
  }

  exit(): void {
    this.mode = null;
    this.stepIndex = 0;
  }

  toggle(mode: PresentationMode): void {
    if (this.mode === mode) this.exit();
    else this.enter(mode);
  }

  next(): void {
    if (!this.active) return;
    this.stepIndex = Math.min(this.stepIndex + 1, this.totalSteps - 1);
  }

  previous(): void {
    if (!this.active) return;
    this.stepIndex = Math.max(this.stepIndex - 1, 0);
  }

  restart(): void {
    if (!this.active) return;
    this.stepIndex = 0;
  }

  handleKeydown(event: KeyboardEvent): void {
    const target = event.target;
    const isEditable =
      (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) ||
      (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) ||
      (typeof HTMLSelectElement !== 'undefined' && target instanceof HTMLSelectElement) ||
      (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && target.isContentEditable);
    const isReaderScrollTarget =
      typeof HTMLElement !== 'undefined' &&
      target instanceof HTMLElement &&
      target.closest('[data-presentation-reader]') !== null;

    if (isEditable) return;

    if (isReaderScrollTarget && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) return;

    if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.toggle('presentation');
      return;
    }

    if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      this.toggle('reader');
      return;
    }

    if (!this.active) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.exit();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      this.next();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      this.previous();
      return;
    }
    if (event.key.toLowerCase() === 'r' || event.key === 'Home') {
      event.preventDefault();
      this.restart();
    }
  }
}

export type { PresentationStep };
