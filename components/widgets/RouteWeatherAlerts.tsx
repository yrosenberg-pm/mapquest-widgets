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
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';

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

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onSelect: (sel: PlaceSelection) => void;
  accentColor: string;
  darkMode: boolean;
  at?: { lat: number; lng: number };
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HereAutosuggestItem[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
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

        setItems(normalized);
        setOpen(normalized.length > 0);
      } catch {
        setItems([]);
        setOpen(false);
      } finally {
        setLoading(false);
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
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm font-medium outline-none transition-all"
          style={{ background: bgInput, border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} /> : null}
        </div>
      </div>
      {open && items.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden z-50"
          style={{ background: bgWidget, border: '1px solid var(--border-subtle)', boxShadow: '0 18px 50px rgba(0,0,0,0.22)' }}
        >
          {items.map((it, idx) => {
            const labelText = it.title || it.address?.label || 'Result';
            const pos = it.position || it.access?.[0];
            return (
              <button
                key={`${it.id || idx}-${labelText}`}
                type="button"
                className="w-full px-4 py-3 text-left text-sm flex items-start gap-3 hover:bg-black/5"
                style={{ color: 'var(--text-main)' }}
                onClick={() => {
                  if (!pos) return;
                  onSelect({ label: labelText, lat: pos.lat, lng: pos.lng });
                  setQuery(labelText);
                  setOpen(false);
                }}
              >
                <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accentColor}12`, color: accentColor }}>
                  <MapPin className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium truncate">{labelText}</span>
                  {it.address?.label && it.address.label !== labelText ? (
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
  const [runError, setRunError] = useState<string | null>(null);

  const mapCenter = useMemo(() => {
    const pt = dest || start;
    if (pt) return { lat: pt.lat, lng: pt.lng };
    return { lat: 39.8283, lng: -98.5795 };
  }, [start, dest]);

  const markers = useMemo(() => {
    const m: any[] = [];
    if (start) m.push({ lat: start.lat, lng: start.lng, label: `Start: ${start.label}`, color: '#64748B', type: 'default' });
    if (dest) m.push({ lat: dest.lat, lng: dest.lng, label: `Destination: ${dest.label}`, color: accentColor, type: 'default' });
    return m;
  }, [start, dest, accentColor]);

  const alertCircles = useMemo(() => {
    return alerts.map(a => {
      const s = severityStyles(a.severity);
      return {
        lat: a.lat,
        lng: a.lng,
        radius: 12000, // meters-ish visual on mapquest/leaflet circle (Leaflet uses meters)
        color: s.text,
        fillOpacity: 0.18,
      };
    });
  }, [alerts]);

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
    setRunError(null);
    setObs(null);
    setForecastDays([]);
    setForecastHours([]);
    setAlerts([]);
    setRoutePolyline(null);
    setRouteMiles(null);

    setLoadingWeather(true);
    setLoadingRoute(true);
    setLoadingAlerts(true);

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

      const days = dd?.forecasts?.forecastLocation?.forecast || dd?.forecasts?.forecastLocation?.[0]?.forecast || [];
      setForecastDays(
        (Array.isArray(days) ? days : []).slice(0, 7).map((x: any) => ({
          dayOfWeek: x.dayOfWeek,
          highTemperature: x.highTemperature,
          lowTemperature: x.lowTemperature,
          description: x.description,
          iconName: x.iconName,
          precipitationProbability: x.precipitationProbability,
        }))
      );

      const hours = h?.hourlyForecasts?.forecastLocation?.forecast || h?.hourlyForecasts?.forecastLocation?.[0]?.forecast || [];
      setForecastHours(
        (Array.isArray(hours) ? hours : []).slice(0, 36).map((x: any) => ({
          localTime: x.localTime,
          temperature: x.temperature,
          description: x.description,
          iconName: x.iconName,
          precipitationProbability: x.precipitationProbability,
        }))
      );
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

      // Sample points & fetch alerts
      const sampleEveryMiles = 50;
      const samples: Array<{ lat: number; lng: number; milesAt: number }> = [];
      let acc = 0;
      let nextTarget = sampleEveryMiles;
      for (let i = 1; i < coords.length; i++) {
        const seg = milesBetween(coords[i - 1], coords[i]);
        acc += seg;
        if (acc >= nextTarget) {
          samples.push({ lat: coords[i].lat, lng: coords[i].lng, milesAt: Math.round(acc) });
          nextTarget += sampleEveryMiles;
          if (samples.length >= 12) break;
        }
      }
      samples.push({ lat: d.lat, lng: d.lng, milesAt: miles ? Math.round(miles) : Math.round(acc) });

      const found: RouteAlert[] = [];
      const seen = new Set<string>();
      for (const sp of samples) {
        const aRes = await fetch(`/api/here?endpoint=weather&product=alerts&latitude=${sp.lat}&longitude=${sp.lng}`);
        const aJson = await aRes.json();
        const list: AlertItem[] = aJson?.alerts?.alerts || aJson?.alerts || aJson?.warning || aJson?.warnings || [];
        const arr = Array.isArray(list) ? list : [];
        for (const a of arr) {
          const title = a.headline || a.type || a.description || 'Weather Alert';
          const key = `${title}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const sev = severityFromTitle(title);
          const timeWindow =
            a.startTime || a.endTime
              ? `${a.startTime ? new Date(a.startTime).toLocaleString() : ''}${a.endTime ? ` → ${new Date(a.endTime).toLocaleString()}` : ''}`
              : undefined;
          found.push({
            key,
            title,
            severity: sev,
            detail: a.description,
            timeWindow,
            milesAt: sp.milesAt,
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
    }
  };

  return (
    <div
      className="prism-widget w-full md:w-[1100px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className="flex flex-col md:flex-row md:h-[760px]">
        {/* Left panel */}
        <div className="w-full md:w-[460px] flex flex-col border-t md:border-t-0 md:border-r md:order-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base" style={{ color: 'var(--text-main)' }}>Route Weather Alerts</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Weather + alerts along your route
                </p>
              </div>
              {(loadingWeather || loadingRoute || loadingAlerts) && <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />}
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <AutosuggestInput
              label="Starting point"
              placeholder="Enter a starting address"
              value={startText}
              onChange={(v) => setStartText(v)}
              onSelect={(sel) => {
                setStart(sel);
                setStartText(sel.label);
              }}
              accentColor={accentColor}
              darkMode={darkMode}
              at={dest || undefined}
            />
            <AutosuggestInput
              label="Destination"
              placeholder="Enter a destination"
              value={destText}
              onChange={(v) => setDestText(v)}
              onSelect={(sel) => {
                setDest(sel);
                setDestText(sel.label);
              }}
              accentColor={accentColor}
              darkMode={darkMode}
              at={start || undefined}
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

          {/* Keep content visible without internal scroll by compacting sections */}
          <div className="flex-1 min-h-0 overflow-hidden p-4 space-y-3">
            {runError && (
              <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--border-subtle)' }}>
                {runError}
              </div>
            )}
            {/* Destination Weather */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                  Destination Weather
                </div>
                {dest ? (
                  <div className="text-xs truncate max-w-[220px]" style={{ color: 'var(--text-muted)' }} title={dest.label}>
                    {dest.label}
                  </div>
                ) : null}
              </div>

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
                      <div className="text-sm font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
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
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Droplets className="w-4 h-4" />
                        Humidity
                      </div>
                      <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-main)' }}>
                        {toNumber(obs.humidity) ?? '--'}%
                      </div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Wind className="w-4 h-4" />
                        Wind
                      </div>
                      <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-main)' }}>
                        {toNumber(obs.windSpeed) ?? '--'} mph
                      </div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Eye className="w-4 h-4" />
                        Visibility
                      </div>
                      <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-main)' }}>
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

            {/* Forecast */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                  Forecast
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForecastMode('daily')}
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
                    onClick={() => setForecastMode('hourly')}
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
              </div>

              {forecastMode === 'daily' ? (
                <div className="grid grid-cols-7 gap-1.5">
                  {forecastDays.slice(0, 7).map((d, i) => (
                    <div key={i} className="rounded-xl p-1.5 text-center" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                        {(d.dayOfWeek || '').slice(0, 3) || '—'}
                      </div>
                      <div className="mt-0.5 flex items-center justify-center" style={{ color: accentColor }}>
                        <div className="scale-90">
                          <WeatherIcon desc={d.description || ''} />
                        </div>
                      </div>
                      <div className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-main)' }}>
                        {toNumber(d.highTemperature) ?? '--'}/{toNumber(d.lowTemperature) ?? '--'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {forecastHours.slice(0, 6).map((h, i) => (
                    <div key={i} className="rounded-xl p-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          {(h.localTime || '').slice(-5) || '—'}
                        </div>
                        <div style={{ color: accentColor }}>
                          <WeatherIcon desc={h.description || ''} />
                        </div>
                      </div>
                      <div className="text-sm font-bold mt-1" style={{ color: 'var(--text-main)' }}>
                        {toNumber(h.temperature) ?? '--'}°F
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        {toNumber(h.precipitationProbability) ?? 0}% precip
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Route Alerts */}
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                  Route Weather Alerts
                </div>
                {routeMiles ? (
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    ~{routeMiles.toFixed(0)} mi
                  </div>
                ) : null}
              </div>

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
                  {alerts.slice(0, 2).map((a) => {
                    const s = severityStyles(a.severity);
                    return (
                      <div key={a.key} className="p-3 rounded-xl" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold" style={{ color: s.text }}>
                              {a.title}
                            </div>
                            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                              {a.milesAt ? `Near mile ${a.milesAt} of your route` : 'Along your route'}
                              {a.timeWindow ? ` · ${a.timeWindow}` : ''}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: '#00000010', color: s.text }}>
                            {a.severity.toUpperCase()}
                          </span>
                        </div>
                        {a.detail ? (
                          <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                            {a.detail}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {alerts.length > 2 && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      +{alerts.length - 2} more alerts found (zoom map for markers)
                    </div>
                  )}
                </div>
              )}
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
              <span>
                {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
                Powered by <strong>HERE</strong>
              </span>
            </div>
          )}
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
            circles={alertCircles}
            showRoute={!!routePolyline}
            routePolyline={routePolyline || undefined}
          />
        </div>
      </div>
    </div>
  );
}

