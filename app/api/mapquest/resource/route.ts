import { NextRequest, NextResponse } from 'next/server';
import { assertMapQuestProxyTarget } from '@/lib/mapquestResourceProxy';

const SERVER_KEY = process.env.MAPQUEST_API_KEY;

export const runtime = 'nodejs';

function attachKey(target: URL, apiKey: string): string {
  const u = new URL(target.toString());
  u.searchParams.set('key', apiKey);
  return u.toString();
}

async function proxyGet(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('target');
  if (!target) {
    return NextResponse.json({ error: 'Missing target parameter' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = assertMapQuestProxyTarget(target);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid target' },
      { status: 400 },
    );
  }

  const clientKey = searchParams.get('apiKey')?.trim();
  const apiKey = clientKey || SERVER_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured on server' }, { status: 500 });
  }

  const upstream = attachKey(parsed, apiKey);
  const accept = request.headers.get('accept') ?? '*/*';

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: 'GET',
      headers: {
        Accept: accept,
        'User-Agent': 'mapquest-widgets-proxy',
      },
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[mapquest/resource] upstream fetch failed:', e);
    return NextResponse.json({ error: 'Failed to reach MapQuest' }, { status: 502 });
  }

  const contentType = upstreamRes.headers.get('content-type') ?? 'application/octet-stream';
  const body = await upstreamRes.arrayBuffer();

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  if (upstreamRes.ok && !contentType.includes('json')) {
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  } else {
    headers.set('Cache-Control', 'private, no-store');
  }

  return new NextResponse(body, {
    status: upstreamRes.status,
    headers,
  });
}

export async function GET(request: NextRequest) {
  return proxyGet(request);
}

export async function HEAD(request: NextRequest) {
  const res = await proxyGet(request);
  return new NextResponse(null, {
    status: res.status,
    headers: res.headers,
  });
}