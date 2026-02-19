// components/widgets/CustomRouteWidget.tsx
'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Trash2, ChevronDown, ChevronUp, Route } from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';
import WidgetHeader from './WidgetHeader';
import CollapsibleSection from './CollapsibleSection';

export interface Waypoint {
  lat: number;
  lng: number;
  label?: string; // Optional custom label, e.g. "Warehouse"
}

type MQMarker = NonNullable<ComponentProps<typeof MapQuestMap>['markers']>[number];

export function exportWaypointsLatLng(waypoints: Waypoint[]) {
  return (Array.isArray(waypoints) ? waypoints : []).map((w) => ({ lat: w.lat, lng: w.lng }));
}

function serializeWaypointsLatLng(waypoints: Waypoint[]) {
  return exportWaypointsLatLng(waypoints).map((p) => `${p.lat},${p.lng}`).join('\n');
}

function serializeWaypointsCsv(waypoints: Waypoint[]) {
  const rows = exportWaypointsLatLng(waypoints).map((p, idx) => `${idx + 1},${p.lat},${p.lng}`);
  return ['waypoint,lat,lng', ...rows].join('\n');
}

function serializeRouteGeoJson(opts: {
  title?: string;
  description?: string;
  routeType?: RouteWidgetProps['routeType'];
  unit?: RouteWidgetProps['unit'];
  route?: DirectionsRoute;
  routePoints: Array<{ lat: number; lng: number }>;
  stops: Waypoint[]; // [start, ...waypoints, end]
}) {
  const lineCoords = (opts.routePoints || [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => [p.lng, p.lat]);

  const stopFeatures = (opts.stops || [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p, idx) => {
      const role = idx === 0 ? 'start' : idx === (opts.stops.length - 1) ? 'end' : 'waypoint';
      return {
        type: 'Feature',
        properties: {
          role,
          index: idx,
          label: p.label || '',
        },
        geometry: {
          type: 'Point',
          coordinates: [p.lng, p.lat],
        },
      };
    });

  const routeFeature =
    lineCoords.length >= 2
      ? {
          type: 'Feature',
          properties: {
            title: opts.title || '',
            description: opts.description || '',
            routeType: opts.routeType || '',
            unit: opts.unit || '',
            distance: opts.route?.distance ?? null,
            timeSeconds: opts.route?.time ?? null,
            formattedTime: opts.route?.formattedTime ?? null,
          },
          geometry: {
            type: 'LineString',
            coordinates: lineCoords,
          },
        }
      : null;

  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: [
        ...(routeFeature ? [routeFeature] : []),
        ...stopFeatures,
      ],
    },
    null,
    2
  );
}

function downloadTextFile(filename: string, content: string, mime: string) {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (_) {}
}

export function buildMapQuestComRouteLink(opts: {
  points?: Array<{ lat: number; lng: number }>;
  // Optional override: a per-stop array of "location strings" (addresses or "lat,lng").
  // When provided, this is preferred over `points` so MapQuest.com opens with human-readable locations.
  locations?: string[];
  routeType?: 'fastest' | 'shortest' | 'pedestrian' | 'bicycle';
  unit?: 'm' | 'k';
}) {
  // Best-effort deep link format for MapQuest.com *Route Planner* (main planner UI):
  // https://www.mapquest.com/routeplanner?from={start}&to={stop2}&to={stop3}...
  // MapQuest accepts both free-form addresses and "lat,lng" pairs.
  const locs =
    Array.isArray(opts.locations) && opts.locations.length
      ? opts.locations.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
      : (Array.isArray(opts.points) ? opts.points : []).map((p) => `${p.lat},${p.lng}`);

  if (locs.length < 2) return 'https://www.mapquest.com/directions/';

  const u = new URL('https://www.mapquest.com/routeplanner');
  u.searchParams.set('from', locs[0]);
  for (const stop of locs.slice(1)) u.searchParams.append('to', stop);
  if (opts.routeType) u.searchParams.set('routeType', opts.routeType);
  if (opts.unit) u.searchParams.set('unit', opts.unit);
  return u.toString();
}

export interface RouteWidgetProps {
  apiKey: string;
  waypoints: Waypoint[];
  title?: string;
  description?: string;
  routeType?: 'fastest' | 'shortest' | 'pedestrian' | 'bicycle';
  unit?: 'm' | 'k';
  theme?: 'light' | 'dark';
  darkMode?: boolean; // preferred design-system input
  accentColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  width?: number; // px
  height?: number; // px (builder) or auto if omitted
  // Controls visibility of intermediate waypoint markers (start/end are always shown).
  showWaypoints?: boolean;
  showManeuvers?: boolean;
  showLegBreakdown?: boolean;
  lineColor?: string;
  lineWeight?: number;
  markerStyle?: 'numbered' | 'lettered' | 'dots';
  // Internal
  mode?: 'builder' | 'viewer';
  // For Customize → Embed Code: parent can capture the current builder config.
  onBuilderConfigChange?: (config: RouteEmbedConfig) => void;
}

type DirectionsRoute = {
  distance?: number;
  formattedTime?: string;
  time?: number; // seconds
  legs?: Array<{
    distance?: number;
    time?: number; // seconds
    maneuvers?: Array<{
      narrative?: string;
      distance?: number;
      time?: number;
      iconUrl?: string;
      turnType?: number;
    }>;
  }>;
  shape?: { shapePoints?: number[] };
  boundingBox?: { ul?: { lat: number; lng: number }; lr?: { lat: number; lng: number } };
  routeError?: { errorCode?: number; message?: string };
};

