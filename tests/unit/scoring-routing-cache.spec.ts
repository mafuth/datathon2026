import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it } from 'vitest';

import { buildDemandAllocation } from '../../src/lib/server/scoring/demand-allocation';
import { resolveEducationRouting, resolveElderlyHospitalRouting } from '../../src/lib/server/scoring/hospital-routing';
import { withResidentialDemandPoints } from '../../src/lib/server/scoring/scoring-snapshot';
import { calculateTransportDemand } from '../../src/lib/server/scoring/transport-demand';

function fixture(): ScoringSnapshot {
  return {
    islands: ['origin', 'relay', 'hospital', 'closer'].map((id, index) => ({
      id,
      name: id,
      islandType: 'inhabited',
      atollId: 'same-atoll',
      latitude: 3,
      longitude: 73 + index / 100,
      landAreaKm2: 1,
      geoJson: '{}'
    })),
    services: [
      {
        id: 'hospital-1',
        islandId: 'hospital',
        name: 'Hospital',
        serviceType: 'health',
        subtype: 'hospital',
        latitude: 3,
        longitude: 73.02
      },
      {
        id: 'school-1',
        islandId: 'hospital',
        name: 'School',
        serviceType: 'education',
        subtype: 'school',
        latitude: 3,
        longitude: 73.02
      }
    ],
    connections: [
      ['origin-relay', 'origin', 'relay', 10],
      ['relay-hospital', 'relay', 'hospital', 20]
    ].map(([id, fromIslandId, toIslandId, distanceM]) => ({
      id: String(id),
      fromIslandId: String(fromIslandId),
      toIslandId: String(toIslandId),
      distanceM: Number(distanceM),
      connectionType: 'ferry',
      directionality: 'bidirectional',
      scoreEligible: true,
      modeled: false,
      routeId: null,
      sequence: null,
      geoJson: null,
      source: 'test',
      sourceObjectId: String(id)
    })),
    population: [],
    vehicleCounts: [],
    jobLocations: [],
    routes: [],
    transportStops: [],
    routeStops: []
  };
}

describe('cached service routing projections', () => {
  it('shares scoring for a spatial view while isolating changed source versions and proposals', () => {
    const baseline = fixture();
    baseline.population = [{ islandId: 'origin', ageCategory: 'total', amount: 100 }];
    const allocations = buildDemandAllocation(baseline);
    const demand = calculateTransportDemand('origin', baseline, allocations);
    const spatial = withResidentialDemandPoints(baseline, [
      { id: 'house', islandId: 'origin', coordinates: [73, 3], weight: 1 }
    ]);
    expect(buildDemandAllocation(spatial)).toBe(allocations);
    expect(calculateTransportDemand('origin', spatial, allocations)).toBe(demand);

    const changedSource: ScoringSnapshot = {
      ...baseline,
      population: [{ islandId: 'origin', ageCategory: 'total', amount: 200 }]
    };
    const refreshed = withResidentialDemandPoints(changedSource, spatial.residentialDemandPoints ?? []);
    const changedAllocations = buildDemandAllocation(refreshed);
    expect(changedAllocations).not.toBe(allocations);
    expect(changedAllocations.byIsland.get('origin')?.population).toBe(200);

    const proposal: ScoringSnapshot = {
      ...spatial,
      services: [...spatial.services, { ...spatial.services[0], id: 'local-hospital', islandId: 'origin' }]
    };
    const proposedAllocations = buildDemandAllocation(proposal);
    expect(proposedAllocations).not.toBe(allocations);
    expect(proposedAllocations.byOriginNeed.get('origin:health:primary')?.destinationIslandId).toBe('origin');
    expect(buildDemandAllocation(baseline)).toBe(allocations);
  });

  it('preserves exact paths across service categories and leaves the baseline untouched', () => {
    const baseline = fixture();
    const original = JSON.stringify(baseline);
    const hospital = resolveElderlyHospitalRouting(baseline, 'origin');
    const school = resolveEducationRouting(baseline, 'origin', 'school');
    expect(hospital.canonical).toMatchObject({
      destinationIslandId: 'hospital',
      distanceM: 30,
      hopCount: 2,
      routeFactor: 0.49,
      pathIslandIds: ['origin', 'relay', 'hospital'],
      pathConnectionIds: ['origin-relay', 'relay-hospital']
    });
    expect(school.canonical?.pathConnectionIds).toEqual(hospital.canonical?.pathConnectionIds);
    expect(resolveElderlyHospitalRouting(baseline, 'origin')).toBe(hospital);
    expect(resolveEducationRouting(baseline, 'origin', 'school')).toBe(school);
    expect(JSON.stringify(baseline)).toBe(original);
  });

  it('recomputes added services and projected connections without reusing stale baseline routes', () => {
    const baseline = fixture();
    const original = resolveElderlyHospitalRouting(baseline, 'origin');
    const withLocalService: ScoringSnapshot = {
      ...baseline,
      services: [...baseline.services, { ...baseline.services[0], id: 'new-local', islandId: 'origin' }]
    };
    expect(resolveElderlyHospitalRouting(withLocalService, 'origin').canonical).toMatchObject({
      destinationServiceId: 'new-local',
      kind: 'local',
      distanceM: 0
    });
    const withShortcut: ScoringSnapshot = {
      ...baseline,
      connections: [
        ...baseline.connections,
        {
          ...baseline.connections[0],
          id: 'shortcut',
          fromIslandId: 'origin',
          toIslandId: 'hospital',
          distanceM: 5,
          directionality: 'forward'
        }
      ]
    };
    expect(resolveElderlyHospitalRouting(withShortcut, 'origin').canonical).toMatchObject({
      distanceM: 5,
      hopCount: 1,
      pathConnectionIds: ['shortcut'],
      routeFactor: 0.7
    });
    const excluded: ScoringSnapshot = {
      ...baseline,
      connections: withShortcut.connections.map((connection) =>
        connection.id === 'shortcut' ? { ...connection, scoreEligible: false } : connection
      )
    };
    expect(resolveElderlyHospitalRouting(excluded, 'origin')).toEqual(original);
    expect(resolveElderlyHospitalRouting(baseline, 'origin')).toBe(original);
  });
});
