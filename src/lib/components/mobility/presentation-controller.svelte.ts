import type { PresentationStep } from './presentation-story';

import { PRESENTATION_STEPS } from './presentation-story';

export class PresentationController {
  readonly steps = PRESENTATION_STEPS;
  readonly totalSteps = PRESENTATION_STEPS.length;
  active = $state(false);
  stepIndex = $state(0);
  currentStep = $derived(this.steps[this.stepIndex] ?? this.steps[0]!);

  enter(): void {
    this.stepIndex = 0;
    this.active = true;
  }

  exit(): void {
    this.active = false;
    this.stepIndex = 0;
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
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
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    if (
      (event.key.toLowerCase() === 'p' || event.key.toLowerCase() === 'l') &&
      event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      this.toggle();
      return;
    }

    if (!this.active || isEditable) return;

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
