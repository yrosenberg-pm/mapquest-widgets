'use client';

import { useEffect, useRef, useState } from 'react';

interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  type?: 'home' | 'poi' | 'default';
  iconUrl?: string;
  iconSize?: [number, number];
  // When using `iconUrl`, MapQuestMap used to force a circular crop via border-radius.
  // Keep that as the default for backward compatibility, but allow callers to opt out.
  iconCircular?: boolean;
  // Opt out of marker clustering (when enabled).
  clusterable?: boolean;
  zIndexOffset?: number;
  onClick?: () => void;
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
  dashed?: boolean;
  onClick?: (lat: number, lng: number) => void;
}

interface TransitSegment {
  type: string; // pedestrian, subway, bus, train, etc.
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
  // Lightweight clustering (no external plugin): groups nearby markers into a count bubble.
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
  routePolyline?: { lat: number; lng: number }[]; // Pre-calculated route coordinates
  routeSegments?: RouteSegment[]; // Pre-calculated colored segments (e.g., congestion along route)
  transitSegments?: TransitSegment[]; // For multi-segment transit routes with different line styles
  onClick?: (lat: number, lng: number) => void;
  onRightClick?: (lat: number, lng: number, meta?: { clientX: number; clientY: number }) => void;
  onRouteLineClick?: (lat: number, lng: number) => void;
  // Drag the route line to "shape" the route by dropping a waypoint on release.
  // Leaflet core doesn't support true polyline editing, so this is implemented as a drag-to-insert waypoint gesture.
  onRouteLineDrag?: (evt: { phase: 'start' | 'move' | 'end'; lat: number; lng: number }) => void;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  showZoomControls?: boolean;
  interactive?: boolean;
  className?: string;
  fitBounds?: { north: number; south: number; east: number; west: number };
  zoomToLocation?: { lat: number; lng: number; zoom?: number };
  showTraffic?: boolean;
  highlightedSegment?: number | null; // Index of segment to highlight
  stops?: { lat: number; lng: number }[]; // All stops for segment-by-segment routing
  driverPosition?: { lat: number; lng: number }; // Live driver position for tracking
  showTruckRestrictions?: boolean; // Show truck restriction overlay on map
}

declare global {
  interface Window {
    L: any;
  }
}

