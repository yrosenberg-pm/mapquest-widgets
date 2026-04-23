/**
 * Mapillary Graph API helpers for browser use only.
 * Pass `accessToken` from `process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN` (or prop).
 * @see https://www.mapillary.com/developer/api-documentation
 */

const GRAPH = 'https://graph.mapillary.com';

const R = 6_371_000;

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}

type GeoPoint = { type: 'Point'; coordinates: [number, number] };

type GraphImage = {
  id: string;
  /** Mapillary may return an ISO string or a Unix time in ms */
  captured_at?: string | number;
  geometry?: GeoPoint;
  computed_geometry?: GeoPoint;
};

/** Normalize capture time to ISO 8601 for display. */
function capturedAtToIso(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  const s = String(raw).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  if (s.length >= 10) return s;
  return null;
}

function pointFromImage(img: GraphImage): { lat: number; lng: number } | null {
  const g = img.computed_geometry || img.geometry;
  if (g?.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [lng, lat] = g.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export type MapillaryImageCandidate = {
  id: string;
  /** ISO capture time from Graph, when available */
  capturedAt: string | null;
  /** Distance from query point (m) */
  distanceM: number;
};

const FIELDS = 'id,captured_at,geometry,computed_geometry';

function parseImages(d: { data?: GraphImage[] }): GraphImage[] {
  return d?.data ?? [];
}

/**
 * Fetches the Graph response; throws on HTTP error so the UI can show auth/network issues
 * instead of a misleading "no coverage" when the request failed.
 */
async function getJson(
  accessToken: string,
  path: string,
  search: Record<string, string>,
  attempt = 0
): Promise<{ data?: GraphImage[] }> {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', accessToken);
  Object.entries(search).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 429 && attempt < 1) {
    await new Promise((r) => setTimeout(r, 800));
    return getJson(accessToken, path, search, attempt + 1);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(
      res.status === 401 || res.status === 403
        ? `Mapillary: invalid or missing access token (HTTP ${res.status}). Check MAPILLARY_ACCESS_TOKEN in .env.`
        : `Mapillary API error (HTTP ${res.status}): ${t.slice(0, 200)}`
    );
  }
  return (await res.json()) as { data?: GraphImage[] };
}

function uniqueById(images: GraphImage[]): GraphImage[] {
  const seen = new Set<string>();
  return images.filter((img) => {
    if (seen.has(img.id)) return false;
    seen.add(img.id);
    return true;
  });
}

function imagesToCandidates(
  collected: GraphImage[],
  lat: number,
  lng: number
): MapillaryImageCandidate[] {
  const raw = uniqueById(collected);
  const withD: Array<{ img: GraphImage; d: number }> = [];
  for (const img of raw) {
    const p = pointFromImage(img);
    if (!p) continue;
    withD.push({ img, d: haversineMeters(lat, lng, p.lat, p.lng) });
  }
  withD.sort((a, b) => a.d - b.d);
  return withD.map(({ img, d }) => ({
    id: img.id,
    capturedAt: capturedAtToIso(img.captured_at),
    distanceM: d,
  }));
}

/**
 * Nearest images at a point. Radius search is capped at 50m per Mapillary; wider coverage
 * uses bbox queries. Throws on API/auth failures.
 */
export async function fetchMapillaryImagesNear(
  accessToken: string,
  lat: number,
  lng: number
): Promise<MapillaryImageCandidate[]> {
  if (!accessToken) return [];

  const collected: GraphImage[] = [];

  /** Graph API: `radius` (meters) must be <= 50 (MLYApiException otherwise). */
  const pushRadius = async (radius: string, limit: string) => {
    const n = Number(radius);
    const r = Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 50;
    const json = await getJson(accessToken, '/images', {
      fields: FIELDS,
      lat: String(lat),
      lng: String(lng),
      radius: String(r),
      limit,
    });
    collected.push(...parseImages(json));
  };

  const pushBbox = async (d: number, limit: string) => {
    const minLng = lng - d;
    const minLat = lat - d;
    const maxLng = lng + d;
    const maxLat = lat + d;
    const json = await getJson(accessToken, '/images', {
      fields: FIELDS,
      bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
      limit,
    });
    collected.push(...parseImages(json));
  };

  // 1) Nearest 50m (API max radius). One round-trip, high limit for dense streets.
  await pushRadius('50', '200');
  let cands = imagesToCandidates(collected, lat, lng);
  if (cands.length > 0) return cands;

  // 2) Wider search must use bbox (radius cannot exceed 50m). Keep area under ~0.01 sq deg.
  await pushBbox(0.04, '200');
  cands = imagesToCandidates(collected, lat, lng);
  if (cands.length > 0) return cands;

  await pushBbox(0.0475, '200');
  cands = imagesToCandidates(collected, lat, lng);
  if (cands.length > 0) return cands;

  return imagesToCandidates(collected, lat, lng);
}
