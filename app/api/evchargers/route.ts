import { NextResponse } from 'next/server';

type OcmConnection = {
  ConnectionType?: { Title?: string };
  PowerKW?: number;
  Quantity?: number;
};

type OcmStation = {
  ID?: number;
  UUID?: string;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    StateOrProvince?: string;
    Postcode?: string;
    Latitude?: number;
    Longitude?: number;
  };
  OperatorInfo?: { Title?: string };
  NumberOfPoints?: number;
  Connections?: OcmConnection[];
};

const SAMPLE: OcmStation[] = [
  // LA area sample cluster
  {
    ID: 100001,
    AddressInfo: { Title: 'Downtown Fast Charge', Latitude: 34.0506, Longitude: -118.2469, Town: 'Los Angeles', StateOrProvince: 'CA' },
    OperatorInfo: { Title: 'Electrify America' },
    NumberOfPoints: 6,
    Connections: [{ ConnectionType: { Title: 'CCS' }, PowerKW: 150, Quantity: 6 }],
  },
  {
    ID: 100002,
    AddressInfo: { Title: 'Santa Monica Supercharge', Latitude: 34.0195, Longitude: -118.4912, Town: 'Santa Monica', StateOrProvince: 'CA' },
    OperatorInfo: { Title: 'Tesla' },
    NumberOfPoints: 10,
    Connections: [{ ConnectionType: { Title: 'NACS (Tesla)' }, PowerKW: 250, Quantity: 10 }],
  },
  {
    ID: 100003,
    AddressInfo: { Title: 'Pasadena Public Chargers', Latitude: 34.1478, Longitude: -118.1445, Town: 'Pasadena', StateOrProvince: 'CA' },
    OperatorInfo: { Title: 'ChargePoint' },
    NumberOfPoints: 4,
    Connections: [{ ConnectionType: { Title: 'J1772' }, PowerKW: 7.2, Quantity: 4 }],
  },
  {
    ID: 100004,
    AddressInfo: { Title: 'Burbank DC Fast', Latitude: 34.1808, Longitude: -118.309, Town: 'Burbank', StateOrProvince: 'CA' },
    OperatorInfo: { Title: 'EVgo' },
    NumberOfPoints: 3,
    Connections: [{ ConnectionType: { Title: 'CCS' }, PowerKW: 100, Quantity: 3 }],
  },
  {
    ID: 100005,
    AddressInfo: { Title: 'Long Beach Rapid Charge', Latitude: 33.7701, Longitude: -118.1937, Town: 'Long Beach', StateOrProvince: 'CA' },
    OperatorInfo: { Title: 'Shell Recharge' },
    NumberOfPoints: 5,
    Connections: [{ ConnectionType: { Title: 'CCS' }, PowerKW: 62.5, Quantity: 5 }],
  },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const distMiles = searchParams.get('distanceMiles') ?? '25';
  const max = searchParams.get('max') ?? '75';

  // OCM distance unit is KM when distanceunit=KM
  const distKm = String(Math.max(1, Math.min(100, Math.round(Number(distMiles) * 1.60934))));

  // If missing coords, return sample data
  if (!lat || !lng) {
    return NextResponse.json({ source: 'sample', stations: SAMPLE });
  }

  try {
    const url = new URL('https://api.openchargemap.io/v3/poi/');
    url.searchParams.set('output', 'json');
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lng);
    url.searchParams.set('distance', distKm);
    url.searchParams.set('distanceunit', 'KM');
    url.searchParams.set('maxresults', max);
    // Use full results (compact=true can omit fields and sometimes yields smaller/less useful datasets).
    url.searchParams.set('compact', 'false');
    url.searchParams.set('verbose', 'false');
    // If an API key is configured, add it as a query param (most reliable) and avoid sending empty headers.
    const key = process.env.OPENCHARGEMAP_API_KEY;
    if (key) url.searchParams.set('key', key);

    const res = await fetch(url.toString(), {
      headers: key ? { 'X-API-Key': key } : undefined,
      // Avoid caching in demo environment so results change by location.
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({
        source: 'sample',
        stations: SAMPLE,
        error: `OCM ${res.status}`,
        debug: { distanceMiles: distMiles, distanceKm: distKm, maxresults: max },
      });
    }

    const data = (await res.json()) as OcmStation[];
    const stations = Array.isArray(data) ? data : [];
    return NextResponse.json({
      source: 'ocm',
      stations,
      debug: { distanceMiles: distMiles, distanceKm: distKm, maxresults: max, returned: stations.length },
    });
  } catch {
    return NextResponse.json({
      source: 'sample',
      stations: SAMPLE,
      error: 'fetch_failed',
      debug: { distanceMiles: distMiles, distanceKm: distKm, maxresults: max },
    });
  }
}

