'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  GraduationCap,
  Home,
  Loader2,
  MapPin,
  Search,
  Shield,
  ShoppingBag,
  Sun,
  Thermometer,
  TreePine,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  Landmark,
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import WidgetHeader from './WidgetHeader';
import AddressAutocomplete from '../AddressAutocomplete';
import { geocode } from '@/lib/mapquest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommunityData {
  name: string;
  area: number;
  population: number;
  populationDensity: number;
  medianAge: number;
  medianHouseholdIncome: number;
  avgHouseholdIncome: number;
  perCapitaIncome: number;
  householdSizeAvg: number;
  households: number;
  housingUnits: number;
  ownerOccupiedPct: number;
  renterOccupiedPct: number;
  medianHomeValue: number;
  medianRent: number;
  medianBuiltYear: number;
  medianResidenceYears: number;
  collegePct: number;
  gradDegreePct: number;
  commuteTimeMi: number;
  crimeIndex: number;
  airPollutionIndex: number;
  annualAvgTemp: number;
  annualPrecipIn: number;
  sunshinePct: number;
  populationGrowthPct: number;
  householdsIncome200kPlusPct: number;
  familyMedianIncome: number;
  vacancyPct: number;
  medianVehicles: number;
  hispanicPct: number;
  whitePct: number;
  blackPct: number;
  asianPct: number;
}

interface POI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: POICategory;
  address?: string;
}

