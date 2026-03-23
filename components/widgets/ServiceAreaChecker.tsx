// components/widgets/ServiceAreaChecker.tsx
'use client';

import { useState, useCallback, useMemo } from 'react';
import { Loader2, CheckCircle2, XCircle, Navigation, MapPin, Eye, EyeOff, Plus, X, Search } from 'lucide-react';
import { geocode, reverseGeocode } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import AddressAutocomplete from '../AddressAutocomplete';
import WidgetHeader from './WidgetHeader';

interface ServiceAreaCheckerProps {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  serviceCenter?: { lat: number; lng: number };
  serviceRadiusMiles?: number;
  validZipCodes?: string[];
  onResult?: (result: { inArea: boolean; address: string; distance?: number }) => void;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

const DEFAULT_CENTER = { lat: 39.7392, lng: -104.9903 };
const DEFAULT_RADIUS = 25;

interface BoundaryEntry {
  id: string;
  label: string;
  type: 'zip' | 'city' | 'state';
  coordinates: { lat: number; lng: number }[];
  color: string;
}

const BOUNDARY_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

// --- Boundary fetching (via /api/boundary proxy) ---

async function fetchBoundary(type: 'zip' | 'city' | 'state', query: string): Promise<{ label: string; coords: { lat: number; lng: number }[] } | null> {
  try {
    const res = await fetch(`/api/boundary?type=${type}&q=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = geojsonToCoords(data.geometry);
    if (!coords || coords.length < 3) return null;
    return { label: data.label || query, coords };
  } catch {
    return null;
  }
}

function geojsonToCoords(geometry: any): { lat: number; lng: number }[] | null {
  if (!geometry) return null;
  const { type, coordinates } = geometry;
  if (type === 'Polygon' && coordinates?.[0]) {
    return coordinates[0].map(([lng, lat]: [number, number]) => ({ lat, lng }));
  }
  if (type === 'MultiPolygon' && coordinates?.length) {
    // Use the largest ring
    let best: [number, number][] = [];
    for (const poly of coordinates) {
      if (poly[0] && poly[0].length > best.length) best = poly[0];
    }
    return best.map(([lng, lat]) => ({ lat, lng }));
  }
  return null;
}

// Ray-casting point-in-polygon
function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function detectBoundaryType(query: string): 'zip' | 'city' | 'state' {
  if (/^\d{5}$/.test(query.trim())) return 'zip';
  const usStates = [
    'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia',
    'hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts',
    'michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey',
    'new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
    'south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia',
    'wisconsin','wyoming',
  ];
  if (usStates.includes(query.trim().toLowerCase())) return 'state';
  return 'city';
}

export default function ServiceAreaChecker({
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  serviceCenter = DEFAULT_CENTER,
  serviceRadiusMiles = DEFAULT_RADIUS,
  validZipCodes,
  onResult,
}: ServiceAreaCheckerProps) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    inArea: boolean;
    address: string;
    distance?: number;
    lat?: number;
    lng?: number;
    matchedBoundary?: string;
  } | null>(null);
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [showServiceArea, setShowServiceArea] = useState(true);

  // Boundary mode state
  const [mode, setMode] = useState<'radius' | 'boundary'>('radius');
  const [boundaries, setBoundaries] = useState<BoundaryEntry[]>([]);
  const [boundarySearch, setBoundarySearch] = useState('');
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);

  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const getDistanceMiles = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Add a boundary from search
  const addBoundary = async () => {
    const q = boundarySearch.trim();
    if (!q) return;
    setBoundaryLoading(true);
    setBoundaryError(null);

    try {
      const bType = detectBoundaryType(q);
      const result = await fetchBoundary(bType, q);

      if (!result) {
        setBoundaryError(`Could not find boundary for "${q}"`);
        return;
      }

      const id = `${bType}-${q}-${Date.now()}`;
      const color = BOUNDARY_COLORS[boundaries.length % BOUNDARY_COLORS.length];
      setBoundaries(prev => [...prev, { id, label: result.label, type: bType, coordinates: result.coords, color }]);
      setBoundarySearch('');
    } catch {
      setBoundaryError('Failed to fetch boundary');
    } finally {
      setBoundaryLoading(false);
    }
  };

  const removeBoundary = (id: string) => {
    setBoundaries(prev => prev.filter(b => b.id !== id));
  };

  const checkServiceArea = async (addressToCheck: string, lat?: number, lng?: number) => {
    setLoading(true);
    setResult(null);

    try {
      let checkLat = lat;
      let checkLng = lng;
      let resolvedAddress = addressToCheck;

      if (!checkLat || !checkLng) {
        const geocoded = await geocode(addressToCheck);
        if (!geocoded) {
          setResult({ inArea: false, address: addressToCheck });
          return;
        }
        checkLat = geocoded.lat;
        checkLng = geocoded.lng;
        resolvedAddress = (geocoded as any).displayString || addressToCheck;
      }

      if (mode === 'boundary' && boundaries.length > 0) {
        // Check against all boundary polygons
        let matched: string | undefined;
        for (const b of boundaries) {
          if (pointInPolygon(checkLat, checkLng, b.coordinates)) {
            matched = b.label;
            break;
          }
        }
        const inArea = !!matched;
        const checkResult = {
          inArea,
          address: resolvedAddress,
          lat: checkLat,
          lng: checkLng,
          matchedBoundary: matched,
        };
        setResult(checkResult);
        onResult?.(checkResult);
      } else {
        // Radius mode
        const distance = getDistanceMiles(serviceCenter.lat, serviceCenter.lng, checkLat, checkLng);
        const inArea = distance <= serviceRadiusMiles;
        const checkResult = {
          inArea,
          address: resolvedAddress,
          distance: Math.round(distance * 10) / 10,
          lat: checkLat,
          lng: checkLng,
        };
        setResult(checkResult);
        onResult?.(checkResult);
      }
    } catch (err) {
      console.error('Service area check failed:', err);
      setResult({ inArea: false, address: addressToCheck });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      checkServiceArea(address);
    }
  };

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setClickedPoint({ lat, lng });
    setLoading(true);

    try {
      const geo = await reverseGeocode(lat, lng);
      let clickedAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      if (geo) {
        clickedAddress = `${geo.street || ''} ${geo.adminArea5 || ''}, ${geo.adminArea3 || ''} ${geo.postalCode || ''}`.trim();
      }

      setAddress(clickedAddress);
      await checkServiceArea(clickedAddress, lat, lng);
    } catch (err) {
      console.error('Map click handling failed:', err);
      await checkServiceArea(`${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng);
    }
  }, [serviceCenter, serviceRadiusMiles, mode, boundaries]);

