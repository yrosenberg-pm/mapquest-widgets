// app/api/mapquest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { searchV2MatchesFilter } from '@/lib/mapquestPoiMatch';

const MAPQUEST_KEY = process.env.MAPQUEST_API_KEY;

/** Search v4 /place often returns [] for standard developer keys; v2 radius + mqap.ntpois returns POIs. Response normalized to v4-style `{ results }`. */
const SEARCH_V2_RADIUS = 'https://www.mapquestapi.com/search/v2/radius';

const ENDPOINTS: Record<string, string> = {
  geocoding: 'https://www.mapquestapi.com/geocoding/v1/address',
  reverse: 'https://www.mapquestapi.com/geocoding/v1/reverse',
  searchahead: 'https://www.mapquestapi.com/search/v3/prediction',
  search: SEARCH_V2_RADIUS,
  directions: 'https://www.mapquestapi.com/directions/v2/route',
  routematrix: 'https://www.mapquestapi.com/directions/v2/routematrix',
  optimizedroute: 'https://www.mapquestapi.com/directions/v2/optimizedroute',
  traffic: 'https://www.mapquestapi.com/traffic/v2/incidents',
  // Isoline API (v1): driving / walking / bicycling
  // NOTE: We also accept `endpoint=isoline` (see switch) and select the correct mode below.
  isoline: 'https://www.mapquestapi.com/isolines/v1/driving',
  isoline_driving: 'https://www.mapquestapi.com/isolines/v1/driving',
  isoline_walking: 'https://www.mapquestapi.com/isolines/v1/walking',
  isoline_bicycling: 'https://www.mapquestapi.com/isolines/v1/bicycling',
};

function mapSearchV2ResultToPlaceRow(sr: any): any {
  const f = sr.fields || {};
  const sp = sr.shapePoints;
  let lat = Number(f.lat ?? f.disp_lat);
  let lng = Number(f.lng ?? f.disp_lng);
  if (Array.isArray(sp) && sp.length >= 2) {
    lat = Number(sp[0]);
    lng = Number(sp[1]);
  }
  const name = f.name || sr.name || 'Unknown';
  const displayString = [name, f.address, f.city, f.state, f.postal_code].filter(Boolean).join(', ');
  let distance = typeof sr.distance === 'number' ? sr.distance : parseFloat(String(sr.distance));
  if (!Number.isFinite(distance)) distance = undefined;
  if (sr.distanceUnit === 'k' && Number.isFinite(distance)) {
    distance = distance * 0.621371;
  }
  return {
    id: f.mqap_id || f.id || sr.key,
    name,
    sic: String(f.group_sic_code || f.group_sic_code_ext || ''),
    sicName: String(f.group_sic_code_name || ''),
    sicNameExt: String(f.group_sic_code_name_ext || ''),
    displayString,
    distance,
    place: {
      type: 'Feature',
      geometry:
        Number.isFinite(lat) && Number.isFinite(lng)
          ? { type: 'Point', coordinates: [lng, lat] }
          : undefined,
      properties: {
        street: f.address,
        city: f.city,
        state: f.state,
        phone: f.phone,
        postalCode: f.postal_code,
      },
    },
  };
}

function filterAndNormalizeSearchV2(pool: any[], opts: { q: string | null; category: string | null; limit: number }) {
  const filtered = pool.filter((sr) => searchV2MatchesFilter(sr, opts.q, opts.category));
  const mapped = filtered.map(mapSearchV2ResultToPlaceRow);
  mapped.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  return mapped.slice(0, opts.limit);
}

/** Straight-line miles for one ntpois row (handles km unit). */
function rowDistanceMiles(sr: any): number {
  let d = typeof sr.distance === 'number' ? sr.distance : parseFloat(String(sr.distance));
  if (!Number.isFinite(d)) return 0;
  if (sr.distanceUnit === 'k') d *= 0.621371;
  return d;
}

function maxNtpoisPoolDistanceMiles(pool: any[]): number {
  let m = 0;
  for (const sr of pool) m = Math.max(m, rowDistanceMiles(sr));
  return m;
}

/**
 * v2 radius returns at most maxMatches POIs sorted by distance. In dense metros the closest N
 * are all within a few blocks, so important POIs farther out (e.g. a supermarket 2 mi away)
 * never appear. When we're category/text filtering and the disk is "full" but still short
 * relative to the requested radius, merge pools from cardinal offsets at ±radius miles.
 */
