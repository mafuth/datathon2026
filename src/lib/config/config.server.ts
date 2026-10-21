import { env } from '$env/dynamic/private';

import type { ConfigSchema } from './config.schema';

import { sessionConfig } from './auth/session.server';
import { config as publicConfig } from './config';
import { challengeConfig } from './security/challenge.server';
import { rateLimitConfig } from './security/rate-limit.server';
import { uploadSigningConfig } from './upload/signing.server';

function configuredDelay(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export const config = {
  ...publicConfig,
  auth: {
    ...publicConfig.auth,
    session: sessionConfig
  },
  security: {
    challenge: challengeConfig,
    rateLimit: rateLimitConfig
  },
  mobility: {
    apiDelayMs: configuredDelay(env.MOBILITY_API_DELAY_MS, publicConfig.mobility.apiDelayMs)
  },
  upload: {
    ...publicConfig.upload,
    signing: uploadSigningConfig
  }
} satisfies ConfigSchema;

export type { ConfigSchema };
