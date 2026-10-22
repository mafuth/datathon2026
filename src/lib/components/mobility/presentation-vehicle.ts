import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';

import { base } from '$app/paths';

import './presentation-vehicle.css';

export type PresentationVehicleMode = 'ferry' | 'aircraft' | 'bus' | 'walk' | 'car';

type Coordinate = [number, number];

export type PresentationVehicleMarker = {
  update: (coordinates: Coordinate, bearing: number, moving: boolean) => void;
  remove: () => void;
};

// North-facing silhouettes keep the journey readable while the larger image loads.
const FALLBACK_SYMBOLS: Record<PresentationVehicleMode, string> = {
  ferry:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56"><path d="M24 4C16 10 12 20 13 33L17 50H31L35 33C36 20 32 10 24 4Z" fill="#607d8a" stroke="#fffefa" stroke-width="1.2"/><path d="M24 11C19 17 16 24 17 33L20 45H28L31 33C32 24 29 17 24 11Z" fill="#f3efe0"/><rect x="19" y="23" width="10" height="14" rx="2" fill="#36585f"/><path d="M20 24H28V27H20Z" fill="#a9ccd2"/><path d="M21 28H27V35H21Z" fill="#fffefa"/></svg>',
  aircraft:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56"><path d="M24 4C21.5 5 21 8 21 13V20L4 28V32L21 28L21.5 41L14 46V49L23 46L24 51L25 46L34 49V46L26.5 41L27 28L44 32V28L27 20V13C27 8 26.5 5 24 4Z" fill="#f3efe0" stroke="#36585f" stroke-width="1.2"/><path d="M22 11Q24 8.5 26 11L25.5 14H22.5Z" fill="#28444f"/></svg>',
  bus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56"><rect x="10" y="4" width="28" height="48" rx="7" fill="#487a73" stroke="#fffefa" stroke-width="2"/><path d="M15 12Q24 8 33 12V21H15Z" fill="#d7eeec"/><rect x="15" y="25" width="18" height="15" rx="2" fill="#f3efe0"/><path d="M16 44H32" stroke="#c2dfd6" stroke-width="3"/><path d="M8 15H11M37 15H40" stroke="#28444f" stroke-width="3"/><circle cx="16" cy="8" r="1.5" fill="#fffefa"/><circle cx="32" cy="8" r="1.5" fill="#fffefa"/></svg>',
  car: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56"><path d="M15 8Q24 4 33 8L37 19V44Q37 50 31 51H17Q11 50 11 44V19Z" fill="#e9bc67" stroke="#fffefa" stroke-width="2"/><path d="M16 20L19 13H29L32 20V24H16Z" fill="#36585f"/><rect x="16" y="27" width="16" height="13" rx="2" fill="#f3efe0"/><path d="M16 43H32V46H16Z" fill="#36585f"/><path d="M15 9H20M28 9H33" stroke="#fffefa" stroke-width="2"/></svg>',
  walk: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56"><circle cx="24" cy="27" r="20" fill="#fffefa" stroke="#487a73" stroke-width="2"/><circle cx="26" cy="13" r="4" fill="#36585f"/><path d="M23 21L19 30L13 31M24 21L28 27L34 28M23 22L25 32L31 41M25 32L19 42" fill="none" stroke="#36585f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const VEHICLE_ASSETS: Partial<Record<PresentationVehicleMode, string>> = {
  ferry: `${base}/images/scenario-ferry.svg`,
  aircraft: `${base}/images/scenario-airplane.png`
};
let preloadedImages: HTMLImageElement[] | null = null;

export function preloadPresentationVehicles(): void {
  if (typeof Image === 'undefined' || preloadedImages) return;
  preloadedImages = Object.values(VEHICLE_ASSETS).map((source) => {
    const image = new Image();
    image.loading = 'eager';
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.src = source;
    void image.decode().catch(() => {});
    return image;
  });
}

export function presentationVehicleBearing(from: Coordinate, to: Coordinate): number {
  const radians = Math.PI / 180;
  const startLatitude = from[1] * radians;
  const endLatitude = to[1] * radians;
  const longitudeDelta = (to[0] - from[0]) * radians;
  const east = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const north =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(east, north) / radians + 360) % 360;
}

export function createPresentationVehicle(
  map: MapLibreMap,
  Marker: typeof MapLibreMarker,
  mode: PresentationVehicleMode,
  coordinates: Coordinate
): PresentationVehicleMarker {
  preloadPresentationVehicles();
  const element = document.createElement('div');
  element.className = 'presentation-journey-vehicle';
  element.dataset.mode = mode;
  element.dataset.moving = 'false';
  element.setAttribute('aria-hidden', 'true');

  const tail = document.createElement('span');
  tail.className = 'presentation-journey-vehicle-tail';
  const fallback = document.createElement('img');
  fallback.alt = '';
  fallback.draggable = false;
  fallback.loading = 'eager';
  fallback.src = `data:image/svg+xml,${encodeURIComponent(FALLBACK_SYMBOLS[mode])}`;
  const image = document.createElement('img');
  image.alt = '';
  image.draggable = false;
  image.loading = 'eager';
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.hidden = true;
  const showArtwork = () => {
    if (image.naturalWidth === 0) return;
    fallback.hidden = true;
    image.hidden = false;
  };
  image.onload = showArtwork;
  image.onerror = () => {
    fallback.hidden = false;
    image.hidden = true;
  };
  const artworkSource = VEHICLE_ASSETS[mode];
  if (artworkSource) image.src = artworkSource;
  element.append(tail, fallback, image);
  if (artworkSource && image.complete) showArtwork();

  // A DOM marker survives map style changes and cannot collide with route labels.
  const marker = new Marker({
    element,
    anchor: 'center',
    rotationAlignment: 'map',
    pitchAlignment: 'viewport',
    subpixelPositioning: true
  })
    .setLngLat(coordinates)
    .addTo(map);

  return {
    update(position, bearing, moving) {
      element.dataset.moving = String(moving);
      marker.setLngLat(position).setRotation(mode === 'walk' ? 0 : bearing);
    },
    remove() {
      image.onload = null;
      image.onerror = null;
      marker.remove();
    }
  };
}
