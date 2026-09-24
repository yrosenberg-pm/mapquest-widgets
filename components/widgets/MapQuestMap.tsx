'use client';

import { easeInOutCubic, jitter } from '@/lib/gallery/jitter';
import { layoutMapQuestAttribution } from '@/lib/maplibre/attribution';
import { registerMaplibreWorker } from '@/lib/maplibre/registerWorker';
import {
  containerPointToLatLng,
  coordsToBounds,
  computeLinearProgressWithPause,
  latLngBoundsToMapLibre,
  latLngsToLineString,
  safeFitBounds,
  trimPolylineByFraction,
  type LatLngTuple,
} from '@/lib/maplibre/geo';
import { injectMapQuestMapStyles } from '@/lib/maplibre/injectedStyles';
import { moveLayerToTop, removeLayersAndSource, setGeoJsonSource } from '@/lib/maplibre/layers';
import {
  clearAllRouteLayers,
  clearRouteLayers,
  DEFAULT_ROUTE_BLUE,
  drawColoredLine,
  drawRibbonRoute,
  drawSimpleRoutePolyline,
} from '@/lib/maplibre/routeDraw';
import {
  mapQuestRasterSourceSpec,
  resolveMapQuestBasemapType,
  resolveMapQuestTileStyle,
  type MapQuestTileType,
} from '@/lib/mapquestMaplibreStyle';
import {
  CLUSTER_ANCHOR,
  CLUSTER_CIRCLE_SIZE,
  clusterPinIconUrl,
} from '@/lib/clusterMapMarkers';
import { circle } from '@turf/turf';
import {
  Map as MaplibreMap,
  Marker,
  NavigationControl,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markerTooltipHtml(label: string): string {
  return `<div class="marker-tooltip-inner">${escapeHtml(label)}</div>`;
}

interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  type?: 'home' | 'poi' | 'default';
  iconUrl?: string;
  iconHtml?: string;
  iconSize?: [number, number];
  iconAnchor?: [number, number];
  iconCircular?: boolean;
  clusterable?: boolean;
  pulse?: boolean;
  zIndexOffset?: number;
  iconOpacity?: number;
  onClick?: () => void;
  onContextMenu?: (lat: number, lng: number, meta?: { clientX: number; clientY: number }) => void;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}

interface MapCircle {
  lat: number;
  lng: number;
  radius: number;
  color?: string;
  fillOpacity?: number;
  strokeWeight?: number;
  strokeOpacity?: number;
}

interface MapPolygon {
  coordinates: { lat: number; lng: number }[];
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  onClick?: (lat: number, lng: number) => void;
}

interface MapPolyline {
  coords: { lat: number; lng: number }[];
  color?: string;
  weight?: number;
  opacity?: number;
  smoothFactor?: number;
  dashed?: boolean;
  className?: string;
  onClick?: (lat: number, lng: number) => void;
}

interface TransitSegment {
  type: string;
  coords: { lat: number; lng: number }[];
}

interface RouteSegment {
  coords: { lat: number; lng: number }[];
  color: string;
  weight?: number;
  opacity?: number;
}

interface MapQuestMapProps {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom?: number;
  minZoom?: number;
  darkMode?: boolean;
  accentColor?: string;
  markers?: MapMarker[];
  clusterMarkers?: boolean;
  clusterRadiusPx?: number;
  circles?: MapCircle[];
  polygons?: MapPolygon[];
  polylines?: MapPolyline[];
  height?: string;
  showRoute?: boolean;
  routeStart?: { lat: number; lng: number };
  routeEnd?: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[];
  routeType?: 'fastest' | 'pedestrian' | 'bicycle';
  routeColor?: string;
  routePolyline?: { lat: number; lng: number }[];
  routeSegments?: RouteSegment[];
  transitSegments?: TransitSegment[];
  onClick?: (lat: number, lng: number) => void;
  onMapDrop?: (lat: number, lng: number) => void;
  onRightClick?: (lat: number, lng: number, meta?: { clientX: number; clientY: number }) => void;
  onRouteLineClick?: (lat: number, lng: number) => void;
  onRouteLineDrag?: (evt: { phase: 'start' | 'move' | 'end'; lat: number; lng: number }) => void;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number; zoom: number }) => void;
  showZoomControls?: boolean;
  interactive?: boolean;
  className?: string;
  fitBounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
    maxZoom?: number;
    durationMs?: number;
  };
  zoomToLocation?: { lat: number; lng: number; zoom?: number; key?: number | string };
  showTraffic?: boolean;
  highlightedSegment?: number | null;
  stops?: { lat: number; lng: number }[];
  driverPosition?: { lat: number; lng: number };
  showTruckRestrictions?: boolean;
  skipPolygonFitBounds?: boolean;
  mapType?: 'map' | 'dark' | 'satellite' | 'hybrid';
  onMapReady?: () => void;
  tilesRaggedReveal?: boolean;
  animateRouteReveal?: boolean;
  routeRevealDurationMs?: number;
  onRouteRevealComplete?: () => void;
  suppressRouteAutoFit?: boolean;
  flyToView?: { lat: number; lng: number; zoom: number; durationMs?: number; key?: number | string };
  lockBasemap?: 'road';
}

