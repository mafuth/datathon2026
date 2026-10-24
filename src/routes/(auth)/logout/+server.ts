import type { RequestHandler } from '@sveltejs/kit';

import { redirect } from 'sveltekit-flash-message/server';

import { auth, requireAuth } from '$lib/server/auth';
import { getSafeChallengeNext } from '$lib/server/security';
import { appPath } from '$lib/utils/app-path';

import * as m from '$messages';

export const POST: RequestHandler = async (event) => {
  requireAuth();

  const redirectTo = getSafeRedirectTo(await event.request.formData());

  try {
    await auth.api.signOut({
      headers: event.request.headers
    });
  } catch (error) {
    console.log(error);
    redirect(
      appPath('/'),
      {
        status: 500,
        type: 'error',
        message: m.general.error
      },
      event
    );
  }
  redirect(
    redirectTo,
    {
      status: 303,
      type: 'success',
      message: m.auth.logout.success
    },
    event
  );
};

function getSafeRedirectTo(formData: FormData): string {
  const redirectTo = formData.get('redirectTo');

  return getSafeChallengeNext(typeof redirectTo === 'string' ? redirectTo : undefined, '/');
}
