import type { IslandServiceUpgradeOption } from '$components/mobility/island-services';
import type { Service } from '$models';

const HEALTH_UPGRADE_ORDER = ['clinic', 'health_center', 'hospital'] as const;

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function serviceUpgradeOptions(service: Pick<Service, 'serviceType' | 'subtype'>): IslandServiceUpgradeOption[] {
  if (service.serviceType !== 'health') return [];

  const index = HEALTH_UPGRADE_ORDER.indexOf(service.subtype as (typeof HEALTH_UPGRADE_ORDER)[number]);
  if (index < 0 || index >= HEALTH_UPGRADE_ORDER.length - 1) return [];

  return [
    {
      targetSubtype: HEALTH_UPGRADE_ORDER[index + 1],
      label: `Upgrade to ${titleCase(HEALTH_UPGRADE_ORDER[index + 1])}`
    }
  ];
}

export function serviceEligibility(service: Pick<Service, 'serviceType' | 'subtype'>) {
  const upgrades = serviceUpgradeOptions(service);
  return {
    canUpgrade: upgrades.length > 0,
    upgrades,
    canMove: true,
    canDelete: true
  };
}
