// components/widgets/MultiZoneCoverage.tsx
'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  Loader2, Search, Plus, X, Eye, EyeOff, Layers, MapPin, Trash2,
  CheckCircle2, XCircle, Mail, ClipboardPaste,
} from 'lucide-react';
import { geocode } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';
import WidgetHeader from './WidgetHeader';

interface MultiZoneCoverageProps {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

const ZONE_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

interface Zone {
  id: string;
  name: string;
  type: 'zip' | 'city' | 'state' | 'county' | 'neighborhood';
  color: string;
  coordinates: { lat: number; lng: number }[];
  visible: boolean;
}

// ──────────────────────────── helpers ────────────────────────────

const US_STATES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia',
  'hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts',
  'michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey',
  'new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
  'south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia',
  'wisconsin','wyoming',
]);

const NEIGHBORHOOD_HINTS = /\b(district|heights|hill|hills|village|park|square|quarter|landing|point|beach|terrace|hollow|grove|glen|gardens|flats|crossing|commons|addition)\b/i;

function detectType(query: string): { type: Zone['type']; normalized: string } {
  const trimmed = query.trim();
  if (/^\d{5}(,|\s|$)/.test(trimmed)) return { type: 'zip', normalized: trimmed.slice(0, 5) };
  const lower = trimmed.toLowerCase();
  if (US_STATES.has(lower)) return { type: 'state', normalized: trimmed };
  if (/county/i.test(trimmed)) return { type: 'county', normalized: trimmed };
  if (NEIGHBORHOOD_HINTS.test(trimmed)) return { type: 'neighborhood', normalized: trimmed };
  return { type: 'city', normalized: trimmed };
}

function geojsonToCoords(geometry: any): { lat: number; lng: number }[] | null {
  if (!geometry) return null;
  const { type, coordinates } = geometry;
  if (type === 'Polygon' && coordinates?.[0])
    return coordinates[0].map(([lng, lat]: [number, number]) => ({ lat, lng }));
  if (type === 'MultiPolygon' && coordinates?.length) {
    let best: [number, number][] = [];
    for (const poly of coordinates) {
      if (poly[0] && poly[0].length > best.length) best = poly[0];
    }
    return best.map(([lng, lat]) => ({ lat, lng }));
  }
  return null;
}

