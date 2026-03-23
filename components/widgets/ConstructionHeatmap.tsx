'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Filter,
  Hammer,
  Loader2,
  MapPin,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import WidgetHeader from './WidgetHeader';
import AddressAutocomplete from '../AddressAutocomplete';
import { reverseGeocode } from '@/lib/mapquest';

interface ShovelsPermit {
  id: string;
  description: string;
  tags: string[];
  property_type: string;
  job_value: number | null;
  fees: number | null;
  status: string;
  file_date: string | null;
  issue_date: string | null;
  address: {
    city: string;
    zip_code: string;
    state: string;
    latlng: [number, number] | null;
  };
  contractor_id: string | null;
}

interface ZipBucket {
  zipCode: string;
  centerLat: number;
  centerLng: number;
  permits: ShovelsPermit[];
  tagCounts: Record<string, number>;
  propertyTypeCounts: Record<string, number>;
  uniqueContractors: number;
  totalJobValue: number;
}

interface GridCell {
  lat: number;
  lng: number;
  rowLat: number;
  colLng: number;
  count: number;
  tags: Record<string, number>;
  totalJobValue: number;
}

const PERMIT_TAGS: { id: string; label: string; color: string }[] = [
  { id: 'new_construction', label: 'New Construction', color: '#EF4444' },
  { id: 'remodel', label: 'Remodel', color: '#F59E0B' },
  { id: 'solar', label: 'Solar', color: '#F97316' },
  { id: 'hvac', label: 'HVAC', color: '#3B82F6' },
  { id: 'roofing', label: 'Roofing', color: '#8B5CF6' },
  { id: 'adu', label: 'ADU', color: '#EC4899' },
  { id: 'ev_charger', label: 'EV Charger', color: '#10B981' },
  { id: 'pool_and_hot_tub', label: 'Pool & Spa', color: '#06B6D4' },
  { id: 'addition', label: 'Addition', color: '#6366F1' },
  { id: 'kitchen', label: 'Kitchen', color: '#D946EF' },
  { id: 'bathroom', label: 'Bathroom', color: '#14B8A6' },
  { id: 'electrical', label: 'Electrical', color: '#EAB308' },
  { id: 'plumbing', label: 'Plumbing', color: '#64748B' },
];

const TAG_COLOR_MAP = Object.fromEntries(PERMIT_TAGS.map(t => [t.id, t.color]));

const GRID_COLORS = [
  { min: 1, max: 2, fill: '#3B82F6', opacity: 0.25, label: '1–2' },
  { min: 3, max: 5, fill: '#06B6D4', opacity: 0.32, label: '3–5' },
  { min: 6, max: 10, fill: '#10B981', opacity: 0.38, label: '6–10' },
  { min: 11, max: 20, fill: '#F59E0B', opacity: 0.45, label: '11–20' },
  { min: 21, max: 50, fill: '#F97316', opacity: 0.52, label: '21–50' },
  { min: 51, max: Infinity, fill: '#EF4444', opacity: 0.58, label: '51+' },
];

