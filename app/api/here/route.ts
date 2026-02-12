// app/api/here/route.ts
import { NextRequest, NextResponse } from 'next/server';

const HERE_API_KEY = process.env.HERE_API_KEY;

const ENDPOINTS: Record<string, string> = {
  isoline: 'https://isoline.router.hereapi.com/v8/isolines',
  geocode: 'https://geocode.search.hereapi.com/v1/geocode',
  revgeocode: 'https://revgeocode.search.hereapi.com/v1/revgeocode',
  autosuggest: 'https://autosuggest.search.hereapi.com/v1/autosuggest',
  routes: 'https://router.hereapi.com/v8/routes',
  // HERE Search API (Places/POI)
  discover: 'https://discover.search.hereapi.com/v1/discover',
  // HERE Public Transit API - only returns subway, bus, tram, ferry (no taxi/car)
  transit: 'https://transit.router.hereapi.com/v8/routes',
  // HERE Destination Weather API
  weather: 'https://weather.ls.hereapi.com/weather/1.0/report.json',
  // HERE Fleet Telematics - Truck Restrictions
  truckrestrictions: 'https://fleet.ls.hereapi.com/2/overlays.json',
  // EV charging (we'll try dedicated EV endpoints first, then fall back to Search/Discover)
  evchargers: 'https://ev-chargepoints.search.hereapi.com/v1/chargepoints',
};

