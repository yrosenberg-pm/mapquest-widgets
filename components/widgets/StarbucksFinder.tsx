// components/widgets/StarbucksFinder.tsx
'use client';

import { useState, useEffect } from 'react';
import { Search, Phone, Clock, Navigation, Loader2, ChevronRight, X, Coffee } from 'lucide-react';
import { geocode, getDirections, searchPlaces } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

interface StarbucksLocation {
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

interface StarbucksFinderProps {
  darkMode?: boolean;
  showBranding?: boolean;
  fontFamily?: string;
  borderRadius?: string;
  maxResults?: number;
  searchRadius?: number;
  logoUrl?: string;
  defaultLocation?: { lat: number; lng: number };
  onStoreSelect?: (store: StarbucksLocation) => void;
}

// Starbucks brand color
const STARBUCKS_GREEN = '#00704A';

// Default Starbucks logo (official siren logo from their CDN)
const DEFAULT_LOGO = 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d3/Starbucks_Corporation_Logo_2011.svg/1200px-Starbucks_Corporation_Logo_2011.svg.png';

export default function StarbucksFinder({
  darkMode = false,
  showBranding = true,
  fontFamily,
  maxResults = 15,
  searchRadius = 15,
  logoUrl,
  defaultLocation = { lat: 47.6062, lng: -122.3321 }, // Seattle (Starbucks HQ)
  onStoreSelect,
}: StarbucksFinderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [stores, setStores] = useState<StarbucksLocation[]>([]);
  const [selectedStore, setSelectedStore] = useState<StarbucksLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const getDriveTime = async (fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<number | null> => {
    try {
      const route = await getDirections(
        `${fromLat},${fromLng}`,
        `${toLat},${toLng}`
      );
      
      if (!route || (route as any).routeError) {
        return null;
      }
      
      return Math.round(route.time);
    } catch (err) {
      return null;
    }
  };

  // Load Starbucks at a specific location
  const loadStarbucksAtLocation = async (location: { lat: number; lng: number }, calculateDriveTimes = true) => {
    try {
      const starbucksResults = await searchPlaces(
        location.lat,
        location.lng,
        'q:starbucks',
        searchRadius,
        maxResults
      );
      
      if (starbucksResults.length === 0) {
        return [];
      }
      
      // Map results to our store format
      const storesList: StarbucksLocation[] = starbucksResults.map((item, idx) => {
        const coords = item.place?.geometry?.coordinates || [];
        const props = item.place?.properties as Record<string, any> || {};
        
        return {
          id: `starbucks-${idx}`,
          name: item.name || 'Starbucks',
          address: props.street || item.displayString || '',
          city: props.city || '',
          state: props.state || props.stateCode || '',
          lat: coords[1] || item.place?.geometry?.coordinates?.[1] || 0,
          lng: coords[0] || item.place?.geometry?.coordinates?.[0] || 0,
          phone: props.phone,
          distance: item.distance,
        };
      }).filter(store => store.lat !== 0 && store.lng !== 0);
      
      if (calculateDriveTimes && storesList.length > 0) {
        // Get drive times for closest stores (limit to first 5 for performance)
        const storesWithDuration = await Promise.all(
          storesList.slice(0, 5).map(async (store) => {
            const duration = await getDriveTime(location.lat, location.lng, store.lat, store.lng);
            return { ...store, duration: duration ?? undefined };
          })
        );
        
        return [
          ...storesWithDuration,
          ...storesList.slice(5),
        ];
      }
      
      return storesList;
    } catch (err) {
      console.error('Error loading Starbucks:', err);
      return [];
    }
  };

  // Load initial Starbucks on mount
  useEffect(() => {
    const loadInitialStores = async () => {
      setLoading(true);
      
      // Try to get user's current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setUserLocation(location);
            const stores = await loadStarbucksAtLocation(location, false);
            setStores(stores);
            setLoading(false);
            setInitialLoadDone(true);
          },
          async () => {
            // Geolocation denied or failed, use default location
            setUserLocation(defaultLocation);
            const stores = await loadStarbucksAtLocation(defaultLocation, false);
            setStores(stores);
            setLoading(false);
            setInitialLoadDone(true);
          },
          { timeout: 5000 }
        );
      } else {
        // No geolocation support, use default
        setUserLocation(defaultLocation);
        const stores = await loadStarbucksAtLocation(defaultLocation, false);
        setStores(stores);
        setLoading(false);
        setInitialLoadDone(true);
      }
    };

    loadInitialStores();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const searchStarbucks = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // First geocode the user's location
      const result = await geocode(searchQuery);
      
      if (!result || !result.lat || !result.lng) {
        setError('Location not found. Please try a different address, city, or zip code.');
        setLoading(false);
        return;
      }
      
      const location = { lat: result.lat, lng: result.lng };
      setUserLocation(location);
      
      // Search for Starbucks locations near the user
      const storesList = await loadStarbucksAtLocation(location, true);
      
      if (storesList.length === 0) {
        setError('No Starbucks locations found nearby. Try a different location.');
        setLoading(false);
        return;
      }
      
      setStores(storesList);
      setSelectedStore(null);
    } catch (err) {
      console.error('Search error:', err);
      setError('Error searching for Starbucks locations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStoreSelect = (store: StarbucksLocation) => {
    setSelectedStore(store);
    onStoreSelect?.(store);
  };

  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);

