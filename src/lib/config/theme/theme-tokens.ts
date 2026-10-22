import themeSource from '../../../styles/theme.css?raw';

export type ThemeTokenName = `--mobility-${string}` | `--app-${string}`;

/* MapLibre and generated PDFs cannot consume CSS variables directly. Read the
   same source as the UI rather than maintaining a second palette in JavaScript. */
const rootBlock = themeSource.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const sourceTokens = new Map(
  [...rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()])
);
const resolvedTokens = new Map<string, string>();

export function themeToken(name: ThemeTokenName): string {
  const cached = resolvedTokens.get(name);
  if (cached !== undefined) return cached;

  function resolve(token: string, ancestors: Set<string>): string {
    if (ancestors.has(token)) throw new Error(`Circular theme token: ${token}`);
    const value = sourceTokens.get(token);
    if (value === undefined) throw new Error(`Missing theme token: ${token}`);
    const nextAncestors = new Set(ancestors).add(token);
    return value.replace(/var\((--[\w-]+)\)/g, (_, reference: string) => resolve(reference, nextAncestors));
  }

  const value = resolve(name, new Set());
  resolvedTokens.set(name, value);
  return value;
}

export function themeColor(name: ThemeTokenName): string {
  return themeToken(name);
}

export function themeColorChannels(name: ThemeTokenName): [number, number, number] {
  const color = themeColor(name);
  const hex = color.startsWith('#') ? color.slice(1) : '';
  const expanded = hex.length === 3 ? [...hex].map((character) => character.repeat(2)).join('') : hex;
  if (!/^[\da-f]{6}$/i.test(expanded)) {
    throw new Error(`Theme token ${name} must be a hexadecimal color for PDF output.`);
  }
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255) as [
    number,
    number,
    number
  ];
}
