/**
 * Cluster rebuild timing — run: npx tsx scripts/benchmark-cluster-styles.mjs
 */
import { performance } from 'node:perf_hooks';
import { getClusterDemoStops } from '../lib/hereClusterDemoStops.ts';
import { buildClusterMapMarkers } from '../lib/clusterMapMarkers.ts';

const METRO_ZOOM = 11;
const NATION_ZOOM = 4;
const NATION_CENTER = { north: 50, south: 29, east: -66, west: -125 };
const METRO_BOUNDS = { north: 42.02, south: 41.72, west: -87.92, east: -87.66 };

const cases = [
  { label: '250 metro by-color', count: 250, zoom: METRO_ZOOM, bounds: METRO_BOUNDS, style: 'by-color' },
  { label: '5k metro all-pins', count: 5000, zoom: METRO_ZOOM, bounds: METRO_BOUNDS, style: 'all-pins' },
  { label: '20k nationwide off', count: 20000, zoom: NATION_ZOOM, bounds: NATION_CENTER, style: 'off' },
  { label: '20k nationwide all-pins', count: 20000, zoom: NATION_ZOOM, bounds: NATION_CENTER, style: 'all-pins' },
  { label: '20k nationwide by-color', count: 20000, zoom: NATION_ZOOM, bounds: NATION_CENTER, style: 'by-color' },
];

for (const c of cases) {
  const stops = getClusterDemoStops(c.count);
  const t0 = performance.now();
  const markers = buildClusterMapMarkers({
    stops,
    zoom: c.zoom,
    eps: 40,
    minWeight: 5,
    accentColor: '#2563eb',
    clusterStyle: c.style,
    viewportBounds: c.bounds,
    maxClusterZoom: 12,
  });
  const ms = Math.round(performance.now() - t0);
  console.log(`${c.label}: ${ms} ms, ${markers.length} markers`);
}
