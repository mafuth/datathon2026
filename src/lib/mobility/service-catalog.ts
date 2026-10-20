import type { ServiceDemandCategory } from '$components/mobility/island-services';

export const ADDABLE_SERVICE_TYPES = [
  'health',
  'education',
  'transport'
] as const satisfies readonly ServiceDemandCategory[];

export const SERVICE_DRAG_MIME = 'application/x-mobility-service';

export const ADDABLE_SERVICE_SUBTYPES = [
  'clinic',
  'health_center',
  'hospital',
  'preschool',
  'school',
  'high_school',
  'tertiary',
  'bus_stop',
  'bus_station',
  'public_transport',
  'port',
  'jetty',
  'airport',
  'air_terminal',
  'helipad'
] as const;

export type AddableServiceType = (typeof ADDABLE_SERVICE_TYPES)[number];
export type AddableServiceSubtype = (typeof ADDABLE_SERVICE_SUBTYPES)[number];

export type ServiceCatalogEntry = {
  serviceType: AddableServiceType;
  subtype: AddableServiceSubtype;
  label: string;
};

export type AddServiceSelection = {
  serviceType: AddableServiceType;
  subtype: AddableServiceSubtype;
  name: string | null;
};

export const SERVICE_TYPE_OPTIONS = [
  { value: 'health', label: 'Health' },
  { value: 'education', label: 'Education' },
  { value: 'transport', label: 'Transport' }
] as const satisfies readonly { value: AddableServiceType; label: string }[];

export const SERVICE_CATALOG = [
  { serviceType: 'health', subtype: 'clinic', label: 'Clinic' },
  { serviceType: 'health', subtype: 'health_center', label: 'Health centre' },
  { serviceType: 'health', subtype: 'hospital', label: 'Hospital' },
  { serviceType: 'education', subtype: 'preschool', label: 'Preschool' },
  { serviceType: 'education', subtype: 'school', label: 'School' },
  { serviceType: 'education', subtype: 'high_school', label: 'High school' },
  { serviceType: 'education', subtype: 'tertiary', label: 'College' },
  { serviceType: 'transport', subtype: 'bus_stop', label: 'Bus stop' },
  { serviceType: 'transport', subtype: 'bus_station', label: 'Bus station' },
  { serviceType: 'transport', subtype: 'public_transport', label: 'Public transport' },
  { serviceType: 'transport', subtype: 'port', label: 'Port' },
  { serviceType: 'transport', subtype: 'jetty', label: 'Jetty' },
  { serviceType: 'transport', subtype: 'airport', label: 'Airport' },
  { serviceType: 'transport', subtype: 'air_terminal', label: 'Air terminal' },
  { serviceType: 'transport', subtype: 'helipad', label: 'Helipad' }
] as const satisfies readonly ServiceCatalogEntry[];

export function serviceCatalogEntriesFor(serviceType: AddableServiceType): readonly ServiceCatalogEntry[] {
  return SERVICE_CATALOG.filter((entry) => entry.serviceType === serviceType);
}

export function serviceCatalogEntry(serviceType: string, subtype: string): ServiceCatalogEntry | null {
  return SERVICE_CATALOG.find((entry) => entry.serviceType === serviceType && entry.subtype === subtype) ?? null;
}

export function isTransportStopSubtype(serviceType: string, subtype: string): boolean {
  return serviceType === 'transport' && serviceCatalogEntry(serviceType, subtype) !== null;
}
