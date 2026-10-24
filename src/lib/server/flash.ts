import { getRequestEvent } from '$app/server';

import { redirect, setFlash } from 'sveltekit-flash-message/server';

import { appPath } from '$lib/utils/app-path';

type FlashType = 'success' | 'error' | 'warning' | 'info';

export function flashAndRedirect(url: string, type: FlashType, message: string, status: 302 | 303 = 303): never {
  const event = getRequestEvent();
  redirect(appPath(url), { status, type, message }, event);
}

export function flash(type: FlashType, message: string) {
  const event = getRequestEvent();
  setFlash({ type, message }, event);
}