function swapBasemap(map: MaplibreMap, apiKey: string, tileType: MapQuestTileType) {
  const layers = map.getStyle()?.layers ?? [];
  const beforeId = layers.find((l) => l.id !== 'mapquest-raster')?.id;
  try {
    if (map.getLayer('mapquest-raster')) map.removeLayer('mapquest-raster');
    if (map.getSource('mapquest-raster')) map.removeSource('mapquest-raster');
  } catch {
    /* ignore */
  }
  map.addSource('mapquest-raster', mapQuestRasterSourceSpec(apiKey, tileType));
  map.addLayer(
    {
      id: 'mapquest-raster',
      type: 'raster',
      source: 'mapquest-raster',
      paint: { 'raster-fade-duration': 0 },
    },
    beforeId,
  );
}

function clearMarkers(markers: Marker[]) {
  for (const m of markers) {
    try {
      m.remove();
    } catch {
      /* ignore */
    }
  }
  markers.length = 0;
}

function createMarkerElement(
  marker: MapMarker,
  accentColor: string,
): { el: HTMLDivElement; iconAnchor: [number, number] } {
  const color = marker.color || accentColor;
  const type = marker.type || 'default';
  let markerHtml: string;
  let iconSize: [number, number];
  let iconAnchor: [number, number];

  if (marker.iconHtml) {
    iconSize = (marker.iconSize || [48, 48]) as [number, number];
    iconAnchor = (marker.iconAnchor || [iconSize[0] / 2, iconSize[1] / 2]) as [number, number];
    markerHtml = marker.iconHtml;
  } else if (marker.iconUrl) {
    const size = marker.iconSize || [28, 28];
    const iconCircular = marker.iconCircular !== false;
    iconSize = size as [number, number];
    iconAnchor = (marker.iconAnchor || [size[0] / 2, size[1] / 2]) as [number, number];
    const iconOp = typeof marker.iconOpacity === 'number' ? marker.iconOpacity : 1;
    markerHtml = `
          <img src="${marker.iconUrl}"
               width="${size[0]}"
               height="${size[1]}"
               style="${iconCircular ? 'border-radius: 50%;' : ''} opacity: ${iconOp}; transition: opacity 0.15s ease;"
               alt=""
          />
        `;
  } else if (type === 'home') {
    iconSize = [40, 40];
    iconAnchor = [20, 20];
    markerHtml = `
          <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
            <div class="pulse-ring" style="width: 48px; height: 48px;"></div>
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="position: relative; z-index: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
              <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="3"/>
              <path d="M16 10L12 14V22H20V14L16 10Z" fill="white"/>
              <rect x="14" y="18" width="4" height="4" fill="${color}"/>
            </svg>
          </div>
        `;
  } else if (type === 'poi') {
    iconSize = [22, 28];
    iconAnchor = [11, 28];
    markerHtml = `
          <svg width="22" height="28" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));">
            <path d="M14 1C7.373 1 2 6.373 2 13c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="${color}" stroke="white" stroke-width="2"/>
          </svg>
        `;
  } else {
    iconSize = [28, 36];
    iconAnchor = [14, 36];
    markerHtml = `
          <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.25));">
            <path d="M14 1C7.373 1 2 6.373 2 13c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="${color}" stroke="white" stroke-width="2.5"/>
          </svg>
        `;
  }

  const markerClassName = marker.iconHtml
    ? marker.pulse
      ? 'modern-marker modern-marker-crisp pulse-marker'
      : 'modern-marker modern-marker-crisp'
    : marker.iconUrl
      ? marker.pulse
        ? 'modern-marker pulse-marker'
        : 'modern-marker'
      : type === 'home'
        ? 'modern-marker modern-marker-with-shadow pulse-marker'
        : 'modern-marker modern-marker-with-shadow';

  // MapLibre positions this element via transform — no transform transitions here.
  // Anchor offset is applied through Marker({ anchor, offset }) so the pin keeps its size.
  const el = document.createElement('div');
  el.className = markerClassName;

  const body = document.createElement('div');
  body.className = 'modern-marker-body';
  body.innerHTML = markerHtml;
  el.appendChild(body);

  if (marker.label) {
    const tooltip = document.createElement('div');
    tooltip.className = 'marker-tooltip-popup';
    tooltip.innerHTML = markerTooltipHtml(marker.label);
    el.appendChild(tooltip);
  }

  const zIndexOffset =
    typeof marker.zIndexOffset === 'number'
      ? marker.zIndexOffset
      : type === 'home'
        ? 1000
        : marker.iconUrl || marker.iconHtml
          ? 500
          : type === 'poi'
            ? 0
            : 500;
  el.style.zIndex = String(zIndexOffset);

  return { el, iconAnchor };
}

function addHtmlMarker(
  map: MaplibreMap,
  lat: number,
  lng: number,
  el: HTMLDivElement,
  iconAnchor: [number, number],
  draggable = false,
): Marker {
  return new Marker({
    element: el,
    anchor: 'top-left',
    offset: [-iconAnchor[0], -iconAnchor[1]],
    draggable,
  })
    .setLngLat([lng, lat])
    .addTo(map);
}

