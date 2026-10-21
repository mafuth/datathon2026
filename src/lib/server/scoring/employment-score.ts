import type { JobLocation, Population } from '../../db/models';
import type { EmploymentCategory, EmploymentScoreResult, ScoringSnapshot } from './types';

export const FOREIGN_POPULATION_CATEGORY = 'foregner';
export const WORKING_AGE_POPULATION_CATEGORY = 'working_age_population_15_64';

type EmploymentMetrics = {
  islandId: string;
  foreignPopulation: number;
  foreignPopulationSource: 'observed' | 'assumed_zero';
  workingAgePopulation: number | null;
  jobLocationCount: number;
  foreignPerWorkingAge: number | null;
  foreignPerJobLocation: number | null;
  jobLocationsPerThousandWorkingAge: number | null;
  categories: EmploymentCategory[];
};

function finiteAmount(records: Population[], category: string): number | null {
  const amount = records.find((record) => record.ageCategory === category)?.amount;
  return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function categoryCounts(locations: JobLocation[]): EmploymentCategory[] {
  const counts = new Map<
    string,
    {
      key: string;
      label: string;
      count: number;
      subcategories: Map<string, { key: string; label: string; count: number }>;
    }
  >();
  for (const location of locations) {
    const categoryKey = location.type || 'unknown';
    const subtypeKey = location.subtype || 'unknown';
    const category = counts.get(categoryKey) ?? {
      key: categoryKey,
      label: categoryKey.replaceAll('_', ' '),
      count: 0,
      subcategories: new Map<string, { key: string; label: string; count: number }>()
    };
    category.count += 1;
    const subcategory = category.subcategories.get(subtypeKey) ?? {
      key: subtypeKey,
      label: subtypeKey.replaceAll('_', ' '),
      count: 0
    };
    subcategory.count += 1;
    category.subcategories.set(subtypeKey, subcategory);
    counts.set(categoryKey, category);
  }

  return [...counts.values()]
    .map(({ subcategories, ...category }) => ({
      ...category,
      subcategories: [...subcategories.values()].sort(
        (left, right) => right.count - left.count || left.key.localeCompare(right.key)
      )
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function metricsForIsland(snapshot: ScoringSnapshot, islandId: string): EmploymentMetrics {
  const records = snapshot.population.filter((record) => record.islandId === islandId);
  const foreign = finiteAmount(records, FOREIGN_POPULATION_CATEGORY);
  const workingAgePopulation = finiteAmount(records, WORKING_AGE_POPULATION_CATEGORY);
  const locations = (snapshot.jobLocations ?? []).filter((location) => location.islandId === islandId);
  const foreignPopulation = foreign ?? 0;
  const jobLocationCount = locations.length;
  const foreignPerWorkingAge =
    workingAgePopulation && workingAgePopulation > 0 ? foreignPopulation / workingAgePopulation : null;
  const foreignPerJobLocation = foreignPopulation / Math.max(1, jobLocationCount);
  const jobLocationsPerThousandWorkingAge =
    workingAgePopulation && workingAgePopulation > 0 ? (jobLocationCount / workingAgePopulation) * 1000 : null;

  return {
    islandId,
    foreignPopulation,
    foreignPopulationSource: foreign === null ? 'assumed_zero' : 'observed',
    workingAgePopulation,
    jobLocationCount,
    foreignPerWorkingAge,
    foreignPerJobLocation,
    jobLocationsPerThousandWorkingAge,
    categories: categoryCounts(locations)
  };
}

function percentile(value: number, values: number[]): number {
  if (values.length <= 1) return 50;
  const less = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return ((less + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100;
}

function component(
  metrics: EmploymentMetrics,
  score: number | null,
  pressureScore: number | null,
  supplyScore: number | null,
  limitations: string[]
): EmploymentScoreResult {
  const status = score === null ? 'unavailable' : 'partial';
  return {
    baseScore: score,
    score,
    adjustmentFactor: score === null ? null : 1,
    status,
    coverageRatio: score === null ? 0 : 1,
    denominatorPopulation: metrics.workingAgePopulation,
    numericPopulation: score === null ? null : metrics.workingAgePopulation,
    evidenceCount: metrics.jobLocationCount,
    limitations: [...new Set(limitations)],
    foreignPopulation: metrics.foreignPopulation,
    foreignPopulationSource: metrics.foreignPopulationSource,
    workingAgePopulation: metrics.workingAgePopulation,
    jobLocationCount: metrics.jobLocationCount,
    foreignPerWorkingAge: metrics.foreignPerWorkingAge,
    foreignPerJobLocation: metrics.foreignPerJobLocation,
    jobLocationsPerThousandWorkingAge: metrics.jobLocationsPerThousandWorkingAge,
    pressureScore,
    supplyScore,
    categories: metrics.categories
  };
}

export function calculateEmploymentScore(islandId: string, snapshot: ScoringSnapshot): EmploymentScoreResult {
  const metrics = metricsForIsland(snapshot, islandId);
  const limitations = [
    'Foreign population uses the population category `foregner`, which represents total foreign residents rather than foreign working-age residents; it is a job-demand proxy.',
    'Job-location records are workplace proxies, not job counts, employment capacity, or vacancies.',
    ...(metrics.foreignPopulationSource === 'assumed_zero'
      ? ['No `foregner` population row was found; foreign population was assumed to be zero.']
      : []),
    ...(metrics.jobLocationCount === 0
      ? ['No workplace location records were found; workplace supply is scored as zero.']
      : [])
  ];

  if (metrics.workingAgePopulation === null || metrics.workingAgePopulation <= 0) {
    return component(metrics, null, null, null, [
      ...limitations,
      'Working-age population is unavailable or zero, so employment balance cannot be scored.'
    ]);
  }

  const allMetrics = snapshot.islands
    .filter((island) => island.islandType === 'inhabited')
    .map((island) => metricsForIsland(snapshot, island.id));
  const pressureValues = allMetrics.flatMap((entry) =>
    entry.foreignPerWorkingAge === null ? [] : [entry.foreignPerWorkingAge]
  );
  const supplyValues = allMetrics.flatMap((entry) =>
    entry.jobLocationsPerThousandWorkingAge === null ? [] : [entry.jobLocationsPerThousandWorkingAge]
  );
  const pressureScore =
    metrics.foreignPerWorkingAge === null || pressureValues.length === 0
      ? null
      : round(100 - percentile(metrics.foreignPerWorkingAge, pressureValues));
  const supplyScore =
    metrics.jobLocationsPerThousandWorkingAge === null || supplyValues.length === 0
      ? null
      : round(percentile(metrics.jobLocationsPerThousandWorkingAge, supplyValues));
  const score = pressureScore === null || supplyScore === null ? null : round((pressureScore + supplyScore) / 2);

  return component(metrics, score, pressureScore, supplyScore, limitations);
}
