import type { Map, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import { latLngsToLineString, type LatLngTuple } from './geo';
import { lineFeature, moveLayerToTop, removeLayersAndSource, setGeoJsonSource } from './layers';

export const DEFAULT_ROUTE_BLUE = '#3B82F6';
/** Polyline routes from routePolyline prop — must not share prefix with mq-route-api- */
const ROUTE_PREFIX = 'mq-polyline-';

export type RouteDrawOpts = {
  showTraffic?: boolean;
  routeColor?: string;
  accentColor?: string;
  interactive?: boolean;
  onRouteLineClick?: (lat: number, lng: number) => void;
  onRouteLineDrag?: (evt: { phase: 'start' | 'move' | 'end'; lat: number; lng: number }) => void;
  map?: Map;
};

type RouteHitHandlers = {
  hitLayerId: string;
  mousedown?: (e: MapMouseEvent) => void;
  touchstart?: (e: MapTouchEvent) => void;
  click?: (e: MapMouseEvent) => void;
  moveHandler?: (e: MapMouseEvent | MapTouchEvent) => void;
  endHandler?: (e: MapMouseEvent | MapTouchEvent) => void;
};

let routeHitHandlers: RouteHitHandlers | null = null;

export function clearRouteHitHandlers(map: Map) {
  if (!routeHitHandlers) return;
  const { hitLayerId, mousedown, touchstart, click, moveHandler, endHandler } = routeHitHandlers;
  if (mousedown) map.off('mousedown', hitLayerId, mousedown);
  if (touchstart) map.off('touchstart', hitLayerId, touchstart);
  if (click) map.off('click', hitLayerId, click);
  if (moveHandler) {
    map.off('mousemove', moveHandler);
    map.off('touchmove', moveHandler);
  }
  if (endHandler) {
    map.off('mouseup', endHandler);
    map.off('touchend', endHandler);
    map.off('touchcancel', endHandler);
  }
  routeHitHandlers = null;
}

function bindRouteHitHandlers(
  map: Map,
  hitLayerId: string,
  onRouteLineClick?: (lat: number, lng: number) => void,
  onRouteLineDrag?: (evt: { phase: 'start' | 'move' | 'end'; lat: number; lng: number }) => void,
) {
  clearRouteHitHandlers(map);
  if (!onRouteLineClick && !onRouteLineDrag) return;

  let active = false;

  const emit = (phase: 'start' | 'move' | 'end', e: { lngLat: { lat: number; lng: number } }) => {
    if (!onRouteLineDrag) return;
    try {
      onRouteLineDrag({ phase, lat: e.lngLat.lat, lng: e.lngLat.lng });
    } catch {
      /* ignore */
    }
  };

  const moveHandler = (e: MapMouseEvent | MapTouchEvent) => {
    if (!active) return;
    emit('move', e);
  };

  const endHandler = (e: MapMouseEvent | MapTouchEvent) => {
    if (!active) return;
    active = false;
    try {
      map.dragPan.enable();
    } catch {
      /* ignore */
    }
    emit('end', e);
    map.off('mousemove', moveHandler);
    map.off('mouseup', endHandler);
    map.off('touchmove', moveHandler);
    map.off('touchend', endHandler);
    map.off('touchcancel', endHandler);
  };

  const startHandler = (e: MapMouseEvent | MapTouchEvent) => {
    if (!onRouteLineDrag) return;
    active = true;
    try {
      map.dragPan.disable();
    } catch {
      /* ignore */
    }
    emit('start', e);
    map.on('mousemove', moveHandler);
    map.on('mouseup', endHandler);
    map.on('touchmove', moveHandler);
    map.on('touchend', endHandler);
    map.on('touchcancel', endHandler);
  };

  const clickHandler = (e: MapMouseEvent) => {
    if (!onRouteLineClick) return;
    onRouteLineClick(e.lngLat.lat, e.lngLat.lng);
  };

  routeHitHandlers = {
    hitLayerId,
    mousedown: onRouteLineDrag ? (startHandler as (e: MapMouseEvent) => void) : undefined,
    touchstart: onRouteLineDrag ? (startHandler as (e: MapTouchEvent) => void) : undefined,
    click: onRouteLineClick ? clickHandler : undefined,
    moveHandler,
    endHandler,
  };

  if (onRouteLineDrag) {
    map.on('mousedown', hitLayerId, routeHitHandlers.mousedown!);
    map.on('touchstart', hitLayerId, routeHitHandlers.touchstart!);
  }
  if (onRouteLineClick) {
    map.on('click', hitLayerId, clickHandler);
  }
}

function addLineLayer(
  map: Map,
  layerId: string,
  sourceId: string,
  paint: Record<string, unknown>,
  layout: Record<string, unknown> = {},
) {
  if (map.getLayer(layerId)) return;
  if (!map.getSource(sourceId)) return;
  try {
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round', ...layout },
      paint,
    });
    moveLayerToTop(map, layerId);
  } catch (error) {
    console.warn('[MapQuestMap] addLineLayer failed:', layerId, error);
  }
}

