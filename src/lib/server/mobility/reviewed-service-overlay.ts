export type ReviewedServiceMapping = {
  service_id: string;
  island_id: string;
  disposition: string;
  service_type?: string;
  confidence?: string;
  source_urls?: string[];
  retrieved_at?: string;
  reason?: string;
  evidence_note?: string;
};

export function confirmedServiceMappings(
  reviewEntries: ReviewedServiceMapping[],
  overrideEntries: ReviewedServiceMapping[] = []
): Map<string, string> {
  const mappings = new Map<string, string>();
  for (const entry of [...reviewEntries, ...overrideEntries]) {
    if (entry.disposition !== 'confirmed') continue;
    const existing = mappings.get(entry.service_id);
    if (existing && existing !== entry.island_id) {
      throw new Error(`Conflicting confirmed island mappings for ${entry.service_id}`);
    }
    mappings.set(entry.service_id, entry.island_id);
  }
  return mappings;
}

export function applyConfirmedServiceMappings<T extends { id: string; island_id?: string | null }>(
  records: T[],
  mappings: Map<string, string>
): T[] {
  return records.map((record) => {
    const islandId = mappings.get(record.id);
    return islandId && record.island_id === null ? { ...record, island_id: islandId } : record;
  });
}
