import type { GeoJSONSource, Map } from 'maplibre-gl';

export function removeLayersAndSource(map: Map, prefix: string) {
  const style = map.getStyle();
  if (!style) return;

  for (const layer of [...(style.layers ?? [])].reverse()) {
    if (layer.id.startsWith(prefix)) {
      try {
        map.removeLayer(layer.id);
      } catch {
        /* ignore */
      }
    }
  }

  const sources = map.getStyle()?.sources ?? {};
  for (const sourceId of Object.keys(sources)) {
    if (sourceId.startsWith(prefix)) {
      try {
        map.removeSource(sourceId);
      } catch {
        /* ignore */
      }
    }
  }
}

export function moveLayerToTop(map: Map, layerId: string) {
  if (!map.getLayer(layerId)) return;
  try {
    map.moveLayer(layerId);
  } catch {
    /* ignore */
  }
}

export function setGeoJsonSource(
  map: Map,
  sourceId: string,
  data: GeoJSON.Feature | GeoJSON.FeatureCollection,
): boolean {
  const addOrUpdate = () => {
    const existing = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
      return true;
    }
    map.addSource(sourceId, { type: 'geojson', data });
    return true;
  };

  try {
    return addOrUpdate();
  } catch (error) {
    // Style may still be settling after basemap swap — retry once on the next frame.
    console.warn('[MapQuestMap] setGeoJsonSource failed, retrying:', error);
    try {
      return addOrUpdate();
    } catch (retryError) {
      console.warn('[MapQuestMap] setGeoJsonSource retry failed:', retryError);
      return false;
    }
  }
}

export function lineFeature(coords: GeoJSON.Position[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  };
}

export function firstOverlayBeforeId(map: Map): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers?.length) return undefined;
  for (const layer of layers) {
    if (layer.id !== 'mapquest-raster') return layer.id;
  }
  return undefined;
}