  // Build markers
  const markers = useMemo(() => {
    const m: { lat: number; lng: number; label: string; color: string }[] = [];
    if (mode === 'radius') {
      m.push({ lat: serviceCenter.lat, lng: serviceCenter.lng, label: 'Service Center', color: accentColor });
    }
    if (result?.lat && result?.lng) {
      m.push({
        lat: result.lat,
        lng: result.lng,
        label: result.inArea ? 'In Service Area' : 'Outside Area',
        color: result.inArea ? '#22c55e' : '#ef4444',
      });
    } else if (clickedPoint) {
      m.push({ lat: clickedPoint.lat, lng: clickedPoint.lng, label: 'Checking...', color: '#f59e0b' });
    }
    return m;
  }, [mode, serviceCenter, accentColor, result, clickedPoint]);

  // Build map overlays
  const circles = useMemo(() => {
    if (mode !== 'radius' || !showServiceArea) return [];
    return [{
      lat: serviceCenter.lat,
      lng: serviceCenter.lng,
      radius: serviceRadiusMiles * 1609.34,
      color: accentColor,
      fillOpacity: 0.1,
    }];
  }, [mode, showServiceArea, serviceCenter, serviceRadiusMiles, accentColor]);

  const polygons = useMemo(() => {
    if (mode !== 'boundary' || !showServiceArea) return [];
    return boundaries.map(b => ({
      coordinates: b.coordinates,
      color: b.color,
      fillOpacity: 0.15,
      strokeWidth: 2,
    }));
  }, [mode, showServiceArea, boundaries]);

  // Compute a center for boundary mode so the map fits
  const mapCenter = useMemo(() => {
    if (mode === 'boundary' && boundaries.length > 0) {
      const allCoords = boundaries.flatMap(b => b.coordinates);
      const avgLat = allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length;
      const avgLng = allCoords.reduce((s, c) => s + c.lng, 0) / allCoords.length;
      return { lat: avgLat, lng: avgLng };
    }
    return serviceCenter;
  }, [mode, boundaries, serviceCenter]);

