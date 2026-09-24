'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Layers,
  Loader2,
  Monitor,
  Route,
  Settings,
  Smartphone,
  Tablet,
  Trash2,
} from 'lucide-react';
import WidgetHeader from './WidgetHeader';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import DevicePreviewFrame, { type DevicePreviewKind } from './DevicePreviewFrame';
import {
  DEFAULT_CLUSTER_METRO,
  DEMO_METROS,
  getClusterDemoStops,
  pickRouteStops,
  type ClusterDemoStop,
} from '@/lib/hereClusterDemoStops';
import { decodeHereFlexiblePolyline } from '@/lib/hereFlexiblePolyline';
import { markerPinColorForIndex } from '@/lib/mapMarkerIcons';
import {
  boundsForExpandedCluster,
  boundsForRouteWithSurroundingPins,
  boundsFromPoints,
  buildClusterMapMarkers,
  largeNumberedPinIconUrl,
  type ClusterMapMarker,
} from '@/lib/clusterMapMarkers';

const mapQuestApiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

const POINT_COUNTS = [250, 1000, 5000, 20000] as const;
const METRO_ZOOM = 11;
const REGIONAL_ZOOM = 6;
const NATIONWIDE_CENTER = { lat: 39.5, lng: -98.35 };
const NATIONWIDE_ZOOM = 4;
const CLUSTER_EXPAND_MIN_ZOOM = 9;
/** Clusters this size or smaller dissolve into individual/spider pins on click. */
const CLUSTER_FULL_EXPAND_MAX = 10;
/** Clusters at or above this size zoom in steps so sub-clusters can unfold. */
const CLUSTER_INCREMENTAL_MIN = 25;
const CLUSTER_MAX_ZOOM = 18;
const CLUSTER_ZOOM_STEP = 2;
const MAP_ZOOM_DURATION_MS = 400;
const DEFAULT_CLUSTER_RADIUS_PX = 40;
const DEFAULT_MIN_CLUSTER_SIZE = 5;
const MAX_CLUSTER_ZOOM_MOBILE = 12;
const MAX_CLUSTER_ZOOM_DESKTOP = 12;
const CLUSTER_REBUILD_DEBOUNCE_MS = 80;

type MapViewPreset = 'metro' | 'regional' | 'nationwide';
type DevicePreviewMode = 'desktop' | DevicePreviewKind;

function metersToMiles(m: number) {
  return m * 0.000621371;
}

