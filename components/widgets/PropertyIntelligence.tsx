'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Building2,
  Calendar,
  ChevronDown,
  DollarSign,
  Eye,
  EyeOff,
  Flame,
  Home,
  Loader2,
  MapPin,
  Ruler,
  Search,
  BedDouble,
  Layers,
  Snowflake,
  TrendingUp,
  User,
  Wrench,
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import WidgetHeader from './WidgetHeader';
import AddressAutocomplete from '../AddressAutocomplete';
import { geocode } from '@/lib/mapquest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertyDetail {
  attomId: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string | null;
  lat: number;
  lng: number;
  accuracy: string;
  apn: string | null;
  propType: string;
  propertyUse: string | null;
  yearBuilt: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  totalRooms: number | null;
  stories: number | null;
  lotSizeSqft: number | null;
  lotSizeAcres: number | null;
  zoning: string | null;
  constructionType: string | null;
  heatingType: string | null;
  coolingType: string | null;
  ownerName: string | null;
  ownerType: string | null;
  occupancy: string | null;
  lastSaleAmount: number | null;
  lastSaleDate: string | null;
  saleType: string | null;
  sellerName: string | null;
  pricePerSqFt: number | null;
  marketTotal: number | null;
  marketLand: number | null;
  marketImprovement: number | null;
  assessedTotal: number | null;
  taxAmount: number | null;
  taxYear: number | null;
  avmValue: number | null;
  avmHigh: number | null;
  avmLow: number | null;
  avmDate: string | null;
}

interface NearbyProperty {
  attomId: number;
  lat: number;
  lng: number;
  address: string;
  avmValue: number | null;
}

interface Props {
  apiKey?: string;
  darkMode?: boolean;
  accentColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function na(v: unknown): string {
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) return 'N/A';
  return String(v);
}

function fmtCurrency(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtNumber(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  return n.toLocaleString();
}

function avmColor(value: number, min: number, max: number): string {
  if (max === min) return '#3B82F6';
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const stops = [
    [59, 130, 246],
    [6, 182, 212],
    [16, 185, 129],
    [245, 158, 11],
    [239, 68, 68],
  ];
  const idx = t * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const frac = idx - lo;
  const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * frac);
  const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * frac);
  const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * frac);
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// ATTOM API helpers
// ---------------------------------------------------------------------------

async function fetchExpandedProfile(address1: string, address2: string): Promise<any> {
  const params = new URLSearchParams({ endpoint: 'property-expandedprofile', address1, address2 });
  const res = await fetch(`/api/attom?${params}`);
  if (!res.ok) throw new Error(`Property detail failed: ${res.status}`);
  return res.json();
}

async function fetchExpandedProfileById(attomId: number): Promise<any> {
  const params = new URLSearchParams({ endpoint: 'property-expandedprofile', attomid: String(attomId) });
  const res = await fetch(`/api/attom?${params}`);
  if (!res.ok) return null;
  return res.json();
}

async function fetchAvm(attomId: number): Promise<any> {
  const params = new URLSearchParams({ endpoint: 'attomavm-detail', attomid: String(attomId) });
  const res = await fetch(`/api/attom?${params}`);
  if (!res.ok) return null;
  return res.json();
}

function parseAvmPage(data: any): NearbyProperty[] {
  const props = data?.property || [];
  return props
    .filter((p: any) => p?.location?.latitude && p?.location?.longitude)
    .map((p: any) => ({
      attomId: p?.identifier?.attomId ?? 0,
      lat: parseFloat(p.location.latitude),
      lng: parseFloat(p.location.longitude),
      address: p?.address?.oneLine || p?.address?.line1 || 'Unknown',
      avmValue: p?.avm?.amount?.value ?? null,
    }));
}

async function fetchAvmTile(lat: number, lng: number, radiusMiles: number): Promise<NearbyProperty[]> {
  const params = new URLSearchParams({
    endpoint: 'attomavm-detail',
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radiusMiles),
    propertytype: 'SFR',
    pagesize: '500',
  });
  const res = await fetch(`/api/attom?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return parseAvmPage(data);
}

async function fetchBoundaryAvms(
  polygon: { lat: number; lng: number }[],
  centerLat: number,
  centerLng: number,
  radiusMiles: number,
): Promise<NearbyProperty[]> {
  let north = -90, south = 90, east = -180, west = 180;
  for (const p of polygon) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }
  const latSpanMi = (north - south) * 69;
  const lngSpanMi = (east - west) * 69 * Math.cos((centerLat * Math.PI) / 180);

  const TILE_MI = 1.2;
  const cols = Math.max(1, Math.ceil(lngSpanMi / TILE_MI));
  const rows = Math.max(1, Math.ceil(latSpanMi / TILE_MI));

  if (rows * cols <= 1) {
    return fetchAvmTile(centerLat, centerLng, radiusMiles);
  }

  const tileRadius = Math.ceil(TILE_MI * 0.75 * 10) / 10;
  const latStep = (north - south) / rows;
  const lngStep = (east - west) / cols;

  const points: { lat: number; lng: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tileLat = south + (r + 0.5) * latStep;
      const tileLng = west + (c + 0.5) * lngStep;
      points.push({ lat: tileLat, lng: tileLng });
    }
  }

  const BATCH = 4;
  const seen = new Set<number>();
  const all: NearbyProperty[] = [];

  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((pt) => fetchAvmTile(pt.lat, pt.lng, tileRadius)),
    );
    for (const page of results) {
      for (const p of page) {
        if (!seen.has(p.attomId)) { seen.add(p.attomId); all.push(p); }
      }
    }
  }

  return all;
}

function boundingBoxRadius(polygon: { lat: number; lng: number }[]): { centerLat: number; centerLng: number; radiusMiles: number; areaSqMiles: number } {
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
  const radiusMiles = Math.ceil(Math.sqrt(latDist * latDist + lngDist * lngDist) / 2) + 1;
  return { centerLat, centerLng, radiusMiles: Math.min(radiusMiles, 10), areaSqMiles };
}

const MAX_AREA_SQ_MILES = 30;

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

async function fetchAreaBoundary(
  query: string,
  lat?: number,
  lng?: number,
): Promise<{ polygon: { lat: number; lng: number }[]; label: string } | null> {
  const isZip = /^\d{5}$/.test(query.trim());

  if (isZip) {
    // Zip code — use Census TIGER (most reliable for zips)
    try {
      const res = await fetch(`/api/boundary?type=zip&q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const coords = geojsonToCoords(data.geometry);
        if (coords && coords.length >= 3) return { polygon: coords, label: data.label || `ZIP ${query}` };
      }
    } catch {}
    return null;
  }

  // Neighborhood — use ATTOM-enhanced boundary resolution
  // This uses ATTOM geoIdV4 to get the authoritative neighborhood name,
  // then resolves the polygon from Zillow/Overpass/TIGER
  if (lat && lng) {
    try {
      const params = new URLSearchParams({
        type: 'attom-neighborhood',
        q: query,
        lat: String(lat),
        lng: String(lng),
      });
      const res = await fetch(`/api/boundary?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.approximate) {
          const coords = geojsonToCoords(data.geometry);
          if (coords && coords.length >= 3) return { polygon: coords, label: data.label || query };
        }
      }
    } catch {}
  }

  // Fallback — try plain neighborhood boundary
  try {
    const res = await fetch(`/api/boundary?type=neighborhood&q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (!data.approximate) {
        const coords = geojsonToCoords(data.geometry);
        if (coords && coords.length >= 3) return { polygon: coords, label: data.label || query };
      }
    }
  } catch {}

  return null;
}

