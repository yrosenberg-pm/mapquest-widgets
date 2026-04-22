import { NextRequest, NextResponse } from 'next/server';

const GRAPH = 'https://graph.mapillary.com';

/** ~Earth radius in meters */
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

type ImageItem = {
  id: string;
  geometry?: GeoPoint;
  computed_geometry?: GeoPoint;
};

function locationFromImage(img: ImageItem): { lat: number; lng: number } | null {
  const g = img.computed_geometry || img.geometry;
  if (g?.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [lng, lat] = g.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function pickNearestId(images: ImageItem[], targetLat: number, targetLng: number): string | null {
  let best: { id: string; m: number } | null = null;
  for (const img of images) {
    const p = locationFromImage(img);
    if (!p) continue;
    const m = haversineMeters(targetLat, targetLng, p.lat, p.lng);
    if (!best || m < best.m) best = { id: img.id, m };
  }
  return best?.id ?? null;
}

const IMAGE_FIELDS = 'id,geometry,computed_geometry';

/**
 * Find a Mapillary image id near a point. Uses API radius search (up to 25m), then
 * progressively larger bboxes (still under 0.01° per side) and always returns the
 * geographically nearest image, not the first in the list.
 * @see https://www.mapillary.com/developer/api-documentation
 */
export async function GET(request: NextRequest) {
  const token = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Street view is not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Invalid lat or lng' }, { status: 400 });
  }

  const headers = { Accept: 'application/json' };

  const parseImages = (data: { data?: ImageItem[] }) => data?.data ?? [];

  // 1) Radius search: API max radius is 25m — request many candidates, pick nearest.
  const tryRadius = async () => {
    const url = new URL(`${GRAPH}/images`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('fields', IMAGE_FIELDS);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('radius', '25');
    url.searchParams.set('limit', '50');
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      return { res, images: null as ImageItem[] | null };
    }
    const data = (await res.json()) as { data?: ImageItem[] };
    return { res, images: parseImages(data) };
  };

  // 2) Bbox: minLon, minLat, maxLon, maxLat — each half-width d must keep width < 0.01°
  const tryBbox = async (d: number) => {
    const minLng = lng - d;
    const minLat = lat - d;
    const maxLng = lng + d;
    const maxLat = lat + d;
    if (maxLng - minLng >= 0.01 - 1e-9 || maxLat - minLat >= 0.01 - 1e-9) {
      return { res: null as Response | null, images: null as ImageItem[] | null };
    }
    const url = new URL(`${GRAPH}/images`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('fields', IMAGE_FIELDS);
    url.searchParams.set('bbox', `${minLng},${minLat},${maxLng},${maxLat}`);
    url.searchParams.set('limit', '200');
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      return { res, images: null as ImageItem[] | null };
    }
    const data = (await res.json()) as { data?: ImageItem[] };
    return { res, images: parseImages(data) };
  };

  try {
    const { res: r1, images: images1 } = await tryRadius();
    if (r1 && r1.ok && images1?.length) {
      const id = pickNearestId(images1, lat, lng);
      if (id) return NextResponse.json({ imageId: id });
    } else if (r1 && !r1.ok) {
      const t = await r1.text();
      return NextResponse.json(
        { error: 'Street view lookup failed', details: t.slice(0, 200) },
        { status: r1.status }
      );
    }

    // 3) Wider searches: ~220m, ~440m, ~1km (half-width d in degrees)
    // 2*d must stay < 0.01° (API). ~220m → ~1.1 km max span.
    const dSteps = [0.001, 0.002, 0.0035, 0.0049];
    for (const d of dSteps) {
      const { res, images } = await tryBbox(d);
      if (!res) continue;
      if (!res.ok) {
        const t = await res.text();
        return NextResponse.json(
          { error: 'Street view lookup failed', details: t.slice(0, 200) },
          { status: res.status }
        );
      }
      if (images?.length) {
        const id = pickNearestId(images, lat, lng);
        if (id) return NextResponse.json({ imageId: id });
      }
    }

    return NextResponse.json(
      { error: 'no_coverage' },
      { status: 404 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Request failed' },
      { status: 500 }
    );
  }
}
