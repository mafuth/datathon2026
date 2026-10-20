export type ServiceIslandMapping = {
  id: string;
  islandId: string | null;
};

export type ServiceIslandMappingAudit = {
  confirmedUniqueMappings: number;
  confirmedMappingsAppliedToSeedServiceRows: number;
  existingNonNullMappingsPreserved: number;
  nonConfirmedRowsExcluded: number;
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

export function auditServiceIslandMappings<T extends ServiceIslandMapping>(
  services: T[],
  confirmedMappings: ReadonlyMap<string, string>,
  existingMappings: ReadonlyMap<string, string>,
  nonConfirmedServiceIds: readonly string[]
): ServiceIslandMappingAudit {
  const serviceById = new Map(services.map((service) => [service.id, service]));
  return {
    confirmedUniqueMappings: confirmedMappings.size,
    confirmedMappingsAppliedToSeedServiceRows: [...confirmedMappings].filter(
      ([serviceId, islandId]) => serviceById.get(serviceId)?.islandId === islandId
    ).length,
    existingNonNullMappingsPreserved: [...existingMappings].filter(
      ([serviceId, islandId]) =>
        serviceById.get(serviceId)?.islandId === undefined || serviceById.get(serviceId)?.islandId === islandId
    ).length,
    nonConfirmedRowsExcluded: nonConfirmedServiceIds.filter((serviceId) => serviceById.has(serviceId)).length
  };
}

export function assertServiceIslandMappings(
  actualMappings: ReadonlyMap<string, string | null | undefined>,
  expectedMappings: ReadonlyMap<string, string>,
  label: string
): void {
  for (const [serviceId, expectedIslandId] of expectedMappings) {
    const actualIslandId = actualMappings.get(serviceId);
    if (actualIslandId !== expectedIslandId) {
      throw new Error(
        `${label} mapping changed for ${serviceId}: expected ${expectedIslandId}, got ${actualIslandId ?? 'null'}`
      );
    }
  }
}
