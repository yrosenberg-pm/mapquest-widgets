// components/widgets/MapillaryStreetViewShowcase.tsx
// Map + Mapillary: one stage — map is replaced by 360° until the user closes.

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2, Camera, X } from 'lucide-react';
import type { Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import AddressAutocomplete from '../AddressAutocomplete';
import WidgetHeader from './WidgetHeader';
import { geocode, setApiKey } from '@/lib/mapquest';
import { fetchMapillaryImagesNear } from '@/lib/mapillaryClient';

const MAP_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';
const MAPILLARY_KEY = process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN || '';

const DEFAULT_CENTER = { lat: 38.8977, lng: -77.0365 };

type Props = {
  mapquestApiKey?: string;
  mapillaryAccessToken?: string;
  defaultCenter?: { lat: number; lng: number };
  defaultZoom?: number;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
};

export default function MapillaryStreetViewShowcase({
  mapquestApiKey = MAP_KEY,
  mapillaryAccessToken = MAPILLARY_KEY,
  defaultCenter = DEFAULT_CENTER,
  defaultZoom = 14,
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  borderRadius = '0.5rem',
}: Props) {
  useEffect(() => {
    if (mapquestApiKey) setApiKey(mapquestApiKey);
  }, [mapquestApiKey]);

  const [mapillaryTokenFromApi, setMapillaryTokenFromApi] = useState<string | null>(null);
  const [mapillaryTokenReady, setMapillaryTokenReady] = useState(() => !!mapillaryAccessToken);

  useEffect(() => {
    if (mapillaryAccessToken) {
      setMapillaryTokenReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/mapillary/access');
        const j = (await res.json()) as { accessToken?: string; error?: string };
        if (!cancelled && res.ok && j.accessToken) {
          setMapillaryTokenFromApi(j.accessToken);
        }
      } catch {
        /* */
      } finally {
        if (!cancelled) setMapillaryTokenReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapillaryAccessToken]);

  const resolvedMapillaryToken = mapillaryAccessToken || mapillaryTokenFromApi || '';
  const tokenLoading = !mapillaryAccessToken && !mapillaryTokenReady;

  // Preload the Mapillary WebGL bundle after we have a token (while user is on the map).
  useEffect(() => {
    if (!resolvedMapillaryToken) return;
    const t = window.setTimeout(() => {
      void import('mapillary-js');
    }, 300);
    return () => clearTimeout(t);
  }, [resolvedMapillaryToken]);

  const [addressInput, setAddressInput] = useState('');
  const [closeToken, setCloseToken] = useState(0);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(defaultZoom);
  const [stZoom, setStZoom] = useState(defaultZoom);
  const [mapZoomToLocation, setMapZoomToLocation] = useState<
    { lat: number; lng: number; zoom?: number; key?: number } | undefined
  >(undefined);

  const [imageId, setImageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mapZoomState = useRef(14);
  const handleBoundsChange = useCallback((b: { zoom: number }) => {
    mapZoomState.current = b.zoom;
    setStZoom(b.zoom);
  }, []);

  const openStreetView = useCallback(
    async (lat: number, lng: number) => {
      if (tokenLoading) return;
      if (!resolvedMapillaryToken) {
        setErr('Mapillary access token is not configured for this app.');
        return;
      }
      setErr(null);
      setLoading(true);
      try {
        const list = await fetchMapillaryImagesNear(resolvedMapillaryToken, lat, lng);
        if (list.length === 0) {
          setErr('No Mapillary coverage near this point — try a busier road or move the pin slightly.');
          setImageId(null);
          return;
        }
        setImageId(list[0].id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not load street view');
        setImageId(null);
      } finally {
        setLoading(false);
      }
    },
    [resolvedMapillaryToken, tokenLoading]
  );

  const exitStreetView = useCallback(() => {
    setImageId(null);
    setErr(null);
  }, []);

  const handlePegmanDrop = useCallback(
    async (lat: number, lng: number) => {
      if (mapZoomState.current < 16) {
        setErr('Zoom in closer, then drop the camera on a road.');
        return;
      }
      setMapZoomToLocation({ lat, lng, zoom: 18, key: Date.now() });
      await openStreetView(lat, lng);
    },
    [openStreetView]
  );

  const onAddressSelect = useCallback(
    async (item: { displayString: string; lat?: number; lng?: number }) => {
      setCloseToken((t) => t + 1);
      setAddressInput(item.displayString);
      let lat = item.lat;
      let lng = item.lng;
      if (lat == null || lng == null) {
        const g = await geocode(item.displayString, 1);
        if (g) {
          lat = g.lat;
          lng = g.lng;
        }
      }
      if (lat == null || lng == null) {
        setErr('Could not place that address on the map');
        return;
      }
      setMapCenter({ lat, lng });
      setMapZoomToLocation({ lat, lng, zoom: 18, key: Date.now() });
      await openStreetView(lat, lng);
    },
    [openStreetView]
  );

  const border = darkMode ? '#3E5060' : 'var(--border-subtle)';
  const textMain = darkMode ? '#F1F5F9' : 'var(--text-main)';
  const textMuted = darkMode ? '#A8B8CC' : 'var(--text-muted)';
  const buttonMuted = darkMode ? '#94A3B8' : 'var(--text-muted)';
  const bgWidget = darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)';
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const floatBg = darkMode ? 'bg-gray-900/90' : 'bg-white/90';
  const floatRing = darkMode ? 'ring-white/10' : 'ring-black/8';
  const pegDragGhostRef = useRef<HTMLDivElement>(null);

  const inStreetView = Boolean(imageId);
  const showMapChrome = !inStreetView;

  return (
    <div
      className="prism-widget w-full max-w-[min(100%,3500px)]"
      data-streetview="true"
      data-theme={darkMode ? 'dark' : 'light'}
      style={
        {
          fontFamily: fontFamily || 'var(--brand-font)',
          '--brand-primary': accentColor,
          borderRadius: borderRadius || '0.5rem',
        } as React.CSSProperties
      }
    >
      <WidgetHeader
        title="Street View"
        subtitle="Search or drop the camera, then ✕ to return to the map"
        variant="impressive"
        layout="inline"
        size="relaxed"
        icon={<MapPin className="h-6 w-6" strokeWidth={2} />}
      />

      <div
        className="relative w-full min-w-0 border-t border-[var(--border-default)]"
        style={{ minHeight: 'min(82vh, 920px)' }}
      >
        {/* Map stays mounted (hidden while 360° is open) so position is preserved when closing */}
        <div
          className={`absolute inset-0 z-0 min-h-0 min-w-0 transition-opacity duration-200 ${
            inStreetView ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          aria-hidden={inStreetView}
        >
          <MapQuestMap
            className="streetview-showcase-map h-full w-full"
            apiKey={mapquestApiKey}
            center={mapCenter}
            zoom={mapZoom}
            height="100%"
            darkMode={darkMode}
            accentColor={accentColor}
            zoomToLocation={mapZoomToLocation}
            onBoundsChange={handleBoundsChange}
            onMapDrop={handlePegmanDrop}
            mapType={stZoom >= 18 ? 'hybrid' : undefined}
          />
        </div>

        {tokenLoading && (
          <div
            className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'var(--bg-panel)' }}
          >
            <div className="flex flex-col items-center gap-2 p-4 text-center" style={{ color: textMuted }}>
              <Loader2 className="h-7 w-7 animate-spin" style={{ color: accentColor }} />
              <span className="text-sm">Connecting to Mapillary…</span>
            </div>
          </div>
        )}

        {!tokenLoading && !resolvedMapillaryToken && (
          <div
            className="absolute inset-0 z-[100] flex items-center justify-center p-4 text-center text-sm"
            style={{ color: textMuted, background: 'var(--bg-panel)' }}
          >
            <p className="max-w-xs leading-relaxed">
              Add <span className="font-mono text-[10px]">MAPILLARY_ACCESS_TOKEN</span> or{' '}
              <span className="font-mono text-[10px]">NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN</span> in{' '}
              <code className="text-xs">.env.local</code>, then restart the dev server.
            </p>
          </div>
        )}

        {loading && !imageId && (
          <div
            className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.45)' }}
          >
            <div
              className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-lg ${floatBg} ${floatRing} ring-1 backdrop-blur-md`}
              style={{ color: textMain }}
            >
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: accentColor }} />
              <span className="text-sm font-medium">Loading street view…</span>
            </div>
          </div>
        )}

        {showMapChrome && !tokenLoading && resolvedMapillaryToken && (
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-[900] flex justify-start p-3 md:px-4 md:pt-4">
            <div
              className={`pointer-events-auto w-full max-w-md rounded-2xl p-2 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 backdrop-blur-md ${floatBg} ${floatRing}`}
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 [&_input]:min-h-11 [&_input]:text-[15px] [&_input]:leading-snug [&_input]:py-3 [&_input]:!pl-10">
                  <AddressAutocomplete
                    value={addressInput}
                    onChange={setAddressInput}
                    onSelect={onAddressSelect}
                    placeholder="Search address…"
                    darkMode={darkMode}
                    inputBg={inputBg}
                    textColor={textColor}
                    mutedText={darkMode ? 'text-gray-200' : 'text-gray-500'}
                    borderColor={borderColor}
                    closeToken={closeToken}
                    iconClassName="!h-[18px] !w-[18px] !left-3"
                  />
                </div>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', 'pegman');
                    e.dataTransfer.effectAllowed = 'copy';
                    const g = pegDragGhostRef.current;
                    if (g) e.dataTransfer.setDragImage(g, 22, 22);
                  }}
                  className="flex h-11 w-11 flex-shrink-0 cursor-grab items-center justify-center rounded-xl border shadow-sm active:cursor-grabbing"
                  style={{ background: bgWidget, borderColor: border, color: accentColor }}
                  title="Drag onto the map for 360° view"
                >
                  <Camera className="h-5 w-5" strokeWidth={2} />
                </div>
              </div>
            </div>
            <div
              ref={pegDragGhostRef}
              className="pointer-events-none fixed left-0 top-0 flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg"
              style={{ left: -9999, background: `${accentColor}18`, color: accentColor }}
              aria-hidden
            >
              <Camera className="h-5 w-5" strokeWidth={2} />
            </div>
          </div>
        )}

        {err && !inStreetView && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[900] w-[min(100%,20rem)] -translate-x-1/2">
            <div
              className="pointer-events-auto rounded-xl border px-3 py-2.5 text-center text-sm shadow-md"
              style={{
                background: darkMode ? 'rgba(30,20,20,0.95)' : 'rgba(255,250,250,0.95)',
                borderColor: 'var(--color-error, #f87171)',
                color: 'var(--color-error, #b91c1c)',
              }}
            >
              {err}
            </div>
          </div>
        )}

        {inStreetView && imageId && (
          <MapillaryLayer
            token={resolvedMapillaryToken}
            imageId={imageId}
            onClose={exitStreetView}
            loading={loading}
            err={err}
            accentColor={accentColor}
            darkMode={darkMode}
            textMain={textMain}
            border={border}
          />
        )}
      </div>

      {showBranding && (
        <div className="prism-footer">
          {companyLogo && (
            <img
              src={companyLogo}
              alt={companyName || 'Company logo'}
              className="prism-footer-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span className="prism-text-muted" aria-label="Powered by MapQuest">
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by
          </span>
          <MapQuestPoweredLogo darkMode={darkMode} />
        </div>
      )}
    </div>
  );
}

