import { NextRequest, NextResponse } from 'next/server';

const SHOVELS_API_KEY = process.env.SHOVELS_API_KEY;
const BASE_URL = 'https://api.shovels.ai/v2';

export async function GET(request: NextRequest) {
  if (!SHOVELS_API_KEY) {
    return NextResponse.json(
      { error: 'Shovels API key not configured. Add SHOVELS_API_KEY to your .env.local file.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint parameter' }, { status: 400 });
  }

  try {
    switch (endpoint) {
      case 'permits-search': {
        const geo_id = searchParams.get('geo_id');
        const permit_from = searchParams.get('permit_from');
        const permit_to = searchParams.get('permit_to');

        if (!geo_id || !permit_from || !permit_to) {
          return NextResponse.json(
            { error: 'Missing required params: geo_id, permit_from, permit_to' },
            { status: 400 },
          );
        }

        const url = new URL(`${BASE_URL}/permits/search`);
        url.searchParams.set('geo_id', geo_id);
        url.searchParams.set('permit_from', permit_from);
        url.searchParams.set('permit_to', permit_to);
        url.searchParams.set('size', searchParams.get('size') || '100');

        const permitTags = searchParams.getAll('permit_tags');
        for (const tag of permitTags) {
          url.searchParams.append('permit_tags', tag);
        }

        const propertyType = searchParams.get('property_type');
        if (propertyType) url.searchParams.set('property_type', propertyType);

        const cursor = searchParams.get('cursor');
        if (cursor) url.searchParams.set('cursor', cursor);

        const resp = await fetch(url.toString(), {
          headers: { 'X-API-Key': SHOVELS_API_KEY },
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return NextResponse.json(
            { error: `Shovels API error: ${resp.status}`, details: errBody },
            { status: resp.status },
          );
        }

        return NextResponse.json(await resp.json());
      }

      case 'zipcodes-search': {
        const q = searchParams.get('q');
        if (!q) {
          return NextResponse.json({ error: 'Missing required param: q' }, { status: 400 });
        }

        const url = new URL(`${BASE_URL}/zipcodes/search`);
        url.searchParams.set('q', q);
        url.searchParams.set('size', searchParams.get('size') || '50');

        const resp = await fetch(url.toString(), {
          headers: { 'X-API-Key': SHOVELS_API_KEY },
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return NextResponse.json(
            { error: `Shovels API error: ${resp.status}`, details: errBody },
            { status: resp.status },
          );
        }

        return NextResponse.json(await resp.json());
      }

      default:
        return NextResponse.json({ error: `Unknown endpoint: ${endpoint}` }, { status: 400 });
    }
  } catch (err) {
    console.error('Shovels API proxy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
