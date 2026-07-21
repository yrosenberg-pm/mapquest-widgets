/** Slate-navy chrome accent for the /demo video page (UI only). */
export const DEMO_ACCENT = '#3A5A85';

/** Classic routing blue for the drawn route line (distinct from UI accent). */
export const DEMO_ROUTE_BLUE = '#1A73E8';

export const DEMO_MAP_CENTER = { lat: 35.994, lng: -78.901, zoom: 13 } as const;

/** Display-only vehicle profile (matches DEFAULT_VEHICLE in lib/truckRouting/directions). */
export const DEMO_VEHICLE_PROFILE = {
  height: 13.5,
  weight: 20,
  length: 48,
  width: 8.5,
  axleCount: 5,
} as const;
