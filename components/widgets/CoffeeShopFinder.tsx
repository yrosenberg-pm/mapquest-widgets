// components/widgets/CoffeeShopFinder.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Phone, Navigation, Loader2, ChevronRight, X, Coffee } from 'lucide-react';
import { geocode, searchPlaces } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import AddressAutocomplete from '../AddressAutocomplete';

interface CoffeeShopLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  phone?: string;
  distance?: number;
  duration?: number;
}

interface CoffeeShopFinderProps {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  fontFamily?: string;
  borderRadius?: string;
  maxResults?: number;
  searchRadius?: number;
  defaultLocation?: { lat: number; lng: number };
  onStoreSelect?: (store: CoffeeShopLocation) => void;
}

const DEFAULT_ACCENT = '#8B6914';
const GENERIC_SHOP_NAME = 'Coffee Shop';

function coffeePinIconDataUri(accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="12.5" fill="${accent}" stroke="white" stroke-width="2"/>
    <path d="M17.5 10.5h.75a2.75 2.75 0 010 5.5H17.5M8.5 10.5h9v6.25a2.75 2.75 0 01-2.75 2.75h-3.5a2.75 2.75 0 01-2.75-2.75V10.5z" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 8.25V9.5M12.25 8.25V9.5M14.5 8.25V9.5" stroke="white" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default function CoffeeShopFinder({
  accentColor = DEFAULT_ACCENT,
  darkMode = false,
  showBranding = true,
  fontFamily,
  maxResults = 50,
  searchRadius = 25,
  defaultLocation = { lat: 47.6062, lng: -122.3321 },
  onStoreSelect,
}: CoffeeShopFinderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [stores, setStores] = useState<CoffeeShopLocation[]>([]);
  const [selectedStore, setSelectedStore] = useState<CoffeeShopLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const pinIconUrl = coffeePinIconDataUri(accentColor);

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const loadCoffeeShopsInBounds = async (bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }) => {
    try {
      const centerLat = (bounds.north + bounds.south) / 2;
      const centerLng = (bounds.east + bounds.west) / 2;
      const radiusMiles = calculateDistance(centerLat, centerLng, bounds.north, bounds.east);
      const searchRadiusMiles = Math.min(Math.max(radiusMiles * 1.2, 5), 50);

      const results = await searchPlaces(
        centerLat,
        centerLng,
        'q:coffee shop',
        searchRadiusMiles,
        100,
      );

      if (results.length === 0) return [];

      return results
        .map((item, idx) => {
          const coords = item.place?.geometry?.coordinates || [];
          const props = (item.place?.properties as Record<string, unknown>) || {};

          let distance = item.distance;
          if (userLocation && coords[1] && coords[0]) {
            distance = calculateDistance(userLocation.lat, userLocation.lng, coords[1], coords[0]);
          }

          return {
            id: `coffee-${coords[1]?.toFixed(4)}-${coords[0]?.toFixed(4)}-${idx}`,
            name: GENERIC_SHOP_NAME,
            address: String(props.street || item.displayString || ''),
            city: String(props.city || ''),
            state: String(props.state || props.stateCode || ''),
            lat: coords[1] || 0,
            lng: coords[0] || 0,
            phone: typeof props.phone === 'string' ? props.phone : undefined,
            distance,
          };
        })
        .filter((store) => store.lat !== 0 && store.lng !== 0);
    } catch (err) {
      console.error('Error loading coffee shops:', err);
      return [];
    }
  };

  const hasSearchedRef = useRef(false);
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!hasSearchedRef.current) {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          }
          setLoading(false);
          setInitialLoadDone(true);
        },
        () => {
          if (!hasSearchedRef.current) {
            setUserLocation(defaultLocation);
          }
          setLoading(false);
          setInitialLoadDone(true);
        },
        { timeout: 5000 },
      );
    } else {
      if (!hasSearchedRef.current) {
        setUserLocation(defaultLocation);
      }
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const searchAtLocation = async (location: { lat: number; lng: number }) => {
    hasSearchedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const latOffset = 0.145;
      const lngOffset = 0.18;
      const newBounds = {
        north: location.lat + latOffset,
        south: location.lat - latOffset,
        east: location.lng + lngOffset,
        west: location.lng - lngOffset,
      };

      const newStores = await loadCoffeeShopsInBounds(newBounds);
      skipBoundsSearchRef.current = true;

      setSelectedStore(null);
      setUserLocation(location);
      setStores(newStores);
      setPendingLocation(location);

      setTimeout(() => {
        setPendingLocation(null);
        skipBoundsSearchRef.current = false;
      }, 1000);
    } catch (err) {
      console.error('Search error:', err);
      setError('Error searching for coffee shops. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const searchCoffeeShops = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await geocode(searchQuery);

      if (!result?.lat || !result?.lng) {
        setError('Location not found. Please try a different address, city, or zip code.');
        setLoading(false);
        return;
      }

      await searchAtLocation({ lat: result.lat, lng: result.lng });
    } catch (err) {
      console.error('Search error:', err);
      setError('Error searching for coffee shops. Please try again.');
      setLoading(false);
    }
  };

  const handleStoreSelect = (store: CoffeeShopLocation) => {
    setSelectedStore(store);
    onStoreSelect?.(store);
  };

  const [mapBounds, setMapBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);

  const visibleStores = mapBounds
    ? stores.filter(
        (store) =>
          store.lat >= mapBounds.south &&
          store.lat <= mapBounds.north &&
          store.lng >= mapBounds.west &&
          store.lng <= mapBounds.east,
      )
    : stores;

  const mapCenter = selectedStore
    ? { lat: selectedStore.lat, lng: selectedStore.lng }
    : pendingLocation || userLocation || { lat: 39.8283, lng: -98.5795 };

  const mapZoom = stores.length > 0 || pendingLocation || loading ? 13 : 4;

  const markers = [
    ...(userLocation
      ? [
          {
            lat: userLocation.lat,
            lng: userLocation.lng,
            label: 'Your Location',
            color: '#3B82F6',
            type: 'home' as const,
          },
        ]
      : []),
    ...stores.map((store) => ({
      lat: store.lat,
      lng: store.lng,
      label: store.address ? `${store.address}${store.city ? `, ${store.city}` : ''}` : store.name,
      iconUrl: pinIconUrl,
      iconSize: [28, 28] as [number, number],
    })),
  ];

  const boundsSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skipBoundsSearchRef = useRef(false);

  const handleBoundsChange = async (bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }) => {
    setMapBounds(bounds);
    if (skipBoundsSearchRef.current) return;

    if (boundsSearchTimeoutRef.current) {
      clearTimeout(boundsSearchTimeoutRef.current);
    }

    boundsSearchTimeoutRef.current = setTimeout(async () => {
      if (skipBoundsSearchRef.current) return;

      setLoading(true);
      const newStores = await loadCoffeeShopsInBounds(bounds);

      setStores((prevStores) => {
        const existingIds = new Set(prevStores.map((s) => s.id));
        const uniqueNew = newStores.filter((s) => !existingIds.has(s.id));
        const merged = [...prevStores, ...uniqueNew];
        if (userLocation) {
          merged.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        }
        return merged;
      });
      setLoading(false);
    }, 500);
  };

  const ShopIcon = ({ selected }: { selected?: boolean }) => (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        background: `${accentColor}18`,
        border: selected ? `2px solid ${accentColor}` : `2px solid ${accentColor}40`,
        boxShadow: selected ? `0 2px 8px ${accentColor}40` : 'none',
      }}
    >
      <Coffee className="w-4 h-4" style={{ color: accentColor }} />
    </div>
  );

  return (
    <div
      className="prism-widget w-full md:w-[900px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={
        {
          fontFamily: fontFamily || 'var(--brand-font)',
          '--brand-primary': accentColor,
        } as React.CSSProperties
      }
    >
      <div className="flex flex-col md:flex-row md:h-[520px]">
        <div className="min-w-0 h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || ''}
            center={mapCenter}
            zoom={mapZoom}
            minZoom={12}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            onBoundsChange={handleBoundsChange}
          />
        </div>

        <div
          className="w-full md:w-80 flex flex-col border-t md:border-t-0 md:border-r md:order-1 flex-1 md:flex-initial min-h-[300px] md:min-h-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="p-5"
            style={{
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: accentColor }}
              >
                <Coffee className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3
                  className="text-lg font-bold"
                  style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
                >
                  Coffee Shop Finder
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Find nearby coffee shops
                </p>
              </div>
            </div>
            <AddressAutocomplete
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v);
                setUserLocation(null);
                setPendingLocation(null);
                setSelectedStore(null);
              }}
              onSelect={async (result) => {
                if (result.lat && result.lng) {
                  setSearchQuery(result.displayString);
                  await searchAtLocation({ lat: result.lat, lng: result.lng });
                }
              }}
              placeholder="Enter address, city, or zip..."
              darkMode={darkMode}
              inputBg={inputBg}
              textColor={textColor}
              mutedText={mutedText}
              borderColor={borderColor}
            />
            <button
              onClick={searchCoffeeShops}
              disabled={loading || !searchQuery.trim()}
              className="prism-btn prism-btn-primary w-full mt-4 hover:brightness-110 transition-all"
              style={
                {
                  '--brand-primary': accentColor,
                  background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                  boxShadow: `0 4px 12px ${accentColor}40`,
                } as React.CSSProperties
              }
            >
              {loading ? <Loader2 className="w-4 h-4 prism-spinner" /> : <Search className="w-4 h-4" />}
              {loading ? 'Finding coffee shops...' : 'Find Coffee Shops'}
            </button>
            {error && (
              <p
                className="mt-3 text-sm font-medium px-3 py-2 rounded-lg"
                style={{
                  color: 'var(--color-error)',
                  background: 'var(--color-error-bg)',
                }}
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto prism-scrollbar">
            {stores.length === 0 && !loading && initialLoadDone && (
              <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                <div
                  className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                  style={{ background: `${accentColor}15` }}
                >
                  <Coffee className="w-5 h-5" style={{ color: accentColor }} />
                </div>
                Enter your location to find nearby coffee shops
              </div>
            )}
            {visibleStores.length > 0 && (
              <div
                className="px-4 py-2 text-xs font-medium"
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--bg-panel)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {visibleStores.length} location{visibleStores.length !== 1 ? 's' : ''} in view
              </div>
            )}
            {visibleStores.map((store) => {
              const isSelected = selectedStore?.id === store.id;
              return (
                <button
                  key={store.id}
                  onClick={() => handleStoreSelect(store)}
                  className={`prism-list-item w-full text-left ${isSelected ? 'prism-list-item-selected' : ''}`}
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <ShopIcon selected={isSelected} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-main)' }}>
                        {store.name}
                      </div>
                      {store.address && (
                        <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {store.address}
                          {store.city ? `, ${store.city}` : ''}
                        </div>
                      )}
                      {store.distance !== undefined && (
                        <span className="text-xs mt-0.5 inline-block" style={{ color: 'var(--text-muted)' }}>
                          {store.distance.toFixed(1)} mi
                        </span>
                      )}
                    </div>
                    <ChevronRight
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: isSelected ? accentColor : 'var(--text-muted)' }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {selectedStore && (
            <div
              className="p-5"
              style={{
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel)',
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="font-bold text-base" style={{ color: 'var(--text-main)' }}>
                  {selectedStore.name}
                </div>
                <button
                  onClick={() => setSelectedStore(null)}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: 'var(--bg-input)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-input)')}
                >
                  <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
              <div className="text-sm space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
                {selectedStore.address && <div>{selectedStore.address}</div>}
                {selectedStore.city && (
                  <div>
                    {selectedStore.city}
                    {selectedStore.state ? `, ${selectedStore.state}` : ''}
                  </div>
                )}
                {selectedStore.phone && (
                  <div
                    className="flex items-center gap-2 mt-3 pt-3"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    <Phone className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    <span className="font-medium">{selectedStore.phone}</span>
                  </div>
                )}
              </div>
              <button
                className="prism-btn prism-btn-primary w-full mt-4 hover:brightness-110 transition-all"
                style={{
                  background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                  boxShadow: `0 4px 12px ${accentColor}40`,
                }}
                onClick={() => {
                  window.open(
                    `https://www.mapquest.com/directions/to/${selectedStore.lat},${selectedStore.lng}`,
                    '_blank',
                  );
                }}
              >
                <Navigation className="w-4 h-4" />
                Get Directions
              </button>
            </div>
          )}
        </div>
      </div>

      {showBranding && (
        <div className="prism-footer">
          <div className="flex items-center gap-2">
            <Coffee className="w-4 h-4" style={{ color: accentColor }} />
            <span>
              <span style={{ fontWeight: 600, color: accentColor }}>Coffee Shop Finder</span>
              <span style={{ color: 'var(--text-muted)' }}> · Powered by </span>
            </span>
            <MapQuestPoweredLogo darkMode={darkMode} />
          </div>
        </div>
      )}
    </div>
  );
}
