/** Traffic-colored route ribbon segments from a MapQuest v2 truck route response. */

const TRAFFIC_FLOW = {
  smooth: '#22C55E',
  light: '#84CC16',
  moderate: '#EAB308',
  heavy: '#F97316',
  severe: '#EF4444',
  unknown: '#2563EB',
} as const;

/** Urban / school-bus speeds — not highway free-flow tiers. */
function congestionColorFromSpeedMph(mph: number) {
  if (!Number.isFinite(mph)) return TRAFFIC_FLOW.unknown;
  if (mph >= 28) return TRAFFIC_FLOW.smooth;
  if (mph >= 20) return TRAFFIC_FLOW.light;
  if (mph >= 12) return TRAFFIC_FLOW.moderate;
  if (mph >= 6) return TRAFFIC_FLOW.heavy;
  return TRAFFIC_FLOW.severe;
}

function congestionColorFromDelayRatio(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 1.01) return TRAFFIC_FLOW.smooth;
  if (ratio >= 1.35) return TRAFFIC_FLOW.severe;
  if (ratio >= 1.2) return TRAFFIC_FLOW.heavy;
  if (ratio >= 1.08) return TRAFFIC_FLOW.moderate;
  if (ratio >= 1.02) return TRAFFIC_FLOW.light;
  return TRAFFIC_FLOW.smooth;
}

export type TrafficRouteSegment = {
  coords: { lat: number; lng: number }[];
  color: string;
  weight?: number;
  opacity?: number;
};

type Maneuver = { distance?: number; time?: number };
export type RouteLeg = { time?: number; distance?: number; maneuvers?: Maneuver[] };

const SEGMENT_STYLE = { weight: 5, opacity: 0.95 } as const;
const URBAN_FREE_FLOW_MPH = 25;

