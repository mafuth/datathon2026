import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { queryOverpass } from '../src/lib/server/mobility/osm-overpass';

type Position = [number, number];
type OsmTags = Record<string, string>;
type OsmElement = {
  type?: 'node' | 'way' | 'relation';
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  geometry?: Array<{ lat?: number; lon?: number }>;
  members?: Array<{ type?: string; ref?: number; role?: string }>;
  tags?: OsmTags;
};
type OsmPayload = { elements?: OsmElement[] };
type NormalizedService = {
  id: string;
  osm_type: string;
  osm_id: number;
  service_type: 'health' | 'education' | 'transport';
  subtype: string;
  marine_evidence?: 'port' | 'jetty' | 'breakwater' | 'ferry_stop';
  name: string | null;
  latitude: number;
  longitude: number;
  geometry: { type: 'Point' | 'LineString'; coordinates: Position | Position[] };
  tags: OsmTags;
  source: 'OpenStreetMap';
  source_object_id: string;
  source_url: string;
};
type NormalizedRoute = {
  id: string;
  osm_type: string;
  osm_id: number;
  name: string | null;
  route_type: 'ferry';
  geometry: { type: 'LineString'; coordinates: Position[] };
  passenger_eligible: boolean;
  tags: OsmTags;
  source: 'OpenStreetMap';
  source_object_id: string;
  source_url: string;
  modeled: false;
};

const outputRoot = resolve(process.env.MOBILITY_OSM_OUTPUT_ROOT ?? 'data/mobility/normalized');
const bbox = '(-1,72,8,74)';
const regionalBboxes = ['(-1,72,3.5,74)', '(3.5,72,8,74)'];
const healthQuery = `[out:json][timeout:120];(
  nwr["amenity"="hospital"]${bbox};
  nwr["amenity"="clinic"]${bbox};
  nwr["amenity"="doctors"]${bbox};
  nwr["healthcare"~"^(hospital|clinic|centre|center|doctor)$",i]${bbox};
);out body center;`;
const educationQuery = `[out:json][timeout:120];(
  nwr["building"~"^(hospital|school|kindergarten|college|university)$",i]${bbox};
  nwr["amenity"="school"]${bbox};
  nwr["amenity"="kindergarten"]${bbox};
  nwr["amenity"="college"]${bbox};
  nwr["amenity"="university"]${bbox};
);out body center;`;
const serviceQueries = [healthQuery, educationQuery];
const marineTerminalQuery = `[out:json][timeout:120];(
  nwr["amenity"="ferry_terminal"]${bbox};
  nwr["amenity"="marina"]${bbox};
  nwr["amenity"="boat_rental"]${bbox};
  nwr["harbour"="yes"]${bbox};
  nwr["landuse"="harbour"]${bbox};
  nwr["leisure"="marina"]${bbox};
  nwr["leisure"="slipway"]${bbox};
);out body center;`;
const marineFerryStopQuery = `[out:json][timeout:120];(
  nwr["public_transport"="platform"]["ferry"="yes"]${bbox};
  nwr["public_transport"="stop_position"]["ferry"="yes"]${bbox};
  nwr["ferry"="yes"]${bbox};
  nwr["scuba_diving:entry:boat"="yes"]${bbox};
);out body center;`;
const marineStructureQuery = `[out:json][timeout:120];(
  nwr["waterway"="boatyard"]${bbox};
  nwr["waterway"="dock"]${bbox};
  nwr["man_made"="pier"]${bbox};
  nwr["man_made"="jetty"]${bbox};
  nwr["man_made"="slipway"]${bbox};
  nwr["man_made"="dock"]${bbox};
  nwr["water"="harbour"]${bbox};
  nwr["pier"="yes"]${bbox};
);out body center;`;
const marineBreakwaterQuery = `[out:json][timeout:120];(
  nwr["man_made"="breakwater"]${bbox};
);out body center;`;
const marineSeamarkQuery = `[out:json][timeout:120];(
  nwr["seamark:type"~"harbour|small_craft_harbour|pier|jetty",i]${bbox};
  nwr["seamark:harbour:category"]${bbox};
);out body center;`;
const marineQueries = [
  marineTerminalQuery,
  marineFerryStopQuery,
  marineStructureQuery,
  marineBreakwaterQuery,
  marineSeamarkQuery
];
const routeWayRouteQuery = `[out:json][timeout:120];way["route"="ferry"]${bbox};out body geom;`;
const routeWayTagQuery = `[out:json][timeout:120];way["ferry"="yes"]${bbox};out body geom;`;
const routeRelationQuery = `[out:json][timeout:120];(
  relation["type"="route"]["route"="ferry"]${bbox};
  relation["route"="ferry"]${bbox};
);out body;>;out geom;`;

