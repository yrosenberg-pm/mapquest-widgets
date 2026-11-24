import { firstOverlayBeforeId } from '@/lib/maplibre/layers';
import {
  isAerialBasemapTileType,
  isRoadBasemapTileType,
  mapQuestRasterSourceSpec,
  MAPQUEST_RASTER_LAYER_ID,
  MAPQUEST_RASTER_SOURCE_ID,
  resolveMapQuestTileStyle,
  resolveMapQuestVectorStyleUrl,
  vectorThemeForBasemap,
  type MapQuestTileType,
} from '@/lib/mapquestMaplibreStyle';
import type { Map as MaplibreMap } from 'maplibre-gl';

/** Reads `NEXT_PUBLIC_MAPQUEST_VECTOR_BASEMAP` — off only when `0` / `false` / `off`. */
export function mapQuestVectorBasemapEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_MAPQUEST_VECTOR_BASEMAP;
  const v = raw?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  // Unset: default on in local dev so vector work is visible without extra env wiring.
  return process.env.NODE_ENV === 'development';
}

/** True when this basemap should load a MapQuest vector style URL (road themes only). */
export function usesVectorRoadStyle(tileType: MapQuestTileType, vectorBasemap = mapQuestVectorBasemapEnabled()): boolean {
  return vectorBasemap && isRoadBasemapTileType(tileType);
}

function removeRasterBasemapLayer(map: MaplibreMap) {
  try {
    if (map.getLayer(MAPQUEST_RASTER_LAYER_ID)) map.removeLayer(MAPQUEST_RASTER_LAYER_ID);
    if (map.getSource(MAPQUEST_RASTER_SOURCE_ID)) map.removeSource(MAPQUEST_RASTER_SOURCE_ID);
  } catch {
    /* style may be unloading */
  }
}

/** Legacy raster road / aerial swap without replacing the full style. */
export function swapRasterBasemapLayer(map: MaplibreMap, apiKey: string, tileType: MapQuestTileType) {
  const beforeId = firstOverlayBeforeId(map);
  removeRasterBasemapLayer(map);
  map.addSource(MAPQUEST_RASTER_SOURCE_ID, mapQuestRasterSourceSpec(apiKey, tileType));
  map.addLayer(
    {
      id: MAPQUEST_RASTER_LAYER_ID,
      type: 'raster',
      source: MAPQUEST_RASTER_SOURCE_ID,
      paint: { 'raster-fade-duration': 0 },
    },
    beforeId,
  );
}

/**
 * Apply a basemap change. Returns `true` when `map.setStyle` ran (listen for `style.load` and refresh overlays).
 */
export function applyMapQuestBasemapChange(
  map: MaplibreMap,
  apiKey: string,
  tileType: MapQuestTileType,
  vectorBasemap = mapQuestVectorBasemapEnabled(),
): boolean {
  if (usesVectorRoadStyle(tileType, vectorBasemap)) {
    map.setStyle(resolveMapQuestVectorStyleUrl(apiKey, vectorThemeForBasemap(tileType)));
    return true;
  }

  if (vectorBasemap && isAerialBasemapTileType(tileType)) {
    map.setStyle(resolveMapQuestTileStyle(apiKey, tileType));
    return true;
  }

  swapRasterBasemapLayer(map, apiKey, tileType);
  return false;
}