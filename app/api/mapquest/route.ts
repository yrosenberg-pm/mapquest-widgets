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
  // Isoline API (v1): driving / walking / bicycling
  // NOTE: We also accept `endpoint=isoline` (see switch) and select the correct mode below.
  isoline: 'https://www.mapquestapi.com/isolines/v1/driving',
  isoline_driving: 'https://www.mapquestapi.com/isolines/v1/driving',
  isoline_walking: 'https://www.mapquestapi.com/isolines/v1/walking',
  isoline_bicycling: 'https://www.mapquestapi.com/isolines/v1/bicycling',
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
        // Include POIs so users can type things like "Empire State Building" across all widgets.
        url = `${ENDPOINTS.searchahead}?key=${MAPQUEST_KEY}&q=${encodeURIComponent(q || '')}&limit=${limit}&collection=address,adminArea,poi`;
        break;
      }

      case 'search': {
        const location = searchParams.get('location');
        const category = searchParams.get('category');
        const q = searchParams.get('q'); // Text search parameter
        const radius = searchParams.get('radius') || '5';
        const pageSize = searchParams.get('pageSize') || '10';
        const sort = searchParams.get('sort') || 'distance';
        
        // Parse location - format is "lat,lng" from our API, but MapQuest expects "lng,lat"
        const [lat, lng] = location?.split(',') || ['', ''];
        
        // Convert radius from miles to meters (1 mile = 1609.34 meters)
        const radiusMeters = Math.round(parseFloat(radius) * 1609.34);
        
        // MapQuest Search API v4/place expects location in format "lng,lat" (longitude first!)
        // Based on NHL Arena Explorer implementation
        // Support both category (SIC codes) and q (text search) parameters
        let searchParam = '';
        if (q) {
          searchParam = `&q=${encodeURIComponent(q)}`;
        } else if (category) {
          searchParam = `&category=${encodeURIComponent(category)}`;
        }
        
        url = `${ENDPOINTS.search}?key=${MAPQUEST_KEY}&location=${lng},${lat}&radius=${radiusMeters}${searchParam}&pageSize=${pageSize}&sort=${sort}`;
        
        console.log('[API] Search request:', { lat, lng, location: `${lng},${lat}`, category, q, radius, radiusMeters, pageSize, sort });
        break;
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
        
        let directionsUrl = `${ENDPOINTS.directions}?key=${MAPQUEST_KEY}&from=${from}&routeType=${routeType}&narrativeType=text&unit=m&fullShape=true`;
        
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
        
        url = `${ENDPOINTS.optimizedroute}?key=${MAPQUEST_KEY}`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        };
        break;
      }

      case 'traffic': {
        const boundingBox = searchParams.get('boundingBox');
        url = `${ENDPOINTS.traffic}?key=${MAPQUEST_KEY}&boundingBox=${boundingBox}&filters=incidents,construction`;
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
        url = `${isolineEndpoint}?key=${MAPQUEST_KEY}`
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
    
    // Log search endpoint responses for debugging
    if (endpoint === 'search') {
      console.log('[API] Search response structure:', {
        hasResults: !!data.results,
        hasSearchResults: !!data.searchResults,
        isArray: Array.isArray(data),
        keys: Object.keys(data),
        resultCount: data.results?.length || data.searchResults?.results?.length || (Array.isArray(data) ? data.length : 0)
      });
    }
    
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