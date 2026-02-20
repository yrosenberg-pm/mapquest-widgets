// components/widgets/RouteWeatherAlerts.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Eye,
  Loader2,
  MapPin,
  Navigation,
  Sun,
  Thermometer,
  Wind,
  AlertTriangle,
  CloudSun,
  Link2,
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import WidgetHeader from './WidgetHeader';
import CollapsibleSection from './CollapsibleSection';

type Severity = 'warning' | 'watch' | 'advisory';

type HereAutosuggestItem = {
  id?: string;
  title?: string;
  address?: { label?: string };
  position?: { lat: number; lng: number };
  access?: Array<{ lat: number; lng: number }>;
  resultType?: string;
};

type PlaceSelection = {
  label: string;
  lat: number;
  lng: number;
};

type HereRouteResponse = {
  routes?: Array<{
    sections?: Array<{
      polyline?: string;
      summary?: { length?: number; duration?: number };
    }>;
  }>;
};

type WeatherObservation = {
  temperature?: string | number;
  temperatureDesc?: string;
  iconName?: string;
  skyDescription?: string;
  humidity?: string | number;
  windSpeed?: string | number;
  visibility?: string | number;
  comfort?: string | number; // feels like
};

type ForecastDay = {
  dayOfWeek?: string;
  dayOfMonth?: string;
  highTemperature?: string | number;
  lowTemperature?: string | number;
  description?: string;
  iconName?: string;
  precipitationProbability?: string | number;
};

type ForecastHour = {
  localTime?: string;
  temperature?: string | number;
  description?: string;
  iconName?: string;
  precipitationProbability?: string | number;
};

type RouteConditionKind = 'clear' | 'rain' | 'snow' | 'ice' | 'fog' | 'wind' | 'unknown';

type RouteConditionPoint = {
  lat: number;
  lng: number;
  milesAt: number; // miles from start
  desc: string;
  tempF: number | null;
  precipProb: number | null; // 0..100 (if available)
  windMph: number | null;
  kind: RouteConditionKind;
};

type AlertItem = {
  type?: string;
  description?: string;
  severity?: string;
  startTime?: string;
  endTime?: string;
  url?: string;
  headline?: string;
};

type RouteAlert = {
  key: string;
  title: string;
  severity: Severity;
  detail?: string;
  timeWindow?: string;
  milesAt?: number;
  url?: string;
  lat: number;
  lng: number;
};

function severityFromTitle(title: string): Severity {
  const t = title.toLowerCase();
  if (t.includes('warning')) return 'warning';
  if (t.includes('watch')) return 'watch';
  return 'advisory';
}

function severityStyles(sev: Severity) {
  switch (sev) {
    case 'warning':
      return { bg: '#ef444415', border: '#ef444440', text: '#ef4444' };
    case 'watch':
      return { bg: '#f59e0b15', border: '#f59e0b40', text: '#f59e0b' };
    case 'advisory':
    default:
      return { bg: '#3b82f615', border: '#3b82f640', text: '#3b82f6' };
  }
}

function alertMarkerIconUri(sev: Severity) {
  // Map alert markers are intentionally a single color for quick scanning.
  // (Left panel still shows severity-specific colors.)
  const fill = '#F97316'; // orange
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="21" fill="${fill}" stroke="white" stroke-width="3.5"/>
      <g transform="translate(24 24)">
        <g fill="none" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <!-- Slightly smaller inner mark to match the visual weight of the condition icons -->
          <path d="M0 -12.2 L12.2 9.6 H-12.2 Z" />
          <line x1="0" y1="-4.4" x2="0" y2="3.0" />
          <circle cx="0" cy="6.8" r="1.1" fill="white" stroke="none" />
        </g>
      </g>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatMiles(n: number) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function formatAlertTimeWindow(startTime?: string, endTime?: string) {
  if (!startTime && !endTime) return undefined;
  const fmt = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const s = fmt(startTime);
  const e = fmt(endTime);
  if (s && e) return `${s} → ${e}`;
  return s || e || undefined;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickFirstNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = toNumber(v);
    if (n !== null) return n;
  }
  return null;
}

function collectTempNumbersDeep(obj: any, maxDepth = 4): number[] {
  const out: number[] = [];
  const seen = new Set<any>();
  const queue: Array<{ v: any; d: number }> = [{ v: obj, d: 0 }];
  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (!v || typeof v !== 'object') continue;
    if (seen.has(v)) continue;
    seen.add(v);
    if (d > maxDepth) continue;

    for (const [k, val] of Object.entries(v)) {
      // Only consider values under temperature-ish keys to avoid picking humidity/wind/etc.
      if (/temp|temperature|high|low|max|min/i.test(k)) {
        const n = toNumber(val);
        if (n !== null) out.push(n);
      }
      if (val && typeof val === 'object') queue.push({ v: val, d: d + 1 });
    }
  }
  // Filter to a plausible Fahrenheit range (keeps us from picking timestamps)
  return out.filter((n) => n >= -80 && n <= 160);
}

function findForecastArrayDeep(obj: any, maxDepth = 6): any[] {
  // Find the first array that looks like a daily forecast array.
  const seen = new Set<any>();
  const queue: Array<{ v: any; d: number }> = [{ v: obj, d: 0 }];

  const looksLikeForecastItem = (it: any) => {
    if (!it || typeof it !== 'object') return false;
    const keys = Object.keys(it);
    // Avoid picking hourly arrays (often contain localTime)
    if (keys.some(k => /localTime/i.test(k))) return false;
    const hasDay = keys.some(k => /dayOfWeek|weekday|day/i.test(k));
    const hasHiLo =
      keys.some(k => /highTemperature|lowTemperature|highTemp|lowTemp/i.test(k)) ||
      (keys.some(k => /max/i.test(k)) && keys.some(k => /min/i.test(k)));
    return hasDay && hasHiLo;
  };

  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (!v || typeof v !== 'object') continue;
    if (seen.has(v)) continue;
    seen.add(v);

    if (Array.isArray(v) && v.length > 0 && looksLikeForecastItem(v[0])) return v;

    if (d >= maxDepth) continue;
    for (const k of Object.keys(v)) {
      queue.push({ v: (v as any)[k], d: d + 1 });
    }
  }
  return [];
}

