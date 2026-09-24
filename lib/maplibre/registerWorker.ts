import { setWorkerUrl } from 'maplibre-gl';

let registered = false;

/** MapLibre v6 requires an explicit worker URL when bundled by Next.js/webpack. */
export function registerMaplibreWorker() {
  if (registered || typeof window === 'undefined') return;
  registered = true;
  setWorkerUrl(`${window.location.origin}/maplibre-gl-worker.mjs`);
}
