import type { PresentationAction } from '$lib/mobility/presentation-script-contracts';

export type PresentationActionRuntime = {
  panMap?: (delta: [number, number], duration: number) => void;
  focusService?: (target: string) => Promise<boolean>;
  waitForMapIdle?: () => Promise<boolean>;
  waitForProposalState?: (state: 'ready' | 'settled' | 'transport') => Promise<boolean>;
  waitForJourneySection?: (sectionId: string) => Promise<boolean>;
  pauseJourney?: () => Promise<void> | void;
  waitForProposalExport?: () => Promise<boolean>;
  waitForRecommendation?: () => Promise<boolean>;
};

const DEFAULT_TARGET_TIMEOUT = 3500;
const FOCUS_TARGET_TIMEOUT = 7000;
const CONNECTION_ROUTE_TARGET_TIMEOUT = 120_000;

export function presentationTarget(id: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>(`[data-presentation-target="${CSS.escape(id)}"]`)].find((target) =>
      isRendered(target)
    ) ?? null
  );
}

function isRendered(target: HTMLElement): boolean {
  const styles = getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  if (styles.display === 'none' || styles.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;

  let current: HTMLElement | null = target;
  while (current) {
    if (current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true') return false;
    current = current.parentElement;
  }

  return true;
}

function isEnabled(target: HTMLElement): boolean {
  return (
    !(
      (target instanceof HTMLButtonElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement) &&
      target.disabled
    ) && target.getAttribute('aria-disabled') !== 'true'
  );
}

export async function waitForPresentationTarget(
  id: string,
  timeout = DEFAULT_TARGET_TIMEOUT,
  requireEnabled = false
): Promise<HTMLElement | null> {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const target = presentationTarget(id);
    if (target && (!requireEnabled || isEnabled(target))) return target;
    await wait(100);
  }
  return null;
}

export async function waitForPresentationTab(id: string, timeout = DEFAULT_TARGET_TIMEOUT): Promise<boolean> {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const target = presentationTarget(id);
    if (target && (target.getAttribute('data-state') === 'active' || target.getAttribute('aria-selected') === 'true'))
      return true;
    await wait(80);
  }
  return false;
}

