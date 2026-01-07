// app/api/mapquest/route.ts
import { NextRequest, NextResponse } from 'next/server';

const MAPQUEST_KEY = process.env.MAPQUEST_API_KEY;

const ENDPOINTS: Record<string, string> = {
  geocoding: 'https://www.mapquestapi.com/geocoding/v1/address',
  reverse: 'https://www.mapquestapi.com/geocoding/v1/reverse',
  searchahead: 'https://www.mapquestapi.com/search/v3/prediction',
  search: 'https://www.mapquestapi.com/search/v4/place',
  directions: 'https://www.mapquestapi.com/directions/v2/route',
  routematrix: 'https://www.mapquestapi.com/directions/v2/routematrix',
  optimizedroute: 'https://www.mapquestapi.com/directions/v2/optimizedroute',
  traffic: 'https://www.mapquestapi.com/traffic/v2/incidents',
};

export async function GET(request: NextRequest) {
  if (!MAPQUEST_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint || !ENDPOINTS[endpoint]) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  }

  console.log('API Key loaded:', MAPQUEST_KEY ? 'Yes' : 'No');

  try {
    let url: string;
    let options: RequestInit = { method: 'GET' };

    switch (endpoint) {
      case 'geocoding': {
        const location = searchParams.get('location');
        const maxResults = searchParams.get('maxResults') || '5';
        url = `${ENDPOINTS.geocoding}?key=${MAPQUEST_KEY}&location=${encodeURIComponent(location || '')}&maxResults=${maxResults}`;
        break;
      }

      case 'searchahead': {
        const q = searchParams.get('q');
        const limit = searchParams.get('limit') || '6';
        // MapQuest Search API v3 prediction endpoint format
        url = `${ENDPOINTS.searchahead}?key=${MAPQUEST_KEY}&q=${encodeURIComponent(q || '')}&limit=${limit}&collection=address,adminArea`;
        break;
      }

      case 'search': {
        const location = searchParams.get('location');
        const category = searchParams.get('category');
        const radius = searchParams.get('radius') || '5';
        const pageSize = searchParams.get('pageSize') || '10';
        const sort = searchParams.get('sort') || 'distance';
        url = `${ENDPOINTS.search}?key=${MAPQUEST_KEY}&location=${location}&category=${encodeURIComponent(category || '')}&radius=${radius}&pageSize=${pageSize}&sort=${sort}`;
        break;
      }

      case 'directions': {
        const from = searchParams.get('from');
        // Get all 'to' parameters for waypoints
        const allToParams = searchParams.getAll('to');
        const routeType = searchParams.get('routeType') || 'fastest';
        const avoids = searchParams.get('avoids');
        
        let directionsUrl = `${ENDPOINTS.directions}?key=${MAPQUEST_KEY}&from=${from}&routeType=${routeType}&narrativeType=text&unit=m&fullShape=true`;
        
        // Add all waypoints as 'to' parameters
        allToParams.forEach(to => {
          directionsUrl += `&to=${to}`;
        });
        
        if (avoids) directionsUrl += `&avoids=${encodeURIComponent(avoids)}`;
        url = directionsUrl;
        break;
      }

      case 'routematrix': {
        const locations = searchParams.get('locations')?.split('|') || [];
        const routeType = searchParams.get('routeType') || 'fastest';
        const allToAll = searchParams.get('allToAll') === 'true';
        
        // Route matrix uses POST with JSON body
        url = `${ENDPOINTS.routematrix}?key=${MAPQUEST_KEY}`;
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
        const locations = searchParams.get('locations')?.split('|') || [];
        
        url = `${ENDPOINTS.optimizedroute}?key=${MAPQUEST_KEY}`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations: locations.map(loc => {
              const [lat, lng] = loc.split(',');
              return { latLng: { lat: parseFloat(lat), lng: parseFloat(lng) } };
            }),
            options: {
              routeType: 'fastest',
              unit: 'm',
            },
          }),
        };
        break;
      }

      case 'traffic': {
        const boundingBox = searchParams.get('boundingBox');
        url = `${ENDPOINTS.traffic}?key=${MAPQUEST_KEY}&boundingBox=${boundingBox}&filters=incidents,construction`;
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown endpoint' }, { status: 400 });
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`MapQuest API error: ${response.status}`, errorText);
      return NextResponse.json(
        { error: 'MapQuest API request failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
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