function lower(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function nameFor(tags: OsmTags): string | null {
  return tags.name ?? tags['name:en'] ?? tags.ref ?? null;
}

function pointFor(element: OsmElement): Position | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (typeof latitude === 'number' && typeof longitude === 'number') return [longitude, latitude];
  const geometry = coordinatesFor(element);
  return geometry[Math.floor(geometry.length / 2)] ?? null;
}

function geometryFor(element: OsmElement, point: Position): NormalizedService['geometry'] {
  const coordinates = coordinatesFor(element);
  return coordinates.length >= 2 ? { type: 'LineString', coordinates } : { type: 'Point', coordinates: point };
}

function serviceClass(tags: OsmTags): {
  serviceType: NormalizedService['service_type'];
  subtype: string;
  marineEvidence?: NormalizedService['marine_evidence'];
} | null {
  const amenity = lower(tags.amenity);
  const healthcare = lower(tags.healthcare);
  const publicTransport = lower(tags.public_transport);
  const manMade = lower(tags.man_made);
  const building = lower(tags.building);
  const name = lower(tags.name);

  if (amenity === 'hospital' || healthcare === 'hospital' || building === 'hospital') {
    return { serviceType: 'health', subtype: 'hospital' };
  }
  if (amenity === 'clinic' || amenity === 'doctors' || healthcare === 'clinic' || healthcare === 'doctor') {
    return { serviceType: 'health', subtype: 'clinic' };
  }
  if (healthcare === 'centre' || healthcare === 'center') return { serviceType: 'health', subtype: 'health_center' };

  if (amenity === 'kindergarten' || building === 'kindergarten')
    return { serviceType: 'education', subtype: 'preschool' };
  if (amenity === 'college' || amenity === 'university' || building === 'college' || building === 'university') {
    return { serviceType: 'education', subtype: 'tertiary' };
  }
  if (amenity === 'school' || building === 'school') {
    const educationLevel = `${lower(tags['isced:level'])} ${lower(tags.education_level)} ${lower(tags.school)}`;
    return educationLevel.includes('3') || educationLevel.includes('secondary')
      ? { serviceType: 'education', subtype: 'high_school' }
      : { serviceType: 'education', subtype: 'school' };
  }

  const isPort =
    amenity === 'ferry_terminal' ||
    amenity === 'marina' ||
    amenity === 'boat_rental' ||
    lower(tags.harbour) === 'yes' ||
    lower(tags.landuse) === 'harbour' ||
    lower(tags.leisure) === 'marina' ||
    lower(tags.water) === 'harbour' ||
    lower(tags.waterway) === 'boatyard' ||
    lower(tags.waterway) === 'dock' ||
    lower(tags['seamark:type'])?.includes('harbour') ||
    Boolean(tags['seamark:harbour:category']) ||
    publicTransport === 'platform' ||
    publicTransport === 'stop_position' ||
    lower(tags.ferry) === 'yes';
  if (isPort) {
    return {
      serviceType: 'transport',
      subtype: 'port',
      marineEvidence:
        publicTransport === 'platform' || publicTransport === 'stop_position' || lower(tags.ferry) === 'yes'
          ? 'ferry_stop'
          : 'port'
    };
  }

  if (
    manMade === 'pier' ||
    manMade === 'jetty' ||
    manMade === 'slipway' ||
    manMade === 'dock' ||
    lower(tags['scuba_diving:entry:boat']) === 'yes' ||
    lower(tags.leisure) === 'slipway' ||
    lower(tags.pier) === 'yes' ||
    /jetty|pier|slipway/.test(lower(tags['seamark:type'])) ||
    /jetty|pier/.test(name)
  ) {
    return { serviceType: 'transport', subtype: 'jetty', marineEvidence: 'jetty' };
  }
  if (manMade === 'breakwater') return { serviceType: 'transport', subtype: 'jetty', marineEvidence: 'breakwater' };
  if (/ferry terminal|harbour|harbor|port/.test(name)) return { serviceType: 'transport', subtype: 'port' };
  return null;
}

