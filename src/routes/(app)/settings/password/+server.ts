import type { RequestHandler } from './$types';

import { redirect } from '@sveltejs/kit';
import { appPath } from '$lib/utils/app-path';

export const GET: RequestHandler = () => {
  redirect(308, appPath('/settings/security'));
};