  return (
    <div 
      className="prism-widget w-full md:w-[900px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <WidgetHeader
        title="Service Area Checker"
        subtitle="Check delivery availability by address or map click."
        variant="impressive"
        layout="inline"
        icon={<Navigation className="w-4 h-4" />}
      />

      <div className="flex flex-col md:flex-row" style={{ minHeight: '520px' }}>
        {/* Map */}
        <div className="relative h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={mode === 'boundary' && boundaries.length > 0 ? 10 : 9}
            darkMode={darkMode}
            accentColor={accentColor}
            markers={markers}
            circles={circles}
            polygons={polygons}
            height="100%"
            onClick={handleMapClick}
          />
        </div>

        {/* Left Panel */}
        <div 
          className="w-full md:w-80 flex-shrink-0 p-4 flex flex-col border-t md:border-t-0 md:border-r md:order-1 overflow-y-auto prism-scrollbar"
          style={{ borderColor: 'var(--border-subtle)', maxHeight: '520px' }}
        >
          {/* Mode Toggle */}
          <div className="flex rounded-lg p-0.5 mb-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
            {(['radius', 'boundary'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setResult(null); }}
                className="flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all hover:opacity-80"
                style={{
                  background: mode === m ? accentColor : 'transparent',
                  color: mode === m ? '#fff' : 'var(--text-muted)',
                }}
              >
                {m === 'radius' ? 'Radius' : 'Boundary'}
              </button>
            ))}
          </div>

          {/* Boundary Mode Controls */}
          {mode === 'boundary' && (
            <div className="mb-3 space-y-2">
              <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                Service Area Boundaries
              </div>
              <div className="flex gap-1.5">
                <div
                  className="flex-1 rounded-lg flex items-center gap-2"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '6px 10px' }}
                >
                  <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={boundarySearch}
                    onChange={e => { setBoundarySearch(e.target.value); setBoundaryError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBoundary(); } }}
                    placeholder="ZIP, city, or state..."
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-main)' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={addBoundary}
                  disabled={boundaryLoading || !boundarySearch.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
                  style={{
                    background: accentColor,
                    color: '#fff',
                    opacity: boundaryLoading || !boundarySearch.trim() ? 0.5 : 1,
                  }}
                >
                  {boundaryLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </div>
              {boundaryError && (
                <div className="text-[11px]" style={{ color: 'var(--color-error, #ef4444)' }}>{boundaryError}</div>
              )}
              {/* Boundary list */}
              {boundaries.length > 0 && (
                <div className="space-y-1">
                  {boundaries.map(b => (
                    <div
                      key={b.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                      style={{ background: `${b.color}12`, border: `1px solid ${b.color}30` }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                      <span className="flex-1 truncate font-medium" style={{ color: 'var(--text-main)' }}>
                        {b.label}
                      </span>
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded" style={{ background: `${b.color}20`, color: b.color }}>
                        {b.type}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeBoundary(b.id)}
                        className="flex-shrink-0 hover:opacity-60 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {boundaries.length === 0 && !boundaryLoading && (
                <div className="text-[11px] py-2" style={{ color: 'var(--text-muted)' }}>
                  Add zip codes, cities, or states to define your service area.
                </div>
              )}
            </div>
          )}

          {/* Separator */}
          <div className="border-t my-2" style={{ borderColor: 'var(--border-subtle)' }} />

          {/* Address Check */}
          <div className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
            Check Address
          </div>
          <form onSubmit={handleSubmit} className="space-y-2">
            <div
              className="rounded-xl flex items-center gap-2.5"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
            >
              <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
              <AddressAutocomplete
                value={address}
                onChange={(v) => { setAddress(v); setResult(null); }}
                onSelect={(r) => {
                  if (r.lat && r.lng) checkServiceArea(r.displayString, r.lat, r.lng);
                }}
                placeholder="Enter address or zip code"
                darkMode={darkMode}
                inputBg={inputBg}
                textColor={textColor}
                mutedText={mutedText}
                borderColor={borderColor}
                className="flex-1"
                hideIcon
              />
            </div>

            <button
              type="submit"
              disabled={loading || !address.trim()}
              className="prism-btn prism-btn-primary w-full hover:brightness-110 transition-all"
              style={{ 
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                boxShadow: `0 4px 12px ${accentColor}40`,
              }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 prism-spinner" /> Checking...</>
              ) : (
                <><Navigation className="w-4 h-4" /> Check Address</>
              )}
            </button>
          </form>

          {/* Result */}
          {result && (
            <div 
              className="mt-3 p-4 rounded-xl"
              style={{
                background: result.inArea ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                border: `1px solid ${result.inArea ? 'var(--color-success)' : 'var(--color-error)'}20`,
              }}
            >
              <div className="flex items-start gap-3">
                {result.inArea ? (
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }} />
                ) : (
                  <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }}><XCircle className="w-5 h-5" /></span>
                )}
                <div className="flex-1 min-w-0">
                  <div 
                    className="font-semibold text-sm"
                    style={{ color: result.inArea ? 'var(--color-success)' : 'var(--color-error)' }}
                  >
                    {result.inArea ? 'We deliver here!' : 'Outside service area'}
                  </div>
                  <div className="text-xs mt-1 break-words" style={{ color: 'var(--text-secondary)' }}>
                    {result.address}
                  </div>
                  {result.distance !== undefined && (
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {result.distance} miles from service center
                    </div>
                  )}
                  {result.matchedBoundary && (
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Inside: {result.matchedBoundary}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Service Area Info */}
          <div className="mt-auto pt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            {mode === 'radius' && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
                  Service center
                </div>
                <div>Delivery radius: {serviceRadiusMiles} miles</div>
              </>
            )}
            {mode === 'boundary' && boundaries.length > 0 && (
              <div>{boundaries.length} boundary zone{boundaries.length !== 1 ? 's' : ''} defined</div>
            )}
            <button
              onClick={() => setShowServiceArea(!showServiceArea)}
              className="flex items-center gap-1.5 text-xs mt-1 transition-colors hover:opacity-80"
              style={{ color: showServiceArea ? accentColor : 'var(--text-muted)', opacity: showServiceArea ? 1 : 0.7 }}
            >
              <span>{showServiceArea ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</span>
              {showServiceArea ? 'Hide area' : 'Show area'}
            </button>
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
