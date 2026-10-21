import type { NewVehicleCount } from '../src/lib/db/models';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Island, VehicleCount } from '../src/lib/db/models';
import db from '../src/lib/server/database';
import { scoringConfig } from '../src/lib/server/scoring/config';

type CsvRow = Record<string, string>;

const inputPath = resolve(
  process.env.VEHICLE_COUNT_IMPORT_PATH ??
    'data/mobility/derived/vehicles/vehicles-by-island-category.population-area-blend-20261021.csv'
);

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }

  const header = rows.shift()?.map((value) => value.replace(/^\uFEFF/, '').trim());
  if (!header || header.length === 0) throw new Error(`Vehicle-count CSV is missing a header: ${inputPath}`);

  return rows.map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new Error(`Vehicle-count CSV row ${rowIndex + 2} has ${values.length} fields; expected ${header.length}.`);
    }
    return Object.fromEntries(header.map((key, index) => [key, values[index]?.trim() ?? ''])) as CsvRow;
  });
}

function requiredField(row: CsvRow, field: string, rowNumber: number): string {
  const value = row[field];
  if (!value) throw new Error(`Vehicle-count CSV row ${rowNumber} is missing ${field}.`);
  return value;
}

function nonNegativeInteger(value: string, field: string, rowNumber: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`Vehicle-count CSV row ${rowNumber} has an invalid ${field}: ${value}.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Vehicle-count CSV row ${rowNumber} has an invalid non-negative integer ${field}: ${value}.`);
  }
  return parsed;
}

async function insertChunks(
  rows: NewVehicleCount[],
  insert: (chunk: NewVehicleCount[]) => Promise<void>
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 250) {
    await insert(rows.slice(offset, offset + 250));
  }
}

const rows = parseCsv(readFileSync(inputPath, 'utf8'));
const allowedCategories = new Set(Object.keys(scoringConfig.sustainability.vehicleCategoryPollutionFactors));
const islandRows = await db.select({ id: Island.id }).from(Island);
const islandIds = new Set(islandRows.map((row) => row.id));
const seenKeys = new Set<string>();
const vehicleCounts: NewVehicleCount[] = rows.map((row, index) => {
  const rowNumber = index + 2;
  const islandId = requiredField(row, 'island_id', rowNumber);
  const category = requiredField(row, 'vehicle_category', rowNumber);
  const total = nonNegativeInteger(requiredField(row, 'amount', rowNumber), 'amount', rowNumber);
  if (!islandIds.has(islandId))
    throw new Error(`Vehicle-count CSV row ${rowNumber} references unknown island ID: ${islandId}.`);
  if (!allowedCategories.has(category)) {
    throw new Error(`Vehicle-count CSV row ${rowNumber} has an unsupported vehicle category: ${category}.`);
  }
  const key = `${islandId}:${category}`;
  if (seenKeys.has(key)) throw new Error(`Vehicle-count CSV contains duplicate island/category row: ${key}.`);
  seenKeys.add(key);
  return { islandId, category, total };
});

if (vehicleCounts.length === 0) throw new Error(`Vehicle-count CSV contains no data rows: ${inputPath}`);

// Aggregate total rows and detailed category rows use independent allocation
// heuristics, so they are retained separately instead of compared per island.

await db.transaction(async (tx) => {
  await tx.delete(VehicleCount);
  await insertChunks(vehicleCounts, async (chunk) => {
    await tx.insert(VehicleCount).values(chunk);
  });
});

console.log(
  JSON.stringify(
    {
      input: inputPath,
      replacedTable: 'vehicle_count',
      rows: vehicleCounts.length,
      islands: new Set(vehicleCounts.map((row) => row.islandId)).size,
      categories: [...new Set(vehicleCounts.map((row) => row.category))].sort()
    },
    null,
    2
  )
);
