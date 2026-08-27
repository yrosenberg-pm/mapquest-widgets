export const US_MAP_CENTER = { lat: 39.8283, lng: -98.5795 };

export type DemoMapProps = {
  defaultMapCenter?: { lat: number; lng: number };
  defaultMapZoom?: number;
  demoRegionId?: string;
};

/** Map center when no route/selection coords exist yet. */
export function resolveMapCenter(
  primary?: { lat: number; lng: number } | null,
  demo?: { lat: number; lng: number } | null,
): { lat: number; lng: number } {
  if (primary) return primary;
  if (demo) return demo;
  return US_MAP_CENTER;
}
