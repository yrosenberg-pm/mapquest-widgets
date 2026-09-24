import { copyFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'node_modules/maplibre-gl/dist');
const pub = join(root, 'public');

for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  const src = join(dist, file);
  if (!existsSync(src)) {
    console.warn(`[copy-maplibre-worker] missing ${src}`);
    continue;
  }
  copyFileSync(src, join(pub, file));
}

console.log('[copy-maplibre-worker] synced worker bundles to public/');