  // Filter stores to only those visible in the map viewport
  const visibleStores = mapBounds 
    ? stores.filter(store => 
        store.lat >= mapBounds.south && 
        store.lat <= mapBounds.north && 
        store.lng >= mapBounds.west && 
        store.lng <= mapBounds.east
      )
    : stores;

  const mapCenter = selectedStore 
    ? { lat: selectedStore.lat, lng: selectedStore.lng }
    : userLocation || { lat: 39.8283, lng: -98.5795 };

  const starbucksIconUrl = logoUrl || DEFAULT_LOGO;

  const markers = [
    ...(userLocation ? [{
      lat: userLocation.lat,
      lng: userLocation.lng,
      label: 'Your Location',
      color: '#3B82F6',
      type: 'home' as const,
    }] : []),
    ...stores.map((store) => ({
      lat: store.lat,
      lng: store.lng,
      label: store.name,
      iconUrl: starbucksIconUrl,
      iconSize: [28, 28] as [number, number],
    })),
  ];

  const handleBoundsChange = (bounds: { north: number; south: number; east: number; west: number }) => {
    setMapBounds(bounds);
  };

  return (
    <div 
      className="prism-widget"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        minWidth: '900px', 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': STARBUCKS_GREEN,
      } as React.CSSProperties}
    >
      <div className="flex" style={{ height: '520px' }}>
        {/* Left Panel */}
        <div 
          className="w-80 flex flex-col"
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          {/* Search Header with Starbucks Branding */}
          <div 
            className="p-5"
            style={{ 
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden"
                style={{ background: STARBUCKS_GREEN }}
              >
                {logoUrl || DEFAULT_LOGO ? (
                  <img 
                    src={logoUrl || DEFAULT_LOGO} 
                    alt="Starbucks" 
                    className="w-10 h-10 object-contain"
                    onError={(e) => {
                      // Fallback to coffee icon if logo fails to load
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>';
                    }}
                  />
                ) : (
                  <Coffee className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <h3 
                  className="text-lg font-bold"
                  style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
                >
                  Starbucks Finder
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Find your nearest location
                </p>
              </div>
            </div>
            <AddressAutocomplete
              value={searchQuery}
              onChange={setSearchQuery}
              onSelect={(result) => {
                if (result.lat && result.lng) {
                  setSearchQuery(result.displayString);
                  setUserLocation({ lat: result.lat, lng: result.lng });
                  searchStarbucks();
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
              onClick={searchStarbucks}
              disabled={loading || !searchQuery.trim()}
              className="prism-btn prism-btn-primary w-full mt-4"
              style={{ 
                '--brand-primary': STARBUCKS_GREEN,
                background: `linear-gradient(135deg, ${STARBUCKS_GREEN} 0%, #1E3932 100%)`,
                boxShadow: `0 4px 12px ${STARBUCKS_GREEN}40`,
              } as React.CSSProperties}
            >
              {loading ? <Loader2 className="w-4 h-4 prism-spinner" /> : <Search className="w-4 h-4" />}
              {loading ? 'Finding Starbucks...' : 'Find Starbucks'}
            </button>
            {error && (
              <p 
                className="mt-3 text-sm font-medium px-3 py-2 rounded-lg"
                style={{ 
                  color: 'var(--color-error)', 
                  background: 'var(--color-error-bg)' 
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto prism-scrollbar">
            {stores.length === 0 && !loading && (
              <div 
                className="p-6 text-center text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                <div 
                  className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                  style={{ background: `${STARBUCKS_GREEN}15` }}
                >
                  <Coffee className="w-5 h-5" style={{ color: STARBUCKS_GREEN }} />
                </div>
                Enter your location to find nearby Starbucks
              </div>
            )}
            {visibleStores.length > 0 && (
              <div 
                className="px-4 py-2 text-xs font-medium"
                style={{ color: 'var(--text-muted)', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' }}
              >
                {visibleStores.length} location{visibleStores.length !== 1 ? 's' : ''} in view
              </div>
            )}
            {visibleStores.map((store, idx) => {
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
                    <img 
                      src={logoUrl || DEFAULT_LOGO} 
                      alt="" 
                      className="w-8 h-8 rounded-full flex-shrink-0"
                      style={{ 
                        boxShadow: isSelected ? `0 2px 8px ${STARBUCKS_GREEN}40` : 'none',
                        border: isSelected ? `2px solid ${STARBUCKS_GREEN}` : '2px solid transparent',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div 
                        className="font-semibold text-sm truncate"
                        style={{ color: 'var(--text-main)' }}
                      >
                        {store.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {store.distance !== undefined && (
                          <span 
                            className="text-xs"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {store.distance.toFixed(1)} mi
                          </span>
                        )}
                        {store.duration !== undefined && store.duration !== null && (
                          <span 
                            className="text-xs font-medium"
                            style={{ color: STARBUCKS_GREEN }}
                          >
                            · {store.duration} min
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight 
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: isSelected ? STARBUCKS_GREEN : 'var(--text-muted)' }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Store Details */}
          {selectedStore && (
            <div 
              className="p-5"
              style={{ 
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel)',
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div 
                  className="font-bold text-base"
                  style={{ color: 'var(--text-main)' }}
                >
                  {selectedStore.name}
                </div>
                <button 
                  onClick={() => setSelectedStore(null)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--bg-input)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-input)')}
                >
                  <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
              <div 
                className="text-sm space-y-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {selectedStore.address && <div>{selectedStore.address}</div>}
                {selectedStore.city && (
                  <div>{selectedStore.city}{selectedStore.state ? `, ${selectedStore.state}` : ''}</div>
                )}
                {selectedStore.phone && (
                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <Phone className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    <span className="font-medium">{selectedStore.phone}</span>
                  </div>
                )}
              </div>
              <button
                className="prism-btn prism-btn-primary w-full mt-4"
                style={{ 
                  background: `linear-gradient(135deg, ${STARBUCKS_GREEN} 0%, #1E3932 100%)`,
                  boxShadow: `0 4px 12px ${STARBUCKS_GREEN}40`,
                }}
                onClick={() => {
                  window.open(
                    `https://www.mapquest.com/directions/to/${selectedStore.lat},${selectedStore.lng}`,
                    '_blank'
                  );
                }}
              >
                <Navigation className="w-4 h-4" />
                Get Directions
              </button>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 min-w-0">
          <MapQuestMap
            apiKey={process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || ''}
            center={mapCenter}
            zoom={stores.length > 0 ? 12 : 4}
            darkMode={darkMode}
            accentColor={STARBUCKS_GREEN}
            height="520px"
            markers={markers}
            onBoundsChange={handleBoundsChange}
          />
        </div>
      </div>

      {/* Footer / Branding */}
      {showBranding && (
        <div className="prism-footer">
          <div className="flex items-center gap-2">
            <img 
              src={logoUrl || DEFAULT_LOGO} 
              alt="Starbucks" 
              className="w-5 h-5 object-contain"
              onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
            />
            <span>
              <span style={{ fontWeight: 600, color: STARBUCKS_GREEN }}>Starbucks Finder</span>
              <span style={{ color: 'var(--text-muted)' }}> · Powered by </span>
              <strong>MapQuest</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
