'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';

type Props = {
  imageId: string;
  accentColor: string;
  darkMode: boolean;
  onClose: () => void;
};

/**
 * Mapillary street-level viewer. Requires a valid image id and access token
 * (fetched from /api/mapillary/access for MapillaryJS).
 */
export default function MapillaryViewerPanel({ imageId, accentColor, darkMode, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!imageId) return;
    let cancelled = false;
    (async () => {
      setErr(null);
      setReady(false);
      try {
        const res = await fetch('/api/mapillary/access');
        const j = (await res.json()) as { accessToken?: string; error?: string };
        if (!res.ok) throw new Error(j.error || 'No access token');
        const accessToken = j.accessToken;
        if (!accessToken) throw new Error('No access token');

        if (cancelled || !hostRef.current) return;

        if (viewerRef.current) {
          try {
            viewerRef.current.remove();
          } catch {
            /* ignore */
          }
          viewerRef.current = null;
        }

        const viewer = new Viewer({
          accessToken,
          container: hostRef.current,
          imageId,
        });
        viewerRef.current = viewer;
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Failed to open street view');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try {
          viewerRef.current.remove();
        } catch {
          /* ignore */
        }
        viewerRef.current = null;
      }
    };
  }, [imageId]);

  return (
    <div
      className="absolute inset-0 z-[800] flex flex-col pointer-events-auto"
      style={{ background: darkMode ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{
          background: 'var(--bg-panel, #1e293b)',
          borderBottom: '1px solid var(--border-subtle, #334155)',
        }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-main, #f8fafc)' }}>
          Street view
        </span>
        <div className="flex items-center gap-2">
          {!ready && !err && <Loader2 className="w-4 h-4 animate-spin" style={{ color: accentColor }} />}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:opacity-80"
            style={{ color: 'var(--text-muted, #94a3b8)' }}
            title="Close"
            aria-label="Close street view"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {err && (
        <div className="p-3 text-xs text-center" style={{ color: 'var(--color-error, #f87171)' }}>
          {err}
        </div>
      )}
      <div
        ref={hostRef}
        className="flex-1 min-h-0 w-full"
        style={{ minHeight: 200 }}
        aria-label="Street view"
      />
    </div>
  );
}