// ---------------------------------------------------------------------------
// Heat grid — same approach as Construction Heatmap
// ---------------------------------------------------------------------------

interface HeatCell {
  rowLat: number;
  colLng: number;
  cellDeg: number;
  count: number;
  avgAvm: number;
  totalAvm: number;
}

function cellDegForZoom(zoom: number, areaSqMi: number, propCount: number): number {
  if (zoom >= 18) return 0.00005;
  if (zoom >= 17) return 0.0001;
  if (zoom >= 16) return 0.0002;
  if (zoom >= 15) return 0.0004;

  // For overview zooms, adapt cell size to fill the boundary with available props
  if (areaSqMi > 0 && propCount > 0) {
    const areaSqDeg = areaSqMi * 0.00025;
    // Target fewer cells than props so every cell is filled
    const targetCells = Math.min(propCount * 0.6, propCount);
    const cellArea = areaSqDeg / targetCells;
    const adaptiveDeg = Math.max(0.001, Math.min(0.01, Math.sqrt(cellArea)));

    if (zoom >= 14) return adaptiveDeg * 0.4;
    if (zoom >= 13) return adaptiveDeg;
    return adaptiveDeg * 1.5;
  }

  if (zoom >= 14) return 0.0015;
  if (zoom >= 13) return 0.003;
  return 0.005;
}

function buildAvmGrid(properties: NearbyProperty[], cellDeg: number): HeatCell[] {
  const cells = new Map<string, { count: number; totalAvm: number; rowLat: number; colLng: number }>();
  for (const p of properties) {
    if (p.avmValue === null) continue;
    const row = Math.floor(p.lat / cellDeg);
    const col = Math.floor(p.lng / cellDeg);
    const key = `${row}:${col}`;
    if (!cells.has(key)) {
      cells.set(key, { count: 0, totalAvm: 0, rowLat: row * cellDeg, colLng: col * cellDeg });
    }
    const c = cells.get(key)!;
    c.count++;
    c.totalAvm += p.avmValue;
  }
  return Array.from(cells.values()).map((c) => ({
    ...c,
    cellDeg,
    avgAvm: c.totalAvm / c.count,
  }));
}

function parsePropertyData(detail: any, avmData: any): PropertyDetail {
  const p = detail?.property?.[0] || {};
  const avmProp = avmData?.property?.[0] || {};

  const ident = p.identifier || {};
  const addr = p.address || {};
  const loc = p.location || {};
  const summary = p.summary || {};
  const building = p.building || {};
  const bldgSummary = building.summary || {};
  const lot = p.lot || {};
  const area = p.area || {};
  const utilities = p.utilities || {};

  const assess = p.assessment || {};
  const sale = p.sale || {};
  const owner = assess.owner || {};
  const avm = avmProp.avm || {};

  const saleCalc = sale.calculation || {};

  return {
    attomId: ident.attomId ?? 0,
    address: addr.oneLine || addr.line1 || '',
    city: addr.locality || '',
    state: addr.countrySubd || '',
    zip: addr.postal1 || '',
    county: area.countrySecSubd || area.countrysecsubd || null,
    lat: parseFloat(loc.latitude) || 0,
    lng: parseFloat(loc.longitude) || 0,
    accuracy: loc.accuracy || '',
    apn: ident.apn || null,
    propType: summary.propType || summary.propType || '',
    propertyUse: summary.propertyType || summary.propClass || summary.propclass || null,
    yearBuilt: summary.yearBuilt ?? bldgSummary.yearBuilt ?? null,
    sqft: building.size?.livingSize ?? building.size?.universalSize ?? building.size?.bldgSize ?? building.size?.grossSizeAdjusted ?? null,
    beds: building.rooms?.beds ?? building.rooms?.bedrooms ?? null,
    baths: building.rooms?.bathsTotal ?? building.rooms?.bathsFull ?? null,
    totalRooms: building.rooms?.roomsTotal ?? null,
    stories: bldgSummary.levels ?? null,
    lotSizeSqft: lot.lotSize2 ?? lot.lotsize2 ?? null,
    lotSizeAcres: lot.lotSize1 ?? lot.lotsize1 ?? null,
    zoning: lot.zoningType || lot.siteZoningIdent || null,
    constructionType: building.construction?.constructionType || building.construction?.frameType || null,
    heatingType: utilities.heatingType || null,
    coolingType: utilities.coolingType || null,
    ownerName: owner.owner1?.fullName || null,
    ownerType: owner.description || owner.type || null,
    occupancy: summary.absenteeInd || null,
    lastSaleAmount: sale.saleAmountData?.saleAmt ?? sale.amount?.saleAmt ?? null,
    lastSaleDate: sale.saleSearchDate || sale.saleTransDate || sale.amount?.saleRecDate || null,
    saleType: sale.amount?.saleTransType || null,
    sellerName: sale.sellerName || null,
    pricePerSqFt: saleCalc.pricePerSizeUnit ?? null,
    marketTotal: assess.market?.mktTtlValue ?? null,
    marketLand: assess.market?.mktLandValue ?? null,
    marketImprovement: assess.market?.mktImprValue ?? null,
    assessedTotal: assess.assessed?.assdTtlValue ?? null,
    taxAmount: assess.tax?.taxAmt ?? null,
    taxYear: assess.tax?.taxYear ?? null,
    avmValue: avm.amount?.value ?? null,
    avmHigh: avm.amount?.high ?? null,
    avmLow: avm.amount?.low ?? null,
    avmDate: avm.eventDate ?? null,
  };
}

