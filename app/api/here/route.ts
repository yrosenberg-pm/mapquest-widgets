// app/api/here/route.ts
import { NextRequest, NextResponse } from 'next/server';

const HERE_API_KEY = process.env.HERE_API_KEY;

const ENDPOINTS: Record<string, string> = {
  isoline: 'https://isoline.router.hereapi.com/v8/isolines',
  geocode: 'https://geocode.search.hereapi.com/v1/geocode',
  revgeocode: 'https://revgeocode.search.hereapi.com/v1/revgeocode',
  routes: 'https://router.hereapi.com/v8/routes',
  // HERE Intermodal Routing API for public transit + walking
  transit: 'https://intermodal.router.hereapi.com/v8/routes',
};

export async function GET(request: NextRequest) {
  if (!HERE_API_KEY) {
    return NextResponse.json({ error: 'HERE API key not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint || !ENDPOINTS[endpoint]) {
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
        url = `${ENDPOINTS.routes}?apiKey=${HERE_API_KEY}&origin=${routeOrigin}&destination=${destination}&transportMode=${routeTransportMode}&return=${returnParams}&departureTime=${encodeURIComponent(departureTime)}`;
        
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

        // HERE Intermodal Routing API for public transit
        // Let the API determine best transit modes automatically
        url = `${ENDPOINTS.transit}?apiKey=${HERE_API_KEY}&origin=${transitOrigin}&destination=${transitDestination}&departureTime=${encodeURIComponent(departTime)}&return=polyline,travelSummary`;
        
        console.log('HERE Intermodal Transit API URL:', url.replace(HERE_API_KEY!, '***'));
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
