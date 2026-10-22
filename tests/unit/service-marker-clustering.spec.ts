import type { IslandMapService } from '../../src/lib/components/mobility/island-services';

import { describe, expect, it } from 'vitest';

import {
  isProposalServiceMarker,
  serviceMarkerPositionsMatch
} from '../../src/lib/components/mobility/service-marker-clustering';

type MarkerService = Pick<IslandMapService, 'serviceType' | 'coordinates'>;

describe('service marker source invalidation', () => {
  const previous = new Map<string, MarkerService>([
    ['hospital', { serviceType: 'health', coordinates: [73.5, 4.2] }],
    ['school', { serviceType: 'education', coordinates: [73.6, 4.3] }]
  ]);

  it('reuses clustered point data when only view order or service metadata changes', () => {
    const next = new Map<string, MarkerService>([
      ['school', { serviceType: 'education', coordinates: [73.6, 4.3] }],
      ['hospital', { serviceType: 'health', coordinates: [73.5, 4.2] }]
    ]);
    expect(serviceMarkerPositionsMatch(previous, next)).toBe(true);
  });

  it('invalidates the source when a service is moved, recategorized, removed, or replaced', () => {
    for (const replacement of [
      { serviceType: 'health' as const, coordinates: [73.51, 4.2] as [number, number] },
      { serviceType: 'education' as const, coordinates: [73.5, 4.2] as [number, number] }
    ]) {
      expect(serviceMarkerPositionsMatch(previous, new Map([...previous, ['hospital', replacement]]))).toBe(false);
    }
    expect(serviceMarkerPositionsMatch(previous, new Map([['school', previous.get('school')!]]))).toBe(false);
    expect(
      serviceMarkerPositionsMatch(
        previous,
        new Map([
          ['clinic', previous.get('hospital')!],
          ['school', previous.get('school')!]
        ])
      )
    ).toBe(false);
  });
});

describe('proposal marker visibility', () => {
  it('keeps additions and changed services out of baseline clusters while retaining unchanged services', () => {
    expect(isProposalServiceMarker({ id: 'draft:school-1', change: 'added' })).toBe(true);
    expect(isProposalServiceMarker({ id: 'draft:school-1' })).toBe(true);
    expect(isProposalServiceMarker({ id: 'hospital-1', change: 'moved' })).toBe(true);
    expect(isProposalServiceMarker({ id: 'school-1', change: 'upgraded' })).toBe(true);
    expect(isProposalServiceMarker({ id: 'school-1', change: 'unchanged' })).toBe(false);
    expect(isProposalServiceMarker({ id: 'school-1' })).toBe(false);
    expect(isProposalServiceMarker({ id: 'draft:school-1', change: 'deleted' })).toBe(false);
  });
});
