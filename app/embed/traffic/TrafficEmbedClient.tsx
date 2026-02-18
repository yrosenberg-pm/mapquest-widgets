// app/embed/traffic/TrafficEmbedClient.tsx
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import LiveTrafficWidget from '@/components/widgets/LiveTrafficWidget';

function parseNum(v: string | null) {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function TrafficEmbedClient() {
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const apiKey = searchParams.get('apiKey') || '';
  const title = searchParams.get('title') || 'Live Traffic';
  const theme = (searchParams.get('theme') === 'light' ? 'light' : 'dark') as 'light' | 'dark';
  const zoom = parseNum(searchParams.get('zoom'));
  const width = parseNum(searchParams.get('width'));
  const height = parseNum(searchParams.get('height'));
  const refreshInterval = parseNum(searchParams.get('refreshInterval'));

  const center = useMemo(() => {
    const lat = parseNum(searchParams.get('centerLat')) ?? 34.0522;
    const lng = parseNum(searchParams.get('centerLng')) ?? -118.2437;
    return { lat, lng };
  }, [searchParams]);

  const incidentFilters = useMemo(() => {
    const raw = (searchParams.get('incidentFilters') || '').trim();
    if (!raw) return undefined;
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = new Set(['construction', 'incidents', 'event', 'congestion']);
    return parts.filter((p) => allowed.has(p)) as Array<'construction' | 'incidents' | 'event' | 'congestion'>;
  }, [searchParams]);

  // Auto-resize: post height to parent so the embed script can size the iframe.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const post = (h: number) => {
      try {
        window.parent?.postMessage({ type: 'mq-traffic-widget:resize', height: h }, '*');
      } catch (_) {}
    };

    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) post(h);
    };

    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className="min-h-[1px] w-full bg-transparent" ref={rootRef}>
      <LiveTrafficWidget
        apiKey={apiKey}
        center={center}
        title={title}
        theme={theme}
        zoom={zoom}
        width={width}
        height={height}
        refreshInterval={refreshInterval}
        incidentFilters={incidentFilters}
      />
    </div>
  );
}

