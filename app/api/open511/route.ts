import { NextRequest, NextResponse } from 'next/server';

// 511 / Open511 Traffic Events proxy.
// Keeps the API key server-side and allows widgets to query events safely.
//
// Spec reference (Traffic Event API): https://511.org/sites/default/files/pdfs/Open_511_Data_Exchange_Specification_v1.0_Traffic.pdf

const OPEN511_API_KEY = process.env.OPEN511_API_KEY;
const OPEN511_BASE_URL = process.env.OPEN511_BASE_URL || 'https://api.511.org';
const OPEN511_REGION_BASE_URLS = process.env.OPEN511_REGION_BASE_URLS; // JSON map: {"bayarea":"https://api.511.org", ...}
const OPEN511_REGION_RULES_JSON = process.env.OPEN511_REGION_RULES_JSON; // JSON array of region routing rules with bbox

const ENDPOINTS: Record<string, string> = {
  // Some deployments are sensitive to trailing slashes; we'll normalize at request time.
  events: '/traffic/events',
};

type RegionRule = {
  id: string;
  baseUrl: string;
  // Bounding box for this region: west,south,east,north
  bbox: { west: number; south: number; east: number; north: number };
  jurisdiction?: string;
  jurisdiction_url?: string;
};

function parseRegionRules(): { rules: RegionRule[]; error?: string } {
  // If explicit rules are not provided, try to derive a minimal set of rules from OPEN511_REGION_BASE_URLS
  // for common demos (e.g. California 511 deployments). This keeps "auto routing by area" working
  // without requiring widget-side region inputs.
  if (!OPEN511_REGION_RULES_JSON) {
    if (!OPEN511_REGION_BASE_URLS) return { rules: [] };
    try {
      const baseUrls = JSON.parse(OPEN511_REGION_BASE_URLS) as Record<string, string>;
      const DEFAULT_BBOXES: Record<string, RegionRule['bbox']> = {
        // Very rough bounding boxes for region auto-routing.
        // (Users can provide precise rules via OPEN511_REGION_RULES_JSON.)
        la: { west: -119.2, south: 33.2, east: -116.6, north: 34.9 },
        bayarea: { west: -123.2, south: 36.6, east: -121.0, north: 38.9 },
        sandiego: { west: -117.7, south: 32.5, east: -116.6, north: 33.6 },
      };
      const rules: RegionRule[] = [];
      for (const [id, baseUrl] of Object.entries(baseUrls || {})) {
        const bbox = DEFAULT_BBOXES[id];
        if (!bbox || typeof baseUrl !== 'string' || !baseUrl) continue;
        rules.push({ id, baseUrl, bbox });
      }
      return { rules };
    } catch (e) {
      return { rules: [], error: 'Failed to parse OPEN511_REGION_BASE_URLS for default rules' };
    }
  }
  try {
    const parsed = JSON.parse(OPEN511_REGION_RULES_JSON);
    if (!Array.isArray(parsed)) return { rules: [], error: 'OPEN511_REGION_RULES_JSON is not an array' };
    const rules: RegionRule[] = [];
    for (const r of parsed) {
      const id = typeof r?.id === 'string' ? r.id : '';
      const baseUrl = typeof r?.baseUrl === 'string' ? r.baseUrl : '';
      const b = r?.bbox;
      const west = Number(b?.west);
      const south = Number(b?.south);
      const east = Number(b?.east);
      const north = Number(b?.north);
      if (!id || !baseUrl) continue;
      if (![west, south, east, north].every(Number.isFinite)) continue;
      rules.push({
        id,
        baseUrl,
        bbox: { west, south, east, north },
        jurisdiction: typeof r?.jurisdiction === 'string' ? r.jurisdiction : undefined,
        jurisdiction_url: typeof r?.jurisdiction_url === 'string' ? r.jurisdiction_url : undefined,
      });
    }
    return { rules };
  } catch (e) {
    return { rules: [], error: 'Failed to parse OPEN511_REGION_RULES_JSON' };
  }
}

