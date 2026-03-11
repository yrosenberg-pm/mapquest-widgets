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
  Crosshair,
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

/** Build filter values from subject property so comps match on beds, baths, and sqft. */
function filtersFromSubject(subject: SubjectProperty): Partial<Filters> {
  const partial: Partial<Filters> = {};
  if (subject.beds != null) partial.minBeds = String(subject.beds);
  if (subject.baths != null) partial.minBaths = String(subject.baths);
  if (subject.sqft != null && subject.sqft > 0) {
    partial.minSqft = String(Math.round(subject.sqft * 0.85));
    partial.maxSqft = String(Math.round(subject.sqft * 1.15));
  }
  return partial;
}

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

function geojsonToCoords(geometry: any): { lat: number; lng: number }[] | null {
  if (!geometry) return null;
  const { type, coordinates } = geometry;
  if (type === 'Polygon' && coordinates?.[0]) {
    return coordinates[0].map(([lng, lat]: [number, number]) => ({ lat, lng }));
  }
  if (type === 'MultiPolygon' && coordinates?.length) {
    let best: [number, number][] = [];
    let bestLen = 0;
    for (const poly of coordinates) {
      if (poly[0] && poly[0].length > bestLen) { best = poly[0]; bestLen = poly[0].length; }
    }
    return best.map(([lng, lat]: [number, number]) => ({ lat, lng }));
  }
  return null;
}

function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  const n = polygon.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    if (yi > lat !== yj > lat && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function boundingBoxFromPolygon(polygon: { lat: number; lng: number }[]): {
  north: number; south: number; east: number; west: number;
  centerLat: number; centerLng: number; radiusMiles: number; areaSqMiles: number;
} {
  let north = -90, south = 90, east = -180, west = 180;
  for (const p of polygon) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }
  const centerLat = (north + south) / 2;
  const centerLng = (east + west) / 2;
  const latDist = (north - south) * 69;
  const lngDist = (east - west) * 69 * Math.cos((centerLat * Math.PI) / 180);
  const areaSqMiles = latDist * lngDist;
  const radiusMiles = Math.min(Math.ceil(Math.sqrt(latDist * latDist + lngDist * lngDist) / 2) + 1, 10);
  return { north, south, east, west, centerLat, centerLng, radiusMiles, areaSqMiles };
}

const MAX_BOUNDARY_AREA_SQ_MILES = 35;