function extractDailyTemps(x: any): { high: number | null; low: number | null } {
  // Some payloads provide a combined string like "78/62"
  const combined = typeof x?.temperature === 'string' ? x.temperature : typeof x?.temp === 'string' ? x.temp : null;
  if (combined && combined.includes('/')) {
    const parts = combined.split('/').map(p => pickFirstNumber(p));
    const nums = parts.filter((n): n is number => n !== null);
    if (nums.length >= 2) {
      return { high: Math.max(nums[0], nums[1]), low: Math.min(nums[0], nums[1]) };
    }
  }

  // Try common flat keys first
  const high = pickFirstNumber(
    x?.highTemperature,
    x?.highTemperature?.value,
    x?.highTemperatureF,
    x?.temperatureHigh,
    x?.temperatureMax,
    x?.maxTemperature,
    x?.highTemp,
    x?.high,
    // Common HERE shapes: day/night segments
    x?.daySegment?.temperature,
    x?.daySegment?.temperature?.value,
    x?.day?.temperature,
    x?.day?.temperature?.value,
    x?.temperature?.high,
    x?.temperature?.max,
    x?.temp?.high,
    x?.temp?.max
  );
  const low = pickFirstNumber(
    x?.lowTemperature,
    x?.lowTemperature?.value,
    x?.lowTemperatureF,
    x?.temperatureLow,
    x?.temperatureMin,
    x?.minTemperature,
    x?.lowTemp,
    x?.low,
    x?.nightSegment?.temperature,
    x?.nightSegment?.temperature?.value,
    x?.night?.temperature,
    x?.night?.temperature?.value,
    x?.temperature?.low,
    x?.temperature?.min,
    x?.temp?.low,
    x?.temp?.min
  );
  if (high !== null || low !== null) return { high, low };

  // Fallback: collect any temperature-like numeric values inside the object and use max/min.
  const temps = collectTempNumbersDeep(x);
  if (temps.length >= 2) return { high: Math.max(...temps), low: Math.min(...temps) };
  if (temps.length === 1) return { high: temps[0], low: temps[0] };
  return { high: null, low: null };
}

function formatHereHourlyLabel(x: any): string {
  const raw =
    x?.localTime ??
    x?.localtime ??
    x?.validTimeLocal ??
    x?.validTimeUtc ??
    x?.utcTime ??
    x?.time ??
    x?.timestamp ??
    null;

  if (raw == null) return '—';

  // ISO timestamp
  if (typeof raw === 'string' && /T/.test(raw)) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // yyyymmddhhmm(ss)
  if (typeof raw === 'string' && /^\d{12,14}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6)) - 1;
    const d = Number(raw.slice(6, 8));
    const hh = Number(raw.slice(8, 10));
    const mm = Number(raw.slice(10, 12));
    const dt = new Date(y, m, d, hh, mm);
    if (!Number.isNaN(dt.getTime())) return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // MMDDHHMMSS (e.g., 1001142026 -> 10/01 14:20:26). We only show time-of-day.
  if (typeof raw === 'string' && /^\d{10}$/.test(raw)) {
    const hh = Number(raw.slice(4, 6));
    const mm = Number(raw.slice(6, 8));
    if (Number.isFinite(hh) && Number.isFinite(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      const dt = new Date();
      dt.setHours(hh, mm, 0, 0);
      return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  }

  // HHMM as number/string (e.g., 1300, "0730")
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0 && n <= 2359) {
    const hh = Math.floor(n / 100);
    const mm = n % 100;
    const dt = new Date();
    dt.setHours(hh, mm, 0, 0);
    return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // Last resort: show as string
  return String(raw);
}

function extractHourlyHourKey(x: any): { key: string; dt: Date } | null {
  const raw =
    x?.localTime ??
    x?.localtime ??
    x?.validTimeLocal ??
    x?.validTimeUtc ??
    x?.utcTime ??
    x?.time ??
    x?.timestamp ??
    null;

  const now = new Date();

  const mk = (dt: Date) => {
    // Normalize to "on the dot" so labels are 4:00, 5:00, etc.
    const normalized = new Date(dt);
    normalized.setMinutes(0, 0, 0);
    const y = normalized.getFullYear();
    const m = String(normalized.getMonth() + 1).padStart(2, '0');
    const d = String(normalized.getDate()).padStart(2, '0');
    const hh = String(normalized.getHours()).padStart(2, '0');
    return { key: `${y}-${m}-${d} ${hh}`, dt: normalized };
  };

  if (raw == null) return null;

  // ISO timestamp
  if (typeof raw === 'string' && /T/.test(raw)) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return mk(dt);
  }

  // yyyymmddhhmm(ss)
  if (typeof raw === 'string' && /^\d{12,14}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6)) - 1;
    const d = Number(raw.slice(6, 8));
    const hh = Number(raw.slice(8, 10));
    const mm = Number(raw.slice(10, 12));
    const dt = new Date(y, m, d, hh, mm);
    if (!Number.isNaN(dt.getTime())) return mk(dt);
  }

  // MMDDHHMMSS (10 digits)
  if (typeof raw === 'string' && /^\d{10}$/.test(raw)) {
    const mm = Number(raw.slice(0, 2)) - 1;
    const dd = Number(raw.slice(2, 4));
    const hh = Number(raw.slice(4, 6));
    const min = Number(raw.slice(6, 8));
    const dt = new Date(now.getFullYear(), mm, dd, hh, min);
    if (!Number.isNaN(dt.getTime())) return mk(dt);
  }

  // HHMM numeric-ish
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0 && n <= 2359) {
    const hh = Math.floor(n / 100);
    const min = n % 100;
    const dt = new Date(now);
    dt.setHours(hh, min, 0, 0);
    return mk(dt);
  }

  return null;
}

function formatTempNoDecimals(v: unknown): string {
  const n = toNumber(v);
  if (n === null) return '--';
  return String(Math.round(n));
}

function extractDayOfMonth(x: any): string | undefined {
  const raw =
    x?.localTime ??
    x?.utcTime ??
    x?.validTimeLocal ??
    x?.validTimeUtc ??
    x?.date ??
    x?.forecastTime ??
    x?.time ??
    null;

  if (!raw) return undefined;

  // ISO timestamp
  if (typeof raw === 'string' && /T/.test(raw)) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return String(dt.getDate());
  }

  // yyyymmddhhmm(ss) or yyyymmdd
  if (typeof raw === 'string' && /^\d{8,14}$/.test(raw)) {
    const d = Number(raw.slice(6, 8));
    if (Number.isFinite(d) && d >= 1 && d <= 31) return String(d);
  }

  return undefined;
}

