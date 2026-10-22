import type { Handle } from '@sveltejs/kit';

import { building } from '$app/environment';

import { getSessionCookie } from 'better-auth/cookies';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';

import { config } from '$config/server';

export const handle: Handle = async ({ event, resolve }) => {
  // Use Better Auth's parser so both secure and development session cookies work.
  // Anonymous map/data requests do not need to enter the session lookup pipeline.
  const hasCredentials =
    getSessionCookie(event.request, { cookiePrefix: config.auth.session.cookiePrefix }) !== null ||
    event.request.headers.has('authorization');
  const session = hasCredentials ? await auth.api.getSession({ headers: event.request.headers }) : null;
  if (session) {
    event.locals.session = session.session;
    event.locals.user = session.user;
  } else {
    event.locals.session = null;
    event.locals.user = null;
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