async function fetchBoundary(
  lat: number,
  lng: number,
  address1?: string,
  address2?: string,
): Promise<{ lat: number; lng: number }[] | null> {
  try {
    const params = new URLSearchParams({
      type: 'attom-neighborhood',
      lat: String(lat),
      lng: String(lng),
    });
    if (address1) params.set('address1', address1);
    if (address2) params.set('address2', address2);
    const res = await fetch(`/api/boundary?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = geojsonToCoords(data?.geometry);
    return coords && coords.length >= 3 ? coords : null;
  } catch {
    return null;
  }
}

/** Resolve boundary for an area search: zip, neighborhood, or city. */
async function fetchAreaBoundary(
  query: string,
  lat?: number,
  lng?: number,
): Promise<{ polygon: { lat: number; lng: number }[]; label: string } | null> {
  const trimmed = query.trim();
  const isZip = /^\d{5}(-\d{4})?$/.test(trimmed) || /^\d{5}$/.test(trimmed);

  if (isZip) {
    try {
      const res = await fetch(`/api/boundary?type=zip&q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        const coords = geojsonToCoords(data.geometry);
        if (coords && coords.length >= 3) return { polygon: coords, label: data.label || `ZIP ${trimmed}` };
      }
    } catch {}
    return null;
  }

  if (lat != null && lng != null) {
    try {
      const params = new URLSearchParams({
        type: 'attom-neighborhood',
        q: trimmed,
        lat: String(lat),
        lng: String(lng),
      });
      const res = await fetch(`/api/boundary?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.approximate) {
          const coords = geojsonToCoords(data.geometry);
          if (coords && coords.length >= 3) return { polygon: coords, label: data.label || trimmed };
        }
      }
    } catch {}
  }

  try {
    const res = await fetch(`/api/boundary?type=neighborhood&q=${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const data = await res.json();
      if (!data.approximate) {
        const coords = geojsonToCoords(data.geometry);
        if (coords && coords.length >= 3) return { polygon: coords, label: data.label || trimmed };
      }
    }
  } catch {}

  try {
    const res = await fetch(`/api/boundary?type=city&q=${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const data = await res.json();
      const coords = geojsonToCoords(data.geometry);
      if (coords && coords.length >= 3) return { polygon: coords, label: data.label || trimmed };
    }
  } catch {}

  return null;
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

/** Fetch sales in tiles over the bounding box of the polygon, then filter to only those inside the polygon. */
async function fetchBoundarySales(
  polygon: { lat: number; lng: number }[],
  refLat: number,
  refLng: number,
  filters: Filters,
): Promise<CompSale[]> {
  const bb = boundingBoxFromPolygon(polygon);
  if (bb.areaSqMiles > MAX_BOUNDARY_AREA_SQ_MILES) return [];

  const TILE_MI = 1.2;
  const latSpanMi = (bb.north - bb.south) * 69;
  const lngSpanMi = (bb.east - bb.west) * 69 * Math.cos((bb.centerLat * Math.PI) / 180);
  const cols = Math.max(1, Math.ceil(lngSpanMi / TILE_MI));
  const rows = Math.max(1, Math.ceil(latSpanMi / TILE_MI));

  if (rows * cols <= 1) {
    const single = await fetchComps(bb.centerLat, bb.centerLng, Math.min(bb.radiusMiles, 5), filters);
    return single.filter((c) => pointInPolygon(c.lat, c.lng, polygon));
  }

  const tileRadius = Math.ceil(TILE_MI * 0.75 * 10) / 10;
  const latStep = (bb.north - bb.south) / rows;
  const lngStep = (bb.east - bb.west) / cols;

  const points: { lat: number; lng: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      points.push({
        lat: bb.south + (r + 0.5) * latStep,
        lng: bb.west + (c + 0.5) * lngStep,
      });
    }
  }

  const BATCH = 4;
  const seen = new Set<string>();
  const all: CompSale[] = [];

  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((pt) => fetchComps(pt.lat, pt.lng, tileRadius, filters)),
    );
    for (const page of results) {
      for (const c of page) {
        const key = `${c.lat.toFixed(5)}:${c.lng.toFixed(5)}`;
        if (seen.has(key)) continue;
        if (!pointInPolygon(c.lat, c.lng, polygon)) continue;
        seen.add(key);
        all.push({ ...c, id: key, distanceMi: haversine(refLat, refLng, c.lat, c.lng) });
      }
    }
  }

  return all;
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
  const [poiQuery, setPoiQuery] = useState('');
  const [poi, setPoi] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [poiLoading, setPoiLoading] = useState(false);
  const [boundaryPolygon, setBoundaryPolygon] = useState<{ lat: number; lng: number }[] | null>(null);
  const [showBoundary, setShowBoundary] = useState(true);
  const [isAreaSearch, setIsAreaSearch] = useState(false);
  const [mapZoom, setMapZoom] = useState(14);
  const handleMapBoundsChange = useCallback((b: { zoom: number }) => setMapZoom(b.zoom), []);

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

  const loadCompsInBoundary = useCallback(
    async (polygon: { lat: number; lng: number }[], refLat: number, refLng: number, f: Filters) => {
      setCompsLoading(true);
      const results = await fetchBoundarySales(polygon, refLat, refLng, f);
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
      setBoundaryPolygon(null);
      setIsAreaSearch(false);

      try {
        const trimmed = text.trim();
        let lat = latHint;
        let lng = lngHint;
        if (lat == null || lng == null) {
          const geo = await geocode(trimmed);
          if (!geo?.lat || !geo?.lng) {
            setError(`Could not locate "${trimmed}".`);
            return;
          }
          lat = geo.lat;
          lng = geo.lng;
        }

        // Try area boundary first (zip, neighborhood, city) so we can show boundary and pull comps within it
        const areaBoundary = await fetchAreaBoundary(trimmed, lat, lng);
        if (areaBoundary) {
          const bb = boundingBoxFromPolygon(areaBoundary.polygon);
          if (bb.areaSqMiles <= MAX_BOUNDARY_AREA_SQ_MILES) {
            setIsAreaSearch(true);
            setBoundaryPolygon(areaBoundary.polygon);
            const syntheticSubject: SubjectProperty = {
              address: areaBoundary.label,
              lat: bb.centerLat,
              lng: bb.centerLng,
              beds: null,
              baths: null,
              sqft: null,
              yearBuilt: null,
              propertyType: null,
              lastSalePrice: null,
              lastSaleDate: null,
            };
            setSubject(syntheticSubject);
            subjectRef.current = syntheticSubject;
            await loadCompsInBoundary(areaBoundary.polygon, bb.centerLat, bb.centerLng, filters);
            return;
          }
        }

        // Address or no area boundary: resolve subject property and use radius comps
        const { address1, address2 } = splitAddress(trimmed);
        let subj = await fetchSubjectProperty(address1, address2);

        if (!subj || !subj.lat || !subj.lng) {
          subj = {
            address: trimmed,
            lat: lat!,
            lng: lng!,
            beds: null,
            baths: null,
            sqft: null,
            yearBuilt: null,
            propertyType: null,
            lastSalePrice: null,
            lastSaleDate: null,
          };
        } else {
          subj.lat = lat!;
          subj.lng = lng!;
        }

        setSubject(subj);
        subjectRef.current = subj;

        // Auto-fill filters from subject so comps match on beds, baths, and sqft
        const subjectFilters: Filters = { ...filters, ...filtersFromSubject(subj) };
        setFilters(subjectFilters);

        await loadComps(subj.lat, subj.lng, subjectFilters);
        const { address1: a1, address2: a2 } = splitAddress(subj.address);
        const boundary = await fetchBoundary(subj.lat, subj.lng, a1 || undefined, a2 || undefined);
        setBoundaryPolygon(boundary);
      } catch (e: any) {
        setError(e.message || 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [filters, loadComps, loadCompsInBoundary],
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
    const subj = subjectRef.current;
    if (!subj) return;
    if (isAreaSearch && boundaryPolygon?.length) {
      loadCompsInBoundary(boundaryPolygon, subj.lat, subj.lng, filters);
    } else {
      loadComps(subj.lat, subj.lng, filters);
    }
  }, [filters, loadComps, loadCompsInBoundary, isAreaSearch, boundaryPolygon]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    const subj = subjectRef.current;
    if (!subj) return;
    if (isAreaSearch && boundaryPolygon?.length) {
      loadCompsInBoundary(boundaryPolygon, subj.lat, subj.lng, DEFAULT_FILTERS);
    } else {
      loadComps(subj.lat, subj.lng, DEFAULT_FILTERS);
    }
  }, [loadComps, loadCompsInBoundary, isAreaSearch, boundaryPolygon]);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => v !== ''),
    [filters],
  );

  // Only show comps that match subject's exact bed/bath when subject has them (trim results)
  const compsFiltered = useMemo(() => {
    if (!subject) return comps;
    return comps.filter((c) => {
      if (subject.beds != null && c.beds !== subject.beds) return false;
      if (subject.baths != null && c.baths !== subject.baths) return false;
      return true;
    });
  }, [comps, subject]);

  const selectedComps = useMemo(
    () => compsFiltered.filter((c) => selectedCompIds.has(c.id)),
    [compsFiltered, selectedCompIds],
  );

  // ── Price range for color coding ─────────────────────────

  const { minPrice, maxPrice } = useMemo(() => {
    if (!compsFiltered.length) return { minPrice: 0, maxPrice: 0 };
    const prices = compsFiltered.map((c) => c.salePrice);
    return { minPrice: Math.min(...prices), maxPrice: Math.max(...prices) };
  }, [compsFiltered]);

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
    const sorted = [...compsFiltered];
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
  }, [compsFiltered, sortKey, sortDir]);

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

  const addPoi = useCallback(async (text: string, lat?: number, lng?: number) => {
    setPoiLoading(true);
    try {
      let pLat = lat, pLng = lng;
      if (!pLat || !pLng) {
        const geo = await geocode(text);
        if (!geo?.lat || !geo?.lng) return;
        pLat = geo.lat;
        pLng = geo.lng;
      }
      setPoi({ name: text.split(',')[0], lat: pLat, lng: pLng });
      setPoiQuery('');
    } finally {
      setPoiLoading(false);
    }
  }, []);

  const clearPoi = useCallback(() => { setPoi(null); setPoiQuery(''); }, []);

  // ── Map polygons (boundary) ───────────────────────────────

  const mapPolygons = useMemo(() => {
    if (!showBoundary || !boundaryPolygon?.length) return undefined;
    return [{ coordinates: boundaryPolygon, color: accentColor, fillOpacity: 0.06, strokeWidth: 2 }];
  }, [showBoundary, boundaryPolygon, accentColor]);

  // ── Heat grid (zoomed-out view): cell size by zoom ─────────
  const COMP_HEAT_ZOOM_THRESHOLD = 15;
  const showHeatView = mapZoom < COMP_HEAT_ZOOM_THRESHOLD && compsFiltered.length > 0;

  function cellDegForCompZoom(zoom: number): number {
    if (zoom <= 11) return 0.003;
    if (zoom <= 12) return 0.002;
    if (zoom <= 13) return 0.0012;
    if (zoom <= 14) return 0.0008;
    return 0.0005;
  }

  interface CompHeatCell {
    rowLat: number;
    colLng: number;
    cellDeg: number;
    count: number;
    avgPrice: number;
  }

  const compHeatGrid = useMemo((): CompHeatCell[] => {
    if (!compsFiltered.length) return [];
    const cellDeg = cellDegForCompZoom(mapZoom);
    const cells = new Map<string, { count: number; sumPrice: number; rowLat: number; colLng: number }>();
    for (const c of compsFiltered) {
      const row = Math.floor(c.lat / cellDeg);
      const col = Math.floor(c.lng / cellDeg);
      const key = `${row}:${col}`;
      if (!cells.has(key)) cells.set(key, { count: 0, sumPrice: 0, rowLat: row * cellDeg, colLng: col * cellDeg });
      const cell = cells.get(key)!;
      cell.count++;
      cell.sumPrice += c.salePrice;
    }
    return [...cells.values()].map((c) => ({
      rowLat: c.rowLat,
      colLng: c.colLng,
      cellDeg,
      count: c.count,
      avgPrice: c.sumPrice / c.count,
    }));
  }, [compsFiltered, mapZoom]);

  const heatPolygons = useMemo(() => {
    if (!showHeatView || compHeatGrid.length === 0) return [];
    return compHeatGrid.map((cell) => ({
      coordinates: [
        { lat: cell.rowLat, lng: cell.colLng },
        { lat: cell.rowLat + cell.cellDeg, lng: cell.colLng },
        { lat: cell.rowLat + cell.cellDeg, lng: cell.colLng + cell.cellDeg },
        { lat: cell.rowLat, lng: cell.colLng + cell.cellDeg },
      ],
      color: priceToColor(cell.avgPrice, minPrice, maxPrice),
      fillOpacity: Math.min(0.6, 0.25 + cell.count * 0.04),
      strokeWidth: 0.5,
    }));
  }, [showHeatView, compHeatGrid, minPrice, maxPrice]);

  const allPolygons = useMemo(() => {
    const boundary = mapPolygons ?? [];
    const heat = showHeatView ? heatPolygons : [];
    return boundary.length + heat.length > 0 ? [...boundary, ...heat] : undefined;
  }, [mapPolygons, showHeatView, heatPolygons]);

  // ── Map markers: when zoomed out show only subject + POI; when zoomed in show all with clustering ──

  const markers = useMemo(() => {
    const m: Array<{
      lat: number;
      lng: number;
      label?: string;
      color?: string;
      type?: 'home' | 'poi' | 'default';
      zIndexOffset?: number;
      clusterable?: boolean;
    }> = [];

    if (subject) {
      m.push({
        lat: subject.lat,
        lng: subject.lng,
        label: `<div style="min-width:180px;min-height:52px;padding:6px 8px;box-sizing:border-box">
          <div style="font-weight:700;margin-bottom:2px">${subject.address.split(',')[0]}</div>
          <div style="font-size:11px;opacity:0.7">Subject Property</div>
          ${subject.lastSalePrice ? `<div style="font-size:12px;margin-top:2px">${fmtPriceFull(subject.lastSalePrice)}</div>` : ''}
        </div>`,
        color: '#FFFFFF',
        type: 'home',
        zIndexOffset: 1000,
        clusterable: false,
      });
    }

    if (!showHeatView) {
      for (const comp of compsFiltered) {
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
          label: `<div style="min-width:200px;min-height:72px;padding:6px 8px;box-sizing:border-box">
          <div style="font-weight:700;margin-bottom:2px">${comp.address.split(',')[0]}</div>
          <div style="font-size:13px;font-weight:600;color:${color}">${fmtPriceFull(comp.salePrice)}</div>
          <div style="font-size:11px;opacity:0.7;margin-top:2px">${fmtDate(comp.saleDate)}</div>
          ${bedbath ? `<div style="font-size:11px;opacity:0.7">${bedbath}${comp.sqft ? ` · ${comp.sqft.toLocaleString()} sqft` : ''}</div>` : ''}
        </div>`,
          color,
          type: 'poi',
          clusterable: true,
        });
      }
    }

    if (poi) {
      m.push({
        lat: poi.lat,
        lng: poi.lng,
        label: `<div style="min-width:140px;min-height:44px;padding:6px 8px;box-sizing:border-box">
          <div style="font-weight:700;margin-bottom:2px">${poi.name}</div>
          <div style="font-size:11px;opacity:0.7">Point of Interest</div>
        </div>`,
        color: '#F59E0B',
        type: 'home',
        zIndexOffset: 900,
        clusterable: false,
      });
    }

    return m;
  }, [subject, compsFiltered, minPrice, maxPrice, poi, showHeatView]);

  const useClustering = compsFiltered.length > 0 && !showHeatView;

  // ── Legend steps ───────────────────────────────────────────

  const legendSteps = useMemo(() => {
    if (!compsFiltered.length) return [];
    const steps = 5;
    const range = maxPrice - minPrice;
    if (range <= 0) return [{ color: PRICE_STOPS[3], label: fmtPrice(minPrice) }];
    return Array.from({ length: steps }, (_, i) => {
      const t = i / (steps - 1);
      const price = minPrice + t * range;
      const color = priceToColor(price, minPrice, maxPrice);
      return { color, label: fmtPrice(price) };
    });
  }, [compsFiltered, minPrice, maxPrice]);

  const subtitle = subject
    ? `${compsFiltered.length} comparable sale${compsFiltered.length !== 1 ? 's' : ''} near ${subject.address.split(',')[0]}`
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

              {/* POI input */}
              <div className="mt-2 pt-2" style={{ borderTop: `1px solid color-mix(in srgb, ${accentColor} 12%, transparent)` }}>
                {poi ? (
                  <div className="flex items-center gap-2">
                    <Crosshair className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                    <span className="text-[11px] font-semibold truncate" style={{ color: textMain }}>{poi.name}</span>
                    <button onClick={clearPoi} className="ml-auto flex-shrink-0"><X className="w-3 h-3" style={{ color: textMuted }} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Crosshair className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                    <AddressAutocomplete
                      value={poiQuery}
                      onChange={setPoiQuery}
                      onSelect={(r) => addPoi(r.displayString, r.lat, r.lng)}
                      onEnter={() => poiQuery.trim() && addPoi(poiQuery.trim())}
                      placeholder="Add point of interest…"
                      darkMode={darkMode}
                      className="flex-1 text-[11px]"
                      hideIcon
                    />
                    {poiLoading && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" style={{ color: '#F59E0B' }} />}
                  </div>
                )}
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
          {compsFiltered.length > 0 && (
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
                  {compsFiltered.length} sale{compsFiltered.length !== 1 ? 's' : ''}
                </span>
              </span>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar">
            {!loading && subject && compsFiltered.length === 0 && !compsLoading && (
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
                      {poi && (
                        <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: '#F59E0B', width: '55px', textAlign: 'right' }}>
                          {haversine(comp.lat, comp.lng, poi.lat, poi.lng).toFixed(2)}mi
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty / loading state */}
          {!subject && !loading && compsFiltered.length === 0 && (
            <div className="flex-1 flex items-center justify-center px-4 min-h-0">
              <div className="text-center" style={{ transform: 'translateY(-200px)' }}>
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
              polygons={allPolygons}
              skipPolygonFitBounds
              clusterMarkers={useClustering}
              clusterRadiusPx={56}
              darkMode={darkMode}
              height="100%"
              mapType={mapZoom >= 18 ? 'hybrid' : undefined}
              onBoundsChange={handleMapBoundsChange}
            />

            {/* Boundary toggle */}
            {boundaryPolygon && (
              <button
                type="button"
                onClick={() => setShowBoundary((b) => !b)}
                className="absolute top-3 left-3 z-[500] rounded-lg px-2.5 py-1.5 text-[10px] font-semibold shadow-lg transition-opacity"
                style={{
                  background: 'var(--bg-widget)',
                  border: `1px solid ${border}`,
                  color: showBoundary ? accentColor : textMuted,
                  opacity: showBoundary ? 1 : 0.8,
                }}
              >
                {showBoundary ? 'Hide' : 'Show'} boundary
              </button>
            )}

            {/* Price legend */}
            {legendSteps.length > 0 && (
              <div
                className="absolute right-3 z-[500] rounded-xl px-3 py-2.5 shadow-lg"
                style={{
                  bottom: 36,
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
                    ...(poi ? [{ label: `→ ${poi.name}`, fn: (c: CompSale) => `${haversine(c.lat, c.lng, poi.lat, poi.lng).toFixed(2)} mi` }] : []),
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
