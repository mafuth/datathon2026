import type { IslandServiceSubtypeOption } from '$components/mobility/island-services';
import type { Service } from '$models';

const HEALTH_SERVICE_ORDER = ['clinic', 'health_center', 'hospital'] as const;
const EDUCATION_SERVICE_ORDER = ['preschool', 'school', 'high_school', 'tertiary'] as const;

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function serviceUpgradeOptions(service: Pick<Service, 'serviceType' | 'subtype'>): IslandServiceSubtypeOption[] {
  const serviceOrder: readonly string[] | null =
    service.serviceType === 'health'
      ? HEALTH_SERVICE_ORDER
      : service.serviceType === 'education'
        ? EDUCATION_SERVICE_ORDER
        : null;
  if (!serviceOrder) return [];

  const index = serviceOrder.indexOf(service.subtype);
  if (index < 0 || index >= serviceOrder.length - 1) return [];
  const targetSubtype = serviceOrder[index + 1];
  if (!targetSubtype) return [];

  return [
    {
      targetSubtype,
      label: `Upgrade to ${titleCase(targetSubtype)}`
    }
  ];
}

export function serviceDowngradeOptions(
  service: Pick<Service, 'serviceType' | 'subtype'>
): IslandServiceSubtypeOption[] {
  const serviceOrder: readonly string[] | null =
    service.serviceType === 'health'
      ? HEALTH_SERVICE_ORDER
      : service.serviceType === 'education'
        ? EDUCATION_SERVICE_ORDER
        : null;
  if (!serviceOrder) return [];

  const index = serviceOrder.indexOf(service.subtype);
  if (index <= 0) return [];
  const targetSubtype = serviceOrder[index - 1];
  if (!targetSubtype) return [];

  return [
    {
      targetSubtype,
      label: `Downgrade to ${titleCase(targetSubtype)}`
    }
  ];
}

export function serviceEligibility(service: Pick<Service, 'serviceType' | 'subtype'>) {
  const upgrades = serviceUpgradeOptions(service);
  const downgrades = serviceDowngradeOptions(service);
  return {
    canUpgrade: upgrades.length > 0,
    upgrades,
    canDowngrade: downgrades.length > 0,
    downgrades,
    canMove: true,
    canDelete: true
  };
}
