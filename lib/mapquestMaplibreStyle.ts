import type { StyleSpecification } from 'maplibre-gl';

export const MAPQUEST_RASTER_LAYER_ID = 'mapquest-raster';
export const MAPQUEST_RASTER_SOURCE_ID = 'mapquest-raster';

export type MapQuestTileType = 'map' | 'dark' | 'satellite' | 'hybrid' | 'light';

export type MapQuestVectorTheme = 'light' | 'dark';

export function isRoadBasemapTileType(tileType: MapQuestTileType): tileType is 'map' | 'dark' {
  return tileType === 'map' || tileType === 'dark';
}

export function isAerialBasemapTileType(tileType: MapQuestTileType): boolean {
  return tileType === 'satellite' || tileType === 'hybrid';
}

export function vectorThemeForBasemap(tileType: MapQuestTileType): MapQuestVectorTheme {
  return tileType === 'dark' ? 'dark' : 'light';
}

export function resolveMapQuestVectorStyleUrl(apiKey: string, theme: MapQuestVectorTheme): string {
  return `https://www.mapquestapi.com/styles/v1/${theme}?key=${encodeURIComponent(apiKey)}`;
}

/** Map style for MapLibre init or full style replacement (vector URL or raster StyleSpec). */
export function resolveMapQuestMapStyle(
  apiKey: string,
  tileType: MapQuestTileType,
  vectorBasemap: boolean,
): string | StyleSpecification {
  if (vectorBasemap && isRoadBasemapTileType(tileType)) {
    return resolveMapQuestVectorStyleUrl(apiKey, vectorThemeForBasemap(tileType));
  }
  return resolveMapQuestTileStyle(apiKey, tileType);
}

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
      [MAPQUEST_RASTER_SOURCE_ID]: {
        type: 'raster',
        tiles: mapQuestTileUrls(apiKey, stylePath),
        tileSize: 256,
        attribution: '',
      },
    },
    layers: [
      {
        id: MAPQUEST_RASTER_LAYER_ID,
        type: 'raster',
        source: MAPQUEST_RASTER_SOURCE_ID,
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