type DirectionsResponse = { route?: DirectionsRoute; info?: any };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function fmtTime(seconds?: number, formattedTime?: string) {
  if (formattedTime && typeof formattedTime === 'string') {
    const parts = formattedTime.split(':').map((s) => Number(s));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const [hh, mm, ss] = parts;
      const total = hh * 3600 + mm * 60 + ss;
      return fmtTime(total);
    }
  }
  const s = typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDistance(dist?: number, unit: 'm' | 'k' = 'm') {
  const d = typeof dist === 'number' && Number.isFinite(dist) ? dist : 0;
  if (unit === 'k') return `${d.toFixed(1)} km`;
  return `${d.toFixed(1)} mi`;
}

function markerLabel(idx: number, style: RouteWidgetProps['markerStyle']) {
  if (style === 'numbered') return String(idx + 1);
  if (style === 'dots') return '';
  // lettered
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (idx < base.length) return base[idx];
  // fallback: A1, A2...
  return `A${idx + 1}`;
}

export function encodeEmbedConfig(obj: unknown) {
  return base64UrlEncode(JSON.stringify(obj));
}

export function decodeEmbedConfig(config: string) {
  try {
    const raw = base64UrlDecode(config);
    const obj = JSON.parse(raw);
    return obj;
  } catch (_) {
    return null;
  }
}

function base64UrlEncode(s: string) {
  // utf-8 safe
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function parseLatLng(input: string): { lat: number; lng: number } | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

async function reverseGeocodeLabel(apiKey: string, lat: number, lng: number) {
  const url = new URL('https://www.mapquestapi.com/geocoding/v1/reverse');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('includeRoadMetadata', 'true');
  url.searchParams.set('includeNearestIntersection', 'true');
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const json: any = await res.json();
  const loc = json?.results?.[0]?.locations?.[0];
  const street = (loc?.street || '').trim();
  const city = (loc?.adminArea5 || '').trim();
  const state = (loc?.adminArea3 || '').trim();
  const parts = [street, city, state].filter(Boolean);
  const label = parts.join(', ');
  return label || null;
}

function pointsFromShape(shapePoints?: number[]) {
  if (!Array.isArray(shapePoints) || shapePoints.length < 4) return [];
  const pts: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i + 1 < shapePoints.length; i += 2) {
    const lat = Number(shapePoints[i]);
    const lng = Number(shapePoints[i + 1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
  }
  return pts;
}

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function waypointIconDataUri(opts: { label: string; color: string }) {
  const label = (opts.label || '').slice(0, 3);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15.5" fill="${opts.color}" stroke="white" stroke-width="3"/>
      <text x="18" y="19.5" text-anchor="middle" dominant-baseline="middle"
            font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
            font-size="14" font-weight="800" fill="white">${label}</text>
    </svg>
  `.trim();
  return svgDataUri(svg);
}

function stopDotIconDataUri(opts: { color: string }) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" fill="${opts.color}" opacity="0.35" stroke="white" stroke-width="2" />
    </svg>
  `.trim();
  return svgDataUri(svg);
}

function bboxToFitBounds(bbox?: { ul?: { lat: number; lng: number }; lr?: { lat: number; lng: number } }) {
  if (!bbox?.ul || !bbox?.lr) return undefined;
  const north = Math.max(bbox.ul.lat, bbox.lr.lat);
  const south = Math.min(bbox.ul.lat, bbox.lr.lat);
  const west = Math.min(bbox.ul.lng, bbox.lr.lng);
  const east = Math.max(bbox.ul.lng, bbox.lr.lng);
  return { north, south, east, west };
}

export type RouteEmbedConfig = {
  apiKey: string;
  waypoints: Waypoint[];
  title?: string;
  description?: string;
  routeType?: RouteWidgetProps['routeType'];
  unit?: RouteWidgetProps['unit'];
  theme?: RouteWidgetProps['theme'];
  darkMode?: boolean;
  accentColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  lineColor?: string;
  lineWeight?: number;
  markerStyle?: RouteWidgetProps['markerStyle'];
  showWaypoints?: boolean;
  showManeuvers?: boolean;
  showLegBreakdown?: boolean;
  width?: number;
  height?: number;
};

type BuilderState = {
  // Intermediate stops ONLY (start/end are separate inputs).
  waypoints: Waypoint[];
  title: string;
  description: string;
  routeType: NonNullable<RouteWidgetProps['routeType']>;
  unit: NonNullable<RouteWidgetProps['unit']>;
  markerStyle: NonNullable<RouteWidgetProps['markerStyle']>;
  lineColor: string;
  lineWeight: number;
  showWaypoints: boolean;
  showManeuvers: boolean;
  showLegBreakdown: boolean;
};

type BuilderAction =
  | { type: 'set'; key: keyof BuilderState; value: any }
  | { type: 'addWaypoint'; waypoint: Waypoint }
  | { type: 'updateWaypoint'; idx: number; waypoint: Waypoint }
  | { type: 'removeWaypoint'; idx: number }
  | { type: 'moveWaypoint'; from: number; to: number }
  | { type: 'setWaypoints'; waypoints: Waypoint[] };

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.key]: action.value };
    case 'addWaypoint':
      return { ...state, waypoints: [...state.waypoints, action.waypoint] };
    case 'updateWaypoint': {
      const next = [...state.waypoints];
      next[action.idx] = action.waypoint;
      return { ...state, waypoints: next };
    }
    case 'removeWaypoint': {
      const next = state.waypoints.filter((_, i) => i !== action.idx);
      return { ...state, waypoints: next };
    }
    case 'moveWaypoint': {
      const from = action.from;
      const to = action.to;
      if (from === to || from < 0 || to < 0 || from >= state.waypoints.length || to >= state.waypoints.length) return state;
      const next = [...state.waypoints];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...state, waypoints: next };
    }
    case 'setWaypoints':
      return { ...state, waypoints: action.waypoints };
    default:
      return state;
  }
}