function sliceShapePoints(
  shapePoints: number[],
  startPt: number,
  endPt: number,
): { lat: number; lng: number }[] {
  const coords: { lat: number; lng: number }[] = [];
  for (let p = startPt; p <= endPt; p++) {
    const lat = Number(shapePoints[p * 2]);
    const lng = Number(shapePoints[p * 2 + 1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    coords.push({ lat, lng });
  }
  return coords;
}

function overlapSegmentEndpoints(segments: TrafficRouteSegment[]) {
  if (segments.length <= 1) return segments;
  const overlapped = segments.map((s) => ({ ...s, coords: [...s.coords] }));
  for (let i = 0; i < overlapped.length; i++) {
    const prev = overlapped[i - 1];
    const cur = overlapped[i];
    const next = overlapped[i + 1];
    if (prev?.coords.length) cur.coords.unshift(prev.coords[prev.coords.length - 1]!);
    if (next?.coords.length) cur.coords.push(next.coords[0]!);
  }
  return overlapped;
}

function collectManeuvers(legs: RouteLeg[]): Maneuver[] {
  const out: Maneuver[] = [];
  for (const leg of legs) {
    if (Array.isArray(leg.maneuvers)) out.push(...leg.maneuvers);
  }
  return out;
}

/** Maneuver-level segments — MapQuest maneuver `time` is seconds (same as Live Traffic widget). */
function buildManeuverSegments(
  shapePoints: number[],
  legs: RouteLeg[],
  maneuverIndexes: number[],
): TrafficRouteSegment[] | null {
  const maneuvers = collectManeuvers(legs);
  const pointPairs = Math.floor(shapePoints.length / 2);
  if (maneuvers.length === 0 || maneuverIndexes.length !== maneuvers.length || pointPairs < 2) {
    return null;
  }

  const segments: TrafficRouteSegment[] = [];
  for (let i = 0; i < maneuvers.length; i++) {
    const startPt = Math.max(0, Math.min(pointPairs - 1, Number(maneuverIndexes[i]) || 0));
    const endPt =
      i === maneuvers.length - 1
        ? pointPairs - 1
        : Math.max(startPt + 1, Math.min(pointPairs - 1, Number(maneuverIndexes[i + 1]) ?? startPt + 1));

    const coords = sliceShapePoints(shapePoints, startPt, endPt);
    if (coords.length < 2) continue;

    const distMi = Number(maneuvers[i]?.distance);
    const timeS = Number(maneuvers[i]?.time);
    const mph =
      Number.isFinite(distMi) && Number.isFinite(timeS) && timeS > 0 ? distMi / (timeS / 3600) : NaN;

    segments.push({
      coords,
      color: congestionColorFromSpeedMph(mph),
      ...SEGMENT_STYLE,
    });
  }

  return segments.length > 0 ? overlapSegmentEndpoints(segments) : null;
}

/** Leg-level fallback — compare drive time to urban free-flow, not raw mph (avoids all-red school routes). */
function buildLegSegments(
  shapePoints: number[],
  legs: RouteLeg[],
  legIndexes: number[],
): TrafficRouteSegment[] {
  const pointPairs = Math.floor(shapePoints.length / 2);
  if (legIndexes.length < 2 || legs.length === 0) return [];

  const segments: TrafficRouteSegment[] = [];
  for (let i = 0; i < legs.length; i++) {
    const startPt = Math.max(0, Math.min(pointPairs - 1, Number(legIndexes[i]) || 0));
    const endPt =
      i === legs.length - 1
        ? pointPairs - 1
        : Math.max(startPt + 1, Math.min(pointPairs - 1, Number(legIndexes[i + 1]) ?? startPt + 1));

    const coords = sliceShapePoints(shapePoints, startPt, endPt);
    if (coords.length < 2) continue;

    const leg = legs[i];
    const distMi = Number(leg?.distance);
    const timeS = Number(leg?.time);
    const timeMin = Number.isFinite(timeS) ? timeS / 60 : NaN;
    const expectedMin =
      Number.isFinite(distMi) && distMi > 0 ? (distMi / URBAN_FREE_FLOW_MPH) * 60 : NaN;
    const ratio =
      Number.isFinite(expectedMin) && Number.isFinite(timeMin) && expectedMin > 0
        ? timeMin / expectedMin
        : NaN;

    segments.push({
      coords,
      color: congestionColorFromDelayRatio(ratio),
      ...SEGMENT_STYLE,
    });
  }

  return overlapSegmentEndpoints(segments);
}

/** Build traffic-colored segments from lat/lng shape + MapQuest legs/maneuvers. */
export function buildTrafficRouteSegmentsFromShapeInput(input: {
  shapePoints?: { lat: number; lng: number }[];
  maneuverIndexes?: number[];
  legs?: RouteLeg[];
  /** MapQuest route.time in seconds. */
  timeSeconds?: number;
  /** MapQuest route.realTime in seconds (traffic-adjusted). */
  realTimeSeconds?: number;
}): TrafficRouteSegment[] {
  if (!input.shapePoints || input.shapePoints.length < 2) return [];
  const flat: number[] = [];
  for (const p of input.shapePoints) {
    flat.push(p.lat, p.lng);
  }
  return buildTrafficRouteSegments({
    shape: {
      shapePoints: flat,
      maneuverIndexes: input.maneuverIndexes,
    },
    legs: input.legs,
    time: input.timeSeconds,
    realTime: input.realTimeSeconds,
  });
}

export function buildTrafficRouteSegments(route: {
  shape?: { shapePoints?: number[]; legIndexes?: number[]; maneuverIndexes?: number[] };
  legs?: RouteLeg[];
  time?: number;
  realTime?: number;
}): TrafficRouteSegment[] {
  const shapePoints = route.shape?.shapePoints;
  if (!Array.isArray(shapePoints) || shapePoints.length < 4) return [];

  const legs = route.legs ?? [];
  const maneuverIndexes = Array.isArray(route.shape?.maneuverIndexes) ? route.shape.maneuverIndexes : [];
  const legIndexes = Array.isArray(route.shape?.legIndexes) ? route.shape.legIndexes : [];

  const maneuverSegments = buildManeuverSegments(shapePoints, legs, maneuverIndexes);
  if (maneuverSegments?.length) return maneuverSegments;

  if (legIndexes.length >= 2 && legs.length > 0) {
    const legSegments = buildLegSegments(shapePoints, legs, legIndexes);
    if (legSegments.length > 0) return legSegments;
  }

  // Last resort: tint whole route only when MapQuest reports meaningful traffic delay.
  const pointPairs = Math.floor(shapePoints.length / 2);
  const coords = sliceShapePoints(shapePoints, 0, pointPairs - 1);
  if (coords.length < 2) return [];

  const timeMin = Number(route.time) / 60;
  const realMin = Number(route.realTime) / 60;
  if (!Number.isFinite(timeMin) || !Number.isFinite(realMin) || timeMin <= 0 || realMin <= timeMin * 1.02) {
    return [];
  }

  return [
    {
      coords,
      color: congestionColorFromDelayRatio(realMin / timeMin),
      ...SEGMENT_STYLE,
    },
  ];
}

export { TRAFFIC_FLOW };
