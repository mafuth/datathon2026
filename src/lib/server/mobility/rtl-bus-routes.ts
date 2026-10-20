export type RtlRouteStop = {
  id?: unknown;
  code?: unknown;
  order?: unknown;
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

export type RtlRouteDetails = {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  routeNumber?: unknown;
  busRouteStopList?: RtlRouteStop[];
};

export type RtlRouteResponseEntry = RtlRouteDetails & {
  routeResponse?: RtlRouteResponseEntry[];
  atollRouteResponse?: RtlRouteResponseEntry[];
};

export function flattenRtlRouteDetails(entries: RtlRouteResponseEntry[]): RtlRouteDetails[] {
  return entries.flatMap((entry) => {
    const nestedEntries = [
      ...(Array.isArray(entry.routeResponse) ? entry.routeResponse : []),
      ...(Array.isArray(entry.atollRouteResponse) ? entry.atollRouteResponse : [])
    ];
    const nestedRoutes = flattenRtlRouteDetails(nestedEntries);
    return entry.busRouteStopList ? [{ ...entry, routeResponse: undefined }, ...nestedRoutes] : nestedRoutes;
  });
}
