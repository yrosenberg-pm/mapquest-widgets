import { fleetOptimizedRoute, parseTruckShapePoints } from '@/lib/mapquest';
import type { Bus, BusRoute, Depot, School, Stop } from '@/lib/fleet/types';

const MAX_OPTIMIZED_LOCATIONS = 25;

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

function formatMapQuestDate(dt: Date) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function formatLocalTime(dt: Date) {
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

export async function sequenceBusRoute(params: {
  bus: Bus;
  stopIds: string[];
  depot: Depot;
  school: School;
  stopsById: Map<string, Stop>;
  departure: Date;
}): Promise<BusRoute> {
  const { bus, stopIds, depot, school, stopsById, departure } = params;
  const locationCount = 2 + stopIds.length;
  if (locationCount > MAX_OPTIMIZED_LOCATIONS) {
    throw new Error(
      `Bus ${bus.label} has ${locationCount} locations (depot + ${stopIds.length} stops + school), exceeding the ${MAX_OPTIMIZED_LOCATIONS} limit.`,
    );
  }

  const locations: (
    | string
    | { latLng: { lat: number; lng: number }; constraints?: { visitDurationInSeconds: number } }
  )[] = [`${depot.lat},${depot.lng}`];

  for (const stopId of stopIds) {
    const stop = stopsById.get(stopId);
    if (!stop) throw new Error(`Unknown stop ${stopId}`);
    locations.push({
      latLng: { lat: stop.lat, lng: stop.lng },
      constraints: { visitDurationInSeconds: stop.dwellSec },
    });
  }

  locations.push(`${school.lat},${school.lng}`);

  const data = await fleetOptimizedRoute({
    locations,
    options: {
      routeType: 'fastest',
      fullShape: true,
      shapeFormat: 'raw',
      unit: 'm',
      timeType: 2,
      date: formatMapQuestDate(departure),
      localTime: formatLocalTime(departure),
      avoids: ['u-turns'],
    },
  });

  const status = data.info?.statuscode;
  if (status !== undefined && status !== 0) {
    const msg = data.info?.messages?.join(' ') || 'Optimized route failed';
    throw new Error(`Bus ${bus.label}: ${msg}`);
  }

  const route = data.route;
  if (!route) throw new Error(`Bus ${bus.label}: empty route response`);

  const rawSequence = route.locationSequence ?? [];
  const n = locations.length;
  const normalized = rawSequence.map((v) => (v >= n ? v - 1 : v));
  const middle = normalized.filter((idx) => idx > 0 && idx < n - 1);
  const orderedStopIds = middle.map((idx) => stopIds[idx - 1]).filter(Boolean);

  const shapeFlat = route.shape?.shapePoints ?? [];
  const riders = stopIds.reduce((sum, id) => sum + (stopsById.get(id)?.riders ?? 0), 0);

  return {
    busId: bus.busId,
    stopIds: orderedStopIds.length > 0 ? orderedStopIds : [...stopIds],
    durationSec: route.realTime ?? route.time ?? 0,
    distanceMi: route.distance ?? 0,
    riders,
    shape: shapeFlat,
    arrivalAtSchoolSec: route.realTime ?? route.time ?? 0,
  };
}

export function shapeToPolyline(shape: number[]) {
  return parseTruckShapePoints(shape);
}

export function combinedFitBounds(routes: BusRoute[]) {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  let any = false;
  for (const r of routes) {
    for (let i = 0; i < r.shape.length - 1; i += 2) {
      const lat = r.shape[i];
      const lng = r.shape[i + 1];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      any = true;
      north = Math.max(north, lat);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      west = Math.min(west, lng);
    }
  }
  if (!any) return undefined;
  return { north, south, east, west };
}
