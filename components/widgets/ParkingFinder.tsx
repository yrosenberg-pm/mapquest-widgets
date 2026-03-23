'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Clock,
  DollarSign,
  ExternalLink,
  Filter,
  Loader2,
  Locate,
  MapPin,
  Navigation,
  ParkingCircle,
  RefreshCw,
  Search,
  Accessibility,
  Zap,
  AlertTriangle,
  X,
} from 'lucide-react';
import WidgetHeader from './WidgetHeader';
import AddressAutocomplete from '../AddressAutocomplete';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import { geocode, searchPlaces } from '@/lib/mapquest';

interface ParkingFinderProps {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
}

type FacilityType = 'garage' | 'lot' | 'other';

interface ParkingSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance: number; // miles
  facilityType: FacilityType;
  address?: string;
  pricePerHour?: number;
  maxStayMin?: number;
  spotsAvailable?: number;
  spotsTotal?: number;
  hasHandicap?: boolean;
  hasEVCharging?: boolean;
  hours?: string;
  categories: string[];
}

function classifyParking(item: any, queryHint?: 'garage' | 'lot'): FacilityType {
  const cats = (item.categories || []).map((c: any) => ({
    name: (c.name || '').toLowerCase(),
    id: (c.id || '').toLowerCase(),
  }));
  const title = (item.title || '').toLowerCase();
  const catNames = cats.map((c: { name: string }) => c.name);
  const catIds = cats.map((c: { id: string }) => c.id);

  const hasGarageCat = catIds.some((id: string) => id.includes('700-7600-0116'));
  const hasLotCat = catIds.some((id: string) => id.includes('700-7600-0322') || id.includes('700-7600-0202'));

  const isGarage = hasGarageCat || catNames.some((c: string) => c.includes('garage')) || title.includes('garage') || title.includes('structure') || title.includes('deck') || title.includes('ramp');
  const isLot = hasLotCat || catNames.some((c: string) => c.includes('lot') || c.includes('open parking')) || title.includes('lot') || title.includes('surface');

  if (isGarage || queryHint === 'garage') return 'garage';
  if (isLot || queryHint === 'lot') return 'lot';
  return 'other';
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimatePrice(item: any): number | undefined {
  const refs = item.references || [];
  for (const ref of refs) {
    if (ref.supplier?.id?.includes('parking') || ref.supplier?.id?.includes('parkopedia')) {
      return undefined; // price may be in nested data
    }
  }
  return undefined;
}

function parkingMarkerSvg(selected: boolean): string {
  const color = '#8B5CF6';
  const bg = selected ? color : '#FFFFFF';
  const fg = selected ? '#FFFFFF' : color;
  const borderColor = selected ? 'white' : color;
  const borderW = selected ? 3.5 : 2.5;
  const s = selected ? 44 : 38;
  const half = s / 2;
  const r = half - 2;

  const icon = `<g transform="translate(${half - s * 0.22},${half - s * 0.22}) scale(${s * 0.018})" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><text x="12" y="16" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="14" fill="${fg}" stroke="none">P</text></g>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none">` +
    `<circle cx="${half}" cy="${half}" r="${r}" fill="${bg}" stroke="${borderColor}" stroke-width="${borderW}"/>` +
    icon +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

export default function ParkingFinder({
  accentColor = '#8B5CF6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: ParkingFinderProps) {
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);

  // Filters
  const [maxDistance, setMaxDistance] = useState<number>(1.0);
  const [facilityFilter, setFacilityFilter] = useState<Set<FacilityType>>(new Set());
  const [showHandicapOnly, setShowHandicapOnly] = useState(false);
  const [showEVOnly, setShowEVOnly] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDestCoords(loc);
        try {
          const result = await geocode(`${loc.lat},${loc.lng}`);
          if (result) {
            const parts = [result.street, result.adminArea5, result.adminArea3].filter(Boolean);
            setDestination(parts.join(', ') || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
          }
        } catch { /* noop */ }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const searchParking = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    setSpots([]);
    setSelectedSpot(null);

    try {
      const MAX_SEARCH_RADIUS_MI = 5;

      const [garageResults, lotResults] = await Promise.all([
        searchPlaces(lat, lng, 'q:parking garage', MAX_SEARCH_RADIUS_MI, 40),
        searchPlaces(lat, lng, 'q:parking lot', MAX_SEARCH_RADIUS_MI, 40),
      ]);

      const allItems: ParkingSpot[] = [];
      const seenIds = new Set<string>();

      const sources: { items: typeof garageResults; hint: 'garage' | 'lot' }[] = [
        { items: garageResults, hint: 'garage' },
        { items: lotResults, hint: 'lot' },
      ];

      for (const { items, hint } of sources) {
        for (const item of items) {
          const coords = item.place?.geometry?.coordinates;
          const posLat = coords?.[1];
          const posLng = coords?.[0];
          if (!posLat || !posLng) continue;

          const id = `${posLat}-${posLng}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const dist = haversine(lat, lng, posLat, posLng);
          const facilityType = classifyParking({ title: item.name, categories: [] }, hint);

          allItems.push({
            id,
            name: item.name || 'Parking',
            lat: posLat,
            lng: posLng,
            distance: Math.round(dist * 100) / 100,
            facilityType,
            address: item.displayString || [item.place?.properties?.street, item.place?.properties?.city].filter(Boolean).join(', ') || undefined,
            pricePerHour: undefined,
            spotsAvailable: undefined,
            spotsTotal: undefined,
            hasHandicap: false,
            hasEVCharging: false,
            hours: undefined,
            categories: [],
          });
        }
      }

      allItems.sort((a, b) => a.distance - b.distance);
      setSpots(allItems);

      if (allItems.length === 0) {
        setError('No parking found near this location. Try increasing the search radius.');
      }
    } catch (err) {
      console.error('Parking search error:', err);
      setError('Failed to search for parking. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (destCoords) {
      searchParking(destCoords.lat, destCoords.lng);
    }
  }, [destCoords, searchParking]);

  const spotsInRadius = useMemo(() => spots.filter(s => s.distance <= maxDistance), [spots, maxDistance]);

  const filtered = useMemo(() => {
    let list = spotsInRadius;
    if (facilityFilter.size > 0) {
      list = list.filter(s => facilityFilter.has(s.facilityType));
    }
    if (showHandicapOnly) list = list.filter(s => s.hasHandicap);
    if (showEVOnly) list = list.filter(s => s.hasEVCharging);
    return list;
  }, [spotsInRadius, facilityFilter, showHandicapOnly, showEVOnly]);

  const toggleFacility = (f: FacilityType) => {
    setFacilityFilter(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const brandColor = '#8B5CF6';

  const mapCenter = selectedSpot
    ? { lat: selectedSpot.lat, lng: selectedSpot.lng }
    : destCoords || { lat: 40.7128, lng: -74.006 };

  const markers = [
    ...(destCoords ? [{
      lat: destCoords.lat,
      lng: destCoords.lng,
      label: 'Destination',
      color: '#EF4444',
      type: 'home' as const,
    }] : []),
    ...filtered.map(s => {
      const isSelected = selectedSpot?.id === s.id;
      const sz = isSelected ? 44 : 38;
      return {
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        color: brandColor,
        iconUrl: parkingMarkerSvg(isSelected),
        iconSize: [sz, sz] as [number, number],
        iconCircular: false,
        zIndexOffset: isSelected ? 100 : 0,
        onClick: () => setSelectedSpot(s),
      };
    }),
  ];

  const handleNavigate = (spot: ParkingSpot) => {
    const destName = encodeURIComponent(spot.name);
    window.open(`https://www.mapquest.com/directions/to/${destName}/${spot.lat},${spot.lng}`, '_blank');
  };

  return (
    <div
      className="prism-widget w-full md:w-[1060px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ fontFamily: fontFamily || 'var(--brand-font)', '--brand-primary': accentColor } as React.CSSProperties}
    >
      <WidgetHeader
        title="Parking Finder"
        subtitle={destCoords ? `${spotsInRadius.length} options found` : 'Find parking near your destination'}
        variant="impressive"
        layout="inline"
        icon={<ParkingCircle className="w-4 h-4" />}
        right={
          destCoords && !loading ? (
            <button
              onClick={() => searchParking(destCoords.lat, destCoords.lng)}
              className="p-2 rounded-lg transition-colors hover:bg-black/5"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Refresh results"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          ) : null
        }
      />

      <div className="flex flex-col md:flex-row md:h-[640px]">
        {/* Map */}
        <div className="relative h-[300px] md:h-auto md:w-[55%] md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={destCoords ? 15 : 12}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            clusterMarkers={!selectedSpot && filtered.length > 20}
            zoomToLocation={selectedSpot ? { lat: selectedSpot.lat, lng: selectedSpot.lng, zoom: 17 } : undefined}
          />
        </div>

        {/* Sidebar */}
        <div
          className="w-full md:w-[45%] flex flex-col overflow-hidden border-t md:border-t-0 md:border-r md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Destination input */}
          <div className="p-4" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}>
            <div
              className="rounded-xl flex items-center gap-2.5"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
            >
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
              <AddressAutocomplete
                value={destination}
                onChange={setDestination}
                onSelect={(result) => {
                  if (result.lat && result.lng) {
                    setDestCoords({ lat: result.lat, lng: result.lng });
                  }
                }}
                placeholder="Where are you going?"
                darkMode={darkMode}
                inputBg={darkMode ? 'bg-gray-700' : 'bg-gray-50'}
                textColor={darkMode ? 'text-white' : 'text-gray-900'}
                mutedText={darkMode ? 'text-gray-200' : 'text-gray-500'}
                borderColor={darkMode ? 'border-gray-700' : 'border-gray-200'}
                className="flex-1"
                hideIcon
              />
              <button
                onClick={detectLocation}
                disabled={locating}
                className="p-1.5 rounded-lg transition-colors hover:bg-black/5 flex-shrink-0"
                style={{ color: locating ? accentColor : 'var(--text-muted)' }}
                aria-label="Use my location"
              >
                <Locate className={`w-4 h-4 ${locating ? 'animate-pulse' : ''}`} />
              </button>
            </div>

            {/* Radius selector */}
            {destCoords && (
              <div className="flex items-center gap-2 mt-3">
                <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  Radius
                </span>
                <div className="flex-1 flex items-center gap-1">
                  {[0.5, 1, 3, 5].map(d => {
                    const active = maxDistance === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setMaxDistance(d)}
                        className="flex-1 text-[10px] font-semibold py-1 rounded-lg transition-colors text-center hover:opacity-80"
                        style={{
                          background: active ? accentColor : 'var(--bg-input)',
                          color: active ? 'white' : 'var(--text-muted)',
                          border: `1px solid ${active ? accentColor : 'var(--border-subtle)'}`,
                        }}
                      >
                        {d < 1 ? `${d} mi` : `${d} mi`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Filters row */}
          {filtered.length > 0 && !loading && (
            <div
              className="flex items-center gap-1.5 px-3 py-2 flex-wrap"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <Filter className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              {(['garage', 'lot', 'other'] as FacilityType[]).map(f => {
                const active = facilityFilter.has(f);
                return (
                  <button
                    key={f}
                    onClick={() => toggleFacility(f)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
                    style={{
                      background: active ? `${brandColor}18` : 'var(--bg-input)',
                      color: active ? brandColor : 'var(--text-muted)',
                      border: `1px solid ${active ? `${brandColor}40` : 'transparent'}`,
                    }}
                  >
                    {f === 'garage' ? 'Garage' : f === 'lot' ? 'Lot' : 'Other'}
                  </button>
                );
              })}
              <button
                onClick={() => setShowHandicapOnly(p => !p)}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors hover:opacity-80 flex items-center gap-1"
                style={{
                  background: showHandicapOnly ? `${brandColor}18` : 'var(--bg-input)',
                  color: showHandicapOnly ? brandColor : 'var(--text-muted)',
                  border: `1px solid ${showHandicapOnly ? `${brandColor}40` : 'transparent'}`,
                }}
              >
                <Accessibility className="w-3 h-3" /> ADA
              </button>
              <button
                onClick={() => setShowEVOnly(p => !p)}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors hover:opacity-80 flex items-center gap-1"
                style={{
                  background: showEVOnly ? `${brandColor}18` : 'var(--bg-input)',
                  color: showEVOnly ? brandColor : 'var(--text-muted)',
                  border: `1px solid ${showEVOnly ? `${brandColor}40` : 'transparent'}`,
                }}
              >
                <Zap className="w-3 h-3" /> EV
              </button>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto prism-scrollbar" ref={scrollRef}>
            {/* Loading */}
            {loading && (
              <div className="flex items-center gap-2 p-8 justify-center" style={{ color: 'var(--text-muted)' }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Searching for parking...</span>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="m-3 flex items-center gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--color-error-bg, #FEF2F2)', color: 'var(--color-error, #DC2626)' }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Empty state before search */}
            {!destCoords && !loading && (
              <div className="text-center py-12 px-4">
                <ParkingCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-main)' }}>Find nearby parking</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Enter a destination or use your current location to get started.
                </p>
              </div>
            )}

            {/* Selected spot detail */}
            {selectedSpot && !loading && (() => {
              const sc = brandColor;
              const facilityLabel = selectedSpot.facilityType === 'garage' ? 'Garage' : selectedSpot.facilityType === 'lot' ? 'Parking Lot' : 'Parking';
              return (
                <div className="p-3">
                  <button
                    onClick={() => setSelectedSpot(null)}
                    className="flex items-center gap-1.5 text-xs mb-3 transition-colors hover:opacity-80"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to list
                  </button>

                  {/* Name + type banner */}
                  <div
                    className="rounded-t-xl px-4 pt-4 pb-3"
                    style={{ background: `linear-gradient(135deg, ${sc}12, ${sc}04)` }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: sc, boxShadow: `0 4px 12px ${sc}35` }}
                      >
                        <ParkingCircle className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold leading-snug" style={{ color: 'var(--text-main)' }}>
                          {selectedSpot.name}
                        </div>
                        {selectedSpot.address && (
                          <div className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>
                            <MapPin className="w-3 h-3 inline -mt-px mr-0.5" />{selectedSpot.address}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg"
                        style={{ background: `${sc}20`, color: sc }}
                      >
                        {facilityLabel}
                      </span>
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}
                      >
                        <Navigation className="w-2.5 h-2.5 inline -mt-px mr-0.5" />{selectedSpot.distance.toFixed(2)} mi
                      </span>
                      {selectedSpot.hasHandicap && (
                        <span className="text-[9px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1" style={{ background: '#3B82F614', color: '#3B82F6' }}>
                          <Accessibility className="w-3 h-3" /> ADA
                        </span>
                      )}
                      {selectedSpot.hasEVCharging && (
                        <span className="text-[9px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1" style={{ background: '#22C55E14', color: '#16A34A' }}>
                          <Zap className="w-3 h-3" /> EV
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div
                    className="grid grid-cols-3 rounded-b-xl overflow-hidden"
                    style={{ border: '1px solid var(--border-subtle)', borderTop: 'none' }}
                  >
                    {[
                      { icon: <DollarSign className="w-5 h-5" />, value: selectedSpot.pricePerHour != null ? `$${selectedSpot.pricePerHour}` : '—', label: 'per hour', color: '#22C55E' },
                      { icon: <Clock className="w-5 h-5" />, value: selectedSpot.hours || '—', label: 'hours', color: '#F59E0B' },
                      { icon: <Navigation className="w-5 h-5" />, value: `${selectedSpot.distance.toFixed(1)} mi`, label: 'away', color: '#3B82F6' },
                    ].map((stat, i) => (
                      <div
                        key={i}
                        className="p-3.5 text-center"
                        style={{ borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none', background: 'var(--bg-panel)' }}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center mx-auto mb-1.5"
                          style={{ background: `${stat.color}10`, color: stat.color }}
                        >
                          {stat.icon}
                        </div>
                        <div className="text-[13px] font-bold" style={{ color: 'var(--text-main)' }}>
                          {stat.value}
                        </div>
                        <div className="text-[9px] font-medium uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-3">
                    <button
                      onClick={() => handleNavigate(selectedSpot)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: accentColor, boxShadow: `0 2px 8px ${accentColor}30` }}
                    >
                      <Navigation className="w-4 h-4" />
                      Navigate on MapQuest
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Spot list */}
            {!selectedSpot && !loading && filtered.length > 0 && (
              <div className="p-3 space-y-2">
                {filtered.map(spot => {
                  const c = brandColor;
                  return (
                    <button
                      key={spot.id}
                      onClick={() => setSelectedSpot(spot)}
                      className="w-full rounded-xl transition-all text-left hover:brightness-[0.97]"
                      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = `${c}60`; e.currentTarget.style.boxShadow = `0 2px 8px ${c}10`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: `${c}12`, color: c }}
                        >
                          <span className="font-bold text-sm">P</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                            {spot.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {spot.distance.toFixed(2)} mi
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>·</span>
                            <span
                              className="text-[9px] font-semibold px-1.5 py-px rounded"
                              style={{ background: `${c}12`, color: c }}
                            >
                              {spot.facilityType === 'garage' ? 'Garage' : spot.facilityType === 'lot' ? 'Lot' : 'Parking'}
                            </span>
                            {spot.hasHandicap && <Accessibility className="w-3 h-3" style={{ color: '#3B82F6' }} />}
                            {spot.hasEVCharging && <Zap className="w-3 h-3" style={{ color: '#16A34A' }} />}
                          </div>
                          {spot.address && (
                            <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                              {spot.address}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {spot.pricePerHour != null && (
                            <div className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>
                              ${spot.pricePerHour}/hr
                            </div>
                          )}
                          {spot.hours && (
                            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {spot.hours}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty after filter */}
            {!selectedSpot && !loading && destCoords && filtered.length === 0 && spots.length > 0 && (
              <div className="text-center py-8 px-4">
                <Filter className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No parking matches your filters.
                </p>
                <button
                  onClick={() => { setFacilityFilter(new Set()); setShowHandicapOnly(false); setShowEVOnly(false); }}
                  className="text-[10px] font-semibold mt-2 px-3 py-1 rounded-full hover:opacity-80"
                  style={{ color: brandColor, background: `${brandColor}10` }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      {showBranding && (
        <div className="prism-footer">
          {companyLogo && (
            <img
              src={companyLogo}
              alt={companyName || 'Company logo'}
              className="prism-footer-logo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