export async function GET(request: NextRequest) {
  if (!HERE_API_KEY) {
    return NextResponse.json({ error: 'HERE API key not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  // Weather endpoint doesn't need to be in ENDPOINTS map since it's a special case
  const validEndpoints = Object.keys(ENDPOINTS);
  if (!endpoint || !validEndpoints.includes(endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  }

  try {
    let url: string;

    switch (endpoint) {
      case 'isoline': {
        const origin = searchParams.get('origin'); // lat,lng format
        const rangeType = searchParams.get('rangeType') || 'time'; // 'time' or 'distance'
        const rangeValues = searchParams.get('rangeValues'); // comma-separated seconds or meters
        const transportMode = searchParams.get('transportMode') || 'car';
        const optimizeFor = searchParams.get('optimizeFor') || 'balanced';

        if (!origin) {
          return NextResponse.json({ error: 'Origin is required' }, { status: 400 });
        }

        if (!rangeValues) {
          return NextResponse.json({ error: 'Range values are required' }, { status: 400 });
        }

        // Validate transport mode
        const validModes = ['car', 'truck', 'pedestrian', 'bicycle', 'scooter'];
        if (!validModes.includes(transportMode)) {
          return NextResponse.json({ error: 'Invalid transport mode' }, { status: 400 });
        }

        // Validate range values (must be positive numbers)
        const ranges = rangeValues.split(',').map(Number);
        if (ranges.some(isNaN) || ranges.some(v => v <= 0)) {
          return NextResponse.json({ error: 'Invalid range values' }, { status: 400 });
        }

        // Cap range values to prevent unreasonable requests
        // Max 2 hours (7200 seconds) for time, max 200km (200000 meters) for distance
        const maxRange = rangeType === 'time' ? 7200 : 200000;
        if (ranges.some(v => v > maxRange)) {
          return NextResponse.json({ 
            error: `Range values exceed maximum (${rangeType === 'time' ? '2 hours' : '200km'})` 
          }, { status: 400 });
        }

        url = `${ENDPOINTS.isoline}?apiKey=${HERE_API_KEY}&origin=${origin}&range[type]=${rangeType}&range[values]=${rangeValues}&transportMode=${transportMode}&optimizeFor=${optimizeFor}`;
        break;
      }

      case 'geocode': {
        const q = searchParams.get('q');
        if (!q) {
          return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }
        url = `${ENDPOINTS.geocode}?apiKey=${HERE_API_KEY}&q=${encodeURIComponent(q)}&limit=5`;
        break;
      }

      case 'revgeocode': {
        const at = searchParams.get('at'); // lat,lng
        if (!at) {
          return NextResponse.json({ error: 'Location is required' }, { status: 400 });
        }
        url = `${ENDPOINTS.revgeocode}?apiKey=${HERE_API_KEY}&at=${at}`;
        break;
      }

      case 'autosuggest': {
        const q = searchParams.get('q');
        // HERE autosuggest prefers a context point: lat,lng
        const at = searchParams.get('at') || '39.8283,-98.5795';
        const limit = searchParams.get('limit') || '6';

        if (!q) {
          return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        // Autosuggest endpoint
        // resultTypes keeps it focused on places/addresses
        url = `${ENDPOINTS.autosuggest}?apiKey=${HERE_API_KEY}&q=${encodeURIComponent(q)}&at=${encodeURIComponent(at)}&limit=${limit}&resultTypes=address,place&lang=en-US`;
        break;
      }

      case 'evchargers': {
        const at = searchParams.get('at'); // lat,lng
        const radiusMeters = searchParams.get('radiusMeters'); // meters
        const radiusMiles = searchParams.get('radiusMiles'); // miles
        // HERE EV/Search endpoints typically cap limit to [1, 100]
        const limitRaw = searchParams.get('limit') || '100';
        const limitNum = Math.max(1, Math.min(100, Math.round(Number(limitRaw) || 100)));
        const limit = String(limitNum);
        const q = searchParams.get('q') || 'ev charging station';

        if (!at) {
          return NextResponse.json({ error: 'Location (at) is required' }, { status: 400 });
        }

        const [lat, lng] = at.split(',').map(Number);
        if ([lat, lng].some((v) => Number.isNaN(v))) {
          return NextResponse.json({ error: 'Invalid at format' }, { status: 400 });
        }

        const rMetersRaw =
          radiusMeters != null
            ? Number(radiusMeters)
            : radiusMiles != null
              ? Number(radiusMiles) * 1609.34
              : 16093; // default ~10 miles

        const rMeters = Math.max(500, Math.min(80000, Math.round(rMetersRaw))); // cap 0.5km..80km

        // Try the EV Charge Points endpoint first (if the account has entitlement),
        // but fall back to HERE Search/Discover (EV charging POIs) if it fails.
        const candidates: string[] = [];
        const attempts: Array<{ url: string; status: number; errorSnippet?: string }> = [];

        // Candidate 1: EV Charge Points (commonly used host)
        {
          const u = new URL('https://ev-chargepoints.search.hereapi.com/v1/chargepoints');
          u.searchParams.set('apiKey', HERE_API_KEY!);
          u.searchParams.set('at', `${lat},${lng}`);
          u.searchParams.set('radius', String(rMeters));
          u.searchParams.set('limit', limit);
          candidates.push(u.toString());
        }

        // Candidate 2: Alternative EV stations path (some docs/tenants use this)
        {
          const u = new URL('https://ev-chargepoints.search.hereapi.com/v1/ev/stations');
          u.searchParams.set('apiKey', HERE_API_KEY!);
          u.searchParams.set('at', `${lat},${lng}`);
          u.searchParams.set('radius', String(rMeters));
          u.searchParams.set('limit', limit);
          candidates.push(u.toString());
        }

        // Candidate 3: EV Charge Points API v3 (if enabled on account; exact URL depends on tenant/product)
        // We try a couple of common patterns; if your account is enabled you'll see 200s here, otherwise 401/403/404.
        {
          const u = new URL('https://ev-chargepoints.hereapi.com/v3/chargepoints');
          u.searchParams.set('apiKey', HERE_API_KEY!);
          u.searchParams.set('at', `${lat},${lng}`);
          u.searchParams.set('radius', String(rMeters));
          u.searchParams.set('limit', limit);
          candidates.push(u.toString());
        }
        {
          const u = new URL('https://ev-chargepoints.hereapi.com/v3/stations');
          u.searchParams.set('apiKey', HERE_API_KEY!);
          u.searchParams.set('at', `${lat},${lng}`);
          u.searchParams.set('radius', String(rMeters));
          u.searchParams.set('limit', limit);
          candidates.push(u.toString());
        }

        // Candidate 3: HERE Search/Discover fallback (EV charging POIs)
        {
          const u = new URL(ENDPOINTS.discover);
          u.searchParams.set('apiKey', HERE_API_KEY!);
          // NOTE: HERE Search APIs treat these as mutually exclusive: only one of `at` OR `in=*` is allowed.
          // For radius queries, prefer `in=circle:*` and omit `at`.
          u.searchParams.set('in', `circle:${lat},${lng};r=${rMeters}`);
          u.searchParams.set('q', q);
          u.searchParams.set('limit', limit);
          u.searchParams.set('lang', 'en-US');
          candidates.push(u.toString());
        }

        let lastErrText = '';
        for (const candidateUrl of candidates) {
          try {
            const resp = await fetch(candidateUrl);
            if (!resp.ok) {
              lastErrText = await resp.text().catch(() => '');
              attempts.push({
                url: candidateUrl.replace(HERE_API_KEY!, '***'),
                status: resp.status,
                errorSnippet: lastErrText.slice(0, 400),
              });
              continue;
            }
            const data = await resp.json();
            return NextResponse.json(
              {
                ...data,
                __debug: {
                  providerUrl: candidateUrl.replace(HERE_API_KEY!, '***'),
                  radiusMeters: rMeters,
                  attempts,
                },
              },
              { headers: { 'Cache-Control': 'public, max-age=120' } }
            );
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            lastErrText = message;
            attempts.push({
              url: candidateUrl.replace(HERE_API_KEY!, '***'),
              status: 0,
              errorSnippet: message.slice(0, 400),
            });
            continue;
          }
        }

        return NextResponse.json(
          {
            error: 'HERE EV charger search failed',
            details: lastErrText,
            __debug: { attempts, radiusMeters: rMeters },
          },
          { status: 502 }
        );
      }

      case 'routes': {
        const routeOrigin = searchParams.get('origin'); // lat,lng
        const destination = searchParams.get('destination'); // lat,lng
        const routeTransportMode = searchParams.get('transportMode') || 'car';
        const departureTime = searchParams.get('departureTime') || new Date().toISOString();
        const alternatives = searchParams.get('alternatives');
        const includeElevationProfile = searchParams.get('includeElevationProfile');

        if (!routeOrigin || !destination) {
          return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 });
        }

        // Validate transport mode for routing (standard modes only)
        const validRouteModes = ['car', 'truck', 'pedestrian', 'bicycle', 'scooter', 'taxi', 'bus'];
        if (!validRouteModes.includes(routeTransportMode)) {
          return NextResponse.json({ error: 'Invalid transport mode. Use "transit" endpoint for public transport.' }, { status: 400 });
        }

        // Build the URL with return parameters
        // NOTE: HERE supports "elevationProfile" return for generating an elevation profile along the route.
        // We only request it when explicitly enabled to keep payloads smaller for normal traffic.
        const returnParams =
          includeElevationProfile === '1' || includeElevationProfile === 'true'
            ? 'polyline,summary,actions,instructions,elevationProfile'
            : 'polyline,summary,actions,instructions';
        
        // For truck routing, we need to build the URL carefully with proper parameter encoding
        if (routeTransportMode === 'truck') {
          // Get truck parameters
          const truckHeight = searchParams.get('truckHeight');
          const truckWidth = searchParams.get('truckWidth');
          const truckLength = searchParams.get('truckLength');
          const truckWeight = searchParams.get('truckWeight');
          const truckAxles = searchParams.get('truckAxles');
          
          // Build URL with truck parameters
          // HERE Routing API v8 uses truck[attribute] format
          // Using encodeURIComponent for proper bracket encoding
          const urlParams = new URLSearchParams();
          urlParams.set('apiKey', HERE_API_KEY!);
          urlParams.set('origin', routeOrigin);
          urlParams.set('destination', destination);
          urlParams.set('transportMode', 'truck');
          urlParams.set('return', returnParams);
          urlParams.set('departureTime', departureTime);
          if (alternatives) urlParams.set('alternatives', alternatives);
          
          // Truck dimensions and attributes
          // Note: HERE v8 uses truck[height] etc. - brackets get URL encoded automatically
          if (truckHeight) urlParams.set('truck[height]', truckHeight);
          if (truckWidth) urlParams.set('truck[width]', truckWidth);
          if (truckLength) urlParams.set('truck[length]', truckLength);
          if (truckWeight) urlParams.set('truck[grossWeight]', truckWeight);
          if (truckAxles) urlParams.set('truck[axleCount]', truckAxles);
          urlParams.set('truck[type]', 'straight');
          
          // Don't include shippedHazardousGoods if not carrying hazmat
          // The API will still check dimensional restrictions
          
          url = `${ENDPOINTS.routes}?${urlParams.toString()}`;
          
          console.log('[HERE API] Truck routing request:');
          console.log('  Height:', truckHeight, 'cm (', Number(truckHeight) / 30.48, 'ft)');
          console.log('  Width:', truckWidth, 'cm');
          console.log('  Length:', truckLength, 'cm');
          console.log('  Weight:', truckWeight, 'kg (', Number(truckWeight) / 907.185, 'tons)');
          console.log('  Axles:', truckAxles);
          console.log('  Full URL params:', urlParams.toString());
        } else {
          const alt = alternatives ? `&alternatives=${encodeURIComponent(alternatives)}` : '';
          url = `${ENDPOINTS.routes}?apiKey=${HERE_API_KEY}&origin=${routeOrigin}&destination=${destination}&transportMode=${routeTransportMode}&return=${returnParams}&departureTime=${encodeURIComponent(departureTime)}${alt}`;
        }
        
        console.log('HERE Routes API URL:', url.replace(HERE_API_KEY!, '***'));
        break;
      }

      case 'transit': {
        const transitOrigin = searchParams.get('origin'); // lat,lng
        const transitDestination = searchParams.get('destination'); // lat,lng
        const departTime = searchParams.get('departureTime') || new Date().toISOString();

        if (!transitOrigin || !transitDestination) {
          return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 });
        }

        // HERE Public Transit API v8 - only returns actual public transit (no taxi/car)
        // This API specifically handles subway, bus, tram, rail, ferry
        url = `${ENDPOINTS.transit}?apiKey=${HERE_API_KEY}&origin=${transitOrigin}&destination=${transitDestination}&departureTime=${encodeURIComponent(departTime)}&return=polyline,travelSummary,intermediate&alternatives=3&pedestrian[maxDistance]=2000`;
        
        console.log('HERE Public Transit API URL:', url.replace(HERE_API_KEY!, '***'));
        break;
      }

      case 'weather': {
        const latitude = searchParams.get('latitude');
        const longitude = searchParams.get('longitude');
        const product = searchParams.get('product') || 'observation'; // observation, forecast_7days, etc.

        if (!latitude || !longitude) {
          return NextResponse.json({ error: 'Latitude and longitude are required' }, { status: 400 });
        }

        // HERE Destination Weather API
        // Products: observation (current), forecast_7days, forecast_hourly, alerts
        url = `${ENDPOINTS.weather}?apiKey=${HERE_API_KEY}&product=${product}&latitude=${latitude}&longitude=${longitude}&metric=false`;
        
        console.log('HERE Weather API URL:', url.replace(HERE_API_KEY!, '***'));
        break;
      }

      case 'truckrestrictions': {
        // HERE Fleet Telematics - Truck Restrictions Overlay
        // Returns truck restrictions (height, weight, etc.) for a bounding box
        const bbox = searchParams.get('bbox'); // format: west,south,east,north
        const overlay = searchParams.get('overlay') || 'TRUCK_RESTRICTIONS'; // TRUCK_RESTRICTIONS, VEHICLE_RESTRICTIONS
        
        if (!bbox) {
          return NextResponse.json({ error: 'Bounding box (bbox) is required' }, { status: 400 });
        }

        // Parse bbox and validate
        const [west, south, east, north] = bbox.split(',').map(Number);
        if ([west, south, east, north].some(isNaN)) {
          return NextResponse.json({ error: 'Invalid bounding box format' }, { status: 400 });
        }

        // HERE Fleet Telematics API for truck restrictions
        // overlay=TRUCK_RESTRICTIONS returns height, weight, length, width restrictions
        url = `${ENDPOINTS.truckrestrictions}?apiKey=${HERE_API_KEY}&overlay=${overlay}&bbox=${bbox}&responseattributes=shape`;
        
        console.log('HERE Truck Restrictions API URL:', url.replace(HERE_API_KEY!, '***'));
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown endpoint' }, { status: 400 });
    }

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HERE API error: ${response.status}`, errorText);
      
      // Handle rate limiting
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: 'HERE API request failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('HERE API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
