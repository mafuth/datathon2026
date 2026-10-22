import type { VehicleCount } from '../../src/lib/db/models';

import { describe, expect, it } from 'vitest';

import { calculateSustainabilityScore } from '../../src/lib/server/scoring/sustainability-score';

function vehicle(islandId: string, category: string, total: number): VehicleCount {
  return { islandId, category, total };
}

const demand = { land: 100, marine: 50, air: 25 };

describe('sustainability scoring', () => {
  it('keeps sustainability unavailable when vehicle rows are absent', () => {
    const result = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [],
      transportDemand: demand,
      airLinkExists: true
    });

    expect(result.status).toBe('unavailable');
    expect(result.score).toBeNull();
    expect(result.vehicleTotal).toBeNull();
    expect(result.privateVehiclePollution).toBeNull();
  });

  it('uses category factors and scales the public transport benefit with inferred reliance', () => {
    const lowVehicleRate = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [
        vehicle('island:one', 'total', 100),
        vehicle('island:one', 'motor_cycle', 80),
        vehicle('island:one', 'car', 20)
      ],
      transportDemand: demand,
      airLinkExists: true
    });
    const highVehicleRate = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [
        vehicle('island:one', 'total', 500),
        vehicle('island:one', 'motor_cycle', 400),
        vehicle('island:one', 'car', 100)
      ],
      transportDemand: demand,
      airLinkExists: true
    });

    expect(highVehicleRate.publicTransportReliance).toBeLessThan(lowVehicleRate.publicTransportReliance ?? 1);
    expect(lowVehicleRate.publicTransportBenefit).toBeGreaterThan(highVehicleRate.publicTransportBenefit ?? -Infinity);
    expect(lowVehicleRate.pollutionFactors.busLand.grossPollution).toBeGreaterThan(
      highVehicleRate.pollutionFactors.busLand.grossPollution ?? -Infinity
    );
    expect(lowVehicleRate.pollutionFactors.jettyMarine.grossPollution).toBeGreaterThan(
      highVehicleRate.pollutionFactors.jettyMarine.grossPollution ?? -Infinity
    );
    expect(highVehicleRate.pollutionFactors.airportAir.grossPollution).toBe(
      lowVehicleRate.pollutionFactors.airportAir.grossPollution
    );
    const motorcycle = lowVehicleRate.vehicleCategoryBreakdown.find((entry) => entry.category === 'motor_cycle');
    const car = lowVehicleRate.vehicleCategoryBreakdown.find((entry) => entry.category === 'car');
    expect(car?.pollutionFactor).toBeGreaterThan(motorcycle?.pollutionFactor ?? Number.POSITIVE_INFINITY);
    expect(lowVehicleRate.privateVehiclePollution).toBeGreaterThan(0);
  });

  it('treats battery scooters as zero modeled tailpipe pollution and improves the score', () => {
    const motorcycle = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [vehicle('island:one', 'total', 3), vehicle('island:one', 'motor_cycle', 3)],
      transportDemand: { land: null, marine: null, air: null },
      airLinkExists: false
    });
    const batteryScooter = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [vehicle('island:one', 'total', 3), vehicle('island:one', 'battery_scooter', 3)],
      transportDemand: { land: null, marine: null, air: null },
      airLinkExists: false
    });

    expect(batteryScooter.pollutionFactors.privateVehicles.pollution).toBe(0);
    expect(batteryScooter.privateVehiclePollution).toBe(0);
    expect(batteryScooter.pollutionPressure).toBe(0);
    expect(batteryScooter.score).toBeGreaterThan(motorcycle.score ?? -Infinity);
  });

  it('rewards bus and ferry demand against an equivalent private-travel baseline', () => {
    const privateOnly = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [
        vehicle('island:one', 'total', 100),
        vehicle('island:one', 'motor_cycle', 80),
        vehicle('island:one', 'car', 20)
      ],
      transportDemand: { land: null, marine: null, air: null },
      airLinkExists: false
    });
    const bus = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [
        vehicle('island:one', 'total', 100),
        vehicle('island:one', 'motor_cycle', 80),
        vehicle('island:one', 'car', 20)
      ],
      transportDemand: { land: 100, marine: null, air: null },
      airLinkExists: false
    });
    const ferry = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [
        vehicle('island:one', 'total', 100),
        vehicle('island:one', 'motor_cycle', 80),
        vehicle('island:one', 'car', 20)
      ],
      transportDemand: { land: null, marine: 100, air: null },
      airLinkExists: false
    });

    expect(bus.publicTransportBenefit).toBeGreaterThan(0);
    expect(ferry.publicTransportBenefit).toBeGreaterThan(0);
    expect(bus.pollutionPressure).toBeLessThan(privateOnly.pollutionPressure ?? Infinity);
    expect(ferry.pollutionPressure).toBeLessThan(privateOnly.pollutionPressure ?? Infinity);
    expect(bus.score).toBeGreaterThan(privateOnly.score ?? -Infinity);
    expect(ferry.score).toBeGreaterThan(privateOnly.score ?? -Infinity);
  });

  it('keeps air demand high-impact while bounding oversized transport demand', () => {
    const ferry = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [vehicle('island:one', 'total', 100), vehicle('island:one', 'motor_cycle', 100)],
      transportDemand: { land: null, marine: 100, air: null },
      airLinkExists: false
    });
    const air = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [vehicle('island:one', 'total', 100), vehicle('island:one', 'motor_cycle', 100)],
      transportDemand: { land: null, marine: null, air: 100 },
      airLinkExists: false
    });
    const oversized = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [vehicle('island:one', 'total', 100), vehicle('island:one', 'motor_cycle', 100)],
      transportDemand: { land: null, marine: 100_000, air: null },
      airLinkExists: false
    });
    const capped = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [vehicle('island:one', 'total', 100), vehicle('island:one', 'motor_cycle', 100)],
      transportDemand: { land: null, marine: 1_000, air: null },
      airLinkExists: false
    });

    expect(air.pollutionPressure).toBeGreaterThan(ferry.pollutionPressure ?? -Infinity);
    expect(air.score).toBeLessThan(ferry.score ?? Infinity);
    expect(oversized.pollutionPressure).toBe(capped.pollutionPressure);
    expect(oversized.score).toBe(capped.score);
    expect(oversized.publicTransportShiftedDemand).toBe(capped.publicTransportShiftedDemand);
  });

  it('reports factor contributions as shares of modeled pollution pressure', () => {
    const result = calculateSustainabilityScore({
      totalPopulation: 1_000,
      vehicleCounts: [
        vehicle('island:one', 'total', 100),
        vehicle('island:one', 'car', 60),
        vehicle('island:one', 'battery_scooter', 40)
      ],
      transportDemand: { land: 100, marine: null, air: null },
      airLinkExists: false
    });

    const contributions = Object.values(result.pollutionFactors)
      .map((factor) => factor.contributionPercent)
      .filter((value): value is number => value !== null);
    expect(contributions.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
    expect(result.pollutionFactors.jettyMarine.contributionPercent).toBeNull();
    expect(result.pollutionFactors.airportAir.contributionPercent).toBeNull();
  });
});
