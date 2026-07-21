import { geocode } from '@/lib/mapquest';
import type { DemoTruckRouteResult } from '@/lib/demo/demoTruckRouteTypes';
import { TRUCK_GALLERY_DURHAM_FROM, TRUCK_GALLERY_DURHAM_TO } from '@/lib/truckRouting/constants';
import {
  boundingBoxFromPolyline,
  DEFAULT_VEHICLE,
  fetchTruckDirections,
} from '@/lib/truckRouting/directions';

/**
 * Durham bridge-clearance demo route — same request path as the real TruckRouting widget
 * (HERE truck routing with MapQuest fallback, same vehicle profile and addresses).
 */
export async function drawTruckRoute(): Promise<DemoTruckRouteResult> {
  const [fromResult, toResult] = await Promise.all([
    geocode(TRUCK_GALLERY_DURHAM_FROM),
    geocode(TRUCK_GALLERY_DURHAM_TO),
  ]);

  if (!fromResult?.lat || !fromResult?.lng) {
    throw new Error('Could not find start location');
  }
  if (!toResult?.lat || !toResult?.lng) {
    throw new Error('Could not find destination');
  }

  const fromLoc = { lat: fromResult.lat, lng: fromResult.lng };
  const toLoc = { lat: toResult.lat, lng: toResult.lng };

  console.log('[drawTruckRoute] origin:', TRUCK_GALLERY_DURHAM_FROM, fromLoc);
  console.log('[drawTruckRoute] destination:', TRUCK_GALLERY_DURHAM_TO, toLoc);
  console.log('[drawTruckRoute] vehicle profile (ft/tons):', DEFAULT_VEHICLE);

  const directions = await fetchTruckDirections({
    from: fromLoc,
    to: toLoc,
    vehicle: DEFAULT_VEHICLE,
    useHereRouting: true,
  });

  console.log('[drawTruckRoute] provider:', directions.provider);
  console.log('[drawTruckRoute] polyline points:', directions.polyline.length);

  if (!directions.polyline || directions.polyline.length < 2) {
    throw new Error('No route geometry returned');
  }

  const payload: DemoTruckRouteResult = {
    polyline: directions.polyline,
    start: fromLoc,
    end: toLoc,
    boundingBox: boundingBoxFromPolyline(directions.polyline),
    isTruckRoute: true,
    routeWarnings: directions.elevationNote ? [directions.elevationNote] : [],
    provider: directions.provider,
  };

  console.log('[drawTruckRoute] result:', JSON.stringify(payload, null, 2));

  return payload;
}