async function fetchBoundary(type: string, query: string): Promise<{ label: string; coords: { lat: number; lng: number }[]; resolvedType?: Zone['type'] } | null> {
  try {
    const apiType = type === 'county' ? 'city' : type;
    const res = await fetch(`/api/boundary?type=${apiType}&q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      const coords = geojsonToCoords(data.geometry);
      if (coords && coords.length >= 3) return { label: data.label || query, coords };
    }
    // If the primary lookup failed or returned non-polygon geometry, try neighborhood
    if (apiType !== 'neighborhood') {
      const nbRes = await fetch(`/api/boundary?type=neighborhood&q=${encodeURIComponent(query)}`);
      if (nbRes.ok) {
        const nbData = await nbRes.json();
        const coords = geojsonToCoords(nbData.geometry);
        if (coords && coords.length >= 3) return { label: nbData.label || query, coords, resolvedType: 'neighborhood' };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchSuggestions(query: string): Promise<{ name: string; displayString: string }[]> {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(`/api/mapquest?endpoint=searchahead&q=${encodeURIComponent(query)}&limit=6`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      name: r.name || r.displayString || '',
      displayString: r.displayString || r.name || '',
    }));
  } catch {
    return [];
  }
}

function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function computeBounds(coords: { lat: number; lng: number }[]) {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const c of coords) {
    if (c.lat < south) south = c.lat;
    if (c.lat > north) north = c.lat;
    if (c.lng < west) west = c.lng;
    if (c.lng > east) east = c.lng;
  }
  return { south, north, west, east };
}

function boundsCenter(coords: { lat: number; lng: number }[]) {
  const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
  return { lat, lng };
}

const typeLabel = (t: Zone['type']) => ({ zip: 'ZIP', city: 'City', state: 'State', county: 'County', neighborhood: 'Nbhd' }[t]);

const US_CENTER = { lat: 39.8283, lng: -98.5795 };

// ──────────────────────────── component ────────────────────────────

export default function MultiZoneCoverage({
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: MultiZoneCoverageProps) {
  // ── zone config state ──
  const [zones, setZones] = useState<Zone[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ name: string; displayString: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedZone, setHighlightedZone] = useState<string | null>(null);
  const [focusedZone, setFocusedZone] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorIndexRef = useRef(0);

  // ── customer preview state ──
  const [custAddress, setCustAddress] = useState('');
  const [custLoading, setCustLoading] = useState(false);
  const [custResult, setCustResult] = useState<{
    checked: boolean;
    inArea: boolean;
    address: string;
    lat: number;
    lng: number;
    matchedZone?: Zone;
  } | null>(null);
  const [custEmail, setCustEmail] = useState('');
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  const nextColor = useCallback(() => {
    const c = ZONE_COLORS[colorIndexRef.current % ZONE_COLORS.length];
    colorIndexRef.current++;
    return c;
  }, []);

  // ── search / add ──

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const r = await fetchSuggestions(value);
      setSuggestions(r);
      setShowSuggestions(r.length > 0);
    }, 300);
  }, []);

  const addZone = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    setSuggestions([]);
    try {
      const { type, normalized } = detectType(q);
      const result = await fetchBoundary(type, normalized);
      if (!result) { setError(`No boundary found for "${q}"`); return; }
      const finalType = result.resolvedType || type;
      const zone: Zone = {
        id: `${finalType}-${normalized}-${Date.now()}`,
        name: result.label, type: finalType, color: nextColor(),
        coordinates: result.coords, visible: true,
      };
      setZones(prev => [...prev, zone]);
      setSearchQuery('');
      setFocusedZone(zone.id);
    } catch { setError('Failed to fetch boundary'); }
    finally { setLoading(false); }
  }, [nextColor]);

  // ── bulk paste ──
  const handleBulkPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const items = text.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      if (items.length === 0) { setError('Nothing to paste'); return; }
      setBulkLoading(true);
      setError(null);
      let added = 0;
      let failed = 0;
      for (const item of items) {
        const { type, normalized } = detectType(item);
        const result = await fetchBoundary(type, normalized);
        if (result) {
          const finalType = result.resolvedType || type;
          const zone: Zone = {
            id: `${finalType}-${normalized}-${Date.now()}-${added}`,
            name: result.label, type: finalType, color: nextColor(),
            coordinates: result.coords, visible: true,
          };
          setZones(prev => [...prev, zone]);
          added++;
        } else {
          failed++;
        }
      }
      if (failed > 0) setError(`Added ${added}, skipped ${failed} (not found)`);
    } catch {
      setError('Could not read clipboard');
    } finally {
      setBulkLoading(false);
    }
  }, [nextColor]);

  const removeZone = useCallback((id: string) => {
    setZones(prev => prev.filter(z => z.id !== id));
    if (focusedZone === id) setFocusedZone(null);
    if (highlightedZone === id) setHighlightedZone(null);
  }, [focusedZone, highlightedZone]);

  const toggleVisibility = useCallback((id: string) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, visible: !z.visible } : z));
  }, []);

  const focusZone = useCallback((id: string) => {
    setFocusedZone(id);
    setHighlightedZone(id);
    setTimeout(() => setHighlightedZone(null), 2000);
  }, []);

  // ── customer coverage check ──
  const checkCoverage = useCallback(async (address: string, lat?: number, lng?: number) => {
    setCustLoading(true);
    setCustResult(null);
    setEmailSubmitted(false);
    setCustEmail('');
    try {
      let checkLat = lat;
      let checkLng = lng;
      let resolvedAddr = address;
      if (checkLat == null || checkLng == null) {
        const geo = await geocode(address);
        if (!geo) { setCustResult({ checked: true, inArea: false, address, lat: 0, lng: 0 }); return; }
        checkLat = geo.lat; checkLng = geo.lng;
        resolvedAddr = `${geo.adminArea5 || ''}, ${geo.adminArea3 || ''}`.replace(/^,\s*/, '').trim() || address;
      }
      const visibleZones = zones.filter(z => z.visible);
      let matched: Zone | undefined;
      for (const z of visibleZones) {
        if (pointInPolygon(checkLat, checkLng, z.coordinates)) { matched = z; break; }
      }
      setCustResult({ checked: true, inArea: !!matched, address: resolvedAddr, lat: checkLat, lng: checkLng, matchedZone: matched });
    } catch {
      setCustResult({ checked: true, inArea: false, address, lat: 0, lng: 0 });
    } finally {
      setCustLoading(false);
    }
  }, [zones]);

  // ── config map data ──
  const configPolygons = useMemo(() => {
    return zones.filter(z => z.visible).map(z => ({
      coordinates: z.coordinates,
      color: highlightedZone === z.id ? '#ffffff' : z.color,
      fillOpacity: highlightedZone === z.id ? 0.35 : 0.18,
      strokeWidth: highlightedZone === z.id ? 3 : 2,
      onClick: () => { setHighlightedZone(z.id); setTimeout(() => setHighlightedZone(null), 2000); },
    }));
  }, [zones, highlightedZone]);

  const configCenter = useMemo(() => {
    if (focusedZone) {
      const z = zones.find(z => z.id === focusedZone);
      if (z) return boundsCenter(z.coordinates);
    }
    const visible = zones.filter(z => z.visible);
    if (visible.length > 0) return boundsCenter(visible.flatMap(z => z.coordinates));
    return US_CENTER;
  }, [zones, focusedZone]);

  const configBounds = useMemo(() => {
    const target = focusedZone ? zones.find(z => z.id === focusedZone) : null;
    const visible = zones.filter(z => z.visible);
    const src = target ? [target] : visible;
    if (src.length === 0) return undefined;
    const all = src.flatMap(z => z.coordinates);
    return all.length > 0 ? computeBounds(all) : undefined;
  }, [zones, focusedZone]);

  // ── preview map data ──
  const previewPolygons = useMemo(() => {
    return zones.filter(z => z.visible).map(z => ({
      coordinates: z.coordinates,
      color: custResult?.matchedZone?.id === z.id ? z.color : z.color,
      fillOpacity: custResult?.matchedZone?.id === z.id ? 0.3 : 0.12,
      strokeWidth: custResult?.matchedZone?.id === z.id ? 3 : 1.5,
    }));
  }, [zones, custResult]);

  const previewMarkers = useMemo(() => {
    if (!custResult?.checked || !custResult.lat || !custResult.lng) return [];
    return [{ lat: custResult.lat, lng: custResult.lng, label: custResult.address, color: custResult.inArea ? '#22c55e' : '#ef4444' }];
  }, [custResult]);

  const previewBounds = useMemo(() => {
    if (custResult?.checked && custResult.lat && custResult.lng) {
      const all = zones.filter(z => z.visible).flatMap(z => z.coordinates);
      all.push({ lat: custResult.lat, lng: custResult.lng });
      return computeBounds(all);
    }
    const visible = zones.filter(z => z.visible);
    if (visible.length > 0) return computeBounds(visible.flatMap(z => z.coordinates));
    return undefined;
  }, [zones, custResult]);

  const previewCenter = useMemo(() => {
    if (custResult?.checked && custResult.lat && custResult.lng) return { lat: custResult.lat, lng: custResult.lng };
    const visible = zones.filter(z => z.visible);
    if (visible.length > 0) return boundsCenter(visible.flatMap(z => z.coordinates));
    return US_CENTER;
  }, [zones, custResult]);

  const handleBlur = useCallback(() => { setTimeout(() => setShowSuggestions(false), 200); }, []);

  return (
    <div
      className="prism-widget"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ fontFamily: fontFamily || 'var(--brand-font)', '--brand-primary': accentColor, width: 1200 } as React.CSSProperties}
    >
      <WidgetHeader
        title="Service Area Coverage"
        subtitle="Define coverage zones and preview the customer experience."
        variant="impressive"
        layout="inline"
        icon={<Layers className="w-4 h-4" />}
      />

      <div className="flex flex-col lg:flex-row" style={{ minHeight: 680 }}>
        {/* ═════════════════ LEFT: Business Config (60%) ═════════════════ */}
        <div className="w-full lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r" style={{ borderColor: 'var(--border-subtle)' }}>
          {/* Search bar */}
          <div className="p-3 pb-2">
            <div className="flex gap-2">
              <div className="relative flex-1" style={{ zIndex: 1000 }}>
                <div className="rounded-xl flex items-center gap-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '8px 12px' }}>
                  <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addZone(searchQuery); } }}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    onBlur={handleBlur}
                    placeholder="Search ZIP, city, neighborhood, state..."
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-main)' }}
                  />
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  ) : searchQuery.trim() ? (
                    <button type="button" onClick={() => addZone(searchQuery)} className="flex-shrink-0 hover:brightness-110 transition-all" style={{ color: accentColor }}>
                      <Plus className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl shadow-xl overflow-hidden" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
                    {suggestions.map((s, i) => (
                      <button
                        key={i} type="button"
                        onMouseDown={e => { e.preventDefault(); addZone(s.displayString || s.name); }}
                        className="w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ color: 'var(--text-main)', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                      >
                        <div className="font-medium truncate">{s.name}</div>
                        {s.displayString && s.displayString !== s.name && (
                          <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.displayString}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Bulk paste button */}
              <button
                type="button"
                onClick={handleBulkPaste}
                disabled={bulkLoading}
                className="px-3 rounded-xl text-xs font-semibold transition-all hover:brightness-110 flex items-center gap-1.5 flex-shrink-0"
                style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}30`, color: accentColor }}
                title="Paste comma or newline separated values"
              >
                {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardPaste className="w-3.5 h-3.5" />}
                Bulk
              </button>
            </div>
            {error && <div className="text-[11px] mt-1.5 px-1" style={{ color: 'var(--color-error, #ef4444)' }}>{error}</div>}
          </div>

          {/* Zone list */}
          <div className="px-3 overflow-y-auto prism-scrollbar" style={{ maxHeight: 300 }}>
            {zones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-2" style={{ background: `${accentColor}15` }}>
                  <MapPin className="w-4 h-4" style={{ color: accentColor }} />
                </div>
                <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-main)' }}>No zones added</div>
                <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Search above or paste a list of ZIP codes to define your coverage area.
                </div>
              </div>
            ) : (
              <div className="space-y-1 pb-2">
                {zones.map(zone => {
                  const isFocused = focusedZone === zone.id;
                  return (
                    <div
                      key={zone.id}
                      className="group rounded-lg px-2.5 py-2 transition-all cursor-pointer"
                      style={{ background: isFocused ? `${zone.color}12` : 'transparent', border: `1px solid ${isFocused ? `${zone.color}40` : 'transparent'}` }}
                      onClick={() => focusZone(zone.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: zone.color, opacity: zone.visible ? 1 : 0.3 }} />
                        <div className="text-xs font-medium truncate flex-1" style={{ color: zone.visible ? 'var(--text-main)' : 'var(--text-muted)' }}>
                          {zone.name}
                        </div>
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${zone.color}15`, color: zone.color }}>
                          {typeLabel(zone.type)}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={e => { e.stopPropagation(); toggleVisibility(zone.id); }} className="p-0.5 hover:opacity-60" style={{ color: 'var(--text-muted)' }} title={zone.visible ? 'Hide' : 'Show'}>
                            {zone.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                          <button type="button" onClick={e => { e.stopPropagation(); removeZone(zone.id); }} className="p-0.5 hover:opacity-60" style={{ color: 'var(--color-error, #ef4444)' }} title="Remove">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Zone footer */}
          {zones.length > 0 && (
            <div className="px-3 py-1.5 text-[11px] flex items-center justify-between border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
              <span>{zones.length} zone{zones.length !== 1 ? 's' : ''} · {zones.filter(z => z.visible).length} visible</span>
              <button type="button" onClick={() => { setZones([]); colorIndexRef.current = 0; }} className="font-medium hover:opacity-70" style={{ color: 'var(--color-error, #ef4444)' }}>
                Clear all
              </button>
            </div>
          )}

          {/* Config map */}
          <div className="flex-1 min-h-[250px] relative">
            <MapQuestMap
              apiKey={apiKey}
              center={configCenter}
              zoom={zones.length === 0 ? 4 : 10}
              darkMode={darkMode}
              accentColor={accentColor}
              markers={[]}
              polygons={configPolygons}
              height="100%"
              fitBounds={configBounds}
            />
            {zones.length > 0 && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold shadow" style={{ background: 'var(--bg-widget)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)' }}>
                {zones.filter(z => z.visible).length} zone{zones.filter(z => z.visible).length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* ═════════════════ RIGHT: Customer Preview (40%) ═════════════════ */}
        <div className="w-full lg:w-[40%] flex flex-col" style={{ background: 'var(--bg-panel)' }}>
          {/* Preview chrome */}
          <div className="p-4 pb-3">
            <div className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: 'var(--text-muted)' }}>
              Customer Preview
            </div>

            {/* Simulated widget card */}
            <div className="rounded-2xl overflow-hidden shadow-lg" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              {/* Widget header */}
              <div className="px-4 pt-4 pb-3">
                <div className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>Check if we service your area</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Enter your address to see if you're in our coverage zone.</div>
              </div>

              {/* Address input */}
              <div className="px-4 pb-3">
                <div className="rounded-xl flex items-center gap-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '8px 12px' }}>
                  <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                  <AddressAutocomplete
                    value={custAddress}
                    onChange={v => { setCustAddress(v); setCustResult(null); setEmailSubmitted(false); }}
                    onSelect={r => { if (r.lat && r.lng) { setCustAddress(r.displayString); checkCoverage(r.displayString, r.lat, r.lng); } }}
                    placeholder="Enter your address"
                    darkMode={darkMode}
                    className="flex-1"
                    hideIcon
                  />
                </div>
                <button
                  type="button"
                  disabled={custLoading || !custAddress.trim() || zones.length === 0}
                  onClick={() => checkCoverage(custAddress)}
                  className="w-full mt-2 py-2 rounded-xl text-xs font-semibold transition-all hover:brightness-110"
                  style={{
                    background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                    color: '#fff',
                    opacity: custLoading || !custAddress.trim() || zones.length === 0 ? 0.5 : 1,
                    boxShadow: `0 2px 8px ${accentColor}30`,
                  }}
                >
                  {custLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" /> : null}
                  {custLoading ? 'Checking...' : 'Check Coverage'}
                </button>
              </div>

              {/* Preview map */}
              <div className="h-[200px] relative">
                <MapQuestMap
                  apiKey={apiKey}
                  center={previewCenter}
                  zoom={zones.length === 0 ? 4 : 10}
                  darkMode={darkMode}
                  accentColor={accentColor}
                  markers={previewMarkers}
                  polygons={previewPolygons}
                  height="100%"
                  fitBounds={previewBounds}
                />
                {!custResult && zones.length > 0 && (
                  <div className="absolute inset-x-0 bottom-0 px-3 py-2 text-center text-[11px] font-medium" style={{ background: 'var(--bg-widget)', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
                    Enter your address above to check coverage
                  </div>
                )}
                {zones.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--bg-widget)' }}>
                    <div className="text-xs text-center px-6" style={{ color: 'var(--text-muted)' }}>
                      Add zones on the left to activate the coverage checker.
                    </div>
                  </div>
                )}
              </div>

              {/* Result */}
              {custResult?.checked && (
                <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {custResult.inArea ? (
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#22c55e' }} />
                      <div>
                        <div className="text-sm font-semibold" style={{ color: '#22c55e' }}>Great news! We service your area</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{custResult.address}</div>
                        {custResult.matchedZone && (
                          <div className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                            <div className="w-2 h-2 rounded-full" style={{ background: custResult.matchedZone.color }} />
                            {custResult.matchedZone.name}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start gap-2.5">
                        <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                        <div>
                          <div className="text-sm font-semibold" style={{ color: '#ef4444' }}>Sorry, we don't currently service this area</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{custResult.address}</div>
                        </div>
                      </div>
                      {/* Email capture */}
                      {!emailSubmitted ? (
                        <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                          <div className="text-[11px] font-medium mb-2" style={{ color: 'var(--text-main)' }}>
                            Want to know when we expand to your area?
                          </div>
                          <div className="flex gap-1.5">
                            <div className="flex-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
                              <Mail className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                              <input
                                type="email"
                                value={custEmail}
                                onChange={e => setCustEmail(e.target.value)}
                                placeholder="your@email.com"
                                className="flex-1 bg-transparent text-xs outline-none"
                                style={{ color: 'var(--text-main)' }}
                              />
                            </div>
                            <button
                              type="button"
                              disabled={!custEmail.includes('@')}
                              onClick={() => setEmailSubmitted(true)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-110"
                              style={{ background: accentColor, color: '#fff', opacity: custEmail.includes('@') ? 1 : 0.4 }}
                            >
                              Notify me
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl p-3 text-center" style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
                          <div className="text-xs font-medium" style={{ color: accentColor }}>
                            We'll let you know when we expand to your area!
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Mini branding inside preview */}
              <div className="px-4 py-2 text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
                Powered by
                <img src="/brand/mapquest-footer-light.svg" alt="MapQuest" className="h-3 prism-footer-logo--light" style={{ display: 'inline' }} />
                <img src="/brand/mapquest-footer-dark.svg" alt="MapQuest" className="h-3 prism-footer-logo--dark" style={{ display: 'inline' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Branding Footer */}
      {showBranding && (
        <div className="prism-footer">
          {companyLogo && (
            <img src={companyLogo} alt={companyName || 'Company logo'} className="prism-footer-logo" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
