import type { FitBoundsOptions, LngLatBoundsLike, Map } from 'maplibre-gl';

export type LatLng = { lat: number; lng: number };
export type LatLngTuple = [number, number];

export function latLngsToLineString(coords: LatLngTuple[]): GeoJSON.Position[] {
  return coords.map(([lat, lng]) => [lng, lat]);
}

export function latLngBoundsToMapLibre(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
}): LngLatBoundsLike {
  return [
    [bounds.west, bounds.south],
    [bounds.east, bounds.north],
  ];
}

export function coordsToBounds(coords: LatLngTuple[]): LngLatBoundsLike {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lat, lng] of coords) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

function isFiniteCoord(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/** True when bounds are a valid southwest/northeast pair (not empty / Infinity). */
export function isValidLngLatBounds(bounds: LngLatBoundsLike): boolean {
  if (!Array.isArray(bounds) || bounds.length !== 2) return false;
  const sw = bounds[0];
  const ne = bounds[1];
  if (!Array.isArray(sw) || !Array.isArray(ne) || sw.length < 2 || ne.length < 2) return false;
  const [west, south] = sw;
  const [east, north] = ne;
  return isFiniteCoord(west, south) && isFiniteCoord(east, north) && west <= east && south <= north;
}

export type SafeFitBoundsOpts = {
  padding?: FitBoundsOptions['padding'];
  maxZoom?: number;
  duration?: number;
};

/** fitBounds wrapper — omits undefined maxZoom/duration (undefined maxZoom → NaN in MapLibre). */
export function safeFitBounds(map: Map, bounds: LngLatBoundsLike, opts: SafeFitBoundsOpts = {}): boolean {
  if (!isValidLngLatBounds(bounds)) return false;

  const options: FitBoundsOptions = {};
  if (opts.padding != null) options.padding = opts.padding;
  if (Number.isFinite(opts.maxZoom)) options.maxZoom = opts.maxZoom;
  if (Number.isFinite(opts.duration)) options.duration = opts.duration;

  try {
    map.fitBounds(bounds, options);
    return true;
  } catch {
    return false;
  }
}

export function containerPointToLatLng(
  map: Map,
  x: number,
  y: number,
): { lat: number; lng: number } {
  const ll = map.unproject([x, y]);
  return { lat: ll.lat, lng: ll.lng };
}

export function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Trim a polyline to a fraction of its path length (0–1). Coords are [lat, lng]. */
export function trimPolylineByFraction(latLngs: LatLngTuple[], fraction: number): LatLngTuple[] {
  if (latLngs.length === 0) return [];
  if (fraction <= 0) return [latLngs[0]];
  if (fraction >= 1) return latLngs;
  if (latLngs.length < 2) return latLngs;

  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < latLngs.length; i++) {
    const d = haversineMi(latLngs[i - 1][0], latLngs[i - 1][1], latLngs[i][0], latLngs[i][1]);
    segLens.push(d);
    total += d;
  }
  if (total <= 0) return latLngs.slice(0, 2);

  const target = total * fraction;
  let acc = 0;
  const out: LatLngTuple[] = [latLngs[0]];
  for (let i = 0; i < segLens.length; i++) {
    const seg = segLens[i];
    if (acc + seg >= target) {
      const t = (target - acc) / seg;
      const [lat0, lng0] = latLngs[i];
      const [lat1, lng1] = latLngs[i + 1];
      out.push([lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t]);
      return out;
    }
    acc += seg;
    out.push(latLngs[i + 1]);
  }
  return latLngs;
}

export function computeLinearProgressWithPause(
  elapsedMs: number,
  durationMs: number,
  pauseAtLinear: number,
  pauseMs: number,
): number {
  const pauseStart = durationMs * pauseAtLinear;
  let effective = elapsedMs;
  if (elapsedMs > pauseStart) {
    effective = pauseStart + Math.max(0, elapsedMs - pauseStart - pauseMs);
  }
  return Math.min(1, effective / durationMs);
}
