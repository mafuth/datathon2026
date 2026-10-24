import { base } from '$app/paths';

export function appPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || !base) return path;
  if (path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`) || path.startsWith(`${base}#`)) {
    return path;
  }

  return `${base}${path}`;
}
