import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { themeColor, themeColorChannels, themeToken } from '../../src/lib/config/theme/theme-tokens';

const sourceRoot = new URL('../../src/', import.meta.url);
const themeSource = readFileSync(new URL('styles/theme.css', sourceRoot), 'utf8');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:svelte|css|ts)$/.test(entry.name) ? [path] : [];
  });
}

describe('single-source visual theme', () => {
  it('resolves chart aliases to the actual CSS source used by the interface', () => {
    const cssAccent = themeSource.match(/--mobility-accent:\s*([^;]+);/)?.[1].trim();
    expect(cssAccent).toBeTruthy();
    expect(themeToken('--mobility-chart-after')).toBe(cssAccent);
    expect(themeColor('--mobility-chart-after')).toBe(themeColor('--mobility-accent'));
    expect(themeToken('--mobility-text-sm')).toBe(themeToken('--app-text-xs'));
  });

  it('produces PDF channels that reconstruct the exact UI color', () => {
    const channels = themeColorChannels('--mobility-chart-after');
    expect(channels).toHaveLength(3);
    expect(channels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1)).toBe(true);
    const reconstructed = `#${channels
      .map((channel) =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`;
    expect(reconstructed).toBe(themeColor('--mobility-chart-after'));
    expect(() => themeColorChannels('--mobility-font-body')).toThrow('must be a hexadecimal color');
    expect(() => themeToken('--mobility-unknown-token')).toThrow('Missing theme token');
  });

  it('defines every visual token referenced by components, CSS and direct map/PDF consumers', () => {
    const sources = sourceFiles(fileURLToPath(sourceRoot)).map((path) => readFileSync(path, 'utf8'));
    const definitions = new Set(
      sources.flatMap((source) => [...source.matchAll(/(--mobility-[\w-]+)\s*:/g)].map((match) => match[1]))
    );
    const references = new Set(
      sources.flatMap((source) => [
        ...[...source.matchAll(/var\(\s*(--mobility-[\w-]+)(?=\s*[,)]|$)/g)].map((match) => match[1]),
        ...[...source.matchAll(/theme(?:Token|Color|ColorChannels)\(\s*['"](--mobility-[\w-]+)['"]/g)].map(
          (match) => match[1]
        )
      ])
    );
    expect([...references].filter((token) => !definitions.has(token)).sort()).toEqual([]);
  });
});