// ---------------------------------------------------------------------------
// Build spec rows from a property — only rows with real data
// ---------------------------------------------------------------------------

function buildSpecRows(p: PropertyDetail): { icon: React.ReactNode; label: string; value: string }[] {
  return ([
    p.propertyUse && { icon: <Home className="w-3.5 h-3.5" />, label: 'Type', value: p.propertyUse },
    p.sqft != null && { icon: <Ruler className="w-3.5 h-3.5" />, label: 'Living Area', value: `${fmtNumber(p.sqft)} sq ft` },
    (p.beds != null || p.baths != null) && { icon: <BedDouble className="w-3.5 h-3.5" />, label: 'Beds / Baths', value: `${p.beds ?? '—'} bd / ${p.baths ?? '—'} ba` },
    p.totalRooms != null && { icon: <Layers className="w-3.5 h-3.5" />, label: 'Total Rooms', value: String(p.totalRooms) },
    p.stories != null && { icon: <Building2 className="w-3.5 h-3.5" />, label: 'Stories', value: String(p.stories) },
    p.yearBuilt != null && { icon: <Calendar className="w-3.5 h-3.5" />, label: 'Year Built', value: String(p.yearBuilt) },
    (p.lotSizeSqft != null || p.lotSizeAcres != null) && { icon: <Layers className="w-3.5 h-3.5" />, label: 'Lot Size', value: p.lotSizeSqft ? `${fmtNumber(p.lotSizeSqft)} sq ft` : `${p.lotSizeAcres!.toFixed(3)} ac` },
    p.zoning && { icon: <Home className="w-3.5 h-3.5" />, label: 'Zoning', value: p.zoning },
    p.constructionType && { icon: <Wrench className="w-3.5 h-3.5" />, label: 'Construction', value: p.constructionType },
    p.heatingType && { icon: <Flame className="w-3.5 h-3.5" />, label: 'Heating', value: p.heatingType },
    p.coolingType && { icon: <Snowflake className="w-3.5 h-3.5" />, label: 'Cooling', value: p.coolingType },
    p.ownerName && { icon: <User className="w-3.5 h-3.5" />, label: 'Owner', value: p.ownerName },
    p.occupancy && { icon: <Home className="w-3.5 h-3.5" />, label: 'Occupancy', value: p.occupancy.includes('ABSENTEE') ? 'Absentee' : 'Owner Occupied' },
    (p.marketLand != null || p.marketImprovement != null) && { icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Land / Improv.', value: `${fmtCurrency(p.marketLand)} / ${fmtCurrency(p.marketImprovement)}` },
    p.assessedTotal != null && p.marketTotal != null && p.assessedTotal !== p.marketTotal && { icon: <DollarSign className="w-3.5 h-3.5" />, label: 'Assessed', value: fmtCurrency(p.assessedTotal) },
    p.taxAmount != null && { icon: <DollarSign className="w-3.5 h-3.5" />, label: 'Tax', value: `${fmtCurrency(p.taxAmount)}${p.taxYear ? ` · ${p.taxYear}` : ''}` },
    p.lastSaleDate && { icon: <Calendar className="w-3.5 h-3.5" />, label: 'Sale Date', value: p.lastSaleDate },
    p.saleType && { icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Sale Type', value: p.saleType },
    p.sellerName && { icon: <User className="w-3.5 h-3.5" />, label: 'Seller', value: p.sellerName },
    p.pricePerSqFt != null && { icon: <DollarSign className="w-3.5 h-3.5" />, label: '$/Sq Ft', value: `$${p.pricePerSqFt.toFixed(0)}` },
    p.apn && { icon: <Layers className="w-3.5 h-3.5" />, label: 'APN', value: p.apn },
    p.county && { icon: <MapPin className="w-3.5 h-3.5" />, label: 'County', value: p.county },
  ] as (false | { icon: React.ReactNode; label: string; value: string })[]).filter(Boolean) as { icon: React.ReactNode; label: string; value: string }[];
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function PropertyIntelligence({
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
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [nearby, setNearby] = useState<NearbyProperty[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [isAreaSearch, setIsAreaSearch] = useState(false);

  const border = darkMode ? '#3E5060' : 'var(--border-subtle)';
  const textMain = darkMode ? '#F1F5F9' : 'var(--text-main)';
  const textMuted = darkMode ? '#A8B8CC' : 'var(--text-muted)';
  const buttonMuted = darkMode ? '#94A3B8' : 'var(--text-muted)';

  // Detect whether input looks like a street address (starts with a house number)
  const isStreetAddr = useCallback((text: string) => /^\d+\s/.test(text.trim()), []);
  const isZipCode = useCallback((text: string) => /^\d{5}$/.test(text.trim()), []);

  const splitAddress = useCallback((raw: string, result?: any): [string, string] => {
    if (result?.street && (result?.city || result?.state || result?.postalCode)) {
      const a2Parts = [result.city, result.state, result.postalCode].filter(Boolean);
      return [result.street, a2Parts.join(' ')];
    }
    const commaIdx = raw.indexOf(',');
    if (commaIdx > 0) return [raw.slice(0, commaIdx).trim(), raw.slice(commaIdx + 1).trim()];
    const stateMatch = raw.match(/\b([A-Z]{2})\s*(\d{5})?\s*$/);
    if (stateMatch && stateMatch.index && stateMatch.index > 0) {
      const beforeState = raw.slice(0, stateMatch.index).trim();
      const lastSpace = beforeState.lastIndexOf(' ');
      if (lastSpace > 0) return [beforeState.slice(0, lastSpace).trim(), beforeState.slice(lastSpace).trim() + ' ' + stateMatch[0].trim()];
    }
    return [raw, ''];
  }, []);

  // ---- Address search: ATTOM expandedprofile + AVM → full property card, no heat map ----
  const doAddressSearch = useCallback(async (a1: string, a2: string) => {
    if (!a1) return;
    setLoading(true); setError(null); setProperty(null); setNearby([]); setIsAreaSearch(false); setBoundaryPolygon(null); setAreaCenter(null); setSelectedProperty(null); setSelectedDetail(null); setInitialFitDone(false);
    try {
      const detail = await fetchExpandedProfile(a1, a2);
      if (!detail?.property?.length) { setError('No property found. Try including city and state.'); return; }
      const attomId = detail.property[0]?.identifier?.attomId;
      if (!attomId) { setError('Property found but missing ID.'); return; }
      const avmData = await fetchAvm(attomId);
      setProperty(parsePropertyData(detail, avmData));
    } catch (e: any) { setError(e.message || 'Failed to fetch property data'); }
    finally { setLoading(false); }
  }, []);

  // ---- Area search: geocode → boundary + nearby AVMs → heat map ----
  const [areaLabel, setAreaLabel] = useState<string>('');
  const [areaCenter, setAreaCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [boundaryPolygon, setBoundaryPolygon] = useState<{ lat: number; lng: number }[] | null>(null);

  // Track boundary area so cell size can adapt
  const [boundaryAreaSqMi, setBoundaryAreaSqMi] = useState(0);

  const doAreaSearch = useCallback(async (text: string, latHint?: number, lngHint?: number) => {
    setLoading(true); setError(null); setProperty(null); setNearby([]);
    setIsAreaSearch(true); setAreaLabel(text); setBoundaryPolygon(null);
    setSelectedProperty(null); setSelectedDetail(null); setInitialFitDone(false);
    setBoundaryAreaSqMi(0);
    try {
      let lat = latHint, lng = lngHint;
      if (!lat || !lng) {
        const geo = await geocode(text);
        if (!geo?.lat || !geo?.lng) { setError(`Could not locate "${text}". Try a more specific name.`); return; }
        lat = geo.lat; lng = geo.lng;
      }
      setAreaCenter({ lat, lng });
      setNearbyLoading(true);
      setLoading(false);

      const boundaryResult = await fetchAreaBoundary(text, lat, lng);

      if (boundaryResult?.polygon) {
        const bb = boundingBoxRadius(boundaryResult.polygon);
        if (bb.areaSqMiles > MAX_AREA_SQ_MILES) {
          setError(`"${text}" is too large (~${Math.round(bb.areaSqMiles)} sq mi). Search by neighborhood name or zip code instead.`);
          setIsAreaSearch(false);
          return;
        }
        setBoundaryPolygon(boundaryResult.polygon);
        setBoundaryAreaSqMi(bb.areaSqMiles);
        const nearbyResult = await fetchBoundaryAvms(boundaryResult.polygon, bb.centerLat, bb.centerLng, bb.radiusMiles);
        setNearby(nearbyResult);
      } else {
        const nearbyResult = await fetchAvmTile(lat!, lng!, 5);
        setNearby(nearbyResult);
      }
    } catch (e: any) { setError(e.message || 'Failed to search area'); }
    finally { setLoading(false); setNearbyLoading(false); }
  }, []);

  const handleAddressSelect = useCallback((result: { displayString: string; lat?: number; lng?: number }) => {
    const raw = result.displayString || query;
    if (isStreetAddr(raw)) {
      const [a1, a2] = splitAddress(raw, result);
      doAddressSearch(a1, a2);
    } else {
      doAreaSearch(raw, result.lat, result.lng);
    }
  }, [doAddressSearch, doAreaSearch, query, splitAddress, isStreetAddr]);

  const handleManualSearch = useCallback(() => {
    const raw = query.trim();
    if (!raw) return;
    if (isStreetAddr(raw)) {
      const [a1, a2] = splitAddress(raw);
      doAddressSearch(a1, a2);
    } else {
      doAreaSearch(raw);
    }
  }, [doAddressSearch, doAreaSearch, query, splitAddress, isStreetAddr]);

  // Point-in-polygon helper for boundary filtering
  const pointInBoundary = useCallback((pt: { lat: number; lng: number }) => {
    if (!boundaryPolygon || boundaryPolygon.length < 3) return true;
    let inside = false;
    const poly = boundaryPolygon;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const yi = poly[i].lat, xi = poly[i].lng;
      const yj = poly[j].lat, xj = poly[j].lng;
      if ((yi > pt.lat) !== (yj > pt.lat) && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }, [boundaryPolygon]);

  const filteredNearby = useMemo(
    () => nearby.filter((n) => n.avmValue !== null && pointInBoundary(n)),
    [nearby, pointInBoundary],
  );

  // Track map viewport bounds for list filtering
  const [mapBoundsState, setMapBoundsState] = useState<{ north: number; south: number; east: number; west: number } | null>(null);

  // Filter to map viewport then sort
  const [sortAsc, setSortAsc] = useState(false);
  const viewportNearby = useMemo(() => {
    if (!mapBoundsState) return filteredNearby;
    return filteredNearby.filter(
      (n) => n.lat >= mapBoundsState.south && n.lat <= mapBoundsState.north && n.lng >= mapBoundsState.west && n.lng <= mapBoundsState.east,
    );
  }, [filteredNearby, mapBoundsState]);

  const sortedNearby = useMemo(() => {
    const arr = [...viewportNearby];
    arr.sort((a, b) => sortAsc ? (a.avmValue! - b.avmValue!) : (b.avmValue! - a.avmValue!));
    return arr;
  }, [viewportNearby, sortAsc]);

  // Infinite scroll pagination
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [sortedNearby]);

  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, sortedNearby.length));
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sortedNearby.length]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const check = () => setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    check();
    el.addEventListener('scroll', check, { passive: true });
    return () => el.removeEventListener('scroll', check);
  });

  // Click-to-zoom selected property + detail drill-in
  const [selectedProperty, setSelectedProperty] = useState<NearbyProperty | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PropertyDetail | null>(null);
  const [selectedDetailLoading, setSelectedDetailLoading] = useState(false);
  const [showHeatMap, setShowHeatMap] = useState(true);
  const [initialFitDone, setInitialFitDone] = useState(false);

  const handlePropertyClick = useCallback(async (n: NearbyProperty) => {
    if (selectedProperty?.attomId === n.attomId && selectedDetail) {
      setSelectedProperty(null);
      setSelectedDetail(null);
      return;
    }
    setSelectedProperty(n);
    setSelectedDetail(null);
    setSelectedDetailLoading(true);
    try {
      let detail = await fetchExpandedProfileById(n.attomId);

      if (!detail?.property?.length) {
        const addrParts = n.address.split(',');
        if (addrParts.length >= 2) {
          const a1 = addrParts[0].trim();
          const a2 = addrParts.slice(1).join(',').trim();
          detail = await fetchExpandedProfile(a1, a2);
        }
      }

      if (!detail?.property?.length) { setSelectedDetailLoading(false); return; }
      const attomId = detail.property[0]?.identifier?.attomId || n.attomId;
      const avmData = await fetchAvm(attomId);
      setSelectedDetail(parsePropertyData(detail, avmData));
    } catch { /* ignore — detail just won't show */ }
    finally { setSelectedDetailLoading(false); }
  }, [selectedProperty, selectedDetail]);

  const avmValues = useMemo(() => filteredNearby.map((n) => n.avmValue!), [filteredNearby]);
  const avmMin = useMemo(() => (avmValues.length ? Math.min(...avmValues) : 0), [avmValues]);
  const avmMax = useMemo(() => (avmValues.length ? Math.max(...avmValues) : 1), [avmValues]);

  // Zoom-adaptive heat grid
  const [mapZoomLevel, setMapZoomLevel] = useState(13);
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentCellDeg = useMemo(
    () => cellDegForZoom(mapZoomLevel, boundaryAreaSqMi, filteredNearby.length),
    [mapZoomLevel, boundaryAreaSqMi, filteredNearby.length],
  );

  const handleBoundsChange = useCallback((bounds: { north: number; south: number; east: number; west: number; zoom: number }) => {
    if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
    boundsTimerRef.current = setTimeout(() => {
      setMapZoomLevel(bounds.zoom);
      setMapBoundsState({ north: bounds.north, south: bounds.south, east: bounds.east, west: bounds.west });
    }, 300);
  }, []);

  const gridCells = useMemo(() => buildAvmGrid(filteredNearby, currentCellDeg), [filteredNearby, currentCellDeg]);

  const heatPolygons = useMemo(() => {
    if (!isAreaSearch || gridCells.length === 0) return [];
    const d = gridCells[0]?.cellDeg || currentCellDeg;
    const base = darkMode ? 0.35 : 0.3;
    const step = darkMode ? 0.06 : 0.06;
    const maxOp = darkMode ? 0.75 : 0.7;
    const stroke = darkMode ? 1 : 0.5;
    return gridCells.map((cell) => ({
      coordinates: [
        { lat: cell.rowLat, lng: cell.colLng },
        { lat: cell.rowLat + d, lng: cell.colLng },
        { lat: cell.rowLat + d, lng: cell.colLng + d },
        { lat: cell.rowLat, lng: cell.colLng + d },
      ],
      color: avmColor(cell.avgAvm, avmMin, avmMax),
      fillOpacity: Math.min(maxOp, base + cell.count * step),
      strokeWidth: stroke,
    }));
  }, [isAreaSearch, gridCells, avmMin, avmMax, currentCellDeg, darkMode]);

  // Mark initial fit as done shortly after boundary polygon renders
  useEffect(() => {
    if (boundaryPolygon && !initialFitDone) {
      const t = setTimeout(() => setInitialFitDone(true), 600);
      return () => clearTimeout(t);
    }
  }, [boundaryPolygon, initialFitDone]);

  // Combine boundary polygon + heat grid polygons (respecting toggle)
  const allPolygons = useMemo(() => {
    const result: Array<{ coordinates: { lat: number; lng: number }[]; color: string; fillOpacity: number; strokeWidth: number }> = [];
    if (boundaryPolygon) {
      result.push({ coordinates: boundaryPolygon, color: accentColor, fillOpacity: 0.04, strokeWidth: 2 });
    }
    if (showHeatMap) result.push(...heatPolygons);
    return result.length ? result : undefined;
  }, [boundaryPolygon, heatPolygons, accentColor, showHeatMap]);

  // Markers — only the main property pin or selected property pin (no individual heat markers)
  const markers = useMemo(() => {
    const result: Array<{ lat: number; lng: number; label?: string; color?: string; type?: 'home' | 'poi' }> = [];
    if (property) {
      result.push({ lat: property.lat, lng: property.lng, label: property.address, color: accentColor, type: 'home' as const });
    }
    if (isAreaSearch && selectedProperty) {
      result.push({ lat: selectedProperty.lat, lng: selectedProperty.lng, label: selectedProperty.address, color: accentColor, type: 'home' as const });
    }
    return result;
  }, [property, accentColor, isAreaSearch, selectedProperty]);

  const mapCenter = useMemo(() => {
    if (property) return { lat: property.lat, lng: property.lng };
    if (areaCenter) return areaCenter;
    return { lat: 39.8283, lng: -98.5795 };
  }, [property, areaCenter]);

  const mapZoom = property ? 15 : areaCenter ? 13 : 4;

  const subtitle = property
    ? `${property.address} · ${property.city}, ${property.state}`
    : isAreaSearch && areaLabel
      ? `AVM heat map for ${areaLabel}`
      : 'Property data, valuations & AVM heat map powered by ATTOM';

  return (
    <div
      className="prism-widget w-full md:w-[1200px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ fontFamily: fontFamily || 'var(--brand-font)', '--brand-primary': accentColor } as React.CSSProperties}
    >
      <WidgetHeader
        title="Property Intelligence"
        subtitle={subtitle}
        variant="impressive"
        layout="inline"
        icon={<Building2 className="w-4 h-4" />}
      />

      <div className="flex flex-col md:flex-row md:h-[755px]">
        {/* Content panel — 40% */}
        <div
          className="w-full flex flex-col border-t md:border-t-0 md:border-r md:order-1 overflow-hidden"
          style={{ borderColor: border, flex: '0 0 40%', maxWidth: '40%' }}
        >
          {/* Address search */}
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
            <div
              className="rounded-xl flex items-center gap-2.5"
              style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, padding: '10px 14px' }}
            >
              {loading
                ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: accentColor }} />
                : <Search className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
              }
              <AddressAutocomplete
                value={query}
                onChange={setQuery}
                onSelect={handleAddressSelect}
                onEnter={handleManualSearch}
                placeholder="Search by property address…"
                darkMode={darkMode}
                className="flex-1"
                hideIcon
              />
            </div>
          </div>

          {/* Content — no outer scroll, only the property list scrolls */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 py-3">

            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: accentColor }} />
                <span className="text-xs font-medium" style={{ color: textMuted }}>Fetching property data…</span>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="rounded-2xl px-4 py-3 text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            {/* Empty state */}
            {!property && !isAreaSearch && !loading && !error && (
              <div className="text-center py-20 px-6">
                <Home className="w-12 h-12 mx-auto mb-4" style={{ color: textMuted, opacity: 0.25 }} />
                <p className="text-base font-semibold mb-1.5" style={{ color: textMain }}>Explore property data</p>
                <p className="text-xs leading-relaxed max-w-[260px] mx-auto" style={{ color: textMuted }}>
                  Search a street address for property details, or enter a neighborhood name or zip code to see an AVM heat map.
                </p>
              </div>
            )}

            {/* Area search results — list OR detail drill-in */}
            {isAreaSearch && !loading && (
              <div className="flex flex-col gap-3 min-h-0 flex-1">
                {/* Detail drill-in for selected property */}
                {selectedDetail && (() => {
                  const drillRows = buildSpecRows(selectedDetail);

                  return (
                    <>
                      <button
                        onClick={() => { setSelectedProperty(null); setSelectedDetail(null); }}
                        className="flex items-center gap-1.5 text-xs font-semibold hover:opacity-80 transition-opacity"
                        style={{ color: accentColor }}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back to {areaLabel}
                      </button>

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold leading-tight" style={{ color: textMain }}>{selectedDetail.address}</h3>
                          <p className="text-xs mt-0.5" style={{ color: textMuted }}>
                            {selectedDetail.city}, {selectedDetail.state} {selectedDetail.zip}
                          </p>
                        </div>
                        {selectedDetail.propType && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: `${accentColor}14`, color: accentColor }}>
                            {selectedDetail.propType}
                          </span>
                        )}
                      </div>

                      {/* Hero card */}
                      <div className="rounded-2xl overflow-hidden" style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
                        <div className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>AVM Estimate</div>
                            <div className="text-xl font-bold tabular-nums leading-tight" style={{ color: accentColor }}>{fmtCurrency(selectedDetail.avmValue)}</div>
                          </div>
                          <div className="flex gap-4">
                            {selectedDetail.lastSaleAmount != null && (
                              <div className="text-right">
                                <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Last Sale</div>
                                <div className="text-sm font-bold tabular-nums" style={{ color: textMain }}>{fmtCurrency(selectedDetail.lastSaleAmount)}</div>
                              </div>
                            )}
                            {selectedDetail.marketTotal != null && (
                              <div className="text-right">
                                <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Market</div>
                                <div className="text-sm font-bold tabular-nums" style={{ color: textMain }}>{fmtCurrency(selectedDetail.marketTotal)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        {selectedDetail.avmLow != null && selectedDetail.avmHigh != null && selectedDetail.avmValue != null && selectedDetail.avmHigh > selectedDetail.avmLow && (
                          <div className="px-4 pb-2.5 flex items-center gap-2">
                            <span className="text-[9px] font-semibold tabular-nums" style={{ color: textMuted }}>{fmtCurrency(selectedDetail.avmLow)}</span>
                            <div className="flex-1 relative h-2 rounded-full overflow-hidden" style={{ background: `${accentColor}15` }}>
                              <div className="absolute top-0 h-full rounded-full" style={{ background: `linear-gradient(90deg, ${accentColor}60, ${accentColor})`, left: '0%', width: `${Math.min(100, ((selectedDetail.avmValue - selectedDetail.avmLow) / (selectedDetail.avmHigh - selectedDetail.avmLow)) * 100)}%` }} />
                            </div>
                            <span className="text-[9px] font-semibold tabular-nums" style={{ color: textMuted }}>{fmtCurrency(selectedDetail.avmHigh)}</span>
                          </div>
                        )}
                      </div>

                      {/* Property specs */}
                      {drillRows.length > 0 && (
                        <div className="rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                          <div className="text-[10px] font-semibold uppercase tracking-widest px-3 pt-2.5 pb-1 flex-shrink-0" style={{ color: textMuted }}>Property Details</div>
                          <div className="overflow-y-auto prism-scrollbar px-3 pb-2.5 flex-1 min-h-0">
                            <div className="space-y-1.5">
                              {drillRows.map((row) => (
                                <div key={row.label} className="flex items-center gap-2">
                                  <span className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center" style={{ background: `${accentColor}0C`, color: textMuted }}>{row.icon}</span>
                                  <span className="text-[11px] flex-shrink-0" style={{ color: textMuted }}>{row.label}</span>
                                  <span className="ml-auto text-[11px] font-semibold tabular-nums text-right truncate" style={{ color: textMain }}>{row.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Coordinates */}
                      {selectedDetail.lat !== 0 && (
                        <div className="flex items-center gap-1.5 px-1 flex-shrink-0">
                          <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: textMuted }} />
                          <span className="text-[10px] tabular-nums" style={{ color: textMuted }}>{selectedDetail.lat.toFixed(6)}, {selectedDetail.lng.toFixed(6)}</span>
                          {selectedDetail.accuracy && <span className="text-[10px] opacity-50" style={{ color: textMuted }}> · {selectedDetail.accuracy}</span>}
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Loading detail */}
                {selectedDetailLoading && !selectedDetail && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
                    <span className="text-xs font-medium" style={{ color: textMuted }}>Loading property details…</span>
                  </div>
                )}

                {/* Area list view (when no detail drill-in) */}
                {!selectedDetail && !selectedDetailLoading && (
                  <>
                    <div>
                      <h3 className="text-base font-bold leading-tight" style={{ color: textMain }}>{areaLabel}</h3>
                      <p className="text-xs mt-1" style={{ color: textMuted }}>AVM heat map · {filteredNearby.length} properties{boundaryPolygon ? '' : ' in area'}</p>
                    </div>
                    {nearbyLoading && (
                      <div className="flex items-center gap-2 py-6 justify-center" style={{ color: textMuted }}>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Loading nearby valuations…</span>
                      </div>
                    )}
                    {!nearbyLoading && filteredNearby.length === 0 && !error && (
                      <p className="text-xs py-6 text-center" style={{ color: textMuted }}>No AVM data found in this area.</p>
                    )}
                    {!nearbyLoading && filteredNearby.length > 0 && (
                      <>
                        <div className="rounded-2xl overflow-hidden flex-shrink-0" style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
                          <div className="px-3 py-2 flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Avg AVM</div>
                              <div className="text-base font-bold tabular-nums leading-tight" style={{ color: accentColor }}>{fmtCurrency(Math.round(avmValues.reduce((a, b) => a + b, 0) / avmValues.length))}</div>
                            </div>
                            <div className="flex gap-3">
                              <div className="text-right">
                                <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Low</div>
                                <div className="text-xs font-bold tabular-nums" style={{ color: textMain }}>{fmtCurrency(avmMin)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>High</div>
                                <div className="text-xs font-bold tabular-nums" style={{ color: textMain }}>{fmtCurrency(avmMax)}</div>
                              </div>
                            </div>
                          </div>
                          <div className="h-1 flex" style={{ background: `${accentColor}10` }}>
                            {Array.from({ length: 20 }, (_, i) => (
                              <div key={i} className="flex-1 h-full" style={{ background: avmColor(avmMin + (i / 19) * (avmMax - avmMin), avmMin, avmMax), opacity: 0.7 }} />
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col" style={{ border: `1px solid ${border}` }}>
                          <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
                            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: textMuted }}>
                              {sortedNearby.length === filteredNearby.length
                                ? `Properties (${filteredNearby.length})`
                                : `In view (${sortedNearby.length} of ${filteredNearby.length})`}
                            </span>
                            <button
                              onClick={() => setSortAsc(!sortAsc)}
                              className="flex items-center gap-1 text-[10px] font-semibold rounded-md px-1.5 py-0.5 hover:opacity-80 transition-opacity"
                              style={{ color: accentColor }}
                            >
                              <ArrowUpDown className="w-3 h-3" />
                              {sortAsc ? 'Low → High' : 'High → Low'}
                            </button>
                          </div>
                          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto prism-scrollbar relative">
                            {sortedNearby.slice(0, visibleCount).map((n, i) => (
                              <button
                                key={n.attomId || i}
                                onClick={() => handlePropertyClick(n)}
                                className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                                style={{
                                  borderBottom: i < Math.min(sortedNearby.length, visibleCount) - 1 ? `1px solid ${border}` : undefined,
                                  background: selectedProperty?.attomId === n.attomId ? `${accentColor}0C` : undefined,
                                }}
                              >
                                <div className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ background: n.avmValue ? avmColor(n.avmValue, avmMin, avmMax) : border }} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium truncate leading-tight" style={{ color: textMain }}>{n.address}</div>
                                </div>
                                <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: accentColor }}>{fmtCurrency(n.avmValue)}</span>
                              </button>
                            ))}
                            {visibleCount < sortedNearby.length && (
                              <div ref={scrollSentinelRef} className="flex items-center justify-center py-2" style={{ color: textMuted }}>
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                <span className="text-[10px]">Loading more…</span>
                              </div>
                            )}
                          </div>
                          {canScrollDown && (
                            <div className="flex justify-center py-1" style={{ borderTop: `1px solid ${border}` }}>
                              <ChevronDown className="w-3.5 h-3.5 animate-bounce" style={{ color: textMuted, animationDuration: '1.5s' }} />
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Results */}
            {property && !loading && (() => {
              const specRows = buildSpecRows(property);

              return (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold leading-tight" style={{ color: textMain }}>{property.address}</h3>
                      <p className="text-xs mt-0.5" style={{ color: textMuted }}>
                        {property.city}, {property.state} {property.zip}
                      </p>
                    </div>
                    {property.propType && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: `${accentColor}14`, color: accentColor }}>
                        {property.propType}
                      </span>
                    )}
                  </div>

                  {/* Hero card */}
                  <div className="rounded-2xl overflow-hidden" style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>AVM Estimate</div>
                        <div className="text-xl font-bold tabular-nums leading-tight" style={{ color: accentColor }}>{fmtCurrency(property.avmValue)}</div>
                      </div>
                      <div className="flex gap-4">
                        {property.lastSaleAmount != null && (
                          <div className="text-right">
                            <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Last Sale</div>
                            <div className="text-sm font-bold tabular-nums" style={{ color: textMain }}>{fmtCurrency(property.lastSaleAmount)}</div>
                          </div>
                        )}
                        {property.marketTotal != null && (
                          <div className="text-right">
                            <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Market</div>
                            <div className="text-sm font-bold tabular-nums" style={{ color: textMain }}>{fmtCurrency(property.marketTotal)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* AVM confidence bar inline */}
                    {property.avmLow != null && property.avmHigh != null && property.avmValue != null && property.avmHigh > property.avmLow && (
                      <div className="px-4 pb-2.5 flex items-center gap-2">
                        <span className="text-[9px] font-semibold tabular-nums" style={{ color: textMuted }}>{fmtCurrency(property.avmLow)}</span>
                        <div className="flex-1 relative h-2 rounded-full overflow-hidden" style={{ background: `${accentColor}15` }}>
                          <div className="absolute top-0 h-full rounded-full" style={{ background: `linear-gradient(90deg, ${accentColor}60, ${accentColor})`, left: '0%', width: `${Math.min(100, ((property.avmValue - property.avmLow) / (property.avmHigh - property.avmLow)) * 100)}%` }} />
                        </div>
                        <span className="text-[9px] font-semibold tabular-nums" style={{ color: textMuted }}>{fmtCurrency(property.avmHigh)}</span>
                      </div>
                    )}
                  </div>

                  {/* Property specs — scrollable list of all available data */}
                  {specRows.length > 0 && (
                    <div className="rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                      <div className="text-[10px] font-semibold uppercase tracking-widest px-3 pt-2.5 pb-1 flex-shrink-0" style={{ color: textMuted }}>Property Details</div>
                      <div className="overflow-y-auto prism-scrollbar px-3 pb-2.5 flex-1 min-h-0">
                        <div className="space-y-1.5">
                          {specRows.map((row) => (
                            <div key={row.label} className="flex items-center gap-2">
                              <span className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center" style={{ background: `${accentColor}0C`, color: textMuted }}>{row.icon}</span>
                              <span className="text-[11px] flex-shrink-0" style={{ color: textMuted }}>{row.label}</span>
                              <span className="ml-auto text-[11px] font-semibold tabular-nums text-right truncate" style={{ color: textMain }}>{row.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Coordinates */}
                  {property.lat !== 0 && (
                    <div className="flex items-center gap-1.5 px-1 flex-shrink-0">
                      <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: textMuted }} />
                      <span className="text-[10px] tabular-nums" style={{ color: textMuted }}>{property.lat.toFixed(6)}, {property.lng.toFixed(6)}</span>
                      {property.accuracy && <span className="text-[10px] opacity-50" style={{ color: textMuted }}> · {property.accuracy}</span>}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Map panel — 60% */}
        <div className="h-[360px] md:h-auto md:order-2 relative" style={{ flex: '0 0 60%', maxWidth: '60%' }}>
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={mapZoom}
            darkMode={darkMode}
            accentColor={accentColor}
            markers={markers}
            polygons={allPolygons}
            skipPolygonFitBounds={initialFitDone}
            onBoundsChange={handleBoundsChange}
            mapType={mapZoomLevel >= 18 ? 'hybrid' : undefined}
            height="100%"
            interactive
            showZoomControls
            zoomToLocation={
              selectedProperty
                ? { lat: selectedProperty.lat, lng: selectedProperty.lng, zoom: 17 }
                : property
                  ? { lat: property.lat, lng: property.lng, zoom: 15 }
                  : (areaCenter && !boundaryPolygon)
                    ? { lat: areaCenter.lat, lng: areaCenter.lng, zoom: 13 }
                    : undefined
            }
          />

          {/* Floating AVM legend + heat map toggle on map (area search only) */}
          {isAreaSearch && filteredNearby.length > 0 && avmValues.length > 0 && (
            <div
              className="absolute left-3 rounded-xl px-3 py-2 shadow-lg z-[500] flex items-center gap-2.5"
              style={{ bottom: 37, background: darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)', border: `1px solid ${border}`, backdropFilter: 'blur(8px)' }}
            >
              <button
                onClick={() => setShowHeatMap(!showHeatMap)}
                className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                title={showHeatMap ? 'Hide heat map' : 'Show heat map'}
                style={{ color: buttonMuted }}
              >
                {showHeatMap ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <span className="text-[8px] font-semibold tabular-nums" style={{ color: textMuted }}>{fmtCurrency(avmMin)}</span>
              <div className="flex h-3 rounded-sm overflow-hidden" style={{ width: 120 }}>
                {Array.from({ length: 20 }, (_, i) => {
                  const t = i / 19;
                  const val = avmMin + t * (avmMax - avmMin);
                  return <div key={i} className="flex-1 h-full" style={{ background: avmColor(val, avmMin, avmMax), opacity: showHeatMap ? 1 : 0.3 }} />;
                })}
              </div>
              <span className="text-[8px] font-semibold tabular-nums" style={{ color: textMuted }}>{fmtCurrency(avmMax)}</span>
              <span className="text-[8px] tabular-nums" style={{ color: textMuted }}>({filteredNearby.length})</span>
            </div>
          )}

          {isAreaSearch && nearbyLoading && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5 z-[500]"
              style={{ background: darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)', border: `1px solid ${border}` }}
            >
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: accentColor }} />
              <span className="text-[10px]" style={{ color: textMuted }}>Loading nearby…</span>
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
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
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