function pickRuleByBboxCenter(
  rules: RegionRule[],
  bbox: { west: number; south: number; east: number; north: number } | null
): RegionRule | null {
  if (!bbox) return null;
  const lng = (bbox.west + bbox.east) / 2;
  const lat = (bbox.south + bbox.north) / 2;
  for (const r of rules) {
    if (lng >= r.bbox.west && lng <= r.bbox.east && lat >= r.bbox.south && lat <= r.bbox.north) {
      return r;
    }
  }
  return null;
}

function readRegionBaseUrl(region: string | null): { baseUrl: string; debug?: any } {
  const r = (region || '').trim();
  if (!r) return { baseUrl: OPEN511_BASE_URL };

  if (!OPEN511_REGION_BASE_URLS) {
    return {
      baseUrl: OPEN511_BASE_URL,
      debug: { region: r, warning: 'OPEN511_REGION_BASE_URLS not configured; using OPEN511_BASE_URL' },
    };
  }

  try {
    const parsed = JSON.parse(OPEN511_REGION_BASE_URLS) as Record<string, string>;
    const hit = parsed?.[r];
    if (typeof hit === 'string' && hit.trim()) return { baseUrl: hit.trim(), debug: { region: r } };
    return {
      baseUrl: OPEN511_BASE_URL,
      debug: { region: r, warning: 'Unknown region; using OPEN511_BASE_URL', availableRegions: Object.keys(parsed || {}) },
    };
  } catch (e) {
    return {
      baseUrl: OPEN511_BASE_URL,
      debug: { region: r, warning: 'Failed to parse OPEN511_REGION_BASE_URLS; using OPEN511_BASE_URL' },
    };
  }
}

