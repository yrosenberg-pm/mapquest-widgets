export type Open511EventStatus = 'ACTIVE' | 'ARCHIVED';
export type Open511EventType =
  | 'CONSTRUCTION'
  | 'SPECIAL_EVENT'
  | 'INCIDENT'
  | 'WEATHER_CONDITION'
  | 'ROAD_CONDITION';
export type Open511Severity = 'MINOR' | 'MODERATE' | 'MAJOR' | 'UNKNOWN';

export type Open511Point = { type: 'Point'; coordinates: [number, number] }; // [lng,lat]
export type Open511MultiLineString = {
  type: 'MultiLineString';
  coordinates: Array<Array<[number, number]>>; // [[[lng,lat],...],...]
};

export type Open511Road = {
  name?: string;
  from?: string;
  to?: string;
  direction?: string;
  state?: string;
};

export type Open511Event = {
  id: string;
  url?: string;
  status: Open511EventStatus;
  headline: string;
  event_type: Open511EventType;
  severity: Open511Severity;
  created?: string;
  updated?: string;
  geography?: Open511Point;
  roads?: Open511Road[];
  // Spec uses an extension field "+closure_geography" in examples.
  // We keep it optional and permissive.
  ['+closure_geography']?: Open511MultiLineString;
};

export type Open511EventsResponse = {
  events?: Open511Event[];
  pagination?: { offset?: number; next_url?: string };
  meta?: any;
};

export function open511PointToLatLng(p?: Open511Point | null): { lat: number; lng: number } | null {
  if (!p || p.type !== 'Point' || !Array.isArray(p.coordinates) || p.coordinates.length < 2) return null;
  const [lng, lat] = p.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function open511ClosureToPolylines(
  closure?: Open511MultiLineString | null
): Array<{ coords: Array<{ lat: number; lng: number }> }> {
  if (!closure || closure.type !== 'MultiLineString' || !Array.isArray(closure.coordinates)) return [];
  const out: Array<{ coords: Array<{ lat: number; lng: number }> }> = [];
  for (const line of closure.coordinates) {
    if (!Array.isArray(line) || line.length < 2) continue;
    const coords: Array<{ lat: number; lng: number }> = [];
    for (const pt of line) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const [lng, lat] = pt;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      coords.push({ lat, lng });
    }
    if (coords.length >= 2) out.push({ coords });
  }
  return out;
}

export function bboxFromLatLngs(
  pts: Array<{ lat: number; lng: number }>,
  padRatio = 0.06
): { west: number; south: number; east: number; north: number } | null {
  if (!pts || pts.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }
  if (![north, south, east, west].every(Number.isFinite)) return null;
  const dLat = north - south;
  const dLng = east - west;
  const padLat = dLat === 0 ? 0.02 : dLat * padRatio;
  const padLng = dLng === 0 ? 0.02 : dLng * padRatio;
  return { west: west - padLng, south: south - padLat, east: east + padLng, north: north + padLat };
}

