'use client';

import { useEffect, useRef, useState } from 'react';
import type { DemoTruckRouteResult } from '@/lib/demo/demoTruckRouteTypes';
import { DEMO_ACCENT, DEMO_MAP_CENTER, DEMO_ROUTE_BLUE } from '@/lib/demo/demoTokens';
import {
  createDemoRouteRevealTiming,
  fractionAtElapsed,
  trimPolylineByFraction,
} from '@/lib/demo/routeReveal';

declare global {
  interface Window {
    L: any;
  }
}

const API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

type Props = {
  runKey: number;
  route?: DemoTruckRouteResult | null;
};

export default function DemoTruckMap({ runKey, route }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const mapIdRef = useRef(`demo-truck-map-${runKey}`);
  const [mapReady, setMapReady] = useState(false);

  const invalidateMapSize = () => {
    try {
      mapRef.current?.invalidateSize?.(false);
    } catch {
      /* ignore */
    }
  };

  const drawRouteLayers = (L: typeof window.L, layer: any, latLngs: [number, number][]) => {
    if (latLngs.length < 2) return null;
    L.polyline(latLngs, {
      color: '#000000',
      weight: 11,
      opacity: 0.12,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer);
    L.polyline(latLngs, {
      color: '#ffffff',
      weight: 9,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer);
    const routeLine = L.polyline(latLngs, {
      color: DEMO_ROUTE_BLUE,
      weight: 6,
      opacity: 0.92,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer);
    return routeLine;
  };

  const fitRouteBounds = (map: any, boundingBox: DemoTruckRouteResult['boundingBox']) => {
    const L = window.L;
    const north = Math.max(boundingBox.ul.lat, boundingBox.lr.lat);
    const south = Math.min(boundingBox.ul.lat, boundingBox.lr.lat);
    const west = Math.min(boundingBox.ul.lng, boundingBox.lr.lng);
    const east = Math.max(boundingBox.ul.lng, boundingBox.lr.lng);
    const bounds = L.latLngBounds([south, west], [north, east]);
    map.fitBounds(bounds, { padding: [48, 48] });
  };

  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const destroyMap = () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
      }
      routeLayerRef.current = null;
      markersLayerRef.current = null;
      routeLineRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = '';
    };

    const init = () => {
      if (!alive || !hostRef.current) return;
      const L = window.L;
      if (!L?.mapquest?.map || !L?.mapquest?.tileLayer) {
        retryTimer = setTimeout(init, 100);
        return;
      }

      destroyMap();
      L.mapquest.key = API_KEY;

      const mapDiv = document.createElement('div');
      mapDiv.id = mapIdRef.current;
      mapDiv.style.width = '100%';
      mapDiv.style.height = '100%';
      hostRef.current.appendChild(mapDiv);

      const map = L.mapquest.map(mapIdRef.current, {
        center: [DEMO_MAP_CENTER.lat, DEMO_MAP_CENTER.lng],
        zoom: DEMO_MAP_CENTER.zoom,
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
      });

      L.mapquest.tileLayer('map').addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);

      window.setTimeout(invalidateMapSize, 50);
      window.setTimeout(invalidateMapSize, 350);
    };

    setMapReady(false);
    init();

    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
      destroyMap();
      setMapReady(false);
    };
  }, [runKey]);

  useEffect(() => {
    if (!mapReady) return;
    const host = hostRef.current;
    if (!host) return;

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== host) return;
      if (e.propertyName !== 'opacity' && e.propertyName !== 'transform') return;
      invalidateMapSize();
    };

    host.addEventListener('transitionend', onTransitionEnd);
    window.setTimeout(invalidateMapSize, 350);

    return () => {
      host.removeEventListener('transitionend', onTransitionEnd);
    };
  }, [mapReady, runKey]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !routeLayerRef.current || !markersLayerRef.current) return;
    if (!route?.polyline || route.polyline.length < 2) return;

    const L = window.L;
    const fullLatLngs = route.polyline.map((p) => [p.lat, p.lng] as [number, number]);
    const timing = createDemoRouteRevealTiming();

    routeLayerRef.current.clearLayers();
    markersLayerRef.current.clearLayers();
    routeLineRef.current = null;

    const pinHtml = (label: string, fill: string, opacity = 1) =>
      `<div style="width:28px;height:28px;border-radius:50%;background:${fill};color:#fff;font:bold 12px/28px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.28);border:2px solid #fff;opacity:${opacity}">${label}</div>`;

    const startIcon = L.divIcon({
      className: '',
      html: pinHtml('A', DEMO_ACCENT),
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker([route.start.lat, route.start.lng], { icon: startIcon, interactive: false }).addTo(
      markersLayerRef.current,
    );

    let endMarker: any = null;
    let cancelled = false;
    let raf = 0;
    let startTs = 0;

    const drawFrame = (fraction: number) => {
      routeLayerRef.current.clearLayers();
      const partial = trimPolylineByFraction(fullLatLngs, fraction);
      if (partial.length >= 2) {
        routeLineRef.current = drawRouteLayers(L, routeLayerRef.current, partial);
      }
    };

    const finish = () => {
      if (cancelled) return;
      routeLayerRef.current.clearLayers();
      routeLineRef.current = drawRouteLayers(L, routeLayerRef.current, fullLatLngs);

      const endIcon = L.divIcon({
        className: '',
        html: pinHtml('B', '#DC2626'),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      endMarker = L.marker([route.end.lat, route.end.lng], { icon: endIcon, interactive: false }).addTo(
        markersLayerRef.current,
      );

      fitRouteBounds(mapRef.current, route.boundingBox);
      invalidateMapSize();
      window.setTimeout(invalidateMapSize, 0);
      window.setTimeout(invalidateMapSize, 150);
    };

    const tick = (ts: number) => {
      if (cancelled) return;
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const fraction = fractionAtElapsed(elapsed, timing);
      drawFrame(fraction);
      if (fraction < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      endMarker?.remove?.();
    };
  }, [mapReady, route, runKey]);

  return (
    <div
      ref={hostRef}
      className="demo-assemble-piece absolute inset-0 h-full w-full min-h-[300px] md:min-h-0"
      style={{ background: '#e8eaed' }}
    />
  );
}
