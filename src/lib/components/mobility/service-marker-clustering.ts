import type { IslandMapService } from './island-services';

import { themeColor } from '$lib/config/theme/theme-tokens';

export type Coordinate = [number, number];

export type ServiceMarkerFeature = {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: Coordinate };
  properties: { serviceId: string; serviceType: IslandMapService['serviceType'] };
};

export type ServiceMarkerCollection = {
  type: 'FeatureCollection';
  features: ServiceMarkerFeature[];
};

export type ClusterMarkerData = {
  clusterId: number;
  coordinates: Coordinate;
  total: number;
  healthCount: number;
  educationCount: number;
  transportCount: number;
};

export const SERVICE_MARKER_SOURCE_ID = 'service-markers';
export const SERVICE_MARKER_ANCHOR_LAYER_ID = 'service-marker-anchor';
export const SERVICE_MARKER_CLUSTER_RADIUS = 56;
export const SERVICE_MARKER_CLUSTER_MAX_ZOOM = 15;
export const SERVICE_MARKER_COLORS = {
  health: themeColor('--mobility-chart-health'),
  education: themeColor('--mobility-chart-education'),
  transport: themeColor('--mobility-chart-transport')
} as const;
export const EMPTY_SERVICE_MARKERS: ServiceMarkerCollection = { type: 'FeatureCollection', features: [] };

export function isProposalServiceMarker(service: Pick<IslandMapService, 'id' | 'change'>): boolean {
  return (
    service.change !== 'deleted' &&
    (service.id.startsWith('draft:') || (service.change !== undefined && service.change !== 'unchanged'))
  );
}

export function serviceMarkerCollection(
  services: readonly Pick<IslandMapService, 'id' | 'serviceType' | 'coordinates'>[]
): ServiceMarkerCollection {
  return {
    type: 'FeatureCollection',
    features: services.flatMap((service) =>
      service.coordinates
        ? [
            {
              type: 'Feature' as const,
              id: service.id,
              geometry: { type: 'Point' as const, coordinates: service.coordinates },
              properties: { serviceId: service.id, serviceType: service.serviceType }
            }
          ]
        : []
    )
  };
}

export function serviceMarkerPositionsMatch(
  previous: ReadonlyMap<string, Pick<IslandMapService, 'serviceType' | 'coordinates'>>,
  next: ReadonlyMap<string, Pick<IslandMapService, 'serviceType' | 'coordinates'>>
): boolean {
  if (previous.size !== next.size) return false;
  for (const [id, service] of next) {
    const prior = previous.get(id);
    if (
      !prior ||
      prior.serviceType !== service.serviceType ||
      prior.coordinates?.[0] !== service.coordinates?.[0] ||
      prior.coordinates?.[1] !== service.coordinates?.[1]
    ) {
      return false;
    }
  }
  return true;
}

export function clusterMarkerLabel(cluster: ClusterMarkerData): string {
  const categories: Array<[string, number]> = [
    ['health', cluster.healthCount],
    ['education', cluster.educationCount],
    ['transport', cluster.transportCount]
  ];
  const categoryLabel = categories
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}`)
    .join(', ');
  return `${cluster.total} services${categoryLabel ? `: ${categoryLabel}` : ''}`;
}

export function serviceClusterBackground(
  cluster: Pick<ClusterMarkerData, 'total' | 'healthCount' | 'educationCount' | 'transportCount'>
): string {
  const safeTotal = Math.max(1, cluster.total);
  const healthStop = (Math.max(0, cluster.healthCount) / safeTotal) * 100;
  const educationStop = healthStop + (Math.max(0, cluster.educationCount) / safeTotal) * 100;
  const transportStop = educationStop + (Math.max(0, cluster.transportCount) / safeTotal) * 100;

  return `conic-gradient(${SERVICE_MARKER_COLORS.health} 0% ${healthStop}%, ${SERVICE_MARKER_COLORS.education} ${healthStop}% ${educationStop}%, ${SERVICE_MARKER_COLORS.transport} ${educationStop}% ${transportStop}%)`;
}
