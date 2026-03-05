import { NextRequest, NextResponse } from 'next/server';

const HERE_API_KEY = process.env.HERE_API_KEY;

function calcEVScore({
  chargerCount,
  dcFastCount,
  evPermits,
  solarPermits,
  permitGrowthRate,
}: {
  chargerCount: number;
  dcFastCount: number;
  evPermits: number;
  solarPermits: number;
  permitGrowthRate: number;
}) {
  const densityScore = Math.min(chargerCount / 20, 1) * 25;
  const qualityScore = Math.min(dcFastCount / 5, 1) * 25;
  const permitScore = Math.min((evPermits + solarPermits) / 50, 1) * 35;
  const growthScore = Math.min(Math.max(permitGrowthRate, 0), 1) * 15;
  return Math.round(densityScore + qualityScore + permitScore + growthScore);
}

// ── HERE EV Charger data ───────────────────────────────────────────────
// Tries dedicated EV Charge Points endpoint, falls back to Search/Discover
async function fetchHereChargers(lat: number, lng: number, radiusM: number) {
  if (!HERE_API_KEY) return { chargerCount: 0, dcFastCount: 0 };

  const candidates = [
    `https://ev-chargepoints.search.hereapi.com/v1/chargepoints?apiKey=${HERE_API_KEY}&at=${lat},${lng}&radius=${radiusM}&limit=100`,
    `https://ev-chargepoints.search.hereapi.com/v1/ev/stations?apiKey=${HERE_API_KEY}&at=${lat},${lng}&radius=${radiusM}&limit=100`,
    `https://ev-chargepoints.hereapi.com/v3/chargepoints?apiKey=${HERE_API_KEY}&at=${lat},${lng}&radius=${radiusM}&limit=100`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const items = data.items || data.results || data.evStations || [];
      if (!Array.isArray(items) || items.length === 0) continue;
      return parseChargerItems(items);
    } catch { /* try next */ }
  }

  // Fallback: HERE Discover search for EV charging stations
  try {
    const discoverUrl = new URL('https://discover.search.hereapi.com/v1/discover');
    discoverUrl.searchParams.set('apiKey', HERE_API_KEY);
    discoverUrl.searchParams.set('q', 'ev charging station');
    discoverUrl.searchParams.set('in', `circle:${lat},${lng};r=${radiusM}`);
    discoverUrl.searchParams.set('limit', '100');
    const res = await fetch(discoverUrl.toString());
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      if (items.length > 0) return parseChargerItems(items);
    }
  } catch { /* ignore */ }

  // Last fallback: HERE Browse with EV category
  try {
    const browseUrl = new URL('https://browse.search.hereapi.com/v1/browse');
    browseUrl.searchParams.set('apiKey', HERE_API_KEY);
    browseUrl.searchParams.set('at', `${lat},${lng}`);
    browseUrl.searchParams.set('categories', '700-7600-0322');
    browseUrl.searchParams.set('in', `circle:${lat},${lng};r=${radiusM}`);
    browseUrl.searchParams.set('limit', '100');
    const res = await fetch(browseUrl.toString());
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      if (items.length > 0) return parseChargerItems(items);
    }
  } catch { /* ignore */ }

  return { chargerCount: 0, dcFastCount: 0 };
}

function parseChargerItems(items: any[]): { chargerCount: number; dcFastCount: number } {
  let chargerCount = 0;
  let dcFastCount = 0;

  for (const item of items) {
    // EV Charge Points API format
    const evses = item.evses || item.connectors || [];
    if (evses.length > 0) {
      for (const evse of evses) {
        const connectors = evse.connectors || [evse];
        for (const conn of connectors) {
          const power = conn.maxPowerInKw ?? conn.powerInKw ?? conn.maxPower ?? conn.power ?? 0;
          chargerCount++;
          if (power >= 50) dcFastCount++;
        }
      }
      continue;
    }

    // Discover/Browse POI format — each result is one station location
    chargerCount++;
    const title = (item.title || '').toLowerCase();
    const cats = (item.categories || []).map((c: any) => (c.name || c.id || '').toLowerCase()).join(' ');
    if (title.includes('fast') || title.includes('supercharg') || title.includes('dc ') || cats.includes('fast')) {
      dcFastCount++;
    }
  }

  return { chargerCount, dcFastCount };
}

// ── HERE-based adoption / permit proxies ───────────────────────────────
// Count nearby EV-related businesses as an adoption momentum proxy
async function fetchEvAdoptionProxy(lat: number, lng: number, radiusM: number) {
  if (!HERE_API_KEY) return { evBusinesses: 0, solarBusinesses: 0 };

  const circle = `circle:${lat},${lng};r=${radiusM}`;
  let evBusinesses = 0;
  let solarBusinesses = 0;

  const queries = [
    { q: 'electric vehicle dealer OR EV service OR Tesla OR Rivian OR electric car', key: 'ev' },
    { q: 'solar installer OR solar energy OR solar panel OR SunPower OR SunRun', key: 'solar' },
  ];

  const results = await Promise.allSettled(
    queries.map(async ({ q, key }) => {
      const url = new URL('https://discover.search.hereapi.com/v1/discover');
      url.searchParams.set('apiKey', HERE_API_KEY!);
      url.searchParams.set('q', q);
      url.searchParams.set('in', circle);
      url.searchParams.set('limit', '50');
      const res = await fetch(url.toString());
      if (!res.ok) return { key, count: 0 };
      const data = await res.json();
      return { key, count: (data.items || []).length };
    }),
  );

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    if (r.value.key === 'ev') evBusinesses = r.value.count;
    if (r.value.key === 'solar') solarBusinesses = r.value.count;
  }

  return { evBusinesses, solarBusinesses };
}

export async function GET(request: NextRequest) {
  if (!HERE_API_KEY) {
    return NextResponse.json({ error: 'HERE API key not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Missing or invalid lat/lng' }, { status: 400 });
  }

  const chargerRadiusM = 3219; // ~2 miles
  const adoptionRadiusM = 8047; // ~5 miles (broader for business density)

  const [chargerData, adoptionData] = await Promise.all([
    fetchHereChargers(lat, lng, chargerRadiusM),
    fetchEvAdoptionProxy(lat, lng, adoptionRadiusM),
  ]);

  // Map adoption proxy counts into the formula's permit inputs.
  // Each EV business ≈ multiple EV registrations/permits;
  // each solar company ≈ multiple residential solar installations.
  const evPermits = adoptionData.evBusinesses * 3;
  const solarPermits = adoptionData.solarBusinesses * 3;

  // Growth rate proxy: areas with both charger infrastructure AND business
  // presence show stronger adoption momentum.
  const total = chargerData.chargerCount + adoptionData.evBusinesses + adoptionData.solarBusinesses;
  const permitGrowthRate = total > 0
    ? Math.min((adoptionData.evBusinesses + adoptionData.solarBusinesses) / Math.max(total, 1), 1)
    : 0;

  const score = calcEVScore({
    chargerCount: chargerData.chargerCount,
    dcFastCount: chargerData.dcFastCount,
    evPermits,
    solarPermits,
    permitGrowthRate,
  });

  return NextResponse.json({
    score,
    breakdown: {
      chargerCount: chargerData.chargerCount,
      dcFastCount: chargerData.dcFastCount,
      evPermits,
      solarPermits,
      permitGrowthRate: Math.round(permitGrowthRate * 100),
    },
    source: 'here',
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
