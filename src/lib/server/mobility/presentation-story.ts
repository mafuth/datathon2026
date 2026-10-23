import type { PresentationStory } from '$lib/mobility/presentation-contracts';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as v from 'valibot';

import { presentationStorySchema } from '$lib/mobility/presentation-contracts';

const ARTIFACT = resolve(process.cwd(), 'data/mobility/derived/presentation_story_jorny.json');
let cached: Promise<PresentationStory> | null = null;

function coordinateDistance(left: [number, number], right: [number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function trimSectionGeometry(story: PresentationStory): PresentationStory {
  return {
    ...story,
    sections: story.sections.map((section) => {
      if (!section.trimStartLocationId || !section.trimEndLocationId) return section;
      const start = story.locations[section.trimStartLocationId]?.coordinates;
      const end = story.locations[section.trimEndLocationId]?.coordinates;
      if (!start || !end) throw new Error(`Presentation section ${section.id} has unresolved trim locations.`);
      let startIndex = 0;
      let endIndex = 0;
      section.geometry.coordinates.forEach((coordinate, index) => {
        if (coordinateDistance(coordinate, start) < coordinateDistance(section.geometry.coordinates[startIndex], start))
          startIndex = index;
        if (coordinateDistance(coordinate, end) < coordinateDistance(section.geometry.coordinates[endIndex], end))
          endIndex = index;
      });
      const coordinates =
        startIndex <= endIndex
          ? [start, ...section.geometry.coordinates.slice(startIndex + 1, endIndex), end]
          : [start, ...section.geometry.coordinates.slice(endIndex + 1, startIndex).reverse(), end];
      return { ...section, geometry: { ...section.geometry, coordinates } };
    })
  };
}

function assertStory(story: PresentationStory): PresentationStory {
  if (story.sections.length === 0) throw new Error('Presentation story has no sections.');
  const ids = new Set<string>();
  for (const section of story.sections) {
    if (ids.has(section.id)) throw new Error(`Duplicate presentation section ${section.id}.`);
    ids.add(section.id);
    if (section.camera.fitGeometry !== section.id)
      throw new Error(`Camera geometry ${section.camera.fitGeometry} is unresolved.`);
    if (section.geometry.coordinates.length < 2)
      throw new Error(`Presentation section ${section.id} has invalid geometry.`);
  }
  return story;
}

export function loadPresentationStory(): Promise<PresentationStory> {
  cached ??= readFile(ARTIFACT, 'utf8').then((content) =>
    assertStory(trimSectionGeometry(v.parse(presentationStorySchema, JSON.parse(content))))
  );
  return cached;
}