function gridColorForCount(count: number) {
  for (const g of GRID_COLORS) {
    if (count >= g.min && count <= g.max) return g;
  }
  return GRID_COLORS[GRID_COLORS.length - 1];
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

const CELL_DEG = 0.004;

function buildGrid(permits: ShovelsPermit[]): GridCell[] {
  const cells = new Map<string, { latSum: number; lngSum: number; count: number; tags: Record<string, number>; totalJobValue: number; rowLat: number; colLng: number }>();

  for (const p of permits) {
    if (!p.address?.latlng) continue;
    const [lat, lng] = p.address.latlng;
    const row = Math.floor(lat / CELL_DEG);
    const col = Math.floor(lng / CELL_DEG);
    const key = `${row}:${col}`;

    if (!cells.has(key)) {
      cells.set(key, { latSum: 0, lngSum: 0, count: 0, tags: {}, totalJobValue: 0, rowLat: row * CELL_DEG, colLng: col * CELL_DEG });
    }
    const c = cells.get(key)!;
    c.count++;
    c.latSum += lat;
    c.lngSum += lng;
    c.totalJobValue += p.job_value || 0;
    for (const tag of p.tags || []) {
      c.tags[tag] = (c.tags[tag] || 0) + 1;
    }
  }

  return [...cells.values()].map(c => ({
    lat: c.latSum / c.count,
    lng: c.lngSum / c.count,
    rowLat: c.rowLat,
    colLng: c.colLng,
    count: c.count,
    tags: c.tags,
    totalJobValue: c.totalJobValue,
  }));
}

const MAX_RADIUS_MI = 50;

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function discoverNearbyZips(lat: number, lng: number): Promise<string[]> {
  // ~15 mile sampling grid (0.14° lat ≈ 9.7 mi, 0.18° lng ≈ 9.5 mi at 40°N)
  const offsets = [
    [0, 0],
    [0.07, 0], [-0.07, 0],
    [0, 0.09], [0, -0.09],
    [0.14, 0], [-0.14, 0],
    [0, 0.18], [0, -0.18],
    [0.07, 0.09], [0.07, -0.09],
    [-0.07, 0.09], [-0.07, -0.09],
    [0.14, 0.09], [-0.14, 0.09],
    [0.14, -0.09], [-0.14, -0.09],
  ];

  const results = await Promise.all(
    offsets.map(async ([dlat, dlng]) => {
      try {
        const loc = await reverseGeocode(lat + dlat, lng + dlng);
        if (!loc?.postalCode) return null;
        return loc.postalCode.split('-')[0];
      } catch {
        return null;
      }
    }),
  );

  return [...new Set(results.filter((z): z is string => !!z && z.length === 5))];
}

async function fetchPermitsForZip(
  zipCode: string,
  dateFrom: string,
  dateTo: string,
  tags: string[],
  propertyType: string | null,
): Promise<ShovelsPermit[]> {
  const params = new URLSearchParams({
    endpoint: 'permits-search',
    geo_id: zipCode,
    permit_from: dateFrom,
    permit_to: dateTo,
    size: '100',
  });

  for (const tag of tags) params.append('permit_tags', tag);
  if (propertyType) params.set('property_type', propertyType);

  const res = await fetch(`/api/shovels?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `API error ${res.status}`);
  }

  const data = await res.json();
  return (data.items || []) as ShovelsPermit[];
}

function aggregateByZip(permits: ShovelsPermit[]): ZipBucket[] {
  const buckets = new Map<string, ShovelsPermit[]>();
  for (const p of permits) {
    const zip = p.address?.zip_code;
    if (!zip) continue;
    if (!buckets.has(zip)) buckets.set(zip, []);
    buckets.get(zip)!.push(p);
  }

  const result: ZipBucket[] = [];
  for (const [zipCode, zipPermits] of buckets) {
    const withCoords = zipPermits.filter(p => p.address?.latlng);
    if (withCoords.length === 0) continue;

    const centerLat = withCoords.reduce((s, p) => s + p.address.latlng![0], 0) / withCoords.length;
    const centerLng = withCoords.reduce((s, p) => s + p.address.latlng![1], 0) / withCoords.length;

    const tagCounts: Record<string, number> = {};
    const propertyTypeCounts: Record<string, number> = {};
    const contractorIds = new Set<string>();
    let totalJobValue = 0;

    for (const p of zipPermits) {
      for (const tag of p.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
      const pt = p.property_type || 'unknown';
      propertyTypeCounts[pt] = (propertyTypeCounts[pt] || 0) + 1;
      if (p.contractor_id) contractorIds.add(p.contractor_id);
      if (p.job_value) totalJobValue += p.job_value;
    }

    result.push({ zipCode, centerLat, centerLng, permits: zipPermits, tagCounts, propertyTypeCounts, uniqueContractors: contractorIds.size, totalJobValue });
  }

  return result.sort((a, b) => b.permits.length - a.permits.length);
}

export default function ConstructionHeatmap({
  apiKey,
  darkMode = false,
  accentColor = '#2563eb',
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: {
  apiKey: string;
  darkMode?: boolean;
  accentColor?: string;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
}) {
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [heatMapZoom, setHeatMapZoom] = useState(13);
  const handleHeatBoundsChange = useCallback((b: { zoom: number }) => setHeatMapZoom(b.zoom), []);

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  const [dateFrom, setDateFrom] = useState(oneYearAgo.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(today.toISOString().split('T')[0]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [propertyType, setPropertyType] = useState<'all' | 'residential' | 'commercial'>('all');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allPermits, setAllPermits] = useState<ShovelsPermit[]>([]);
  const [zipBuckets, setZipBuckets] = useState<ZipBucket[]>([]);
  const [searchedZips, setSearchedZips] = useState<string[]>([]);

  const [selectedZip, setSelectedZip] = useState<ZipBucket | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const bgPanel = 'var(--bg-panel)';
  const border = darkMode ? '#3E5060' : 'var(--border-subtle)';
  const textMain = darkMode ? '#F1F5F9' : 'var(--text-main)';
  const textMuted = darkMode ? '#A8B8CC' : 'var(--text-muted)';
  const buttonMuted = darkMode ? '#94A3B8' : 'var(--text-muted)';

  const handleSearch = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    setAllPermits([]);
    setZipBuckets([]);
    setSelectedZip(null);
    setSearchedZips([]);

    try {
      const zips = await discoverNearbyZips(lat, lng);
      if (zips.length === 0) {
        setError('Could not determine ZIP codes for this location.');
        setLoading(false);
        return;
      }
      setSearchedZips(zips);

      const tagArr = [...selectedTags];
      const propType = propertyType === 'all' ? null : propertyType;

      const results = await Promise.allSettled(
        zips.map(zip => fetchPermitsForZip(zip, dateFrom, dateTo, tagArr, propType)),
      );

      const raw: ShovelsPermit[] = [];
      let apiError: string | null = null;

      for (const r of results) {
        if (r.status === 'fulfilled') {
          raw.push(...r.value);
        } else if (!apiError) {
          apiError = r.reason?.message || 'Failed to fetch permits';
        }
      }

      const permits = raw.filter(p => {
        if (!p.address?.latlng) return true;
        const [pLat, pLng] = p.address.latlng;
        return haversineMi(lat, lng, pLat, pLng) <= MAX_RADIUS_MI;
      });

      if (permits.length === 0 && apiError) {
        setError(apiError);
      } else if (permits.length === 0) {
        setError('No permits found within 50 miles of this location.');
      }

      setAllPermits(permits);
      setZipBuckets(aggregateByZip(permits));
      if (permits.length > 0) setFiltersOpen(false);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedTags, propertyType]);

  const handleLocationSelect = useCallback((result: { displayString: string; lat?: number; lng?: number }) => {
    if (result.lat && result.lng) {
      setCoords({ lat: result.lat, lng: result.lng });
      handleSearch(result.lat, result.lng);
    }
  }, [handleSearch]);

  const gridCells = useMemo(() => buildGrid(allPermits), [allPermits]);

  const polygons = useMemo(() => {
    return gridCells.map(cell => {
      const gc = gridColorForCount(cell.count);
      const fillOpacity = darkMode ? Math.min(0.75, gc.opacity + 0.15) : gc.opacity;
      return {
        coordinates: [
          { lat: cell.rowLat, lng: cell.colLng },
          { lat: cell.rowLat + CELL_DEG, lng: cell.colLng },
          { lat: cell.rowLat + CELL_DEG, lng: cell.colLng + CELL_DEG },
          { lat: cell.rowLat, lng: cell.colLng + CELL_DEG },
        ],
        color: gc.fill,
        fillOpacity,
        strokeWidth: 1,
      };
    });
  }, [gridCells, darkMode]);

  const fitBounds = useMemo(() => {
    if (gridCells.length === 0) return undefined;
    let north = -90, south = 90, east = -180, west = 180;
    for (const c of gridCells) {
      north = Math.max(north, c.rowLat + CELL_DEG);
      south = Math.min(south, c.rowLat);
      east = Math.max(east, c.colLng + CELL_DEG);
      west = Math.min(west, c.colLng);
    }
    return { north: north + 0.01, south: south - 0.01, east: east + 0.015, west: west - 0.015 };
  }, [gridCells]);

  const markers = useMemo(() => {
    return zipBuckets.map(b => ({
      lat: b.centerLat,
      lng: b.centerLng,
      label: `${b.zipCode}: ${b.permits.length} permits`,
      color: '#1E293B',
      onClick: () => setSelectedZip(b),
    }));
  }, [zipBuckets]);

  const mapCenter = coords || { lat: 37.7749, lng: -122.4194 };

  const totalPermits = allPermits.length;
  const totalJobValue = allPermits.reduce((s, p) => s + (p.job_value || 0), 0);
  const uniqueContractors = new Set(allPermits.filter(p => p.contractor_id).map(p => p.contractor_id!)).size;

  const globalTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allPermits) {
      for (const tag of p.tags || []) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allPermits]);

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const activeFilterCount = selectedTags.size + (propertyType !== 'all' ? 1 : 0);

  return (
    <div
      className="prism-widget w-full md:w-[1100px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ fontFamily: fontFamily || 'var(--brand-font)', '--brand-primary': accentColor } as React.CSSProperties}
    >
      <WidgetHeader
        title="Construction Activity Heatmap"
        subtitle={totalPermits > 0 ? `${totalPermits.toLocaleString()} permits across ${searchedZips.length} ZIP codes` : 'Visualize building permit activity powered by Shovels.ai'}
        variant="impressive"
        layout="inline"
        icon={<Hammer className="w-4 h-4" />}
      />

      <div className="flex flex-col md:flex-row md:h-[720px]">
        {/* Left panel */}
        <div
          className="w-full md:w-[400px] flex flex-col border-t md:border-t-0 md:border-r md:order-1 overflow-hidden"
          style={{ borderColor: border }}
        >
          {/* Location input */}
          <div className="p-4" style={{ borderBottom: `1px solid ${border}` }}>
            <div
              className="rounded-xl flex items-center gap-2.5"
              style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, padding: '10px 12px' }}
            >
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
              <AddressAutocomplete
                value={location}
                onChange={setLocation}
                onSelect={handleLocationSelect}
                placeholder="Enter address, city, or ZIP..."
                darkMode={darkMode}
                className="flex-1"
                hideIcon
              />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar p-4 space-y-3">

            {/* Collapsible Filters Panel */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
              <button
                onClick={() => setFiltersOpen(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:opacity-80"
                style={{ background: 'var(--bg-widget)' }}
              >
                <Filter className="w-3.5 h-3.5" style={{ color: textMuted }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider flex-1" style={{ color: textMuted }}>
                  Filters
                </span>
                {activeFilterCount > 0 && !filtersOpen && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: `${accentColor}18`, color: accentColor }}
                  >
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown
                  className="w-3.5 h-3.5 transition-transform"
                  style={{ color: textMuted, transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                />
              </button>

              {filtersOpen && (
                <div className="px-3 pb-3 space-y-3" style={{ background: 'var(--bg-widget)' }}>
                  {/* Date range */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Calendar className="w-3 h-3" style={{ color: textMuted }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Date Range</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-[11px] outline-none"
                        style={{ background: bgPanel, border: `1px solid ${border}`, color: textMain }}
                      />
                      <span className="text-[10px] font-medium" style={{ color: textMuted }}>to</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-[11px] outline-none"
                        style={{ background: bgPanel, border: `1px solid ${border}`, color: textMain }}
                      />
                    </div>
                  </div>

                  {/* Permit tags */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Permit Types</span>
                      {selectedTags.size > 0 && (
                        <button
                          onClick={() => setSelectedTags(new Set())}
                          className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full hover:opacity-80"
                          style={{ color: accentColor, background: `${accentColor}12` }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {PERMIT_TAGS.map(tag => {
                        const active = selectedTags.has(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            className="text-[9px] font-semibold px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
                            style={{
                              background: active ? `${tag.color}20` : 'var(--bg-input)',
                              color: active ? tag.color : textMuted,
                              border: `1px solid ${active ? `${tag.color}50` : 'transparent'}`,
                            }}
                          >
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Property type */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MapPin className="w-3 h-3" style={{ color: textMuted }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Property Type</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['all', 'residential', 'commercial'] as const).map(pt => {
                        const active = propertyType === pt;
                        return (
                          <button
                            key={pt}
                            onClick={() => setPropertyType(pt)}
                            className="px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors capitalize hover:opacity-80"
                            style={{
                              background: active ? `${accentColor}18` : bgPanel,
                              border: `1px solid ${active ? `${accentColor}45` : border}`,
                              color: active ? accentColor : 'var(--text-secondary)',
                            }}
                          >
                            {pt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Apply button */}
                  {coords && !loading && (
                    <button
                      onClick={() => handleSearch(coords.lat, coords.lng)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: accentColor }}
                    >
                      <Search className="w-3.5 h-3.5" />
                      Apply Filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center gap-2 py-6 justify-center" style={{ color: textMuted }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Searching {searchedZips.length > 0 ? `${searchedZips.length} ZIP codes` : 'nearby areas'}...</span>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--color-error-bg, #FEF2F2)', color: 'var(--color-error, #DC2626)' }}>
                <X className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* ZIP detail view */}
            {selectedZip && !loading && (
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${accentColor}12, ${accentColor}04)` }}>
                  <button
                    onClick={() => setSelectedZip(null)}
                    className="flex items-center gap-1 text-[10px] font-semibold mb-2 cursor-pointer hover:opacity-80"
                    style={{ color: textMuted }}
                  >
                    <ChevronRight className="w-3 h-3 rotate-180" /> Back to summary
                  </button>
                  <div className="text-base font-bold" style={{ color: textMain }}>
                    ZIP {selectedZip.zipCode}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs" style={{ color: textMuted }}>{selectedZip.permits.length} permits</span>
                    {selectedZip.totalJobValue > 0 && (
                      <span className="text-xs" style={{ color: textMuted }}>{formatCurrency(selectedZip.totalJobValue)} value</span>
                    )}
                    <span className="text-xs" style={{ color: textMuted }}>{selectedZip.uniqueContractors} contractors</span>
                  </div>
                </div>
                <div className="p-3 space-y-2" style={{ background: bgPanel }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                    Breakdown by Type
                  </div>
                  {Object.entries(selectedZip.tagCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([tag, count]) => {
                      const pct = (count / selectedZip.permits.length) * 100;
                      const tagDef = PERMIT_TAGS.find(t => t.id === tag);
                      const color = tagDef?.color || '#94A3B8';
                      return (
                        <div key={tag} className="flex items-center gap-2">
                          <span className="text-[10px] w-24 truncate font-medium" style={{ color: textMain }}>
                            {tagDef?.label || tag}
                          </span>
                          <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.max(4, pct)}%`, background: color, opacity: 0.85 }} />
                          </div>
                          <span className="text-[10px] w-8 text-right font-semibold" style={{ color: textMuted }}>{count}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Summary + Breakdown (main focus area) */}
            {totalPermits > 0 && !selectedZip && !loading && (
              <>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Permits', value: totalPermits.toLocaleString(), color: '#3B82F6' },
                    { label: 'Job Value', value: formatCurrency(totalJobValue), color: '#10B981' },
                    { label: 'Contractors', value: uniqueContractors.toLocaleString(), color: '#F59E0B' },
                  ].map(stat => (
                    <div
                      key={stat.label}
                      className="text-center p-3 rounded-2xl"
                      style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}
                    >
                      <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Top categories breakdown */}
                {globalTagCounts.length > 0 && (
                  <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-3.5 h-3.5" style={{ color: textMuted }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Top Categories</span>
                    </div>
                    <div className="space-y-2">
                      {globalTagCounts.slice(0, 8).map(([tag, count]) => {
                        const pct = (count / totalPermits) * 100;
                        const color = TAG_COLOR_MAP[tag] || '#94A3B8';
                        const tagDef = PERMIT_TAGS.find(t => t.id === tag);
                        return (
                          <div key={tag} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span className="text-[11px] w-28 truncate font-medium" style={{ color: textMain }}>
                              {tagDef?.label || tag}
                            </span>
                            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: color, opacity: 0.85 }} />
                            </div>
                            <span className="text-[10px] w-12 text-right font-semibold tabular-nums" style={{ color: textMuted }}>
                              {count} <span className="font-normal opacity-60">({Math.round(pct)}%)</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ZIP breakdown */}
                {zipBuckets.length > 0 && (
                  <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                      By ZIP Code
                    </div>
                    <div className="space-y-1">
                      {zipBuckets.slice(0, 8).map(b => (
                        <button
                          key={b.zipCode}
                          onClick={() => setSelectedZip(b)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl transition-colors text-left hover:bg-[var(--bg-hover)]"
                          style={{ background: 'var(--bg-input)' }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: gridColorForCount(b.permits.length).fill }} />
                          <span className="text-[11px] font-semibold" style={{ color: textMain }}>{b.zipCode}</span>
                          <span className="text-[10px] ml-auto" style={{ color: textMuted }}>{b.permits.length} permits</span>
                          <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: textMuted }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Color legend */}
            {totalPermits > 0 && !loading && (
              <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                  Permits per Zone
                </div>
                <div className="flex items-center gap-1">
                  {GRID_COLORS.map(g => (
                    <div key={g.label} className="flex-1 text-center">
                      <div className="h-3 rounded-sm mx-px" style={{ background: g.fill, opacity: g.opacity + 0.2 }} />
                      <div className="text-[8px] mt-1 font-medium" style={{ color: textMuted }}>{g.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!coords && !loading && totalPermits === 0 && (
              <div className="text-center py-8 px-4">
                <Hammer className="w-10 h-10 mx-auto mb-3" style={{ color: textMuted, opacity: 0.3 }} />
                <p className="text-sm font-medium mb-1" style={{ color: textMain }}>Explore construction activity</p>
                <p className="text-xs" style={{ color: textMuted }}>
                  Enter an address or ZIP code to see building permit density, types, and trends in the area.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="h-[320px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={coords ? 13 : 11}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            polygons={polygons}
            markers={markers}
            fitBounds={fitBounds}
            showZoomControls
            interactive
            mapType={heatMapZoom >= 18 ? 'hybrid' : undefined}
            onBoundsChange={handleHeatBoundsChange}
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
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
}