function sourceUrl(element: OsmElement): string {
  return `https://api.openstreetmap.org/api/0.6/${element.type}/${element.id}.json`;
}

async function queryRegional<T>(queries: string[]): Promise<Array<{ endpoint: string; data: T }>> {
  const results: Array<{ endpoint: string; data: T }> = [];
  for (const query of queries) {
    for (const regionalBbox of regionalBboxes) {
      results.push(await queryOverpass<T>(query.replaceAll(bbox, regionalBbox)));
    }
  }
  return results;
}

function normalizeServices(elements: OsmElement[]): NormalizedService[] {
  const seen = new Set<string>();
  return elements.flatMap((element) => {
    if (!element.type || typeof element.id !== 'number') return [];
    const point = pointFor(element);
    const classification = serviceClass(element.tags ?? {});
    if (!point || !classification) return [];
    const id = `osm:${element.type}:${element.id}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        osm_type: element.type,
        osm_id: element.id,
        service_type: classification.serviceType,
        subtype: classification.subtype,
        ...(classification.marineEvidence ? { marine_evidence: classification.marineEvidence } : {}),
        name: nameFor(element.tags ?? {}),
        latitude: point[1],
        longitude: point[0],
        geometry: geometryFor(element, point),
        tags: element.tags ?? {},
        source: 'OpenStreetMap',
        source_object_id: id,
        source_url: sourceUrl(element)
      }
    ];
  });
}

function coordinatesFor(element: OsmElement): Position[] {
  return (element.geometry ?? []).flatMap((point) =>
    typeof point.lon === 'number' && typeof point.lat === 'number' ? ([[point.lon, point.lat]] as Position[]) : []
  );
}

function appendCoordinates(target: Position[], points: Position[]): void {
  for (const point of points) {
    const previous = target.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) target.push(point);
  }
}

function normalizeRoutes(elements: OsmElement[]): NormalizedRoute[] {
  const ways = new Map<number, Position[]>();
  for (const element of elements) {
    if (element.type !== 'way' || typeof element.id !== 'number') continue;
    const coordinates = coordinatesFor(element);
    if (coordinates.length >= 2) ways.set(element.id, coordinates);
  }

  const routes: NormalizedRoute[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    if (!element.type || typeof element.id !== 'number') continue;
    const tags = element.tags ?? {};
    const isRoute =
      (element.type === 'relation' && lower(tags.route) === 'ferry') ||
      (element.type === 'way' && (lower(tags.route) === 'ferry' || lower(tags.ferry) === 'yes'));
    if (!isRoute) continue;
    const id = `osm:${element.type}:${element.id}`;
    if (seen.has(id)) continue;
    const coordinates: Position[] = [];
    if (element.type === 'relation') {
      for (const member of element.members ?? []) {
        if (member.type !== 'way' || typeof member.ref !== 'number') continue;
        const geometry = ways.get(member.ref);
        if (!geometry) continue;
        appendCoordinates(coordinates, member.role === 'backward' ? [...geometry].reverse() : geometry);
      }
    } else {
      appendCoordinates(coordinates, coordinatesFor(element));
    }
    if (coordinates.length < 2) continue;
    seen.add(id);
    routes.push({
      id,
      osm_type: element.type,
      osm_id: element.id,
      name: nameFor(tags),
      route_type: 'ferry',
      geometry: { type: 'LineString', coordinates },
      passenger_eligible: lower(tags.passenger) !== 'no' && lower(tags.foot) !== 'no',
      tags,
      source: 'OpenStreetMap',
      source_object_id: id,
      source_url: sourceUrl(element),
      modeled: false
    });
  }
  return routes;
}

const serviceResults = await queryRegional<OsmPayload>(serviceQueries);
const marineResults = await queryRegional<OsmPayload>(marineQueries);
const routeWayResults = await queryRegional<OsmPayload>([routeWayRouteQuery, routeWayTagQuery]);
const routeRelationResults = await queryRegional<OsmPayload>([routeRelationQuery]);
const services = normalizeServices([
  ...serviceResults.flatMap((result) => result.data.elements ?? []),
  ...marineResults.flatMap((result) => result.data.elements ?? [])
]);
const marineServices = services.filter((service) => service.service_type === 'transport');
const routes = normalizeRoutes([
  ...routeWayResults.flatMap((result) => result.data.elements ?? []),
  ...routeRelationResults.flatMap((result) => result.data.elements ?? [])
]);
const generatedAt = new Date().toISOString();

mkdirSync(outputRoot, { recursive: true });
writeFileSync(
  resolve(outputRoot, 'osm-services.json'),
  `${JSON.stringify(
    {
      schema_version: 'osm-services-v1',
      source: 'OpenStreetMap',
      generated_at: generatedAt,
      endpoint: serviceResults[0].endpoint,
      query: serviceQueries,
      query_bboxes: regionalBboxes,
      services
    },
    null,
    2
  )}\n`
);
writeFileSync(
  resolve(outputRoot, 'osm-marine.json'),
  `${JSON.stringify(
    {
      schema_version: 'osm-marine-v1',
      source: 'OpenStreetMap',
      generated_at: generatedAt,
      endpoint: marineResults[0].endpoint,
      service_query: marineQueries,
      query_bboxes: regionalBboxes,
      route_way_query: [routeWayRouteQuery, routeWayTagQuery],
      route_relation_query: [routeRelationQuery],
      services: marineServices,
      routes
    },
    null,
    2
  )}\n`
);
writeFileSync(
  resolve(outputRoot, 'osm-manifest.json'),
  `${JSON.stringify(
    {
      schema_version: 'osm-mobility-manifest-v1',
      generated_at: generatedAt,
      user_agent: 'MobilitySandboxMV/0.1 (contact: mafaaz708+osm@gmail.com)',
      source: 'OpenStreetMap',
      services: {
        endpoints: [
          ...serviceResults.map((result) => result.endpoint),
          ...marineResults.map((result) => result.endpoint)
        ],
        count: services.length
      },
      service_queries: serviceQueries,
      marine_queries: marineQueries,
      marine_services: marineServices.length,
      ferry_routes: {
        endpoints: [
          ...routeWayResults.map((result) => result.endpoint),
          ...routeRelationResults.map((result) => result.endpoint)
        ],
        count: routes.length
      }
    },
    null,
    2
  )}\n`
);

console.log(
  JSON.stringify(
    {
      outputRoot,
      services: services.length,
      healthServices: services.filter((service) => service.service_type === 'health').length,
      educationServices: services.filter((service) => service.service_type === 'education').length,
      marineServices: marineServices.length,
      ferryRoutes: routes.length,
      serviceEndpoint: serviceResults[0].endpoint,
      marineEndpoints: marineResults.map((result) => result.endpoint),
      routeEndpoints: [
        ...routeWayResults.map((result) => result.endpoint),
        ...routeRelationResults.map((result) => result.endpoint)
      ]
    },
    null,
    2
  )
);