// Route lines should always be the MapQuest "sharp blue" regardless of widget accent color.
const DEFAULT_ROUTE_BLUE = '#3B82F6';

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
}: MapQuestMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const circlesLayerRef = useRef<any>(null);
  const polygonsLayerRef = useRef<any>(null);
  const polylinesLayerRef = useRef<any>(null);
  const trafficLayerRef = useRef<any>(null);
  const highlightLayerRef = useRef<any>(null);
  const driverLayerRef = useRef<any>(null);
  const truckRestrictionsLayerRef = useRef<any>(null);
  const mapIdRef = useRef(`map-${Math.random().toString(36).substr(2, 9)}`);
  const [mapReady, setMapReady] = useState(false);
  const [viewRevision, setViewRevision] = useState(0);

  function svgDataUri(svg: string) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function clusterIconUri(count: number, color: string) {
    const n = Math.max(2, Math.min(999, Math.floor(count)));
    const digits = String(n).length;
    // Slightly smaller cluster bubble
    const size = digits >= 3 ? 38 : digits === 2 ? 34 : 30;
    const r = size / 2;
    // Slightly smaller number inside the cluster bubble for better visual balance.
    const fontSize = digits >= 3 ? 12 : digits === 2 ? 13 : 14;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${r}" cy="${r}" r="${r - 2}" fill="#111827" stroke="white" stroke-width="3"/>
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
              font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
              font-size="${fontSize}" font-weight="800" fill="white">${n}</text>
      </svg>
    `.trim();
    return svgDataUri(svg);
  }

  // Ensure Leaflet recalculates tiles when the container size changes (common in flex/resize layouts).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!mapRef.current || !mapReady) return;

    let raf = 0;
    const invalidate = () => {
      if (!mapRef.current) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          mapRef.current.invalidateSize();
        } catch (_) {}
      });
    };

    invalidate();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null;
    ro?.observe(el);
    window.addEventListener('resize', invalidate);
    return () => {
      window.removeEventListener('resize', invalidate);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mapReady]);

  // Inject modern styles
  useEffect(() => {
    // In dev (Fast Refresh), MapQuestMap may not remount, so we need to *update* the style tag
    // rather than bailing early when it already exists. This also guarantees tooltip tweaks apply.
    const styleId = 'mapquest-modern-styles-v3';
    const css = `
      /* Fix tile gaps - make tiles slightly overlap */
      .leaflet-tile {
        margin: -0.5px !important;
        width: 257px !important;
        height: 257px !important;
      }

      /* Clean zoom controls */
      .leaflet-control-zoom {
        border: none !important;
        border-radius: 6px !important;
        overflow: hidden;
        box-shadow: 0 1px 4px rgba(0,0,0,0.12) !important;
      }
      .leaflet-control-zoom a {
        width: 32px !important;
        height: 32px !important;
        line-height: 32px !important;
        font-size: 16px !important;
        font-weight: 400 !important;
        color: #374151 !important;
        background: white !important;
        border: none !important;
        transition: background 0.15s ease !important;
      }
      .leaflet-control-zoom a:hover {
        background: #f3f4f6 !important;
      }
      .leaflet-control-zoom-in {
        border-bottom: 1px solid #e5e7eb !important;
        border-radius: 6px 6px 0 0 !important;
      }
      .leaflet-control-zoom-out {
        border-radius: 0 0 6px 6px !important;
      }
      
      /* Dark mode controls */
      .dark-map .leaflet-control-zoom {
        box-shadow: 0 1px 4px rgba(0,0,0,0.3) !important;
      }
      .dark-map .leaflet-control-zoom a {
        background: #1f2937 !important;
        color: #d1d5db !important;
      }
      .dark-map .leaflet-control-zoom a:hover {
        background: #374151 !important;
      }
      .dark-map .leaflet-control-zoom-in {
        border-bottom-color: #374151 !important;
      }
      
      /* Clean attribution */
      .leaflet-control-attribution {
        background: rgba(255,255,255,0.85) !important;
        padding: 3px 8px !important;
        border-radius: 4px !important;
        font-size: 9px !important;
        margin: 6px !important;
        color: #6b7280 !important;
      }
      .dark-map .leaflet-control-attribution {
        background: rgba(17,24,39,0.85) !important;
        color: #9ca3af !important;
      }
      .leaflet-control-attribution a {
        color: inherit !important;
      }

      /* Clean popup */
      .leaflet-popup-content-wrapper {
        border-radius: 8px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
        padding: 0 !important;
      }
      .leaflet-popup-content {
        margin: 10px 14px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        color: #1f2937;
      }
      .leaflet-popup-tip {
        box-shadow: none !important;
      }
      .dark-map .leaflet-popup-content-wrapper {
        background: #1f2937 !important;
      }
      .dark-map .leaflet-popup-content {
        color: #f9fafb !important;
      }
      .dark-map .leaflet-popup-tip {
        background: #1f2937 !important;
      }

      /* Hide MapQuest logo */
      .mqlogo, .mq-attribution-logo {
        display: none !important;
      }
      
      /* Marker styling */
      .modern-marker {
        transition: transform 0.15s ease !important;
      }
      .modern-marker:hover {
        transform: scale(1.1);
      }
      /* Make custom-icon markers easier to see (includes condition icons, POI icons, clusters, etc.) */
      .modern-marker img {
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
      }
      .modern-marker:hover img {
        filter: drop-shadow(0 5px 10px rgba(0,0,0,0.35));
      }
      /* Only add shadow to non-custom-icon markers */
      .modern-marker-with-shadow {
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
      }
      .modern-marker-with-shadow:hover {
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));
      }
      
      /* Subtle pulsing blue ring for home marker */
      .pulse-marker {
        position: relative;
      }
      
      .pulse-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 2px solid #3b82f6;
        opacity: 0;
        animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        pointer-events: none;
      }
      
      @keyframes pulse-ring {
        0% {
          opacity: 0.6;
          transform: translate(-50%, -50%) scale(0.8);
        }
        50% {
          opacity: 0.3;
          transform: translate(-50%, -50%) scale(1.2);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1.5);
        }
      }
      
      /* Custom tooltip styling for marker hover */
      .marker-tooltip {
        background: rgba(15, 23, 42, 0.95) !important;
        color: #fff !important;
        border: none !important;
        border-radius: 10px !important;
        padding: 9px 12px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
        /* Prefer a wide, single-line tooltip (easier to scan than a tall bubble) */
        white-space: nowrap !important;
        line-height: 1.25 !important;
        min-width: 320px !important;
        max-width: 720px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .marker-tooltip::before {
        border-top-color: rgba(15, 23, 42, 0.95) !important;
      }
      .leaflet-tooltip-top::before {
        border-top-color: rgba(15, 23, 42, 0.95) !important;
      }
      .leaflet-tooltip-bottom::before {
        border-bottom-color: rgba(15, 23, 42, 0.95) !important;
      }
      .leaflet-tooltip-left::before {
        border-left-color: rgba(15, 23, 42, 0.95) !important;
      }
      .leaflet-tooltip-right::before {
        border-right-color: rgba(15, 23, 42, 0.95) !important;
      }
    `;

    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  });

  // Initialize map with MapQuest SDK - only run once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const initMap = () => {
      if (!isMounted || !containerRef.current) return;
      
      const L = window.L;
      if (!L?.mapquest) {
        timeoutId = setTimeout(initMap, 100);
        return;
      }

      // Check if map already exists and is valid
      const existingMapDiv = document.getElementById(mapIdRef.current);
      if (existingMapDiv && L.mapquest.maps && L.mapquest.maps[mapIdRef.current]) {
        // Map already initialized, just update it
        mapRef.current = L.mapquest.maps[mapIdRef.current];
        setMapReady(true);
        return;
      }

      // Remove any existing container that doesn't have a valid map
      if (existingMapDiv && existingMapDiv.parentNode) {
        existingMapDiv.remove();
      }

      if (!containerRef.current) return;

      L.mapquest.key = apiKey;

      // Create new container
      const mapDiv = document.createElement('div');
      mapDiv.id = mapIdRef.current;
      mapDiv.style.width = '100%';
      mapDiv.style.height = '100%';
      containerRef.current.appendChild(mapDiv);

      // Create map without initial tile layer - we'll add it in the darkMode useEffect
      const map = L.mapquest.map(mapIdRef.current, {
        center: [center.lat, center.lng],
        zoom: zoom,
        minZoom: minZoom,
        zoomControl: showZoomControls,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
      });

      if (darkMode) {
        mapDiv.classList.add('dark-map');
      }

      mapRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      circlesLayerRef.current = L.layerGroup().addTo(map);
      polygonsLayerRef.current = L.layerGroup().addTo(map);
      polylinesLayerRef.current = L.layerGroup().addTo(map);
      highlightLayerRef.current = L.layerGroup().addTo(map);
      driverLayerRef.current = L.layerGroup().addTo(map);

      if (onClick) {
        map.on('click', (e: any) => {
          onClick(e.latlng.lat, e.latlng.lng);
        });
      }

      if (onRightClick) {
        // Leaflet uses `contextmenu` for right-click / long-press context menu.
        map.on('contextmenu', (e: any) => {
          try {
            const oe = e?.originalEvent;
            onRightClick(e.latlng.lat, e.latlng.lng, {
              clientX: typeof oe?.clientX === 'number' ? oe.clientX : 0,
              clientY: typeof oe?.clientY === 'number' ? oe.clientY : 0,
            });
          } catch (_) {}
        });
      }

      // Notify parent of bounds changes (for viewport-based filtering)
      if (onBoundsChange) {
        const notifyBounds = () => {
          const bounds = map.getBounds();
          onBoundsChange({
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          });
        };
        map.on('moveend', notifyBounds);
        map.on('zoomend', notifyBounds);
        // Initial bounds notification
        setTimeout(notifyBounds, 100);
      }

      setMapReady(true);
    };

    timeoutId = setTimeout(initMap, 50);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      // Only clean up on unmount
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {
          // Ignore errors
        }
        mapRef.current = null;
      }
      const mapDiv = document.getElementById(mapIdRef.current);
      if (mapDiv && mapDiv.parentNode) {
        mapDiv.remove();
      }
      setMapReady(false);
    };
  }, [apiKey]); // Only depend on apiKey - map should initialize once

  // Track tile layer reference
  const tileLayerRef = useRef<any>(null);

  // Update dark mode / tiles - also handles initial tile layer
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const L = window.L;
    const mapDiv = document.getElementById(mapIdRef.current);
    
    // Remove ALL existing layers first (tiles, etc.)
    const layersToRemove: any[] = [];
    mapRef.current.eachLayer((layer: any) => {
      // Check if it's a tile layer by looking for _url property or checking constructor
      if (layer._url || layer._tiles || (layer.options && layer.options.tileSize)) {
        layersToRemove.push(layer);
      }
    });
    layersToRemove.forEach((layer: any) => {
      mapRef.current.removeLayer(layer);
    });
    
    // Clear the ref
    tileLayerRef.current = null;

    // Update dark-map class BEFORE adding tiles
    if (darkMode) {
      mapDiv?.classList.add('dark-map');
    } else {
      mapDiv?.classList.remove('dark-map');
    }

    // Add MapQuest tile layer
    const newTileLayer = L.mapquest.tileLayer(darkMode ? 'dark' : 'map');
    newTileLayer.addTo(mapRef.current);
    tileLayerRef.current = newTileLayer;
    
    // Force map to recalculate and redraw after tile change
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 100);
  }, [darkMode, mapReady]);

  // Update center and zoom
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    // Don't setView if fitBounds is provided (fitBounds takes precedence)
    if (fitBounds) return;
    // Don't setView if transit segments are present (they handle their own bounds)
    if (transitSegments && transitSegments.length > 0) return;
    mapRef.current.setView([center.lat, center.lng], zoom);
  }, [center.lat, center.lng, zoom, mapReady, fitBounds, transitSegments]);

  // Fit bounds (for showing all markers)
  useEffect(() => {
    if (!mapRef.current || !mapReady || !fitBounds) return;
    const L = window.L;
    const bounds = L.latLngBounds(
      [fitBounds.south, fitBounds.west],
      [fitBounds.north, fitBounds.east]
    );
    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
  }, [fitBounds, mapReady]);

  // Zoom to specific location
  useEffect(() => {
    if (!mapRef.current || !mapReady || !zoomToLocation) return;
    const targetZoom = zoomToLocation.zoom || 16;
    mapRef.current.setView([zoomToLocation.lat, zoomToLocation.lng], targetZoom);
  }, [zoomToLocation, mapReady]);

  // Update markers - different icons for home vs POI
  useEffect(() => {
    if (!markersLayerRef.current || !mapReady) return;
    const L = window.L;
    const map = mapRef.current;

    markersLayerRef.current.clearLayers();

    // Sort markers so POIs render first (bottom) and home/important markers render last (top)
    const sortedMarkers = [...markers].sort((a, b) => {
      const typeOrder = { 'poi': 0, 'default': 1, 'home': 2 };
      return (typeOrder[a.type || 'default'] || 1) - (typeOrder[b.type || 'default'] || 1);
    });

    const renderMarkers: MapMarker[] = (() => {
      if (!clusterMarkers || !map) return sortedMarkers;
      const radius = Math.max(24, Math.min(120, clusterRadiusPx));
      const zoom = map.getZoom();
      const fixed = sortedMarkers.filter((m) => m.clusterable === false);
      const clusterable = sortedMarkers.filter((m) => m.clusterable !== false);

      const buckets = new Map<
        string,
        { sumX: number; sumY: number; members: MapMarker[] }
      >();

      for (const m of clusterable) {
        const p = map.project(L.latLng(m.lat, m.lng), zoom);
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
        const ll = map.unproject(L.point(cx, cy), zoom);
        const bounds = L.latLngBounds(b.members.map((m) => [m.lat, m.lng]));
        const color = accentColor;
        const digits = String(b.members.length).length;
        const bubbleSize = digits >= 3 ? 38 : digits === 2 ? 34 : 30;
        out.push({
          lat: ll.lat,
          lng: ll.lng,
          type: 'default',
          color,
          label: `${b.members.length} events`,
          iconUrl: clusterIconUri(b.members.length, color),
          iconCircular: false,
          iconSize: [bubbleSize, bubbleSize],
          zIndexOffset: 9500,
          clusterable: false,
          onClick: () => {
            try {
              map.fitBounds(bounds, { padding: [50, 50] });
            } catch (_) {
              map.setView(ll, Math.min(19, zoom + 2));
            }
          },
        });
      }
      return out;
    })();

    renderMarkers.forEach((marker) => {
      const color = marker.color || accentColor;
      const type = marker.type || 'default';
      
      let markerHtml: string;
      let iconSize: [number, number];
      let iconAnchor: [number, number];
      let popupAnchor: [number, number];
      
      // Custom icon URL takes precedence
      if (marker.iconUrl) {
        const size = marker.iconSize || [28, 28];
        const iconCircular = marker.iconCircular !== false;
        iconSize = size as [number, number];
        iconAnchor = [size[0] / 2, size[1] / 2] as [number, number];
        popupAnchor = [0, -size[1] / 2] as [number, number];
        markerHtml = `
          <img src="${marker.iconUrl}" 
               width="${size[0]}" 
               height="${size[1]}" 
               style="${iconCircular ? 'border-radius: 50%;' : ''}"
               alt=""
          />
        `;
      } else if (type === 'home') {
        // Home icon - larger circle with house shape, with pulsing ring
        // Made larger (40x40) to stand out from POI markers
        iconSize = [40, 40];
        iconAnchor = [20, 20];
        popupAnchor = [0, -20];
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
        // POI icon - smaller pin for parking/food/hotels
        iconSize = [22, 28];
        iconAnchor = [11, 28];
        popupAnchor = [0, -28];
        markerHtml = `
          <svg width="22" height="28" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));">
            <path d="M14 1C7.373 1 2 6.373 2 13c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="${color}" stroke="white" stroke-width="2"/>
          </svg>
        `;
      } else {
        // Default icon - standard pin (for stadiums, etc)
        iconSize = [28, 36];
        iconAnchor = [14, 36];
        popupAnchor = [0, -36];
        markerHtml = `
          <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.25));">
            <path d="M14 1C7.373 1 2 6.373 2 13c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="${color}" stroke="white" stroke-width="2.5"/>
          </svg>
        `;
      }
      
      // Higher zIndexOffset for home markers to always be on top (unless caller overrides)
      const zIndexOffset =
        typeof marker.zIndexOffset === 'number'
          ? marker.zIndexOffset
          : type === 'home'
            ? 1000
            : marker.iconUrl
              ? 500
              : type === 'poi'
                ? 0
                : 500;
      
      // Custom icon markers don't get shadow, others do
      const markerClassName = marker.iconUrl 
        ? 'modern-marker' 
        : type === 'home' 
          ? 'modern-marker modern-marker-with-shadow pulse-marker' 
          : 'modern-marker modern-marker-with-shadow';
      
      const icon = L.divIcon({
        html: markerHtml,
        className: markerClassName,
        iconSize: iconSize,
        iconAnchor: iconAnchor,
        popupAnchor: popupAnchor,
      });

      const m = L.marker([marker.lat, marker.lng], { icon, zIndexOffset, draggable: !!marker.draggable }).addTo(markersLayerRef.current);
      
      if (marker.label) {
        // Tooltip for hover state - shows location name on hover
        m.bindTooltip(marker.label, { 
          direction: 'top',
          offset: type === 'home' ? [0, -20] : type === 'poi' ? [0, -14] : [0, -18],
          className: 'marker-tooltip',
          permanent: false,
        });
        
        // Also keep popup for click (more detailed view)
        m.bindPopup(marker.label, { closeButton: false });
      }
      
      // Add click handler if provided
      if (marker.onClick) {
        m.on('click', () => {
          marker.onClick!();
        });
      }

      if (marker.onDragEnd) {
        m.on('dragend', (e: any) => {
          const ll = e?.target?.getLatLng?.();
          if (!ll) return;
          marker.onDragEnd?.(ll.lat, ll.lng);
        });
      }
    });
  }, [markers, accentColor, mapReady, clusterMarkers, clusterRadiusPx, viewRevision]);

  // Re-render markers when the map view changes so clusters expand/contract with zoom.
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

  // Update driver position marker
  useEffect(() => {
    if (!driverLayerRef.current || !mapReady) return;
    const L = window.L;
    
    driverLayerRef.current.clearLayers();
    
    if (!driverPosition) return;
    
    // Create animated driver marker
    const driverMarkerHtml = `
      <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
        <!-- Pulsing ring -->
        <div style="
          position: absolute;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: ${accentColor}30;
          animation: driver-pulse 2s ease-in-out infinite;
        "></div>
        <!-- Shadow -->
        <div style="
          position: absolute;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(0,0,0,0.2);
          filter: blur(4px);
          transform: translateY(2px);
        "></div>
        <!-- Car icon background -->
        <div style="
          position: relative;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${accentColor} 0%, #1e40af 100%);
          border: 3px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          z-index: 2;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/>
            <circle cx="17" cy="17" r="2"/>
          </svg>
        </div>
      </div>
      <style>
        @keyframes driver-pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 0.3; }
        }
      </style>
    `;
    
    const driverIcon = L.divIcon({
      html: driverMarkerHtml,
      className: 'driver-marker',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
    
    const driverMarker = L.marker([driverPosition.lat, driverPosition.lng], { 
      icon: driverIcon,
      zIndexOffset: 2000, // Always on top
    }).addTo(driverLayerRef.current);
    
    driverMarker.bindTooltip('Driver Location (Simulated)', {
      direction: 'top',
      offset: [0, -24],
      className: 'marker-tooltip',
    });
  }, [driverPosition, accentColor, mapReady]);

  // Update circles
  useEffect(() => {
    if (!circlesLayerRef.current || !mapReady) return;
    const L = window.L;

    circlesLayerRef.current.clearLayers();

    circles.forEach((circle) => {
      L.circle([circle.lat, circle.lng], {
        radius: circle.radius,
        color: circle.color || accentColor,
        fillColor: circle.color || accentColor,
        fillOpacity: circle.fillOpacity ?? 0.15,
        weight: circle.strokeWeight ?? 2,
        opacity: circle.strokeOpacity ?? 0.5,
      }).addTo(circlesLayerRef.current);
    });
  }, [circles, accentColor, mapReady]);

  // Update polygons (for isolines)
  useEffect(() => {
    if (!polygonsLayerRef.current || !mapReady) return;
    const L = window.L;

    polygonsLayerRef.current.clearLayers();

    // Compute combined bounds for all polygons so we fit once (prevents "fighting" when rendering multiple).
    let combinedBounds: any = null;

    polygons.forEach((polygon) => {
      const latLngs = polygon.coordinates.map(c => [c.lat, c.lng] as [number, number]);
      
      if (latLngs.length > 0) {
        const poly = L.polygon(latLngs, {
          color: polygon.color || accentColor,
          fillColor: polygon.color || accentColor,
          fillOpacity: polygon.fillOpacity ?? 0.2,
          weight: polygon.strokeWidth ?? 2,
          opacity: 0.8,
        }).addTo(polygonsLayerRef.current);

        if (polygon.onClick) {
          poly.on('click', (e: any) => {
            const ll = e?.latlng;
            if (ll) polygon.onClick?.(ll.lat, ll.lng);
          });
        }

        const b = poly.getBounds();
        combinedBounds = combinedBounds ? combinedBounds.extend(b) : b;
      }
    });

    // Fit bounds to show all polygons (if any). If fitBounds prop is set, that still takes precedence elsewhere.
    if (mapRef.current && combinedBounds && !fitBounds) {
      mapRef.current.fitBounds(combinedBounds, { padding: [30, 30] });
    }
  }, [polygons, accentColor, mapReady]);

  // Update polylines (generic overlay lines: closures, highlights, etc.)
  useEffect(() => {
    if (!polylinesLayerRef.current || !mapReady) return;
    const L = window.L;
    polylinesLayerRef.current.clearLayers();

    for (const pl of polylines) {
      if (!pl?.coords || pl.coords.length < 2) continue;
      const latLngs = pl.coords.map((c) => [c.lat, c.lng] as [number, number]);
      const line = L.polyline(latLngs, {
        color: pl.color || '#F97316',
        weight: pl.weight ?? 6,
        opacity: pl.opacity ?? 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: pl.dashed ? '10, 10' : undefined,
      }).addTo(polylinesLayerRef.current);

      if (pl.onClick) {
        line.on('click', (e: any) => {
          const ll = e?.latlng;
          if (!ll) return;
          pl.onClick?.(ll.lat, ll.lng);
        });
      }
    }
  }, [polylines, mapReady]);

  // Traffic incidents layer ref
  const trafficIncidentsRef = useRef<any>(null);

  // Traffic layer
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const L = window.L;
    const map = mapRef.current;

    // Remove existing traffic layers if any
    if (trafficLayerRef.current) {
      map.removeLayer(trafficLayerRef.current);
      trafficLayerRef.current = null;
    }
    if (trafficIncidentsRef.current) {
      map.removeLayer(trafficIncidentsRef.current);
      trafficIncidentsRef.current = null;
    }

    if (showTraffic && apiKey) {
      // Add MapQuest traffic flow layer (shows road colors based on congestion)
      const trafficFlowLayer = L.tileLayer(
        `https://api.mapquest.com/traffic/v2/flow/tile/{z}/{x}/{y}.png?key=${apiKey}`,
        {
          maxZoom: 20,
          opacity: 0.8,
          zIndex: 400,
        }
      );
      trafficFlowLayer.addTo(map);
      trafficLayerRef.current = trafficFlowLayer;

      // Add MapQuest traffic incidents layer (shows accident/construction markers)
      const trafficIncidentsLayer = L.tileLayer(
        `https://api.mapquest.com/traffic/v2/incidents/tile/{z}/{x}/{y}.png?key=${apiKey}`,
        {
          maxZoom: 20,
          opacity: 0.9,
          zIndex: 450,
        }
      );
      trafficIncidentsLayer.addTo(map);
      trafficIncidentsRef.current = trafficIncidentsLayer;
    }
  }, [showTraffic, apiKey, mapReady]);

  // Truck restrictions layer - fetch and display restriction markers from HERE API
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const L = window.L;

    // Remove existing truck restrictions layer
    if (truckRestrictionsLayerRef.current) {
      map.removeLayer(truckRestrictionsLayerRef.current);
      truckRestrictionsLayerRef.current = null;
    }

    if (!showTruckRestrictions) return;

    // Create a layer group for restriction markers
    const restrictionsLayer = L.layerGroup();
    restrictionsLayer.addTo(map);
    truckRestrictionsLayerRef.current = restrictionsLayer;

    // Function to fetch and display restrictions for current bounds
    const fetchRestrictions = async () => {
      const bounds = map.getBounds();
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      
      try {
        const response = await fetch(`/api/here?endpoint=truckrestrictions&bbox=${bbox}`);
        if (!response.ok) {
          return;
        }
        
        const data = await response.json();
        console.log('[MapQuestMap] Truck restrictions data:', data);
        
        // Clear existing markers
        restrictionsLayer.clearLayers();
        
        // Process restrictions from HERE API response
        // HERE returns restrictions in overlays array
        const restrictions = data.overlays || data.OVERLAY || [];
        
        restrictions.forEach((overlay: any) => {
          const shapes = overlay.SHAPE || overlay.shapes || [];
          const attrs = overlay.TRUCK_RESTRICTION || overlay.attributes || {};
          
          shapes.forEach((shape: any) => {
            // Get coordinates from shape
            let lat, lng;
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
            
            if (lat === undefined || lng === undefined) return;
            
            // Build restriction info
            const restrictions: string[] = [];
            
            // Height restriction (convert from cm to feet)
            if (attrs.HEIGHT_RESTRICTION || attrs.height) {
              const heightCm = attrs.HEIGHT_RESTRICTION || attrs.height;
              const heightFt = (heightCm / 30.48).toFixed(1);
              restrictions.push(`🚧 ${heightFt} ft`);
            }
            
            // Weight restriction (convert from kg to tons)
            if (attrs.WEIGHT_RESTRICTION || attrs.weight) {
              const weightKg = attrs.WEIGHT_RESTRICTION || attrs.weight;
              const weightTons = (weightKg / 907.185).toFixed(1);
              restrictions.push(`⚖️ ${weightTons} tons`);
            }
            
            // Length restriction (convert from cm to feet)
            if (attrs.LENGTH_RESTRICTION || attrs.length) {
              const lengthCm = attrs.LENGTH_RESTRICTION || attrs.length;
              const lengthFt = (lengthCm / 30.48).toFixed(0);
              restrictions.push(`📏 ${lengthFt} ft`);
            }
            
            // Width restriction
            if (attrs.WIDTH_RESTRICTION || attrs.width) {
              const widthCm = attrs.WIDTH_RESTRICTION || attrs.width;
              const widthFt = (widthCm / 30.48).toFixed(1);
              restrictions.push(`↔️ ${widthFt} ft`);
            }
            
            // Axle weight
            if (attrs.SINGLE_AXLE_WEIGHT || attrs.axleWeight) {
              const axleKg = attrs.SINGLE_AXLE_WEIGHT || attrs.axleWeight;
              const axleTons = (axleKg / 907.185).toFixed(1);
              restrictions.push(`🛞 ${axleTons}t/axle`);
            }
            
            // No trucks
            if (attrs.NO_THROUGH_TRUCKS || attrs.noTrucks) {
              restrictions.push(`🚫 No Trucks`);
            }
            
            // Hazmat
            if (attrs.HAZMAT_RESTRICTION || attrs.hazmat) {
              restrictions.push(`☢️ No Hazmat`);
            }
            
            if (restrictions.length === 0) {
              restrictions.push(`⚠️ Restriction`);
            }
            
            // Create marker with restriction icon
            const iconHtml = `
              <div style="
                background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
                color: white;
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                border: 2px solid white;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
              ">
                ${restrictions.map(r => `<span>${r}</span>`).join('')}
              </div>
            `;
            
            const icon = L.divIcon({
              html: iconHtml,
              className: 'truck-restriction-marker',
              iconSize: [80, 40],
              iconAnchor: [40, 20],
            });
            
            L.marker([lat, lng], { icon }).addTo(restrictionsLayer);
          });
        });
        
        // If no structured data, try showing sample restrictions for testing
        if (restrictions.length === 0) {
          console.log('[MapQuestMap] No restrictions found in API response, checking alternative format');
          
          // Check for alternative response formats
          if (data.ROUTE_LINKS || data.links) {
            const links = data.ROUTE_LINKS || data.links || [];
            links.forEach((link: any) => {
              const linkRestrictions = link.TRUCK_RESTRICTIONS || link.restrictions || [];
              linkRestrictions.forEach((r: any) => {
                const lat = r.LAT || r.lat;
                const lng = r.LON || r.lng || r.lon;
                if (lat && lng) {
                  const label = r.DESCRIPTION || r.description || 'Restriction';
                  const iconHtml = `
                    <div style="
                      background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
                      color: white;
                      padding: 4px 8px;
                      border-radius: 6px;
                      font-size: 11px;
                      font-weight: 600;
                      white-space: nowrap;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                      border: 2px solid white;
                    ">
                      ⚠️ ${label}
                    </div>
                  `;
                  const icon = L.divIcon({
                    html: iconHtml,
                    className: 'truck-restriction-marker',
                    iconSize: [100, 30],
                    iconAnchor: [50, 15],
                  });
                  L.marker([lat, lng], { icon }).addTo(restrictionsLayer);
                }
              });
            });
          }
        }
        
      } catch (err) {
        console.error('[MapQuestMap] Error fetching truck restrictions:', err);
      }
    };

    // Fetch restrictions initially and on map move
    fetchRestrictions();
    
    const onMoveEnd = () => {
      // Only fetch if zoom level is high enough (restrictions are local)
      if (map.getZoom() >= 10) {
        fetchRestrictions();
      } else {
        restrictionsLayer.clearLayers();
      }
    };
    
    map.on('moveend', onMoveEnd);
    
    return () => {
      map.off('moveend', onMoveEnd);
    };
  }, [showTruckRestrictions, mapReady]);

  // Highlighted segment effect
  useEffect(() => {
    if (!highlightLayerRef.current || !mapReady) return;
    const L = window.L;
    highlightLayerRef.current.clearLayers();

    // Only highlight if we have stops and a valid segment index
    if (highlightedSegment === null || !stops || stops.length < 2) return;
    if (highlightedSegment < 0 || highlightedSegment >= stops.length - 1) return;

    const segmentStart = stops[highlightedSegment];
    const segmentEnd = stops[highlightedSegment + 1];

    // Fetch route just for this segment
    const fetchSegmentRoute = async () => {
      try {
        const response = await fetch(
          `https://www.mapquestapi.com/directions/v2/route?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              locations: [
                `${segmentStart.lat},${segmentStart.lng}`,
                `${segmentEnd.lat},${segmentEnd.lng}`,
              ],
              options: {
                routeType: 'fastest',
                doReverseGeocode: false,
                generalize: 0,
              },
            }),
          }
        );

        const data = await response.json();
        if (data.route?.shape?.shapePoints) {
          const points = data.route.shape.shapePoints;
          const coords: [number, number][] = [];
          for (let i = 0; i < points.length; i += 2) {
            coords.push([points[i], points[i + 1]]);
          }

          // White outer glow for contrast
          const outerGlow = L.polyline(coords, {
            color: '#ffffff',
            weight: 14,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          });
          highlightLayerRef.current.addLayer(outerGlow);

          // Blue shadow for depth
          const shadowLine = L.polyline(coords, {
            color: '#1e40af',
            weight: 11,
            opacity: 0.4,
            lineCap: 'round',
            lineJoin: 'round',
          });
          highlightLayerRef.current.addLayer(shadowLine);

          // Main highlighted segment - thick blue line
          const highlightLine = L.polyline(coords, {
            color: accentColor,
            weight: 8,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'highlighted-segment-glow',
          });
          highlightLayerRef.current.addLayer(highlightLine);

          // Fit map bounds to highlighted segment with some padding
          const bounds = L.latLngBounds(coords);
          mapRef.current?.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 });
        }
      } catch (error) {
        console.error('Error fetching highlighted segment route:', error);
      }
    };

    fetchSegmentRoute();
  }, [highlightedSegment, stops, apiKey, mapReady, accentColor]);

  // Update route (MapQuest directions - NOT for transit)
  useEffect(() => {
    if (!routeLayerRef.current || !mapReady) return;
    
    // Don't run if we have transit segments - that's handled by the other useEffect
    if (transitSegments && transitSegments.length > 0) return;
    // Only handle the "fetch directions" route when start/end are provided.
    // Other route rendering modes (e.g., pre-calculated `routePolyline`) are handled by the next useEffect.
    if (!showRoute || !routeStart || !routeEnd) return;
    
    const L = window.L;
    routeLayerRef.current.clearLayers();

    const fetchRoute = async () => {
      try {
        const locations = [routeStart];
        if (waypoints && waypoints.length > 0) {
          // Waypoints should be inserted between start and end
          locations.push(...waypoints);
        }
        locations.push(routeEnd);

        // Build URL with multiple 'to' parameters for waypoints
        const from = `${locations[0].lat},${locations[0].lng}`;
        const toParams = locations.slice(1).map(l => `to=${l.lat},${l.lng}`).join('&');
        const url = `/api/mapquest?endpoint=directions&from=${from}&${toParams}&routeType=${routeType}&fullShape=true`;
        
        const res = await fetch(url);
        const data = await res.json();

        if (data?.route?.shape?.shapePoints) {
          const points = data.route.shape.shapePoints;
          const latLngs: [number, number][] = [];
          
          for (let i = 0; i < points.length; i += 2) {
            latLngs.push([points[i], points[i + 1]]);
          }

          // When a segment is highlighted, make the full route gray
          const isSegmentHighlighted = highlightedSegment !== null;
          const mainRouteColor = isSegmentHighlighted ? '#9CA3AF' : (routeColor || DEFAULT_ROUTE_BLUE);
          const mainRouteOpacity = isSegmentHighlighted ? 0.5 : 0.9;

          // Shadow
          L.polyline(latLngs, {
            color: '#000000',
            weight: 8,
            opacity: isSegmentHighlighted ? 0.05 : 0.1,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(routeLayerRef.current);

          // Main route
          const routeLine = L.polyline(latLngs, {
            color: mainRouteColor,
            weight: isSegmentHighlighted ? 4 : 5,
            opacity: mainRouteOpacity,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(routeLayerRef.current);

          // Only fit bounds if no segment is highlighted (let highlight effect handle zoom)
          if (mapRef.current && !isSegmentHighlighted) {
            mapRef.current.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
          }
        }
      } catch (err) {
        console.error('Failed to fetch route:', err);
      }
    };

    fetchRoute();
  }, [showRoute, routeStart, routeEnd, waypoints, routeType, routeColor, accentColor, darkMode, mapReady, transitSegments, highlightedSegment]);

  // Draw pre-calculated route polyline (e.g., from HERE transit API)
  useEffect(() => {
    if (!routeLayerRef.current || !mapReady) return;
    
    const L = window.L;
    routeLayerRef.current.clearLayers();

    // If we have transit segments, draw them with different styles
    if (transitSegments && transitSegments.length > 0) {
      console.log('Drawing transit segments:', transitSegments.length, 'segments');
      const allLatLngs: [number, number][] = [];
      
      // Define colors for different transit types (public transit only)
      const segmentColors: Record<string, string> = {
        pedestrian: '#6B7280', // Gray for walking
        subway: '#8B5CF6', // Purple for subway
        metro: '#8B5CF6', // Purple for metro (same as subway)
        bus: '#F59E0B', // Amber for bus
        train: '#3B82F6', // Blue for train
        rail: '#3B82F6', // Blue for rail
        regionalTrain: '#3B82F6',
        intercityTrain: '#1D4ED8',
        highSpeedTrain: '#1D4ED8',
        lightRail: '#10B981', // Emerald for light rail
        tram: '#10B981',
        ferry: '#0EA5E9', // Sky blue for ferry
        monorail: '#8B5CF6', // Purple for monorail
      };

      transitSegments.forEach((segment) => {
        if (segment.coords.length < 2) return;
        
        const latLngs = segment.coords.map(p => [p.lat, p.lng] as [number, number]);
        allLatLngs.push(...latLngs);
        
        const segmentType = segment.type.toLowerCase();
        const color = segmentColors[segmentType] || routeColor || DEFAULT_ROUTE_BLUE;
        
        // Determine if this segment should be dotted (walking or subway)
        const isDotted = segmentType === 'pedestrian' || segmentType === 'subway';
        
        // Shadow (subtle)
        L.polyline(latLngs, {
          color: '#000000',
          weight: isDotted ? 6 : 8,
          opacity: 0.08,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routeLayerRef.current);

        // Main segment line
        const lineOptions: any = {
          color,
          weight: isDotted ? 4 : 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        };

        if (isDotted) {
          lineOptions.dashArray = '8, 12';
          lineOptions.dashOffset = '0';
        }

        L.polyline(latLngs, lineOptions).addTo(routeLayerRef.current);
      });

      // Fit bounds to all segments
      if (mapRef.current && allLatLngs.length > 1) {
        console.log('Fitting bounds to', allLatLngs.length, 'points');
        const bounds = L.latLngBounds(allLatLngs);
        console.log('Bounds:', bounds.getNorth(), bounds.getSouth(), bounds.getEast(), bounds.getWest());
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      } else {
        console.log('Cannot fit bounds: mapRef=', !!mapRef.current, 'points=', allLatLngs.length);
      }
      return;
    }

    // Colored route segments (e.g., congestion visualization)
    if (showRoute && routeSegments && routeSegments.length > 0) {
      const allLatLngs: [number, number][] = [];

      // Continuous underlay to make the route feel like one connected line (helps blend segments).
      const stitched: [number, number][] = [];
      routeSegments.forEach((seg) => {
        if (!seg.coords || seg.coords.length < 2) return;
        seg.coords.forEach((p) => stitched.push([p.lat, p.lng]));
      });
      if (stitched.length > 1) {
        // White glow
        L.polyline(stitched, {
          color: '#ffffff',
          weight: 12,
          opacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round',
          smoothFactor: 1.2,
        }).addTo(routeLayerRef.current);
        // Soft blue base
        L.polyline(stitched, {
          color: accentColor,
          weight: 9,
          opacity: 0.25,
          lineCap: 'round',
          lineJoin: 'round',
          smoothFactor: 1.2,
        }).addTo(routeLayerRef.current);
      }

      routeSegments.forEach((seg) => {
        if (!seg.coords || seg.coords.length < 2) return;
        const latLngs = seg.coords.map((p) => [p.lat, p.lng] as [number, number]);
        allLatLngs.push(...latLngs);

        const w = seg.weight ?? 6;

        // Feather stroke to soften hard boundaries between segment colors.
        L.polyline(latLngs, {
          color: seg.color,
          weight: w + 6,
          opacity: 0.18,
          lineCap: 'round',
          lineJoin: 'round',
          smoothFactor: 1.2,
        }).addTo(routeLayerRef.current);

        // Main colored segment
        L.polyline(latLngs, {
          color: seg.color,
          weight: w,
          opacity: seg.opacity ?? 0.92,
          lineCap: 'round',
          lineJoin: 'round',
          smoothFactor: 1.2,
        }).addTo(routeLayerRef.current);
      });

      if (mapRef.current && allLatLngs.length > 1) {
        const bounds = L.latLngBounds(allLatLngs);
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      }
      return;
    }

    // Fallback to simple routePolyline if no segments
    if (!routePolyline || routePolyline.length === 0) return;

    const latLngs = routePolyline.map(p => [p.lat, p.lng] as [number, number]);

    // Shadow
    L.polyline(latLngs, {
      color: '#000000',
      weight: 8,
      opacity: 0.1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayerRef.current);

    // Main route line
    const routeLine = L.polyline(latLngs, {
      color: routeColor || DEFAULT_ROUTE_BLUE,
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayerRef.current);

    // Clickable hit area so callers can add waypoints by clicking the route line.
    if (onRouteLineClick || onRouteLineDrag) {
      const hitLine = L.polyline(latLngs, {
        color: '#000000',
        weight: 22,
        opacity: 0.001,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true,
      }).addTo(routeLayerRef.current);

      if (onRouteLineClick) {
        hitLine.on('click', (e: any) => {
          const ll = e?.latlng;
          if (!ll) return;
          onRouteLineClick(ll.lat, ll.lng);
        });
      }

      // Drag gesture: drag the hitLine and we emit start/move/end lat,lng.
      // This creates a "shape route" experience by dropping a waypoint on release.
      if (onRouteLineDrag && mapRef.current) {
        const map = mapRef.current;
        let active = false;

        const emit = (phase: 'start' | 'move' | 'end', e: any) => {
          const ll = e?.latlng;
          if (!ll) return;
          try {
            onRouteLineDrag({ phase, lat: ll.lat, lng: ll.lng });
          } catch (_) {}
        };

        const moveHandler = (e: any) => {
          if (!active) return;
          emit('move', e);
        };

        const endHandler = (e: any) => {
          if (!active) return;
          active = false;
          try {
            map.dragging?.enable?.();
          } catch (_) {}
          emit('end', e);
          try {
            map.off('mousemove', moveHandler);
            map.off('mouseup', endHandler);
            map.off('touchmove', moveHandler);
            map.off('touchend', endHandler);
            map.off('touchcancel', endHandler);
          } catch (_) {}
        };

        const startHandler = (e: any) => {
          active = true;
          try {
            map.dragging?.disable?.();
          } catch (_) {}
          emit('start', e);
          try {
            map.on('mousemove', moveHandler);
            map.on('mouseup', endHandler);
            map.on('touchmove', moveHandler);
            map.on('touchend', endHandler);
            map.on('touchcancel', endHandler);
          } catch (_) {}
        };

        hitLine.on('mousedown', startHandler);
        hitLine.on('touchstart', startHandler);

        return () => {
          try {
            hitLine.off('mousedown', startHandler);
            hitLine.off('touchstart', startHandler);
          } catch (_) {}
          try {
            map.off('mousemove', moveHandler);
            map.off('mouseup', endHandler);
            map.off('touchmove', moveHandler);
            map.off('touchend', endHandler);
            map.off('touchcancel', endHandler);
          } catch (_) {}
          try {
            map.dragging?.enable?.();
          } catch (_) {}
        };
      }
    }

    if (mapRef.current && latLngs.length > 1) {
      mapRef.current.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    }
  }, [routePolyline, transitSegments, routeColor, accentColor, showRoute, routeStart, routeEnd, mapReady, onRouteLineClick, onRouteLineDrag]);

  return (
    <div
      ref={containerRef}
      className={className}
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