function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} hr ${rem} min` : `${h} hr`;
}

export interface HereClusterRouteDemoProps {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
}

export default function HereClusterRouteDemo({
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: HereClusterRouteDemoProps) {
  const [pointCount, setPointCount] = useState<number>(1000);
  const [eps, setEps] = useState(DEFAULT_CLUSTER_RADIUS_PX);
  const [minWeight, setMinWeight] = useState(DEFAULT_MIN_CLUSTER_SIZE);
  const [routeStopCount, setRouteStopCount] = useState(10);
  const [viewMetroId, setViewMetroId] = useState(DEFAULT_CLUSTER_METRO.id);
  const [devicePreview, setDevicePreview] = useState<DevicePreviewMode>('desktop');
  const [mapViewPreset, setMapViewPreset] = useState<MapViewPreset>('metro');
  const [zoomLevel, setZoomLevel] = useState(METRO_ZOOM);
  const [mapBounds, setMapBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);
  const [rebuildMs, setRebuildMs] = useState<number | null>(null);
  const [routeActive, setRouteActive] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<{
    stopCount: number;
    distanceMiles: number;
    durationSec: number;
  } | null>(null);
  const [selectedStop, setSelectedStop] = useState<{
    order: number;
    lat: number;
    lng: number;
  } | null>(null);
  const [clusterMarkers, setClusterMarkers] = useState<ClusterMapMarker[]>([]);
  const [routeMarkers, setRouteMarkers] = useState<ClusterMapMarker[]>([]);
  const [routePolyline, setRoutePolyline] = useState<Array<{ lat: number; lng: number }> | undefined>();
  const [fitBounds, setFitBounds] = useState<
    | {
        north: number;
        south: number;
        east: number;
        west: number;
        maxZoom?: number;
        durationMs?: number;
      }
    | undefined
  >();
  const [flyToView, setFlyToView] = useState<{
    lat: number;
    lng: number;
    zoom: number;
    durationMs?: number;
    key: number;
  }>(() => ({
    lat: DEFAULT_CLUSTER_METRO.lat,
    lng: DEFAULT_CLUSTER_METRO.lng,
    zoom: METRO_ZOOM,
    key: 1,
  }));
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [showBackgroundClusters, setShowBackgroundClusters] = useState(true);
  const [showRouteStopPins, setShowRouteStopPins] = useState(true);
  const [routeStopIds, setRouteStopIds] = useState<Set<string>>(() => new Set());
  const [expandedSpiderGroups, setExpandedSpiderGroups] = useState<ClusterDemoStop[][]>([]);

  const stopsRef = useRef<ClusterDemoStop[]>([]);
  const mobileControlsRef = useRef<HTMLDivElement>(null);
  const clusterRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewMetro = useMemo(
    () => DEMO_METROS.find((m) => m.id === viewMetroId) ?? DEFAULT_CLUSTER_METRO,
    [viewMetroId],
  );

  const flyTo = useCallback((lat: number, lng: number, zoom: number) => {
    setFlyToView({
      lat,
      lng,
      zoom,
      durationMs: MAP_ZOOM_DURATION_MS,
      key: Date.now(),
    });
  }, []);

  const expandClusterFully = useCallback(
    (members: ClusterDemoStop[]) => {
      setExpandedSpiderGroups((prev) => {
        const expandedIds = new Set(prev.flatMap((g) => g.map((s) => s.id)));
        if (members.every((m) => expandedIds.has(m.id))) return prev;
        return [...prev, members];
      });
      setFitBounds({
        ...boundsForExpandedCluster(members, Math.max(zoomLevel, 16)),
        maxZoom: CLUSTER_MAX_ZOOM,
        durationMs: MAP_ZOOM_DURATION_MS,
      });
    },
    [zoomLevel],
  );

  const handleClusterTap = useCallback(
    (weight: number, lat: number, lng: number, members: ClusterDemoStop[]) => {
      setFitBounds(undefined);

      const atMaxZoom = zoomLevel >= CLUSTER_MAX_ZOOM - 0.5;
      const shouldFullyExpand =
        weight <= CLUSTER_FULL_EXPAND_MAX ||
        (atMaxZoom && weight < CLUSTER_INCREMENTAL_MIN);

      if (shouldFullyExpand) {
        expandClusterFully(members);
        return;
      }

      const nextZoom = Math.min(CLUSTER_MAX_ZOOM, Math.floor(zoomLevel) + CLUSTER_ZOOM_STEP);
      flyTo(lat, lng, nextZoom);
    },
    [zoomLevel, expandClusterFully, flyTo],
  );

  const goToViewPreset = useCallback(
    (preset: MapViewPreset, metro = viewMetro) => {
      setFitBounds(undefined);
      setMapViewPreset(preset);
      if (preset === 'nationwide') {
        flyTo(NATIONWIDE_CENTER.lat, NATIONWIDE_CENTER.lng, NATIONWIDE_ZOOM);
        return;
      }
      if (preset === 'regional') {
        flyTo(NATIONWIDE_CENTER.lat, NATIONWIDE_CENTER.lng, REGIONAL_ZOOM);
        return;
      }
      flyTo(metro.lat, metro.lng, METRO_ZOOM);
    },
    [viewMetro, flyTo],
  );

  const stops = useMemo(() => getClusterDemoStops(pointCount), [pointCount]);

  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);

  useEffect(() => {
    setExpandedSpiderGroups([]);
  }, [viewMetroId, mapViewPreset, pointCount]);

  useEffect(() => {
    if (zoomLevel >= CLUSTER_EXPAND_MIN_ZOOM) return;
    setExpandedSpiderGroups([]);
  }, [zoomLevel]);

  useEffect(() => {
    setMobileControlsOpen(false);
  }, [devicePreview]);

  useEffect(() => {
    if (!mobileControlsOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (mobileControlsRef.current?.contains(e.target as Node)) return;
      setMobileControlsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [mobileControlsOpen]);

  const clusterSourceStops = useMemo(() => {
    if (!routeActive || routeStopIds.size === 0) return stops;
    // Keep every pin in the dataset; only drop route-stop locations (numbered pins cover those).
    return stops.filter((s) => !routeStopIds.has(s.id));
  }, [stops, routeActive, routeStopIds]);

  const isMobilePreview = devicePreview === 'iphone' || devicePreview === 'ipad';
  const maxClusterZoom = isMobilePreview ? MAX_CLUSTER_ZOOM_MOBILE : MAX_CLUSTER_ZOOM_DESKTOP;

  useEffect(() => {
    if (clusterRebuildTimerRef.current) clearTimeout(clusterRebuildTimerRef.current);
    clusterRebuildTimerRef.current = setTimeout(() => {
      const t0 = performance.now();
      const markers = buildClusterMapMarkers({
        stops: clusterSourceStops,
        zoom: zoomLevel,
        eps,
        minWeight,
        accentColor,
        onClusterTap: handleClusterTap,
        spiderGroups: expandedSpiderGroups,
        maxClusterZoom,
        viewportBounds: mapBounds,
      });
      setClusterMarkers(markers);
      setRebuildMs(Math.round(performance.now() - t0));
    }, CLUSTER_REBUILD_DEBOUNCE_MS);
    return () => {
      if (clusterRebuildTimerRef.current) clearTimeout(clusterRebuildTimerRef.current);
    };
  }, [
    clusterSourceStops,
    zoomLevel,
    eps,
    minWeight,
    routeActive,
    accentColor,
    handleClusterTap,
    expandedSpiderGroups,
    maxClusterZoom,
    mapBounds,
  ]);

  const mapMarkers = useMemo(() => {
    if (!routeActive) return clusterMarkers;

    const background = showBackgroundClusters
      ? clusterMarkers.map((m) => ({
          ...m,
          iconOpacity: 0.92,
          zIndexOffset: 350,
        }))
      : [];

    const route = showRouteStopPins
      ? routeMarkers.map((m) => ({
          ...m,
          zIndexOffset: 900,
        }))
      : [];

    if (background.length === 0 && route.length === 0) return [];
    return [...background, ...route];
  }, [routeActive, showBackgroundClusters, showRouteStopPins, clusterMarkers, routeMarkers]);

  const clearRoute = useCallback(() => {
    setRouteActive(false);
    setRouteMetrics(null);
    setSelectedStop(null);
    setRouteMarkers([]);
    setRoutePolyline(undefined);
    setRouteStopIds(new Set());
    setShowBackgroundClusters(true);
    setShowRouteStopPins(true);
    setExpandedSpiderGroups([]);
    setFitBounds(undefined);
    setRouteError(null);
    goToViewPreset(mapViewPreset, viewMetro);
  }, [goToViewPreset, mapViewPreset, viewMetro]);

  const handleGenerateRoute = async () => {
    if (routeLoading) return;

    setRouteError(null);
    setRouteLoading(true);
    setSelectedStop(null);

    try {
      const picked = pickRouteStops(stopsRef.current, routeStopCount, viewMetroId);
      if (!picked) {
        setRouteError('Could not pick enough stops from one metro.');
        return;
      }

      const routeStops = picked.stops;
      const params = new URLSearchParams({
        endpoint: 'routes',
        origin: `${routeStops[0].lat},${routeStops[0].lng}`,
        destination: `${routeStops[routeStops.length - 1].lat},${routeStops[routeStops.length - 1].lng}`,
        transportMode: 'car',
      });
      for (let i = 1; i < routeStops.length - 1; i++) {
        params.append('via', `${routeStops[i].lat},${routeStops[i].lng}`);
      }

      const res = await fetch(`/api/here?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Routing failed (${res.status})`);
      }
      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route?.sections?.length) throw new Error('No route returned');

      const shapeChunks: Array<Array<{ lat: number; lng: number }>> = [];
      let distanceMeters = 0;
      let durationSec = 0;
      for (const section of route.sections) {
        if (section.summary?.length) distanceMeters += section.summary.length;
        if (section.summary?.duration) durationSec += section.summary.duration;
        if (typeof section.polyline === 'string') {
          try {
            shapeChunks.push(
              decodeHereFlexiblePolyline(section.polyline).points.map((p) => ({
                lat: p.lat,
                lng: p.lng,
              })),
            );
          } catch {
            /* skip */
          }
        }
      }

      const polylinePoints = shapeChunks.flat();
      if (!polylinePoints.length) throw new Error('Route has no geometry');

      const numbered: ClusterMapMarker[] = routeStops.map((stop, idx) => {
        const color = markerPinColorForIndex(idx, routeStops.length);
        const label = String(idx + 1);
        return {
          lat: stop.lat,
          lng: stop.lng,
          iconUrl: largeNumberedPinIconUrl(label, color),
          iconSize: [36, 46] as [number, number],
          iconAnchor: [18, 46] as [number, number],
          iconCircular: false,
          clusterable: false,
          onClick: () => {
            setSelectedStop({ order: idx + 1, lat: stop.lat, lng: stop.lng });
            console.log('[Route stop]', idx + 1, stop.lat, stop.lng);
          },
        };
      });

      const surroundingStops = stopsRef.current.filter((s) => s.metroId === viewMetroId);

      setRouteStopIds(new Set(routeStops.map((s) => s.id)));
      setRouteMarkers(numbered);
      setRoutePolyline(polylinePoints);
      setRouteActive(true);
      setShowBackgroundClusters(true);
      setShowRouteStopPins(true);
      setRouteMetrics({
        stopCount: routeStops.length,
        distanceMiles: metersToMiles(distanceMeters),
        durationSec,
      });
      setFitBounds({
        ...boundsForRouteWithSurroundingPins(polylinePoints, surroundingStops),
        maxZoom: 14,
        durationMs: MAP_ZOOM_DURATION_MS,
      });
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : 'Route generation failed');
    } finally {
      setRouteLoading(false);
    }
  };

  const handleClearRoute = () => {
    clearRoute();
  };

  const controlsDisabled = routeLoading;
  const isDevicePreview = isMobilePreview;

  const shellClass = isDevicePreview
    ? 'prism-widget w-full max-w-full'
    : 'prism-widget w-full md:w-[1200px]';

  const bodyClass = isDevicePreview
    ? 'flex flex-col flex-1 min-h-0'
    : 'flex flex-col md:flex-row md:h-[747px]';

  const mapWrapClass = isDevicePreview
    ? 'flex-1 relative min-h-0 min-w-0'
    : 'h-[400px] md:h-auto md:flex-1 md:order-2 relative';

  const mapKey = devicePreview;

  const previewToggle = (
    <div
      className="px-5 pt-5 pb-6 border-b"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <label
        className="block text-xs font-medium mb-4 tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        Device preview
      </label>
      <div className="flex flex-wrap gap-3">
        {(
          [
            { id: 'desktop' as const, label: 'Desktop', icon: Monitor },
            { id: 'iphone' as const, label: 'iPhone', icon: Smartphone },
            { id: 'ipad' as const, label: 'iPad', icon: Tablet },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = devicePreview === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setDevicePreview(id)}
              className="flex-1 min-w-[6.5rem] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors hover:opacity-80"
              style={{
                background: active ? accentColor : 'var(--bg-panel)',
                color: active ? 'white' : 'var(--text-muted)',
                border: `2px solid ${active ? accentColor : 'var(--border-subtle)'}`,
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const clusterControls = (
    <>
      <div className="mb-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Focus metro
        </label>
        <select
          value={viewMetroId}
          disabled={controlsDisabled}
          onChange={(e) => {
            const id = e.target.value;
            setViewMetroId(id);
            const metro = DEMO_METROS.find((m) => m.id === id) ?? DEFAULT_CLUSTER_METRO;
            goToViewPreset(mapViewPreset === 'nationwide' ? 'metro' : mapViewPreset, metro);
          }}
          className="prism-input w-full"
          style={{ height: '36px' }}
        >
          {DEMO_METROS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Map view
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'metro' as const, label: 'Metro' },
              { id: 'regional' as const, label: 'Regional' },
              { id: 'nationwide' as const, label: 'Nationwide' },
            ] as const
          ).map(({ id, label }) => {
            const active = mapViewPreset === id;
            return (
              <button
                key={id}
                type="button"
                disabled={controlsDisabled}
                onClick={() => goToViewPreset(id)}
                className="flex-1 min-w-[4.5rem] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-40"
                style={{
                  background: active ? accentColor : 'var(--bg-panel)',
                  color: active ? 'white' : 'var(--text-muted)',
                  border: `2px solid ${active ? accentColor : 'var(--border-subtle)'}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {!isDevicePreview && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Small clusters (≤10) expand fully on click; larger ones zoom in two levels at a time.
          </p>
        )}
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Point count
        </label>
        <div className="flex flex-wrap gap-1.5">
          {POINT_COUNTS.map((n) => {
            const active = pointCount === n;
            return (
              <button
                key={n}
                type="button"
                disabled={controlsDisabled}
                onClick={() => setPointCount(n)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-40"
                style={{
                  background: active ? accentColor : 'var(--bg-panel)',
                  color: active ? 'white' : 'var(--text-muted)',
                  border: `2px solid ${active ? accentColor : 'var(--border-subtle)'}`,
                }}
              >
                {n >= 1000 ? `${n / 1000}k` : n}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Cluster radius (px): {eps}
        </label>
        <input
          type="range"
          min={8}
          max={128}
          step={4}
          value={eps}
          disabled={controlsDisabled}
          onChange={(e) => setEps(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Min cluster size: {minWeight}
        </label>
        <input
          type="range"
          min={2}
          max={10}
          step={1}
          value={minWeight}
          disabled={controlsDisabled}
          onChange={(e) => setMinWeight(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div
        className="mb-3 p-3 rounded-xl text-xs space-y-1"
        style={{ background: 'var(--bg-panel)', color: 'var(--text-muted)' }}
      >
        <div>Pins loaded: {stops.length.toLocaleString()}</div>
        <div>Map markers: {clusterMarkers.length.toLocaleString()}</div>
        <div>Zoom: {zoomLevel.toFixed(1)}</div>
        {rebuildMs != null && <div>Last rebuild: {rebuildMs} ms</div>}
        {routeMetrics && (
          <>
            <div>Route stops: {routeMetrics.stopCount}</div>
            <div>Distance: {routeMetrics.distanceMiles.toFixed(1)} mi</div>
            <div>Duration: {formatDuration(routeMetrics.durationSec)}</div>
          </>
        )}
        {selectedStop && (
          <div style={{ color: 'var(--text-main)' }}>
            Stop {selectedStop.order}: {selectedStop.lat.toFixed(5)}, {selectedStop.lng.toFixed(5)}
          </div>
        )}
      </div>

      <div className="mb-1 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Route stops: {routeStopCount}
        </label>
        <input
          type="range"
          min={5}
          max={25}
          step={1}
          value={routeStopCount}
          disabled={routeLoading}
          onChange={(e) => setRouteStopCount(Number(e.target.value))}
          className="w-full mb-2"
        />

        {routeError && (
          <div
            className="mb-2 p-2.5 rounded-lg text-xs flex items-start gap-2"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{routeError}</span>
          </div>
        )}

        {!routeActive ? (
          <button
            type="button"
            disabled={routeLoading}
            onClick={handleGenerateRoute}
            className="prism-btn prism-btn-primary w-full hover:brightness-110 transition-all"
            style={{
              background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
              boxShadow: `0 4px 12px ${accentColor}40`,
            }}
          >
            {routeLoading ? (
              <>
                <Loader2 className="w-4 h-4 prism-spinner" /> Generating…
              </>
            ) : (
              <>
                <Route className="w-4 h-4" /> Generate route
              </>
            )}
          </button>
        ) : (
          <>
            <div
              className="mb-2 p-2.5 rounded-lg space-y-2"
              style={{ background: 'var(--bg-panel)' }}
            >
              <label
                className="flex items-center gap-2 cursor-pointer select-none text-xs"
                style={{ color: 'var(--text-main)' }}
              >
                <input
                  type="checkbox"
                  checked={showBackgroundClusters}
                  onChange={(e) => setShowBackgroundClusters(e.target.checked)}
                  className="rounded border-gray-300"
                  style={{ accentColor }}
                />
                Surrounding pins &amp; clusters
              </label>
              <label
                className="flex items-center gap-2 cursor-pointer select-none text-xs"
                style={{ color: 'var(--text-main)' }}
              >
                <input
                  type="checkbox"
                  checked={showRouteStopPins}
                  onChange={(e) => setShowRouteStopPins(e.target.checked)}
                  className="rounded border-gray-300"
                  style={{ accentColor }}
                />
                Route stop pins
              </label>
            </div>
            <button
              type="button"
              disabled={routeLoading}
              onClick={handleGenerateRoute}
              className="prism-btn prism-btn-primary w-full mb-2 hover:brightness-110 transition-all"
              style={{
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                boxShadow: `0 4px 12px ${accentColor}40`,
              }}
            >
              {routeLoading ? (
                <>
                  <Loader2 className="w-4 h-4 prism-spinner" /> Regenerating…
                </>
              ) : (
                <>
                  <Route className="w-4 h-4" /> Regenerate route
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClearRoute}
              className="prism-btn w-full hover:opacity-90 transition-opacity"
              style={{
                background: 'var(--bg-panel)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Trash2 className="w-4 h-4" />
              Clear route
            </button>
          </>
        )}
      </div>
    </>
  );

  const mapPanel = (
    <div className={mapWrapClass}>
      <MapQuestMap
        key={mapKey}
        apiKey={mapQuestApiKey}
        center={{ lat: viewMetro.lat, lng: viewMetro.lng }}
        zoom={METRO_ZOOM}
        minZoom={3}
        darkMode={darkMode}
        accentColor={accentColor}
        height="100%"
        markers={mapMarkers}
        clusterMarkers={false}
        routePolyline={routeActive ? routePolyline : undefined}
        showRoute={routeActive}
        routeColor={accentColor}
        fitBounds={fitBounds}
        flyToView={flyToView}
        onBoundsChange={(b) => {
          setZoomLevel(b.zoom);
          setMapBounds({
            north: b.north,
            south: b.south,
            east: b.east,
            west: b.west,
          });
        }}
      />

      {routeActive && (
        <div
          className="absolute z-[500] flex flex-col gap-1.5"
          style={{ bottom: 12, left: 12 }}
        >
          <button
            type="button"
            aria-pressed={showBackgroundClusters}
            onClick={() => setShowBackgroundClusters((on) => !on)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:opacity-90"
            style={{
              background: showBackgroundClusters ? accentColor : 'var(--bg-canvas, #fff)',
              color: showBackgroundClusters ? '#fff' : 'var(--text-main, #111)',
              border: `1px solid ${showBackgroundClusters ? accentColor : 'var(--border-subtle, rgba(0,0,0,0.12))'}`,
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            }}
          >
            <Layers className="w-3.5 h-3.5" />
            {showBackgroundClusters ? 'Hide pins' : 'Show pins'}
          </button>
          <button
            type="button"
            aria-pressed={showRouteStopPins}
            onClick={() => setShowRouteStopPins((on) => !on)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:opacity-90"
            style={{
              background: showRouteStopPins ? accentColor : 'var(--bg-canvas, #fff)',
              color: showRouteStopPins ? '#fff' : 'var(--text-main, #111)',
              border: `1px solid ${showRouteStopPins ? accentColor : 'var(--border-subtle, rgba(0,0,0,0.12))'}`,
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            }}
          >
            <Route className="w-3.5 h-3.5" />
            {showRouteStopPins ? 'Hide stops' : 'Show stops'}
          </button>
        </div>
      )}

      {isDevicePreview && (
        <div
          ref={mobileControlsRef}
          className="absolute z-[500]"
          style={{
            top: devicePreview === 'iphone' ? 52 : 16,
            right: 12,
          }}
        >
          <button
            type="button"
            aria-expanded={mobileControlsOpen}
            aria-label="Map settings"
            onClick={() => setMobileControlsOpen((open) => !open)}
            className="flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
            style={{
              width: 40,
              height: 40,
              background: mobileControlsOpen ? accentColor : 'var(--bg-canvas, #fff)',
              color: mobileControlsOpen ? '#fff' : 'var(--text-main, #111)',
              border: `1px solid ${mobileControlsOpen ? accentColor : 'var(--border-subtle, rgba(0,0,0,0.12))'}`,
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            }}
          >
            <Settings className="w-5 h-5" />
          </button>

          {mobileControlsOpen && (
            <div
              className="absolute right-0 mt-2 rounded-xl shadow-2xl overflow-hidden"
              style={{
                width: devicePreview === 'iphone' ? 280 : 320,
                maxHeight: devicePreview === 'iphone' ? 420 : 520,
                background: 'var(--bg-canvas, #fff)',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.1))',
              }}
            >
              <div className="px-3 py-2.5 border-b text-xs font-semibold" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}>
                Cluster & route settings
              </div>
              <div className="overflow-y-auto prism-scrollbar p-3" style={{ maxHeight: devicePreview === 'iphone' ? 372 : 472 }}>
                {clusterControls}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const controlsSidebar = (
    <div
      className="w-full md:w-[427px] flex-shrink-0 flex flex-col overflow-hidden border-t md:border-t-0 md:border-r md:order-1"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex-1 overflow-y-auto prism-scrollbar p-4">{clusterControls}</div>
    </div>
  );

  const widgetBody = (
    <div
      className={`${shellClass}${isDevicePreview ? ' h-full flex flex-col min-h-0' : ''}`}
      data-theme={darkMode ? 'dark' : 'light'}
      data-device-preview={devicePreview}
      style={{
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      {!isDevicePreview && (
        <WidgetHeader
          title="Cluster & Route Demo"
          subtitle="Zoom in to split clusters, zoom out to merge — or click a cluster to drill in."
          variant="impressive"
          layout="inline"
          icon={<Layers className="w-4 h-4" />}
        />
      )}

      {!isDevicePreview && previewToggle}

      <div className={bodyClass}>
        {mapPanel}
        {!isDevicePreview && controlsSidebar}
      </div>

      {showBranding && !isDevicePreview && (
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
          <span aria-label="Powered by MapQuest">
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by
          </span>
          <MapQuestPoweredLogo darkMode={darkMode} />
        </div>
      )}
    </div>
  );

  if (devicePreview === 'desktop') {
    return widgetBody;
  }

  return (
    <div
      className="w-full flex flex-col items-center py-8 px-4 gap-6"
      style={{ background: darkMode ? '#111827' : '#f3f4f6' }}
    >
      <div className="w-full max-w-[820px]">{previewToggle}</div>
      <DevicePreviewFrame device={devicePreview}>
        {widgetBody}
      </DevicePreviewFrame>
    </div>
  );
}
