// app/api/citibike/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api.citybik.es/v2/networks/citi-bike-nyc', {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error(`CityBikes API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Log sample station to see available fields
    if (data.network?.stations?.length > 0) {
      console.log('Sample station data:', JSON.stringify(data.network.stations[0], null, 2));
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('CityBikes API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Citi Bike data' },
      { status: 500 }
    );
  }
}
