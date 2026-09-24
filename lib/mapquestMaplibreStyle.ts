import type { StyleSpecification } from 'maplibre-gl';

export type MapQuestTileType = 'map' | 'dark' | 'satellite' | 'hybrid' | 'light';

const TILE_STYLE_PATH: Record<MapQuestTileType, string> = {
  map: 'vivid',
  dark: 'night',
  satellite: 'satellite',
  hybrid: 'satellite',
  light: 'grayscale',
};

const SUBDOMAINS = ['a', 'b', 'c', 'd'];

function mapQuestTileUrls(apiKey: string, stylePath: string): string[] {
  return SUBDOMAINS.map(
    (sub) =>
      `https://${sub}.tiles.mapquest.com/render/latest/${stylePath}/{z}/{x}/{y}/256/png?key=${apiKey}`,
  );
}

/** Resolve basemap tile type from MapQuestMap props (matches legacy Leaflet logic). */
export function resolveMapQuestBasemapType(opts: {
  mapType?: 'map' | 'dark' | 'satellite' | 'hybrid';
  darkMode?: boolean;
  lockBasemap?: 'road';
}): MapQuestTileType {
  const { mapType, darkMode = false, lockBasemap } = opts;
  if (lockBasemap === 'road') {
    return darkMode ? 'dark' : 'map';
  }
  if (mapType === 'satellite' || mapType === 'hybrid') {
    return 'hybrid';
  }
  if (mapType === 'dark' || (!mapType && darkMode)) {
    return 'dark';
  }
  return 'map';
}

/** Build a minimal MapLibre StyleSpec with a MapQuest raster tile source. */
export function resolveMapQuestTileStyle(
  apiKey: string,
  mapType: MapQuestTileType,
): StyleSpecification {
  const stylePath = TILE_STYLE_PATH[mapType];
  return {
    version: 8,
    sources: {
      'mapquest-raster': {
        type: 'raster',
        tiles: mapQuestTileUrls(apiKey, stylePath),
        tileSize: 256,
        attribution: '',
      },
    },
    layers: [
      {
        id: 'mapquest-raster',
        type: 'raster',
        source: 'mapquest-raster',
        paint: {
          'raster-fade-duration': 0,
        },
      },
    ],
  };
}

export function mapQuestRasterSourceSpec(apiKey: string, mapType: MapQuestTileType) {
  const stylePath = TILE_STYLE_PATH[mapType];
  return {
    type: 'raster' as const,
    tiles: mapQuestTileUrls(apiKey, stylePath),
    tileSize: 256,
    attribution: '',
  };
}