export default function MapQuestMap({
  apiKey,
  center,
  zoom = 12,
  minZoom,
  darkMode = false,
  accentColor = '#2563eb',
  markers = [],
  clusterMarkers = false,
  clusterRadiusPx = 56,
  circles = [],
  polygons = [],
  polylines = [],
  height = '400px',
  showRoute = false,
  routeStart,
  routeEnd,
  waypoints,
  routeType = 'fastest',
  routeColor,
  routePolyline,
  routeSegments,
  transitSegments,
  onClick,
  onMapDrop,
  onRightClick,
  onRouteLineClick,
  onRouteLineDrag,
  onBoundsChange,
  showZoomControls = true,
  interactive = true,
  className = '',
  fitBounds,
  zoomToLocation,
  showTraffic = false,
  highlightedSegment = null,
  stops = [],
  driverPosition,
  showTruckRestrictions = false,
  skipPolygonFitBounds = false,
  mapType,
  onMapReady,
  tilesRaggedReveal = false,
  animateRouteReveal = false,
  routeRevealDurationMs = 1450,
  onRouteRevealComplete,
  suppressRouteAutoFit = false,
  flyToView,
  lockBasemap,
}: MapQuestMapProps) {
  const safeMarkers = markers ?? [];
  const safeCircles = circles ?? [];
  const safePolygons = polygons ?? [];
  const safePolylines = polylines ?? [];
  const safeStops = stops ?? [];

  const containerRef = useRef<HTMLDivElement>(null);
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const mapReadyNotifiedRef = useRef(false);
  const mapRef = useRef<MaplibreMap | null>(null);
  const htmlMarkersRef = useRef<Marker[]>([]);
  const driverMarkerRef = useRef<Marker | null>(null);
  const truckMarkersRef = useRef<Marker[]>([]);
  const polygonAutoFitKeyRef = useRef<string>('');
  const onRightClickRef = useRef(onRightClick);
  onRightClickRef.current = onRightClick;
  const onMapDropRef = useRef(onMapDrop);
  onMapDropRef.current = onMapDrop;
  const polylineClickRef = useRef<MapPolyline[]>([]);
  const polygonClickRef = useRef<MapPolygon[]>([]);
  const routePolylineRef = useRef(routePolyline);
  routePolylineRef.current = routePolyline;
  const routeSegmentsRef = useRef(routeSegments);
  routeSegmentsRef.current = routeSegments;
  const [mapReady, setMapReady] = useState(false);
  const [viewRevision, setViewRevision] = useState(0);
  const basemapTypeRef = useRef<MapQuestTileType>('map');

  const routeLocationKey = useMemo(() => {
    if (!routeStart || !routeEnd) return '';
    return [
      routeStart.lat,
      routeStart.lng,
      routeEnd.lat,
      routeEnd.lng,
      ...(waypoints ?? []).flatMap((w) => [w.lat, w.lng]),
    ].join('|');
  }, [routeStart, routeEnd, waypoints]);

  useEffect(() => {
    injectMapQuestMapStyles();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !mapRef.current || !mapReady) return;

    let raf = 0;
    const resize = () => {
      if (!mapRef.current) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          mapRef.current?.resize();
        } catch {
          /* ignore */
        }
      });
    };

    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(el);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!containerRef.current || !apiKey) return;

    registerMaplibreWorker();

    let isMounted = true;
    const container = containerRef.current;
    const safeCenter =
      center && Number.isFinite(center.lat) && Number.isFinite(center.lng)
        ? center
        : { lat: 40.7128, lng: -74.006 };
    const initialBasemap = resolveMapQuestBasemapType({ mapType, darkMode, lockBasemap });
    basemapTypeRef.current = initialBasemap;

    if (darkMode) container.classList.add('dark-map');
    else container.classList.remove('dark-map');

    const map = new MaplibreMap({
      container,
      style: resolveMapQuestTileStyle(apiKey, initialBasemap),
      center: [safeCenter.lng, safeCenter.lat],
      zoom,
      minZoom,
      fadeDuration: 0,
      attributionControl: false,
      interactive,
      dragPan: interactive,
      scrollZoom: interactive,
      boxZoom: interactive,
      doubleClickZoom: interactive,
      touchZoomRotate: interactive,
      refreshExpiredTiles: true,
      maxTileCacheSize: null,
    });

    if (showZoomControls) {
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    }

    mapRef.current = map;

    const handleReady = () => {
      if (!isMounted) return;
      layoutMapQuestAttribution(map, darkMode);
      setMapReady(true);
      if (!mapReadyNotifiedRef.current) {
        mapReadyNotifiedRef.current = true;
        onMapReadyRef.current?.();
      }
    };

    map.on('load', handleReady);
    if (map.loaded()) handleReady();

    return () => {
      isMounted = false;
      mapReadyNotifiedRef.current = false;
      clearMarkers(htmlMarkersRef.current);
      clearMarkers(truckMarkersRef.current);
      driverMarkerRef.current?.remove();
      driverMarkerRef.current = null;
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const clickHandler = onClick
      ? (e: MapMouseEvent) => onClick(e.lngLat.lat, e.lngLat.lng)
      : null;
    const contextHandler = (e: MapMouseEvent) => {
      const fn = onRightClickRef.current;
      if (!fn) return;
      e.preventDefault();
      fn(e.lngLat.lat, e.lngLat.lng, {
        clientX: e.originalEvent.clientX,
        clientY: e.originalEvent.clientY,
      });
    };

    if (clickHandler) map.on('click', clickHandler);
    map.on('contextmenu', contextHandler);
    return () => {
      if (clickHandler) map.off('click', clickHandler);
      map.off('contextmenu', contextHandler);
    };
  }, [mapReady, onClick]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const el = map.getContainer();

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      const fn = onMapDropRef.current;
      if (!fn) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const rect = el.getBoundingClientRect();
        const { lat, lng } = containerPointToLatLng(map, e.clientX - rect.left, e.clientY - rect.top);
        fn(lat, lng);
      } catch {
        /* ignore */
      }
    };

    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady || !onBoundsChange) return;
    const map = mapRef.current;
    const notifyBounds = () => {
      const bounds = map.getBounds();
      onBoundsChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom(),
      });
    };
    map.on('moveend', notifyBounds);
    map.on('zoomend', notifyBounds);
    const t = window.setTimeout(notifyBounds, 100);
    return () => {
      window.clearTimeout(t);
      map.off('moveend', notifyBounds);
      map.off('zoomend', notifyBounds);
    };
  }, [mapReady, onBoundsChange]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const container = map.getContainer();
    const tileType = resolveMapQuestBasemapType({ mapType, darkMode, lockBasemap });
    if (tileType === basemapTypeRef.current && map.getSource('mapquest-raster')) {
      if (darkMode) container.classList.add('dark-map');
      else container.classList.remove('dark-map');
      layoutMapQuestAttribution(map, darkMode);
      return;
    }
    basemapTypeRef.current = tileType;
    if (darkMode) container.classList.add('dark-map');
    else container.classList.remove('dark-map');
    swapBasemap(map, apiKey, tileType);
    window.setTimeout(() => {
      map.resize();
      layoutMapQuestAttribution(map, darkMode);
    }, 100);
  }, [darkMode, mapReady, mapType, lockBasemap, apiKey]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    layoutMapQuestAttribution(mapRef.current, darkMode);
  }, [mapReady, darkMode, mapType]);

  useEffect(() => {
    if (!mapRef.current || !mapReady || !flyToView) return;
    const { lat, lng, zoom: z, durationMs = 1000 } = flyToView;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapRef.current.flyTo({ center: [lng, lat], zoom: z, duration: durationMs });
  }, [flyToView?.lat, flyToView?.lng, flyToView?.zoom, flyToView?.durationMs, flyToView?.key, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    if (fitBounds) return;
    if (transitSegments && transitSegments.length > 0) return;
    if (flyToView) return;
    mapRef.current.jumpTo({ center: [center.lng, center.lat], zoom });
  }, [center?.lat, center?.lng, zoom, mapReady, fitBounds, transitSegments, flyToView]);

  useEffect(() => {
    if (!mapRef.current || !mapReady || !fitBounds) return;
    safeFitBounds(mapRef.current, latLngBoundsToMapLibre(fitBounds), {
      padding: 50,
      maxZoom: fitBounds.maxZoom,
      duration: fitBounds.durationMs ?? 1000,
    });
  }, [fitBounds, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady || !zoomToLocation) return;
    mapRef.current.jumpTo({
      center: [zoomToLocation.lng, zoomToLocation.lat],
      zoom: zoomToLocation.zoom || 16,
    });
  }, [zoomToLocation?.lat, zoomToLocation?.lng, zoomToLocation?.zoom, zoomToLocation?.key, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    clearMarkers(htmlMarkersRef.current);

    const sortedMarkers = [...safeMarkers].sort((a, b) => {
      const typeOrder = { poi: 0, default: 1, home: 2 };
      return (typeOrder[a.type || 'default'] || 1) - (typeOrder[b.type || 'default'] || 1);
    });

    const renderMarkers: MapMarker[] = (() => {
      if (!clusterMarkers) return sortedMarkers;
      const radius = Math.max(24, Math.min(120, clusterRadiusPx));
      const z = map.getZoom();
      const fixed = sortedMarkers.filter((m) => m.clusterable === false);
      const clusterable = sortedMarkers.filter((m) => m.clusterable !== false);
      const buckets = new Map<string, { sumX: number; sumY: number; members: MapMarker[] }>();

      for (const m of clusterable) {
        const p = map.project([m.lng, m.lat]);
        const key = `${Math.floor(p.x / radius)}:${Math.floor(p.y / radius)}`;
        const b = buckets.get(key);
        if (b) {
          b.sumX += p.x;
          b.sumY += p.y;
          b.members.push(m);
        } else {
          buckets.set(key, { sumX: p.x, sumY: p.y, members: [m] });
        }
      }

      const out: MapMarker[] = [...fixed];
      for (const b of buckets.values()) {
        if (b.members.length === 1) {
          out.push(b.members[0]);
          continue;
        }
        const cx = b.sumX / b.members.length;
        const cy = b.sumY / b.members.length;
        const ll = map.unproject([cx, cy]);
        out.push({
          lat: ll.lat,
          lng: ll.lng,
          type: 'default',
          color: accentColor,
          label: `${b.members.length} events`,
          iconUrl: clusterPinIconUrl(b.members.length),
          iconCircular: false,
          iconSize: [CLUSTER_CIRCLE_SIZE, CLUSTER_CIRCLE_SIZE],
          iconAnchor: CLUSTER_ANCHOR,
          zIndexOffset: 9500,
          clusterable: false,
          onClick: () => {
            let west = Infinity;
            let south = Infinity;
            let east = -Infinity;
            let north = -Infinity;
            for (const m of b.members) {
              west = Math.min(west, m.lng);
              south = Math.min(south, m.lat);
              east = Math.max(east, m.lng);
              north = Math.max(north, m.lat);
            }
            if (
              !safeFitBounds(
                map,
                [
                  [west, south],
                  [east, north],
                ],
                { padding: 50 },
              )
            ) {
              map.easeTo({ center: [ll.lng, ll.lat], zoom: Math.min(19, z + 2) });
            }
          },
        });
      }
      return out;
    })();

    for (const marker of renderMarkers) {
      if (
        marker.lat == null ||
        marker.lng == null ||
        !Number.isFinite(marker.lat) ||
        !Number.isFinite(marker.lng)
      ) {
        continue;
      }

      const { el, iconAnchor } = createMarkerElement(marker, accentColor);
      const m = addHtmlMarker(map, marker.lat, marker.lng, el, iconAnchor, !!marker.draggable);

      if (marker.onClick) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          marker.onClick!();
        });
      }

      if (marker.onContextMenu) {
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          marker.onContextMenu!(marker.lat, marker.lng, { clientX: e.clientX, clientY: e.clientY });
        });
      }

      if (marker.onDragEnd) {
        m.on('dragend', () => {
          const ll = m.getLngLat();
          marker.onDragEnd?.(ll.lat, ll.lng);
        });
      }

      htmlMarkersRef.current.push(m);
    }
  }, [safeMarkers, accentColor, mapReady, clusterMarkers, clusterRadiusPx, viewRevision]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    let raf = 0;
    const bump = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setViewRevision((v) => v + 1));
    };
    map.on('moveend', bump);
    map.on('zoomend', bump);
    return () => {
      map.off('moveend', bump);
      map.off('zoomend', bump);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    driverMarkerRef.current?.remove();
    driverMarkerRef.current = null;
    if (!driverPosition) return;

    const el = document.createElement('div');
    el.className = 'modern-marker';
    el.innerHTML = `
      <div class="modern-marker-body" style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
        <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:${accentColor}30;animation:driver-pulse 2s ease-in-out infinite;"></div>
        <div style="position:relative;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg, ${accentColor} 0%, #1e40af 100%);border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
        </div>
      </div>`;
    const tooltip = document.createElement('div');
    tooltip.className = 'marker-tooltip-popup';
    tooltip.innerHTML = markerTooltipHtml('Driver Location (Simulated)');
    el.appendChild(tooltip);

    driverMarkerRef.current = addHtmlMarker(
      mapRef.current,
      driverPosition.lat,
      driverPosition.lng,
      el,
      [24, 24],
    );
  }, [driverPosition, accentColor, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    removeLayersAndSource(map, 'mq-circles-');
    if (!safeCircles.length) return;

    const features: GeoJSON.Feature[] = safeCircles
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
      .map((c, idx) => {
        const poly = circle([c.lng, c.lat], c.radius / 1000, { steps: 64, units: 'kilometers' });
        poly.properties = {
          idx,
          fill: c.color || accentColor,
          fillOpacity: c.fillOpacity ?? 0.15,
          stroke: c.color || accentColor,
          strokeOpacity: c.strokeOpacity ?? 0.5,
          strokeWeight: c.strokeWeight ?? 2,
        };
        return poly;
      });

    setGeoJsonSource(map, 'mq-circles-src', { type: 'FeatureCollection', features });
    if (!map.getLayer('mq-circles-fill')) {
      map.addLayer({
        id: 'mq-circles-fill',
        type: 'fill',
        source: 'mq-circles-src',
        paint: {
          'fill-color': ['get', 'fill'],
          'fill-opacity': ['get', 'fillOpacity'],
        },
      });
      map.addLayer({
        id: 'mq-circles-line',
        type: 'line',
        source: 'mq-circles-src',
        paint: {
          'line-color': ['get', 'stroke'],
          'line-opacity': ['get', 'strokeOpacity'],
          'line-width': ['get', 'strokeWeight'],
        },
      });
    }
  }, [safeCircles, accentColor, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    removeLayersAndSource(map, 'mq-polygons-');
    polygonClickRef.current = safePolygons;

    const features: GeoJSON.Feature[] = [];
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;

    safePolygons.forEach((polygon, idx) => {
      const ring = polygon.coordinates.map((c) => [c.lng, c.lat] as GeoJSON.Position);
      if (ring.length < 3) return;
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push(ring[0]);
      }
      for (const [lng, lat] of ring) {
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }
      features.push({
        type: 'Feature',
        properties: {
          idx,
          fill: polygon.color || accentColor,
          fillOpacity: polygon.fillOpacity ?? 0.2,
          stroke: polygon.color || accentColor,
          strokeWidth: polygon.strokeWidth ?? 2,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    });

    if (!features.length) {
      polygonAutoFitKeyRef.current = '';
      return;
    }

    setGeoJsonSource(map, 'mq-polygons-src', { type: 'FeatureCollection', features });
    if (!map.getLayer('mq-polygons-fill')) {
      map.addLayer({
        id: 'mq-polygons-fill',
        type: 'fill',
        source: 'mq-polygons-src',
        paint: {
          'fill-color': ['get', 'fill'],
          'fill-opacity': ['get', 'fillOpacity'],
        },
      });
      map.addLayer({
        id: 'mq-polygons-line',
        type: 'line',
        source: 'mq-polygons-src',
        paint: {
          'line-color': ['get', 'stroke'],
          'line-width': ['get', 'strokeWidth'],
          'line-opacity': 0.8,
        },
      });
      map.on('click', 'mq-polygons-fill', (e) => {
        const idx = e.features?.[0]?.properties?.idx;
        const poly = polygonClickRef.current[idx as number];
        if (poly?.onClick) poly.onClick(e.lngLat.lat, e.lngLat.lng);
      });
    }

    if (!fitBounds && !skipPolygonFitBounds) {
      const key = `${safePolygons.length}|${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
      if (key !== polygonAutoFitKeyRef.current) {
        polygonAutoFitKeyRef.current = key;
        safeFitBounds(
          map,
          [
            [west, south],
            [east, north],
          ],
          { padding: 30 },
        );
      }
    }
  }, [safePolygons, accentColor, mapReady, skipPolygonFitBounds, fitBounds]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    removeLayersAndSource(map, 'mq-polylines-');
    polylineClickRef.current = safePolylines;

    const features: GeoJSON.Feature[] = safePolylines
      .filter((pl) => pl?.coords && pl.coords.length >= 2)
      .map((pl, idx) => ({
        type: 'Feature',
        properties: {
          idx,
          color: pl.color || '#F97316',
          weight: pl.weight ?? 6,
          opacity: pl.opacity ?? 0.9,
          dashed: pl.dashed ? 1 : 0,
        },
        geometry: {
          type: 'LineString',
          coordinates: pl.coords.map((c) => [c.lng, c.lat]),
        },
      }));

    if (!features.length) return;

    setGeoJsonSource(map, 'mq-polylines-src', { type: 'FeatureCollection', features });
    if (!map.getLayer('mq-polylines-main')) {
      map.addLayer({
        id: 'mq-polylines-main',
        type: 'line',
        source: 'mq-polylines-src',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'weight'],
          'line-opacity': ['get', 'opacity'],
          'line-dasharray': ['case', ['==', ['get', 'dashed'], 1], ['literal', [10, 10]], ['literal', [1, 0]]],
        },
      });
      moveLayerToTop(map, 'mq-polylines-main');
      map.on('click', 'mq-polylines-main', (e) => {
        const idx = e.features?.[0]?.properties?.idx;
        const pl = polylineClickRef.current[idx as number];
        if (pl?.onClick) pl.onClick(e.lngLat.lat, e.lngLat.lng);
      });
    }
  }, [safePolylines, mapReady]);

  useEffect(() => {
    if (!mapReady || !showTraffic) return;
    console.warn('[MapQuestMap] Native MapQuest traffic overlay is not available with MapLibre; route styling only.');
  }, [showTraffic, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    clearMarkers(truckMarkersRef.current);

    if (!showTruckRestrictions) return;

    const fetchRestrictions = async () => {
      const bounds = map.getBounds();
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      try {
        const response = await fetch(`/api/here?endpoint=truckrestrictions&bbox=${bbox}`);
        if (!response.ok) return;
        const data = await response.json();
        clearMarkers(truckMarkersRef.current);

        const restrictions = data.overlays || data.OVERLAY || [];
        for (const overlay of restrictions) {
          const shapes = overlay.SHAPE || overlay.shapes || [];
          const attrs = overlay.TRUCK_RESTRICTION || overlay.attributes || {};
          for (const shape of shapes) {
            let lat: number | undefined;
            let lng: number | undefined;
            if (shape.LAT !== undefined && shape.LON !== undefined) {
              lat = shape.LAT;
              lng = shape.LON;
            } else if (Array.isArray(shape) && shape.length >= 2) {
              lat = shape[0];
              lng = shape[1];
            } else if (shape.lat !== undefined && shape.lng !== undefined) {
              lat = shape.lat;
              lng = shape.lng;
            }
            if (lat === undefined || lng === undefined) continue;

            const labels: string[] = [];
            if (attrs.HEIGHT_RESTRICTION || attrs.height) {
              labels.push(`🚧 ${((attrs.HEIGHT_RESTRICTION || attrs.height) / 30.48).toFixed(1)} ft`);
            }
            if (attrs.WEIGHT_RESTRICTION || attrs.weight) {
              labels.push(`⚖️ ${((attrs.WEIGHT_RESTRICTION || attrs.weight) / 907.185).toFixed(1)} tons`);
            }
            if (attrs.LENGTH_RESTRICTION || attrs.length) {
              labels.push(`📏 ${((attrs.LENGTH_RESTRICTION || attrs.length) / 30.48).toFixed(0)} ft`);
            }
            if (attrs.WIDTH_RESTRICTION || attrs.width) {
              labels.push(`↔️ ${((attrs.WIDTH_RESTRICTION || attrs.width) / 30.48).toFixed(1)} ft`);
            }
            if (attrs.SINGLE_AXLE_WEIGHT || attrs.axleWeight) {
              labels.push(`🛞 ${((attrs.SINGLE_AXLE_WEIGHT || attrs.axleWeight) / 907.185).toFixed(1)}t/axle`);
            }
            if (attrs.NO_THROUGH_TRUCKS || attrs.noTrucks) labels.push('🚫 No Trucks');
            if (attrs.HAZMAT_RESTRICTION || attrs.hazmat) labels.push('☢️ No Hazmat');
            if (!labels.length) labels.push('⚠️ Restriction');

            const el = document.createElement('div');
            el.innerHTML = `<div style="background:linear-gradient(135deg,#F97316 0%,#EA580C 100%);color:white;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-40px,-20px);">${labels.map((r) => `<span>${r}</span>`).join('')}</div>`;
            truckMarkersRef.current.push(
              new Marker({ element: el }).setLngLat([lng, lat]).addTo(map),
            );
          }
        }
      } catch (err) {
        console.error('[MapQuestMap] Error fetching truck restrictions:', err);
      }
    };

    fetchRestrictions();
    const onMoveEnd = () => {
      if (map.getZoom() >= 10) fetchRestrictions();
      else clearMarkers(truckMarkersRef.current);
    };
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
    };
  }, [showTruckRestrictions, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    removeLayersAndSource(map, 'mq-highlight-');

    if (highlightedSegment === null || safeStops.length < 2) return;
    if (highlightedSegment < 0 || highlightedSegment >= safeStops.length - 1) return;

    const segmentStart = safeStops[highlightedSegment];
    const segmentEnd = safeStops[highlightedSegment + 1];

    const fetchSegmentRoute = async () => {
      try {
        const response = await fetch(`https://www.mapquestapi.com/directions/v2/route?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations: [
              `${segmentStart.lat},${segmentStart.lng}`,
              `${segmentEnd.lat},${segmentEnd.lng}`,
            ],
            options: { routeType: 'fastest', doReverseGeocode: false, generalize: 0 },
          }),
        });
        const data = await response.json();
        if (data.route?.shape?.shapePoints) {
          const points = data.route.shape.shapePoints;
          const coords: LatLngTuple[] = [];
          for (let i = 0; i < points.length; i += 2) coords.push([points[i], points[i + 1]]);
          drawRibbonRoute(map, 'mq-highlight-', coords, accentColor, 6, 1);
          safeFitBounds(map, coordsToBounds(coords), { padding: 80, maxZoom: 15 });
        }
      } catch (error) {
        console.error('Error fetching highlighted segment route:', error);
      }
    };

    fetchSegmentRoute();
  }, [highlightedSegment, safeStops, apiKey, mapReady, accentColor]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (transitSegments && transitSegments.length > 0) return;
    if (!routeStart || !routeEnd) return;

    const map = mapRef.current;
    if (!showRoute) {
      removeLayersAndSource(map, 'mq-route-api-');
      return;
    }

    const hasPrecomputedGeometry = () => {
      const poly = routePolylineRef.current;
      const segs = routeSegmentsRef.current;
      return (poly && poly.length >= 2) || (segs && segs.length > 0);
    };

    // Parent supplied full geometry (truck route, multi-stop shape, etc.) — skip car directions fetch.
    if (hasPrecomputedGeometry()) {
      removeLayersAndSource(map, 'mq-route-api-');
      return;
    }

    const abortController = new AbortController();
    const fetchRoute = async () => {
      try {
        const locations = [routeStart, ...(waypoints ?? []), routeEnd];
        const from = `${locations[0].lat},${locations[0].lng}`;
        const toParams = locations.slice(1).map((l) => `to=${l.lat},${l.lng}`).join('&');
        const url = `/api/mapquest?endpoint=directions&from=${from}&${toParams}&routeType=${routeType}&fullShape=true`;
        const res = await fetch(url, { signal: abortController.signal });
        const data = await res.json();
        if (abortController.signal.aborted) return;
        if (hasPrecomputedGeometry()) {
          removeLayersAndSource(map, 'mq-route-api-');
          return;
        }

        if (data?.route?.shape?.shapePoints) {
          const points = data.route.shape.shapePoints;
          const latLngs: LatLngTuple[] = [];
          for (let i = 0; i < points.length; i += 2) latLngs.push([points[i], points[i + 1]]);

          const isSegmentHighlighted = highlightedSegment !== null;
          const mainRouteColor = isSegmentHighlighted
            ? '#9CA3AF'
            : routeColor || accentColor || DEFAULT_ROUTE_BLUE;
          const mainRouteOpacity = isSegmentHighlighted ? 0.5 : 0.9;

          removeLayersAndSource(map, 'mq-route-api-');
          drawRibbonRoute(
            map,
            'mq-route-api-',
            latLngs,
            mainRouteColor,
            isSegmentHighlighted ? 4 : 5,
            mainRouteOpacity,
          );

          if (!isSegmentHighlighted && !fitBounds) {
            safeFitBounds(map, coordsToBounds(latLngs), { padding: 50 });
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        console.error('Failed to fetch route:', err);
      }
    };

    fetchRoute();
    return () => abortController.abort();
  }, [
    showRoute,
    routeLocationKey,
    routeStart,
    routeEnd,
    waypoints,
    routeType,
    routeColor,
    accentColor,
    mapReady,
    transitSegments,
    highlightedSegment,
    fitBounds,
    routePolyline,
    routeSegments,
  ]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;

    if (!showRoute) {
      clearAllRouteLayers(map);
      return;
    }

    if (animateRouteReveal && routePolyline && routePolyline.length >= 2) {
      removeLayersAndSource(map, 'mq-route-api-');
      return;
    }

    if (transitSegments && transitSegments.length > 0) {
      clearAllRouteLayers(map);
      const allLatLngs: LatLngTuple[] = [];
      const segmentColors: Record<string, string> = {
        pedestrian: '#6B7280',
        subway: '#8B5CF6',
        metro: '#8B5CF6',
        bus: '#F59E0B',
        train: '#3B82F6',
        rail: '#3B82F6',
        regionalTrain: '#3B82F6',
        intercityTrain: '#1D4ED8',
        highSpeedTrain: '#1D4ED8',
        lightRail: '#10B981',
        tram: '#10B981',
        ferry: '#0EA5E9',
        monorail: '#8B5CF6',
      };

      transitSegments.forEach((segment, i) => {
        if (segment.coords.length < 2) return;
        const latLngs = segment.coords.map((p) => [p.lat, p.lng] as LatLngTuple);
        allLatLngs.push(...latLngs);
        const segmentType = segment.type.toLowerCase();
        const color = segmentColors[segmentType] || routeColor || DEFAULT_ROUTE_BLUE;
        const isDotted = segmentType === 'pedestrian' || segmentType === 'subway';
        drawColoredLine(map, `mq-transit-${i}-`, latLngs, color, isDotted ? 4 : 5, 0.9, isDotted);
      });

      if (allLatLngs.length > 1 && !fitBounds) {
        safeFitBounds(map, coordsToBounds(allLatLngs), { padding: 50 });
      }
      return;
    }

    if (routeSegments && routeSegments.length > 0) {
      clearAllRouteLayers(map);
      const allLatLngs: LatLngTuple[] = [];
      routeSegments.forEach((seg) => {
        seg.coords?.forEach((p) => allLatLngs.push([p.lat, p.lng]));
      });

      routeSegments.forEach((seg, i) => {
        if (!seg.coords || seg.coords.length < 2) return;
        const latLngs = seg.coords.map((p) => [p.lat, p.lng] as LatLngTuple);
        drawColoredLine(map, `mq-route-seg-${i}-`, latLngs, seg.color, seg.weight ?? 5, seg.opacity ?? 0.95);
      });

      if (allLatLngs.length > 1 && !suppressRouteAutoFit && !fitBounds) {
        safeFitBounds(map, coordsToBounds(allLatLngs), { padding: 50 });
      }
      return;
    }

    if (routePolyline && routePolyline.length >= 2) {
      clearAllRouteLayers(map);

      const latLngs = routePolyline
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => [p.lat, p.lng] as LatLngTuple);
      if (latLngs.length >= 2) {
        try {
          drawSimpleRoutePolyline(map, latLngs, {
            showTraffic,
            routeColor,
            accentColor,
            onRouteLineClick,
            onRouteLineDrag,
            map,
          });

          if (!suppressRouteAutoFit && !fitBounds) {
            safeFitBounds(map, coordsToBounds(latLngs), { padding: 50 });
          }
        } catch (error) {
          console.error('[MapQuestMap] failed drawing route polyline:', error);
        }
      }
      return;
    }

    clearAllRouteLayers(map);
  }, [
    routePolyline,
    routeSegments,
    transitSegments,
    routeColor,
    accentColor,
    showRoute,
    showTraffic,
    routeStart,
    routeEnd,
    mapReady,
    onRouteLineClick,
    onRouteLineDrag,
    animateRouteReveal,
    suppressRouteAutoFit,
    fitBounds,
  ]);

  useEffect(() => {
    if (!animateRouteReveal || !mapReady || !mapRef.current) return;
    if (!showRoute || !routePolyline || routePolyline.length < 2) {
      if (animateRouteReveal && showRoute) onRouteRevealComplete?.();
      return;
    }
    if (transitSegments?.length || routeSegments?.length) return;

    const map = mapRef.current;
    clearAllRouteLayers(map);
    const fullLatLngs = routePolyline.map((p) => [p.lat, p.lng] as LatLngTuple);
    const durationMs = routeRevealDurationMs;
    const pauseLinearAt = 0.38 + Math.random() * 0.12;
    const pauseMs = jitter(275, 0.35);

    let raf = 0;
    let startTs = 0;
    let cancelled = false;

    const drawFrame = (fraction: number) => {
      clearRouteLayers(map);
      const partial = trimPolylineByFraction(fullLatLngs, fraction);
      if (partial.length >= 2) {
        drawSimpleRoutePolyline(map, partial, {
          showTraffic,
          routeColor,
          accentColor,
          interactive: false,
        });
      }
    };

    const finish = () => {
      if (cancelled) return;
      clearRouteLayers(map);
      drawSimpleRoutePolyline(map, fullLatLngs, {
        showTraffic,
        routeColor,
        accentColor,
        onRouteLineClick,
        onRouteLineDrag,
        map,
      });
      if (!suppressRouteAutoFit && !fitBounds) {
        safeFitBounds(map, coordsToBounds(fullLatLngs), { padding: 50 });
      }
      onRouteRevealComplete?.();
    };

    const tick = (ts: number) => {
      if (cancelled) return;
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const linear = computeLinearProgressWithPause(elapsed, durationMs, pauseLinearAt, pauseMs);
      drawFrame(easeInOutCubic(linear));
      if (linear < 1) raf = requestAnimationFrame(tick);
      else finish();
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [
    animateRouteReveal,
    routePolyline,
    routeRevealDurationMs,
    mapReady,
    showRoute,
    showTraffic,
    routeColor,
    accentColor,
    routeSegments,
    transitSegments,
    onRouteLineClick,
    onRouteLineDrag,
    suppressRouteAutoFit,
    fitBounds,
    onRouteRevealComplete,
  ]);

  const containerClass = [className, tilesRaggedReveal ? 'mq-tiles-ragged-reveal' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={containerRef}
      className={containerClass}
      style={{
        width: '100%',
        height,
        borderRadius: 'inherit',
        overflow: 'hidden',
        background: darkMode ? '#1a1a2e' : '#e8eaed',
      }}
    />
  );
}
