export type ConnectionCoordinate = [number, number];
export type IslandConnectionMode = 'bus' | 'ferry' | 'air' | 'land';

export type IslandConnectionRouteProperties = {
  id: string;
  label: string;
  mode: IslandConnectionMode;
  neighborId: string | null;
  neighborName: string | null;
  schematic: boolean;
  modeled: boolean;
  source: string;
  departureName?: string;
  arrivalName?: string;
  departureIslandId?: string;
  arrivalIslandId?: string;
  geometryBasis?: 'airport-link' | 'recorded-water-path' | 'coast-aware-water-path';
  shorelineAdjusted?: boolean;
  terminalVerified?: boolean;
};

export type IslandInboundFlowProperties = {
  id: string;
  originIslandId: string;
  originName: string;
  destinationIslandId: string;
  health: number;
  education: number;
  total: number;
  schematic: true;
};

export type IslandConnectionRoutes = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: { type: 'MultiLineString'; coordinates: ConnectionCoordinate[][] };
    properties: IslandConnectionRouteProperties;
  }>;
};

export type IslandInboundFlows = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: { type: 'LineString'; coordinates: ConnectionCoordinate[] };
    properties: IslandInboundFlowProperties;
  }>;
};

export type IslandConnectionsResponse = {
  islandId: string;
  islandName: string;
  center: ConnectionCoordinate | null;
  routes: IslandConnectionRoutes;
  inbound: IslandInboundFlows;
  summary: {
    routeCount: number;
    unmappedRouteCount?: number;
    sharedAirportName?: string;
    inboundSourceCount: number;
    mappedInboundSourceCount: number;
    maxInboundDemand: number;
  };
  limitations: string[];
};
