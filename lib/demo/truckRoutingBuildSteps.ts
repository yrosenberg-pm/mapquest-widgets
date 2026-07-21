/** Ordered reveal steps for the video mock Truck Routing assembly. */
export const TRUCK_ROUTING_BUILD_STEPS = [
  'card',
  'header-icon',
  'header-title',
  'header-subtitle',
  'vehicle-profile-label',
  'field-height',
  'field-weight',
  'field-width',
  'field-length',
  'field-max-elevation',
  'field-truck-pois',
  'route-label',
  'origin-shell',
  'origin-fill',
  'dest-shell',
  'dest-fill',
  'departure',
  'cta-button',
  'map-panel',
  'map-image',
  'route-trace',
  'footer',
] as const;

export type TruckRoutingBuildStepId = (typeof TRUCK_ROUTING_BUILD_STEPS)[number];

export function buildStepIndex(id: TruckRoutingBuildStepId): number {
  return TRUCK_ROUTING_BUILD_STEPS.indexOf(id);
}

/** Base pause after each step is revealed (jittered ±40% at runtime). */
export const BUILD_STEP_BASE_DELAY_MS: Record<TruckRoutingBuildStepId, number> = {
  card: 400,
  'header-icon': 110,
  'header-title': 110,
  'header-subtitle': 140,
  'vehicle-profile-label': 180,
  'field-height': 180,
  'field-weight': 180,
  'field-width': 180,
  'field-length': 180,
  'field-max-elevation': 180,
  'field-truck-pois': 200,
  'route-label': 180,
  'origin-shell': 200,
  'origin-fill': 500,
  'dest-shell': 200,
  'dest-fill': 480,
  departure: 180,
  'cta-button': 200,
  'map-panel': 220,
  'map-image': 280,
  'route-trace': 200,
  footer: 180,
};

export const DEMO_ORIGIN = '126 S Gregson St, Durham, NC 27701';
export const DEMO_DESTINATION = '310 S Gregson St, Durham, NC 27701';
