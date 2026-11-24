import type { ExpressionSpecification, LayerSpecification, Map } from 'maplibre-gl';
import {
  MAP_STYLE_BUILDING_3D_FULL_ZOOM,
  MAP_STYLE_BUILDING_3D_MIN_ZOOM,
} from '@/lib/mapStyles/config';

function isBuildingExtrusionLayer(layer: LayerSpecification): boolean {
  if (layer.type !== 'fill-extrusion') return false;
  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
  if (sourceLayer === 'buildings') return true;
  return /building/i.test(layer.id);
}

function isZoomInterpolatedHeight(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value[0] === 'interpolate' &&
    value[1] &&
    typeof value[1] === 'object' &&
    Array.isArray(value[1]) &&
    value[1][0] === 'linear' &&
    Array.isArray(value[2]) &&
    value[2][0] === 'zoom'
  );
}

/** Show fill-extrusion buildings earlier than style defaults (hosted + file styles). */
export function enhanceBuildingExtrusionVisibility(map: Map) {
  const layers = map.getStyle()?.layers;
  if (!layers?.length) return;

  for (const layer of layers) {
    if (!isBuildingExtrusionLayer(layer)) continue;

    const id = layer.id;
    try {
      if (map.getLayoutProperty(id, 'visibility') === 'none') {
        map.setLayoutProperty(id, 'visibility', 'visible');
      }
      map.setLayerZoomRange(id, MAP_STYLE_BUILDING_3D_MIN_ZOOM, 24);

      const height = map.getPaintProperty(id, 'fill-extrusion-height');
      const fullHeight: ExpressionSpecification = isZoomInterpolatedHeight(height)
        ? ((height as unknown[])[(height as unknown[]).length - 1] as ExpressionSpecification)
        : ((height ?? ['coalesce', ['get', 'height'], 8]) as ExpressionSpecification);

      map.setPaintProperty(id, 'fill-extrusion-height', [
        'interpolate',
        ['linear'],
        ['zoom'],
        MAP_STYLE_BUILDING_3D_MIN_ZOOM,
        0,
        MAP_STYLE_BUILDING_3D_FULL_ZOOM,
        fullHeight,
      ]);

      const base = map.getPaintProperty(id, 'fill-extrusion-base');
      if (isZoomInterpolatedHeight(base)) {
        const fullBase = (base as unknown[])[(base as unknown[]).length - 1] as ExpressionSpecification;
        map.setPaintProperty(id, 'fill-extrusion-base', [
          'interpolate',
          ['linear'],
          ['zoom'],
          MAP_STYLE_BUILDING_3D_MIN_ZOOM,
          0,
          MAP_STYLE_BUILDING_3D_FULL_ZOOM,
          fullBase,
        ]);
      }

      map.setPaintProperty(id, 'fill-extrusion-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        MAP_STYLE_BUILDING_3D_MIN_ZOOM,
        0.55,
        MAP_STYLE_BUILDING_3D_FULL_ZOOM,
        1,
      ]);
    } catch {
      /* style may still be applying */
    }
  }

  const footprintMin = Math.max(MAP_STYLE_BUILDING_3D_MIN_ZOOM - 1, 7);
  for (const layer of layers) {
    if (layer.type === 'fill-extrusion' || !/building/i.test(layer.id)) continue;
    try {
      map.setLayerZoomRange(layer.id, footprintMin, 24);
    } catch {
      /* ignore */
    }
  }
}