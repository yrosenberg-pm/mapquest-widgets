import { decodeHereFlexiblePolyline } from './hereFlexiblePolyline';

export interface RouteLocation {
  lat: number;
  lng: number;
}

export interface HereMultiStopLeg {
  distance: number;
  time: number;
}

export interface HereMultiStopResult {
  distance: number;
  time: number;
  legs: HereMultiStopLeg[];
  shapePoints: { lat: number; lng: number }[];
}

function metersToMiles(m: number): number {
  return m * 0.000621371;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

async function fetchHereCarLeg(
  from: RouteLocation,
  to: RouteLocation,
  departureTime?: Date | 'now',
): Promise<{ distanceMiles: number; timeSec: number; shapePoints: { lat: number; lng: number }[] } | null> {
  const params = new URLSearchParams({
    endpoint: 'routes',
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    transportMode: 'car',
  });
  if (departureTime && departureTime !== 'now') {
    params.set('departureTime', departureTime.toISOString());
  }

  const res = await fetch(`/api/here?${params.toString()}`);
  if (!res.ok) return null;

  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route?.sections?.length) return null;

  const shapeChunks: Array<Array<{ lat: number; lng: number }>> = [];
  let distanceMeters = 0;
  let timeSec = 0;

  for (const section of route.sections) {
    const summary = section.summary;
    if (summary?.length) distanceMeters += summary.length;
    if (summary?.duration) timeSec += summary.duration;
    const encoded = section.polyline;
    if (typeof encoded === 'string') {
      try {
        shapeChunks.push(
          decodeHereFlexiblePolyline(encoded).points.map((p) => ({ lat: p.lat, lng: p.lng })),
        );
      } catch {
        /* skip bad section polyline */
      }
    }
  }

  const shapePoints = concatPolylines(shapeChunks);
  if (!shapePoints.length) return null;

  return {
    distanceMiles: distanceMeters > 0 ? metersToMiles(distanceMeters) : haversineMiles(from.lat, from.lng, to.lat, to.lng),
    timeSec: timeSec > 0 ? timeSec : haversineMiles(from.lat, from.lng, to.lat, to.lng) * 120,
    shapePoints,
  };
}

function estimateLeg(from: RouteLocation, to: RouteLocation) {
  const distanceMiles = haversineMiles(from.lat, from.lng, to.lat, to.lng);
  return {
    distanceMiles,
    timeSec: (distanceMiles / 30) * 3600,
    shapePoints: [from, to],
  };
}

/** Leg-by-leg car routing via HERE — used where MapQuest has no road network coverage. */
export async function getMultiStopDirectionsViaHere(
  locations: RouteLocation[],
  departureTime?: Date | 'now',
): Promise<HereMultiStopResult | null> {
  if (locations.length < 2) return null;

  const legs: HereMultiStopLeg[] = [];
  const shapeChunks: Array<Array<{ lat: number; lng: number }>> = [];
  let totalDistance = 0;
  let totalTimeSec = 0;

  for (let i = 0; i < locations.length - 1; i++) {
    const from = locations[i];
    const to = locations[i + 1];
    const routed = await fetchHereCarLeg(from, to, departureTime);
    const leg = routed ?? estimateLeg(from, to);

    totalDistance += leg.distanceMiles;
    totalTimeSec += leg.timeSec;
    legs.push({ distance: leg.distanceMiles, time: leg.timeSec });
    shapeChunks.push(leg.shapePoints);
  }

  return {
    distance: totalDistance,
    time: totalTimeSec / 60,
    legs,
    shapePoints: concatPolylines(shapeChunks),
  };
}
