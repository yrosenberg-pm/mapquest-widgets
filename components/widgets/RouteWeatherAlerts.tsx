// components/widgets/RouteWeatherAlerts.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  Sun,
  Thermometer,
  Wind,
  AlertTriangle,
  CloudSun,
  Link2,
  MessageCircle,
  Send,
  X,
  Sparkles,
  CornerDownLeft,
  Star,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import WidgetHeader from './WidgetHeader';
import CollapsibleSection from './CollapsibleSection';
import { geocode as mqGeocode, searchAhead } from '@/lib/mapquest';

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

const ROUTE_WEATHER_FAVORITES_KEY = 'mq-route-weather-favorite-places';
const MAX_FAVORITE_PLACES = 25;

type FavoritePlace = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  addedAt: number;
};

function loadFavoritePlaces(): FavoritePlace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ROUTE_WEATHER_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is FavoritePlace =>
          !!x &&
          typeof (x as FavoritePlace).id === 'string' &&
          typeof (x as FavoritePlace).label === 'string' &&
          typeof (x as FavoritePlace).lat === 'number' &&
          typeof (x as FavoritePlace).lng === 'number',
      )
      .slice(0, MAX_FAVORITE_PLACES);
  } catch {
    return [];
  }
}

function sameFavoriteCoords(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lng - b.lng) < 1e-4;
}

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
  labelRight,
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
  /** e.g. favorite star aligned with the field label */
  labelRight?: ReactNode;
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
        const results = await searchAhead(query, 6);
        let normalized: HereAutosuggestItem[] = [];

        for (const r of results || []) {
          const coords = (r as any).place?.geometry?.coordinates;
          const lat = (r as any).lat ?? (coords ? coords[1] : undefined);
          const lng = (r as any).lng ?? (coords ? coords[0] : undefined);
          if (lat != null && lng != null) {
            normalized.push({
              title: r.displayString || r.name,
              address: { label: r.displayString || r.name },
              position: { lat, lng },
              resultType: 'address',
            });
          }
        }

        // Fallback to geocode when searchahead returns nothing
        if (normalized.length === 0) {
          const gResult = await mqGeocode(query);
          if (gResult?.lat && gResult?.lng) {
            const label = [gResult.street, gResult.adminArea5, gResult.adminArea3].filter(Boolean).join(', ') || query;
            normalized = [{
              title: label,
              address: { label },
              position: { lat: gResult.lat, lng: gResult.lng },
              resultType: 'address',
            }];
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
      <div className={`flex items-center gap-2 mb-1.5 ${labelRight ? 'justify-between' : ''}`}>
        <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {label}
        </label>
        {labelRight}
      </div>
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
  const [placeText, setPlaceText] = useState('');
  const [place, setPlace] = useState<PlaceSelection | null>(null);
  const [destText, setDestText] = useState('');
  const [dest, setDest] = useState<PlaceSelection | null>(null);

  const [loadingWeather, setLoadingWeather] = useState(false);
  const [obs, setObs] = useState<WeatherObservation | null>(null);
  const [forecastDays, setForecastDays] = useState<ForecastDay[]>([]);
  const [forecastHours, setForecastHours] = useState<ForecastHour[]>([]);
  const [forecastMode, setForecastMode] = useState<'daily' | 'hourly'>('daily');

  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alerts, setAlerts] = useState<RouteAlert[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [closeToken, setCloseToken] = useState(0);
  const [favoritesPanelOpen, setFavoritesPanelOpen] = useState(false);
  const [currentWeatherOpen, setCurrentWeatherOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(true);

  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>(() => loadFavoritePlaces());

  useEffect(() => {
    try {
      localStorage.setItem(ROUTE_WEATHER_FAVORITES_KEY, JSON.stringify(favoritePlaces));
    } catch {
      /* quota / private mode */
    }
  }, [favoritePlaces]);

  const addFavoritePlace = useCallback((p: PlaceSelection) => {
    setFavoritePlaces((prev) => {
      if (prev.some((f) => sameFavoriteCoords(f, p))) return prev;
      const next: FavoritePlace = {
        id: `fav-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}-${Date.now()}`,
        label: p.label,
        lat: p.lat,
        lng: p.lng,
        addedAt: Date.now(),
      };
      return [next, ...prev].slice(0, MAX_FAVORITE_PLACES);
    });
  }, []);

  const removeFavoritePlace = useCallback((id: string) => {
    setFavoritePlaces((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const toggleFavoriteSelection = useCallback(
    (sel: PlaceSelection) => {
      const existing = favoritePlaces.find((f) => sameFavoriteCoords(f, sel));
      if (existing) removeFavoritePlace(existing.id);
      else addFavoritePlace(sel);
    },
    [favoritePlaces, addFavoritePlace, removeFavoritePlace],
  );

  const placeIsFavorite = useMemo(
    () => !!(place && favoritePlaces.some((f) => sameFavoriteCoords(f, place))),
    [place, favoritePlaces],
  );
  const destIsFavorite = useMemo(
    () => !!(dest && favoritePlaces.some((f) => sameFavoriteCoords(f, dest))),
    [dest, favoritePlaces],
  );

  const applyFavoritePlace = useCallback((f: FavoritePlace) => {
    const sel: PlaceSelection = { label: f.label, lat: f.lat, lng: f.lng };
    setPlace(sel);
    setPlaceText(f.label);
    // Same as after Get forecast: mark value as “selected” so autosuggest doesn’t reopen.
    setCloseToken((t) => t + 1);
  }, []);

  const applyFavoriteDestination = useCallback((f: FavoritePlace) => {
    const sel: PlaceSelection = { label: f.label, lat: f.lat, lng: f.lng };
    setDest(sel);
    setDestText(f.label);
    setCloseToken((t) => t + 1);
  }, []);

  // Chat state
  interface ChatMsg { role: 'user' | 'assistant'; content: string }
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 150);
  }, [chatOpen]);

  const weatherAt = useMemo(() => dest ?? place, [dest, place]);

  const buildWeatherContext = useCallback(() => {
    const parts: string[] = ['WIDGET: Area Weather & Forecast'];

    if (place) {
      parts.push(`ORIGIN / LOCATION: ${place.label} (${place.lat.toFixed(5)}, ${place.lng.toFixed(5)})`);
    }
    if (dest) {
      parts.push(`DESTINATION: ${dest.label} (${dest.lat.toFixed(5)}, ${dest.lng.toFixed(5)})`);
    }
    if (weatherAt) {
      parts.push(
        `\nWeather, forecast, and alerts below are for: ${weatherAt.label}${dest ? ' (destination)' : ''}.`,
      );
    }

    if (obs) {
      parts.push(`\nCURRENT WEATHER:`);
      parts.push(`  Temperature: ${toNumber(obs.temperature) ?? '--'}°F (feels like ${toNumber(obs.comfort) ?? '--'}°F)`);
      parts.push(`  Sky: ${obs.skyDescription || '—'}`);
      parts.push(`  Humidity: ${toNumber(obs.humidity) ?? '--'}%`);
      parts.push(`  Wind: ${toNumber(obs.windSpeed) ?? '--'} mph`);
      parts.push(`  Visibility: ${toNumber(obs.visibility) ?? '--'} mi`);
    }

    if (forecastDays.length > 0) {
      parts.push(`\nDAILY FORECAST:`);
      for (const d of forecastDays.slice(0, 7)) {
        const day = d.dayOfWeek || d.dayOfMonth || '—';
        parts.push(`  ${day}: High ${formatTempNoDecimals(d.highTemperature)}°F / Low ${formatTempNoDecimals(d.lowTemperature)}°F — ${d.description || '—'}`);
      }
    }

    if (alerts.length > 0) {
      parts.push(`\nACTIVE WEATHER ALERTS:`);
      for (const a of alerts) {
        parts.push(`  - ${a.title} (${a.severity}${a.timeWindow ? `, ${a.timeWindow}` : ''})`);
      }
    } else if (weatherAt) {
      parts.push(`\nACTIVE WEATHER ALERTS: None found for this area.`);
    }

    if (!place) {
      parts.push(`\nNo location selected yet. The user should search a city or address and click "Get forecast".`);
    }

    return parts.join('\n');
  }, [place, dest, weatherAt, obs, forecastDays, alerts]);

  const sendChatMessage = useCallback(async (text?: string) => {
    const msg = text ?? chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    const userMsg: ChatMsg = { role: 'user', content: msg };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/widget-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: chatMessages.slice(-10),
          context: buildWeatherContext(),
          lat: weatherAt?.lat ?? place?.lat,
          lng: weatherAt?.lng ?? place?.lng,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${data.error}` }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t connect to the assistant. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, buildWeatherContext, place, weatherAt]);

  const mapFitBounds = useMemo(() => {
    if (!place || !dest) return undefined;
    return {
      north: Math.max(place.lat, dest.lat),
      south: Math.min(place.lat, dest.lat),
      east: Math.max(place.lng, dest.lng),
      west: Math.min(place.lng, dest.lng),
    };
  }, [place, dest]);

  const mapCenter = useMemo(() => {
    if (place && dest) {
      return { lat: (place.lat + dest.lat) / 2, lng: (place.lng + dest.lng) / 2 };
    }
    const pt = place || dest;
    if (pt) return { lat: pt.lat, lng: pt.lng };
    return { lat: 39.8283, lng: -98.5795 };
  }, [place, dest]);

  const markers = useMemo(() => {
    const m: any[] = [];
    if (place) {
      m.push({
        lat: place.lat,
        lng: place.lng,
        label: dest ? `From: ${place.label}` : place.label,
        color: dest ? '#16A34A' : accentColor,
        type: 'default',
        clusterable: false,
      });
    }
    if (dest) {
      m.push({
        lat: dest.lat,
        lng: dest.lng,
        label: `To: ${dest.label}`,
        color: '#DC2626',
        type: 'default',
        clusterable: false,
      });
    }
    if (alerts.length > 0) {
      for (const a of alerts) {
        const detailParts: string[] = [];
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
  }, [place, dest, accentColor, alerts]);

  const geocodeOne = async (q: string): Promise<PlaceSelection | null> => {
    const query = q.trim();
    if (!query) return null;
    const result = await mqGeocode(query);
    if (!result?.lat || !result?.lng) return null;
    const label = [result.street, result.adminArea5, result.adminArea3].filter(Boolean).join(', ') || query;
    return { label, lat: result.lat, lng: result.lng };
  };

  const loadForecast = async () => {
    setCloseToken((t) => t + 1);
    setCurrentWeatherOpen(true);
    setForecastOpen(true);
    setRunError(null);
    setObs(null);
    setForecastDays([]);
    setForecastHours([]);
    setAlerts([]);

    setLoadingWeather(true);
    setLoadingAlerts(true);

    try {
      let p = place;
      if (!p) p = await geocodeOne(placeText);
      if (!p) {
        throw new Error('Please pick a place from the suggestions or enter a full city or address.');
      }
      setPlace(p);
      setPlaceText(p.label);

      if (!destText.trim()) {
        setDest(null);
      }
      let d: PlaceSelection | null = dest;
      if (destText.trim()) {
        if (!d) d = await geocodeOne(destText);
        if (!d) {
          throw new Error('Could not find the destination. Choose a suggestion or type a full address.');
        }
        setDest(d);
        setDestText(d.label);
      } else {
        d = null;
      }

      const wx = d ?? p;

      const [oRes, dRes, hRes] = await Promise.all([
        fetch(`/api/here?endpoint=weather&product=observation&latitude=${wx.lat}&longitude=${wx.lng}`),
        fetch(`/api/here?endpoint=weather&product=forecast_7days&latitude=${wx.lat}&longitude=${wx.lng}`),
        fetch(`/api/here?endpoint=weather&product=forecast_hourly&latitude=${wx.lat}&longitude=${wx.lng}`),
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

      const found: RouteAlert[] = [];
      const seen = new Set<string>();
      const aRes = await fetch(`/api/here?endpoint=weather&product=alerts&latitude=${wx.lat}&longitude=${wx.lng}`);
      const aJson = await aRes.json();
      const list: AlertItem[] = aJson?.alerts?.alerts || aJson?.alerts || aJson?.warning || aJson?.warnings || [];
      const arr = Array.isArray(list) ? list : [];
      for (const a of arr) {
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
          url: a.url,
          lat: wx.lat,
          lng: wx.lng,
        });
      }
      setAlerts(found);
    } catch (e: any) {
      setRunError(e?.message || 'Failed to load weather.');
    } finally {
      setLoadingWeather(false);
      setLoadingAlerts(false);
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
        title="Area Weather"
        subtitle="Weather & forecast for a place; add an optional destination to see conditions where you’re heading."
        variant="impressive"
        layout="inline"
        icon={<CloudSun className="w-4 h-4" />}
      />
      <div className="flex flex-col md:flex-row md:h-[870px]">
        {/* Left panel */}
        <div className="w-full md:w-[40%] flex flex-col border-t md:border-t-0 md:border-r md:order-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="p-4 grid grid-cols-1 gap-3 relative" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {(loadingWeather || loadingAlerts) && (
              <div className="absolute right-4 top-4 pointer-events-none">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
              </div>
            )}
            <AutosuggestInput
              label="Starting location"
              labelRight={
                <button
                  type="button"
                  disabled={!place}
                  onClick={() => place && toggleFavoriteSelection(place)}
                  className="p-1 rounded-lg shrink-0 transition-opacity disabled:opacity-35 hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-widget)]"
                  title={
                    !place
                      ? 'Choose a place from suggestions to favorite it'
                      : placeIsFavorite
                        ? 'Remove from favorites'
                        : 'Add to favorites'
                  }
                  aria-pressed={placeIsFavorite}
                  aria-label={
                    !place
                      ? 'Favorite starting location (choose a place first)'
                      : placeIsFavorite
                        ? 'Remove starting location from favorites'
                        : 'Add starting location to favorites'
                  }
                >
                  <Star
                    className="w-4 h-4"
                    aria-hidden
                    style={{
                      color: placeIsFavorite ? accentColor : 'var(--text-muted)',
                      fill: placeIsFavorite ? accentColor : 'transparent',
                    }}
                    strokeWidth={placeIsFavorite ? 0 : 2}
                  />
                </button>
              }
              placeholder="City, neighborhood, or address"
              value={placeText}
              onChange={(v) => {
                setPlaceText(v);
                if (place) setPlace(null);
              }}
              onSelect={(sel) => {
                setPlace(sel);
                setPlaceText(sel.label);
              }}
              accentColor={accentColor}
              darkMode={darkMode}
              at={dest || undefined}
              closeToken={closeToken}
            />
            <AutosuggestInput
              label="Destination (optional)"
              labelRight={
                <button
                  type="button"
                  disabled={!dest}
                  onClick={() => dest && toggleFavoriteSelection(dest)}
                  className="p-1 rounded-lg shrink-0 transition-opacity disabled:opacity-35 hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-widget)]"
                  title={
                    !dest
                      ? 'Choose a destination from suggestions to favorite it'
                      : destIsFavorite
                        ? 'Remove from favorites'
                        : 'Add to favorites'
                  }
                  aria-pressed={destIsFavorite}
                  aria-label={
                    !dest
                      ? 'Favorite destination (choose a place first)'
                      : destIsFavorite
                        ? 'Remove destination from favorites'
                        : 'Add destination to favorites'
                  }
                >
                  <Star
                    className="w-4 h-4"
                    aria-hidden
                    style={{
                      color: destIsFavorite ? accentColor : 'var(--text-muted)',
                      fill: destIsFavorite ? accentColor : 'transparent',
                    }}
                    strokeWidth={destIsFavorite ? 0 : 2}
                  />
                </button>
              }
              placeholder="Where you’re headed — uses this spot for weather & forecast"
              value={destText}
              onChange={(v) => {
                setDestText(v);
                if (dest) setDest(null);
              }}
              onSelect={(sel) => {
                setDest(sel);
                setDestText(sel.label);
              }}
              accentColor={accentColor}
              darkMode={darkMode}
              at={place || undefined}
              closeToken={closeToken}
            />
          </div>

          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={loadForecast}
              disabled={loadingWeather || loadingAlerts || !placeText.trim()}
              className="prism-btn prism-btn-primary flex-1 py-3 text-sm hover:brightness-110 transition-all"
              style={{
                background: accentColor,
                opacity: loadingWeather || loadingAlerts || !placeText.trim() ? 0.6 : 1,
              }}
            >
              {(loadingWeather || loadingAlerts) ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> <span className="ml-2">Loading…</span></>
              ) : (
                <><CloudSun className="w-4 h-4" /> <span className="ml-2">Get forecast</span></>
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
                title="Current weather"
                summary={
                  place
                    ? dest
                      ? `${dest.label} · at destination`
                      : `${place.label}`
                    : 'Search a location and get forecast.'
                }
                open={currentWeatherOpen}
                onOpenChange={setCurrentWeatherOpen}
              >
                <div className="mt-3">
                  {!place ? (
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Search for a place, then tap Get forecast.
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
                summary={
                  place
                    ? `${dest ? `${dest.label} · ` : ''}${forecastMode === 'daily' ? 'Daily' : 'Hourly'}`
                    : 'Get forecast for a location first.'
                }
                open={forecastOpen}
                onOpenChange={setForecastOpen}
                rightHint={
                  <div className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setForecastMode('daily');
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80"
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
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80"
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

            {/* Weather alerts */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <CollapsibleSection
                title="Weather alerts"
                summary={
                  !weatherAt
                    ? 'Load forecast for a location to check alerts.'
                    : loadingAlerts
                      ? 'Checking alerts…'
                      : alerts.length === 0
                        ? 'No alerts for this area.'
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
                  {!weatherAt ? (
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Search a location and run Get forecast.
                    </div>
                  ) : loadingAlerts ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Checking alerts…
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <AlertTriangle className="w-4 h-4" />
                      No alerts for this area.
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
                                      title={a.timeWindow || ''}
                                    >
                                      {a.timeWindow || 'Active alert'}
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

        {/* Map + Chat overlay */}
        <div className="relative h-[320px] md:h-auto md:w-[60%] md:order-2">
          <MapQuestMap
            apiKey={process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || ''}
            center={mapCenter}
            zoom={place && !dest ? 9 : 4}
            // Let the directions polyline drive fitBounds when both ends exist (avoids fighting the route line).
            fitBounds={place && dest ? undefined : mapFitBounds}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            clusterMarkers={false}
            clusterRadiusPx={56}
            showRoute={Boolean(place && dest)}
            routeStart={place && dest ? { lat: place.lat, lng: place.lng } : undefined}
            routeEnd={place && dest ? { lat: dest.lat, lng: dest.lng } : undefined}
            routeType="fastest"
          />

          {/* Favorites — floating collapsible, top-right of map */}
          <div
            className="absolute top-3 right-3 z-[1001] w-[min(calc(100%-24px),288px)]"
            style={{ pointerEvents: 'auto' }}
          >
            <div
              className="rounded-2xl shadow-xl overflow-hidden"
              style={{
                background: 'var(--bg-widget)',
                border: '1px solid var(--border-subtle)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <button
                type="button"
                onClick={() => setFavoritesPanelOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:brightness-[1.02]"
                style={{
                  background: 'var(--bg-panel)',
                  borderBottom: favoritesPanelOpen ? '1px solid var(--border-subtle)' : 'none',
                }}
                aria-expanded={favoritesPanelOpen}
                aria-controls="route-weather-favorites-panel"
                id="route-weather-favorites-trigger"
              >
                <Star className="w-4 h-4 shrink-0" style={{ color: accentColor }} aria-hidden />
                <span className="text-xs font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--text-main)' }}>
                  Favorites
                </span>
                {favoritePlaces.length > 0 ? (
                  <span
                    className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md shrink-0"
                    style={{ background: `${accentColor}22`, color: accentColor }}
                  >
                    {favoritePlaces.length}
                  </span>
                ) : null}
                {favoritesPanelOpen ? (
                  <ChevronUp className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden />
                )}
              </button>
              {favoritesPanelOpen ? (
                <div id="route-weather-favorites-panel" className="p-3" role="region" aria-labelledby="route-weather-favorites-trigger">
                  <p className="text-[10px] mb-2 leading-snug" style={{ color: 'var(--text-muted)' }}>
                    Saved on this device. Tap the <strong className="font-semibold">star</strong> next to a field to save; click again to remove.
                  </p>
                  {favoritePlaces.length === 0 ? (
                    <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
                      No favorites yet — pick a place from suggestions, then fill the star.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 max-h-[220px] overflow-y-auto prism-scrollbar pr-0.5" aria-label="Favorite places">
                      {favoritePlaces.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center gap-1 rounded-lg px-1.5 py-1"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                        >
                          <span
                            className="flex-1 min-w-0 text-[11px] leading-snug truncate"
                            title={f.label}
                            style={{ color: 'var(--text-main)' }}
                          >
                            {f.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => applyFavoritePlace(f)}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 hover:brightness-110"
                            style={{ background: '#16A34A22', color: '#16A34A' }}
                            title="Use as starting location"
                          >
                            From
                          </button>
                          <button
                            type="button"
                            onClick={() => applyFavoriteDestination(f)}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 hover:brightness-110"
                            style={{ background: '#DC262622', color: '#DC2626' }}
                            title="Use as destination"
                          >
                            To
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFavoritePlace(f.id)}
                            className="p-1 rounded-md shrink-0 hover:opacity-80"
                            style={{ color: 'var(--text-muted)' }}
                            title="Remove favorite"
                            aria-label={`Remove ${f.label}`}
                          >
                            <Trash2 className="w-3 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Chat overlay — bottom-right of map */}
          <div className="absolute bottom-3 right-3 z-[1000]" style={{ pointerEvents: 'auto' }}>
            {chatOpen ? (
              <div
                className="flex flex-col rounded-2xl overflow-hidden shadow-xl"
                style={{
                  width: 340,
                  height: 380,
                  background: 'var(--bg-widget)',
                  border: '1px solid var(--border-subtle)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-main)' }}>
                    Weather Assistant
                  </span>
                  <button
                    onClick={() => setChatOpen(false)}
                    className="p-1 rounded-md transition-colors hover:bg-black/5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto prism-scrollbar px-3 py-2 space-y-2">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-6">
                      <Sparkles className="w-6 h-6 mx-auto mb-2" style={{ color: accentColor, opacity: 0.5 }} />
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Ask about this location&apos;s weather
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                        {[
                          'Will I hit any rain?',
                          'What\'s the forecast?',
                          'Any severe alerts?',
                        ].map(q => (
                          <button
                            key={q}
                            onClick={() => sendChatMessage(q)}
                            className="text-[10px] px-2 py-1 rounded-full transition-colors hover:opacity-80"
                            style={{
                              background: accentColor + '15',
                              color: accentColor,
                              border: `1px solid ${accentColor}30`,
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className="max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                        style={
                          msg.role === 'user'
                            ? { background: accentColor, color: 'white', borderBottomRightRadius: 4 }
                            : { background: 'var(--bg-input)', color: 'var(--text-main)', borderBottomLeftRadius: 4 }
                        }
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div
                        className="px-3 py-2 rounded-xl text-xs"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', borderBottomLeftRadius: 4 }}
                      >
                        <span className="inline-flex gap-1">
                          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div
                  className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                  style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}
                >
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                    placeholder="Ask about the weather..."
                    className="flex-1 text-xs px-3 py-2 rounded-lg outline-none"
                    style={{
                      background: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => sendChatMessage()}
                    disabled={!chatInput.trim() || chatLoading}
                    className="p-2 rounded-lg transition-all disabled:opacity-30 hover:brightness-110"
                    style={{ background: accentColor, color: 'white' }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all hover:scale-105"
                style={{
                  background: 'var(--bg-widget)',
                  border: '1px solid var(--border-subtle)',
                  color: accentColor,
                }}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-semibold">Ask AI</span>
              </button>
            )}
          </div>
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