type POICategory = 'school' | 'food' | 'shopping' | 'bank' | 'park';

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
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<POICategory, { label: string; color: string; icon: React.ReactNode; query: string }> = {
  school: { label: 'Schools', color: '#3B82F6', icon: <GraduationCap className="w-3 h-3" />, query: 'school' },
  food: { label: 'Food', color: '#F59E0B', icon: <Utensils className="w-3 h-3" />, query: 'restaurant' },
  shopping: { label: 'Shopping', color: '#8B5CF6', icon: <ShoppingBag className="w-3 h-3" />, query: 'grocery store' },
  bank: { label: 'Banks', color: '#10B981', icon: <Landmark className="w-3 h-3" />, query: 'bank' },
  park: { label: 'Parks', color: '#059669', icon: <TreePine className="w-3 h-3" />, query: 'park' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return 'N/A';
  return n.toLocaleString();
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return 'N/A';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return 'N/A';
  return `${n.toFixed(1)}%`;
}

function indexLabel(idx: number): { text: string; color: string } {
  if (idx <= 50) return { text: 'Very Low', color: '#10B981' };
  if (idx <= 80) return { text: 'Low', color: '#34D399' };
  if (idx <= 120) return { text: 'Average', color: '#F59E0B' };
  if (idx <= 160) return { text: 'High', color: '#F97316' };
  return { text: 'Very High', color: '#EF4444' };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

interface GeoIdResult {
  neighborhoodId: string | null;
  zipId: string | null;
  placeId: string | null;
  locality: string | null;
}

async function fetchGeoIds(
  lat: number,
  lng: number,
): Promise<GeoIdResult> {
  const empty: GeoIdResult = { neighborhoodId: null, zipId: null, placeId: null, locality: null };

  for (const radius of ['0.1', '0.25', '0.5', '1', '3']) {
    const params = new URLSearchParams({
      endpoint: 'attomavm-detail',
      latitude: String(lat),
      longitude: String(lng),
      radius,
      pagesize: '5',
    });
    try {
      const res = await fetch(`/api/attom?${params}`);
      if (!res.ok) continue;
      const data = await res.json();
      const prop = data?.property?.[0];
      if (!prop) continue;

      const gv4 = prop.location?.geoIdV4 || {};
      return {
        neighborhoodId: gv4.N2 || gv4.N1 || null,
        zipId: gv4.ZI || null,
        placeId: gv4.PL || null,
        locality: prop.address?.locality || null,
      };
    } catch { continue; }
  }
  return empty;
}

async function fetchCommunity(geoIdV4: string): Promise<CommunityData | null> {
  const params = new URLSearchParams({ endpoint: 'community', geoIdV4 });
  try {
    const res = await fetch(`/api/attom?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.community;
    if (!c) return null;
    const geo = c.geography || {};
    const d = c.demographics || {};
    const crime = c.crime || {};
    const air = c.airQuality || {};
    const climate = c.climate || {};

    return {
      name: geo.geographyName || '',
      area: geo.area_Square_Mile || 0,
      population: d.population || 0,
      populationDensity: d.population_Density_Sq_Mi || 0,
      medianAge: d.median_Age || 0,
      medianHouseholdIncome: d.median_Household_Income || 0,
      avgHouseholdIncome: d.avg_Household_Income || 0,
      perCapitaIncome: d.household_Income_Per_Capita || 0,
      householdSizeAvg: d.household_Size_Avg || 0,
      households: d.households || 0,
      housingUnits: d.housing_Units || 0,
      ownerOccupiedPct: d.housing_Units_Owner_Occupied_Pct || 0,
      renterOccupiedPct: d.housing_Units_Renter_Occupied_Pct || 0,
      medianHomeValue: d.housing_Owner_Households_Median_Value || 0,
      medianRent: d.housing_Median_Rent || 0,
      medianBuiltYear: d.housing_Median_Built_Yr || 0,
      medianResidenceYears: d.median_Length_Of_Residence_Yr || 0,
      collegePct: (d.education_Bach_Degree_Pct || 0) + (d.education_Grad_Degree_Pct || 0),
      gradDegreePct: d.education_Grad_Degree_Pct || 0,
      commuteTimeMi: d.median_Travel_Time_To_Work_Mi || 0,
      crimeIndex: crime.crime_Index || 0,
      airPollutionIndex: air.air_Pollution_Index || 0,
      annualAvgTemp: climate.annual_Avg_Temp || 0,
      annualPrecipIn: climate.annual_Precip_In || 0,
      sunshinePct: climate.possible_Sunshine_Pct || 0,
      populationGrowthPct: d.population_Chg_Pct_5_Yr_Projection || 0,
      householdsIncome200kPlusPct: d.households_Income_200000_And_Over_Pct || 0,
      familyMedianIncome: d.family_Median_Income || 0,
      vacancyPct: d.housing_Units_Vacant_Pct || 0,
      medianVehicles: d.households_Median_Vehicles || 0,
      hispanicPct: d.population_Hispanic_Pct || 0,
      whitePct: d.population_White_Pct || 0,
      blackPct: d.population_Black_Pct || 0,
      asianPct: d.population_Asian_Pct || 0,
    };
  } catch { return null; }
}

async function fetchPOIs(lat: number, lng: number, query: string, category: POICategory): Promise<POI[]> {
  const params = new URLSearchParams({
    endpoint: 'search',
    location: `${lat},${lng}`,
    q: query,
    radius: '2',
    pageSize: '8',
    sort: 'distance',
  });
  try {
    const res = await fetch(`/api/mapquest?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      id: r.id || `${category}-${r.name}`,
      name: r.name || 'Unknown',
      lat: r.place?.geometry?.coordinates?.[1] || 0,
      lng: r.place?.geometry?.coordinates?.[0] || 0,
      category,
      address: r.place?.properties?.street || '',
    })).filter((p: POI) => p.lat !== 0 && p.lng !== 0);
  } catch { return []; }
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

async function fetchNeighborhoodBoundary(
  neighborhoodName: string,
  lat: number,
  lng: number,
  rawQuery?: string,
): Promise<{ lat: number; lng: number }[] | null> {
  const zipMatch = rawQuery?.match(/\b(\d{5})\b/);

  // If the query is a zip code, try the zip boundary first
  if (zipMatch) {
    try {
      const res = await fetch(`/api/boundary?type=zip&q=${zipMatch[1]}`);
      if (res.ok) {
        const data = await res.json();
        const coords = geojsonToCoords(data.geometry);
        if (coords && coords.length >= 3) return coords;
      }
    } catch {}
  }

  // Prefer Slipstream neighborhood geometry (point-in-polygon search by coords)
  // This is scoped to this widget only (proxy at /api/slipstream).
  try {
    const coordsParam = `${lat},${lng}`;
    const searchParams = new URLSearchParams({
      endpoint: 'neighborhoods-search',
      coords: coordsParam,
      geometry: 'true',
      limit: '1',
    });
    const res = await fetch(`/api/slipstream?${searchParams}`);
    if (res.ok) {
      const data = await res.json();
      const n = data?.result?.neighborhoods?.[0];
      const coords = geojsonToCoords(n?.geometry);
      if (coords && coords.length >= 3) return coords;
      const id = n?.id;
      if (id) {
        const getParams = new URLSearchParams({
          endpoint: 'neighborhoods-get',
          id,
          geometry: 'true',
        });
        const res2 = await fetch(`/api/slipstream?${getParams}`);
        if (res2.ok) {
          const data2 = await res2.json();
          const n2 = data2?.result?.neighborhoods?.[0];
          const coords2 = geojsonToCoords(n2?.geometry);
          if (coords2 && coords2.length >= 3) return coords2;
        }
      }
    }
  } catch {}

  // Try ATTOM-enhanced boundary (uses geoIdV4 for authoritative name -> Zillow/Overpass/TIGER)
  try {
    const params = new URLSearchParams({
      type: 'attom-neighborhood',
      q: neighborhoodName,
      lat: String(lat),
      lng: String(lng),
    });
    const res = await fetch(`/api/boundary?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (!data.approximate) {
        const coords = geojsonToCoords(data.geometry);
        if (coords && coords.length >= 3) return coords;
      }
    }
  } catch {}

  // Fallback: plain neighborhood boundary (using the ATTOM community name)
  try {
    const res = await fetch(`/api/boundary?type=neighborhood&q=${encodeURIComponent(neighborhoodName)}`);
    if (res.ok) {
      const data = await res.json();
      if (!data.approximate) {
        const coords = geojsonToCoords(data.geometry);
        if (coords && coords.length >= 3) return coords;
      }
    }
  } catch {}

  // Try the raw search text as a neighborhood name (may differ from ATTOM name)
  if (rawQuery && rawQuery.toLowerCase() !== neighborhoodName.toLowerCase()) {
    try {
      const res = await fetch(`/api/boundary?type=neighborhood&q=${encodeURIComponent(rawQuery)}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.approximate) {
          const coords = geojsonToCoords(data.geometry);
          if (coords && coords.length >= 3) return coords;
        }
      }
    } catch {}
  }

  // Try city boundary (for cases like Highland Park IL where the area is a city)
  const cityName = rawQuery || neighborhoodName;
  try {
    const res = await fetch(`/api/boundary?type=city&q=${encodeURIComponent(cityName)}`);
    if (res.ok) {
      const data = await res.json();
      const coords = geojsonToCoords(data.geometry);
      if (coords && coords.length >= 3) return coords;
    }
  } catch {}

  return null;
}