function needsNtpoisPoolExpansion(pool: any[], maxMatches: number, radiusMiles: number): boolean {
  if (pool.length < maxMatches) return false;
  return maxNtpoisPoolDistanceMiles(pool) < radiusMiles * 0.55;
}

function offsetOriginMiles(lat: number, lng: number, northMiles: number, eastMiles: number) {
  const dLat = northMiles / 69.0;
  const dLng = eastMiles / (69.0 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

function ntpoisDedupeKey(sr: any): string {
  const f = sr.fields || {};
  const id = f.mqap_id || f.id || sr.key;
  if (id) return `id:${id}`;
  const sp = sr.shapePoints;
  if (Array.isArray(sp) && sp.length >= 2) return `sp:${sp[0]},${sp[1]}`;
  return `n:${f.name || sr.name || ''}|${f.lat}|${f.lng}`;
}

function dedupeNtpoisPools(pools: any[][]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const pool of pools) {
    for (const sr of pool) {
      const k = ntpoisDedupeKey(sr);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(sr);
    }
  }
  return out;
}

/** Recompute straight-line miles from the user's origin (merged multi-center pools keep each arm's own distance). */
function recalcNtpoisDistancesFromOrigin(pool: any[], originLat: number, originLng: number) {
  const R = 3959;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const haversineMi = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  for (const sr of pool) {
    const f = sr.fields || {};
    const sp = sr.shapePoints;
    let lat = Number(f.lat ?? f.disp_lat);
    let lng = Number(f.lng ?? f.disp_lng);
    if (Array.isArray(sp) && sp.length >= 2) {
      lat = Number(sp[0]);
      lng = Number(sp[1]);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    sr.distance = haversineMi(originLat, originLng, lat, lng);
    sr.distanceUnit = 'm';
  }
}

async function fetchNtpoisRadiusRaw(
  apiKey: string,
  lat: number,
  lng: number,
  radius: string,
  maxMatches: number,
): Promise<any[]> {
  const v2Url = `${SEARCH_V2_RADIUS}?key=${apiKey}&origin=${encodeURIComponent(`${lat},${lng}`)}&radius=${encodeURIComponent(radius)}&units=m&maxMatches=${maxMatches}&hostedData=mqap.ntpois&ambiguities=ignore`;
  const response = await fetch(v2Url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MapQuest Search v2 error: ${response.status} ${errorText}`);
  }
  const v2 = await response.json();
  return Array.isArray(v2.searchResults) ? v2.searchResults : [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Customer-provided key (via embed URL) takes precedence over server env key
  const clientKey = searchParams.get('apiKey');
  const apiKey = clientKey || MAPQUEST_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const endpoint = searchParams.get('endpoint');

  if (!endpoint || !ENDPOINTS[endpoint]) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  }

  console.log('API Key loaded:', apiKey ? 'Yes (client-provided: ' + !!clientKey + ')' : 'No');

  try {
    let url: string;
    let options: RequestInit = { method: 'GET' };

    switch (endpoint) {
      case 'geocoding': {
        const location = searchParams.get('location');
        const maxResults = searchParams.get('maxResults') || '5';
        const usBounds = '24.396308,-124.848974,49.384358,-66.885444';
        url = `${ENDPOINTS.geocoding}?key=${apiKey}&location=${encodeURIComponent(location || '')}&maxResults=${maxResults}&boundingBox=${usBounds}`;
        break;
      }

      case 'searchahead': {
        const q = searchParams.get('q');
        const limit = searchParams.get('limit') || '6';
        url = `${ENDPOINTS.searchahead}?key=${apiKey}&q=${encodeURIComponent(q || '')}&limit=${limit}&collection=address,adminArea,poi&countryCode=US`;
        break;
      }

      case 'search': {
        const location = searchParams.get('location');
        const category = searchParams.get('category');
        const q = searchParams.get('q');
        const radius = searchParams.get('radius') || '5';
        const pageSizeRaw = searchParams.get('pageSize') || '10';
        const rawPool = searchParams.get('rawPool') === '1';
        const limitRequested = Math.max(1, parseInt(pageSizeRaw, 10) || (rawPool ? 2500 : 10));
        const limitForCategorySearch = Math.min(500, limitRequested);
        const limit = limitForCategorySearch;
        const [latStr, lngStr] = location?.split(',').map((s) => s.trim()) || ['', ''];
        const latNum = parseFloat(latStr);
        const lngNum = parseFloat(lngStr);
        if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
          return NextResponse.json({ error: 'Invalid location (expected lat,lng)' }, { status: 400 });
        }

        const radiusNum = Math.min(Math.max(parseFloat(radius) || 5, 0.1), 75);
        const maxMatches = Math.min(500, Math.max(rawPool ? 500 : limit * 50, 200));
        const radiusParam = String(radiusNum);
        const hasFilter =
          (category && category.trim() !== '') || (q && q.trim() !== '');

        console.log('[API] Search v2 radius:', {
          lat: latNum,
          lng: lngNum,
          radiusMiles: radiusParam,
          maxMatches,
          limit,
          rawPool,
          category,
          q,
        });

        let pool: any[];
        try {
          pool = await fetchNtpoisRadiusRaw(apiKey, latNum, lngNum, radiusParam, maxMatches);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(msg);
          return NextResponse.json({ error: 'MapQuest search failed', details: msg }, { status: 502 });
        }

        const shouldExpand =
          (hasFilter || rawPool) && needsNtpoisPoolExpansion(pool, maxMatches, radiusNum);

        if (shouldExpand) {
          const r = radiusNum;
          const north = offsetOriginMiles(latNum, lngNum, r, 0);
          const south = offsetOriginMiles(latNum, lngNum, -r, 0);
          const east = offsetOriginMiles(latNum, lngNum, 0, r);
          const west = offsetOriginMiles(latNum, lngNum, 0, -r);
          try {
            const [n, s, e, w] = await Promise.all([
              fetchNtpoisRadiusRaw(apiKey, north.lat, north.lng, radiusParam, maxMatches),
              fetchNtpoisRadiusRaw(apiKey, south.lat, south.lng, radiusParam, maxMatches),
              fetchNtpoisRadiusRaw(apiKey, east.lat, east.lng, radiusParam, maxMatches),
              fetchNtpoisRadiusRaw(apiKey, west.lat, west.lng, radiusParam, maxMatches),
            ]);
            pool = dedupeNtpoisPools([pool, n, s, e, w]);
            console.log('[API] Search v2 expanded pool (cardinal offsets):', { merged: pool.length });
          } catch (err) {
            console.error('[API] Search v2 expansion failed', err);
          }
        }

        recalcNtpoisDistancesFromOrigin(pool, latNum, lngNum);

        if (rawPool) {
          const mapped = pool.map(mapSearchV2ResultToPlaceRow);
          mapped.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
          const maxOut = Math.min(4000, limitRequested);
          return NextResponse.json(
            { results: mapped.slice(0, maxOut), pagination: { currentPage: 1 } },
            { headers: { 'Cache-Control': 'public, max-age=60' } },
          );
        }

        const normalized = filterAndNormalizeSearchV2(pool, { q, category, limit });

        return NextResponse.json(
          {
            results: normalized,
            pagination: { currentPage: 1 },
          },
          {
            headers: { 'Cache-Control': 'public, max-age=60' },
          },
        );
      }

      case 'directions': {
        const from = searchParams.get('from');
        // Get all 'to' parameters for waypoints
        const allToParams = searchParams.getAll('to');
        const routeType = searchParams.get('routeType') || 'fastest';
        const avoids = searchParams.get('avoids');
        const useTraffic = searchParams.get('useTraffic');
        const timeType = searchParams.get('timeType');
        const dateTime = searchParams.get('dateTime');
        const type = searchParams.get('type'); // truck, etc.
        
        // Truck-specific parameters
        const vehicleHeight = searchParams.get('vehicleHeight');
        const vehicleWeight = searchParams.get('vehicleWeight');
        const vehicleLength = searchParams.get('vehicleLength');
        const vehicleWidth = searchParams.get('vehicleWidth');
        const vehicleAxles = searchParams.get('vehicleAxles');
        
        let directionsUrl = `${ENDPOINTS.directions}?key=${apiKey}&from=${from}&routeType=${routeType}&narrativeType=text&unit=m&fullShape=true`;
        
        // Add all waypoints as 'to' parameters
        allToParams.forEach(to => {
          directionsUrl += `&to=${to}`;
        });
        
        if (avoids) directionsUrl += `&avoids=${encodeURIComponent(avoids)}`;
        
        // Traffic and time-based routing
        if (useTraffic === 'true') {
          directionsUrl += '&doReverseGeocode=false&useTraffic=true';
        }
        if (timeType) {
          directionsUrl += `&timeType=${timeType}`;
        }
        if (dateTime) {
          directionsUrl += `&dateTime=${encodeURIComponent(dateTime)}`;
        }
        
        // Truck routing options
        if (type === 'truck') {
          directionsUrl += '&drivingStyle=2'; // Truck driving style
          if (vehicleHeight) directionsUrl += `&vehicleHeight=${vehicleHeight}`;
          if (vehicleWeight) directionsUrl += `&vehicleWeight=${vehicleWeight}`;
          if (vehicleLength) directionsUrl += `&vehicleLength=${vehicleLength}`;
          if (vehicleWidth) directionsUrl += `&vehicleWidth=${vehicleWidth}`;
          if (vehicleAxles) directionsUrl += `&vehicleAxles=${vehicleAxles}`;
        }
        
        url = directionsUrl;
        break;
      }

      case 'routematrix': {
        const locations = searchParams.get('locations')?.split('|') || [];
        const routeType = searchParams.get('routeType') || 'fastest';
        const allToAll = searchParams.get('allToAll') === 'true';
        
        // Route matrix uses POST with JSON body
        url = `${ENDPOINTS.routematrix}?key=${apiKey}`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations: locations.map(loc => {
              const [lat, lng] = loc.split(',');
              return { latLng: { lat: parseFloat(lat), lng: parseFloat(lng) } };
            }),
            options: {
              routeType,
              allToAll,
              unit: 'm',
            },
          }),
        };
        break;
      }

      case 'optimizedroute': {
        const locationsParam = searchParams.get('locations') || '';
        const locations = locationsParam.split('|').filter(Boolean);
        
        console.log('[optimizedroute] Received locations:', locations.length);
        
        const requestBody = {
          locations: locations.map(loc => {
            const [lat, lng] = loc.split(',');
            return { latLng: { lat: parseFloat(lat), lng: parseFloat(lng) } };
          }),
          options: {
            routeType: 'fastest',
            unit: 'm',
          },
        };
        
        console.log('[optimizedroute] Request body:', JSON.stringify(requestBody, null, 2));
        
        url = `${ENDPOINTS.optimizedroute}?key=${apiKey}`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        };
        break;
      }

      case 'traffic': {
        const boundingBox = searchParams.get('boundingBox');
        url = `${ENDPOINTS.traffic}?key=${apiKey}&boundingBox=${boundingBox}&filters=incidents,construction`;
        break;
      }

      case 'isoline': {
        const origin = searchParams.get('origin'); // "lat,lng"
        const timeMinutes = searchParams.get('timeMinutes') || searchParams.get('time') || searchParams.get('contour') || searchParams.get('contours');
        const mode = (searchParams.get('mode') || 'driving').toLowerCase(); // driving|walking|bicycling
        const generalize = searchParams.get('generalize') || '0';

        const isolineEndpoint =
          mode === 'walking'
            ? ENDPOINTS.isoline_walking
            : mode === 'bicycling' || mode === 'bicycle' || mode === 'bike'
              ? ENDPOINTS.isoline_bicycling
              : ENDPOINTS.isoline_driving;

        // Note: MapQuest Isoline API supports `origin` and `contours` (minutes) for time-based isolines.
        // We keep this proxy permissive and pass through common parameters.
        url = `${isolineEndpoint}?key=${apiKey}`
          + `&origin=${encodeURIComponent(origin || '')}`
          + (timeMinutes ? `&contours=${encodeURIComponent(timeMinutes)}` : '')
          + `&generalize=${encodeURIComponent(generalize)}`
          + `&polygons=true`;
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown endpoint' }, { status: 400 });
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`MapQuest API error: ${response.status}`, errorText);
      console.error(`[API] Failed URL: ${url}`);
      return NextResponse.json(
        { error: 'MapQuest API request failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Log optimizedroute responses for debugging
    if (endpoint === 'optimizedroute') {
      console.log('[API] Optimizedroute response:', {
        hasRoute: !!data.route,
        locationSequence: data.route?.locationSequence,
        distance: data.route?.distance,
        time: data.route?.time,
        info: data.info,
      });
    }
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute
      },
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Also support POST for widgets that need it
export async function POST(request: NextRequest) {
  return GET(request);
}