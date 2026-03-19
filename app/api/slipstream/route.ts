import { NextRequest, NextResponse } from 'next/server';

const SLIPSTREAM_AUTH_TOKEN = process.env.SLIPSTREAM_AUTH_TOKEN;
const BASE = 'https://slipstream.homejunction.com';

const ALLOWED_ENDPOINTS: Record<string, string> = {
  'neighborhoods-get': '/ws/areas/neighborhoods/get',
  'neighborhoods-search': '/ws/areas/neighborhoods/search',
};

export async function GET(request: NextRequest) {
  if (!SLIPSTREAM_AUTH_TOKEN) {
    return NextResponse.json(
      { error: 'Slipstream auth token not configured. Add SLIPSTREAM_AUTH_TOKEN to your .env.local file.' },
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
        Authorization: `Bearer ${SLIPSTREAM_AUTH_TOKEN}`,
      },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`Slipstream API error [${endpoint}]: ${resp.status}`, errBody);
      return NextResponse.json(
        { error: `Slipstream API error: ${resp.status}`, details: errBody },
        { status: resp.status },
      );
    }

    const data = await resp.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (err) {
    console.error('Slipstream API proxy error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