function extractDateKey(x: any): string | undefined {
  const raw =
    x?.localTime ??
    x?.utcTime ??
    x?.validTimeLocal ??
    x?.validTimeUtc ??
    x?.date ??
    x?.forecastTime ??
    x?.time ??
    null;

  if (!raw) return undefined;

  // ISO timestamp
  if (typeof raw === 'string' && /T/.test(raw)) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // yyyymmddhhmm(ss) or yyyymmdd
  if (typeof raw === 'string' && /^\d{8,14}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return `${y}-${m}-${d}`;
  }

  return undefined;
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.7613; // miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function pointToSegmentDistanceMiles(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  // Equirectangular approximation for short distances: project to meters around p.lat
  const latRad = (p.lat * Math.PI) / 180;
  const mx = (lng: number) => lng * 111_320 * Math.cos(latRad);
  const my = (lat: number) => lat * 110_574;

  const px = mx(p.lng);
  const py = my(p.lat);
  const ax = mx(a.lng);
  const ay = my(a.lat);
  const bx = mx(b.lng);
  const by = my(b.lat);

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  let t = abLen2 === 0 ? 0 : (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;
  const meters = Math.sqrt(dx * dx + dy * dy);
  return meters / 1609.34;
}

function pointToPolylineDistanceMiles(
  p: { lat: number; lng: number },
  poly: Array<{ lat: number; lng: number }>
): number | null {
  if (!poly || poly.length < 2) return null;
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const d = pointToSegmentDistanceMiles(p, poly[i - 1], poly[i]);
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : null;
}

function classifyRouteCondition(opts: {
  desc: string;
  tempF: number | null;
  precipProb: number | null;
  windMph: number | null;
}): RouteConditionKind {
  const d = (opts.desc || '').toLowerCase();
  const temp = typeof opts.tempF === 'number' ? opts.tempF : null;
  const p = typeof opts.precipProb === 'number' ? opts.precipProb : null;
  const wind = typeof opts.windMph === 'number' ? opts.windMph : null;

  const precipLikely = p != null ? p >= 35 : d.includes('rain') || d.includes('snow') || d.includes('sleet');
  const isFreezing = temp != null ? temp <= 32 : false;

  if (d.includes('blizzard') || d.includes('snow') || d.includes('flurr') || d.includes('sleet') || d.includes('hail')) {
    return 'snow';
  }
  if ((d.includes('freez') || d.includes('ice')) || (precipLikely && isFreezing)) {
    return 'ice';
  }
  if (d.includes('fog') || d.includes('mist') || d.includes('smoke') || d.includes('haze')) {
    return 'fog';
  }
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle') || (precipLikely && !isFreezing)) {
    return 'rain';
  }
  if (wind != null && wind >= 25) return 'wind';
  if (d.includes('clear') || d.includes('sun') || d.includes('cloud')) return 'clear';
  return 'unknown';
}

function conditionStyles(kind: RouteConditionKind) {
  switch (kind) {
    case 'snow':
      return { bg: '#8B5CF615', border: '#8B5CF640', text: '#8B5CF6', fill: '#8B5CF6' };
    case 'ice':
      return { bg: '#06B6D415', border: '#06B6D440', text: '#06B6D4', fill: '#06B6D4' };
    case 'rain':
      return { bg: '#3B82F615', border: '#3B82F640', text: '#3B82F6', fill: '#3B82F6' };
    case 'fog':
      return { bg: '#64748B15', border: '#64748B40', text: '#64748B', fill: '#64748B' };
    case 'wind':
      return { bg: '#F59E0B15', border: '#F59E0B40', text: '#F59E0B', fill: '#F59E0B' };
    case 'clear':
      return { bg: '#EAB30815', border: '#EAB30840', text: '#EAB308', fill: '#EAB308' };
    case 'unknown':
    default:
      return { bg: '#94A3B815', border: '#94A3B840', text: '#94A3B8', fill: '#94A3B8' };
  }
}

function conditionGlyph(kind: RouteConditionKind) {
  switch (kind) {
    case 'snow':
      return '❄';
    case 'ice':
      return '🧊';
    case 'rain':
      return '💧';
    case 'fog':
      return '≋';
    case 'wind':
      return '〰';
    case 'clear':
      return '☀';
    case 'unknown':
    default:
      return '•';
  }
}

function conditionInnerIconSvg(kind: RouteConditionKind) {
  // Simple Lucide-style icons (stroke-only) to match the left panel visual language.
  // ViewBox: 0 0 24 24
  switch (kind) {
    case 'rain':
      return `
        <path d="M17.5 19H7a4 4 0 1 1 0-8 5 5 0 0 1 9.7-1.6A4.5 4.5 0 0 1 17.5 19z"/>
        <line x1="9" y1="21" x2="9" y2="23"/>
        <line x1="13" y1="21" x2="13" y2="23"/>
        <line x1="17" y1="21" x2="17" y2="23"/>
      `;
    case 'snow':
    case 'ice':
      return `
        <path d="M17.5 19H7a4 4 0 1 1 0-8 5 5 0 0 1 9.7-1.6A4.5 4.5 0 0 1 17.5 19z"/>
        <circle cx="9" cy="22" r="0.9"/>
        <circle cx="13" cy="22" r="0.9"/>
        <circle cx="17" cy="22" r="0.9"/>
      `;
    case 'fog':
      return `
        <path d="M17.5 19H7a4 4 0 1 1 0-8 5 5 0 0 1 9.7-1.6A4.5 4.5 0 0 1 17.5 19z"/>
        <line x1="6.5" y1="21" x2="18.5" y2="21"/>
        <line x1="8" y1="23" x2="17" y2="23"/>
      `;
    case 'wind':
      return `
        <path d="M3 12h10a3 3 0 1 0-3-3"/>
        <path d="M3 18h14a3 3 0 1 1-3 3"/>
      `;
    case 'clear':
      return `
        <circle cx="12" cy="12" r="4"/>
        <line x1="12" y1="2" x2="12" y2="5"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="5" y2="12"/>
        <line x1="19" y1="12" x2="22" y2="12"/>
        <line x1="4.2" y1="4.2" x2="6.4" y2="6.4"/>
        <line x1="17.6" y1="17.6" x2="19.8" y2="19.8"/>
        <line x1="17.6" y1="6.4" x2="19.8" y2="4.2"/>
        <line x1="4.2" y1="19.8" x2="6.4" y2="17.6"/>
      `;
    case 'unknown':
    default:
      // Cloud
      return `
        <path d="M17.5 19H7a4 4 0 1 1 0-8 5 5 0 0 1 9.7-1.6A4.5 4.5 0 0 1 17.5 19z"/>
      `;
  }
}

