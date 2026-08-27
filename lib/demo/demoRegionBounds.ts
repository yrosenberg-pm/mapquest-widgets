/** Metro bounding boxes — stops outside these are not in the demo city. */
export const DEMO_REGION_BOUNDS: Record<
  string,
  { south: number; north: number; west: number; east: number }
> = {
  seattle: { south: 47.4, north: 47.85, west: -122.5, east: -122.15 },
  'los-angeles': { south: 33.7, north: 34.25, west: -118.65, east: -118.05 },
  'new-york': { south: 40.55, north: 40.92, west: -74.05, east: -73.75 },
  london: { south: 51.35, north: 51.6, west: -0.45, east: 0.15 },
  paris: { south: 48.75, north: 48.95, west: 2.15, east: 2.55 },
  berlin: { south: 52.4, north: 52.65, west: 13.25, east: 13.55 },
  tokyo: { south: 35.55, north: 35.85, west: 139.55, east: 139.85 },
  sydney: { south: -34.05, north: -33.75, west: 150.95, east: 151.35 },
  toronto: { south: 43.55, north: 43.85, west: -79.55, east: -79.25 },
  singapore: { south: 1.22, north: 1.44, west: 103.65, east: 104.05 },
  dubai: { south: 24.85, north: 25.45, west: 54.95, east: 55.55 },
  mumbai: { south: 18.9, north: 19.28, west: 72.75, east: 73.05 },
  'sao-paulo': { south: -23.75, north: -23.45, west: -46.85, east: -46.45 },
};

/** MapQuest sometimes returns this US coord when international geocoding fails. */
export function isUsFallbackCoord(lat: number, lng: number): boolean {
  return Math.abs(lat - 38.89037) < 0.02 && Math.abs(lng + 77.03196) < 0.02;
}

export function isStopInDemoRegion(
  lat: number,
  lng: number,
  regionId: string,
): boolean {
  if (isUsFallbackCoord(lat, lng)) return false;
  const bounds = DEMO_REGION_BOUNDS[regionId];
  if (!bounds) return true;
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}
