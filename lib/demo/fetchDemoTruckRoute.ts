import type { DemoTruckRouteResult } from '@/lib/demo/demoTruckRouteTypes';
import { drawTruckRoute } from '@/lib/demo/drawTruckRoute';

export type DemoRouteResult = DemoTruckRouteResult;

/** @deprecated Use drawTruckRoute — kept for existing imports */
export async function fetchDemoTruckRoute(): Promise<DemoRouteResult> {
  return drawTruckRoute();
}