export function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, milliseconds)));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pointOnCubic(
  t: number,
  from: [number, number],
  controlOne: [number, number],
  controlTwo: [number, number],
  to: [number, number]
): [number, number] {
  const inverse = 1 - t;
  return [
    inverse ** 3 * from[0] +
      3 * inverse ** 2 * t * controlOne[0] +
      3 * inverse * t ** 2 * controlTwo[0] +
      t ** 3 * to[0],
    inverse ** 3 * from[1] +
      3 * inverse ** 2 * t * controlOne[1] +
      3 * inverse * t ** 2 * controlTwo[1] +
      t ** 3 * to[1]
  ];
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function scrollableParent(target: HTMLElement): HTMLElement | null {
  let parent = target.parentElement;
  while (parent && parent !== document.body) {
    const styles = getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(`${styles.overflowY} ${styles.overflowX}`)) {
      if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

async function centerPresentationTarget(target: HTMLElement): Promise<void> {
  const parent = scrollableParent(target);
  if (parent) {
    const targetRect = target.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    parent.scrollBy({
      top: targetRect.top + targetRect.height / 2 - (parentRect.top + parentRect.height / 2),
      left: targetRect.left + targetRect.width / 2 - (parentRect.left + parentRect.width / 2),
      behavior: 'smooth'
    });
  } else {
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }
  await wait(300);
}

function naturalDelay(character: string): number {
  const base = randomBetween(42, 108);
  if (character === ' ') return base + randomBetween(20, 70);
  if (/[,.!?;:]/.test(character)) return base + randomBetween(100, 240);
  return base;
}

function keyForCharacter(character: string): { key: string; code: string; shift: boolean } {
  const shift = character !== character.toLowerCase() || '~!@#$%^&*()_+{}|:"<>?'.includes(character);
  const lower = character.toLowerCase();
  const code = /^[a-z]$/.test(lower) ? `Key${lower.toUpperCase()}` : /^\d$/.test(lower) ? `Digit${lower}` : '';
  return { key: character, code, shift };
}

function dispatchKeyboardEvent(
  target: HTMLInputElement | HTMLTextAreaElement,
  type: 'keydown' | 'keyup',
  character: string
): void {
  const key = keyForCharacter(character);
  target.dispatchEvent(
    new KeyboardEvent(type, {
      key: key.key,
      code: key.code,
      shiftKey: key.shift,
      bubbles: true,
      cancelable: true
    })
  );
}

function dispatchInput(
  target: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  inputType: string,
  data: string | null
): void {
  target.value = value;
  target.dispatchEvent(new InputEvent('input', { bubbles: true, data, inputType }));
}

async function typeNaturally(target: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
  target.focus();
  target.select();
  dispatchInput(target, '', 'deleteContentBackward', null);

  for (const character of text) {
    // A rare typo followed by a correction creates a human rhythm without changing the final text.
    if (/[a-z]/i.test(character) && Math.random() < 0.035) {
      const typo = String.fromCharCode(97 + Math.floor(Math.random() * 26));
      dispatchKeyboardEvent(target, 'keydown', typo);
      dispatchInput(target, `${target.value}${typo}`, 'insertText', typo);
      dispatchKeyboardEvent(target, 'keyup', typo);
      await wait(randomBetween(80, 180));
      dispatchKeyboardEvent(target, 'keydown', 'Backspace');
      dispatchInput(target, target.value.slice(0, -1), 'deleteContentBackward', null);
      dispatchKeyboardEvent(target, 'keyup', 'Backspace');
      await wait(randomBetween(80, 160));
    }

    dispatchKeyboardEvent(target, 'keydown', character);
    dispatchInput(target, `${target.value}${character}`, 'insertText', character);
    dispatchKeyboardEvent(target, 'keyup', character);
    await wait(naturalDelay(character));

    if (Math.random() < 0.035) await wait(randomBetween(180, 420));
  }
}

export async function moveCursorTo(target: HTMLElement, cursorOffset: [number, number] = [0, 0]): Promise<void> {
  const cursor = document.querySelector<HTMLElement>('[data-presentation-cursor]');
  if (!cursor) return;
  const rect = target.getBoundingClientRect();
  const from = [
    Number.parseFloat(cursor.style.left) || window.innerWidth / 2,
    Number.parseFloat(cursor.style.top) || window.innerHeight / 2
  ] as [number, number];
  const to: [number, number] = [
    Math.min(window.innerWidth - 8, Math.max(8, rect.left + rect.width * randomBetween(0.32, 0.68) + cursorOffset[0])),
    Math.min(window.innerHeight - 8, Math.max(8, rect.top + rect.height * randomBetween(0.32, 0.68) + cursorOffset[1]))
  ];
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const bend = Math.min(170, Math.max(28, distance * randomBetween(0.12, 0.28)));
  const direction = Math.random() > 0.5 ? 1 : -1;
  const controlOne: [number, number] = [
    from[0] + (to[0] - from[0]) * 0.28 + direction * randomBetween(-bend, bend),
    from[1] + (to[1] - from[1]) * 0.28 + direction * randomBetween(-bend, bend)
  ];
  const controlTwo: [number, number] = [
    from[0] + (to[0] - from[0]) * 0.74 - direction * randomBetween(-bend, bend),
    from[1] + (to[1] - from[1]) * 0.74 - direction * randomBetween(-bend, bend)
  ];
  const duration = Math.min(1100, Math.max(320, 250 + distance * randomBetween(0.58, 0.9)));
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const frame = (time: number) => {
      const progress = Math.min(1, (time - started) / duration);
      const eased = easeInOutCubic(progress);
      const point = pointOnCubic(eased, from, controlOne, controlTwo, to);
      const jitter = progress < 0.84 ? randomBetween(-1.4, 1.4) : randomBetween(-0.45, 0.45);
      cursor.style.left = `${point[0] + jitter}px`;
      cursor.style.top = `${point[1] + jitter}px`;
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  await wait(randomBetween(70, 180));
}

export async function runPresentationAction(
  action: PresentationAction,
  runtime: PresentationActionRuntime = {}
): Promise<boolean> {
  if (action.type === 'wait') {
    await wait(action.ms);
    return true;
  }
  if (action.type === 'focus-service') {
    const mapTarget = await waitForPresentationTarget('map-canvas', DEFAULT_TARGET_TIMEOUT);
    if (mapTarget) {
      await moveCursorTo(mapTarget);
      await wait(randomBetween(120, 240));
    }
    const focused = await (runtime.focusService?.(action.target) ?? Promise.resolve(false));
    if (!focused) return false;
    let serviceMarker = await waitForPresentationTarget(action.target, FOCUS_TARGET_TIMEOUT, true);
    if (!serviceMarker) return false;
    await centerPresentationTarget(serviceMarker);
    serviceMarker = presentationTarget(action.target) ?? serviceMarker;
    await moveCursorTo(serviceMarker);
    await wait(randomBetween(120, 240));
    const markerRect = serviceMarker.getBoundingClientRect();
    const clientX = markerRect.left + markerRect.width / 2;
    const clientY = markerRect.top + markerRect.height / 2;
    serviceMarker.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX, clientY, pointerType: 'mouse' })
    );
    serviceMarker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX, clientY, button: 0 }));
    await wait(randomBetween(90, 180));
    serviceMarker.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX, clientY, button: 0 }));
    serviceMarker.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX, clientY, pointerType: 'mouse' })
    );
    serviceMarker.click();
    serviceMarker.classList.add('presentation-click-pulse');
    window.setTimeout(() => serviceMarker.classList.remove('presentation-click-pulse'), 280);
    return true;
  }
  if (action.type === 'wait-for-target')
    return (
      (await waitForPresentationTarget(
        action.target,
        action.target === 'simulate-journey' ? CONNECTION_ROUTE_TARGET_TIMEOUT : DEFAULT_TARGET_TIMEOUT
      )) !== null
    );
  if (action.type === 'wait-for-map-idle') return runtime.waitForMapIdle?.() ?? false;
  if (action.type === 'wait-for-tab') return waitForPresentationTab(action.target);
  if (action.type === 'wait-for-proposal-state') return runtime.waitForProposalState?.(action.state) ?? false;
  if (action.type === 'wait-for-journey-section') {
    return runtime.waitForJourneySection?.(action.sectionId) ?? false;
  }
  if (action.type === 'pause-journey') {
    await runtime.pauseJourney?.();
    return true;
  }
  if (action.type === 'wait-for-proposal-export') {
    return runtime.waitForProposalExport?.() ?? false;
  }
  if (action.type === 'wait-for-recommendation') {
    return runtime.waitForRecommendation?.() ?? false;
  }
  let target = await waitForPresentationTarget(
    action.target,
    action.target === 'simulate-journey'
      ? CONNECTION_ROUTE_TARGET_TIMEOUT
      : action.target === 'baarah-health-centre' || action.target === 'tree-top-marker'
        ? FOCUS_TARGET_TIMEOUT
        : DEFAULT_TARGET_TIMEOUT,
    action.type === 'click' || action.type === 'input' || action.type === 'key'
  );
  if (!target) return false;
  if (!isEnabled(target) && (action.type === 'click' || action.type === 'input' || action.type === 'key')) return false;
  const scrollParentBeforeCenter = action.type === 'scroll' ? scrollableParent(target) : null;
  if (action.type === 'scroll') {
    await moveCursorTo(scrollParentBeforeCenter ?? target);
    await wait(randomBetween(80, 220));
  }
  await centerPresentationTarget(target);
  target = presentationTarget(action.target) ?? target;
  if (!isEnabled(target) && (action.type === 'click' || action.type === 'input' || action.type === 'key')) return false;
  if (action.type !== 'scroll') await moveCursorTo(target, action.type === 'hover' ? action.cursorOffset : undefined);
  await wait(randomBetween(80, 220));
  if (action.type === 'hover') {
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerType: 'mouse'
      })
    );
    target.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    return true;
  }
  if (action.type === 'scroll') {
    const scrollParent = scrollableParent(target);
    if (scrollParent) scrollParent.scrollBy({ top: action.amount, behavior: 'smooth' });
    await wait(260);
    await centerPresentationTarget(target);
    await moveCursorTo(target);
    return true;
  }
  if (action.type === 'drag') {
    const destination = await waitForPresentationTarget(action.to, 12000);
    if (!destination) return false;
    const mapRect = target.getBoundingClientRect();
    const markerRect = destination.getBoundingClientRect();
    const startX = markerRect.left + markerRect.width / 2;
    const startY = markerRect.top + markerRect.height / 2;
    const compact = mapRect.width <= 640;
    const endX = mapRect.left + mapRect.width * (compact ? 0.5 : 0.42);
    const endY = mapRect.top + mapRect.height * (compact ? 0.36 : 0.4);
    const cursor = document.querySelector<HTMLElement>('[data-presentation-cursor]');

    await moveCursorTo(destination);
    await wait(120);
    const started = performance.now();
    runtime.panMap?.([startX - endX, startY - endY], 950);
    await new Promise<void>((resolve) => {
      const frame = (time: number) => {
        const progress = Math.min(1, (time - started) / 950);
        const eased = easeInOutCubic(progress);
        const x = startX + (endX - startX) * eased;
        const y = startY + (endY - startY) * eased;
        if (cursor) {
          cursor.style.left = `${x + randomBetween(-0.8, 0.8)}px`;
          cursor.style.top = `${y + randomBetween(-0.8, 0.8)}px`;
        }
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    await wait(450);
    return true;
  }
  if (action.type === 'zoom') {
    const amount = Math.max(1, Math.round(action.amount));
    const direction = amount >= 0 ? -1 : 1;
    const zoomTarget = target.querySelector<HTMLCanvasElement>('canvas') ?? target;
    const zoomRect = zoomTarget.getBoundingClientRect();
    for (let index = 0; index < Math.abs(amount); index += 1) {
      zoomTarget.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: zoomRect.left + zoomRect.width / 2,
          clientY: zoomRect.top + zoomRect.height / 2,
          deltaY: direction * 420,
          deltaMode: 0
        })
      );
      await wait(90);
    }
    await wait(420);
    return true;
  }
  if (action.type === 'input') {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
    const text = action.textVariants?.length
      ? action.textVariants[Math.floor(Math.random() * action.textVariants.length)]
      : action.text;
    await typeNaturally(target, text ?? action.text);
    return true;
  }
  if (action.type === 'key') {
    target.focus();
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && action.key === 'Backspace') {
      target.value = target.value.slice(0, -1);
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    }
    target.dispatchEvent(new KeyboardEvent('keydown', { key: action.key, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key: action.key, bubbles: true }));
    return true;
  }
  const targetRect = target.getBoundingClientRect();
  const clientX = targetRect.left + targetRect.width / 2;
  const clientY = targetRect.top + targetRect.height / 2;
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX, clientY, pointerType: 'mouse' }));
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX, clientY }));
  await wait(randomBetween(90, 210));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX, clientY }));
  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX, clientY, pointerType: 'mouse' }));
  target.click();
  target.classList.add('presentation-click-pulse');
  window.setTimeout(() => target.classList.remove('presentation-click-pulse'), 280);
  return true;
}
