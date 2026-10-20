import { PUBLIC_APP_NAME } from '$env/static/public';

import type { AppConfig } from '../config.schema';

export const appConfig: AppConfig = {
  name: PUBLIC_APP_NAME,
  description: 'the ultimate mise en place for your next SvelteKit project 🚀'
};
