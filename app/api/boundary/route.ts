import { NextRequest, NextResponse } from 'next/server';

const CACHE_HEADER = { 'Cache-Control': 'public, max-age=86400' };

// ─────────── Zillow neighborhood boundary data (primary source) ───────────

const ZILLOW_BASE = 'https://raw.githubusercontent.com/AlexMotz/us-neighborhood-geojson/master/neighborhood-GeoJSON';

const stateFileCache = new Map<string, { data: any; fetchedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const STATE_ABBR: Record<string, string> = {
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',
  connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',
  illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',
  maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',
  mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV',
  'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY',
  'north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',
  pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',
  tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA',
  'west virginia':'WV',wisconsin:'WI',wyoming:'WY','district of columbia':'DC',
};

function toStateCode(stateStr: string): string | null {
  const s = stateStr.trim();
  if (/^[A-Z]{2}$/.test(s)) return s;
  return STATE_ABBR[s.toLowerCase()] || null;
}

async function getStateFeatures(stateCode: string): Promise<any[]> {
  const cached = stateFileCache.get(stateCode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;
  try {
    const res = await fetch(`${ZILLOW_BASE}/ZillowNeighborhoods-${stateCode}.geojson`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const features = data.features || [];
    stateFileCache.set(stateCode, { data: features, fetchedAt: Date.now() });
    return features;
  } catch {
    return [];
  }
}

/**
 * Search the Zillow neighborhood dataset for a polygon boundary.
 * Uses Nominatim to determine the state, then fetches the state file and matches by name.
 */
async function fetchZillowNeighborhood(
  name: string, lat: number, lon: number, stateCode: string | null
): Promise<{ label: string; geometry: object } | null> {
  if (!stateCode) return null;
  const features = await getStateFeatures(stateCode);
  if (!features.length) return null;

  const needle = name.toLowerCase().trim();
  // Only strip generic suffixes that don't form the identity of a neighborhood
  const needleStripped = needle.replace(/\b(district|neighborhood|neighbourhood)\b/gi, '').replace(/\s+/g, ' ').trim();
  let bestMatch: any = null;
  let bestDist = Infinity;

  for (const f of features) {
    const fName: string = (f.properties?.NAME || '').toLowerCase();
    const match = fName === needle || fName === needleStripped
      || (fName.length >= 4 && needle === fName);
    if (!match) continue;
    const geo = f.geometry;
    if (!geo || (geo.type !== 'Polygon' && geo.type !== 'MultiPolygon')) continue;
    // If multiple matches, pick the closest to our center point
    const coords = geo.type === 'Polygon' ? geo.coordinates[0] : geo.coordinates[0][0];
    if (!coords?.length) continue;
    const cLat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    const cLon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
    const d = Math.sqrt((cLat - lat) ** 2 + (cLon - lon) ** 2);
    if (d < bestDist) { bestDist = d; bestMatch = f; }
  }

  // Reject matches that are too far from the expected location (~35 mi / 0.5°)
  if (!bestMatch || bestDist > 0.5) return null;
  const city = bestMatch.properties?.CITY || '';
  const label = city ? `${bestMatch.properties.NAME}, ${city}` : bestMatch.properties.NAME;
  return { label, geometry: bestMatch.geometry };
}

// ─────────── Overpass / polygon utilities ───────────

type Pt = [number, number]; // [lon, lat]

function ptsEqual(a: Pt, b: Pt): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function ptDist(a: Pt, b: Pt): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/**
 * Remove narrow peninsulas (e.g. piers, jetties) from a polygon ring.
 * Detects sequences where the boundary departs and returns to nearly the same
 * spot, with a high path-length-to-gap ratio (the hallmark of a narrow finger).
 */
function removePeninsulas(ring: Pt[], widthThreshold = 0.001, maxLookahead = 12): Pt[] {
  if (ring.length <= 4) return ring;
  const isClosed = ptsEqual(ring[0], ring[ring.length - 1]);
  let pts = isClosed ? ring.slice(0, -1) : [...ring];

  let changed = true;
  while (changed && pts.length > 4) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      let bestJ = -1, bestRatio = Infinity;
      for (let la = 3; la <= Math.min(maxLookahead, pts.length - 1); la++) {
        const j = (i + la) % pts.length;
        if (j === i) continue;
        const gap = ptDist(pts[i], pts[j]);
        if (gap >= widthThreshold) continue;
        let pathLen = 0;
        for (let k = 0; k < la; k++) {
          pathLen += ptDist(pts[(i + k) % pts.length], pts[(i + k + 1) % pts.length]);
        }
        const ratio = pathLen / Math.max(gap, 1e-12);
        if (ratio > 3 && ratio < bestRatio) { bestJ = j; bestRatio = ratio; }
      }
      if (bestJ !== -1) {
        const toRemove = new Set<number>();
        if (bestJ > i) {
          for (let k = i + 1; k < bestJ; k++) toRemove.add(k);
        } else {
          for (let k = i + 1; k < pts.length; k++) toRemove.add(k);
          for (let k = 0; k < bestJ; k++) toRemove.add(k);
        }
        pts = pts.filter((_, idx) => !toRemove.has(idx));
        changed = true;
        break;
      }
    }
  }

  if (isClosed && pts.length > 0) pts.push([...pts[0]]);
  return pts;
}

/**
 * Stitch an unordered set of ways into a closed ring by matching endpoints.
 * Ways may need to be reversed to connect properly.
 */
function stitchRing(ways: Pt[][]): Pt[] | null {
  if (ways.length === 0) return null;
  const used = new Array(ways.length).fill(false);
  used[0] = true;
  const ring = [...ways[0]];

  for (let iter = 1; iter < ways.length; iter++) {
    const tail = ring[ring.length - 1];
    let found = false;
    for (let i = 0; i < ways.length; i++) {
      if (used[i]) continue;
      const w = ways[i];
      const wStart = w[0], wEnd = w[w.length - 1];
      if (ptsEqual(tail, wStart)) {
        ring.push(...w.slice(1));
        used[i] = true;
        found = true;
        break;
      }
      if (ptsEqual(tail, wEnd)) {
        const reversed = [...w].reverse();
        ring.push(...reversed.slice(1));
        used[i] = true;
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  if (ring.length < 4) return null;
  if (!ptsEqual(ring[0], ring[ring.length - 1])) {
    ring.push([...ring[0]]);
  }
  return ring;
}

async function fetchOverpassBoundary(name: string, lat: number, lon: number): Promise<object | null> {
  const delta = 0.04;
  const bbox = `${lat - delta},${lon - delta},${lat + delta},${lon + delta}`;
  const query = `[out:json][timeout:12];relation["boundary"="place"]["name"="${name.replace(/"/g, '')}"](${bbox});out geom;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(14000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { return null; }
    const elem = data.elements?.[0];
    if (!elem?.members) return null;

    const outerWays: Pt[][] = [];
    for (const m of elem.members) {
      if (m.role !== 'outer' || !m.geometry?.length) continue;
      outerWays.push(m.geometry.map((g: { lon: number; lat: number }): Pt => [g.lon, g.lat]));
    }

    const raw = stitchRing(outerWays);
    if (!raw) return null;
    const ring = removePeninsulas(raw);
    if (ring.length < 4) return null;
    return { type: 'Polygon', coordinates: [ring] };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // zip | city | state
  const q = searchParams.get('q')?.trim();

  if (!type || !q) {
    return NextResponse.json({ error: 'Missing type or q parameter' }, { status: 400 });
  }

  try {
    if (type === 'zip') {
      const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/2/query?where=ZCTA5%3D%27${encodeURIComponent(q)}%27&outFields=ZCTA5&f=geojson&geometryType=esriGeometryPolygon&outSR=4326`;
      const res = await fetch(url);
      if (!res.ok) return NextResponse.json({ error: 'Census API error' }, { status: 502 });
      const data = await res.json();
      const feat = data.features?.[0];
      if (!feat?.geometry) return NextResponse.json({ error: 'Zip code not found' }, { status: 404 });
      return NextResponse.json({ label: `ZIP ${q}`, geometry: feat.geometry }, { headers: CACHE_HEADER });
    }

    if (type === 'city') {
      const parts = q.split(',').map(s => s.trim());
      const cityName = parts[0];

      // Try Census TIGER Incorporated Places (layer 28) first — tighter boundaries
      try {
        const tigerUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/28/query?where=NAME+LIKE+%27${encodeURIComponent(cityName)}%25%27&outFields=NAME,GEOID&f=geojson&outSR=4326`;
        const tigerRes = await fetch(tigerUrl);
        if (tigerRes.ok) {
          const tigerData = await tigerRes.json();
          const feat = tigerData.features?.[0];
          if (feat?.geometry) {
            const label = feat.properties?.NAME?.replace(/ (city|town|village|borough|CDP)$/i, '') || cityName;
            return NextResponse.json({ label, geometry: feat.geometry }, { headers: CACHE_HEADER });
          }
        }
      } catch { /* fall through to Nominatim */ }

      // Fallback: Nominatim
      const qs = parts.length >= 2
        ? `city=${encodeURIComponent(cityName)}&state=${encodeURIComponent(parts[1])}`
        : `q=${encodeURIComponent(q)}`;
      const url = `https://nominatim.openstreetmap.org/search?${qs}&countrycodes=us&format=json&polygon_geojson=1&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MapQuestWidgets/1.0' } });
      if (!res.ok) return NextResponse.json({ error: 'Nominatim error' }, { status: 502 });
      const data = await res.json();
      const item = data[0];
      if (!item?.geojson) return NextResponse.json({ error: 'City not found' }, { status: 404 });
      const label = item.display_name?.split(',').slice(0, 2).join(',').trim() || q;
      return NextResponse.json({ label, geometry: item.geojson }, { headers: CACHE_HEADER });
    }

    if (type === 'state') {
      const url = `https://nominatim.openstreetmap.org/search?state=${encodeURIComponent(q)}&countrycodes=us&format=json&polygon_geojson=1&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MapQuestWidgets/1.0' } });
      if (!res.ok) return NextResponse.json({ error: 'Nominatim error' }, { status: 502 });
      const data = await res.json();
      const item = data[0];
      if (!item?.geojson) return NextResponse.json({ error: 'State not found' }, { status: 404 });
      const label = item.display_name?.split(',')[0]?.trim() || q;
      return NextResponse.json({ label, geometry: item.geojson }, { headers: CACHE_HEADER });
    }

    if (type === 'neighborhood') {
      // Geocode via Nominatim to get center coordinates and state
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=us&format=json&polygon_geojson=1&polygon_threshold=0&addressdetails=1&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MapQuestWidgets/1.0' } });
      if (!res.ok) return NextResponse.json({ error: 'Nominatim error' }, { status: 502 });
      const data = await res.json();
      const item = data[0];
      if (!item) return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });

      const label = item.display_name?.split(',').slice(0, 2).join(',').trim() || q;
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);

      // 1. Nominatim has a real polygon — use it if it's sub-city level.
      //    Nominatim's addresstype distinguishes neighborhoods/suburbs from cities reliably.
      const addrType = (item.addresstype || '').toLowerCase();
      const isCityOrLarger = ['city', 'town', 'state', 'county', 'country'].includes(addrType);

      if (!isCityOrLarger && item.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon')) {
        return NextResponse.json({ label, geometry: item.geojson }, { headers: CACHE_HEADER });
      }

      // Nominatim matched a city/admin boundary, not a neighborhood — bail so the city handler can take over
      if (isCityOrLarger) {
        return NextResponse.json({ error: 'Not a neighborhood' }, { status: 404 });
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
      }

      // Extract state — try multiple sources for robustness
      const nbName = item.display_name?.split(',')[0]?.trim() || q;
      let stateCode: string | null = null;

      // Source 1: Nominatim address details
      if (item.address?.state) stateCode = toStateCode(item.address.state);
      // Source 2: ISO code from Nominatim (e.g. "US-WA")
      if (!stateCode && item.address?.['ISO3166-2-lvl4']) {
        const iso = item.address['ISO3166-2-lvl4'];
        const m = iso.match(/US-([A-Z]{2})/);
        if (m) stateCode = m[1];
      }
      // Source 3: scan all display_name parts for a state name/code
      if (!stateCode) {
        for (const part of (item.display_name || '').split(',')) {
          const c = toStateCode(part.trim());
          if (c) { stateCode = c; break; }
        }
      }
      // Source 4: scan the original user query for a 2-letter state code
      if (!stateCode) {
        const twoLetter = q.match(/\b([A-Z]{2})\b/);
        if (twoLetter) {
          const ALL_CODES = new Set(Object.values(STATE_ABBR));
          if (ALL_CODES.has(twoLetter[1])) stateCode = twoLetter[1];
        }
      }

      // 2. Zillow neighborhood boundaries (most comprehensive free source)
      const zillow = await fetchZillowNeighborhood(nbName, lat, lon, stateCode);
      if (zillow) {
        return NextResponse.json({ label: zillow.label || label, geometry: zillow.geometry }, { headers: CACHE_HEADER });
      }

      // 3. Overpass for OSM boundary=place polygon
      const overpassGeo = await fetchOverpassBoundary(nbName, lat, lon);
      if (overpassGeo) {
        return NextResponse.json({ label, geometry: overpassGeo }, { headers: CACHE_HEADER });
      }

      // 4. ZIP code fallback — Nominatim often includes the postcode even when no polygon exists
      const postcode = item.address?.postcode;
      if (postcode && /^\d{5}$/.test(postcode)) {
        try {
          const tigerUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/2/query?where=ZCTA5%3D%27${encodeURIComponent(postcode)}%27&outFields=ZCTA5&f=geojson&geometryType=esriGeometryPolygon&outSR=4326`;
          const tigerRes = await fetch(tigerUrl);
          if (tigerRes.ok) {
            const tigerData = await tigerRes.json();
            const feat = tigerData.features?.[0];
            if (feat?.geometry) {
              return NextResponse.json({ label, geometry: feat.geometry }, { headers: CACHE_HEADER });
            }
          }
        } catch { /* fall through to circle */ }
      }

      // 5. Last resort: approximate circle (~0.5 mi radius)
      const radiusMiles = 0.5;
      const nPts = 48;
      const coords: [number, number][] = [];
      for (let i = 0; i <= nPts; i++) {
        const angle = (i / nPts) * 2 * Math.PI;
        const dLat = (radiusMiles / 69.0) * Math.cos(angle);
        const dLon = (radiusMiles / (69.0 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
        coords.push([lon + dLon, lat + dLat]);
      }
      return NextResponse.json(
        { label, geometry: { type: 'Polygon', coordinates: [coords] }, approximate: true },
        { headers: CACHE_HEADER },
      );
    }

    return NextResponse.json({ error: 'Invalid type — use zip, city, state, or neighborhood' }, { status: 400 });
  } catch (error) {
    console.error('[Boundary API] Error:', error);
    return NextResponse.json(
      { error: 'Boundary lookup failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
