// app/api/boundary/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const zoom = searchParams.get('zoom') || '14';

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  try {
    // Use Nominatim reverse geocoding to get the place boundary
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?` +
      `lat=${lat}&lon=${lng}` +
      `&format=json&polygon_geojson=1&zoom=${zoom}`,
      {
        headers: {
          'User-Agent': 'MapQuestWidgets/1.0 (https://github.com/mapquest-widgets)'
        }
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Nominatim API error', status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Boundary API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch boundary', details: String(error) },
      { status: 500 }
    );
  }
}