async function fetchIsoline(lat: number, lng: number, minutes: number, mode: 'driving' | 'walking'): Promise<{ lat: number; lng: number }[] | null> {
  const params = new URLSearchParams({
    endpoint: 'isoline',
    origin: `${lat},${lng}`,
    timeMinutes: String(minutes),
    mode,
    generalize: '500',
  });
  try {
    const res = await fetch(`/api/mapquest?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.route?.shape?.shapePoints;
    if (!coords || !Array.isArray(coords) || coords.length < 4) return null;
    const points: { lat: number; lng: number }[] = [];
    for (let i = 0; i < coords.length; i += 2) {
      points.push({ lat: coords[i], lng: coords[i + 1] });
    }
    return points;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5" style={{ background: accent ? 'var(--brand-primary-alpha, rgba(37,99,235,0.08))' : 'var(--bg-input)', color: 'var(--text-muted)' }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</div>
        <div className="text-sm font-bold tabular-nums leading-tight" style={{ color: accent ? 'var(--brand-primary, #2563eb)' : 'var(--text-main)' }}>{value}</div>
        {sub && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function NeighborhoodProfile({
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
  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [walkIsoline, setWalkIsoline] = useState<{ lat: number; lng: number }[] | null>(null);
  const [driveIsoline, setDriveIsoline] = useState<{ lat: number; lng: number }[] | null>(null);
  const [boundaryPolygon, setBoundaryPolygon] = useState<{ lat: number; lng: number }[] | null>(null);
  const [showBoundary, setShowBoundary] = useState(true);

  const [enabledCategories, setEnabledCategories] = useState<Record<POICategory, boolean>>({
    school: true, food: true, shopping: true, bank: true, park: true,
  });
  const [showIsolines, setShowIsolines] = useState(true);
  const [mapZoom, setMapZoom] = useState(14);

  const zoomToLocation = useMemo(
    () => (center ? { lat: center.lat, lng: center.lng, zoom: 14 } : undefined),
    [center?.lat, center?.lng],
  );

  const derivedMapType = mapZoom >= 18 ? 'hybrid' as const : undefined;

  const border = darkMode ? '#3E5060' : 'var(--border-subtle)';
  const textMain = darkMode ? '#F1F5F9' : 'var(--text-main)';
  const textMuted = darkMode ? '#A8B8CC' : 'var(--text-muted)';
  const buttonMuted = darkMode ? '#94A3B8' : 'var(--text-muted)';

  const handleBoundsChange = useCallback((b: { zoom: number }) => setMapZoom(b.zoom), []);

  const toggleCategory = useCallback((cat: POICategory) => {
    setEnabledCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const doSearch = useCallback(async (text: string, latHint?: number, lngHint?: number) => {
    setLoading(true);
    setError(null);
    setCommunity(null);
    setPois([]);
    setWalkIsoline(null);
    setDriveIsoline(null);
    setBoundaryPolygon(null);
    setCenter(null);

    try {
      let lat = latHint, lng = lngHint;
      if (!lat || !lng) {
        const geo = await geocode(text);
        if (!geo?.lat || !geo?.lng) { setError(`Could not locate "${text}".`); return; }
        lat = geo.lat; lng = geo.lng;
      }
      setCenter({ lat, lng });

      const geoIds = await fetchGeoIds(lat, lng);
      if (!geoIds.neighborhoodId && !geoIds.zipId && !geoIds.placeId) {
        setError('Could not determine neighborhood. Try a more specific address.');
        return;
      }

      // Helper: check if a community name loosely matches the search text
      const searchWords = text.toLowerCase().replace(/[,.\s]+/g, ' ').trim()
        .split(/\s+/).filter((w) => w.length >= 3);
      const nameMatches = (name: string) => {
        if (!searchWords.length) return true;
        const lower = name.toLowerCase();
        return searchWords.some((w) => lower.includes(w));
      };

      // Try neighborhood-level community first
      let communityData: CommunityData | null = null;
      if (geoIds.neighborhoodId) {
        communityData = await fetchCommunity(geoIds.neighborhoodId);
      }

      // If the neighborhood name doesn't match the search, try
      // alternative geographic levels (ZIP, Place) which may be
      // more specific (e.g. Marina Del Rey vs Venice).
      if (communityData && !nameMatches(communityData.name) && searchWords.length > 0) {
        // Also check if the property locality matches — if ATTOM says
        // the address is in Venice but user searched Marina Del Rey,
        // the ZIP or Place level is likely more accurate.
        const localityMatches = geoIds.locality
          ? nameMatches(geoIds.locality)
          : false;

        if (!localityMatches) {
          // Try ZIP-code level community (often more precise for
          // unincorporated areas like Marina Del Rey)
          for (const altId of [geoIds.zipId, geoIds.placeId]) {
            if (!altId) continue;
            const altData = await fetchCommunity(altId);
            if (altData && nameMatches(altData.name)) {
              communityData = altData;
              break;
            }
            // Even if the name doesn't match, ZIP data is usually
            // geographically accurate, so prefer it over a wrong neighborhood
            if (altData && altId === geoIds.zipId) {
              communityData = altData;
              break;
            }
          }
        }
      }

      // Last resort: if we still have nothing, try any available level
      if (!communityData) {
        for (const altId of [geoIds.zipId, geoIds.placeId]) {
          if (!altId) continue;
          communityData = await fetchCommunity(altId);
          if (communityData) break;
        }
      }

      if (!communityData) { setError('No community data available for this area.'); return; }

      const poiResults = await Promise.all(
        Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) =>
          fetchPOIs(lat!, lng!, cfg.query, cat as POICategory)
        ),
      );
      setCommunity(communityData);
      setPois(poiResults.flat());

      const boundaryName = communityData.name || text;
      const [walk, drive, boundary] = await Promise.all([
        fetchIsoline(lat, lng, 10, 'walking'),
        fetchIsoline(lat, lng, 5, 'driving'),
        fetchNeighborhoodBoundary(boundaryName, lat, lng, text),
      ]);
      setWalkIsoline(walk);
      setDriveIsoline(drive);
      setBoundaryPolygon(boundary);
    } catch (e: any) {
      setError(e.message || 'Failed to load neighborhood data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = useCallback((result: { displayString: string; lat?: number; lng?: number }) => {
    doSearch(result.displayString, result.lat, result.lng);
  }, [doSearch]);

  const handleEnter = useCallback(() => {
    if (query.trim()) doSearch(query.trim());
  }, [query, doSearch]);

  // Map data
  const markers = useMemo(() => {
    const m: Array<{ lat: number; lng: number; label?: string; color?: string; type?: 'home' | 'poi' }> = [];
    if (center) {
      m.push({ lat: center.lat, lng: center.lng, label: 'Search Location', color: accentColor, type: 'home' });
    }
    for (const poi of pois) {
      if (!enabledCategories[poi.category]) continue;
      m.push({
        lat: poi.lat,
        lng: poi.lng,
        label: `${poi.name}${poi.address ? ' · ' + poi.address : ''}`,
        color: CATEGORY_CONFIG[poi.category].color,
        type: 'poi',
      });
    }
    return m;
  }, [center, pois, enabledCategories, accentColor]);

  const polygons = useMemo(() => {
    const p: Array<{ coordinates: { lat: number; lng: number }[]; color: string; fillOpacity: number; strokeWidth: number }> = [];
    if (showBoundary && boundaryPolygon) {
      p.push({ coordinates: boundaryPolygon, color: accentColor, fillOpacity: 0.05, strokeWidth: 2.5 });
    }
    if (showIsolines) {
      if (driveIsoline) p.push({ coordinates: driveIsoline, color: '#3B82F6', fillOpacity: 0.06, strokeWidth: 2 });
      if (walkIsoline) p.push({ coordinates: walkIsoline, color: '#10B981', fillOpacity: 0.08, strokeWidth: 2 });
    }
    return p.length ? p : undefined;
  }, [walkIsoline, driveIsoline, showIsolines, boundaryPolygon, showBoundary, accentColor]);

  const subtitle = community
    ? community.name
    : 'Demographics, housing & amenities powered by ATTOM';

  // Section collapse
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div
      className="prism-widget w-full md:w-[1200px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ fontFamily: fontFamily || 'var(--brand-font)', '--brand-primary': accentColor, '--brand-primary-alpha': `${accentColor}0C` } as React.CSSProperties}
    >
      <WidgetHeader
        title="Neighborhood Profile"
        subtitle={subtitle}
        variant="impressive"
        layout="inline"
        icon={<MapPin className="w-4 h-4" />}
      />

      <div className="flex flex-col md:flex-row md:h-[755px]">
        {/* Content panel — 40% */}
        <div
          className="w-full flex flex-col border-t md:border-t-0 md:border-r md:order-1 overflow-hidden"
          style={{ borderColor: border, flex: '0 0 40%', maxWidth: '40%' }}
        >
          {/* Search */}
          <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="rounded-xl flex items-center gap-2.5" style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, padding: '10px 14px' }}>
              {loading
                ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: accentColor }} />
                : <Search className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
              }
              <AddressAutocomplete
                value={query}
                onChange={setQuery}
                onSelect={handleSelect}
                onEnter={handleEnter}
                placeholder="Address, neighborhood, or zip code…"
                darkMode={darkMode}
                className="flex-1"
                hideIcon
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden prism-scrollbar px-4 py-3">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: accentColor }} />
                <span className="text-xs font-medium" style={{ color: textMuted }}>Loading neighborhood data…</span>
              </div>
            )}

            {error && !loading && (
              <div className="rounded-2xl px-4 py-3 text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            {!community && !loading && !error && (
              <div className="text-center py-20 px-6">
                <MapPin className="w-12 h-12 mx-auto mb-4" style={{ color: textMuted, opacity: 0.25 }} />
                <p className="text-base font-semibold mb-1.5" style={{ color: textMain }}>Explore any neighborhood</p>
                <p className="text-xs leading-relaxed max-w-[260px] mx-auto" style={{ color: textMuted }}>
                  Enter an address to see demographics, housing data, nearby amenities, and walkability for the surrounding neighborhood.
                </p>
              </div>
            )}

            {community && !loading && (
              <div className="space-y-3">
                {/* Neighborhood name */}
                <div>
                  <h3 className="text-base font-bold leading-tight" style={{ color: textMain }}>{community.name}</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: textMuted }}>
                    {community.area.toFixed(1)} sq mi · {fmtNumber(community.population)} residents
                  </p>
                </div>

                {/* Hero stats */}
                <div className="rounded-2xl overflow-hidden" style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
                  <div className="px-4 py-3 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Median Income</div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: accentColor }}>{fmtCurrency(community.medianHouseholdIncome)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Home Value</div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: textMain }}>{fmtCurrency(community.medianHomeValue)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Median Age</div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: textMain }}>{community.medianAge}</div>
                    </div>
                  </div>
                </div>

                {/* Demographics */}
                <SectionHeader title="Demographics" sectionKey="demo" collapsed={collapsed} toggle={toggleSection} />
                {!collapsed.demo && (
                  <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                    <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Population" value={fmtNumber(community.population)} sub={`${fmtNumber(Math.round(community.populationDensity))}/sq mi · ${community.populationGrowthPct > 0 ? '+' : ''}${community.populationGrowthPct.toFixed(1)}% projected`} />
                    <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Avg Household Size" value={community.householdSizeAvg.toFixed(1)} sub={`${fmtNumber(community.households)} households`} />
                    <StatCard icon={<Wallet className="w-3.5 h-3.5" />} label="Per Capita Income" value={fmtCurrency(community.perCapitaIncome)} />
                    <StatCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="$200K+ Households" value={fmtPct(community.householdsIncome200kPlusPct)} accent />
                    <StatCard icon={<GraduationCap className="w-3.5 h-3.5" />} label="College Degree+" value={fmtPct(community.collegePct)} sub={`${fmtPct(community.gradDegreePct)} graduate+`} />
                    <StatCard icon={<MapPin className="w-3.5 h-3.5" />} label="Median Commute" value={`${community.commuteTimeMi} min`} />
                  </div>
                )}

                {/* Housing */}
                <SectionHeader title="Housing" sectionKey="housing" collapsed={collapsed} toggle={toggleSection} />
                {!collapsed.housing && (
                  <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                    <StatCard icon={<Home className="w-3.5 h-3.5" />} label="Housing Units" value={fmtNumber(community.housingUnits)} sub={`${fmtPct(community.vacancyPct)} vacant`} />
                    <div className="flex gap-2 py-1.5 pl-8">
                      <div className="flex-1 rounded-lg px-2 py-1.5 text-center" style={{ background: `${accentColor}0C` }}>
                        <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Owner</div>
                        <div className="text-sm font-bold" style={{ color: accentColor }}>{fmtPct(community.ownerOccupiedPct)}</div>
                      </div>
                      <div className="flex-1 rounded-lg px-2 py-1.5 text-center" style={{ background: 'var(--bg-input)' }}>
                        <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Renter</div>
                        <div className="text-sm font-bold" style={{ color: textMain }}>{fmtPct(community.renterOccupiedPct)}</div>
                      </div>
                    </div>
                    <StatCard icon={<Building2 className="w-3.5 h-3.5" />} label="Median Home Value" value={fmtCurrency(community.medianHomeValue)} accent />
                    <StatCard icon={<Wallet className="w-3.5 h-3.5" />} label="Median Rent" value={fmtCurrency(community.medianRent)} />
                    <StatCard icon={<Home className="w-3.5 h-3.5" />} label="Median Year Built" value={String(community.medianBuiltYear)} sub={`${community.medianResidenceYears} yr avg residency`} />
                    <StatCard icon={<MapPin className="w-3.5 h-3.5" />} label="Median Vehicles" value={community.medianVehicles.toFixed(1)} />
                  </div>
                )}

                {/* Safety & Environment */}
                <SectionHeader title="Safety & Environment" sectionKey="safety" collapsed={collapsed} toggle={toggleSection} />
                {!collapsed.safety && (
                  <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                    <div className="flex items-start gap-2.5 py-1.5">
                      <span className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-input)', color: textMuted }}>
                        <Shield className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Crime Index</div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold tabular-nums" style={{ color: textMain }}>{community.crimeIndex}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${indexLabel(community.crimeIndex).color}18`, color: indexLabel(community.crimeIndex).color }}>
                            {indexLabel(community.crimeIndex).text}
                          </span>
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: textMuted }}>100 = national average</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 py-1.5">
                      <span className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-input)', color: textMuted }}>
                        <Thermometer className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: textMuted }}>Air Quality Index</div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold tabular-nums" style={{ color: textMain }}>{community.airPollutionIndex}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${indexLabel(community.airPollutionIndex).color}18`, color: indexLabel(community.airPollutionIndex).color }}>
                            {indexLabel(community.airPollutionIndex).text}
                          </span>
                        </div>
                      </div>
                    </div>
                    <StatCard icon={<Sun className="w-3.5 h-3.5" />} label="Climate" value={`${community.annualAvgTemp.toFixed(0)}°F avg`} sub={`${community.sunshinePct}% sunshine · ${community.annualPrecipIn.toFixed(1)}" rain/yr`} />
                  </div>
                )}

                {/* POI counts */}
                {pois.length > 0 && (
                  <>
                    <SectionHeader title="Nearby Amenities" sectionKey="amenities" collapsed={collapsed} toggle={toggleSection} />
                    {!collapsed.amenities && (
                      <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                        <div className="grid grid-cols-5 gap-1.5">
                          {(Object.keys(CATEGORY_CONFIG) as POICategory[]).map((cat) => {
                            const count = pois.filter((p) => p.category === cat).length;
                            const cfg = CATEGORY_CONFIG[cat];
                            return (
                              <div key={cat} className="text-center rounded-lg px-1 py-2" style={{ background: enabledCategories[cat] ? `${cfg.color}10` : 'var(--bg-input)' }}>
                                <div className="text-lg font-bold tabular-nums" style={{ color: enabledCategories[cat] ? cfg.color : textMuted }}>{count}</div>
                                <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>{cfg.label}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Map panel — 60% */}
        <div className="h-[360px] md:h-auto md:order-2 relative" style={{ flex: '0 0 60%', maxWidth: '60%' }}>
          <MapQuestMap
            apiKey={apiKey}
            center={center || { lat: 39.8283, lng: -98.5795 }}
            zoom={center ? 14 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            markers={markers}
            polygons={polygons}
            height="100%"
            interactive
            showZoomControls
            zoomToLocation={zoomToLocation}
            mapType={derivedMapType}
            onBoundsChange={handleBoundsChange}
          />

          {/* Category filter toggles */}
          {community && (
            <div className="absolute top-3 right-3 z-[500] flex flex-col gap-1.5">
              {(Object.keys(CATEGORY_CONFIG) as POICategory[]).map((cat) => {
                const cfg = CATEGORY_CONFIG[cat];
                const count = pois.filter((p) => p.category === cat).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold shadow-md transition-opacity"
                    style={{
                      background: darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)',
                      border: `1px solid ${border}`,
                      color: enabledCategories[cat] ? cfg.color : buttonMuted,
                      opacity: enabledCategories[cat] ? 1 : 0.5,
                    }}
                  >
                    {cfg.icon}
                    {cfg.label} ({count})
                  </button>
                );
              })}
              {boundaryPolygon && (
                <button
                  onClick={() => setShowBoundary(!showBoundary)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold shadow-md transition-opacity"
                  style={{
                    background: darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)',
                    border: `1px solid ${border}`,
                    color: showBoundary ? accentColor : buttonMuted,
                    opacity: showBoundary ? 1 : 0.5,
                  }}
                >
                  {showBoundary ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Boundary
                </button>
              )}
              {(walkIsoline || driveIsoline) && (
                <button
                  onClick={() => setShowIsolines(!showIsolines)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold shadow-md transition-opacity"
                  style={{
                    background: darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)',
                    border: `1px solid ${border}`,
                    color: showIsolines ? accentColor : buttonMuted,
                    opacity: showIsolines ? 1 : 0.5,
                  }}
                >
                  {showIsolines ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Isolines
                </button>
              )}
            </div>
          )}

          {/* Map legend */}
          {community && ((showBoundary && boundaryPolygon) || ((walkIsoline || driveIsoline) && showIsolines)) && (
            <div
              className="absolute left-3 bottom-10 z-[500] rounded-xl px-3 py-2 shadow-lg flex flex-col gap-1"
              style={{ background: darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)', border: `1px solid ${border}`, backdropFilter: 'blur(8px)' }}
            >
              {showBoundary && boundaryPolygon && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 rounded" style={{ background: accentColor }} />
                  <span className="text-[10px] font-semibold" style={{ color: textMuted }}>Neighborhood</span>
                </div>
              )}
              {showIsolines && walkIsoline && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 rounded" style={{ background: '#10B981' }} />
                  <span className="text-[10px] font-semibold" style={{ color: textMuted }}>10-min walk</span>
                </div>
              )}
              {showIsolines && driveIsoline && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 rounded" style={{ background: '#3B82F6' }} />
                  <span className="text-[10px] font-semibold" style={{ color: textMuted }}>5-min drive</span>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5 z-[500]" style={{ background: darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)', border: `1px solid ${border}` }}>
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: accentColor }} />
              <span className="text-[10px]" style={{ color: textMuted }}>Loading…</span>
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

// ---------------------------------------------------------------------------
// Section Header (collapsible)
// ---------------------------------------------------------------------------

function SectionHeader({ title, sectionKey, collapsed, toggle }: { title: string; sectionKey: string; collapsed: Record<string, boolean>; toggle: (key: string) => void }) {
  return (
    <button onClick={() => toggle(sectionKey)} className="flex items-center justify-between w-full group">
      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{title}</span>
      <ChevronDown className="w-3 h-3 transition-transform" style={{ color: 'var(--text-muted)', transform: collapsed[sectionKey] ? 'rotate(-90deg)' : undefined }} />
    </button>
  );
}
