'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Bath,
  BedDouble,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Filter,
  Home,
  Loader2,
  MapPin,
  Ruler,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import WidgetHeader from './WidgetHeader';
import AddressAutocomplete from '../AddressAutocomplete';
import { geocode } from '@/lib/mapquest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubjectProperty {
  address: string;
  lat: number;
  lng: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
}

interface CompSale {
  id: string;
  address: string;
  lat: number;
  lng: number;
  salePrice: number;
  saleDate: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  distanceMi: number;
}

interface Filters {
  startDate: string;
  endDate: string;
  propertyType: string;
  minSqft: string;
  maxSqft: string;
  minBeds: string;
  minBaths: string;
}

type SortKey = 'date' | 'price' | 'distance';
type SortDir = 'asc' | 'desc';

interface Props {
  apiKey?: string;
  darkMode?: boolean;
  accentColor?: string;
  fontFamily?: string;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtPrice(n: number | null): string {
  if (!n) return 'N/A';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtPriceFull(n: number | null): string {
  if (!n) return 'N/A';
  return `$${n.toLocaleString()}`;
}

function fmtDate(d: string | null): string {
  if (!d) return 'N/A';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(d: string | null): string {
  if (!d) return 'N/A';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

const PRICE_STOPS = [
  '#3B82F6', // blue  – low
  '#06B6D4', // cyan
  '#10B981', // green
  '#84CC16', // lime
  '#F59E0B', // amber
  '#F97316', // orange
  '#EF4444', // red   – high
];

function priceToColor(price: number, min: number, max: number): string {
  if (max <= min) return PRICE_STOPS[3];
  const t = Math.max(0, Math.min(1, (price - min) / (max - min)));
  const idx = Math.min(Math.floor(t * (PRICE_STOPS.length - 1)), PRICE_STOPS.length - 2);
  const frac = t * (PRICE_STOPS.length - 1) - idx;
  // Simple step — pick the nearest stop
  return PRICE_STOPS[frac < 0.5 ? idx : idx + 1];
}

const PROPERTY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'SFR', label: 'Single Family' },
  { value: 'CND', label: 'Condo / Townhome' },
  { value: 'MFR', label: 'Multi-Family' },
];

const DEFAULT_FILTERS: Filters = {
  startDate: '',
  endDate: '',
  propertyType: '',
  minSqft: '',
  maxSqft: '',
  minBeds: '',
  minBaths: '',
};

function splitAddress(text: string): { address1: string; address2: string } {
  const parts = text.split(',').map((s) => s.trim());
  if (parts.length >= 3) {
    return { address1: parts[0], address2: parts.slice(1).join(', ') };
  }
  if (parts.length === 2) {
    const looksLikeStreet = /^\d/.test(parts[0]);
    if (looksLikeStreet) return { address1: parts[0], address2: parts[1] };
    return { address1: text, address2: '' };
  }
  return { address1: text, address2: '' };
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

async function fetchSubjectProperty(
  address1: string,
  address2: string,
): Promise<SubjectProperty | null> {
  const params = new URLSearchParams({
    endpoint: 'property-expandedprofile',
    address1,
    address2,
  });
  try {
    const res = await fetch(`/api/attom?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const prop = data?.property?.[0];
    if (!prop) return null;

    const addr = prop.address || {};
    const loc = prop.location || {};
    const summary = prop.summary || {};
    const building = prop.building || {};
    const rooms = building.rooms || {};
    const size = building.size || {};
    const sale = prop.sale || {};
    const saleAmt = sale.amount || {};

    return {
      address: `${addr.line1 || address1}, ${addr.line2 || address2}`,
      lat: parseFloat(loc.latitude) || 0,
      lng: parseFloat(loc.longitude) || 0,
      beds: rooms.beds || null,
      baths: rooms.bathstotal || rooms.bathsfull || null,
      sqft: size.livingsize || size.universalsize || null,
      yearBuilt: summary.yearbuilt || null,
      propertyType: summary.proptype || summary.propsubtype || null,
      lastSalePrice: saleAmt.saleamt || null,
      lastSaleDate: saleAmt.salerecdate || sale.salesearchdate || null,
    };
  } catch {
    return null;
  }
}

async function fetchComps(
  lat: number,
  lng: number,
  radius: number,
  filters: Filters,
): Promise<CompSale[]> {
  const params = new URLSearchParams({
    endpoint: 'sale-snapshot',
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radius),
    pagesize: '100',
  });

  if (filters.startDate) params.set('minsalesearchdate', filters.startDate);
  if (filters.endDate) params.set('maxsalesearchdate', filters.endDate);
  if (filters.propertyType) params.set('propertytype', filters.propertyType);
  if (filters.minSqft) params.set('minbldgsize', filters.minSqft);
  if (filters.maxSqft) params.set('maxbldgsize', filters.maxSqft);
  if (filters.minBeds) params.set('minbeds', filters.minBeds);
  if (filters.minBaths) params.set('minbaths', filters.minBaths);

  try {
    const res = await fetch(`/api/attom?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    const properties = data?.property || [];

    return properties
      .filter((p: any) => {
        const amt =
          p.sale?.amount?.saleamt || p.sale?.amount?.saletransactionamount;
        return amt && amt > 0;
      })
      .map((p: any, i: number) => {
        const addr = p.address || {};
        const loc = p.location || {};
        const sale = p.sale || {};
        const saleAmt = sale.amount || {};
        const bldg = p.building || {};
        const rooms = bldg.rooms || {};
        const size = bldg.size || {};

        const pLat = parseFloat(loc.latitude) || 0;
        const pLng = parseFloat(loc.longitude) || 0;

        return {
          id: `${i}-${pLat}-${pLng}`,
          address:
            [addr.line1, addr.line2].filter(Boolean).join(', ') || 'Unknown',
          lat: pLat,
          lng: pLng,
          salePrice:
            saleAmt.saleamt || saleAmt.saletransactionamount || 0,
          saleDate:
            saleAmt.salerecdate || sale.salesearchdate || '',
          beds: rooms.beds || null,
          baths: rooms.bathstotal || rooms.bathsfull || null,
          sqft: size.livingsize || size.universalsize || null,
          propertyType: p.summary?.proptype || p.summary?.propsubtype || null,
          distanceMi: haversine(lat, lng, pLat, pLng),
        };
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function ComparableSalesMap({
  apiKey = '',
  darkMode = false,
  accentColor = '#2563eb',
  fontFamily,
  showBranding = true,
  companyName,
  companyLogo,
}: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [compsLoading, setCompsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<SubjectProperty | null>(null);
  const [comps, setComps] = useState<CompSale[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);
  const [selectedCompIds, setSelectedCompIds] = useState<Set<string>>(new Set());

  const border = 'var(--border-subtle)';
  const textMain = 'var(--text-main)';
  const textMuted = 'var(--text-muted)';

  const subjectRef = useRef<SubjectProperty | null>(null);

  // ── Search ──────────────────────────────────────────────────

  const loadComps = useCallback(
    async (lat: number, lng: number, f: Filters) => {
      setCompsLoading(true);
      const results = await fetchComps(lat, lng, 1, f);
      setComps(results);
      setCompsLoading(false);
    },
    [],
  );

  const doSearch = useCallback(
    async (text: string, latHint?: number, lngHint?: number) => {
      setLoading(true);
      setError(null);
      setSubject(null);
      setComps([]);
      setSelectedCompIds(new Set());

      try {
        const { address1, address2 } = splitAddress(text);

        // Try ATTOM property lookup first
        let subj = await fetchSubjectProperty(address1, address2);

        if (!subj || !subj.lat || !subj.lng) {
          // Fallback to geocode
          let lat = latHint,
            lng = lngHint;
          if (!lat || !lng) {
            const geo = await geocode(text);
            if (!geo?.lat || !geo?.lng) {
              setError(`Could not locate "${text}".`);
              return;
            }
            lat = geo.lat;
            lng = geo.lng;
          }
          // Build minimal subject from geocode
          if (!subj) {
            subj = {
              address: text,
              lat,
              lng,
              beds: null,
              baths: null,
              sqft: null,
              yearBuilt: null,
              propertyType: null,
              lastSalePrice: null,
              lastSaleDate: null,
            };
          } else {
            subj.lat = lat;
            subj.lng = lng;
          }
        }

        setSubject(subj);
        subjectRef.current = subj;
        await loadComps(subj.lat, subj.lng, filters);
      } catch (e: any) {
        setError(e.message || 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [filters, loadComps],
  );

  const handleSelect = useCallback(
    (result: { displayString: string; lat?: number; lng?: number }) => {
      doSearch(result.displayString, result.lat, result.lng);
    },
    [doSearch],
  );

  const handleEnter = useCallback(() => {
    if (query.trim()) doSearch(query.trim());
  }, [query, doSearch]);

  // ── Filters ──────────────────────────────────────────────────

  const updateFilter = useCallback(
    (key: keyof Filters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const applyFilters = useCallback(() => {
    if (subjectRef.current) {
      loadComps(subjectRef.current.lat, subjectRef.current.lng, filters);
    }
  }, [filters, loadComps]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    if (subjectRef.current) {
      loadComps(
        subjectRef.current.lat,
        subjectRef.current.lng,
        DEFAULT_FILTERS,
      );
    }
  }, [loadComps]);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => v !== ''),
    [filters],
  );

  // ── Sort ──────────────────────────────────────────────────

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortKey(key);
        setSortDir(key === 'distance' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

  const sortedComps = useMemo(() => {
    const sorted = [...comps];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        cmp = new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime();
      } else if (sortKey === 'price') {
        cmp = a.salePrice - b.salePrice;
      } else {
        cmp = a.distanceMi - b.distanceMi;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [comps, sortKey, sortDir]);

  // ── Selection (compare up to 3) ─────────────────────────

  const toggleCompSelection = useCallback((id: string) => {
    setSelectedCompIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) return prev;
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedCompIds(new Set()), []);

  const selectedComps = useMemo(
    () => comps.filter((c) => selectedCompIds.has(c.id)),
    [comps, selectedCompIds],
  );

  // ── Price range for color coding ─────────────────────────

  const { minPrice, maxPrice } = useMemo(() => {
    if (!comps.length) return { minPrice: 0, maxPrice: 0 };
    const prices = comps.map((c) => c.salePrice);
    return { minPrice: Math.min(...prices), maxPrice: Math.max(...prices) };
  }, [comps]);

  // ── Map data ──────────────────────────────────────────────

  const markers = useMemo(() => {
    const m: Array<{
      lat: number;
      lng: number;
      label?: string;
      color?: string;
      type?: 'home' | 'poi' | 'default';
      zIndexOffset?: number;
    }> = [];

    if (subject) {
      m.push({
        lat: subject.lat,
        lng: subject.lng,
        label: `<div style="min-width:160px">
          <div style="font-weight:700;margin-bottom:2px">${subject.address.split(',')[0]}</div>
          <div style="font-size:11px;opacity:0.7">Subject Property</div>
          ${subject.lastSalePrice ? `<div style="font-size:12px;margin-top:2px">${fmtPriceFull(subject.lastSalePrice)}</div>` : ''}
        </div>`,
        color: '#FFFFFF',
        type: 'home',
        zIndexOffset: 1000,
      });
    }

    for (const comp of comps) {
      const color = priceToColor(comp.salePrice, minPrice, maxPrice);
      const bedbath = [
        comp.beds != null ? `${comp.beds}bd` : null,
        comp.baths != null ? `${comp.baths}ba` : null,
      ]
        .filter(Boolean)
        .join(' / ');
      m.push({
        lat: comp.lat,
        lng: comp.lng,
        label: `<div style="min-width:180px">
          <div style="font-weight:700;margin-bottom:2px">${comp.address.split(',')[0]}</div>
          <div style="font-size:13px;font-weight:600;color:${color}">${fmtPriceFull(comp.salePrice)}</div>
          <div style="font-size:11px;opacity:0.7;margin-top:2px">${fmtDate(comp.saleDate)}</div>
          ${bedbath ? `<div style="font-size:11px;opacity:0.7">${bedbath}${comp.sqft ? ` · ${comp.sqft.toLocaleString()} sqft` : ''}</div>` : ''}
        </div>`,
        color,
        type: 'poi',
      });
    }

    return m;
  }, [subject, comps, minPrice, maxPrice]);

  // ── Legend steps ───────────────────────────────────────────

  const legendSteps = useMemo(() => {
    if (!comps.length) return [];
    const steps = 5;
    const range = maxPrice - minPrice;
    if (range <= 0) return [{ color: PRICE_STOPS[3], label: fmtPrice(minPrice) }];
    return Array.from({ length: steps }, (_, i) => {
      const t = i / (steps - 1);
      const price = minPrice + t * range;
      const color = priceToColor(price, minPrice, maxPrice);
      return { color, label: fmtPrice(price) };
    });
  }, [comps, minPrice, maxPrice]);

  const subtitle = subject
    ? `${comps.length} comparable sale${comps.length !== 1 ? 's' : ''} near ${subject.address.split(',')[0]}`
    : 'Find recent sales near any property';

  // ── Render ────────────────────────────────────────────────

  const SortButton = ({
    label,
    sk,
  }: {
    label: string;
    sk: SortKey;
  }) => (
    <button
      onClick={() => toggleSort(sk)}
      className="flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
      style={{ color: sortKey === sk ? accentColor : textMuted }}
    >
      {label}
      {sortKey === sk && (
        sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
      )}
    </button>
  );

  return (
    <div
      className="prism-widget w-full md:w-[1200px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ fontFamily: fontFamily || 'var(--brand-font)', '--brand-primary': accentColor, '--brand-primary-alpha': `${accentColor}0C` } as React.CSSProperties}
    >
      <WidgetHeader
        title="Comparable Sales Map"
        subtitle={subtitle}
        variant="impressive"
        layout="inline"
        icon={<DollarSign className="w-4 h-4" />}
      />

      <div className="flex flex-col md:flex-row md:h-[755px]">
        {/* ── Left panel — Search, Filters & Comps List ────────── */}
        <div
          className="w-full flex flex-col border-t md:border-t-0 md:border-r md:order-1 overflow-hidden"
          style={{ borderColor: border, flex: '0 0 30%', maxWidth: '30%' }}
        >
          {/* Search */}
          <div
            className="px-4 py-3 flex-shrink-0"
            style={{ borderBottom: `1px solid ${border}` }}
          >
            <div
              className="rounded-xl flex items-center gap-2.5"
              style={{
                background: 'var(--bg-input)',
                border: `1px solid ${border}`,
                padding: '10px 14px',
              }}
            >
              {loading ? (
                <Loader2
                  className="w-4 h-4 flex-shrink-0 animate-spin"
                  style={{ color: accentColor }}
                />
              ) : (
                <Search
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: accentColor }}
                />
              )}
              <AddressAutocomplete
                value={query}
                onChange={setQuery}
                onSelect={handleSelect}
                onEnter={handleEnter}
                placeholder="Enter a property address…"
                darkMode={darkMode}
                className="flex-1"
                hideIcon
              />
            </div>
          </div>

          {/* Subject summary card */}
          {subject && !loading && (
            <div
              className="flex-shrink-0 mx-4 mt-3 mb-2 rounded-xl p-3"
              style={{
                background: `color-mix(in srgb, ${accentColor} 6%, var(--bg-widget))`,
                border: `1px solid color-mix(in srgb, ${accentColor} 15%, transparent)`,
              }}
            >
              <div className="flex items-start gap-2">
                <Home
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: accentColor }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm font-bold truncate"
                    style={{ color: textMain }}
                  >
                    {subject.address.split(',')[0]}
                  </div>
                  <div
                    className="text-[11px] truncate"
                    style={{ color: textMuted }}
                  >
                    {subject.address.split(',').slice(1).join(',').trim()}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
                    {subject.lastSalePrice && (
                      <span className="font-semibold" style={{ color: accentColor }}>
                        {fmtPriceFull(subject.lastSalePrice)}
                      </span>
                    )}
                    {subject.beds != null && (
                      <span style={{ color: textMuted }}>{subject.beds}bd</span>
                    )}
                    {subject.baths != null && (
                      <span style={{ color: textMuted }}>{subject.baths}ba</span>
                    )}
                    {subject.sqft != null && (
                      <span style={{ color: textMuted }}>{subject.sqft.toLocaleString()} sqft</span>
                    )}
                    {subject.yearBuilt != null && (
                      <span style={{ color: textMuted }}>Built {subject.yearBuilt}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filter toggle + bar */}
          <div
            className="flex-shrink-0"
            style={{ borderBottom: `1px solid ${border}` }}
          >
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors"
              style={{ color: hasActiveFilters ? accentColor : textMuted }}
            >
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: accentColor }}
                  />
                )}
              </span>
              {filtersOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {filtersOpen && (
              <div className="px-4 pb-3 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: textMuted }}>From</label>
                    <input type="date" value={filters.startDate} onChange={(e) => updateFilter('startDate', e.target.value)} className="w-full text-xs rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, color: textMain }} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: textMuted }}>To</label>
                    <input type="date" value={filters.endDate} onChange={(e) => updateFilter('endDate', e.target.value)} className="w-full text-xs rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, color: textMain }} />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: textMuted }}>Property Type</label>
                  <select value={filters.propertyType} onChange={(e) => updateFilter('propertyType', e.target.value)} className="w-full text-xs rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, color: textMain }}>
                    {PROPERTY_TYPES.map((pt) => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: textMuted }}>Min Sqft</label>
                    <input type="number" placeholder="—" value={filters.minSqft} onChange={(e) => updateFilter('minSqft', e.target.value)} className="w-full text-xs rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, color: textMain }} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: textMuted }}>Max Sqft</label>
                    <input type="number" placeholder="—" value={filters.maxSqft} onChange={(e) => updateFilter('maxSqft', e.target.value)} className="w-full text-xs rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, color: textMain }} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: textMuted }}>Min Beds</label>
                    <input type="number" placeholder="—" min={0} value={filters.minBeds} onChange={(e) => updateFilter('minBeds', e.target.value)} className="w-full text-xs rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, color: textMain }} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: textMuted }}>Min Baths</label>
                    <input type="number" placeholder="—" min={0} value={filters.minBaths} onChange={(e) => updateFilter('minBaths', e.target.value)} className="w-full text-xs rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, color: textMain }} />
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={applyFilters} disabled={!subject} className="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-opacity disabled:opacity-40" style={{ background: accentColor, color: '#fff' }}>
                    Apply
                  </button>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${border}`, color: textMuted }}>
                      <X className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Comps list — sort bar + scrollable rows */}
          {comps.length > 0 && (
            <div
              className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
              style={{ borderBottom: `1px solid ${border}` }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
                Sort
              </span>
              <SortButton label="Date" sk="date" />
              <SortButton label="Price" sk="price" />
              <SortButton label="Dist" sk="distance" />
              <span className="ml-auto flex items-center gap-2">
                {selectedCompIds.size > 0 && (
                  <button
                    onClick={clearSelection}
                    className="flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors"
                    style={{ color: accentColor, background: `color-mix(in srgb, ${accentColor} 8%, transparent)` }}
                  >
                    <X className="w-3 h-3" />
                    {selectedCompIds.size} selected
                  </button>
                )}
                <span className="text-[10px] tabular-nums" style={{ color: textMuted }}>
                  {comps.length} sale{comps.length !== 1 ? 's' : ''}
                </span>
              </span>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar">
            {!loading && subject && comps.length === 0 && !compsLoading && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm" style={{ color: textMuted }}>
                  No comparable sales found. Try adjusting your filters.
                </p>
              </div>
            )}

            {compsLoading && !loading && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: accentColor }} />
                <span className="text-xs" style={{ color: textMuted }}>Loading comps…</span>
              </div>
            )}

            {sortedComps.map((comp) => {
              const color = priceToColor(comp.salePrice, minPrice, maxPrice);
              const isSelected = selectedCompIds.has(comp.id);
              const canSelect = isSelected || selectedCompIds.size < 3;
              return (
                <div
                  key={comp.id}
                  className="px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors"
                  style={{
                    borderBottom: `1px solid ${border}`,
                    background: isSelected
                      ? `color-mix(in srgb, ${accentColor} 8%, transparent)`
                      : hoveredCompId === comp.id
                        ? `color-mix(in srgb, ${accentColor} 4%, transparent)`
                        : 'transparent',
                  }}
                  onClick={() => canSelect && toggleCompSelection(comp.id)}
                  onMouseEnter={() => setHoveredCompId(comp.id)}
                  onMouseLeave={() => setHoveredCompId(null)}
                >
                  <div
                    className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors"
                    style={{
                      border: isSelected ? 'none' : `1.5px solid ${border}`,
                      background: isSelected ? accentColor : 'transparent',
                      opacity: canSelect ? 1 : 0.3,
                    }}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold truncate" style={{ color: textMain }}>
                        {comp.address.split(',')[0]}
                      </span>
                      <span className="text-xs font-bold tabular-nums flex-shrink-0 ml-auto" style={{ color }}>
                        {fmtPrice(comp.salePrice)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] tabular-nums" style={{ color: textMuted }}>
                        {fmtDateShort(comp.saleDate)}
                      </span>
                      <span className="text-[10px]" style={{ color: textMuted }}>
                        {comp.beds != null ? `${comp.beds}bd` : '—'}/{comp.baths != null ? `${comp.baths}ba` : '—'}
                      </span>
                      {comp.sqft != null && (
                        <span className="text-[10px] tabular-nums" style={{ color: textMuted }}>
                          {comp.sqft.toLocaleString()}sf
                        </span>
                      )}
                      <span className="text-[10px] tabular-nums ml-auto" style={{ color: textMuted }}>
                        {comp.distanceMi.toFixed(2)}mi
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty / loading state */}
          {!subject && !loading && comps.length === 0 && (
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="text-center">
                <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" style={{ color: textMuted }} />
                <p className="text-sm" style={{ color: textMuted }}>Search for an address to find comparable sales</p>
              </div>
            </div>
          )}
          {loading && (
            <div className="flex-1 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
              <span className="text-sm" style={{ color: textMuted }}>Searching…</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex-shrink-0 px-4 py-3">
              <p className="text-sm text-center" style={{ color: '#EF4444' }}>{error}</p>
            </div>
          )}
        </div>

        {/* ── Right panel — Map + Comparison (70%) ───────────── */}
        <div
          className="w-full flex flex-col md:order-2 overflow-hidden"
          style={{ flex: '0 0 70%', maxWidth: '70%' }}
        >
          {/* Map — fills available space, no gap */}
          <div className="relative flex-1" style={{ minHeight: 0 }}>
            <MapQuestMap
              apiKey={apiKey}
              center={
                subject
                  ? { lat: subject.lat, lng: subject.lng }
                  : { lat: 34.0522, lng: -118.2437 }
              }
              zoom={subject ? 14 : 10}
              markers={markers}
              darkMode={darkMode}
              height="100%"
            />

            {/* Price legend */}
            {legendSteps.length > 0 && (
              <div
                className="absolute left-3 z-[500] rounded-xl px-3 py-2.5 shadow-lg"
                style={{
                  bottom: 46,
                  background: 'var(--bg-widget)',
                  border: `1px solid ${border}`,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="text-[9px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: textMuted }}
                >
                  Sale Price
                </div>
                <div className="flex items-center gap-0.5">
                  {PRICE_STOPS.map((color, i) => (
                    <div
                      key={i}
                      className="w-5 h-2 first:rounded-l last:rounded-r"
                      style={{ background: color }}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] tabular-nums" style={{ color: textMuted }}>
                    {fmtPrice(minPrice)}
                  </span>
                  <span className="text-[9px] tabular-nums" style={{ color: textMuted }}>
                    {fmtPrice(maxPrice)}
                  </span>
                </div>
              </div>
            )}

            {/* Loading overlay */}
            {(loading || compsLoading) && (
              <div
                className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5 z-[500]"
                style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}
              >
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: accentColor }} />
                <span className="text-[10px]" style={{ color: textMuted }}>Loading…</span>
              </div>
            )}
          </div>

          {/* Comparison panel — shows below map when 2+ selected */}
          {selectedComps.length >= 2 && (
            <div
              className="flex-shrink-0 overflow-x-auto"
              style={{ borderTop: `1px solid ${border}` }}
            >
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accentColor }}>
                    Comparison
                  </span>
                  <button onClick={clearSelection} className="text-[10px] ml-auto" style={{ color: textMuted }}>
                    Clear
                  </button>
                </div>
                <div className="grid gap-px rounded-lg overflow-hidden" style={{ gridTemplateColumns: `100px repeat(${selectedComps.length}, 1fr)`, background: border }}>
                  {/* Header row */}
                  <div className="text-[10px] font-semibold px-2.5 py-1.5" style={{ background: 'var(--bg-widget)', color: textMuted }} />
                  {selectedComps.map((c) => {
                    const color = priceToColor(c.salePrice, minPrice, maxPrice);
                    return (
                      <div key={c.id} className="px-2.5 py-1.5" style={{ background: 'var(--bg-widget)' }}>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-[11px] font-bold truncate" style={{ color: textMain }}>{c.address.split(',')[0]}</span>
                        </div>
                      </div>
                    );
                  })}
                  {/* Data rows */}
                  {[
                    { label: 'Sale Price', fn: (c: CompSale) => fmtPriceFull(c.salePrice) },
                    { label: 'Sale Date', fn: (c: CompSale) => fmtDate(c.saleDate) },
                    { label: 'Beds', fn: (c: CompSale) => c.beds != null ? String(c.beds) : 'N/A' },
                    { label: 'Baths', fn: (c: CompSale) => c.baths != null ? String(c.baths) : 'N/A' },
                    { label: 'Sq Ft', fn: (c: CompSale) => c.sqft != null ? c.sqft.toLocaleString() : 'N/A' },
                    { label: '$/Sq Ft', fn: (c: CompSale) => c.sqft && c.salePrice ? `$${Math.round(c.salePrice / c.sqft)}` : 'N/A' },
                    { label: 'Distance', fn: (c: CompSale) => `${c.distanceMi.toFixed(2)} mi` },
                  ].map((row) => (
                    <React.Fragment key={row.label}>
                      <div className="text-[10px] font-semibold px-2.5 py-1 flex items-center" style={{ background: 'var(--bg-widget)', color: textMuted }}>
                        {row.label}
                      </div>
                      {selectedComps.map((c) => (
                        <div key={c.id} className="text-[11px] tabular-nums px-2.5 py-1 flex items-center" style={{ background: 'var(--bg-widget)', color: textMain }}>
                          {row.fn(c)}
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBranding && (
        <div className="prism-footer">
          {companyLogo && (
            <img src={companyLogo} alt={companyName || 'Company logo'} className="prism-footer-logo" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <span aria-label="Powered by MapQuest + ATTOM">
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by
          </span>
          <img src="/brand/mapquest-footer-light.svg" alt="MapQuest" className="prism-footer-logo prism-footer-logo--light" />
          <img src="/brand/mapquest-footer-dark.svg" alt="MapQuest" className="prism-footer-logo prism-footer-logo--dark" />
          <span style={{ fontSize: '10px', opacity: 0.5 }}>+ ATTOM</span>
        </div>
      )}
    </div>
  );
}
