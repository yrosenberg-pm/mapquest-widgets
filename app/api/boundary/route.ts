import { NextRequest, NextResponse } from 'next/server';

const CACHE_HEADER = { 'Cache-Control': 'public, max-age=86400' }; // 24h — boundaries rarely change

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // zip | city | state
  const q = searchParams.get('q')?.trim();

  if (!type || !q) {
    return NextResponse.json({ error: 'Missing type or q parameter' }, { status: 400 });
  }

  try {
    if (type === 'zip') {
      const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/2/query?where=ZCTA5%3D%27${encodeURIComponent(q)}%27&outFields=ZCTA5&f=geojson&geometryType=esriGeometryPolygon&outSR=4326`;
      const res = await fetch(url);
      if (!res.ok) return NextResponse.json({ error: 'Census API error' }, { status: 502 });
      const data = await res.json();
      const feat = data.features?.[0];
      if (!feat?.geometry) return NextResponse.json({ error: 'Zip code not found' }, { status: 404 });
      return NextResponse.json({ label: `ZIP ${q}`, geometry: feat.geometry }, { headers: CACHE_HEADER });
    }

    if (type === 'city') {
      const parts = q.split(',').map(s => s.trim());
      const qs = parts.length >= 2
        ? `city=${encodeURIComponent(parts[0])}&state=${encodeURIComponent(parts[1])}`
        : `q=${encodeURIComponent(q)}`;
      const url = `https://nominatim.openstreetmap.org/search?${qs}&countrycodes=us&format=json&polygon_geojson=1&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MapQuestWidgets/1.0' } });
      if (!res.ok) return NextResponse.json({ error: 'Nominatim error' }, { status: 502 });
      const data = await res.json();
      const item = data[0];
      if (!item?.geojson) return NextResponse.json({ error: 'City not found' }, { status: 404 });
      const label = item.display_name?.split(',').slice(0, 2).join(',').trim() || q;
      return NextResponse.json({ label, geometry: item.geojson }, { headers: CACHE_HEADER });
    }

    if (type === 'state') {
      const url = `https://nominatim.openstreetmap.org/search?state=${encodeURIComponent(q)}&countrycodes=us&format=json&polygon_geojson=1&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MapQuestWidgets/1.0' } });
      if (!res.ok) return NextResponse.json({ error: 'Nominatim error' }, { status: 502 });
      const data = await res.json();
      const item = data[0];
      if (!item?.geojson) return NextResponse.json({ error: 'State not found' }, { status: 404 });
      const label = item.display_name?.split(',')[0]?.trim() || q;
      return NextResponse.json({ label, geometry: item.geojson }, { headers: CACHE_HEADER });
    }

    return NextResponse.json({ error: 'Invalid type — use zip, city, or state' }, { status: 400 });
  } catch (error) {
    console.error('[Boundary API] Error:', error);
    return NextResponse.json(
      { error: 'Boundary lookup failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