function MapillaryLayer({
  token,
  imageId,
  onClose,
  loading,
  err,
  accentColor,
  darkMode,
  textMain,
  border,
}: {
  token: string;
  imageId: string;
  onClose: () => void;
  loading: boolean;
  err: string | null;
  accentColor: string;
  darkMode: boolean;
  textMain: string;
  border: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const viewerTokenRef = useRef<string | null>(null);

  const requestViewerResize = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    });
  }, []);

  useEffect(() => {
    if (!token || !imageId) {
      if (viewerRef.current) {
        try {
          viewerRef.current.remove();
        } catch {
          /* */
        }
        viewerRef.current = null;
      }
      viewerTokenRef.current = null;
      return;
    }
    if (!hostRef.current) return;

    (async () => {
      // Reuse a single viewer when only imageId changes — recreating the viewer is slow.
      if (viewerRef.current && viewerTokenRef.current === token) {
        try {
          await viewerRef.current.moveTo(imageId);
          requestViewerResize();
        } catch {
          /* */
        }
        return;
      }
      if (viewerRef.current) {
        try {
          viewerRef.current.remove();
        } catch {
          /* */
        }
        viewerRef.current = null;
        viewerTokenRef.current = null;
      }

      const { Viewer, CameraControls, RenderMode } = await import('mapillary-js');
      if (!hostRef.current || !token) return;

      // No imageId in constructor, then moveTo — fully navigable. Do NOT set component.spatial: true
      // (the spatial *data* overlay defaults off and can steal drags from panning the panorama).
      const viewer = new Viewer({
        accessToken: token,
        container: hostRef.current,
        cameraControls: CameraControls.Street,
        combinedPanning: true,
        trackResize: true,
        imageTiling: true,
        renderMode: RenderMode.Fill,
        component: {
          cover: false,
          image: true,
          bearing: true,
          pointer: true,
          direction: true,
          sequence: true,
          keyboard: true,
          zoom: true,
          cache: {
            depth: {
              sequence: 4,
              spherical: 2,
              step: 3,
              turn: 1,
            },
          },
        },
      });
      viewerRef.current = viewer;
      viewerTokenRef.current = token;
      viewer.on('load', () => {
        try {
          viewer.activateCombinedPanning();
        } catch {
          /* */
        }
        requestViewerResize();
      });
      try {
        await viewer.moveTo(imageId);
        requestViewerResize();
      } catch {
        /* */
      }
    })();
  }, [token, imageId, requestViewerResize]);

  useEffect(
    () => () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.remove();
        } catch {
          /* */
        }
        viewerRef.current = null;
      }
      viewerTokenRef.current = null;
    },
    []
  );

  const floatBar = darkMode ? 'bg-gray-900/88' : 'bg-white/90';

  return (
    <div
      className="absolute inset-0 z-50 flex min-h-0 min-w-0 flex-col"
      style={{ background: 'var(--bg-panel)' }}
    >
      <button
        type="button"
        className={`absolute right-2 top-2 z-[70] flex h-11 w-11 items-center justify-center rounded-full shadow-md ring-1 backdrop-blur-sm transition-transform hover:scale-105 active:scale-95 ${floatBar} ring-black/10`}
        style={{ color: textMain }}
        onClick={onClose}
        title="Back to map"
        aria-label="Close street view and return to map"
      >
        <X className="h-6 w-6" strokeWidth={2} />
      </button>

      {err && !loading && (
        <div
          className="absolute left-2 top-14 z-[55] max-h-28 max-w-[min(100%,20rem)] overflow-auto rounded-xl border px-3 py-2 text-left text-sm shadow-md"
          style={{
            right: '3.25rem',
            color: 'var(--color-error, #b91c1c)',
            background: darkMode ? 'rgba(30,20,20,0.95)' : 'rgba(255,250,250,0.95)',
            borderColor: 'var(--color-error, #f87171)',
          }}
        >
          {err}
        </div>
      )}

      {loading && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.35)' }}
        >
          <div
            className={`flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-base shadow-lg ring-1 backdrop-blur-md ${floatBar} ring-black/10`}
            style={{ color: textMain }}
          >
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: accentColor }} />
            <span className="font-medium">Updating…</span>
          </div>
        </div>
      )}

      <div
        ref={hostRef}
        className="mapillary-streetview-host relative z-10 min-h-0 w-full min-w-0 flex-1"
        aria-label="Mapillary 360° street view"
      />
    </div>
  );
}
