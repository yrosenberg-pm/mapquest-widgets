import { DEFAULT_DEMO_REGION_ID } from './demoRegions';
import { isStopInDemoRegion } from './demoRegionBounds';
import { FIFTY_STOP_DEMOS_BY_REGION } from './fiftyStopDemosByRegion';
import type { MultiStopDemoSeed } from './multiStopDemoTypes';

export type { MultiStopDemoSeed } from './multiStopDemoTypes';

const FIVE_STOP_INDICES = [0, 12, 24, 36, 49] as const;

function validStopsForRegion(regionId: string): MultiStopDemoSeed[] {
  const raw =
    FIFTY_STOP_DEMOS_BY_REGION[regionId] ??
    FIFTY_STOP_DEMOS_BY_REGION[DEFAULT_DEMO_REGION_ID];
  return raw.filter(
    (s) =>
      s.lat != null &&
      s.lng != null &&
      isStopInDemoRegion(s.lat, s.lng, regionId),
  );
}

export function getFiftyStopDemo(regionId: string): MultiStopDemoSeed[] {
  const stops = validStopsForRegion(regionId);
  if (stops.length < 50) {
    console.warn(
      `[demo] ${regionId} has only ${stops.length} in-city stops (expected 50)`,
    );
  }
  return stops.slice(0, 50).map((s) => ({ ...s }));
}

export function getFiveStopDemo(regionId: string): MultiStopDemoSeed[] {
  const full = getFiftyStopDemo(regionId);
  const picked = FIVE_STOP_INDICES.filter((i) => i < full.length).map((i) => full[i]);
  return (picked.length >= 5 ? picked : full.slice(0, 5)).map((s) => ({ ...s }));
}
