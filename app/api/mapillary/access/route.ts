import { NextResponse } from 'next/server';

/**
 * Exposes a client access token for MapillaryJS in the browser.
 * Use a Mapillary "client" access token scoped for client-side / JS SDK use.
 * Same value as MAPILLARY_ACCESS_TOKEN if you use one token for both.
 */
export async function GET() {
  const token =
    process.env.MAPILLARY_ACCESS_TOKEN ||
    process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Street view is not configured (missing access token)' },
      { status: 500 }
    );
  }
  return NextResponse.json({ accessToken: token });
}
