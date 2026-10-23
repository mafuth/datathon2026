import type { LucideIcon } from '@lucide/svelte';
import type { ServiceDemandCategory } from '$components/mobility/island-services';

import Accessibility from '@lucide/svelte/icons/accessibility';
import Baby from '@lucide/svelte/icons/baby';
import Blocks from '@lucide/svelte/icons/blocks';
import BookOpen from '@lucide/svelte/icons/book-open';
import BookOpenCheck from '@lucide/svelte/icons/book-open-check';
import Bus from '@lucide/svelte/icons/bus';
import BusFront from '@lucide/svelte/icons/bus-front';
import CarTaxiFront from '@lucide/svelte/icons/car-taxi-front';
import Cross from '@lucide/svelte/icons/cross';
import Dock from '@lucide/svelte/icons/dock';
import GraduationCap from '@lucide/svelte/icons/graduation-cap';
import HeartPulse from '@lucide/svelte/icons/heart-pulse';
import Helicopter from '@lucide/svelte/icons/helicopter';
import Hospital from '@lucide/svelte/icons/hospital';
import Landmark from '@lucide/svelte/icons/landmark';
import Pill from '@lucide/svelte/icons/pill';
import Plane from '@lucide/svelte/icons/plane';
import PlaneLanding from '@lucide/svelte/icons/plane-landing';
import Route from '@lucide/svelte/icons/route';
import School from '@lucide/svelte/icons/school';
import Ship from '@lucide/svelte/icons/ship';
import SquareParking from '@lucide/svelte/icons/square-parking';
import Stethoscope from '@lucide/svelte/icons/stethoscope';
import Syringe from '@lucide/svelte/icons/syringe';
import UserRound from '@lucide/svelte/icons/user-round';

import DentalIcon from '$components/mobility/dental-icon.svelte';

type ServiceAppearance = Readonly<{ Icon: LucideIcon; label: string }>;

// Keep the same visual meaning in map markers, popups and the proposal library.
const SERVICE_APPEARANCES: Record<ServiceDemandCategory, Readonly<Record<string, ServiceAppearance>>> = {
  health: {
    hospital: { Icon: Hospital, label: 'Hospital' },
    clinic: { Icon: Stethoscope, label: 'Clinic' },
    health_center: { Icon: HeartPulse, label: 'Health centre' },
    pharmacy: { Icon: Pill, label: 'Pharmacy' },
    doctors: { Icon: UserRound, label: 'Doctor' },
    dentist: { Icon: DentalIcon, label: 'Dentist' },
    vaccination_centre: { Icon: Syringe, label: 'Vaccination centre' },
    rehabilitation: { Icon: Accessibility, label: 'Rehabilitation' }
  },
  education: {
    preschool: { Icon: Blocks, label: 'Preschool' },
    kindergarten: { Icon: Baby, label: 'Kindergarten' },
    school: { Icon: School, label: 'School' },
    high_school: { Icon: BookOpen, label: 'High school' },
    college: { Icon: BookOpenCheck, label: 'College' },
    tertiary: { Icon: GraduationCap, label: 'Tertiary education' },
    university: { Icon: Landmark, label: 'University' }
  },
  transport: {
    bus_stop: { Icon: BusFront, label: 'Bus stop' },
    bus_station: { Icon: Bus, label: 'Bus station' },
    public_transport: { Icon: Route, label: 'Public transport' },
    port: { Icon: Ship, label: 'Port' },
    jetty: { Icon: Dock, label: 'Jetty' },
    airport: { Icon: Plane, label: 'Airport' },
    air_terminal: { Icon: PlaneLanding, label: 'Air terminal' },
    helipad: { Icon: Helicopter, label: 'Helipad' },
    taxi: { Icon: CarTaxiFront, label: 'Taxi' },
    parking: { Icon: SquareParking, label: 'Parking' }
  }
};

const FALLBACK_APPEARANCES: Record<ServiceDemandCategory, ServiceAppearance> = {
  health: { Icon: Cross, label: 'Health service' },
  education: { Icon: GraduationCap, label: 'Education service' },
  transport: { Icon: Route, label: 'Transport service' }
};

const SUBTYPE_ALIASES: Readonly<Record<string, string>> = {
  health_centre: 'health_center',
  vaccination_center: 'vaccination_centre',
  doctor: 'doctors',
  dental: 'dentist',
  aerodrome: 'airport',
  harbour: 'port',
  harbor: 'port',
  pier: 'jetty'
};

export function serviceAppearance(serviceType: ServiceDemandCategory, subtype: string): ServiceAppearance {
  const normalized = subtype
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const canonical = Object.hasOwn(SUBTYPE_ALIASES, normalized) ? SUBTYPE_ALIASES[normalized] : normalized;
  const appearances = SERVICE_APPEARANCES[serviceType];
  return Object.hasOwn(appearances, canonical) ? appearances[canonical] : FALLBACK_APPEARANCES[serviceType];
}

export function serviceMarkerLabel(service: {
  serviceType: ServiceDemandCategory;
  subtype: string;
  name: string | null;
}): string {
  const { label } = serviceAppearance(service.serviceType, service.subtype);
  const name = service.name?.trim();
  return name && name.toLowerCase() !== label.toLowerCase() ? `${name} · ${label}` : label;
}
