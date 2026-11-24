'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  MapPin,
  Search,
} from 'lucide-react';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import MapStylePickerThumbnail from './MapStylePickerThumbnail';
import WidgetHeader from './WidgetHeader';
import { WidgetButton } from './WidgetShell';
import {
  DEFAULT_MAP_STYLE_ID,
  getMapStyleEntry,
  MAP_STYLE_ENTRIES,
  type MapStyleCamera,
  type MapStyleConfigEntry,
} from '@/lib/mapStyles/config';
import {
  auditStyleJson,
  createMapQuestTransformRequest,
  fetchFileStyleForAudit,
  resolveStyleLoadTarget,
} from '@/lib/mapStyles/styleLoader';
import { layoutMapQuestAttribution } from '@/lib/maplibre/attribution';
import { injectMapQuestMapStyles } from '@/lib/maplibre/injectedStyles';
import { registerMaplibreWorker } from '@/lib/maplibre/registerWorker';
import { geocode } from '@/lib/mapquest';
import type { DemoMapProps } from '@/lib/demo/mapDefaults';
import { prismWidgetThemeProps } from '@/lib/widgetShellTheme';
import { Map as MaplibreMap, NavigationControl, type ErrorEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapStylesWidgetProps extends DemoMapProps {
  apiKey: string;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  onStyleSelectionChange?: (entry: MapStyleConfigEntry) => void;
}

const STYLE_STRIP_SCROLL_PX = 172;

function flyToShowcase(map: MaplibreMap, camera: MapStyleCamera) {
  map.flyTo({
    center: [camera.lng, camera.lat],
    zoom: camera.zoom,
    pitch: camera.pitch ?? 0,
    bearing: camera.bearing ?? 0,
    duration: 1200,
    essential: false,
  });
}

export default function MapStylesWidget({
  apiKey,
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  onStyleSelectionChange,
}: MapStylesWidgetProps) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const styleStripRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const pendingStyleIdRef = useRef<string>(DEFAULT_MAP_STYLE_ID);
  const keepViewRef = useRef(false);
  const darkModeRef = useRef(darkMode);
  const showBrandingRef = useRef(showBranding);
  const lastStyleUrlRef = useRef<string | null>(null);
  const skipNextStyleApplyRef = useRef(true);
  darkModeRef.current = darkMode;
  showBrandingRef.current = showBranding;

  const [selectedId, setSelectedId] = useState(DEFAULT_MAP_STYLE_ID);
  const [keepView, setKeepView] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [canScrollStylesLeft, setCanScrollStylesLeft] = useState(false);
  const [canScrollStylesRight, setCanScrollStylesRight] = useState(false);

  keepViewRef.current = keepView;

  const updateStyleStripScroll = useCallback(() => {
    const el = styleStripRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const overflow = maxScroll > 4;
    setCanScrollStylesLeft(overflow && el.scrollLeft > 4);
    setCanScrollStylesRight(overflow && el.scrollLeft < maxScroll - 4);
  }, []);

  const scrollStyleStrip = useCallback((direction: 'left' | 'right') => {
    const el = styleStripRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -STYLE_STRIP_SCROLL_PX : STYLE_STRIP_SCROLL_PX;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = styleStripRef.current;
    if (!el) return;

    updateStyleStripScroll();

    const onScroll = () => updateStyleStripScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateStyleStripScroll);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateStyleStripScroll) : null;
    ro?.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateStyleStripScroll);
      ro?.disconnect();
    };
  }, [updateStyleStripScroll]);

  useEffect(() => {
    const strip = styleStripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>(`[data-style-id="${selectedId}"]`);
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    window.requestAnimationFrame(updateStyleStripScroll);
  }, [selectedId, updateStyleStripScroll]);

  const selectedEntry = useMemo(
    () => getMapStyleEntry(selectedId) ?? MAP_STYLE_ENTRIES[0],
    [selectedId],
  );

  useEffect(() => {
    onStyleSelectionChange?.(selectedEntry);
  }, [selectedEntry, onStyleSelectionChange]);

  const enableMapInteractions = useCallback((map: MaplibreMap) => {
    try {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
      map.keyboard.enable();
      map.dragRotate.disable();
      const container = map.getCanvasContainer();
      if (container) {
        container.style.pointerEvents = 'auto';
        container.classList.add('maplibregl-interactive');
      }
      const canvas = map.getCanvas();
      if (canvas) canvas.style.pointerEvents = 'auto';
    } catch {
      /* style may still be loading */
    }
  }, []);

  const finishStyleApply = useCallback(
    async (
      map: MaplibreMap,
      entry: MapStyleConfigEntry,
      styleUrl: string,
      opts?: { flyToShowcase?: boolean },
    ) => {
      setStyleLoading(false);
      layoutMapQuestAttribution(map, darkModeRef.current, { visible: showBrandingRef.current });
      enableMapInteractions(map);
      map.resize();
      if (entry.styleRef.kind === 'file') {
        const json = await fetchFileStyleForAudit(styleUrl);
        if (json) auditStyleJson(json, entry.name);
      }
      const shouldFly = opts?.flyToShowcase !== false && !keepViewRef.current;
      if (shouldFly) {
        flyToShowcase(map, entry.showcase);
      }
    },
    [enableMapInteractions],
  );

  const applyStyle = useCallback(
    (map: MaplibreMap, styleId: string) => {
      const entry = getMapStyleEntry(styleId) ?? MAP_STYLE_ENTRIES[0];
      if (entry.styleRef.kind === 'hosted' && !apiKey) {
        setStyleError('Add a MapQuest API key to load hosted vector styles.');
        setStyleLoading(false);
        return;
      }
      setStyleError(null);
      pendingStyleIdRef.current = styleId;
      const styleUrl = resolveStyleLoadTarget(entry, apiKey);

      if (lastStyleUrlRef.current === styleUrl) {
        void finishStyleApply(map, entry, styleUrl, { flyToShowcase: false });
        return;
      }
      lastStyleUrlRef.current = styleUrl;
      setStyleLoading(true);

      const onStyleReady = () => {
        if (pendingStyleIdRef.current !== styleId) return;
        void finishStyleApply(map, entry, styleUrl);
      };

      map.once('style.load', onStyleReady);
      map.setStyle(styleUrl, { diff: false });
    },
    [apiKey, finishStyleApply],
  );

  useEffect(() => {
    const host = mapHostRef.current;
    if (!host) return;

    if (!apiKey?.trim()) {
      setStyleError('MapQuest API key is required to load hosted vector styles.');
      setMapReady(false);
      setStyleLoading(false);
      return;
    }

    registerMaplibreWorker();
    injectMapQuestMapStyles();

    let disposed = false;
    const initial = getMapStyleEntry(DEFAULT_MAP_STYLE_ID) ?? MAP_STYLE_ENTRIES[0];
    const initialUrl = resolveStyleLoadTarget(initial, apiKey);
    lastStyleUrlRef.current = initialUrl;
    skipNextStyleApplyRef.current = true;

    const map = new MaplibreMap({
      container: host,
      style: initialUrl,
      center: [initial.showcase.lng, initial.showcase.lat],
      zoom: initial.showcase.zoom,
      pitch: initial.showcase.pitch ?? 0,
      bearing: initial.showcase.bearing ?? 0,
      fadeDuration: 0,
      attributionControl: false,
      interactive: true,
      dragPan: true,
      scrollZoom: true,
      boxZoom: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
      dragRotate: false,
      transformRequest: createMapQuestTransformRequest(apiKey),
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    enableMapInteractions(map);
    const onStyleLoad = () => enableMapInteractions(map);
    map.on('style.load', onStyleLoad);

    mapRef.current = map;
    setMapReady(true);

    const bumpResize = () => {
      window.requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          /* ignore */
        }
      });
    };

    const onLoad = () => {
      if (disposed) return;
      layoutMapQuestAttribution(map, darkModeRef.current, { visible: showBrandingRef.current });
      enableMapInteractions(map);
      setStyleLoading(false);
      setStyleError(null);
      bumpResize();
      window.setTimeout(bumpResize, 100);
      window.setTimeout(bumpResize, 400);
    };

    const onIdle = () => {
      if (disposed) return;
      setStyleLoading(false);
    };

    const onError = (e: ErrorEvent) => {
      if (disposed) return;
      const err = e.error;
      const msg =
        (err && 'message' in err && typeof err.message === 'string' && err.message) ||
        'Map failed to load tiles or style.';
      setStyleError(msg);
      setStyleLoading(false);
    };

    map.on('load', onLoad);
    map.on('idle', onIdle);
    map.on('error', onError);
    if (map.loaded()) onLoad();
    bumpResize();

    return () => {
      disposed = true;
      map.off('style.load', onStyleLoad);
      map.off('load', onLoad);
      map.off('idle', onIdle);
      map.off('error', onError);
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey, enableMapInteractions]);

  const applyStyleRef = useRef(applyStyle);
  applyStyleRef.current = applyStyle;

  useEffect(() => {
    const host = mapHostRef.current;
    if (!host || !mapReady) return;
    const resize = () => mapRef.current?.resize();
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(host);
    window.addEventListener('resize', resize);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (skipNextStyleApplyRef.current) {
      skipNextStyleApplyRef.current = false;
      return;
    }
    applyStyleRef.current(mapRef.current, selectedId);
  }, [selectedId, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    layoutMapQuestAttribution(mapRef.current, darkMode, { visible: showBranding });
    const container = mapRef.current.getContainer();
    if (darkMode) container.classList.add('dark-map');
    else container.classList.remove('dark-map');
  }, [darkMode, mapReady, showBranding]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchError(null);
    setSearching(true);
    try {
      const result = await geocode(q, 1);
      if (!result?.lat || !result?.lng) {
        setSearchError('No results for that address. Try a more specific search.');
        return;
      }
      mapRef.current?.flyTo({
        center: [result.lng, result.lat],
        zoom: 15,
        duration: 1200,
        essential: false,
      });
    } catch {
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  return (
    <div
      className="prism-widget w-full max-w-[1120px] min-w-0"
      {...prismWidgetThemeProps(darkMode)}
      style={{ fontFamily: fontFamily || 'var(--brand-font)', '--brand-primary': accentColor } as React.CSSProperties}
    >
      <WidgetHeader
        title="Map Styles"
        subtitle="Explore MapQuest vector basemap styles"
        variant="impressive"
        layout="inline"
        icon={<Layers className="w-4 h-4" />}
      />

      <div
        className="flex flex-col min-h-0"
        style={{ height: 'min(720px, max(380px, calc(100svh - 11rem)))' }}
      >
        <div className="relative flex-1 min-h-[260px] w-full overflow-hidden isolate">
          <div
            ref={mapHostRef}
            className="absolute inset-0 z-0 h-full w-full [&_.maplibregl-map]:!h-full [&_.maplibregl-map]:!w-full [&_.maplibregl-canvas-container.maplibregl-interactive]:!cursor-grab active:[&_.maplibregl-canvas-container.maplibregl-interactive]:!cursor-grabbing"
            style={{
              background: darkMode ? '#1a1a2e' : '#e8eaed',
              touchAction: 'none',
            }}
            aria-label="Map preview"
          />

          <div className="absolute inset-0 z-[1] pointer-events-none">
            {styleLoading && (
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs shadow-md"
                style={{
                  background: 'var(--bg-widget)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: accentColor }} aria-hidden />
                Loading style…
              </div>
            )}

            {!apiKey?.trim() && (
              <div
                className="pointer-events-auto absolute inset-0 flex items-center justify-center p-6 text-center text-sm"
                style={{ color: 'var(--text-muted)', background: 'var(--bg-panel)' }}
                role="status"
              >
                Add a valid MapQuest API key (NEXT_PUBLIC_MAPQUEST_API_KEY) to load Light and Dark vector styles.
              </div>
            )}

            {/* Search */}
            <div className="pointer-events-auto absolute top-3 left-3 right-3 md:right-auto md:w-[min(420px,92%)]">
          <div
            className="prism-panel-floating flex items-center gap-2 p-2"
            style={{ padding: '8px 10px' }}
          >
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} aria-hidden />
            <AddressAutocomplete
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v);
                setSearchError(null);
              }}
              onSelect={(r) => {
                setSearchQuery(r.displayString);
                if (r.lat != null && r.lng != null) {
                  mapRef.current?.flyTo({
                    center: [r.lng, r.lat],
                    zoom: 15,
                    duration: 1200,
                    essential: false,
                  });
                }
              }}
              onEnter={handleSearch}
              placeholder="Search an address…"
              darkMode={darkMode}
              hideIcon
              className="flex-1 min-w-0"
            />
            <WidgetButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              aria-label="Go to address"
              icon
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            </WidgetButton>
          </div>
          {searchError && (
            <p className="mt-1 text-xs px-2" style={{ color: 'var(--color-error)' }} role="alert">
              {searchError}
            </p>
          )}
        </div>

            {/* Keep view — top-right, left of MapLibre zoom (~10px + 32px control) */}
            <div className="pointer-events-auto absolute top-3 right-14 flex flex-col items-end gap-2 max-w-[min(240px,calc(100%-6rem))]">
          <label
            className="prism-panel-floating flex items-center gap-2 text-xs cursor-pointer select-none"
            style={{ padding: '8px 12px', color: 'var(--text-main)' }}
          >
            <input
              type="checkbox"
              checked={keepView}
              onChange={(e) => setKeepView(e.target.checked)}
              className="rounded border"
              style={{ accentColor }}
            />
            Keep my view
          </label>
          {styleError && (
            <div
              className="flex items-start gap-2 p-2 rounded-lg text-xs max-w-full"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}
              role="alert"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
              <span>{styleError}</span>
            </div>
          )}
            </div>
          </div>
        </div>

        {/* Style cards */}
        <div
          className="relative flex-shrink-0 z-20"
          style={{
            borderTop: `1px solid ${darkMode ? 'var(--border-default)' : 'var(--border-subtle)'}`,
            background: darkMode ? 'var(--bg-widget)' : 'rgba(255,255,255,0.95)',
          }}
        >
          {canScrollStylesLeft && (
            <button
              type="button"
              aria-label="Scroll styles left"
              onClick={() => scrollStyleStrip('left')}
              className="absolute left-1 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              style={{
                background: 'var(--bg-widget)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
              }}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
          )}
          {canScrollStylesRight && (
            <button
              type="button"
              aria-label="Scroll styles right"
              onClick={() => scrollStyleStrip('right')}
              className="absolute right-1 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              style={{
                background: 'var(--bg-widget)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
              }}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          )}

          <div
            ref={styleStripRef}
            className="flex gap-2 overflow-x-auto scroll-smooth p-3 prism-scrollbar"
            role="listbox"
            aria-label="Map styles"
            style={{
              paddingLeft: canScrollStylesLeft ? '2.25rem' : undefined,
              paddingRight: canScrollStylesRight ? '2.25rem' : undefined,
            }}
          >
            {MAP_STYLE_ENTRIES.map((entry) => {
              const active = entry.id === selectedId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-style-id={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className="flex-shrink-0 w-[min(148px,38vw)] text-left rounded-xl transition-all focus:outline-none focus-visible:ring-2"
                  style={{
                    border: `2px solid ${active ? accentColor : 'var(--border-subtle)'}`,
                    background: active ? `${accentColor}14` : 'var(--bg-panel)',
                    padding: '8px',
                  }}
                >
                  <div className="mb-2">
                    {entry.thumbnail ? (
                      <img
                        src={entry.thumbnail}
                        alt=""
                        className="w-full h-14 rounded-lg object-cover"
                        style={{
                          border: `1px solid ${active ? accentColor : 'var(--border-subtle)'}`,
                        }}
                      />
                    ) : (
                      <MapStylePickerThumbnail
                        entry={entry}
                        apiKey={apiKey}
                        active={active}
                        accentColor={accentColor}
                      />
                    )}
                  </div>
                  <span
                    className="text-xs font-semibold block leading-snug"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {entry.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showBranding && (
        <div
          className="prism-footer flex items-center justify-center gap-2 py-2 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {companyLogo && (
            <img src={companyLogo} alt="" className="h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          {companyName && <span style={{ fontWeight: 500 }}>{companyName} · </span>}
          <span>Powered by</span>
          <MapQuestPoweredLogo darkMode={darkMode} />
        </div>
      )}
    </div>
  );
}