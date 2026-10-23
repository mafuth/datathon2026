export type ConnectionNetworkIsland = {
  id: string;
  name: string;
  atollName: string;
  islandType: string;
  centroid: [number, number];
};

export type ConnectionNetworkDirectoryIsland = {
  id: string;
  name: string;
  atollName: string;
  islandType: string;
  centroid: [number, number];
};

export type ConnectionNetworkStop = {
  id: string;
  islandId: string;
  name: string | null;
  subtype: string;
  mode: 'land' | 'marine' | 'air';
  routeIds: string[];
  connectedIslandIds: string[];
};

export type ConnectionNetworkLink = {
  id: string;
  routeId: string | null;
  sequence: number | null;
  tripId: string | null;
  mode: 'land' | 'marine' | 'air';
  fromStopId: string | null;
  toStopId: string | null;
  fromTerminalEvidence: string;
  toTerminalEvidence: string;
  fromIslandId: string;
  toIslandId: string;
  connectionType: string;
  routeType: string;
  directionality: string;
  distanceM: number | null;
  routeName: string | null;
  source: string;
  sourceObjectId: string;
  modeled: boolean;
  scoreEligible: boolean;
};

export type ConnectionNetworkResponse = {
  status: 'partial';
  islands: ConnectionNetworkIsland[];
  islandDirectory: ConnectionNetworkDirectoryIsland[];
  stops: ConnectionNetworkStop[];
  connections: ConnectionNetworkLink[];
  limitations: string[];
  provenance: {
    source: 'current-mobility-database' | 'current-mobility-database+packaged-source-topology';
    islands: string;
    connections: string;
  };
  baselineVersion: string;
};