function conditionMarkerIconUri(kind: RouteConditionKind) {
  const s = conditionStyles(kind);
  const inner = conditionInnerIconSvg(kind);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="21" fill="${s.fill}" stroke="white" stroke-width="3.5"/>
      <g transform="translate(12 12)">
        <g fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          ${inner}
        </g>
      </g>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// HERE Flexible Polyline decoder (2D only)
function decodeHerePolyline(encoded: string): { lat: number; lng: number }[] {
  const DECODING_TABLE = [
    62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
  ];

  let index = 0;
  let lat = 0;
  let lng = 0;

  const readVarInt = () => {
    let shift = 0;
    let value = 0;
    while (index < encoded.length) {
      const char = encoded.charCodeAt(index++) - 45;
      const v = DECODING_TABLE[char];
      value |= (v & 31) << shift;
      if ((v & 32) === 0) return value;
      shift += 5;
    }
    return value;
  };

  // header
  readVarInt(); // version
  const header = readVarInt();
  const precision = Math.pow(10, -(header & 15));
  const hasZ = ((header >> 8) & 1) === 1;

  const coords: { lat: number; lng: number }[] = [];
  while (index < encoded.length) {
    const latDelta = readVarInt();
    const lngDelta = readVarInt();
    const dLat = latDelta & 1 ? ~(latDelta >> 1) : latDelta >> 1;
    const dLng = lngDelta & 1 ? ~(lngDelta >> 1) : lngDelta >> 1;
    lat += dLat;
    lng += dLng;
    if (hasZ) readVarInt(); // skip z
    coords.push({ lat: lat * precision, lng: lng * precision });
  }
  return coords;
}

function WeatherIcon({ desc }: { desc: string }) {
  const d = desc.toLowerCase();
  if (d.includes('thunder') || d.includes('storm')) return <CloudLightning className="w-5 h-5" />;
  if (d.includes('snow') || d.includes('blizzard')) return <CloudSnow className="w-5 h-5" />;
  if (d.includes('rain') || d.includes('shower')) return <CloudRain className="w-5 h-5" />;
  if (d.includes('drizzle')) return <CloudDrizzle className="w-5 h-5" />;
  if (d.includes('fog') || d.includes('mist')) return <CloudFog className="w-5 h-5" />;
  if (d.includes('cloud')) return <Cloud className="w-5 h-5" />;
  return <Sun className="w-5 h-5" />;
}

function AutosuggestInput({
  label,
  placeholder,
  value,
  onChange,
  onSelect,
  accentColor,
  darkMode,
  at,
  closeToken,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onSelect: (sel: PlaceSelection) => void;
  accentColor: string;
  darkMode: boolean;
  at?: { lat: number; lng: number };
  closeToken: number;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HereAutosuggestItem[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const selectionLockRef = useRef(false);
  const lastSelectedQueryRef = useRef<string | null>(null);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    // Force-close suggestions after a search is run
    selectionLockRef.current = true;
    // Treat the current value as "selected" so autosuggest won't reopen until the user types.
    lastSelectedQueryRef.current = value;
    setOpen(false);
    setItems([]);
    window.setTimeout(() => {
      selectionLockRef.current = false;
    }, 800);
  }, [closeToken]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    const myReqId = requestIdRef.current;

    // If the query matches the last selected item, don't re-run autosuggest (prevents reopen)
    if (lastSelectedQueryRef.current && query.trim() === lastSelectedQueryRef.current.trim()) {
      setLoading(false);
      setItems([]);
      setOpen(false);
      return;
    }

    if (query.trim().length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const atParam = at ? `${at.lat},${at.lng}` : '39.8283,-98.5795';
        // Try HERE Autosuggest first
        const res = await fetch(
          `/api/here?endpoint=autosuggest&q=${encodeURIComponent(query)}&at=${encodeURIComponent(atParam)}&limit=6`
        );

        let normalized: HereAutosuggestItem[] = [];

        if (res.ok) {
          const data = await res.json();
          const list: HereAutosuggestItem[] = Array.isArray(data.items) ? data.items : [];
          // HERE autosuggest items may provide coordinates in `position` OR `access[0]` depending on resultType
          normalized = list.filter(i => {
            const p = i.position || i.access?.[0];
            return !!(p && typeof p.lat === 'number' && typeof p.lng === 'number');
          });
        } else {
          // Many HERE keys don't have Autosuggest enabled; fall back gracefully.
          const txt = await res.text().catch(() => '');
          console.warn('[RouteWeatherAlerts] Autosuggest failed, falling back to geocode:', res.status, txt);
        }

        // Fallback to geocode when autosuggest returns nothing (or failed)
        if (normalized.length === 0) {
          const gRes = await fetch(`/api/here?endpoint=geocode&q=${encodeURIComponent(query)}`);
          if (gRes.ok) {
            const g = await gRes.json();
            const gItems = Array.isArray(g.items) ? g.items : [];
            normalized = gItems
              .slice(0, 6)
              .map((it: any) => ({
                id: it.id,
                title: it.title,
                address: it.address,
                position: it.position,
                resultType: it.resultType || 'address',
              }))
              .filter((i: HereAutosuggestItem) => !!(i.position?.lat && i.position?.lng));
          }
        }

        // Ignore late responses after a selection or if a newer request is in flight
        if (requestIdRef.current !== myReqId) return;
        if (selectionLockRef.current) return;
        setItems(normalized);
        setOpen(normalized.length > 0);
      } catch {
        setItems([]);
        setOpen(false);
      } finally {
        if (requestIdRef.current === myReqId) setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, at]);

  const bgInput = darkMode ? '#334155' : '#F1F5F9';
  const bgWidget = darkMode ? '#0F172A' : '#FFFFFF';

  return (
    <div ref={wrapRef} className="relative w-full">
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div
        className="rounded-xl flex items-center gap-2.5"
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          padding: '10px 12px',
        }}
      >
        <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => {
              lastSelectedQueryRef.current = null;
              setQuery(e.target.value);
              onChange(e.target.value);
            }}
            onFocus={() => !selectionLockRef.current && items.length > 0 && setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder={placeholder}
            className="w-full pr-8 py-0 text-sm font-medium outline-none bg-transparent"
            style={{ color: 'var(--text-main)' }}
          />
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} /> : null}
          </div>
        </div>
      </div>
      {open && items.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden z-50"
          style={{ background: bgWidget, border: '1px solid var(--border-subtle)', boxShadow: '0 18px 50px rgba(0,0,0,0.22)' }}
        >
          {items.map((it, idx) => {
            // Always prefer the full formatted label for the selected value.
            // (Some HERE results have a short `title`, but a more complete `address.label`.)
            const fullLabel = it.address?.label || it.title || 'Result';
            const primaryTitle = it.title || fullLabel;
            const pos = it.position || it.access?.[0];
            const applySelection = () => {
              if (!pos) return;
              selectionLockRef.current = true;
              // Invalidate any in-flight autosuggest request to prevent reopen
              requestIdRef.current += 1;
              onSelect({ label: fullLabel, lat: pos.lat, lng: pos.lng });
              setQuery(fullLabel);
              onChange(fullLabel);
              lastSelectedQueryRef.current = fullLabel;
              setOpen(false);
              setItems([]);
              // Give any in-flight request time to settle without reopening the dropdown
              window.setTimeout(() => {
                selectionLockRef.current = false;
              }, 500);
            };
            return (
              <button
                key={`${it.id || idx}-${fullLabel}`}
                type="button"
                className="w-full px-4 py-3 text-left text-sm flex items-start gap-3 hover:bg-black/5"
                style={{ color: 'var(--text-main)' }}
                // Use onMouseDown so the selection applies *before* the input blurs.
                // This guarantees the input field immediately populates with the full label.
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  applySelection();
                }}
                // Keep click for keyboard activation / accessibility fallback.
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  applySelection();
                }}
              >
                <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accentColor}12`, color: accentColor }}>
                  <MapPin className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium truncate">{primaryTitle}</span>
                  {it.address?.label && it.address.label !== primaryTitle ? (
                    <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {it.address.label}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RouteWeatherAlerts({
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
}) {
  const [startText, setStartText] = useState('');
  const [destText, setDestText] = useState('');
  const [start, setStart] = useState<PlaceSelection | null>(null);
  const [dest, setDest] = useState<PlaceSelection | null>(null);

  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routePolyline, setRoutePolyline] = useState<{ lat: number; lng: number }[] | null>(null);
  const [routeMiles, setRouteMiles] = useState<number | null>(null);

  const [loadingWeather, setLoadingWeather] = useState(false);
  const [obs, setObs] = useState<WeatherObservation | null>(null);
  const [forecastDays, setForecastDays] = useState<ForecastDay[]>([]);
  const [forecastHours, setForecastHours] = useState<ForecastHour[]>([]);
  const [forecastMode, setForecastMode] = useState<'daily' | 'hourly'>('daily');

  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alerts, setAlerts] = useState<RouteAlert[]>([]);
  const [loadingConditions, setLoadingConditions] = useState(false);
  const [routeConditions, setRouteConditions] = useState<RouteConditionPoint[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [closeToken, setCloseToken] = useState(0);

  const mapCenter = useMemo(() => {
    const pt = dest || start;
    if (pt) return { lat: pt.lat, lng: pt.lng };
    return { lat: 39.8283, lng: -98.5795 };
  }, [start, dest]);

  const markers = useMemo(() => {
    const m: any[] = [];
    if (start) m.push({ lat: start.lat, lng: start.lng, label: `Start: ${start.label}`, color: '#64748B', type: 'default', clusterable: false });
    if (dest) m.push({ lat: dest.lat, lng: dest.lng, label: `Destination: ${dest.label}`, color: accentColor, type: 'default', clusterable: false });
    if (routeConditions.length > 0) {
      for (const p of routeConditions) {
        const s = conditionStyles(p.kind);
        m.push({
          lat: p.lat,
          lng: p.lng,
          label: `${p.milesAt} mi · ${p.desc}${p.tempF != null ? ` · ${Math.round(p.tempF)}°F` : ''}${
            p.windMph != null ? ` · ${Math.round(p.windMph)} mph wind` : ''
          }${p.precipProb != null ? ` · ${Math.round(p.precipProb)}% precip` : ''}`,
          iconUrl: conditionMarkerIconUri(p.kind),
          iconCircular: false,
          iconSize: [38, 38],
          zIndexOffset: 450,
          color: s.fill,
          type: 'default',
          clusterable: false,
        });
      }
    }
    if (alerts.length > 0) {
      for (const a of alerts) {
        const milesFromDest =
          routeMiles != null && a.milesAt != null ? Math.max(0, routeMiles - a.milesAt) : null;
        const detailParts: string[] = [];
        if (milesFromDest != null) detailParts.push(`${formatMiles(milesFromDest)} mi from destination`);
        if (a.timeWindow) detailParts.push(a.timeWindow);
        const detail = detailParts.length ? ` · ${detailParts.join(' · ')}` : '';

        m.push({
          lat: a.lat,
          lng: a.lng,
          label: `${a.title}${detail}`,
          iconUrl: alertMarkerIconUri(a.severity),
          iconCircular: false,
          iconSize: [38, 38],
          zIndexOffset: 520,
          type: 'default',
          clusterable: false,
        });
      }
    }
    return m;
  }, [
    start,
    dest,
    accentColor,
    routeConditions,
    alerts,
    routeMiles,
  ]);

  const geocodeOne = async (q: string): Promise<PlaceSelection | null> => {
    const query = q.trim();
    if (!query) return null;
    const res = await fetch(`/api/here?endpoint=geocode&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const item = data?.items?.[0];
    const pos = item?.position;
    const label = item?.title || item?.address?.label || query;
    if (!pos?.lat || !pos?.lng) return null;
    return { label, lat: pos.lat, lng: pos.lng };
  };

  const runAll = async () => {
    setCloseToken(t => t + 1);
    setRunError(null);
    setObs(null);
    setForecastDays([]);
    setForecastHours([]);
    setAlerts([]);
    setRouteConditions([]);
    setRoutePolyline(null);
    setRouteMiles(null);

    setLoadingWeather(true);
    setLoadingRoute(true);
    setLoadingAlerts(true);
    setLoadingConditions(true);

    try {
      // Ensure we have coordinates (either selected from autosuggest, or geocoded from text)
      let s = start;
      let d = dest;
      if (!s) s = await geocodeOne(startText);
      if (!d) d = await geocodeOne(destText);
      if (!s || !d) {
        throw new Error('Please select a starting point and destination from the suggestions (or type a full address).');
      }
      setStart(s);
      setDest(d);
      setStartText(s.label);
      setDestText(d.label);

      // Destination weather
      const [oRes, dRes, hRes] = await Promise.all([
        fetch(`/api/here?endpoint=weather&product=observation&latitude=${d.lat}&longitude=${d.lng}`),
        fetch(`/api/here?endpoint=weather&product=forecast_7days&latitude=${d.lat}&longitude=${d.lng}`),
        fetch(`/api/here?endpoint=weather&product=forecast_hourly&latitude=${d.lat}&longitude=${d.lng}`),
      ]);
      const o = await oRes.json();
      const dd = await dRes.json();
      const h = await hRes.json();

      const obsItem = o?.observations?.location?.[0]?.observation?.[0] || o?.observations?.location?.observation?.[0];
      setObs({
        temperature: obsItem?.temperature,
        comfort: obsItem?.comfort,
        skyDescription: obsItem?.skyDescription || obsItem?.description,
        humidity: obsItem?.humidity,
        windSpeed: obsItem?.windSpeed,
        visibility: obsItem?.visibility,
        iconName: obsItem?.iconName,
      });

      // HERE weather payload shape varies by plan/product. Try multiple known shapes.
      const days =
        dd?.forecasts?.forecastLocation?.forecast ||
        dd?.forecasts?.forecastLocation?.[0]?.forecast ||
        dd?.forecasts?.forecastLocation?.[0]?.forecasts ||
        dd?.forecastLocation?.forecast ||
        dd?.forecastLocation?.[0]?.forecast ||
        dd?.dailyForecasts?.forecastLocation?.forecast ||
        dd?.dailyForecasts?.forecastLocation?.[0]?.forecast ||
        findForecastArrayDeep(dd);

      // Some HERE payloads include multiple entries per day (e.g., day/night).
      // Group by calendar date so the UI shows sequential dates (15, 16, 17, ...).
      const rawDays = Array.isArray(days) ? days : [];
      const grouped: ForecastDay[] = [];
      const byKey = new Map<string, ForecastDay>();

      for (const x of rawDays) {
        const key = extractDateKey(x) || `${x?.dayOfWeek || x?.weekday || x?.day || x?.weekDay || x?.name || 'day'}-${grouped.length}`;
        const temps = extractDailyTemps(x);
        const next: ForecastDay = {
          dayOfWeek: x?.dayOfWeek || x?.weekday || x?.day || x?.weekDay || x?.name,
          dayOfMonth: extractDayOfMonth(x),
          highTemperature: temps.high ?? x?.highTemperature,
          lowTemperature: temps.low ?? x?.lowTemperature,
          description: x?.description || x?.skyDescription || x?.forecastDescription,
          iconName: x?.iconName || x?.icon,
          precipitationProbability:
            x?.precipitationProbability ??
            x?.precipitationProbabilityDay ??
            x?.precipitationProbabilityNight ??
            x?.rainFall ??
            x?.precipChance,
        };

        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, next);
          grouped.push(next);
        } else {
          // Merge temps if we got separate entries for the same day.
          const hi = pickFirstNumber(existing.highTemperature, next.highTemperature);
          const lo = pickFirstNumber(existing.lowTemperature, next.lowTemperature);
          const hiMerged = pickFirstNumber(
            typeof existing.highTemperature === 'number' ? existing.highTemperature : hi,
            typeof next.highTemperature === 'number' ? next.highTemperature : hi
          );
          const loMerged = pickFirstNumber(
            typeof existing.lowTemperature === 'number' ? existing.lowTemperature : lo,
            typeof next.lowTemperature === 'number' ? next.lowTemperature : lo
          );
          existing.highTemperature =
            existing.highTemperature === undefined ? next.highTemperature : Math.max(toNumber(existing.highTemperature) ?? -Infinity, toNumber(next.highTemperature) ?? -Infinity);
          existing.lowTemperature =
            existing.lowTemperature === undefined ? next.lowTemperature : Math.min(toNumber(existing.lowTemperature) ?? Infinity, toNumber(next.lowTemperature) ?? Infinity);
          // Keep first description/icon (usually daytime) to avoid flicker.
          if (!existing.dayOfMonth && next.dayOfMonth) existing.dayOfMonth = next.dayOfMonth;
        }

        if (grouped.length >= 14) break; // safety cap
      }

      setForecastDays(grouped.slice(0, 7));

      const hours = h?.hourlyForecasts?.forecastLocation?.forecast || h?.hourlyForecasts?.forecastLocation?.[0]?.forecast || [];
      // De-dupe to one entry per hour (some feeds include multiple entries per hour).
      const rawHours = Array.isArray(hours) ? hours : [];
      const byHour = new Map<string, { dt: Date; x: any }>();
      for (const x of rawHours) {
        const k = extractHourlyHourKey(x);
        if (!k) continue;
        const existing = byHour.get(k.key);
        if (!existing) {
          byHour.set(k.key, { dt: k.dt, x });
          continue;
        }
        // Prefer the entry that has a real temperature value
        const curTemp = toNumber(existing.x?.temperature);
        const nextTemp = toNumber(x?.temperature);
        if (curTemp === null && nextTemp !== null) {
          byHour.set(k.key, { dt: k.dt, x });
        }
      }

      const sortedHours = Array.from(byHour.values()).sort((a, b) => a.dt.getTime() - b.dt.getTime());
      // Hourly forecast should run from "now" through local midnight.
      // Some feeds provide hours that start later; we prefer current-hour → end-of-day for a better UX.
      const now = new Date();
      const currentHour = new Date(now);
      currentHour.setMinutes(0, 0, 0);
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0); // next day at 00:00 local

      let windowed = sortedHours.filter(({ dt }) => dt.getTime() >= currentHour.getTime() && dt.getTime() < midnight.getTime());

      // Fallback: if the feed doesn't include "today", show the first available day to avoid empty UI.
      if (windowed.length === 0) {
        const first = sortedHours[0]?.dt;
        const dayKey = first
          ? `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`
          : null;
        windowed = sortedHours.filter(({ dt }) => {
          if (!dayKey) return true;
          const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          return k === dayKey;
        });
      }

      const uniqueHours = windowed.slice(0, 24).map(({ dt, x }) => ({
        localTime: dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        temperature: x.temperature,
        description: x.description,
        iconName: x.iconName,
        precipitationProbability: x.precipitationProbability,
      }));

      setForecastHours(uniqueHours);
      setLoadingWeather(false);

      // Route polyline
      const rRes = await fetch(`/api/here?endpoint=routes&transportMode=car&origin=${s.lat},${s.lng}&destination=${d.lat},${d.lng}`);
      const rJson: HereRouteResponse = await rRes.json();
      const poly = rJson?.routes?.[0]?.sections?.[0]?.polyline;
      const lengthMeters = rJson?.routes?.[0]?.sections?.[0]?.summary?.length;
      if (!poly) throw new Error('Could not calculate a route for those locations.');
      const coords = decodeHerePolyline(poly);
      setRoutePolyline(coords);
      const miles = typeof lengthMeters === 'number' ? lengthMeters / 1609.34 : null;
      setRouteMiles(miles);
      setLoadingRoute(false);

      // Sample points & fetch conditions/alerts.
      // Tahoe → Reno is ~60mi; sample more densely for shorter routes.
      const estMiles = miles ?? undefined;
      const sampleEveryMiles =
        typeof estMiles === 'number'
          ? estMiles <= 80
            ? 10
            : estMiles <= 250
              ? 25
              : 50
          : 25;

      const samples: Array<{ lat: number; lng: number; milesAt: number }> = [{ lat: s.lat, lng: s.lng, milesAt: 0 }];
      let acc = 0;
      let nextTarget = sampleEveryMiles;
      for (let i = 1; i < coords.length; i++) {
        const seg = milesBetween(coords[i - 1], coords[i]);
        acc += seg;
        if (acc >= nextTarget) {
          samples.push({ lat: coords[i].lat, lng: coords[i].lng, milesAt: Math.round(acc) });
          nextTarget += sampleEveryMiles;
          if (samples.length >= 10) break;
        }
      }
      samples.push({ lat: d.lat, lng: d.lng, milesAt: miles ? Math.round(miles) : Math.round(acc) });

      // Along-route "road condition" proxy from weather observations at varying distances.
      try {
        const obsResults = await Promise.all(
          samples.map(async (sp) => {
            const oRes = await fetch(`/api/here?endpoint=weather&product=observation&latitude=${sp.lat}&longitude=${sp.lng}`);
            const o = await oRes.json();
            const obsItem =
              o?.observations?.location?.[0]?.observation?.[0] || o?.observations?.location?.observation?.[0] || null;
            const desc = String(obsItem?.skyDescription || obsItem?.description || '').trim() || '—';
            const tempF = toNumber(obsItem?.temperature);
            const windMph = toNumber(obsItem?.windSpeed);
            const precipProb = toNumber(obsItem?.precipitationProbability);
            const kind = classifyRouteCondition({ desc, tempF, precipProb, windMph });
            const pt: RouteConditionPoint = {
              lat: sp.lat,
              lng: sp.lng,
              milesAt: sp.milesAt,
              desc,
              tempF,
              precipProb,
              windMph,
              kind,
            };
            return pt;
          })
        );
        setRouteConditions(obsResults);
      } catch {
        setRouteConditions([]);
      } finally {
        setLoadingConditions(false);
      }

      const found: RouteAlert[] = [];
      const seen = new Set<string>();
      for (const sp of samples) {
        const aRes = await fetch(`/api/here?endpoint=weather&product=alerts&latitude=${sp.lat}&longitude=${sp.lng}`);
        const aJson = await aRes.json();
        const list: AlertItem[] = aJson?.alerts?.alerts || aJson?.alerts || aJson?.warning || aJson?.warnings || [];
        const arr = Array.isArray(list) ? list : [];
        for (const a of arr) {
          // Prefer the descriptive event text as the title (often the most human-friendly)
          const title = a.description || a.headline || a.type || 'Weather Alert';
          const key = `${title}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const sev = severityFromTitle(title);
          const timeWindow = formatAlertTimeWindow(a.startTime, a.endTime);
          found.push({
            key,
            title,
            severity: sev,
            timeWindow,
            milesAt: sp.milesAt,
            url: a.url,
            lat: sp.lat,
            lng: sp.lng,
          });
        }
      }
      setAlerts(found);
    } catch (e: any) {
      setRunError(e?.message || 'Failed to load weather/alerts.');
    } finally {
      setLoadingWeather(false);
      setLoadingRoute(false);
      setLoadingAlerts(false);
      setLoadingConditions(false);
    }
  };

  return (
    <div
      className="prism-widget w-full md:w-[1240px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <WidgetHeader
        title="Route Weather Alerts"
        subtitle="See forecast and active alerts along a route."
        variant="impressive"
        layout="inline"
        icon={<CloudSun className="w-4 h-4" />}
      />
      <div className="flex flex-col md:flex-row md:h-[870px]">
        {/* Left panel */}
        <div className="w-full md:w-[600px] flex flex-col border-t md:border-t-0 md:border-r md:order-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 relative" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {(loadingWeather || loadingRoute || loadingAlerts) && (
              <div className="absolute right-4 top-4 pointer-events-none">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
              </div>
            )}
            <AutosuggestInput
              label="Starting point"
              placeholder="Enter a starting address"
              value={startText}
              onChange={(v) => {
                setStartText(v);
                // If user edits text after selecting, discard previous coordinates so runAll re-geocodes.
                if (start) setStart(null);
              }}
              onSelect={(sel) => {
                setStart(sel);
                setStartText(sel.label);
              }}
              accentColor={accentColor}
              darkMode={darkMode}
              at={dest || undefined}
              closeToken={closeToken}
            />
            <AutosuggestInput
              label="Destination"
              placeholder="Enter a destination"
              value={destText}
              onChange={(v) => {
                setDestText(v);
                // If user edits text after selecting, discard previous coordinates so runAll re-geocodes.
                if (dest) setDest(null);
              }}
              onSelect={(sel) => {
                setDest(sel);
                setDestText(sel.label);
              }}
              accentColor={accentColor}
              darkMode={darkMode}
              at={start || undefined}
              closeToken={closeToken}
            />
          </div>

          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={runAll}
              disabled={loadingWeather || loadingRoute || loadingAlerts || (!startText.trim() || !destText.trim())}
              className="prism-btn prism-btn-primary flex-1 py-3 text-sm"
              style={{
                background: accentColor,
                opacity: loadingWeather || loadingRoute || loadingAlerts || (!startText.trim() || !destText.trim()) ? 0.6 : 1,
              }}
            >
              {(loadingWeather || loadingRoute || loadingAlerts) ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> <span className="ml-2">Loading…</span></>
              ) : (
                <><Navigation className="w-4 h-4" /> <span className="ml-2">Get Weather & Alerts</span></>
              )}
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar p-4 space-y-3">
            {runError && (
              <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--border-subtle)' }}>
                {runError}
              </div>
            )}
            {/* Destination Weather */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <CollapsibleSection
                title="Destination Weather"
                summary={dest ? dest.label : 'Enter a destination to see weather.'}
                defaultOpen={false}
              >
                <div className="mt-3">
                  {!dest ? (
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Enter a destination to see weather.
                    </div>
                  ) : loadingWeather ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading weather…
                    </div>
                  ) : obs ? (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
                              {toNumber(obs.temperature) ?? '--'}°F
                            </span>
                            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                              Feels {toNumber(obs.comfort) ?? '--'}°F
                            </span>
                          </div>
                          <div className="text-[11px] font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {obs.skyDescription || '—'}
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accentColor}12`, color: accentColor }}>
                          <WeatherIcon desc={obs.skyDescription || ''} />
                        </div>
                      </div>

                      {/* Compact metrics row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl p-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                          <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            <Droplets className="w-4 h-4" />
                            Humidity
                          </div>
                          <div className="text-[11px] font-semibold mt-1" style={{ color: 'var(--text-main)' }}>
                            {toNumber(obs.humidity) ?? '--'}%
                          </div>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                          <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            <Wind className="w-4 h-4" />
                            Wind
                          </div>
                          <div className="text-[11px] font-semibold mt-1" style={{ color: 'var(--text-main)' }}>
                            {toNumber(obs.windSpeed) ?? '--'} mph
                          </div>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                          <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            <Eye className="w-4 h-4" />
                            Visibility
                          </div>
                          <div className="text-[11px] font-semibold mt-1" style={{ color: 'var(--text-main)' }}>
                            {toNumber(obs.visibility) ?? '--'} mi
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Weather data unavailable.
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>

            {/* Forecast */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <CollapsibleSection
                title="Forecast"
                summary={dest ? `Destination forecast · ${forecastMode === 'daily' ? 'Daily' : 'Hourly'}` : 'Enter a destination to see forecast.'}
                defaultOpen={false}
                rightHint={
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setForecastMode('daily');
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        background: forecastMode === 'daily' ? `${accentColor}15` : 'var(--bg-panel)',
                        border: `1px solid ${forecastMode === 'daily' ? `${accentColor}35` : 'var(--border-subtle)'}`,
                        color: forecastMode === 'daily' ? accentColor : 'var(--text-muted)',
                      }}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setForecastMode('hourly');
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        background: forecastMode === 'hourly' ? `${accentColor}15` : 'var(--bg-panel)',
                        border: `1px solid ${forecastMode === 'hourly' ? `${accentColor}35` : 'var(--border-subtle)'}`,
                        color: forecastMode === 'hourly' ? accentColor : 'var(--text-muted)',
                      }}
                    >
                      Hourly
                    </button>
                  </div>
                }
              >
                <div className="mt-3">
                  {forecastMode === 'daily' ? (
                    <div className="grid grid-cols-7 gap-1.5">
                      {forecastDays.slice(0, 7).map((d, i) => (
                        <div
                          key={i}
                          className="rounded-xl p-2 text-center"
                          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                        >
                          <div className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                            {d.dayOfMonth || (d.dayOfWeek || '').slice(0, 3) || '—'}
                          </div>
                          <div className="mt-0.5 flex items-center justify-center" style={{ color: accentColor }}>
                            <div className="scale-90">
                              <WeatherIcon desc={d.description || ''} />
                            </div>
                          </div>
                          <div className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-main)' }}>
                            {formatTempNoDecimals(d.highTemperature)}/{formatTempNoDecimals(d.lowTemperature)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto prism-scrollbar pb-1">
                      {forecastHours.slice(0, 24).map((h, i) => (
                        <div
                          key={i}
                          className="rounded-xl p-3 flex-shrink-0"
                          style={{ width: 150, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                        >
                          <div className="flex items-center justify-between">
                            <div
                              className="text-[11px] font-semibold truncate"
                              style={{ color: 'var(--text-muted)' }}
                              title={h.localTime || ''}
                            >
                              {h.localTime || '—'}
                            </div>
                            <div style={{ color: accentColor }}>
                              <WeatherIcon desc={h.description || ''} />
                            </div>
                          </div>
                          <div className="text-[11px] font-bold mt-1" style={{ color: 'var(--text-main)' }}>
                            {formatTempNoDecimals(h.temperature)}°F
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                            {Math.round(toNumber(h.precipitationProbability) ?? 0)}% precip
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>

            {/* Conditions Along Route */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <CollapsibleSection
                title="Conditions along route"
                summary={
                  routeMiles != null
                    ? `~${formatMiles(routeMiles)} mi · ${routeConditions.length || 0} points`
                    : `${routeConditions.length || 0} points`
                }
                defaultOpen={true}
                rightHint={
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-panel)', color: 'var(--text-muted)' }}
                  >
                    {routeConditions.length || 0}
                  </span>
                }
              >
                <div className="mt-3">
                  {!start || !dest ? (
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Enter both addresses to sample conditions along the route.
                    </div>
                  ) : loadingRoute || loadingConditions ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sampling conditions…
                    </div>
                  ) : routeConditions.length === 0 ? (
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      No along-route condition samples available.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Segmented bar */}
                      <div className="flex items-center gap-1">
                        {routeConditions.map((p, idx) => {
                          const s = conditionStyles(p.kind);
                          return (
                            <div
                              key={`${p.milesAt}-${idx}`}
                              title={`${p.milesAt} mi · ${p.desc}${p.tempF != null ? ` · ${Math.round(p.tempF)}°F` : ''}${
                                p.windMph != null ? ` · ${Math.round(p.windMph)} mph wind` : ''
                              }`}
                              className="h-3 rounded-full flex-1"
                              style={{
                                background: s.fill,
                                opacity: idx === 0 || idx === routeConditions.length - 1 ? 0.95 : 0.85,
                              }}
                            />
                          );
                        })}
                      </div>
                      {/* Labels */}
                      <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span>0 mi</span>
                        <span>
                          {routeConditions.length > 2 ? `${routeConditions[Math.floor(routeConditions.length / 2)].milesAt} mi` : ''}
                        </span>
                        <span>{routeConditions[routeConditions.length - 1].milesAt} mi</span>
                      </div>

                      {/* Compact list */}
                      <div className="max-h-[220px] overflow-y-auto prism-scrollbar pr-1">
                        <div className="space-y-1.5">
                          {routeConditions.map((p, idx) => {
                            const s = conditionStyles(p.kind);
                            return (
                              <div
                                key={`${p.milesAt}-${idx}-row`}
                                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl"
                                style={{ background: s.bg, border: `1px solid ${s.border}` }}
                              >
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold truncate" style={{ color: s.text }}>
                                    {p.milesAt} mi · {p.desc}
                                  </div>
                                  <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                                    {p.tempF != null ? `${Math.round(p.tempF)}°F` : '--'}
                                    {p.windMph != null ? ` · ${Math.round(p.windMph)} mph wind` : ''}
                                    {p.precipProb != null ? ` · ${Math.round(p.precipProb)}% precip` : ''}
                                  </div>
                                </div>
                                <div
                                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                                  style={{ background: `${s.fill}18`, color: s.fill }}
                                >
                                  <WeatherIcon desc={p.desc} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {routeConditions.length > 4 && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Scroll to view all conditions
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>

            {/* Route Alerts */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <CollapsibleSection
                title="Route Weather Alerts"
                summary={
                  !start || !dest
                    ? 'Enter both addresses to scan alerts along the route.'
                    : loadingRoute || loadingAlerts
                      ? 'Checking alerts along route…'
                      : alerts.length === 0
                        ? 'No severe alerts found along sampled points.'
                        : `${alerts.length} alert${alerts.length === 1 ? '' : 's'}`
                }
                defaultOpen={false}
                rightHint={
                  alerts.length > 0 ? (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--bg-panel)', color: 'var(--text-muted)' }}
                    >
                      {alerts.length}
                    </span>
                  ) : null
                }
              >
                <div className="mt-3">
                  {!start || !dest ? (
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Enter both addresses to scan alerts along the route.
                    </div>
                  ) : loadingRoute || loadingAlerts ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Checking alerts along route…
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <AlertTriangle className="w-4 h-4" />
                      No severe alerts found along sampled points.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="max-h-[220px] overflow-y-auto prism-scrollbar pr-1">
                        <div className="space-y-2">
                          {alerts.map((a) => {
                            const s = severityStyles(a.severity);
                            return (
                              <div key={a.key} className="p-2 rounded-xl" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div
                                      className="text-[11px] font-semibold"
                                      style={{
                                        color: s.text,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 1,
                                        WebkitBoxOrient: 'vertical' as any,
                                        overflow: 'hidden',
                                      }}
                                    >
                                      {a.title}
                                    </div>
                                    <div
                                      className="text-[10px] mt-1"
                                      style={{
                                        color: 'var(--text-secondary)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: 320,
                                      }}
                                      title={`${
                                        routeMiles != null && a.milesAt != null
                                          ? `${formatMiles(Math.max(0, routeMiles - a.milesAt))} miles from destination`
                                          : 'Along your route'
                                      }${a.timeWindow ? ` · ${a.timeWindow}` : ''}`}
                                    >
                                      {routeMiles != null && a.milesAt != null
                                        ? `${formatMiles(Math.max(0, routeMiles - a.milesAt))} miles from destination`
                                        : 'Along your route'}
                                      {a.timeWindow ? ` · ${a.timeWindow}` : ''}
                                    </div>
                                  </div>
                                  <span
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: '#00000010', color: s.text }}
                                  >
                                    {a.severity.toUpperCase()}
                                  </span>
                                </div>
                                {a.url ? (
                                  <a
                                    href={a.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                    View details
                                  </a>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {alerts.length > 2 && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Scroll to view all alerts
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>
          </div>

        </div>

        {/* Map */}
        <div className="h-[320px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || ''}
            center={mapCenter}
            zoom={start && dest ? 8 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            clusterMarkers={false}
            clusterRadiusPx={56}
            showRoute={!!routePolyline}
            routePolyline={routePolyline || undefined}
          />
        </div>
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
          <span aria-label="Powered by MapQuest">
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by
          </span>
          <img src="/brand/mapquest-footer-light.svg" alt="MapQuest" className="prism-footer-logo prism-footer-logo--light" />
          <img src="/brand/mapquest-footer-dark.svg" alt="MapQuest" className="prism-footer-logo prism-footer-logo--dark" />
        </div>
      )}
    </div>
  );
}

