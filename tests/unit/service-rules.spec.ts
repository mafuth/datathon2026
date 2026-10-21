import { describe, expect, it } from 'vitest';

import {
  serviceDowngradeOptions,
  serviceEligibility,
  serviceUpgradeOptions
} from '../../src/lib/server/mobility/service-rules';

describe('service subtype rules', () => {
  it('offers only adjacent upgrade and downgrade options', () => {
    expect(serviceUpgradeOptions({ serviceType: 'health', subtype: 'clinic' })).toEqual([
      { targetSubtype: 'health_center', label: 'Upgrade to Health Center' }
    ]);
    expect(serviceDowngradeOptions({ serviceType: 'health', subtype: 'clinic' })).toEqual([]);

    expect(serviceEligibility({ serviceType: 'health', subtype: 'health_center' })).toMatchObject({
      canUpgrade: true,
      upgrades: [{ targetSubtype: 'hospital', label: 'Upgrade to Hospital' }],
      canDowngrade: true,
      downgrades: [{ targetSubtype: 'clinic', label: 'Downgrade to Clinic' }]
    });

    expect(serviceUpgradeOptions({ serviceType: 'health', subtype: 'hospital' })).toEqual([]);
    expect(serviceDowngradeOptions({ serviceType: 'health', subtype: 'hospital' })).toEqual([
      { targetSubtype: 'health_center', label: 'Downgrade to Health Center' }
    ]);

    expect(serviceUpgradeOptions({ serviceType: 'education', subtype: 'preschool' })).toEqual([
      { targetSubtype: 'school', label: 'Upgrade to School' }
    ]);
    expect(serviceDowngradeOptions({ serviceType: 'education', subtype: 'school' })).toEqual([
      { targetSubtype: 'preschool', label: 'Downgrade to Preschool' }
    ]);
    expect(serviceEligibility({ serviceType: 'education', subtype: 'high_school' })).toMatchObject({
      canUpgrade: true,
      upgrades: [{ targetSubtype: 'tertiary', label: 'Upgrade to Tertiary' }],
      canDowngrade: true,
      downgrades: [{ targetSubtype: 'school', label: 'Downgrade to School' }]
    });
  });

  it('does not expose subtype changes for transport services', () => {
    expect(serviceEligibility({ serviceType: 'transport', subtype: 'bus_stop' })).toMatchObject({
      canUpgrade: false,
      upgrades: [],
      canDowngrade: false,
      downgrades: []
    });
  });
});
