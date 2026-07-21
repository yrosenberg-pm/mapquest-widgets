import { decodeHereFlexiblePolyline } from '@/lib/hereFlexiblePolyline';

export interface VehicleProfile {
  height: number; // feet
  weight: number; // tons (short)
  length: number; // feet
  width: number; // feet
  axleCount: number;
}

export const DEFAULT_VEHICLE: VehicleProfile = {
  height: 13.5,
  weight: 20,
  length: 48,
  width: 8.5,
  axleCount: 5,
};

export interface TruckRouteStep {
  narrative: string;
  distance: number;
  time: number;
}

export interface TruckDirectionsResult {
  distance: number;
  time: number;
  fuelUsed?: number;
  hasTolls?: boolean;
  hasHighway?: boolean;
  steps: TruckRouteStep[];
  polyline: { lat: number; lng: number }[];
  maxElevationFt?: number | null;
  elevationNote?: string | null;
  routeMaxElevationFt?: number | null;
}

export type TruckRoutingProvider = 'here' | 'mapquest';

function metersToFeet(m: number) {
  return m * 3.28084;
}

function concatPolylines(chunks: Array<Array<{ lat: number; lng: number }>>) {
  const out: Array<{ lat: number; lng: number }> = [];
  for (const chunk of chunks) {
    if (!chunk.length) continue;
    if (!out.length) {
      out.push(...chunk);
      continue;
    }
    const last = out[out.length - 1];
    const first = chunk[0];
    const isDup = last.lat === first.lat && last.lng === first.lng;
    out.push(...(isDup ? chunk.slice(1) : chunk));
  }
  return out;
}

function decodeHereRoutePolyline(encoded: string): { lat: number; lng: number }[] {
  return decodeHereFlexiblePolyline(encoded).points.map((p) => ({ lat: p.lat, lng: p.lng }));
}

function extractElevationSamplesMeters(route: Record<string, unknown>): number[] {
  const out: number[] = [];
  const pushFromMaybe = (v: unknown) => {
    if (!Array.isArray(v)) return;
    for (const item of v) {
      if (typeof item === 'number' && Number.isFinite(item)) out.push(item);
      else if (item && typeof item === 'object' && 'elevation' in item) {
        const e = (item as { elevation?: number }).elevation;
        if (typeof e === 'number' && Number.isFinite(e)) out.push(e);
      }
    }
  };

  const elevationProfile = route.elevationProfile as Record<string, unknown> | undefined;
  if (elevationProfile) {
    pushFromMaybe(elevationProfile.elevations);
    pushFromMaybe(elevationProfile.profile);
    pushFromMaybe(elevationProfile.samples);
  }

  const sections = Array.isArray(route.sections) ? route.sections : [];
  for (const s of sections) {
    const ep = (s as Record<string, unknown>).elevationProfile as Record<string, unknown> | undefined;
    if (ep) {
      pushFromMaybe(ep.elevations);
      pushFromMaybe(ep.profile);
      pushFromMaybe(ep.samples);
    }
  }

  return out;
}

