// components/widgets/LiveTrafficWidget.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Route } from 'lucide-react';
import WidgetHeader from './WidgetHeader';
import CollapsibleSection from './CollapsibleSection';
import * as turf from '@turf/turf';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';
import { reverseGeocode } from '@/lib/mapquest';

export interface TrafficWidgetProps {
  apiKey: string;
  center: { lat: number; lng: number };
  title?: string;
  zoom?: number; // default: 11
  width?: number; // default: 400
  height?: number; // default: 500
  refreshInterval?: number; // seconds, default: 120
  incidentFilters?: Array<'construction' | 'incidents' | 'event' | 'congestion'>;
  theme?: 'light' | 'dark'; // default: dark
  // Optional Prism design system hooks (mirrors other widgets)
  accentColor?: string;
  fontFamily?: string;
  borderRadius?: string;
}

type Severity = 1 | 2 | 3 | 4;

// Only 3 icon categories (per request). Everything else (including accidents, congestion, events) maps to 'traffic'.
type IncidentKind = 'closure' | 'construction' | 'traffic';

type NormalizedIncident = {
  id: string;
  severity: Severity;
  lat: number;
  lng: number;
  shortDesc: string;
  fullDesc?: string;
  type?: string;
  kind: IncidentKind;
  road?: string;
  crossStreet?: string;
  between?: string;
  direction?: string;
  startTime?: string;
  endTime?: string;
  distanceMiles: number;
  delayMinutes?: number;
};

const DEFAULT_ZOOM = 14;
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 500;
const DEFAULT_REFRESH_S = 120;
const DEFAULT_FILTERS: TrafficWidgetProps['incidentFilters'] = ['construction', 'incidents', 'event', 'congestion'];

const severityMeta: Record<Severity, { label: string; dot: string }> = {
  4: { label: 'Critical', dot: 'bg-red-500' },
  3: { label: 'Major', dot: 'bg-orange-500' },
  2: { label: 'Minor', dot: 'bg-yellow-400' },
  1: { label: 'Low', dot: 'bg-emerald-500' },
};

function severityChipClass(sev: Severity, isDark: boolean) {
  if (isDark) {
    if (sev === 4) return 'bg-red-500/15 text-red-300';
    if (sev === 3) return 'bg-orange-500/15 text-orange-300';
    if (sev === 2) return 'bg-yellow-400/15 text-yellow-200';
    return 'bg-emerald-500/15 text-emerald-300';
  }
  // Light mode: stronger fills + darker text for contrast.
  if (sev === 4) return 'bg-red-100 text-red-900';
  if (sev === 3) return 'bg-orange-100 text-orange-900';
  if (sev === 2) return 'bg-yellow-100 text-yellow-900';
  return 'bg-emerald-100 text-emerald-900';
}

const responseCache = new Map<
  string,
  { ts: number; incidents: NormalizedIncident[] }
>();

type RouteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      polyline: { lat: number; lng: number }[];
      segments: { coords: { lat: number; lng: number }[]; color: string; speedMph: number }[];
      routeTimeMinutes?: number; // baseline (MapQuest route.time)
      routeRealTimeMinutes?: number; // traffic-adjusted (MapQuest route.realTime)
      routeDelayMinutes?: number; // max(0, realTime - time)
      bbox: { lat1: number; lng1: number; lat2: number; lng2: number };
    }
  | { status: 'error'; message: string };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function toSeverity(v: unknown): Severity {
  const n = Number(v);
  if (n === 4 || n === 3 || n === 2 || n === 1) return n;
  return 1;
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3959; // miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function getBoundingBox(center: { lat: number; lng: number }, zoom: number) {
  // Per prompt approximation: offset = 0.5 / (2^(zoom - 11))
  const offset = 0.5 / 2 ** (zoom - 11);
  const lat1 = center.lat - offset;
  const lng1 = center.lng - offset;
  const lat2 = center.lat + offset;
  const lng2 = center.lng + offset;
  return { lat1, lng1, lat2, lng2, offset };
}

function minutesAgo(ts: number) {
  const deltaMs = Date.now() - ts;
  const m = Math.max(0, Math.floor(deltaMs / 60000));
  if (m <= 0) return 'just now';
  if (m === 1) return '1 min ago';
  return `${m} min ago`;
}

function cleanText(s: unknown) {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  return t ? t : undefined;
}

function classifyIncidentKind(input: { type?: string; shortDesc: string; fullDesc?: string }): IncidentKind {
  const s = `${input.type || ''} ${input.shortDesc || ''} ${input.fullDesc || ''}`.toLowerCase();
  if (/(road closed|closure|closed|lanes closed)/i.test(s)) return 'closure';
  if (/(construction|road work|work zone|maintenance|repairs?)/i.test(s)) return 'construction';
  return 'traffic';
}

function parseRoadCrossFromDesc(desc: string): { road?: string; crossStreet?: string; between?: string; direction?: string } {
  const s = (desc || '').trim();
  if (!s) return {};

  // Common patterns:
  // - "I-405 N at Wilshire Blvd"
  // - "US-101 S near Vine St"
  // - "Main St between 1st Ave and 2nd Ave"
  const mBetween = s.match(/^(.*?)\s+between\s+(.*?)\s+and\s+(.*)$/i);
  if (mBetween) return { road: mBetween[1].trim(), between: `${mBetween[2].trim()} and ${mBetween[3].trim()}` };

  const mAt = s.match(/^(.*?)\s+at\s+(.*)$/i);
  if (mAt) return { road: mAt[1].trim(), crossStreet: mAt[2].trim() };

  const mNear = s.match(/^(.*?)\s+near\s+(.*)$/i);
  if (mNear) return { road: mNear[1].trim(), crossStreet: mNear[2].trim() };

  // Direction hint inside the "road" string ("I-405 N", "I-5 SB", etc.)
  const mDir = s.match(/\b([NSEW]|NB|SB|EB|WB)\b/i);
  const direction = mDir ? mDir[1].toUpperCase() : undefined;
  return { direction };
}

