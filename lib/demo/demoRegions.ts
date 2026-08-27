export type DemoRegion = {
  id: string;
  name: string;
  country: string;
  center: { lat: number; lng: number };
  zoom: number;
  /** Street address for single-point search widgets */
  sampleAddress: string;
  /** Neighborhood / city query for area-based property widgets */
  areaQuery: string;
  routeFrom: string;
  routeTo: string;
  deliveryDestination: string;
  trafficTitle: string;
};

export const DEFAULT_DEMO_REGION_ID = 'seattle';

export const DEMO_REGIONS: DemoRegion[] = [
  {
    id: 'seattle',
    name: 'Seattle',
    country: 'United States',
    center: { lat: 47.6062, lng: -122.3321 },
    zoom: 13,
    sampleAddress: '400 Broad St, Seattle, WA 98109',
    areaQuery: 'Capitol Hill, Seattle, WA',
    routeFrom: 'Pike Place Market, Seattle, WA',
    routeTo: 'Space Needle, Seattle, WA',
    deliveryDestination: '400 Broad St, Seattle, WA 98109',
    trafficTitle: 'Downtown Seattle',
  },
  {
    id: 'los-angeles',
    name: 'Los Angeles',
    country: 'United States',
    center: { lat: 34.0522, lng: -118.2437 },
    zoom: 13,
    sampleAddress: '200 N Spring St, Los Angeles, CA 90012',
    areaQuery: 'Downtown Los Angeles, CA',
    routeFrom: 'Griffith Observatory, Los Angeles, CA',
    routeTo: 'Santa Monica Pier, Santa Monica, CA',
    deliveryDestination: '200 N Spring St, Los Angeles, CA 90012',
    trafficTitle: 'Downtown Los Angeles',
  },
  {
    id: 'new-york',
    name: 'New York',
    country: 'United States',
    center: { lat: 40.758, lng: -73.9855 },
    zoom: 14,
    sampleAddress: '350 5th Ave, New York, NY 10118',
    areaQuery: 'Midtown Manhattan, New York, NY',
    routeFrom: 'Times Square, New York, NY',
    routeTo: 'Central Park, New York, NY',
    deliveryDestination: '350 5th Ave, New York, NY 10118',
    trafficTitle: 'Midtown Manhattan',
  },
  {
    id: 'london',
    name: 'London',
    country: 'United Kingdom',
    center: { lat: 51.5074, lng: -0.1278 },
    zoom: 13,
    sampleAddress: 'Westminster, London SW1A 0AA, UK',
    areaQuery: 'Westminster, London, UK',
    routeFrom: 'Buckingham Palace, London, UK',
    routeTo: 'Tower of London, London, UK',
    deliveryDestination: '10 Downing St, London SW1A 2AA, UK',
    trafficTitle: 'Central London',
  },
  {
    id: 'paris',
    name: 'Paris',
    country: 'France',
    center: { lat: 48.8566, lng: 2.3522 },
    zoom: 13,
    sampleAddress: '5 Av. Anatole France, 75007 Paris, France',
    areaQuery: '7th Arrondissement, Paris, France',
    routeFrom: 'Eiffel Tower, Paris, France',
    routeTo: 'Louvre Museum, Paris, France',
    deliveryDestination: '5 Av. Anatole France, 75007 Paris, France',
    trafficTitle: 'Central Paris',
  },
  {
    id: 'berlin',
    name: 'Berlin',
    country: 'Germany',
    center: { lat: 52.52, lng: 13.405 },
    zoom: 13,
    sampleAddress: 'Pariser Platz, 10117 Berlin, Germany',
    areaQuery: 'Mitte, Berlin, Germany',
    routeFrom: 'Brandenburg Gate, Berlin, Germany',
    routeTo: 'Alexanderplatz, Berlin, Germany',
    deliveryDestination: 'Pariser Platz, 10117 Berlin, Germany',
    trafficTitle: 'Central Berlin',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    center: { lat: 35.6762, lng: 139.6503 },
    zoom: 13,
    sampleAddress: '1-1 Marunouchi, Chiyoda City, Tokyo 100-0005, Japan',
    areaQuery: 'Chiyoda, Tokyo, Japan',
    routeFrom: 'Tokyo Station, Tokyo, Japan',
    routeTo: 'Shibuya Crossing, Tokyo, Japan',
    deliveryDestination: '1-1 Marunouchi, Chiyoda City, Tokyo, Japan',
    trafficTitle: 'Central Tokyo',
  },
  {
    id: 'sydney',
    name: 'Sydney',
    country: 'Australia',
    center: { lat: -33.8688, lng: 151.2093 },
    zoom: 13,
    sampleAddress: 'Bennelong Point, Sydney NSW 2000, Australia',
    areaQuery: 'Sydney CBD, NSW, Australia',
    routeFrom: 'Sydney Opera House, Sydney, Australia',
    routeTo: 'Bondi Beach, Sydney, Australia',
    deliveryDestination: 'Bennelong Point, Sydney NSW 2000, Australia',
    trafficTitle: 'Sydney CBD',
  },
  {
    id: 'toronto',
    name: 'Toronto',
    country: 'Canada',
    center: { lat: 43.6532, lng: -79.3832 },
    zoom: 13,
    sampleAddress: '301 Front St W, Toronto, ON M5V 2T6, Canada',
    areaQuery: 'Downtown Toronto, ON, Canada',
    routeFrom: 'CN Tower, Toronto, Canada',
    routeTo: 'Royal Ontario Museum, Toronto, Canada',
    deliveryDestination: '301 Front St W, Toronto, ON, Canada',
    trafficTitle: 'Downtown Toronto',
  },
  {
    id: 'singapore',
    name: 'Singapore',
    country: 'Singapore',
    center: { lat: 1.3521, lng: 103.8198 },
    zoom: 13,
    sampleAddress: '18 Marina Gardens Dr, Singapore 018953',
    areaQuery: 'Marina Bay, Singapore',
    routeFrom: 'Marina Bay Sands, Singapore',
    routeTo: 'Gardens by the Bay, Singapore',
    deliveryDestination: '18 Marina Gardens Dr, Singapore',
    trafficTitle: 'Marina Bay, Singapore',
  },
  {
    id: 'dubai',
    name: 'Dubai',
    country: 'United Arab Emirates',
    center: { lat: 25.2048, lng: 55.2708 },
    zoom: 13,
    sampleAddress: '1 Sheikh Mohammed bin Rashid Blvd, Dubai, UAE',
    areaQuery: 'Downtown Dubai, UAE',
    routeFrom: 'Burj Khalifa, Dubai, UAE',
    routeTo: 'Dubai Mall, Dubai, UAE',
    deliveryDestination: '1 Sheikh Mohammed bin Rashid Blvd, Dubai, UAE',
    trafficTitle: 'Downtown Dubai',
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    country: 'India',
    center: { lat: 19.076, lng: 72.8777 },
    zoom: 13,
    sampleAddress: 'Apollo Bandar, Colaba, Mumbai, Maharashtra 400001, India',
    areaQuery: 'Colaba, Mumbai, India',
    routeFrom: 'Gateway of India, Mumbai, India',
    routeTo: 'Chhatrapati Shivaji Terminus, Mumbai, India',
    deliveryDestination: 'Apollo Bandar, Colaba, Mumbai, India',
    trafficTitle: 'South Mumbai',
  },
  {
    id: 'sao-paulo',
    name: 'São Paulo',
    country: 'Brazil',
    center: { lat: -23.5505, lng: -46.6333 },
    zoom: 13,
    sampleAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo, Brazil',
    areaQuery: 'Bela Vista, São Paulo, Brazil',
    routeFrom: 'MASP, São Paulo, Brazil',
    routeTo: 'Ibirapuera Park, São Paulo, Brazil',
    deliveryDestination: 'Av. Paulista, 1578, São Paulo, Brazil',
    trafficTitle: 'Av. Paulista, São Paulo',
  },
];

export function getDemoRegion(id: string): DemoRegion {
  return DEMO_REGIONS.find((r) => r.id === id) ?? DEMO_REGIONS[0];
}

/** Widgets whose demo geography is fixed regardless of the selected region. */
export const REGION_LOCKED_WIDGETS: Partial<Record<string, string>> = {
  citibike: 'Citi Bike station data is NYC-only — the map stays in New York.',
  'truck-route-planner': 'Zonar fleet demo uses Bellevue, WA route data.',
};
