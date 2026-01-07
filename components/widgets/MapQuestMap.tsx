'use client';

import { useEffect, useRef, useState } from 'react';

interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

interface MapCircle {
  lat: number;
  lng: number;
  radius: number;
  color?: string;
  fillOpacity?: number;
}

interface MapQuestMapProps {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom?: number;
  darkMode?: boolean;
  accentColor?: string;
  markers?: MapMarker[];
  circles?: MapCircle[];
  height?: string;
  showRoute?: boolean;
  routeStart?: { lat: number; lng: number };
  routeEnd?: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[];
  routeType?: 'fastest' | 'pedestrian' | 'bicycle';
  routeColor?: string;
  onClick?: (lat: number, lng: number) => void;
  showZoomControls?: boolean;
  interactive?: boolean;
  className?: string;
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
  height = '400px',
  showRoute = false,
  routeStart,
  routeEnd,
  waypoints,
  routeType = 'fastest',
  routeColor,
  onClick,
  showZoomControls = true,
  interactive = true,
  className = '',
}: MapQuestMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const circlesLayerRef = useRef<any>(null);
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
        transition: transform 0.15s ease, filter 0.15s ease !important;
      }
      .modern-marker:hover {
        transform: scale(1.08) translateY(-1px) !important;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Initialize map with MapQuest SDK
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initMap = () => {
      const L = window.L;
      if (!L?.mapquest) {
        setTimeout(initMap, 100);
        return;
      }

      L.mapquest.key = apiKey;

      // Create container
      const mapDiv = document.createElement('div');
      mapDiv.id = mapIdRef.current;
      mapDiv.style.width = '100%';
      mapDiv.style.height = '100%';
      containerRef.current?.appendChild(mapDiv);

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

      if (onClick) {
        map.on('click', (e: any) => {
          onClick(e.latlng.lat, e.latlng.lng);
        });
      }

      setMapReady(true);
    };

    setTimeout(initMap, 50);

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
      }
      const mapDiv = document.getElementById(mapIdRef.current);
      if (mapDiv) mapDiv.remove();
      setMapReady(false);
    };
  }, [apiKey]);

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
    mapRef.current.setView([center.lat, center.lng], zoom);
  }, [center.lat, center.lng, zoom, mapReady]);

  // Update markers - solid pins
  useEffect(() => {
    if (!markersLayerRef.current || !mapReady) return;
    const L = window.L;

    markersLayerRef.current.clearLayers();

    markers.forEach((marker) => {
      const color = marker.color || accentColor;
      
      // Solid pin with white border, no text
      const markerHtml = `
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 1C7.373 1 2 6.373 2 13c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="${color}" stroke="white" stroke-width="2.5"/>
        </svg>
      `;

      const icon = L.divIcon({
        html: markerHtml,
        className: 'modern-marker',
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36],
      });

      const m = L.marker([marker.lat, marker.lng], { icon }).addTo(markersLayerRef.current);
      
      if (marker.label) {
        m.bindPopup(marker.label, { closeButton: false });
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

  // Update route
  useEffect(() => {
    if (!routeLayerRef.current || !mapReady) return;
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
  }, [showRoute, routeStart, routeEnd, waypoints, routeType, routeColor, accentColor, darkMode, mapReady]);

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