function clampInt(v: string | null, min: number, max: number, fallback: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanEnum(v: string | null, allowed: string[]) {
  if (!v) return null;
  const vv = v.trim().toUpperCase();
  return allowed.includes(vv) ? vv : null;
}

export async function GET(request: NextRequest) {
  if (!OPEN511_API_KEY) {
    return NextResponse.json({ error: 'OPEN511_API_KEY not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint') || 'events';
  if (!ENDPOINTS[endpoint]) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  }

  const region = searchParams.get('region');
  const jurisdiction = searchParams.get('jurisdiction');
  const jurisdictionUrl = searchParams.get('jurisdiction_url');

  const rulesParsed = parseRegionRules();
  const regionOverrideCfg = region ? readRegionBaseUrl(region) : null;

  // Build upstream URL with a safe subset of query params.
  // Optional bbox filter: west,south,east,north (common Open511 usage).
  const bbox = searchParams.get('bbox');
  const strictBbox = searchParams.get('strictBbox') === '1' || searchParams.get('strictBbox') === 'true';
  const parsedBbox = (() => {
    if (!bbox) return null;
    const parts = bbox.split(',').map((s) => Number(s.trim()));
    if (parts.length !== 4) return null;
    if (parts.some((n) => !Number.isFinite(n))) return null;
    // expected: west,south,east,north
    const [west, south, east, north] = parts;
    return { west, south, east, north };
  })();

  const pickedRule =
    regionOverrideCfg
      ? null
      : pickRuleByBboxCenter(rulesParsed.rules, parsedBbox);

  const baseUrlChosen =
    regionOverrideCfg?.baseUrl ||
    pickedRule?.baseUrl ||
    OPEN511_BASE_URL;

  const base = baseUrlChosen.replace(/\/$/, '');
  const path = ENDPOINTS[endpoint];
  const u = new URL(base + path);
  u.searchParams.set('api_key', OPEN511_API_KEY);
  // Ensure JSON response when supported (some Open511 deployments default to XML).
  u.searchParams.set('format', 'json');

  // Common query params shown in the spec: limit/offset pagination, plus domain filters.
  const limit = clampInt(searchParams.get('limit'), 1, 250, 200);
  const offset = clampInt(searchParams.get('offset'), 0, 100000, 0);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('offset', String(offset));

  if (parsedBbox) u.searchParams.set('bbox', bbox!);

  const status = cleanEnum(searchParams.get('status'), ['ACTIVE', 'ARCHIVED']);
  if (status) u.searchParams.set('status', status);

  const eventType = cleanEnum(searchParams.get('event_type'), [
    'CONSTRUCTION',
    'SPECIAL_EVENT',
    'INCIDENT',
    'WEATHER_CONDITION',
    'ROAD_CONDITION',
  ]);
  if (eventType) u.searchParams.set('event_type', eventType);

  const severity = cleanEnum(searchParams.get('severity'), ['MINOR', 'MODERATE', 'MAJOR', 'UNKNOWN']);
  if (severity) u.searchParams.set('severity', severity);

  // Region / publisher filters (Open511 deployments often support jurisdiction-level filtering)
  // Precedence: explicit query params > picked rule defaults
  const effectiveJurisdiction = jurisdiction || pickedRule?.jurisdiction;
  const effectiveJurisdictionUrl = jurisdictionUrl || pickedRule?.jurisdiction_url;
  if (effectiveJurisdiction) u.searchParams.set('jurisdiction', effectiveJurisdiction);
  if (effectiveJurisdictionUrl) u.searchParams.set('jurisdiction_url', effectiveJurisdictionUrl);

  try {
    const attempt = async (url: string) => {
      const resp = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });
      const text = await resp.text().catch(() => '');
      return { ok: resp.ok, status: resp.status, text };
    };

    const redact = (url: string) => url.replace(OPEN511_API_KEY, '***');

    // Retry strategy:
    // - Some 511/Open511 deployments support bbox, but require lat/lng ordering (south,west,north,east)
    // - Others don't support bbox at all and may 500 instead of 4xx.
    const urls: string[] = [];
    urls.push(u.toString());
    if (parsedBbox) {
      // Try swapped order: south,west,north,east
      const u2 = new URL(u.toString());
      u2.searchParams.set('bbox', `${parsedBbox.south},${parsedBbox.west},${parsedBbox.north},${parsedBbox.east}`);
      urls.push(u2.toString());

      // Try without bbox
      const u3 = new URL(u.toString());
      u3.searchParams.delete('bbox');
      urls.push(u3.toString());
    }

    const attempts: Array<{ url: string; status: number; snippet: string }> = [];
    for (const url of urls) {
      const r = await attempt(url);
      attempts.push({ url: redact(url), status: r.status, snippet: r.text.slice(0, 220) });
      if (r.ok) {
        const data = r.text ? JSON.parse(r.text) : {};

        const usedBbox = !!parsedBbox && new URL(url).searchParams.has('bbox');
        const eventsArr = Array.isArray((data as any)?.events) ? (data as any).events : null;

        // If bbox is present but returns an empty list, fall back to the next attempt unless strict.
        // Our widgets apply their own spatial filtering (radius/corridor), so returning a broader
        // dataset is preferable to showing "no events" due to bbox semantics mismatches.
        if (!strictBbox && usedBbox && eventsArr && eventsArr.length === 0) {
          continue;
        }

        return NextResponse.json(data, {
          headers: {
            'Cache-Control': 'public, max-age=120',
            // Helpful in debugging which region upstream we hit (no secrets leaked)
            'X-Open511-Region-Used': region || pickedRule?.id || '',
            ...(parsedBbox ? { 'X-Open511-Bbox-Fallback': usedBbox ? '0' : '1' } : {}),
          },
        });
      }

      // If this was a 4xx, don't retry further — it's likely an auth/validation problem.
      if (r.status >= 400 && r.status < 500) {
        return NextResponse.json(
          {
            error: 'Open511 request failed',
            status: r.status,
            details: r.text,
            __debug: {
              attempts,
              routing: {
                regionOverride: regionOverrideCfg?.debug || null,
                pickedRuleId: pickedRule?.id || null,
                baseUrlChosen,
                ruleParseError: rulesParsed.error,
                ruleCount: rulesParsed.rules.length,
              },
            },
          },
          { status: 502 }
        );
      }
    }

    // All attempts failed (likely upstream 5xx)
    const last = attempts[attempts.length - 1];
    return NextResponse.json(
      {
        error: 'Open511 request failed',
        status: last?.status ?? 502,
        details: last?.snippet ?? '',
        __debug: {
          attempts,
          routing: {
            regionOverride: regionOverrideCfg?.debug || null,
            pickedRuleId: pickedRule?.id || null,
            baseUrlChosen,
            ruleParseError: rulesParsed.error,
            ruleCount: rulesParsed.rules.length,
          },
        },
      },
      { status: 502 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'Open511 proxy error', details: message }, { status: 500 });
  }
}

