// lib/mapquest.ts
// MapQuest API client - all calls go through /api/mapquest proxy

const API_BASE = '/api/mapquest';

interface Location {
  lat: number;
  lng: number;
}

interface GeocodedLocation {
  street: string;
  adminArea5: string; // city
  adminArea3: string; // state
  adminArea1: string; // country
  postalCode: string;
  latLng: { lat: number; lng: number };
  displayLatLng: { lat: number; lng: number };
  lat: number;
  lng: number;
}

// ============ GEOCODING ============

export async function geocode(query: string, maxResults: number = 5): Promise<GeocodedLocation | null> {
  try {
    const res = await fetch(`${API_BASE}?endpoint=geocoding&location=${encodeURIComponent(query)}&maxResults=${maxResults}`);
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data.results?.[0]?.locations?.[0];
    if (!loc) return null;
    return {
      ...loc,
      lat: loc.latLng?.lat || loc.displayLatLng?.lat,
      lng: loc.latLng?.lng || loc.displayLatLng?.lng,
    };
  } catch (err) {
    console.error('Geocoding failed:', err);
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedLocation | null> {
  try {
    const res = await fetch(`${API_BASE}?endpoint=geocoding&location=${lat},${lng}&maxResults=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data.results?.[0]?.locations?.[0];
    if (!loc) return null;
    return {
      ...loc,
      lat: loc.latLng?.lat || lat,
      lng: loc.latLng?.lng || lng,
    };
  } catch (err) {
    console.error('Reverse geocoding failed:', err);
    return null;
  }
}

// ============ SEARCH AHEAD (Autocomplete) ============

interface SearchAheadResult {
  name: string;
  displayString: string;
  place?: {
    geometry?: {
      coordinates?: [number, number]; // [lng, lat]
    };
    properties?: {
      street?: string;
      city?: string;
      stateCode?: string;
      postalCode?: string;
    };
  };
}

export async function searchAhead(query: string, limit: number = 6): Promise<SearchAheadResult[]> {
  try {
    const url = `${API_BASE}?endpoint=searchahead&q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Search ahead API error:', res.status, res.statusText, errorText);
      return [];
    }
    
    const data = await res.json();
    
    // MapQuest Search API v3 prediction returns data in 'results' array
    // Each result has: name, displayString, place (with geometry and properties)
    if (data.results && Array.isArray(data.results)) {
      return data.results.map((item: any) => {
        // Extract coordinates from place.geometry.coordinates [lng, lat]
        const coords = item.place?.geometry?.coordinates;
        return {
          name: item.name || item.displayString || '',
          displayString: item.displayString || item.name || '',
          place: item.place || undefined,
          // Add direct access to coordinates for easier use
          lat: coords ? coords[1] : undefined, // latitude is second
          lng: coords ? coords[0] : undefined, // longitude is first
          // Add properties for easier access
          city: item.place?.properties?.city,
          state: item.place?.properties?.state || item.place?.properties?.stateCode,
          postalCode: item.place?.properties?.postalCode,
          country: item.place?.properties?.country,
        };
      });
    }
    
    // Fallback for other formats
    if (Array.isArray(data)) {
      return data;
    }
    
    if (data.predictions && Array.isArray(data.predictions)) {
      return data.predictions;
    }
    
    // Check for error in response
    if (data.error) {
      console.error('API returned error:', data.error);
      return [];
    }
    
    return [];
  } catch (err) {
    console.error('Search ahead failed:', err);
    return [];
  }
}

// ============ PLACE SEARCH ============

interface PlaceSearchResult {
  name: string;
  displayString?: string;
  distance?: number;
  place?: {
    geometry?: {
      coordinates?: [number, number];
    };
    properties?: {
      street?: string;
      city?: string;
      phone?: string;
    };
  };
}

export async function searchPlaces(
  lat: number,
  lng: number,
  category: string,
  radiusMiles: number = 5,
  maxResults: number = 10
): Promise<PlaceSearchResult[]> {
  try {
    // Handle multi-search queries (e.g., "multi:bus stop,sic:411101,subway station")
    // This searches for multiple terms and combines results
    // Terms starting with "sic:" are treated as SIC code searches, others as text searches
    if (category.startsWith('multi:')) {
      const searchTerms = category.substring(6).split(',').map(t => t.trim());
      console.log(`[searchPlaces] Multi-search for terms: ${searchTerms.join(', ')}`);
      
      // Search for each term in parallel
      // If term starts with "sic:", use it as-is, otherwise treat as text query
      const searchPromises = searchTerms.map(term => {
        const searchCategory = term.startsWith('sic:') ? term : `q:${term}`;
        return searchPlacesSingle(lat, lng, searchCategory, radiusMiles, Math.ceil(maxResults / searchTerms.length) + 5);
      });
      
      const allResults = await Promise.all(searchPromises);
      
      // Combine and deduplicate results by name + coordinates
      const seen = new Set<string>();
      const combinedResults: PlaceSearchResult[] = [];
      
      for (const results of allResults) {
        for (const result of results) {
          const key = `${result.name}-${result.place?.geometry?.coordinates?.join(',')}`;
          if (!seen.has(key)) {
            seen.add(key);
            combinedResults.push(result);
          }
        }
      }
      
      // Sort by distance and limit results
      combinedResults.sort((a, b) => (a.distance || 999) - (b.distance || 999));
      console.log(`[searchPlaces] Multi-search found ${combinedResults.length} unique results`);
      return combinedResults.slice(0, maxResults);
    }
    
    // Single search
    return searchPlacesSingle(lat, lng, category, radiusMiles, maxResults);
  } catch (err) {
    console.error('Place search failed:', err);
    return [];
  }
}

async function searchPlacesSingle(
  lat: number,
  lng: number,
  category: string,
  radiusMiles: number,
  maxResults: number
): Promise<PlaceSearchResult[]> {
  try {
    const params = new URLSearchParams({
      endpoint: 'search',
      location: `${lat},${lng}`,
      sort: 'distance',
      pageSize: maxResults.toString(),
      radius: radiusMiles.toString(),
    });
    
    // Support both category (SIC codes) and q (text search) parameters
    // Format: "sic:581208" for category, "q:restaurant" for text search
    if (category.startsWith('q:')) {
      params.append('q', category.substring(2)); // Remove "q:" prefix
    } else {
      params.append('category', category);
    }
    
    console.log(`[searchPlaces] Requesting: ${category.startsWith('q:') ? 'q=' + category.substring(2) : 'category=' + category}, location=${lat},${lng}, radius=${radiusMiles}mi`);
    
    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Place search API error:', res.status, res.statusText, errorText);
      return [];
    }
    const data = await res.json();
    
    console.log(`[searchPlaces] Raw API response for ${category}:`, JSON.stringify(data, null, 2).substring(0, 500));
    
    // MapQuest Search API v4/place returns results in different possible structures
    // Check for: data.results, data.searchResults.results, or direct array
    let results: any[] = [];
    
    if (data.results && Array.isArray(data.results)) {
      results = data.results;
    } else if (data.searchResults && data.searchResults.results && Array.isArray(data.searchResults.results)) {
      results = data.searchResults.results;
    } else if (Array.isArray(data)) {
      results = data;
    } else if (data.searchResults && Array.isArray(data.searchResults)) {
      results = data.searchResults;
    }
    
    console.log(`[searchPlaces] Category: ${category}, Found ${results.length} results`);
    
    // Map results to PlaceSearchResult format, ensuring distance is in miles
    const mappedResults: PlaceSearchResult[] = results.map((item: any) => {
      // Distance might be in meters, convert to miles if > 1
      let distance = item.distance;
      if (distance && distance > 10) {
        // Likely in meters, convert to miles (1 meter = 0.000621371 miles)
        distance = distance * 0.000621371;
      } else if (item.distanceKm) {
        // If in kilometers, convert to miles
        distance = item.distanceKm * 0.621371;
      } else if (item.place?.distance) {
        distance = item.place.distance;
        if (distance > 10) distance = distance * 0.000621371;
      }
      
      return {
        name: item.name || item.displayString || item.title || 'Unknown',
        displayString: item.displayString || item.name || item.title,
        distance: distance || undefined,
        place: item.place || {
          geometry: item.geometry || {
            coordinates: item.coordinates || [item.lng, item.lat] || undefined
          },
          properties: item.properties || {
            street: item.street,
            city: item.city,
            phone: item.phone
          }
        }
      };
    });
    
    if (mappedResults.length > 0) {
      console.log(`[searchPlaces] First mapped result:`, {
        name: mappedResults[0].name,
        distance: mappedResults[0].distance,
        hasPlace: !!mappedResults[0].place
      });
    }
    
    return mappedResults;
  } catch (err) {
    console.error('Place search failed:', err);
    return [];
  }
}

// ============ DIRECTIONS ============

interface DirectionsResult {
  distance: number;
  time: number;
  fuelUsed?: number;
  hasTolls?: boolean;
  hasHighway?: boolean;
  legs?: any[];
  steps?: any[];
}

export async function getDirections(
  from: string,
  to: string,
  routeType: 'fastest' | 'shortest' | 'pedestrian' | 'bicycle' = 'fastest',
  departureTime?: Date | 'now'
): Promise<DirectionsResult | null> {
  try {
    const params = new URLSearchParams({
      endpoint: 'directions',
      from,
      to,
      routeType,
      useTraffic: 'true', // Enable real-time traffic
    });
    
    // Add departure time for traffic predictions
    if (departureTime && departureTime !== 'now') {
      params.set('timeType', '1'); // 1 = departure time
      // Format: MM/DD/YYYY HH:MM:SS
      const dt = departureTime;
      const dateStr = `${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getDate().toString().padStart(2, '0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}:00`;
      params.set('dateTime', dateStr);
    }
    
    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) {
      console.error('Directions API error:', res.status);
      return null;
    }
    
    const data = await res.json();
    const route = data.route;
    
    if (!route || (route as any).routeError) {
      console.error('Route error:', (route as any)?.routeError?.message || 'Could not calculate route');
      return null;
    }
    
    return {
      distance: route.distance,
      time: route.time / 60, // Convert seconds to minutes
      fuelUsed: route.fuelUsed,
      hasTolls: route.hasTollRoad,
      hasHighway: route.hasHighway,
      legs: route.legs || [],
      steps: route.legs?.[0]?.maneuvers || [],
    };
  } catch (err) {
    console.error('getDirections failed:', err);
    return null;
  }
}