/** Draw a precomputed route polyline. Returns bounds coords for fitBounds. */
export function drawSimpleRoutePolyline(
  map: Map,
  latLngs: LatLngTuple[],
  opts: RouteDrawOpts,
): LatLngTuple[] | null {
  if (latLngs.length < 2) return null;

  removeLayersAndSource(map, ROUTE_PREFIX);
  clearRouteHitHandlers(map);

  const { showTraffic, routeColor, accentColor, interactive = true, onRouteLineClick, onRouteLineDrag } =
    opts;
  const sourceId = `${ROUTE_PREFIX}line`;
  const lineCoords = latLngsToLineString(latLngs);
  if (!setGeoJsonSource(map, sourceId, lineFeature(lineCoords))) return null;

  const lineBlue = routeColor || accentColor || DEFAULT_ROUTE_BLUE;

  if (showTraffic) {
    addLineLayer(map, `${ROUTE_PREFIX}casing`, sourceId, {
      'line-color': lineBlue,
      'line-width': 8,
      'line-opacity': 0.3,
    });
  } else {
    addLineLayer(map, `${ROUTE_PREFIX}shadow`, sourceId, {
      'line-color': '#000000',
      'line-width': 13,
      'line-opacity': 0.1,
    });
    addLineLayer(map, `${ROUTE_PREFIX}ribbon`, sourceId, {
      'line-color': '#ffffff',
      'line-width': 11,
      'line-opacity': 0.98,
    });
  }

  addLineLayer(
    map,
    `${ROUTE_PREFIX}main`,
    sourceId,
    showTraffic
      ? { 'line-color': lineBlue, 'line-width': 18, 'line-opacity': 0 }
      : { 'line-color': lineBlue, 'line-width': 5, 'line-opacity': 0.9 },
  );

  if (interactive && (onRouteLineClick || onRouteLineDrag)) {
    addLineLayer(map, `${ROUTE_PREFIX}hit`, sourceId, {
      'line-color': '#000000',
      'line-width': 22,
      'line-opacity': 0.01,
    });
    bindRouteHitHandlers(map, `${ROUTE_PREFIX}hit`, onRouteLineClick, onRouteLineDrag);
  }

  return latLngs;
}

export function clearRouteLayers(map: Map) {
  removeLayersAndSource(map, ROUTE_PREFIX);
  clearRouteHitHandlers(map);
}

/** Remove every route overlay layer/source (polyline, API fetch, segments, transit). */
export function clearAllRouteLayers(map: Map) {
  clearRouteLayers(map);
  removeLayersAndSource(map, 'mq-route-api-');
  removeLayersAndSource(map, 'mq-route-casing-');
  removeLayersAndSource(map, 'mq-route-seg-');
  removeLayersAndSource(map, 'mq-transit-');
}

export function drawRibbonRoute(
  map: Map,
  prefix: string,
  latLngs: LatLngTuple[],
  mainColor: string,
  mainWeight = 5,
  mainOpacity = 0.9,
) {
  if (latLngs.length < 2) return;
  removeLayersAndSource(map, prefix);
  const sourceId = `${prefix}line`;
  if (!setGeoJsonSource(map, sourceId, lineFeature(latLngsToLineString(latLngs)))) return;
  addLineLayer(map, `${prefix}shadow`, sourceId, {
    'line-color': '#000000',
    'line-width': 13,
    'line-opacity': 0.1,
  });
  addLineLayer(map, `${prefix}ribbon`, sourceId, {
    'line-color': '#ffffff',
    'line-width': 11,
    'line-opacity': 0.98,
  });
  addLineLayer(map, `${prefix}main`, sourceId, {
    'line-color': mainColor,
    'line-width': mainWeight,
    'line-opacity': mainOpacity,
  });
}

export function drawColoredLine(
  map: Map,
  prefix: string,
  latLngs: LatLngTuple[],
  color: string,
  weight = 5,
  opacity = 0.9,
  dashed = false,
) {
  if (latLngs.length < 2) return;
  const sourceId = `${prefix}line`;
  if (!setGeoJsonSource(map, sourceId, lineFeature(latLngsToLineString(latLngs)))) return;

  if (!dashed) {
    addLineLayer(map, `${prefix}casing`, sourceId, {
      'line-color': '#ffffff',
      'line-width': weight + 4,
      'line-opacity': 0.85,
    });
  }

  addLineLayer(
    map,
    `${prefix}main`,
    sourceId,
    {
      'line-color': color,
      'line-width': weight,
      'line-opacity': opacity,
      ...(dashed ? { 'line-dasharray': [8, 12] } : {}),
    },
    dashed ? {} : {},
  );
}
