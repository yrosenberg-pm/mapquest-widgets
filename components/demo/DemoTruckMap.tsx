'use client';

import type { DemoTruckRouteResult } from '@/lib/demo/demoTruckRouteTypes';
import { DEMO_ACCENT, DEMO_MAP_CENTER, DEMO_ROUTE_BLUE } from '@/lib/demo/demoTokens';
import {
  createDemoRouteRevealTiming,
  fractionAtElapsed,
  trimPolylineByFraction,
} from '@/lib/demo/routeReveal';
import { type LatLngTuple } from '@/lib/maplibre/geo';
import { registerMaplibreWorker } from '@/lib/maplibre/registerWorker';
import { drawRibbonRoute } from '@/lib/maplibre/routeDraw';
import { resolveMapQuestTileStyle } from '@/lib/mapquestMaplibreStyle';
import { Map as MaplibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';

const API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

type Props = {
  runKey: number;
  route?: DemoTruckRouteResult | null;
};

export default function DemoTruckMap({ runKey, route }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const resizeMap = () => {
    try {
      mapRef.current?.resize();
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let alive = true;
    const host = hostRef.current;
    if (!host || !API_KEY) return;

    registerMaplibreWorker();

    const map = new MaplibreMap({
      container: host,
      style: resolveMapQuestTileStyle(API_KEY, 'map'),
      center: [DEMO_MAP_CENTER.lng, DEMO_MAP_CENTER.lat],
      zoom: DEMO_MAP_CENTER.zoom,
      attributionControl: { compact: true },
    });

    mapRef.current = map;
    const onLoad = () => {
      if (!alive) return;
      setMapReady(true);
      window.setTimeout(resizeMap, 50);
      window.setTimeout(resizeMap, 350);
    };
    map.on('load', onLoad);
    if (map.loaded()) onLoad();

    return () => {
      alive = false;
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
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
      resizeMap();
    };

    host.addEventListener('transitionend', onTransitionEnd);
    window.setTimeout(resizeMap, 350);
    return () => host.removeEventListener('transitionend', onTransitionEnd);
  }, [mapReady, runKey]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !route?.polyline || route.polyline.length < 2) return;

    const map = mapRef.current;
    const fullLatLngs = route.polyline.map((p) => [p.lat, p.lng] as LatLngTuple);
    const timing = createDemoRouteRevealTiming();

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const pinEl = (label: string, fill: string) => {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:${fill};color:#fff;font:bold 12px/28px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.28);border:2px solid #fff;transform:translate(-14px,-14px);">${label}</div>`;
      return el;
    };

    markersRef.current.push(
      new Marker({ element: pinEl('A', DEMO_ACCENT) })
        .setLngLat([route.start.lng, route.start.lat])
        .addTo(map),
    );

    let endMarker: Marker | null = null;
    let cancelled = false;
    let raf = 0;
    let startTs = 0;

    const drawPartial = (fraction: number) => {
      const partial = trimPolylineByFraction(fullLatLngs, fraction);
      if (partial.length >= 2) {
        drawRibbonRoute(map, 'mq-demo-route-', partial, DEMO_ROUTE_BLUE, 6, 0.92);
      }
    };

    const finish = () => {
      if (cancelled) return;
      drawRibbonRoute(map, 'mq-demo-route-', fullLatLngs, DEMO_ROUTE_BLUE, 6, 0.92);
      endMarker = new Marker({ element: pinEl('B', '#DC2626') })
        .setLngLat([route.end.lng, route.end.lat])
        .addTo(map);
      markersRef.current.push(endMarker);

      const north = Math.max(route.boundingBox.ul.lat, route.boundingBox.lr.lat);
      const south = Math.min(route.boundingBox.ul.lat, route.boundingBox.lr.lat);
      const west = Math.min(route.boundingBox.ul.lng, route.boundingBox.lr.lng);
      const east = Math.max(route.boundingBox.ul.lng, route.boundingBox.lr.lng);
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 48 },
      );
      resizeMap();
    };

    const tick = (ts: number) => {
      if (cancelled) return;
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      drawPartial(fractionAtElapsed(elapsed, timing));
      if (fractionAtElapsed(elapsed, timing) < 1) raf = requestAnimationFrame(tick);
      else finish();
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      endMarker?.remove();
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
