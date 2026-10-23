import { describe, expect, it } from 'vitest';

import { loadPresentationStory } from '../../src/lib/server/mobility/presentation-story';

describe('presentation story', () => {
  it('strictly loads the fixed Baarah to Hulhumale journey', async () => {
    const story = await loadPresentationStory();
    expect(story.originIslandId).toBe('island:640');
    expect(story.destinationIslandId).toBe('island:1442');
    expect(story.locations.vinares.id).toBe('rtl:bus-stop:6658');
    expect(story.locations.treeTop.id).toBe('facility:health:362');
    expect(story.sections.every((section) => section.timing.pauseAtEnd)).toBe(true);
    expect(story.timeline.unknownWaits.length).toBeGreaterThan(0);
  });

  it('contains the correct-direction R9 and ambulance geometries', async () => {
    const story = await loadPresentationStory();
    const bus = story.sections.find((section) => section.id === 'pickup-r9');
    const ambulance = story.sections.find((section) => section.id === 'ambulance-tree-top');
    expect(bus?.geometry.coordinates[0][1]).toBeGreaterThan(bus?.geometry.coordinates.at(-1)?.[1] ?? Infinity);
    expect(ambulance?.geometry.coordinates.at(-1)).toEqual(story.locations.treeTop.coordinates);
  });
});