function bboxFromRadiusMiles(center: { lat: number; lng: number }, radiusMiles: number) {
  const r = Math.max(0.25, radiusMiles);
  const latOffset = r / 69; // ~69 miles per degree latitude
  const lngOffset = r / (69 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  return {
    lat1: center.lat - latOffset,
    lng1: center.lng - lngOffset,
    lat2: center.lat + latOffset,
    lng2: center.lng + lngOffset,
  };
}

function normalizeIncidents(raw: any[], center: { lat: number; lng: number }): NormalizedIncident[] {
  const out: NormalizedIncident[] = [];
  for (const item of raw || []) {
    const lat = Number(item?.lat ?? item?.latitude ?? item?.y);
    const lng = Number(item?.lng ?? item?.longitude ?? item?.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const severity = toSeverity(item?.severity ?? item?.severityLevel ?? item?.severityId);
    const shortDesc =
      String(item?.shortDesc ?? item?.shortDescription ?? item?.typeDesc ?? item?.description ?? item?.fullDesc ?? 'Traffic incident');
    const fullDesc = item?.fullDesc ?? item?.fullDescription;
    const type =
      cleanText(item?.typeDesc) ||
      cleanText(item?.type) ||
      cleanText(item?.eventCode) ||
      (typeof item?.iconURL === 'string' ? item.iconURL : undefined);
    const kind = classifyIncidentKind({
      type,
      shortDesc,
      fullDesc: typeof fullDesc === 'string' ? fullDesc : undefined,
    });
    const delayMinutesRaw = item?.delayFromTypicalMinutes ?? item?.delayFromTypical ?? item?.delayMinutes ?? item?.delay;
    const delayMinutesNum = Number.isFinite(Number(delayMinutesRaw)) ? Math.max(0, Math.round(Number(delayMinutesRaw))) : undefined;
    // Incidents often omit delay or provide 0. Treat 0 as "unknown / not meaningful" to avoid showing "0 min delay".
    const delayMinutes = typeof delayMinutesNum === 'number' && delayMinutesNum > 0 ? delayMinutesNum : undefined;

    const parsed = parseRoadCrossFromDesc(shortDesc);
    const road =
      cleanText(item?.roadName) ||
      cleanText(item?.road) ||
      cleanText(item?.street) ||
      cleanText(item?.location) ||
      parsed.road;
    const crossStreet =
      cleanText(item?.crossStreet) ||
      cleanText(item?.crossStreetName) ||
      cleanText(item?.nearestCrossStreet) ||
      parsed.crossStreet;
    const between =
      cleanText(item?.between) ||
      parsed.between;
    const direction =
      cleanText(item?.direction) ||
      cleanText(item?.dir) ||
      parsed.direction;
    const startTime =
      cleanText(item?.startTime) ||
      cleanText(item?.startDate) ||
      cleanText(item?.start) ||
      undefined;
    const endTime =
      cleanText(item?.endTime) ||
      cleanText(item?.endDate) ||
      cleanText(item?.end) ||
      undefined;

    const distanceMiles = haversineMiles(center, { lat, lng });
    const id = String(item?.id ?? item?.incidentId ?? item?.eventId ?? `${severity}:${lat.toFixed(5)},${lng.toFixed(5)}:${shortDesc.slice(0, 36)}`);
    out.push({
      id,
      severity,
      lat,
      lng,
      shortDesc,
      fullDesc: typeof fullDesc === 'string' ? fullDesc : undefined,
      type,
      kind,
      road,
      crossStreet,
      between,
      direction,
      startTime,
      endTime,
      distanceMiles,
      delayMinutes,
    });
  }

  out.sort((a, b) => (b.severity - a.severity) || (a.distanceMiles - b.distanceMiles));
  return out;
}

async function fetchIncidentsByBbox(opts: {
  apiKey: string;
  centerForDistance: { lat: number; lng: number };
  bbox: { lat1: number; lng1: number; lat2: number; lng2: number };
  filters: string[];
  cacheTtlMs: number;
}): Promise<{ incidents: NormalizedIncident[]; ts: number }> {
  const key = JSON.stringify({
    apiKey: opts.apiKey,
    bbox: [opts.bbox.lat1, opts.bbox.lng1, opts.bbox.lat2, opts.bbox.lng2],
    filters: opts.filters,
  });

  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.ts < opts.cacheTtlMs) {
    return { incidents: cached.incidents, ts: cached.ts };
  }

  const url = new URL('https://www.mapquestapi.com/traffic/v2/incidents');
  url.searchParams.set('key', opts.apiKey);
  url.searchParams.set('boundingBox', `${opts.bbox.lat1},${opts.bbox.lng1},${opts.bbox.lat2},${opts.bbox.lng2}`);
  url.searchParams.set('filters', opts.filters.join(','));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Traffic incidents request failed (${res.status})`);
  const json: any = await res.json();
  const incidentsRaw = Array.isArray(json?.incidents) ? json.incidents : Array.isArray(json?.results) ? json.results : [];
  const incidents = normalizeIncidents(incidentsRaw, opts.centerForDistance);
  const ts = Date.now();
  responseCache.set(key, { ts, incidents });
  return { incidents, ts };
}

function severityToMarkerColor(sev: Severity) {
  if (sev === 4) return '#ef4444';
  if (sev === 3) return '#f97316';
  if (sev === 2) return '#facc15';
  return '#22c55e';
}

function isLikelyRoadClosure(desc?: string) {
  const s = (desc || '').toLowerCase();
  return s.includes('road closed') || s.includes('closure') || s.includes('lanes closed') || s.includes('closed');
}

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function incidentIconDataUri(kind: IncidentKind, color: string) {
  // Filled circular background + scaled glyph so it reads clearly on busy map tiles.
  const glyphMarkup =
    kind === 'closure'
      ? `<path d="M224,64H32A16,16,0,0,0,16,80v72a16,16,0,0,0,16,16H56v32a8,8,0,0,0,16,0V168H184v32a8,8,0,0,0,16,0V168h24a16,16,0,0,0,16-16V80A16,16,0,0,0,224,64Zm0,64.69L175.31,80H224ZM80.69,80l72,72H103.31L32,80.69V80ZM32,103.31,80.69,152H32ZM224,152H175.31l-72-72h49.38L224,151.32V152Z" fill="white" opacity="0.96"/>`
      : kind === 'construction'
        ? `<path d="M232,208H213.69L153.42,34.75A16,16,0,0,0,138.31,24H117.69a16,16,0,0,0-15.11,10.74L42.31,208H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16ZM95.43,104h65.14l16.7,48H78.73Zm22.26-64h20.62L155,88H101ZM73.17,168H182.83l13.92,40H59.25Z" fill="white" opacity="0.96"/>`
        : // Traffic: "car fleet" icon (provided SVG), flattened into 3 paths with our fill/styling.
          `<g transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">
            <path d="M 57.254 54.832 l -3.246 -3.37 l -3.893 -9.728 c -0.676 -1.686 -2.199 -2.864 -3.978 -3.074 c -10.144 -1.2 -20.432 -1.199 -30.578 0 c -1.779 0.21 -3.303 1.388 -3.977 3.074 l -3.894 9.728 l -3.245 3.37 C 1.392 58 -0.219 62.335 0.024 66.727 l 0.361 6.526 c 0.033 0.603 0.15 1.182 0.326 1.734 v 8.747 c 0 1.469 1.195 2.664 2.663 2.664 h 8.723 c 1.469 0 2.663 -1.195 2.663 -2.664 v -3.914 h 32.174 v 3.914 c 0 1.469 1.195 2.664 2.663 2.664 h 8.724 c 1.469 0 2.664 -1.195 2.664 -2.664 v -8.749 c 0.176 -0.551 0.292 -1.128 0.325 -1.731 l 0.361 -6.526 C 61.915 62.336 60.304 58 57.254 54.832 z M 55.787 63.05 c 1.375 2.685 0.742 5.756 -1.414 6.861 c -2.156 1.104 -5.019 -0.177 -6.394 -2.861 c -1.375 -2.685 -0.742 -5.756 1.414 -6.86 C 51.549 59.084 54.412 60.365 55.787 63.05 z M 12.924 42.362 c 0.554 -1.383 1.812 -2.372 3.292 -2.547 c 9.755 -1.153 19.51 -1.153 29.265 0 c 1.48 0.175 2.738 1.164 3.292 2.547 l 3.794 9.479 c -14.479 -0.769 -28.957 -0.769 -43.436 0 L 12.924 42.362 z M 41.099 66.926 c 0 0.568 -0.461 1.028 -1.028 1.028 H 21.625 c -0.568 0 -1.028 -0.461 -1.028 -1.028 c 0 -0.568 0.46 -1.028 1.028 -1.028 h 18.446 C 40.639 65.898 41.099 66.358 41.099 66.926 z M 5.909 63.05 c 1.375 -2.685 4.238 -3.966 6.394 -2.861 c 2.156 1.104 2.789 4.176 1.414 6.86 c -1.375 2.685 -4.238 3.966 -6.394 2.861 C 5.167 68.806 4.534 65.734 5.909 63.05 z M 44.526 72.753 H 17.169 c -0.568 0 -1.028 -0.461 -1.028 -1.028 c 0 -0.568 0.46 -1.028 1.028 -1.028 h 27.357 c 0.568 0 1.028 0.461 1.028 1.028 C 45.555 72.292 45.094 72.753 44.526 72.753 z" fill="white" opacity="0.96"/>
            <path d="M 85.558 36.389 l -3.246 -3.37 l -3.893 -9.728 c -0.676 -1.686 -2.199 -2.864 -3.978 -3.074 c -10.144 -1.2 -20.432 -1.199 -30.578 0 c -1.779 0.21 -3.303 1.388 -3.977 3.074 l -3.894 9.728 l -0.788 0.818 c 3.811 0.123 7.616 0.404 11.401 0.851 c 3.233 0.381 6 2.511 7.221 5.558 l 2.885 7.21 h 11.664 c 0.568 0 1.028 0.461 1.028 1.028 c 0 0.568 -0.461 1.028 -1.028 1.028 H 57.683 l 2.453 2.545 c 0.061 0.063 0.111 0.134 0.171 0.197 h 12.525 c 0.568 0 1.028 0.461 1.028 1.028 s -0.461 1.028 -1.028 1.028 H 61.972 c 1.517 2.13 2.601 4.531 3.189 7.066 h 10.078 v 3.914 c 0 1.469 1.195 2.664 2.663 2.664 h 8.724 c 1.469 0 2.664 -1.195 2.664 -2.664 v -8.749 c 0.176 -0.551 0.292 -1.128 0.325 -1.731 l 0.361 -6.526 C 90.22 43.893 88.609 39.558 85.558 36.389 z M 37.435 33.398 l 3.794 -9.479 c 0.554 -1.383 1.812 -2.372 3.292 -2.547 c 9.755 -1.153 19.51 -1.153 29.265 0 c 1.48 0.175 2.738 1.164 3.292 2.547 l 3.794 9.479 C 66.392 32.63 51.913 32.63 37.435 33.398 z M 82.678 51.468 c -2.156 1.104 -5.019 -0.177 -6.394 -2.861 c -1.375 -2.685 -0.742 -5.756 1.414 -6.86 c 2.156 -1.104 5.019 0.177 6.394 2.861 S 84.834 50.364 82.678 51.468 z" fill="white" opacity="0.96"/>
            <path d="M 32.535 30.843 h -8.88 c -0.512 0 -0.928 -0.416 -0.928 -0.928 s 0.415 -0.928 0.928 -0.928 h 9.643 l 2.875 -7.182 c 1.22 -3.047 3.987 -5.178 7.222 -5.56 c 0.673 -0.08 1.349 -0.14 2.023 -0.209 c -11.012 -0.401 -22.024 -0.315 -33.035 0.269 l 3.423 -8.551 c 0.5 -1.248 1.635 -2.14 2.97 -2.298 c 8.8 -1.041 17.601 -1.041 26.401 0 c 1.335 0.158 2.47 1.05 2.97 2.298 l 3.12 7.796 c 0.471 -0.028 0.942 -0.04 1.413 -0.062 l -3.321 -8.3 c -0.609 -1.521 -1.984 -2.583 -3.589 -2.773 c -9.152 -1.082 -18.433 -1.082 -27.586 0 c -1.605 0.19 -2.98 1.252 -3.588 2.773 l -3.513 8.776 l -2.928 3.04 c -2.752 2.858 -4.205 6.77 -3.986 10.732 l 0.326 5.887 c 0.03 0.544 0.135 1.067 0.294 1.564 v 7.891 c 0 0.573 0.21 1.092 0.545 1.505 l 2.536 -6.335 c 1.22 -3.047 3.987 -5.178 7.222 -5.56 c 1.208 -0.143 2.419 -0.265 3.631 -0.375 c -0.002 -0.024 -0.014 -0.044 -0.014 -0.069 c 0 -0.512 0.415 -0.928 0.928 -0.928 h 10.518 L 32.535 30.843 z M 16.52 30.026 c -1.241 2.422 -3.823 3.578 -5.768 2.581 c -1.945 -0.996 -2.516 -3.767 -1.276 -6.189 c 1.241 -2.422 3.823 -3.578 5.768 -2.581 C 17.19 24.833 17.761 27.604 16.52 30.026 z" fill="white" opacity="0.96"/>
          </g>`;

  // Background is the severity color; glyph is white for maximum contrast.
  const bg = `<circle cx="128" cy="128" r="124" fill="${color}" stroke="white" stroke-width="10" />`;
  // Scale glyph down so it fits comfortably inside the circle (some paths reach the viewBox edges).
  const glyph = `
    <g transform="translate(128 128) scale(0.78) translate(-128 -128)">
      ${glyphMarkup}
    </g>
  `.trim();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 256 256">
      ${bg}
      ${glyph}
    </svg>
  `.trim();

  return svgDataUri(svg);
}

function kindToMarkerColor(kind: IncidentKind) {
  // Per request: kind-based map marker colors (independent of severity color-coding in the list UI).
  if (kind === 'closure') return '#eab308'; // slightly darker yellow
  if (kind === 'construction') return '#f97316'; // orange
  return '#3b82f6'; // blue (traffic)
}

function congestionColorFromSpeedMph(mph: number) {
  // Requested palette: clear = blue; congestion ramps yellow → orange → red.
  if (!Number.isFinite(mph)) return '#9CA3AF';
  if (mph >= 45) return '#3b82f6'; // blue (clear)
  if (mph >= 30) return '#facc15'; // yellow (light congestion)
  if (mph >= 18) return '#f97316'; // orange (moderate)
  if (mph >= 10) return '#ef4444'; // red (heavy)
  return '#b91c1c'; // deep red (severe)
}

async function fetchTrafficSegments(opts: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  signal?: AbortSignal;
}): Promise<{ coords: { lat: number; lng: number }[]; color: string; speedMph: number }[]> {
  // Use Next proxy (avoids CORS and keeps consistent with other widgets)
  const url = new URL('/api/mapquest', window.location.origin);
  url.searchParams.set('endpoint', 'directions');
  url.searchParams.set('from', `${opts.from.lat},${opts.from.lng}`);
  url.searchParams.set('to', `${opts.to.lat},${opts.to.lng}`);
  url.searchParams.set('routeType', 'fastest');
  url.searchParams.set('useTraffic', 'true');

  const res = await fetch(url.toString(), { signal: opts.signal });
  if (!res.ok) throw new Error(`Directions request failed (${res.status})`);
  const data: any = await res.json();
  const route = data?.route;
  if (!route || route?.routeError) throw new Error(route?.routeError?.message || 'Could not calculate route');

  const shapePoints: any[] = route?.shape?.shapePoints;
  const maneuvers: any[] = route?.legs?.[0]?.maneuvers || [];
  const maneuverIndexes: number[] = Array.isArray(route?.shape?.maneuverIndexes) ? route.shape.maneuverIndexes : [];
  const pointPairs = Array.isArray(shapePoints) ? Math.floor(shapePoints.length / 2) : 0;
  if (!Array.isArray(shapePoints) || shapePoints.length < 4) return [];

  const segments: { coords: { lat: number; lng: number }[]; color: string; speedMph: number }[] = [];
  if (maneuvers.length > 0 && maneuverIndexes.length === maneuvers.length && pointPairs > 1) {
    for (let i = 0; i < maneuvers.length; i++) {
      const startPt = Math.max(0, Math.min(pointPairs - 1, Number(maneuverIndexes[i]) || 0));
      const endPt =
        i === maneuvers.length - 1
          ? pointPairs - 1
          : Math.max(startPt + 1, Math.min(pointPairs - 1, Number(maneuverIndexes[i + 1]) || startPt + 1));

      const coords: { lat: number; lng: number }[] = [];
      for (let p = startPt; p <= endPt; p++) {
        const lat = Number(shapePoints[p * 2]);
        const lng = Number(shapePoints[p * 2 + 1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        coords.push({ lat, lng });
      }
      if (coords.length < 2) continue;

      const distMi = Number(maneuvers[i]?.distance);
      const timeS = Number(maneuvers[i]?.time);
      const mph = Number.isFinite(distMi) && Number.isFinite(timeS) && timeS > 0 ? distMi / (timeS / 3600) : NaN;
      segments.push({ coords, speedMph: mph, color: congestionColorFromSpeedMph(mph) });
    }
  } else {
    // Fallback: single segment for entire shape
    const coords: { lat: number; lng: number }[] = [];
    for (let i = 0; i < shapePoints.length - 1; i += 2) {
      const lat = Number(shapePoints[i]);
      const lng = Number(shapePoints[i + 1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      coords.push({ lat, lng });
    }
    if (coords.length >= 2) segments.push({ coords, speedMph: NaN, color: '#9CA3AF' });
  }

  return segments;
}

async function fetchRoutePolyline(opts: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}): Promise<{
  polyline: { lat: number; lng: number }[];
  segments: { coords: { lat: number; lng: number }[]; color: string; speedMph: number }[];
  routeTimeMinutes?: number;
  routeRealTimeMinutes?: number;
  routeDelayMinutes?: number;
  bbox: { lat1: number; lng1: number; lat2: number; lng2: number };
}> {
  // Use Next proxy (avoids CORS and keeps consistent with other widgets)
  const url = new URL('/api/mapquest', window.location.origin);
  url.searchParams.set('endpoint', 'directions');
  url.searchParams.set('from', `${opts.from.lat},${opts.from.lng}`);
  url.searchParams.set('to', `${opts.to.lat},${opts.to.lng}`);
  url.searchParams.set('routeType', 'fastest');
  url.searchParams.set('useTraffic', 'true');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Directions request failed (${res.status})`);
  const data: any = await res.json();
  const route = data?.route;
  if (!route || route?.routeError) {
    throw new Error(route?.routeError?.message || 'Could not calculate route');
  }

  const timeS = Number(route?.time);
  const realTimeS = Number(route?.realTime);
  const routeTimeMinutes = Number.isFinite(timeS) ? Math.round(timeS / 60) : undefined;
  const routeRealTimeMinutes = Number.isFinite(realTimeS) ? Math.round(realTimeS / 60) : undefined;
  const routeDelayMinutes =
    (typeof routeTimeMinutes === 'number' && typeof routeRealTimeMinutes === 'number')
      ? Math.max(0, routeRealTimeMinutes - routeTimeMinutes)
      : undefined;

  const shapePoints: any[] = route?.shape?.shapePoints;
  if (!Array.isArray(shapePoints) || shapePoints.length < 4) {
    throw new Error('Route shape missing');
  }

  const maneuvers: any[] = route?.legs?.[0]?.maneuvers || [];
  const maneuverIndexes: number[] = Array.isArray(route?.shape?.maneuverIndexes) ? route.shape.maneuverIndexes : [];
  const pointPairs = Math.floor(shapePoints.length / 2);

  const polyline: { lat: number; lng: number }[] = [];
  for (let i = 0; i < shapePoints.length - 1; i += 2) {
    const lat = Number(shapePoints[i]);
    const lng = Number(shapePoints[i + 1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    polyline.push({ lat, lng });
  }
  if (polyline.length < 2) throw new Error('Invalid route shape');

  const segments: { coords: { lat: number; lng: number }[]; color: string; speedMph: number }[] = [];
  if (maneuvers.length > 0 && maneuverIndexes.length === maneuvers.length && pointPairs > 1) {
    for (let i = 0; i < maneuvers.length; i++) {
      const startPt = Math.max(0, Math.min(pointPairs - 1, Number(maneuverIndexes[i]) || 0));
      const endPt = i === maneuvers.length - 1
        ? pointPairs - 1
        : Math.max(startPt + 1, Math.min(pointPairs - 1, Number(maneuverIndexes[i + 1]) || startPt + 1));

      const coords: { lat: number; lng: number }[] = [];
      for (let p = startPt; p <= endPt; p++) {
        const lat = Number(shapePoints[p * 2]);
        const lng = Number(shapePoints[p * 2 + 1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        coords.push({ lat, lng });
      }
      if (coords.length < 2) continue;

      const distMi = Number(maneuvers[i]?.distance);
      const timeS = Number(maneuvers[i]?.time);
      const mph = (Number.isFinite(distMi) && Number.isFinite(timeS) && timeS > 0) ? (distMi / (timeS / 3600)) : NaN;
      segments.push({ coords, speedMph: mph, color: congestionColorFromSpeedMph(mph) });
    }
  }

  // Overlap segment endpoints a bit so rounded caps visually blend into a continuous line.
  // This reduces hard seams between colors.
  if (segments.length > 1) {
    const overlapped = segments.map((s) => ({ ...s, coords: [...s.coords] }));
    for (let i = 0; i < overlapped.length; i++) {
      const prev = overlapped[i - 1];
      const cur = overlapped[i];
      const next = overlapped[i + 1];
      if (prev?.coords?.length) {
        const p = prev.coords[prev.coords.length - 1];
        if (p) cur.coords.unshift(p);
      }
      if (next?.coords?.length) {
        const p = next.coords[0];
        if (p) cur.coords.push(p);
      }
    }
    // Replace while keeping order.
    segments.length = 0;
    segments.push(...overlapped);
  }

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of polyline) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  return {
    polyline,
    segments,
    routeTimeMinutes,
    routeRealTimeMinutes,
    routeDelayMinutes,
    bbox: { lat1: minLat, lng1: minLng, lat2: maxLat, lng2: maxLng },
  };
}

export default function LiveTrafficWidget({
  apiKey,
  center,
  title = 'Live Traffic',
  zoom = DEFAULT_ZOOM,
  width,
  height = DEFAULT_HEIGHT,
  refreshInterval = DEFAULT_REFRESH_S,
  incidentFilters = DEFAULT_FILTERS,
  theme = 'dark',
  accentColor = '#2563eb',
  fontFamily,
  borderRadius = '1rem',
}: TrafficWidgetProps) {
  const z = clamp(Math.round(zoom), 1, 18);
  const refreshMs = Math.max(15, Math.round(refreshInterval)) * 1000;

  const isDark = theme === 'dark';

  // Area mode center can be changed by the user (starting location).
  const [areaCenter, setAreaCenter] = useState<{ lat: number; lng: number }>(center);
  const [areaQuery, setAreaQuery] = useState('');
  const [areaRadiusMiles, setAreaRadiusMiles] = useState(5);
  const [areaSettingsOpen, setAreaSettingsOpen] = useState(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<NormalizedIncident[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const [mode, setMode] = useState<'area' | 'route'>('area');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIncident = useMemo(() => incidents.find((i) => i.id === selectedId) || null, [incidents, selectedId]);
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(() => new Set<Severity>([1, 2, 3, 4]));

  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [routeFromLL, setRouteFromLL] = useState<{ lat: number; lng: number } | null>(null);
  const [routeToLL, setRouteToLL] = useState<{ lat: number; lng: number } | null>(null);
  const [routeState, setRouteState] = useState<RouteState>({ status: 'idle' });
  const [corridorMiles, setCorridorMiles] = useState(1.0);

  const [zoomToLocation, setZoomToLocation] = useState<{ lat: number; lng: number; zoom?: number } | undefined>(undefined);

  useEffect(() => {
    setAreaCenter(center);
  }, [center.lat, center.lng]);

  const filters = useMemo(() => {
    const safe = (incidentFilters && incidentFilters.length ? incidentFilters : DEFAULT_FILTERS) as string[];
    return safe;
  }, [incidentFilters]);

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const i of incidents) counts[i.severity] += 1;
    return counts;
  }, [incidents]);

  const mapPolygons = useMemo(() => {
    // Per request: no isochrone overlays by default. Keep the map focused on traffic-on-roads.
    return [];
  }, []);

  const areaBbox = useMemo(() => bboxFromRadiusMiles(areaCenter, areaRadiusMiles), [areaCenter, areaRadiusMiles]);
  const areaFitBounds = useMemo(
    () => ({ south: areaBbox.lat1, west: areaBbox.lng1, north: areaBbox.lat2, east: areaBbox.lng2 }),
    [areaBbox]
  );

  const routeFilteredIncidents = useMemo(() => {
    if (mode !== 'route') return incidents;
    if (routeState.status !== 'ready') return incidents;
    if (!routeState.polyline || routeState.polyline.length < 2) return incidents;

    const line = turf.lineString(routeState.polyline.map((p) => [p.lng, p.lat]));
    const buffered = turf.buffer(line, Math.max(0.2, corridorMiles), { units: 'miles' });

    const scored = incidents
      .map((i) => {
        const pt = turf.point([i.lng, i.lat]);
        const within = turf.booleanPointInPolygon(pt, buffered as any);
        const d = turf.pointToLineDistance(pt, line, { units: 'miles' });
        return { i, within, d };
      })
      .filter((x) => x.within)
      .sort((a, b) => (b.i.severity - a.i.severity) || (a.d - b.d));

    return scored.map((s) => s.i);
  }, [mode, routeState, incidents, corridorMiles]);

  const reverseCacheRef = useRef<Map<string, string>>(new Map());
  const [selectedNearbyLabel, setSelectedNearbyLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedIncident) {
      setSelectedNearbyLabel(null);
      return;
    }
    const cached = reverseCacheRef.current.get(selectedIncident.id);
    if (cached) {
      setSelectedNearbyLabel(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await reverseGeocode(selectedIncident.lat, selectedIncident.lng);
        if (cancelled) return;
        const parts = [r?.street, r?.adminArea5, r?.adminArea3].filter(Boolean);
        const label = parts.length ? parts.join(', ') : null;
        if (label) reverseCacheRef.current.set(selectedIncident.id, label);
        setSelectedNearbyLabel(label);
      } catch (_) {
        if (!cancelled) setSelectedNearbyLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIncident?.id]);

  const selectedMapMarker = useMemo(() => {
    if (!selectedIncident) return [];
    const markerColor = kindToMarkerColor(selectedIncident.kind);
    return [
      {
        lat: selectedIncident.lat,
        lng: selectedIncident.lng,
        type: 'default' as const,
        color: markerColor,
        label: `${severityMeta[selectedIncident.severity].label}: ${selectedIncident.shortDesc}`,
        zIndexOffset: 8000,
        iconUrl: incidentIconDataUri(selectedIncident.kind, markerColor),
        iconCircular: false,
        clusterable: false,
        iconSize: [32, 32] as [number, number],
      },
    ];
  }, [selectedIncident]);

  const incidentMarkers = useMemo(() => {
    const base = mode === 'route' ? routeFilteredIncidents : incidents;
    const filtered = base.filter((i) => severityFilter.has(i.severity));
    // Area mode can be very dense; keep a safety cap there. Route corridor should show all events.
    const visible = mode === 'area' ? filtered.slice(0, 250) : filtered;
    return visible.map((i) => {
      const c = kindToMarkerColor(i.kind);
      const isSelected = i.id === selectedId;
      return {
        lat: i.lat,
        lng: i.lng,
        type: 'default' as const,
        color: c,
        label: `${severityMeta[i.severity].label}: ${i.shortDesc}`,
        zIndexOffset: isSelected ? 10000 : i.severity * 100,
        iconUrl: incidentIconDataUri(i.kind, c),
        iconCircular: false,
        clusterable: !isSelected,
        iconSize: (isSelected ? [32, 32] : [28, 28]) as [number, number],
        onClick: () => {
          setSelectedId(i.id);
          setZoomToLocation({ lat: i.lat, lng: i.lng, zoom: 15 });
        },
      };
    });
  }, [mode, incidents, routeFilteredIncidents, severityFilter, selectedId]);

  const radiusCircle = useMemo(() => {
    if (mode !== 'area') return [];
    return [
      {
        lat: areaCenter.lat,
        lng: areaCenter.lng,
        radius: Math.max(0.25, areaRadiusMiles) * 1609.34,
        color: accentColor,
        fillOpacity: 0.06,
        strokeOpacity: 0.35,
        strokeWeight: 2,
      },
    ];
  }, [mode, areaCenter.lat, areaCenter.lng, areaRadiusMiles, accentColor]);

  async function load() {
    if (!apiKey) {
      setError('Missing MapQuest API key.');
      setLoading(false);
      return;
    }

    setError(null);
    setRefreshing(true);
    try {
      const bbox =
        mode === 'route' && routeState.status === 'ready'
          ? routeState.bbox
          : areaBbox;

      const centerForDistance =
        mode === 'route' && routeFromLL
          ? routeFromLL
          : areaCenter;

      const { incidents: nextRaw, ts } = await fetchIncidentsByBbox({
        apiKey,
        centerForDistance,
        bbox,
        filters,
        cacheTtlMs: refreshMs,
      });

      const next = mode === 'route' ? nextRaw : nextRaw;
      setIncidents(next);
      setLastUpdated(ts);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to load traffic data.');
    } finally {
      setLoading(false);
      // Fade “refresh” state out a beat later so the transition feels intentional.
      window.setTimeout(() => setRefreshing(false), 250);
    }
  }

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, areaCenter.lat, areaCenter.lng, areaRadiusMiles, z, filters.join('|'), mode, routeState.status]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, refreshMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs, apiKey, areaCenter.lat, areaCenter.lng, areaRadiusMiles, z, filters.join('|'), mode, routeState.status]);

  const widgetH = Math.max(520, Math.round(height));
  const widgetW = isFiniteNumber(width) ? Math.max(280, Math.round(width)) : undefined;
  const outerStyle: React.CSSProperties = {
    width: widgetW ? `${widgetW}px` : '100%',
    height: `${widgetH}px`,
  };

  const listBase = mode === 'route' ? routeFilteredIncidents : incidents;
  const list = useMemo(() => listBase.filter((i) => severityFilter.has(i.severity)), [listBase, severityFilter]);

  const countsForListBase = useMemo(() => {
    const counts: Record<Severity, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const i of listBase) counts[i.severity] += 1;
    return counts;
  }, [listBase]);

  useEffect(() => {
    // If the currently selected incident is filtered out, clear the selection to avoid confusion.
    if (!selectedId) return;
    if (!list.some((i) => i.id === selectedId)) setSelectedId(null);
  }, [severityFilter, list, selectedId]);

  const calcRoute = async () => {
    if (!apiKey) return;
    if (!routeFromLL || !routeToLL) {
      setRouteState({ status: 'error', message: 'Pick both a start and end location.' });
      return;
    }
    setRouteState({ status: 'loading' });
    try {
      const r = await fetchRoutePolyline({ from: routeFromLL, to: routeToLL });
      setRouteState({
        status: 'ready',
        polyline: r.polyline,
        segments: r.segments,
        routeTimeMinutes: r.routeTimeMinutes,
        routeRealTimeMinutes: r.routeRealTimeMinutes,
        routeDelayMinutes: r.routeDelayMinutes,
        bbox: r.bbox,
      });
      setZoomToLocation(undefined);
    } catch (e: any) {
      setRouteState({ status: 'error', message: e?.message ? String(e.message) : 'Failed to build route.' });
    }
  };

  const clearRoute = () => {
    setRouteFrom('');
    setRouteTo('');
    setRouteFromLL(null);
    setRouteToLL(null);
    setRouteState({ status: 'idle' });
    setZoomToLocation(undefined);
  };

  // Auto-select a meaningful incident after first load so the map shows something beyond center iso.
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    // In Area mode we want the map to stay fit to the radius bounds, not zoom into a single incident.
    if (mode === 'area') return;
    if (didAutoSelectRef.current) return;
    if (!incidents || incidents.length === 0) return;
    const best = incidents.find((i) => i.severity >= 3) || incidents[0];
    if (!best) return;
    didAutoSelectRef.current = true;
    setSelectedId(best.id);
    setZoomToLocation({ lat: best.lat, lng: best.lng, zoom: 14 });
  }, [incidents, mode]);

  return (
    <div
      className="prism-widget w-full flex flex-col"
      data-theme={isDark ? 'dark' : 'light'}
      style={{
        ...outerStyle,
        fontFamily: fontFamily || 'var(--brand-font)',
        borderRadius,
        ['--brand-primary' as any]: accentColor,
      } as React.CSSProperties}
      aria-label="Live traffic widget"
    >
      <WidgetHeader
        title="Live Traffic"
        subtitle={
          lastUpdated
            ? `${
                mode === 'area'
                  ? (areaQuery?.trim()
                      ? areaQuery.trim()
                      : `${areaCenter.lat.toFixed(3)}, ${areaCenter.lng.toFixed(3)}`) + ` · ${areaRadiusMiles} mi`
                  : mode === 'route'
                    ? (routeFrom?.trim() && routeTo?.trim()
                        ? `${routeFrom.trim()} → ${routeTo.trim()}`
                        : 'Route')
                    : ''
              } · Last updated: ${minutesAgo(lastUpdated)}`
            : `Fetching latest conditions…`
        }
      />

      {/* Two-panel layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Map (right on desktop) */}
        <div className="h-[380px] md:h-full md:flex-1 md:order-2 min-h-0 relative">
          {/* Map-top-right controls */}
          <div className="absolute top-3 right-3 z-[500] flex items-center gap-2">
            <div
              className="inline-flex overflow-hidden rounded-lg border shadow-sm"
              style={{
                borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
                background: isDark ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <button
                type="button"
                onClick={() => setMode('area')}
                className="px-3 py-2 text-xs font-semibold"
                style={{
                  background: mode === 'area' ? 'var(--brand-primary)' : 'transparent',
                  color: mode === 'area' ? 'white' : 'var(--text-main)',
                }}
                aria-label="Area mode"
              >
                Area
              </button>
              <button
                type="button"
                onClick={() => setMode('route')}
                className="px-3 py-2 text-xs font-semibold border-l"
                style={{
                  borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
                  background: mode === 'route' ? 'var(--brand-primary)' : 'transparent',
                  color: mode === 'route' ? 'white' : 'var(--text-main)',
                }}
                aria-label="Route mode"
              >
                <span className="inline-flex items-center gap-2">
                  <Route className="h-3.5 w-3.5" aria-hidden="true" />
                  Route
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-panel)',
                color: 'var(--text-main)',
              }}
              aria-label="Refresh traffic data"
            >
              <RefreshCw className={['h-3.5 w-3.5', refreshing ? 'animate-spin' : ''].join(' ')} aria-hidden="true" />
              Refresh
            </button>
          </div>
          <div className="w-full h-full">
            {/** Show all route corridor events on the map once a route is ready. */}
            {/** Otherwise (route not built yet), keep the map focused on the selected incident. */}
            {/** Area mode always shows incident markers. */}
            <MapQuestMap
              apiKey={apiKey}
              center={areaCenter}
              zoom={z}
              darkMode={isDark}
              height="100%"
              markers={
                mode === 'area'
                  ? incidentMarkers
                  : routeState.status === 'ready'
                    ? incidentMarkers
                    : selectedMapMarker
              }
              clusterMarkers={mode === 'area' || (mode === 'route' && routeState.status === 'ready')}
              clusterRadiusPx={56}
              circles={mode === 'area' ? radiusCircle : []}
              polygons={mapPolygons}
              showTraffic={true}
              interactive={true}
              zoomToLocation={zoomToLocation}
              fitBounds={mode === 'area' ? areaFitBounds : undefined}
              routePolyline={routeState.status === 'ready' ? routeState.polyline : undefined}
              // Route overlay: congestion-colored segments (blue=clear → yellow/orange/red=congested)
              routeSegments={
                routeState.status === 'ready'
                  ? routeState.segments.map((s) => ({ coords: s.coords, color: s.color, weight: 7, opacity: 0.95 }))
                  : undefined
              }
              showRoute={routeState.status === 'ready'}
            />
          </div>
        </div>

        {/* Controls/List panel (left on desktop) */}
        <div
          className="w-full md:w-[420px] flex-shrink-0 flex flex-col overflow-hidden border-t md:border-t-0 md:border-r md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar p-4">
            {/* Status */}
            {(loading || error) && (
              <div className="mb-3">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-main)' }}>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading traffic…
                  </div>
                ) : (
                  <div
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-main)', background: 'var(--bg-panel)' }}
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            )}

            {/* Area starting location */}
            {mode === 'area' && (
              <div
                className="mb-4 rounded-xl border p-3"
                style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-panel)' }}
              >
                <CollapsibleSection
                  title="Area settings"
                  summary={
                    areaQuery?.trim()
                      ? `${areaQuery.trim()} · ${areaRadiusMiles} mi`
                      : `${areaCenter.lat.toFixed(3)}, ${areaCenter.lng.toFixed(3)} · ${areaRadiusMiles} mi`
                  }
                  open={areaSettingsOpen}
                  defaultOpen={true}
                  onOpenChange={setAreaSettingsOpen}
                >
                  <div className="mt-3">
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Starting location
                    </div>
                    <AddressAutocomplete
                      value={areaQuery}
                      onChange={setAreaQuery}
                      placeholder="Search address or place…"
                      darkMode={isDark}
                      className="mt-1"
                      onSelect={(a) => {
                        if (typeof a.lat === 'number' && typeof a.lng === 'number') {
                          setAreaCenter({ lat: a.lat, lng: a.lng });
                          setZoomToLocation({ lat: a.lat, lng: a.lng, zoom: 12 });
                          setSelectedId(null);
                          setTimeout(() => void load(), 0);
                        }
                      }}
                    />
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                        Radius (mi)
                      </div>
                      <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Showing events within{' '}
                        <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{areaRadiusMiles} mi</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        value={areaRadiusMiles}
                        onChange={(e) => setAreaRadiusMiles(Math.max(1, Math.min(50, Number(e.target.value) || 5)))}
                        className="w-20 rounded-md border px-2 py-2 text-xs"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                        aria-label="Radius miles"
                      />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        mi
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {[2, 5, 10, 20].map((v) => {
                      const active = areaRadiusMiles === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAreaRadiusMiles(v)}
                          className="rounded-full border px-2.5 py-1 text-xs font-semibold"
                          style={{
                            borderColor: active ? 'transparent' : 'var(--border-subtle)',
                            background: active ? 'var(--brand-primary)' : 'transparent',
                            color: active ? 'white' : 'var(--text-muted)',
                          }}
                          aria-label={`Set radius to ${v} miles`}
                        >
                          {v} mi
                        </button>
                      );
                    })}
                  </div>
                </CollapsibleSection>
              </div>
            )}

            {/* Route inputs */}
            {mode === 'route' && (
              <div className="mb-4">
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-main)' }}>
                  Route
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <AddressAutocomplete
                    value={routeFrom}
                    onChange={setRouteFrom}
                    placeholder="Start address…"
                    darkMode={isDark}
                    onSelect={(a) => {
                      setRouteFrom(a.displayString);
                      if (typeof a.lat === 'number' && typeof a.lng === 'number') setRouteFromLL({ lat: a.lat, lng: a.lng });
                    }}
                  />
                  <AddressAutocomplete
                    value={routeTo}
                    onChange={setRouteTo}
                    placeholder="End address…"
                    darkMode={isDark}
                    onSelect={(a) => {
                      setRouteTo(a.displayString);
                      if (typeof a.lat === 'number' && typeof a.lng === 'number') setRouteToLL({ lat: a.lat, lng: a.lng });
                    }}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Corridor (mi):{' '}
                      <input
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        value={corridorMiles}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const n = Number.isFinite(v) ? v : 1;
                          setCorridorMiles(Math.max(1, Math.min(50, Math.round(n))));
                        }}
                        className="ml-2 w-20 rounded-md border px-2 py-1 text-xs"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void calcRoute()}
                        className="rounded-lg border px-3 py-2 text-xs font-semibold"
                        style={{
                          borderColor: 'transparent',
                          background: 'var(--brand-primary)',
                          color: 'white',
                        }}
                      >
                        {routeState.status === 'loading' ? 'Building route…' : 'Show route'}
                      </button>
                      <button
                        type="button"
                        onClick={clearRoute}
                        className="rounded-lg border px-3 py-2 text-xs font-semibold"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                        }}
                        aria-label="Clear route"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {routeState.status === 'ready' && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {typeof routeState.routeRealTimeMinutes === 'number' && typeof routeState.routeTimeMinutes === 'number' ? (
                        <>
                          ETA: <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{routeState.routeRealTimeMinutes} min</span>
                          {' · '}
                          Delay vs typical:{' '}
                          <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                            +{routeState.routeDelayMinutes ?? 0} min
                          </span>
                        </>
                      ) : (
                        <>Route computed.</>
                      )}
                    </div>
                  )}
                  {routeState.status === 'error' && (
                    <div className="text-xs" style={{ color: 'var(--color-error)' }}>
                      {routeState.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="mb-4">
              <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                Events in {mode === 'route' ? 'route corridor' : 'area'}:{' '}
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{list.length}</span>
                <span style={{ color: 'var(--text-muted)' }}> / {listBase.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {([4, 3, 2, 1] as Severity[]).map((sev) => {
                  const meta = severityMeta[sev];
                  const count = countsForListBase[sev] ?? 0;
                  const chipClass = severityChipClass(sev, isDark);
                  const isOn = severityFilter.has(sev);
                  return (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => {
                        setSeverityFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(sev)) next.delete(sev);
                          else next.add(sev);
                          return next;
                        });
                      }}
                      className={[
                        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
                        chipClass,
                        isOn ? '' : (isDark ? 'opacity-40' : 'opacity-45'),
                      ].join(' ')}
                      aria-label={`${count} ${meta.label} incidents`}
                      aria-pressed={isOn}
                    >
                      <span className={['h-2 w-2 rounded-full', meta.dot].join(' ')} aria-hidden="true" />
                      {count} {meta.label}
                    </button>
                  );
                })}
                <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                  {mode === 'route' ? `${list.length} along route` : `Viewport: ±${getBoundingBox(center, z).offset.toFixed(2)}°`}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Filter:{' '}
                  {[1, 2, 3, 4].every((s) => severityFilter.has(s as Severity))
                    ? 'All'
                    : severityFilter.size === 0
                      ? 'None'
                      : 'Custom'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSeverityFilter(new Set<Severity>([1, 2, 3, 4]))}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--text-main)' }}
                  >
                    Show all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverityFilter(new Set<Severity>())}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Hide all
                  </button>
                </div>
              </div>
            </div>

            {/* Incident list */}
            {(!loading && !error && list.length === 0) ? (
              <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--text-main)' }}>
                No incidents reported — traffic is clear!
              </div>
            ) : (
              <ul className="space-y-2" aria-label="Traffic incidents list">
                {list.slice(0, 80).map((i) => {
                  const meta = severityMeta[i.severity];
                  const isSelected = selectedId === i.id;
                  const locLine =
                    i.between
                      ? `${i.road ? i.road + ' ' : ''}between ${i.between}`
                      : i.road && i.crossStreet
                        ? `${i.road} @ ${i.crossStreet}`
                        : i.road
                          ? i.road
                          : i.crossStreet
                            ? i.crossStreet
                            : null;
                  const titleLine = locLine || i.shortDesc;
                  const secondaryLine =
                    locLine && i.shortDesc && i.shortDesc !== locLine
                      ? i.shortDesc
                      : (isSelected && i.fullDesc && i.fullDesc !== i.shortDesc ? i.fullDesc : null);
                  return (
                    <li
                      key={i.id}
                      onClick={() => {
                        setSelectedId(i.id);
                        setZoomToLocation({ lat: i.lat, lng: i.lng, zoom: 15 });
                      }}
                      className={[
                        'rounded-xl border p-2 cursor-pointer',
                        'transition-colors duration-150',
                        isSelected ? 'bg-[var(--bg-panel)]' : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]',
                      ].join(' ')}
                      style={{
                        borderColor: isSelected ? 'rgba(59,130,246,0.35)' : 'var(--border-subtle)',
                        opacity: refreshing ? 0.85 : 1,
                        boxShadow: isSelected
                          ? '0 0 0 2px rgba(59,130,246,0.25)'
                          : 'none',
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span className={['mt-1 h-2.5 w-2.5 rounded-full', meta.dot].join(' ')} aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                            {titleLine}
                          </div>
                          {secondaryLine && (
                            <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                              {secondaryLine}{i.direction ? ` · ${i.direction}` : ''}
                            </div>
                          )}
                          <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
                            <span>{i.distanceMiles.toFixed(1)} mi from center</span>
                            {mode === 'route' && typeof i.delayMinutes === 'number' && i.delayMinutes > 0 && (
                              <span className="ml-2">· +{i.delayMinutes} min delay</span>
                            )}
                          </div>
                          {isSelected && selectedNearbyLabel && (
                            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                              Nearby: {selectedNearbyLabel}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="prism-footer">
        <span aria-label="Powered by MapQuest">Powered by</span>
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
    </div>
  );
}