function samplePointsForElevation(points: Array<{ lat: number; lng: number }>, maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const out: Array<{ lat: number; lng: number }> = [];
  out.push(points[0]);
  const innerCount = maxPoints - 2;
  const step = (points.length - 2) / Math.max(1, innerCount);
  for (let i = 1; i <= innerCount; i++) {
    const idx = 1 + Math.round(i * step);
    out.push(points[Math.min(points.length - 2, idx)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

async function getMaxElevationFeetForPolyline(polyline: Array<{ lat: number; lng: number }>) {
  if (!polyline.length) return null;
  const sampled = samplePointsForElevation(polyline, 100);
  const pointsParam = sampled.map((p) => `${p.lat},${p.lng}`).join(';');

  const params = new URLSearchParams({
    endpoint: 'elevation',
    points: pointsParam,
  });

  const resp = await fetch(`/api/here?${params.toString()}`);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || 'Elevation lookup failed');
  }
  const data = await resp.json();
  const elevationsRaw = (data as { elevations?: unknown }).elevations;
  if (!Array.isArray(elevationsRaw) || elevationsRaw.length === 0) return null;

  const valsMeters = elevationsRaw
    .map((e: unknown) => (typeof e === 'number' ? e : (e as { elevation?: number })?.elevation))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (valsMeters.length === 0) return null;
  return metersToFeet(Math.max(...valsMeters));
}

/** HERE truck dimensions: centimeters / kilograms (same as TruckRouting widget). */
export function vehicleProfileToHereUnits(profile: VehicleProfile) {
  return {
    truckHeight: Math.round(profile.height * 30.48),
    truckWidth: Math.round(profile.width * 30.48),
    truckLength: Math.round(profile.length * 30.48),
    truckWeight: Math.round(profile.weight * 907.185),
    truckAxles: profile.axleCount,
  };
}

/** MapQuest truck dimensions: meters / metric tons (same as TruckRouting widget). */
export function vehicleProfileToMapQuestUnits(profile: VehicleProfile) {
  return {
    vehicleHeight: (profile.height * 0.3048).toFixed(2),
    vehicleWeight: (profile.weight * 0.907185).toFixed(2),
    vehicleLength: (profile.length * 0.3048).toFixed(2),
    vehicleWidth: (profile.width * 0.3048).toFixed(2),
    vehicleAxles: profile.axleCount.toString(),
  };
}

export function buildHereTruckRouteSearchParams(
  fromCoords: { lat: number; lng: number },
  toCoords: { lat: number; lng: number },
  vehicleProfile: VehicleProfile,
  opts?: {
    departure?: 'now' | Date;
    elevationCeilingFt?: number | null;
    via?: string[];
  },
): URLSearchParams {
  const here = vehicleProfileToHereUnits(vehicleProfile);

  const params = new URLSearchParams({
    endpoint: 'routes',
    origin: `${fromCoords.lat},${fromCoords.lng}`,
    destination: `${toCoords.lat},${toCoords.lng}`,
    transportMode: 'truck',
    truckHeight: here.truckHeight.toString(),
    truckWidth: here.truckWidth.toString(),
    truckLength: here.truckLength.toString(),
    truckWeight: here.truckWeight.toString(),
    truckAxles: here.truckAxles.toString(),
  });

  if (opts?.via?.length) {
    for (const v of opts.via) params.append('via', v);
  }

  if (opts?.elevationCeilingFt != null) {
    params.set('alternatives', '5');
  }

  if (opts?.departure && opts.departure !== 'now') {
    params.append('departureTime', opts.departure.toISOString());
  } else {
    params.append('departureTime', new Date().toISOString());
  }

  return params;
}

export function buildMapQuestTruckRouteSearchParams(
  fromLocation: string,
  toLocation: string,
  vehicleProfile: VehicleProfile,
  departure?: 'now' | Date,
): URLSearchParams {
  const mq = vehicleProfileToMapQuestUnits(vehicleProfile);

  const params = new URLSearchParams({
    endpoint: 'directions',
    from: fromLocation,
    to: toLocation,
    routeType: 'fastest',
    type: 'truck',
    vehicleHeight: mq.vehicleHeight,
    vehicleWeight: mq.vehicleWeight,
    vehicleLength: mq.vehicleLength,
    vehicleWidth: mq.vehicleWidth,
    vehicleAxles: mq.vehicleAxles,
  });

  if (departure && departure !== 'now') {
    params.append('timeType', '1');
    params.append('dateTime', departure.toISOString());
  }

  return params;
}

export async function fetchHereTruckDirections(
  fromCoords: { lat: number; lng: number },
  toCoords: { lat: number; lng: number },
  vehicleProfile: VehicleProfile,
  opts?: {
    departure?: 'now' | Date;
    elevationCeilingFt?: number | null;
    via?: string[];
  },
): Promise<TruckDirectionsResult> {
  const params = buildHereTruckRouteSearchParams(fromCoords, toCoords, vehicleProfile, opts);

  console.log('[TruckRouting] Vehicle profile:', {
    heightFt: vehicleProfile.height,
    heightCm: vehicleProfileToHereUnits(vehicleProfile).truckHeight,
    widthFt: vehicleProfile.width,
    widthCm: vehicleProfileToHereUnits(vehicleProfile).truckWidth,
    lengthFt: vehicleProfile.length,
    lengthCm: vehicleProfileToHereUnits(vehicleProfile).truckLength,
    weightTons: vehicleProfile.weight,
    weightKg: vehicleProfileToHereUnits(vehicleProfile).truckWeight,
    axles: vehicleProfile.axleCount,
  });
  console.log('[TruckRouting] Routing request URL:', `/api/here?${params.toString()}`);

  const response = await fetch(`/api/here?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[TruckRouting] Routing API error:', response.status, errorText);
    throw new Error('Failed to get truck route');
  }

  const data = await response.json();
  console.log('[TruckRouting] Routing API full response:', JSON.stringify(data, null, 2));

  if (data.notices) {
    console.log('[TruckRouting] Routing API notices:', data.notices);
  }

  if (!data.routes || data.routes.length === 0) {
    if (data.error) {
      console.error('[TruckRouting] Routing API error:', data.error);
      throw new Error(data.error.message || 'Failed to calculate truck route');
    }
    throw new Error('No truck-safe route found. Try adjusting vehicle dimensions.');
  }

  const routes = Array.isArray(data.routes) ? data.routes : [];
  const elevationCeilingFt = opts?.elevationCeilingFt;

  const candidates = routes.map((r: Record<string, unknown>) => {
    const sections = Array.isArray(r.sections) ? r.sections : [];
    const decodedSections: Array<Array<{ lat: number; lng: number }>> = [];
    for (const s of sections) {
      const encoded = (s as { polyline?: string }).polyline;
      if (!encoded) continue;
      try {
        decodedSections.push(decodeHereRoutePolyline(encoded));
      } catch (err) {
        console.error('[TruckRouting] Failed to decode polyline:', err);
      }
    }
    const decodedPolyline = concatPolylines(decodedSections);
    const samplesM = extractElevationSamplesMeters(r);
    const maxM = samplesM.length > 0 ? Math.max(...samplesM) : null;

    return { raw: r, sections, decodedPolyline, legacyMaxElevationMeters: maxM };
  });

  let chosen = candidates[0];
  let elevationNote: string | null = null;
  let chosenMaxElevationFt: number | null = null;

  if (elevationCeilingFt != null) {
    const withMax: Array<{ c: (typeof candidates)[number]; maxFt: number | null }> = await Promise.all(
      candidates.map(async (c) => {
        try {
          if (typeof c.legacyMaxElevationMeters === 'number' && Number.isFinite(c.legacyMaxElevationMeters)) {
            return { c, maxFt: metersToFeet(c.legacyMaxElevationMeters) };
          }
          if (c.decodedPolyline?.length) {
            const maxFt = await getMaxElevationFeetForPolyline(c.decodedPolyline);
            return { c, maxFt };
          }
          return { c, maxFt: null };
        } catch {
          return { c, maxFt: null };
        }
      }),
    );

    const withElevation = withMax.filter((x) => typeof x.maxFt === 'number' && Number.isFinite(x.maxFt));
    if (withElevation.length > 0) {
      const ok = withElevation.find((x) => (x.maxFt as number) <= (elevationCeilingFt as number));
      if (ok) {
        chosen = ok.c;
        chosenMaxElevationFt = ok.maxFt as number;
      } else {
        const lowest = [...withElevation].sort((a, b) => (a.maxFt as number) - (b.maxFt as number))[0];
        chosen = lowest.c;
        chosenMaxElevationFt = lowest.maxFt as number;
        elevationNote = `No alternative route found under ${Math.round(elevationCeilingFt)} ft. Showing the lowest-elevation option (max ~${Math.round(chosenMaxElevationFt)} ft).`;
      }
    }
  }

  const route = chosen.raw as Record<string, unknown>;
  const sections = (chosen.sections?.length ? chosen.sections : route.sections) as Array<Record<string, unknown>>;
  if (!sections || sections.length === 0) {
    throw new Error('No route sections returned from routing API');
  }

  const section0 = sections[0];
  if (section0.notices) {
    console.log('[TruckRouting] Section notices:', section0.notices);
  }

  const decodedPolyline = chosen.decodedPolyline ?? [];
  if (decodedPolyline.length > 0) {
    console.log('[TruckRouting] Decoded polyline with', decodedPolyline.length, 'points');
  }

  const allActions = sections.flatMap((s) => (Array.isArray(s.actions) ? s.actions : []));
  const steps = allActions.map((action: Record<string, unknown>) => ({
    narrative: String(action.instruction || action.action || ''),
    distance: (Number(action.length) || 0) / 1609.34,
    time: (Number(action.duration) || 0) / 60,
  }));

  const totalLengthM = sections.reduce((sum, s) => sum + (Number((s.summary as { length?: number })?.length) || 0), 0);
  const totalDurationS = sections.reduce(
    (sum, s) => sum + (Number((s.summary as { duration?: number })?.duration) || 0),
    0,
  );
  const hasTolls = sections.some((s) => Array.isArray(s.tolls) && (s.tolls as unknown[]).length > 0);

  return {
    distance: totalLengthM / 1609.34,
    time: totalDurationS / 60,
    fuelUsed: (section0.summary as { consumption?: number })?.consumption,
    hasTolls,
    hasHighway: true,
    steps,
    polyline: decodedPolyline,
    maxElevationFt: chosenMaxElevationFt,
    elevationNote,
    routeMaxElevationFt: chosenMaxElevationFt,
  };
}

export async function fetchMapQuestTruckDirections(
  fromLocation: string,
  toLocation: string,
  vehicleProfile: VehicleProfile,
  departure?: 'now' | Date,
): Promise<TruckDirectionsResult> {
  const params = buildMapQuestTruckRouteSearchParams(fromLocation, toLocation, vehicleProfile, departure);

  console.log('[TruckRouting] MapQuest request params:', params.toString());
  const response = await fetch(`/api/mapquest?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[TruckRouting] MapQuest API error:', response.status, errorText);
    throw new Error('Failed to get truck route');
  }

  const data = await response.json();
  console.log('[TruckRouting] MapQuest API response:', data);

  if (data.info?.statuscode !== 0) {
    console.error('[TruckRouting] Route error:', data.info);
    throw new Error(data.info?.messages?.[0] || 'Route calculation failed');
  }

  const routeData = data.route;
  let polyline: { lat: number; lng: number }[] = [];
  const rawShape = routeData.shape?.shapePoints;
  if (Array.isArray(rawShape) && rawShape.length >= 2) {
    for (let i = 0; i < rawShape.length - 1; i += 2) {
      polyline.push({ lat: rawShape[i], lng: rawShape[i + 1] });
    }
  }

  return {
    distance: routeData.distance,
    time: routeData.time / 60,
    fuelUsed: routeData.fuelUsed,
    hasTolls: routeData.hasTollRoad,
    hasHighway: routeData.hasHighway,
    steps:
      routeData.legs?.[0]?.maneuvers?.map((m: { narrative: string; distance: number; time: number }) => ({
        narrative: m.narrative,
        distance: m.distance,
        time: m.time / 60,
      })) || [],
    polyline,
  };
}

export async function fetchTruckDirections(opts: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  vehicle?: VehicleProfile;
  useHereRouting?: boolean;
  departure?: 'now' | Date;
  elevationCeilingFt?: number | null;
  via?: string[];
}): Promise<TruckDirectionsResult & { provider: TruckRoutingProvider }> {
  const vehicle = opts.vehicle ?? DEFAULT_VEHICLE;
  const useHereRouting = opts.useHereRouting ?? true;

  if (useHereRouting) {
    try {
      const directions = await fetchHereTruckDirections(opts.from, opts.to, vehicle, {
        departure: opts.departure,
        elevationCeilingFt: opts.elevationCeilingFt,
        via: opts.via,
      });
      return { ...directions, provider: 'here' };
    } catch (hereErr) {
      console.warn('[TruckRouting] HERE truck routing failed, falling back to MapQuest:', hereErr);
    }
  }

  const directions = await fetchMapQuestTruckDirections(
    `${opts.from.lat},${opts.from.lng}`,
    `${opts.to.lat},${opts.to.lng}`,
    vehicle,
    opts.departure,
  );
  return { ...directions, provider: 'mapquest' };
}

export function boundingBoxFromPolyline(polyline: { lat: number; lng: number }[]) {
  const lats = polyline.map((p) => p.lat);
  const lngs = polyline.map((p) => p.lng);
  return {
    ul: { lat: Math.max(...lats), lng: Math.min(...lngs) },
    lr: { lat: Math.min(...lats), lng: Math.max(...lngs) },
  };
}
