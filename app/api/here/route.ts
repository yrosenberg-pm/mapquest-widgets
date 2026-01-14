// app/api/here/route.ts
import { NextRequest, NextResponse } from 'next/server';

const HERE_API_KEY = process.env.HERE_API_KEY;

const ENDPOINTS: Record<string, string> = {
  isoline: 'https://isoline.router.hereapi.com/v8/isolines',
  geocode: 'https://geocode.search.hereapi.com/v1/geocode',
  revgeocode: 'https://revgeocode.search.hereapi.com/v1/revgeocode',
  autosuggest: 'https://autosuggest.search.hereapi.com/v1/autosuggest',
  routes: 'https://router.hereapi.com/v8/routes',
  // HERE Public Transit API - only returns subway, bus, tram, ferry (no taxi/car)
  transit: 'https://transit.router.hereapi.com/v8/routes',
  // HERE Destination Weather API
  weather: 'https://weather.ls.hereapi.com/weather/1.0/report.json',
  // HERE Fleet Telematics - Truck Restrictions
  truckrestrictions: 'https://fleet.ls.hereapi.com/2/overlays.json',
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

      case 'routes': {
        const routeOrigin = searchParams.get('origin'); // lat,lng
        const destination = searchParams.get('destination'); // lat,lng
        const routeTransportMode = searchParams.get('transportMode') || 'car';
        const departureTime = searchParams.get('departureTime') || new Date().toISOString();

        if (!routeOrigin || !destination) {
          return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 });
        }

        // Validate transport mode for routing (standard modes only)
        const validRouteModes = ['car', 'truck', 'pedestrian', 'bicycle', 'scooter', 'taxi', 'bus'];
        if (!validRouteModes.includes(routeTransportMode)) {
          return NextResponse.json({ error: 'Invalid transport mode. Use "transit" endpoint for public transport.' }, { status: 400 });
        }

        // Build the URL with return parameters
        const returnParams = 'polyline,summary,actions,instructions';
        
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
          url = `${ENDPOINTS.routes}?apiKey=${HERE_API_KEY}&origin=${routeOrigin}&destination=${destination}&transportMode=${routeTransportMode}&return=${returnParams}&departureTime=${encodeURIComponent(departureTime)}`;
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
