import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: process.env.PLAYWRIGHT_USE_EXISTING_SERVER
    ? undefined
    : {
        command: 'vite build && vite preview',
        port: 4173
      },
  testDir: 'tests/e2e'
});
