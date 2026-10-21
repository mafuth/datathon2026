import { dev } from '$app/environment';

import { config } from '$config/server';

export async function waitForMobilityApiDelay(): Promise<void> {
  if (!dev) return;

  const delay = config.mobility.apiDelayMs;
  if (delay === 0) return;

  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}
