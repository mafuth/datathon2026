import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  Atoll,
  Island,
  JobLocation,
  Population,
  Service,
  TransportConnection,
  TransportRoute
} from '../src/lib/db/models';
import db from '../src/lib/server/database';

const outputPath = resolve(process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json');
if (existsSync(outputPath) && !process.argv.includes('--force')) {
  throw new Error(
    `Mobility baseline already exists: ${outputPath}. Use --force only after explicitly accepting a new baseline.`
  );
}

const [atolls, islands, population, services, jobLocations, transportRoutes, transportConnections] = await Promise.all([
  db.select().from(Atoll),
  db.select().from(Island),
  db.select().from(Population),
  db.select().from(Service),
  db.select().from(JobLocation),
  db.select().from(TransportRoute),
  db.select().from(TransportConnection)
]);

const artifact = {
  schema_version: 'current-db-mobility-baseline-v1',
  generated_at: new Date().toISOString(),
  source: {
    type: 'accepted-current-database',
    database: 'local.db'
  },
  atolls,
  islands,
  population,
  services,
  jobLocations,
  transportRoutes,
  transportConnections
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      atolls: atolls.length,
      islands: islands.length,
      population: population.length,
      services: services.length,
      jobLocations: jobLocations.length,
      transportRoutes: transportRoutes.length,
      transportConnections: transportConnections.length
    },
    null,
    2
  )
);
