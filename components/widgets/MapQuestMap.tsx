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
  onClick?: () => void;
}

interface MapCircle {
  lat: number;
  lng: number;
  radius: number;
  color?: string;
  fillOpacity?: number;
}

interface MapPolygon {
  coordinates: { lat: number; lng: number }[];
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

interface TransitSegment {
  type: string; // pedestrian, subway, bus, train, etc.
  coords: { lat: number; lng: number }[];
}

interface MapQuestMapProps {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom?: number;
  darkMode?: boolean;
  accentColor?: string;
  markers?: MapMarker[];
  circles?: MapCircle[];
  polygons?: MapPolygon[];
  height?: string;
  showRoute?: boolean;
  routeStart?: { lat: number; lng: number };
  routeEnd?: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[];
  routeType?: 'fastest' | 'pedestrian' | 'bicycle';
  routeColor?: string;
  routePolyline?: { lat: number; lng: number }[]; // Pre-calculated route coordinates
  transitSegments?: TransitSegment[]; // For multi-segment transit routes with different line styles
  onClick?: (lat: number, lng: number) => void;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  showZoomControls?: boolean;
  interactive?: boolean;
  className?: string;
  fitBounds?: { north: number; south: number; east: number; west: number };
  zoomToLocation?: { lat: number; lng: number; zoom?: number };
}

declare global {
  interface Window {
    L: any;
  }
}

export default function MapQuestMap({
  apiKey,
  center,
  zoom = 12,
  darkMode = false,
  accentColor = '#2563eb',
  markers = [],
  circles = [],
  polygons = [],
  height = '400px',
  showRoute = false,
  routeStart,
  routeEnd,
  waypoints,
  routeType = 'fastest',
  routeColor,
  routePolyline,
  transitSegments,
  onClick,
  onBoundsChange,
  showZoomControls = true,
  interactive = true,
  className = '',
  fitBounds,
  zoomToLocation,
}: MapQuestMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const circlesLayerRef = useRef<any>(null);
  const polygonsLayerRef = useRef<any>(null);
  const mapIdRef = useRef(`map-${Math.random().toString(36).substr(2, 9)}`);
  const [mapReady, setMapReady] = useState(false);

  // Inject modern styles
  useEffect(() => {
    const styleId = 'mapquest-modern-styles-v3';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Adjust map tile colors for a more modern muted look */
      .leaflet-tile-pane {
        filter: saturate(0.85) brightness(1.02) contrast(1.02);
      }
      .dark-map .leaflet-tile-pane {
        filter: saturate(0.9) brightness(0.95) contrast(1.05);
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
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        transition: filter 0.15s ease !important;
      }
      .modern-marker:hover {
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
        border-radius: 6px !important;
        padding: 6px 10px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
        white-space: nowrap !important;
        max-width: 200px !important;
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
    document.head.appendChild(style);
  }, []);

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

      // Use MapQuest tileLayer
      const map = L.mapquest.map(mapIdRef.current, {
        center: [center.lat, center.lng],
        layers: L.mapquest.tileLayer(darkMode ? 'dark' : 'map'),
        zoom: zoom,
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

      if (onClick) {
        map.on('click', (e: any) => {
          onClick(e.latlng.lat, e.latlng.lng);
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

  // Update dark mode / tiles
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const L = window.L;
    const mapDiv = document.getElementById(mapIdRef.current);
    
    // Remove old tile layers
    mapRef.current.eachLayer((layer: any) => {
      if (layer._url && (layer._url.includes('mapquest') || layer._url.includes('tile'))) {
        mapRef.current.removeLayer(layer);
      }
    });

    // Add MapQuest tiles
    L.mapquest.tileLayer(darkMode ? 'dark' : 'map').addTo(mapRef.current);
    
    if (darkMode) {
      mapDiv?.classList.add('dark-map');
    } else {
      mapDiv?.classList.remove('dark-map');
    }
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

    markersLayerRef.current.clearLayers();

    // Sort markers so POIs render first (bottom) and home/important markers render last (top)
    const sortedMarkers = [...markers].sort((a, b) => {
      const typeOrder = { 'poi': 0, 'default': 1, 'home': 2 };
      return (typeOrder[a.type || 'default'] || 1) - (typeOrder[b.type || 'default'] || 1);
    });

    sortedMarkers.forEach((marker) => {
      const color = marker.color || accentColor;
      const type = marker.type || 'default';
      
      let markerHtml: string;
      let iconSize: [number, number];
      let iconAnchor: [number, number];
      let popupAnchor: [number, number];
      
      // Custom icon URL takes precedence
      if (marker.iconUrl) {
        const size = marker.iconSize || [28, 28];
        iconSize = size as [number, number];
        iconAnchor = [size[0] / 2, size[1] / 2] as [number, number];
        popupAnchor = [0, -size[1] / 2] as [number, number];
        markerHtml = `
          <img src="${marker.iconUrl}" 
               width="${size[0]}" 
               height="${size[1]}" 
               style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15)); border-radius: 50%;"
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
      
      // Higher zIndexOffset for home markers to always be on top
      const zIndexOffset = type === 'home' ? 1000 : marker.iconUrl ? 500 : type === 'poi' ? 0 : 500;
      
      const icon = L.divIcon({
        html: markerHtml,
        className: type === 'home' ? 'modern-marker pulse-marker' : 'modern-marker',
        iconSize: iconSize,
        iconAnchor: iconAnchor,
        popupAnchor: popupAnchor,
      });

      const m = L.marker([marker.lat, marker.lng], { icon, zIndexOffset }).addTo(markersLayerRef.current);
      
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
    });
  }, [markers, accentColor, mapReady]);

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
        weight: 2,
        opacity: 0.5,
      }).addTo(circlesLayerRef.current);
    });
  }, [circles, accentColor, mapReady]);

  // Update polygons (for isolines)
  useEffect(() => {
    if (!polygonsLayerRef.current || !mapReady) return;
    const L = window.L;

    polygonsLayerRef.current.clearLayers();

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

        // Fit bounds to show the polygon
        if (mapRef.current) {
          mapRef.current.fitBounds(poly.getBounds(), { padding: [30, 30] });
        }
      }
    });
  }, [polygons, accentColor, mapReady]);

  // Update route (MapQuest directions - NOT for transit)
  useEffect(() => {
    if (!routeLayerRef.current || !mapReady) return;
    
    // Don't run if we have transit segments - that's handled by the other useEffect
    if (transitSegments && transitSegments.length > 0) return;
    
    const L = window.L;
    routeLayerRef.current.clearLayers();

    if (!showRoute || !routeStart || !routeEnd) return;

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

          // Shadow
          L.polyline(latLngs, {
            color: '#000000',
            weight: 8,
            opacity: 0.1,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(routeLayerRef.current);

          // Main route
          const routeLine = L.polyline(latLngs, {
            color: routeColor || accentColor,
            weight: 5,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(routeLayerRef.current);

          if (mapRef.current) {
            mapRef.current.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
          }
        }
      } catch (err) {
        console.error('Failed to fetch route:', err);
      }
    };

    fetchRoute();
  }, [showRoute, routeStart, routeEnd, waypoints, routeType, routeColor, accentColor, darkMode, mapReady, transitSegments]);

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
        const color = segmentColors[segmentType] || routeColor || accentColor;
        
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
      color: routeColor || accentColor,
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayerRef.current);

    if (mapRef.current && latLngs.length > 1) {
      mapRef.current.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    }
  }, [routePolyline, transitSegments, routeColor, accentColor, showRoute, routeStart, routeEnd, mapReady]);

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