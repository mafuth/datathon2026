export class PresentationController {
  active = $state(false);
  sectionIndex = $state(0);
  sectionProgress = $state(0);
  token = $state(0);

  start(): void {
    this.sectionIndex = 0;
    this.sectionProgress = 0;
    this.active = true;
    this.token += 1;
  }

  next(sectionCount: number): void {
    if (!this.active || this.sectionIndex >= sectionCount - 1) return;
    this.sectionIndex += 1;
    this.sectionProgress = 0;
    this.token += 1;
  }

  previous(): void {
    if (!this.active || this.sectionIndex === 0) return;
    this.sectionIndex -= 1;
    this.sectionProgress = 0;
    this.token += 1;
  }

  restart(): void {
    if (!this.active) return;
    this.sectionIndex = 0;
    this.sectionProgress = 0;
    this.token += 1;
  }

  setProgress(progress: number): void {
    this.sectionProgress = Math.min(1, Math.max(0, progress));
  }

  exit(): void {
    this.active = false;
    this.sectionIndex = 0;
    this.sectionProgress = 0;
    this.token += 1;
  }
}
