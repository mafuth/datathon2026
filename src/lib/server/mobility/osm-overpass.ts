import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const OSM_USER_AGENT = 'MobilitySandboxMV/0.1 (contact: mafaaz708+osm@gmail.com)';

const OVERPASS_ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

export async function queryOverpass<T>(query: string, timeoutSeconds = 120): Promise<{ endpoint: string; data: T }> {
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  let lastError = 'No Overpass endpoint was attempted';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const { stdout } = await execFileAsync(
        curl,
        [
          '--fail-with-body',
          '--compressed',
          '--silent',
          '--show-error',
          '--max-time',
          String(timeoutSeconds),
          '-H',
          `User-Agent: ${OSM_USER_AGENT}`,
          '-H',
          'Accept: application/json',
          '-H',
          'Content-Type: text/plain; charset=utf-8',
          '--data-binary',
          query,
          endpoint
        ],
        {
          maxBuffer: 128 * 1024 * 1024,
          windowsHide: true
        }
      );
      return { endpoint, data: JSON.parse(stdout) as T };
    } catch (error) {
      const details = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : String(error);
      lastError = `${endpoint} failed: ${details.trim()}`;
    }
  }

  throw new Error(`All Overpass endpoints failed: ${lastError}`);
}

export async function fetchOsmMap(bbox: [number, number, number, number]): Promise<{ url: string; xml: string }> {
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = bbox;
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${minLongitude},${minLatitude},${maxLongitude},${maxLatitude}`;
  const { stdout } = await execFileAsync(
    curl,
    [
      '--fail-with-body',
      '--compressed',
      '--silent',
      '--show-error',
      '-H',
      `User-Agent: ${OSM_USER_AGENT}`,
      '-H',
      'Accept: application/xml',
      '-H',
      'Content-Type: text/plain; charset=utf-8',
      url
    ],
    {
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true
    }
  );
  return { url, xml: stdout };
}
