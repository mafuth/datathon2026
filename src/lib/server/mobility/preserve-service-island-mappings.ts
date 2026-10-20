export type ServiceIslandMapping = {
  id: string;
  islandId: string | null;
};

export function preserveExistingServiceIslandMappings<T extends ServiceIslandMapping>(
  services: T[],
  existingMappings: ReadonlyMap<string, string>
): T[] {
  return services.map((service) => {
    const existingIslandId = existingMappings.get(service.id);
    return existingIslandId ? { ...service, islandId: existingIslandId } : service;
  });
}