// ============ ROUTE MATRIX ============

interface RouteMatrixOptions {
  routeType?: 'fastest' | 'shortest' | 'pedestrian' | 'bicycle';
  allToAll?: boolean;
}

interface RouteMatrixResult {
  distance: number[];
  time: number[];
}

export async function getRouteMatrix(
  locations: Location[],
  options: RouteMatrixOptions = {}
): Promise<RouteMatrixResult> {
  try {
    const params = new URLSearchParams({
      endpoint: 'routematrix',
      locations: locations.map(l => `${l.lat},${l.lng}`).join('|'),
      routeType: options.routeType || 'fastest',
      allToAll: (options.allToAll ?? false).toString(),
    });
    
    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) return { distance: [], time: [] };
    const data = await res.json();
    
    return {
      distance: data.distance || [],
      time: data.time || [],
    };
  } catch (err) {
    console.error('Route matrix failed:', err);
    return { distance: [], time: [] };
  }
}

// ============ ROUTE OPTIMIZATION ============

interface OptimizeRouteResult {
  locationSequence: number[];
  distance: number;
  time: number;
}

export async function optimizeRoute(locations: Location[]): Promise<OptimizeRouteResult | null> {
  try {
    const params = new URLSearchParams({
      endpoint: 'optimizedroute',
      locations: locations.map(l => `${l.lat},${l.lng}`).join('|'),
    });
    
    console.log('[optimizeRoute] Calling API with', locations.length, 'locations');
    const res = await fetch(`${API_BASE}?${params}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('[optimizeRoute] API error:', res.status, errorText);
      return null;
    }
    
    const data = await res.json();
    console.log('[optimizeRoute] Full API response:', JSON.stringify(data, null, 2));
    
    const route = data.route;
    if (!route) {
      console.error('[optimizeRoute] No route in response:', data);
      return null;
    }
    
    console.log('[optimizeRoute] Route found:', {
      locationSequence: route.locationSequence,
      distance: route.distance,
      time: route.time,
    });
    
    return {
      locationSequence: route.locationSequence || [],
      distance: route.distance || 0,
      time: route.time || 0,
    };
  } catch (err) {
    console.error('[optimizeRoute] Exception:', err);
    return null;
  }
}

// ============ TRAFFIC ============

interface TrafficIncident {
  id: string;
  type: string;
  severity: number;
  shortDesc: string;
  fullDesc: string;
  lat: number;
  lng: number;
}

export async function getTrafficIncidents(
  boundingBox: { north: number; south: number; east: number; west: number }
): Promise<TrafficIncident[]> {
  try {
    const params = new URLSearchParams({
      endpoint: 'traffic',
      boundingBox: `${boundingBox.north},${boundingBox.west},${boundingBox.south},${boundingBox.east}`,
    });
    
    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    
    return (data.incidents || []).map((inc: any) => ({
      id: inc.id,
      type: inc.type,
      severity: inc.severity,
      shortDesc: inc.shortDesc,
      fullDesc: inc.fullDesc,
      lat: inc.lat,
      lng: inc.lng,
    }));
  } catch (err) {
    console.error('Traffic request failed:', err);
    return [];
  }
}