import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const previewAllowedHosts = (process.env.PREVIEW_ALLOWED_HOSTS ?? 'msb.mafuth.online')
  .split(',')
  .map((host) => host.trim())
  .filter((host) => host.length > 0);

export default defineConfig(() => ({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter(),

      experimental: {
        remoteFunctions: true
      },

      alias: {
        '$config/server': 'src/lib/config/config.server.ts',

        $config: 'src/lib/config/config.ts',

        $messages: 'src/lib/config/messages',
        '$messages/*': 'src/lib/config/messages/*',

        $components: 'src/lib/components',
        '$components/*': 'src/lib/components/*',

        $models: 'src/lib/db/models',
        '$models/*': 'src/lib/db/models/*',

        $remote: 'src/lib/remote',
        '$remote/*': 'src/lib/remote/*',

        $queries: 'src/lib/db/queries',
        '$queries/*': 'src/lib/db/queries/*'
      },

      compilerOptions: {
        experimental: {
          async: true
        }
      },

      preprocess: vitePreprocess()
    })
  ],
  preview: {
    allowedHosts: previewAllowedHosts
  },
  ssr: {
    noExternal: ['@xyflow/svelte']
  },
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: './vite.config.ts',
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{js,ts}', 'tests/unit/**/*.{test,spec}.{js,ts}'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'tests/e2e/**']
        }
      }
    ]
  }
}));
