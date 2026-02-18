// app/embed/route/RouteEmbedClient.tsx
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomRouteWidget, { decodeEmbedConfig } from '@/components/widgets/CustomRouteWidget';

export default function RouteEmbedClient() {
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const cfg = useMemo(() => {
    const raw = searchParams.get('config') || '';
    if (!raw) return null;
    return decodeEmbedConfig(raw);
  }, [searchParams]);

  // Auto-resize: post height to parent so the embed script can size the iframe.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const post = (h: number) => {
      try {
        window.parent?.postMessage({ type: 'mq-route-widget:resize', height: h }, '*');
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

  if (!cfg) {
    return (
      <div className="min-h-[1px] w-full" ref={rootRef}>
        <div className="p-4 text-sm text-slate-600">Missing or invalid route embed config.</div>
      </div>
    );
  }

  return (
    <div className="min-h-[1px] w-full" ref={rootRef}>
      <CustomRouteWidget
        mode="viewer"
        apiKey={String(cfg.apiKey || '')}
        waypoints={Array.isArray(cfg.waypoints) ? cfg.waypoints : []}
        title={cfg.title}
        description={cfg.description}
        routeType={cfg.routeType}
        unit={cfg.unit}
        theme={cfg.theme}
        darkMode={cfg.darkMode}
        accentColor={cfg.accentColor}
        fontFamily={cfg.fontFamily}
        borderRadius={cfg.borderRadius}
        showBranding={cfg.showBranding}
        companyName={cfg.companyName}
        companyLogo={cfg.companyLogo}
        lineColor={cfg.lineColor}
        lineWeight={cfg.lineWeight}
        markerStyle={cfg.markerStyle}
        showWaypoints={cfg.showWaypoints}
        showManeuvers={cfg.showManeuvers}
        showLegBreakdown={cfg.showLegBreakdown}
        width={cfg.width}
        height={cfg.height}
      />
    </div>
  );
}

