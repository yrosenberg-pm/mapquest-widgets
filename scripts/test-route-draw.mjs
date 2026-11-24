import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || process.env.MAPQUEST_API_KEY || '';

const html = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.css" />
  <style>html,body,#map{margin:0;height:100%;}</style>
</head>
<body>
  <div id="map"></div>
  <script type="module">
    import maplibregl from 'https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.js';
    const apiKey = ${JSON.stringify(apiKey)};
    const style = {
      version: 8,
      sources: {
        'mapquest-raster': {
          type: 'raster',
          tiles: [
            \`https://a.tiles.mapquest.com/render/latest/vivid/{z}/{x}/{y}/256/png?key=\${apiKey}\`,
          ],
          tileSize: 256,
        },
      },
      layers: [{ id: 'mapquest-raster', type: 'raster', source: 'mapquest-raster' }],
    };

    const map = new maplibregl.Map({
      container: 'map',
      style,
      center: [-78.75, 35.85],
      zoom: 10,
    });

    window.__mapReady = new Promise((resolve) => {
      map.on('load', () => {
        const coords = [
          [-78.638156, 35.779597],
          [-78.70, 35.82],
          [-78.85, 35.88],
          [-78.994762, 35.91466],
        ];
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
          },
        });
        map.addLayer({
          id: 'route-shadow',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#000', 'line-width': 13, 'line-opacity': 0.1 },
        });
        map.addLayer({
          id: 'route-main',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#3B82F6', 'line-width': 5, 'line-opacity': 0.9 },
        });
        map.fitBounds(
          coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0]),
          ),
          { padding: 40 },
        );
        resolve({
          layers: map.getStyle().layers.map((l) => l.id),
          projection: map.getProjection?.()?.type,
          loaded: map.loaded(),
          styleLoaded: map.isStyleLoaded(),
        });
      });
    });
  </script>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.setContent(html);
await page.waitForTimeout(2500);

const info = await page.evaluate(() => window.__mapReady);
const screenshot = await page.screenshot({ type: 'png' });
const out = path.join(__dirname, 'route-test-screenshot.png');
await import('fs').then((fs) => fs.writeFileSync(out, screenshot));

console.log('Map info:', JSON.stringify(info, null, 2));
console.log('Screenshot:', out);
console.log('Has route-main layer:', info?.layers?.includes('route-main'));

await browser.close();
