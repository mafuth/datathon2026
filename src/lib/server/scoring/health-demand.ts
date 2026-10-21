import type { Population } from '../../db/models';

import { scoringConfig } from './config';

export type HealthServiceSubtype = 'clinic' | 'health_center' | 'hospital';
export type HealthDemandNeed = 'primary' | 'maternal_child' | 'hospital_emergency' | 'chronic_elderly';
export type HealthDemandLayer = 'baseline' | 'younger' | 'specialist';

export type HealthPopulationProfile = {
  total: number;
  children: number;
  adolescents: number;
  younger: number;
  elderly: number;
  hospitalEmergency: number;
};

function finiteAmount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function populationAmount(
  records: readonly Pick<Population, 'ageCategory' | 'amount'>[],
  ageCategory: string
): number | null {
  const record = records.find((entry) => entry.ageCategory === ageCategory);
  return record ? finiteAmount(record.amount) : null;
}

function firstPopulationAmount(
  records: readonly Pick<Population, 'ageCategory' | 'amount'>[],
  ageCategories: readonly string[]
): number {
  for (const ageCategory of ageCategories) {
    const amount = populationAmount(records, ageCategory);
    if (amount !== null) return amount;
  }
  return 0;
}

export function healthPopulationProfile(
  records: readonly Pick<Population, 'ageCategory' | 'amount'>[]
): HealthPopulationProfile {
  const totalRecord = populationAmount(records, 'total');
  const total = totalRecord ?? records.reduce((sum, record) => sum + (finiteAmount(record.amount) ?? 0), 0);
  const children = firstPopulationAmount(records, ['child_population_0_14', 'child_population_0_17']);
  const adolescents = populationAmount(records, 'adolescent_population_10_19') ?? 0;
  const elderly = populationAmount(records, 'elderly_population_65_plus') ?? 0;

  // The supplied child and adolescent rows overlap, so use their union proxy
  // rather than counting the overlapping rows twice.
  const younger = Math.min(total, Math.max(children, adolescents));
  const hospitalEmergency = Math.min(total, children + elderly);

  return { total, children, adolescents, younger, elderly, hospitalEmergency };
}

export function healthDemand(
  records: readonly Pick<Population, 'ageCategory' | 'amount'>[]
): Record<HealthDemandNeed, number> {
  const profile = healthPopulationProfile(records);
  const nonElderlyBaseline = Math.max(0, profile.total - profile.elderly);

  return {
    primary: nonElderlyBaseline,
    maternal_child: profile.younger,
    hospital_emergency: profile.hospitalEmergency,
    chronic_elderly: profile.elderly
  };
}

export function healthDemandLayer(needKey: string): HealthDemandLayer | null {
  if (needKey === 'primary') return 'baseline';
  if (needKey === 'maternal_child') return 'younger';
  if (needKey === 'hospital_emergency' || needKey === 'chronic_elderly') return 'specialist';
  return null;
}

export function healthServicePriority(needKey: string): readonly HealthServiceSubtype[] {
  if (healthDemandLayer(needKey) === 'specialist') return scoringConfig.healthDemandPolicy.specialistSubtypes;
  if (healthDemandLayer(needKey) === 'younger') return scoringConfig.healthDemandPolicy.youngerPriority;
  return scoringConfig.healthDemandPolicy.baselineSubtypes;
}

export function healthServiceTargetSubtypes(
  needKey: string,
  availableSubtypes: readonly string[]
): HealthServiceSubtype[] {
  const available = new Set(availableSubtypes);
  const layer = healthDemandLayer(needKey);
  if (layer === 'baseline') {
    return scoringConfig.healthDemandPolicy.baselineSubtypes.filter((subtype) => available.has(subtype));
  }

  const priority = healthServicePriority(needKey);
  const target = priority.find((subtype) => available.has(subtype));
  return target ? [target] : [];
}