export default function CustomRouteWidget(props: RouteWidgetProps) {
  const {
    apiKey,
    waypoints,
    title = 'Custom Route',
    description = '',
    routeType = 'fastest',
    unit = 'm',
    theme = 'light',
    darkMode,
    accentColor = '#2563eb',
    fontFamily,
    borderRadius,
    showBranding = true,
    width = 600,
    height,
    showWaypoints = true,
    showManeuvers = true,
    showLegBreakdown = true,
    lineColor = '#2563EB',
    lineWeight = 4,
    markerStyle = 'lettered',
    mode = 'viewer',
    onBuilderConfigChange,
  } = props;

  const resolvedTheme = (darkMode ? 'dark' : theme) as 'light' | 'dark';
  const isDark = resolvedTheme === 'dark';
  const isBuilder = mode === 'builder';
  const lastSyncedFromPropsKeyRef = useRef<string>('');
  const lastEmittedConfigKeyRef = useRef<string>('');

  // Start/End address inputs (builder mode). In viewer mode, start/end are the first/last points of `waypoints`.
  const initialStart = isBuilder && waypoints?.length >= 2 ? waypoints[0] : undefined;
  const initialEnd = isBuilder && waypoints?.length >= 2 ? waypoints[waypoints.length - 1] : undefined;
  const initialStops = isBuilder && waypoints?.length >= 3 ? waypoints.slice(1, waypoints.length - 1) : [];

  const [startQuery, setStartQuery] = useState<string>(() => (initialStart?.label ? String(initialStart.label) : ''));
  const [endQuery, setEndQuery] = useState<string>(() => (initialEnd?.label ? String(initialEnd.label) : ''));
  const [startLL, setStartLL] = useState<{ lat: number; lng: number } | null>(() =>
    initialStart ? { lat: initialStart.lat, lng: initialStart.lng } : null
  );
  const [endLL, setEndLL] = useState<{ lat: number; lng: number } | null>(() =>
    initialEnd ? { lat: initialEnd.lat, lng: initialEnd.lng } : null
  );

  const [builder, dispatch] = useReducer(builderReducer, {
    waypoints: initialStops,
    title,
    description,
    routeType,
    unit,
    markerStyle,
    lineColor,
    lineWeight,
    showWaypoints,
    showManeuvers,
    showLegBreakdown,
  } satisfies BuilderState);

  // Keep builder in sync if parent updates initial props (rare, but avoids stale state).
  useEffect(() => {
    if (!isBuilder) return;
    const nextKey = JSON.stringify({
      waypoints: (waypoints || []).map((w) => [w.lat, w.lng, w.label || '']),
      title,
      description,
    });
    if (lastSyncedFromPropsKeyRef.current === nextKey) return;
    lastSyncedFromPropsKeyRef.current = nextKey;

    // Interpret incoming `waypoints` as [start, ...stops, end]
    if (waypoints?.length >= 2) {
      setStartLL({ lat: waypoints[0].lat, lng: waypoints[0].lng });
      setEndLL({ lat: waypoints[waypoints.length - 1].lat, lng: waypoints[waypoints.length - 1].lng });
      setStartQuery(waypoints[0].label ? String(waypoints[0].label) : '');
      setEndQuery(waypoints[waypoints.length - 1].label ? String(waypoints[waypoints.length - 1].label) : '');
      dispatch({ type: 'setWaypoints', waypoints: waypoints.length >= 3 ? waypoints.slice(1, waypoints.length - 1) : [] });
    } else {
      dispatch({ type: 'setWaypoints', waypoints: [] });
    }
    dispatch({ type: 'set', key: 'title', value: title });
    dispatch({ type: 'set', key: 'description', value: description });
  }, [isBuilder, waypoints, title, description]);

  const effective = isBuilder
    ? {
        // Build the actual route locations as [start, ...stops, end] once start/end are set.
        waypoints:
          startLL && endLL
            ? ([
                { lat: startLL.lat, lng: startLL.lng, label: startQuery?.trim() || 'Start' },
                ...builder.waypoints,
                { lat: endLL.lat, lng: endLL.lng, label: endQuery?.trim() || 'End' },
              ] as Waypoint[])
            : ([] as Waypoint[]),
        title: builder.title,
        description: builder.description,
        routeType: builder.routeType,
        unit: builder.unit,
        markerStyle: builder.markerStyle,
        lineColor: builder.lineColor,
        lineWeight: builder.lineWeight,
        showWaypoints: builder.showWaypoints,
        showManeuvers: builder.showManeuvers,
        showLegBreakdown: builder.showLegBreakdown,
      }
    : {
        waypoints,
        title,
        description,
        routeType,
        unit,
        markerStyle,
        lineColor,
        lineWeight,
        showWaypoints,
        showManeuvers,
        showLegBreakdown,
      };

  const [routeResp, setRouteResp] = useState<DirectionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPreviewKey, setLastPreviewKey] = useState<string | null>(null);

  // Reverse geocode cache for waypoint labels.
  const labelCacheRef = useRef(new Map<string, string>());
  const [resolvedLabels, setResolvedLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!apiKey) return;
      const points = effective.waypoints || [];
      // In Builder mode, intermediate waypoints are purely for shaping—don't reverse-geocode them.
      // Only resolve start/end if they have no label.
      const missing = (isBuilder
        ? points.filter((w, idx) => !w.label && (idx === 0 || idx === points.length - 1))
        : points.filter((w) => !w.label)
      );
      if (!missing.length) return;

      for (const w of missing.slice(0, 10)) {
        const k = `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`;
        if (labelCacheRef.current.has(k) || resolvedLabels[k]) continue;
        const label = await reverseGeocodeLabel(apiKey, w.lat, w.lng);
        if (cancelled) return;
        if (label) {
          labelCacheRef.current.set(k, label);
          setResolvedLabels((prev) => ({ ...prev, [k]: label }));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiKey, effective.waypoints, isBuilder]); // intentionally not depending on resolvedLabels to avoid loops

  const withLabels = useMemo(() => {
    return (effective.waypoints || []).map((w) => {
      if (w.label) return w;
      const k = `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`;
      const r = labelCacheRef.current.get(k) || resolvedLabels[k];
      return r ? { ...w, label: r } : w;
    });
  }, [effective.waypoints, resolvedLabels]);

  const previewKey = useMemo(() => {
    return JSON.stringify({
      w: withLabels.map((x) => [x.lat, x.lng, x.label || '']),
      routeType: effective.routeType,
      unit: effective.unit,
      lineColor: effective.lineColor,
      lineWeight: effective.lineWeight,
    });
  }, [withLabels, effective.routeType, effective.unit, effective.lineColor, effective.lineWeight]);

  const route = routeResp?.route;
  const routePoints = useMemo(() => pointsFromShape(route?.shape?.shapePoints), [route?.shape?.shapePoints]);
  const fitBounds = useMemo(() => bboxToFitBounds(route?.boundingBox), [route?.boundingBox]);

  const totalStops = withLabels.length;
  const totalDist = route?.distance;
  const totalTime = route?.time;

  const [maneuversOpen, setManeuversOpen] = useState(false);
  const [openLegs, setOpenLegs] = useState<Record<number, boolean>>({});

  const doPreview = async () => {
    setError(null);
    if (!apiKey) {
      setError('Missing MapQuest API key.');
      return;
    }
    if (!withLabels || withLabels.length < 2) {
      setError('Select a start and end to create a route.');
      return;
    }
    setLoading(true);
    try {
      const url = new URL('https://www.mapquestapi.com/directions/v2/route');
      url.searchParams.set('key', apiKey);
      const body = {
        locations: withLabels.map((w) => ({ latLng: { lat: w.lat, lng: w.lng } })),
        options: {
          routeType: effective.routeType,
          doReverseGeocode: true,
          enhancedNarrative: true,
          shapeFormat: 'raw',
          generalize: 10,
          unit: effective.unit,
          fullShape: true,
        },
      };
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Directions request failed (${res.status}): ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as DirectionsResponse;
      const r = json?.route;
      if (r?.routeError?.message) {
        throw new Error(r.routeError.message);
      }
      setRouteResp(json);
      setLastPreviewKey(previewKey);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to generate route.');
      setRouteResp(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate route in builder mode (debounced) once start + end are selected.
  useEffect(() => {
    if (!isBuilder) return;
    if (!apiKey) return;
    if (!startLL || !endLL) return;
    if (!withLabels || withLabels.length < 2) return;

    // If we already have a route for the current key, skip.
    if (lastPreviewKey === previewKey && routeResp?.route) return;

    const t = window.setTimeout(() => {
      void doPreview();
    }, 450);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBuilder, apiKey, startLL?.lat, startLL?.lng, endLL?.lat, endLL?.lng, previewKey]);

  // Inform parent (Customize → Embed Code) of the current builder config.
  useEffect(() => {
    if (!isBuilder) return;
    if (!onBuilderConfigChange) return;

    const cfg: RouteEmbedConfig = {
      apiKey,
      waypoints: withLabels,
      title: effective.title,
      description: effective.description,
      routeType: effective.routeType,
      unit: effective.unit,
      theme: resolvedTheme,
      darkMode: isDark,
      accentColor,
      fontFamily,
      borderRadius,
      showBranding,
      companyName: props.companyName,
      companyLogo: props.companyLogo,
      lineColor: effective.lineColor,
      lineWeight: effective.lineWeight,
      markerStyle: effective.markerStyle,
      showWaypoints: effective.showWaypoints,
      showManeuvers: effective.showManeuvers,
      showLegBreakdown: effective.showLegBreakdown,
      width,
      height,
    };
    const nextEmitKey = JSON.stringify({
      apiKey: cfg.apiKey,
      waypoints: (cfg.waypoints || []).map((w) => [w.lat, w.lng, w.label || '']),
      title: cfg.title || '',
      description: cfg.description || '',
      routeType: cfg.routeType || '',
      unit: cfg.unit || '',
      theme: cfg.theme || '',
      darkMode: !!cfg.darkMode,
      accentColor: cfg.accentColor || '',
      fontFamily: cfg.fontFamily || '',
      borderRadius: cfg.borderRadius || '',
      showBranding: cfg.showBranding !== false,
      companyName: cfg.companyName || '',
      companyLogo: cfg.companyLogo || '',
      lineColor: cfg.lineColor || '',
      lineWeight: cfg.lineWeight || 0,
      markerStyle: cfg.markerStyle || '',
      showWaypoints: cfg.showWaypoints !== false,
      showManeuvers: cfg.showManeuvers !== false,
      showLegBreakdown: cfg.showLegBreakdown !== false,
      width: cfg.width || 0,
      height: cfg.height || 0,
    });
    if (lastEmittedConfigKeyRef.current === nextEmitKey) return;
    lastEmittedConfigKeyRef.current = nextEmitKey;
    onBuilderConfigChange(cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isBuilder,
    apiKey,
    withLabels,
    effective.title,
    effective.description,
    effective.routeType,
    effective.unit,
    effective.lineColor,
    effective.lineWeight,
    effective.markerStyle,
    effective.showWaypoints,
    effective.showManeuvers,
    effective.showLegBreakdown,
    resolvedTheme,
    isDark,
    accentColor,
    fontFamily,
    borderRadius,
    showBranding,
    width,
    height,
  ]);

  // Builder add waypoint inputs
  const [newCoord, setNewCoord] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [copiedWaypoints, setCopiedWaypoints] = useState(false);
  const [exportedGeoJson, setExportedGeoJson] = useState(false);
  const [routeOptionsOpen, setRouteOptionsOpen] = useState(false);

  // Map context menu (right-click): "Add waypoint" dialog.
  const mapPanelRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; lat: number; lng: number }>(null);

  // Route shaping gesture: drag the route line to drop a waypoint.
  const [routeDragPoint, setRouteDragPoint] = useState<null | { lat: number; lng: number }>(null);

  // Drag-and-drop reordering (native)
  const dragFromRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (ctxMenuRef.current && ctxMenuRef.current.contains(t)) return;
      setCtxMenu(null);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [ctxMenu]);

  const addWaypointAt = (lat: number, lng: number) => {
    setError(null);
    if (!startLL) {
      setStartLL({ lat, lng });
      if (!startQuery) setStartQuery('Dropped pin');
      return;
    }
    if (!endLL) {
      setEndLL({ lat, lng });
      if (!endQuery) setEndQuery('Dropped pin');
      return;
    }
    dispatch({ type: 'addWaypoint', waypoint: { lat, lng } });
  };

  const waypointMarkers = useMemo(() => {
    const col = accentColor;
    const base: MQMarker[] = withLabels
      .map((w, idx) => {
        const isWaypoint = idx !== 0 && idx !== withLabels.length - 1;
        if (isWaypoint && !effective.showWaypoints) return null;
      const label = markerLabel(idx, effective.markerStyle);
      // Intermediate waypoints should be subtly represented (still visible, but not as prominent as start/end).
      const iconUrl =
        effective.markerStyle === 'dots'
          ? stopDotIconDataUri({ color: col })
          : isWaypoint
            ? stopDotIconDataUri({ color: col })
            : waypointIconDataUri({ label: label || String(idx + 1), color: col });
      return {
        lat: w.lat,
        lng: w.lng,
        type: idx === 0 ? ('home' as const) : ('default' as const),
        color: col,
        label: w.label || `${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}`,
        iconUrl,
        iconCircular: false,
        iconSize: iconUrl ? ((isWaypoint ? [22, 22] : [30, 30]) as [number, number]) : undefined,
        zIndexOffset: idx === 0 ? 2000 : 1500,
        draggable: isBuilder,
        onDragEnd: (lat: number, lng: number) => {
          // idx corresponds to [start, ...intermediate waypoints..., end]
          if (!isBuilder) return;
          if (idx === 0) {
            setStartLL({ lat, lng });
            if (!startQuery) setStartQuery('Dropped pin');
            return;
          }
          if (idx === withLabels.length - 1) {
            setEndLL({ lat, lng });
            if (!endQuery) setEndQuery('Dropped pin');
            return;
          }
          const wpIdx = idx - 1;
          const existing = builder.waypoints[wpIdx];
          if (!existing) return;
          dispatch({ type: 'updateWaypoint', idx: wpIdx, waypoint: { ...existing, lat, lng } });
        },
      };
      })
      .filter(Boolean) as MQMarker[];
    if (routeDragPoint) {
      base.push({
        lat: routeDragPoint.lat,
        lng: routeDragPoint.lng,
        type: 'default' as const,
        color: col,
        label: 'Release to add waypoint',
        iconUrl: stopDotIconDataUri({ color: col }),
        iconCircular: false,
        iconSize: [26, 26] as [number, number],
        zIndexOffset: 2600,
        draggable: false,
      });
    }
    return base;
  }, [
    withLabels,
    effective.markerStyle,
    effective.showWaypoints,
    accentColor,
    isBuilder,
    builder.waypoints,
    startQuery,
    endQuery,
    routeDragPoint,
  ]);

  const viewerContent = (
    <div className="flex flex-col h-full">
      <WidgetHeader
        title="Custom Route"
        subtitle={effective.description || 'View a shared route with turn-by-turn details.'}
        variant="impressive"
        layout="inline"
        icon={<Route className="w-4 h-4" />}
      />

      <div className="flex-1 min-h-0 p-4">
        <div className="rounded-xl overflow-hidden border h-[320px] md:h-[380px]" style={{ borderColor: 'var(--border-subtle)' }}>
          <MapQuestMap
            apiKey={apiKey}
            center={withLabels[0] ? { lat: withLabels[0].lat, lng: withLabels[0].lng } : { lat: 34.0522, lng: -118.2437 }}
            zoom={12}
            darkMode={isDark}
            height="100%"
            markers={waypointMarkers}
            routePolyline={routePoints.length ? routePoints : undefined}
            showRoute={!!routePoints.length}
            fitBounds={fitBounds}
            interactive={true}
          />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="prism-panel p-3">
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Distance</div>
            <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-main)' }}>{fmtDistance(totalDist, effective.unit)}</div>
          </div>
          <div className="prism-panel p-3">
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Drive time</div>
            <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-main)' }}>{fmtTime(totalTime, route?.formattedTime)}</div>
          </div>
          <div className="prism-panel p-3">
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Waypoints</div>
            <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-main)' }}>{totalStops}</div>
          </div>
        </div>

        {effective.showLegBreakdown && route?.legs?.length ? (
          <div className="mt-5">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Leg breakdown</div>
            <div className="mt-2 space-y-2">
              {route.legs.map((leg, idx) => {
                const a = withLabels[idx];
                const b = withLabels[idx + 1];
                return (
                  <div key={idx} className="prism-panel p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-main)' }}>
                          {markerLabel(idx, effective.markerStyle)} → {markerLabel(idx + 1, effective.markerStyle)}{' '}
                          <span style={{ color: 'var(--text-muted)' }}>
                            {a?.label ? `· ${a.label}` : ''} {b?.label ? `→ ${b.label}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                        <div>{fmtDistance(leg.distance, effective.unit)}</div>
                        <div>{fmtTime(leg.time)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {effective.showManeuvers && route?.legs?.length ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setManeuversOpen((v) => !v)}
              className="w-full flex items-center justify-between rounded-xl border px-4 py-3"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-panel)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Turn-by-turn directions</div>
              {maneuversOpen ? (
                <ChevronUp className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
              ) : (
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
              )}
            </button>
            {maneuversOpen ? (
              <div className="mt-2 space-y-2">
                {route.legs.map((leg, legIdx) => {
                  const isOpen = openLegs[legIdx] ?? false;
                  const man = leg.maneuvers || [];
                  return (
                    <div
                      key={legIdx}
                      className="rounded-xl border"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-panel)' }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenLegs((p) => ({ ...p, [legIdx]: !isOpen }))}
                        className="w-full flex items-center justify-between px-4 py-3"
                      >
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                          Leg {markerLabel(legIdx, effective.markerStyle)} → {markerLabel(legIdx + 1, effective.markerStyle)}
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                        ) : (
                          <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </button>
                      {isOpen ? (
                        <div className="px-4 pb-4 space-y-2">
                          {man.map((m, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                              {m.iconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.iconUrl} alt="" className="h-5 w-5 mt-0.5 opacity-90" />
                              ) : (
                                <div className={`h-5 w-5 mt-0.5 rounded bg-black/10`} />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm" style={{ color: 'var(--text-main)' }}>{m.narrative || 'Continue'}</div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                  {fmtDistance(m.distance, effective.unit)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

      </div>

      {showBranding && (
        <div className="prism-footer">
          <span className="prism-footer-text" aria-label="Powered by MapQuest">
            Powered by
          </span>
          <img
            src="/brand/mapquest-footer-light.svg"
            alt="MapQuest"
            className="prism-footer-logo prism-footer-logo--light"
          />
          <img
            src="/brand/mapquest-footer-dark.svg"
            alt="MapQuest"
            className="prism-footer-logo prism-footer-logo--dark"
          />
        </div>
      )}
    </div>
  );

  const builderContent = (
    <div className="flex flex-col h-full">
      <WidgetHeader
        title="Custom Route"
        subtitle="Add a start and end, then optional waypoints to influence the route."
        variant="impressive"
        layout="inline"
        icon={<Route className="w-4 h-4" />}
      />

      {/* Two-panel layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Map (right on desktop) */}
        <div ref={mapPanelRef} className="h-[380px] md:h-full md:flex-1 md:order-2 min-h-0 relative border-b md:border-b-0 md:border-l" style={{ borderColor: 'var(--border-subtle)' }}>
          {/* Map status pill: hide the "Waiting for start/end" state per request. */}
          {((startLL && endLL) && (loading || !(lastPreviewKey === previewKey && route))) ? (
            <div
              className="absolute top-3 left-3 z-[500] inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-sm"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(10px)',
                color: 'var(--text-muted)',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Calculating…
                </>
              ) : (
                <>Updating…</>
              )}
            </div>
          ) : null}

          {ctxMenu ? (
            <div
              ref={ctxMenuRef}
              className="absolute z-[650] rounded-xl border shadow-lg overflow-hidden"
              style={{
                left: clamp(ctxMenu.x, 12, 99999),
                top: clamp(ctxMenu.y, 12, 99999),
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-panel)',
                color: 'var(--text-main)',
              }}
            >
              <div className="px-3 py-2 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                Add waypoint
              </div>
              <div className="p-2 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm"
                  style={{ borderColor: 'var(--border-subtle)', background: 'transparent', color: 'var(--text-main)' }}
                  onClick={() => {
                    addWaypointAt(ctxMenu.lat, ctxMenu.lng);
                    setCtxMenu(null);
                  }}
                >
                  {!startLL ? 'Set start here' : !endLL ? 'Set end here' : 'Add waypoint here'}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => setCtxMenu(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="w-full h-full">
            <MapQuestMap
              apiKey={apiKey}
              center={withLabels[0] ? { lat: withLabels[0].lat, lng: withLabels[0].lng } : { lat: 34.0522, lng: -118.2437 }}
              zoom={12}
              darkMode={isDark}
              height="100%"
              markers={waypointMarkers}
              routePolyline={routePoints.length ? routePoints : undefined}
              showRoute={!!routePoints.length}
              fitBounds={fitBounds}
              interactive={true}
              onRightClick={(lat, lng, meta) => {
                // Right-click opens a tiny dialog. This keeps the interaction explicit and avoids accidental waypoint creation.
                if (!isBuilder) return;
                setRouteDragPoint(null);
                const rect = mapPanelRef.current?.getBoundingClientRect();
                const x = rect ? (meta?.clientX ?? 0) - rect.left : 16;
                const y = rect ? (meta?.clientY ?? 0) - rect.top : 16;
                setCtxMenu({ x, y, lat, lng });
              }}
              onRouteLineClick={(lat, lng) => {
                // Closest approximation to "dragging the route line":
                // click the line to insert a waypoint, then drag that waypoint.
                if (!startLL || !endLL) return;
                dispatch({ type: 'addWaypoint', waypoint: { lat, lng } });
              }}
              onRouteLineDrag={(e) => {
                if (!isBuilder) return;
                if (!startLL || !endLL) return;
                if (e.phase === 'start') {
                  setCtxMenu(null);
                  setRouteDragPoint({ lat: e.lat, lng: e.lng });
                  return;
                }
                if (e.phase === 'move') {
                  setRouteDragPoint({ lat: e.lat, lng: e.lng });
                  return;
                }
                // end
                setRouteDragPoint(null);
                dispatch({ type: 'addWaypoint', waypoint: { lat: e.lat, lng: e.lng } });
              }}
            />
          </div>
        </div>

        {/* Controls panel */}
        <div className="w-full md:w-[420px] flex-shrink-0 flex flex-col overflow-hidden md:order-1">
          <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar p-4 space-y-3">
            {error ? (
              <div className="rounded-xl border p-3" style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'var(--bg-panel)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Unable to generate route</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{error}</div>
              </div>
            ) : null}

            <div className="prism-panel p-3">
              <CollapsibleSection
                title="Route options"
                summary={`${builder.routeType} · ${builder.unit === 'm' ? 'miles' : 'km'} · ${builder.markerStyle}`}
                open={routeOptionsOpen}
                defaultOpen={false}
                onOpenChange={setRouteOptionsOpen}
              >
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Title</div>
                    <input
                      value={builder.title}
                      onChange={(e) => dispatch({ type: 'set', key: 'title', value: e.target.value })}
                      className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Description</div>
                    <input
                      value={builder.description}
                      onChange={(e) => dispatch({ type: 'set', key: 'description', value: e.target.value })}
                      className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Route type</div>
                      <select
                        value={builder.routeType}
                        onChange={(e) => dispatch({ type: 'set', key: 'routeType', value: e.target.value })}
                        className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                      >
                        <option value="fastest">Fastest</option>
                        <option value="shortest">Shortest</option>
                        <option value="pedestrian">Pedestrian</option>
                        <option value="bicycle">Bicycle</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Units</div>
                      <select
                        value={builder.unit}
                        onChange={(e) => dispatch({ type: 'set', key: 'unit', value: e.target.value })}
                        className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                      >
                        <option value="m">Miles</option>
                        <option value="k">Kilometers</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Marker style</div>
                      <select
                        value={builder.markerStyle}
                        onChange={(e) => dispatch({ type: 'set', key: 'markerStyle', value: e.target.value })}
                        className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                      >
                        <option value="lettered">Lettered</option>
                        <option value="numbered">Numbered</option>
                        <option value="dots">Dots</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Line weight</div>
                      <input
                        type="number"
                        min={2}
                        max={10}
                        step={1}
                        value={builder.lineWeight}
                        onChange={(e) => dispatch({ type: 'set', key: 'lineWeight', value: Math.max(2, Math.min(10, Number(e.target.value) || 4)) })}
                        className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>
                  <label className="mt-1 flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={builder.showWaypoints}
                      onChange={(e) => dispatch({ type: 'set', key: 'showWaypoints', value: e.target.checked })}
                      style={{ accentColor }}
                    />
                    Show waypoints on map
                  </label>
                  <div>
                    <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Line color</div>
                    <input
                      type="color"
                      value={builder.lineColor}
                      onChange={(e) => dispatch({ type: 'set', key: 'lineColor', value: e.target.value })}
                      className="mt-1 h-9 w-14 rounded border"
                      style={{ borderColor: 'var(--border-subtle)', background: 'transparent' }}
                      aria-label="Line color"
                    />
                  </div>
                </div>
              </CollapsibleSection>
            </div>

            <div className="prism-panel p-3">
              <div className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>Start / End</div>
              <div className="mt-2 space-y-2">
                <div
                  className="rounded-xl flex items-center gap-2.5"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
                    style={{ background: accentColor, color: 'white' }}
                  >
                    A
                  </div>
                  <AddressAutocomplete
                    value={startQuery}
                    onChange={setStartQuery}
                    placeholder="Start address…"
                    darkMode={isDark}
                    className="flex-1"
                    hideIcon
                    onSelect={(a) => {
                      setStartQuery(a.displayString);
                      if (typeof a.lat === 'number' && typeof a.lng === 'number') setStartLL({ lat: a.lat, lng: a.lng });
                    }}
                  />
                </div>
                <div
                  className="rounded-xl flex items-center gap-2.5"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
                    style={{ background: accentColor, color: 'white' }}
                  >
                    B
                  </div>
                  <AddressAutocomplete
                    value={endQuery}
                    onChange={setEndQuery}
                    placeholder="End address…"
                    darkMode={isDark}
                    className="flex-1"
                    hideIcon
                    onSelect={(a) => {
                      setEndQuery(a.displayString);
                      if (typeof a.lat === 'number' && typeof a.lng === 'number') setEndLL({ lat: a.lat, lng: a.lng });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="prism-panel p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>Waypoints (optional)</div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {(() => {
                    const locs = withLabels.map((p, idx) => {
                      if (idx === 0 && startQuery.trim()) return startQuery.trim();
                      if (idx === withLabels.length - 1 && endQuery.trim()) return endQuery.trim();
                      return `${p.lat},${p.lng}`;
                    });
                    const mqHref = buildMapQuestComRouteLink({
                      locations: locs,
                      routeType: effective.routeType,
                      unit: effective.unit,
                    });
                    return (
                      <>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (!routePoints || routePoints.length < 2) {
                          setError('Generate a route first to export GeoJSON.');
                          return;
                        }
                        const geojson = serializeRouteGeoJson({
                          title: effective.title,
                          description: effective.description,
                          routeType: effective.routeType,
                          unit: effective.unit,
                          route,
                          routePoints,
                          stops: withLabels,
                        });
                        downloadTextFile('route.geojson', geojson, 'application/geo+json;charset=utf-8');
                        try {
                          await navigator.clipboard.writeText(geojson);
                        } catch (_) {}
                        setExportedGeoJson(true);
                        window.setTimeout(() => setExportedGeoJson(false), 1200);
                      } catch (_) {}
                    }}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ borderColor: 'var(--border-subtle)', background: 'transparent', color: 'var(--text-main)' }}
                    aria-label="Export route as GeoJSON"
                  >
                    {exportedGeoJson ? 'Saved' : 'GeoJSON'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        // Export *intermediate* waypoints only (not start/end).
                        const csv = serializeWaypointsCsv(builder.waypoints);
                        downloadTextFile('waypoints.csv', csv, 'text/csv;charset=utf-8');
                        // Also copy for convenience (best-effort).
                        try {
                          await navigator.clipboard.writeText(csv);
                        } catch (_) {}
                        setCopiedWaypoints(true);
                        window.setTimeout(() => setCopiedWaypoints(false), 1200);
                      } catch (_) {}
                    }}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ borderColor: 'var(--border-subtle)', background: 'transparent', color: 'var(--text-main)' }}
                    aria-label="Export waypoints as CSV"
                  >
                    {copiedWaypoints ? 'Copied' : 'Export'}
                  </button>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="mt-2 space-y-2">
                {builder.waypoints.map((w, idx) => {
                  return (
                    <div
                      key={`${w.lat},${w.lng},${idx}`}
                      className="rounded-xl border p-3"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-widget)' }}
                      draggable
                      onDragStart={() => (dragFromRef.current = idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        const from = dragFromRef.current;
                        if (typeof from === 'number') dispatch({ type: 'moveWaypoint', from, to: idx });
                        dragFromRef.current = null;
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: 'var(--brand-primary)', opacity: 0.55 }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                              Waypoint {idx + 1}
                            </div>
                            <div className="text-xs tabular-nums font-mono" style={{ color: 'var(--text-muted)' }}>
                              {w.lat.toFixed(6)}, {w.lng.toFixed(6)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="p-2 rounded-lg border"
                            style={{ borderColor: 'var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)' }}
                            onClick={() => dispatch({ type: 'removeWaypoint', idx })}
                            aria-label="Remove"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3">
                <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Add waypoint</div>
                <div className="mt-2 space-y-2">
                  <div
                    className="rounded-xl flex items-center gap-2.5"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                    <AddressAutocomplete
                      value={newLabel}
                      onChange={setNewLabel}
                      placeholder="Search waypoint address…"
                      darkMode={isDark}
                      hideIcon
                      className="flex-1"
                      onSelect={(a) => {
                        setNewLabel(a.displayString);
                        if (typeof a.lat === 'number' && typeof a.lng === 'number') {
                          dispatch({ type: 'addWaypoint', waypoint: { lat: a.lat, lng: a.lng, label: a.displayString } });
                          setNewLabel('');
                        }
                      }}
                    />
                  </div>
                  <input
                    value={newCoord}
                    onChange={(e) => setNewCoord(e.target.value)}
                    placeholder="Or paste coordinates: lat,lng"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const parsed = parseLatLng(newCoord);
                      if (!parsed) {
                        setError('Enter waypoint coordinates as "lat,lng" or select an address.');
                        return;
                      }
                      dispatch({
                        type: 'addWaypoint',
                        waypoint: { lat: parsed.lat, lng: parsed.lng, label: undefined },
                      });
                      setNewCoord('');
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                    style={{ background: 'var(--brand-primary)', color: 'white' }}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add waypoint
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Full-width footer (spans both panels) */}
      {showBranding && (
        <div className="prism-footer">
          <span className="prism-footer-text" aria-label="Powered by MapQuest">
            Powered by
          </span>
          <img
            src="/brand/mapquest-footer-light.svg"
            alt="MapQuest"
            className="prism-footer-logo prism-footer-logo--light"
          />
          <img
            src="/brand/mapquest-footer-dark.svg"
            alt="MapQuest"
            className="prism-footer-logo prism-footer-logo--dark"
          />
        </div>
      )}
    </div>
  );

  // Auto-preview in viewer mode (so embeds show immediately)
  useEffect(() => {
    if (isBuilder) return;
    if (!apiKey) return;
    if (withLabels.length < 2) return;
    // If we already have a route for the current key, skip.
    if (lastPreviewKey === previewKey && routeResp?.route) return;
    void doPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBuilder, apiKey, previewKey]);

  return (
    <div
      className="prism-widget w-full flex flex-col"
      data-theme={isDark ? 'dark' : 'light'}
      style={{
        width: `${width}px`,
        ...(height ? { height: `${height}px` } : {}),
        fontFamily: fontFamily || 'var(--brand-font)',
        borderRadius,
        ['--brand-primary' as any]: accentColor,
      } as React.CSSProperties}
    >
      {isBuilder ? builderContent : viewerContent}
    </div>
  );
}
