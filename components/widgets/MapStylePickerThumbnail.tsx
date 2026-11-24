'use client';

import { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import type { MapStyleConfigEntry } from '@/lib/mapStyles/config';
import { createMapQuestTransformRequest, resolveStyleLoadTarget } from '@/lib/mapStyles/styleLoader';
import { registerMaplibreWorker } from '@/lib/maplibre/registerWorker';
import { Map as MaplibreMap } from 'maplibre-gl';

type Props = {
  entry: MapStyleConfigEntry;
  apiKey: string;
  active?: boolean;
  accentColor?: string;
};

/** Small live style preview for the layer picker (lazy-mounted when visible). */
export default function MapStylePickerThumbnail({ entry, apiKey, active, accentColor = '#2563eb' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (records) => {
        if (records.some((r) => r.isIntersecting)) setVisible(true);
      },
      { rootMargin: '64px', threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!visible || !host || !apiKey?.trim()) return;

    let disposed = false;
    registerMaplibreWorker();

    const styleUrl = resolveStyleLoadTarget(entry, apiKey);
    const { lng, lat, zoom, pitch = 0, bearing = 0 } = entry.showcase;

    const map = new MaplibreMap({
      container: host,
      style: styleUrl,
      center: [lng, lat],
      zoom: Math.max(3, zoom - 0.5),
      pitch: Math.min(pitch, 45),
      bearing,
      fadeDuration: 0,
      interactive: false,
      attributionControl: false,
      dragPan: false,
      scrollZoom: false,
      boxZoom: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      keyboard: false,
      transformRequest: createMapQuestTransformRequest(apiKey),
    });

    mapRef.current = map;

    const onError = () => {
      if (!disposed) setFailed(true);
    };

    const onIdle = () => {
      if (disposed) return;
      window.requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          /* ignore */
        }
      });
    };

    map.on('error', onError);
    map.on('idle', onIdle);

    window.requestAnimationFrame(() => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    });

    return () => {
      disposed = true;
      map.off('error', onError);
      map.off('idle', onIdle);
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
    };
  }, [visible, entry.id, apiKey, entry]);

  return (
    <div
      ref={hostRef}
      className="relative w-full h-14 rounded-lg overflow-hidden"
      style={{
        background: 'var(--bg-input)',
        border: `1px solid ${active ? accentColor : 'var(--border-subtle)'}`,
      }}
      aria-hidden
    >
      {!apiKey?.trim() || failed ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers
            className="w-6 h-6"
            style={{ color: active ? accentColor : 'var(--text-muted)' }}
            aria-hidden
          />
        </div>
      ) : null}
    </div>
  );
}