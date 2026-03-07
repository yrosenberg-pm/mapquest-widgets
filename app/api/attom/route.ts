import { NextRequest, NextResponse } from 'next/server';

const ATTOM_API_KEY = process.env.ATTOM_API_KEY;
const BASE = 'https://api.gateway.attomdata.com';

const ALLOWED_ENDPOINTS: Record<string, string> = {
  'property-detail': '/propertyapi/v1.0.0/property/detail',
  'property-basicprofile': '/propertyapi/v1.0.0/property/basicprofile',
  'property-expandedprofile': '/propertyapi/v1.0.0/property/expandedprofile',
  'attomavm-detail': '/propertyapi/v1.0.0/attomavm/detail',
  'assessment-detail': '/propertyapi/v1.0.0/assessment/detail',
  'sale-detail': '/propertyapi/v1.0.0/sale/detail',
  'sale-snapshot': '/propertyapi/v1.0.0/sale/snapshot',
  'community': '/v4/neighborhood/community',
};

export async function GET(request: NextRequest) {
  if (!ATTOM_API_KEY) {
    return NextResponse.json(
      { error: 'ATTOM API key not configured. Add ATTOM_API_KEY to your .env.local file.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint || !ALLOWED_ENDPOINTS[endpoint]) {
    return NextResponse.json(
      { error: `Invalid endpoint. Allowed: ${Object.keys(ALLOWED_ENDPOINTS).join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const url = new URL(`${BASE}${ALLOWED_ENDPOINTS[endpoint]}`);

    for (const [key, value] of searchParams.entries()) {
      if (key === 'endpoint') continue;
      url.searchParams.set(key, value);
    }

    const resp = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        apikey: ATTOM_API_KEY,
      },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`ATTOM API error [${endpoint}]: ${resp.status}`, errBody);
      return NextResponse.json(
        { error: `ATTOM API error: ${resp.status}`, details: errBody },
        { status: resp.status },
      );
    }

    const data = await resp.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    console.error('ATTOM API proxy error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
