// components/widgets/StarbucksFinder.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
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
  maxResults = 50,
  searchRadius = 25,
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

  // Calculate distance between two points in miles
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Load Starbucks based on map bounds
  const loadStarbucksInBounds = async (bounds: { north: number; south: number; east: number; west: number }) => {
    try {
      // Calculate center of bounds
      const centerLat = (bounds.north + bounds.south) / 2;
      const centerLng = (bounds.east + bounds.west) / 2;
      
      // Calculate radius from center to corner (in miles)
      const radiusMiles = calculateDistance(centerLat, centerLng, bounds.north, bounds.east);
      // Use at least 5 miles, cap at 50 miles
      const searchRadiusMiles = Math.min(Math.max(radiusMiles * 1.2, 5), 50);
      
      console.log(`Searching Starbucks at ${centerLat},${centerLng} with radius ${searchRadiusMiles.toFixed(1)} miles`);
      
      const starbucksResults = await searchPlaces(
        centerLat,
        centerLng,
        'q:starbucks',
        searchRadiusMiles,
        100 // Get up to 100 results
      );
      
      if (starbucksResults.length === 0) {
        return [];
      }
      
      // Map results to our store format
      const storesList: StarbucksLocation[] = starbucksResults.map((item, idx) => {
        const coords = item.place?.geometry?.coordinates || [];
        const props = item.place?.properties as Record<string, any> || {};
        
        // Calculate distance from user location if available
        let distance = item.distance;
        if (userLocation && coords[1] && coords[0]) {
          distance = calculateDistance(userLocation.lat, userLocation.lng, coords[1], coords[0]);
        }
        
        return {
          id: `starbucks-${coords[1]?.toFixed(4)}-${coords[0]?.toFixed(4)}-${idx}`,
          name: item.name || 'Starbucks',
          address: props.street || item.displayString || '',
          city: props.city || '',
          state: props.state || props.stateCode || '',
          lat: coords[1] || 0,
          lng: coords[0] || 0,
          phone: props.phone,
          distance: distance,
        };
      }).filter(store => store.lat !== 0 && store.lng !== 0);
      
      return storesList;
    } catch (err) {
      console.error('Error loading Starbucks:', err);
      return [];
    }
  };

  // Track if user has manually searched (to prevent geolocation from overriding)
  const hasSearchedRef = useRef(false);
  
  // Track if we're transitioning to a new search location
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Load initial Starbucks on mount - just set user location, actual search happens on bounds change
  useEffect(() => {
    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Only set location if user hasn't searched yet
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
          // Geolocation denied or failed, use default location
          if (!hasSearchedRef.current) {
            setUserLocation(defaultLocation);
          }
          setLoading(false);
          setInitialLoadDone(true);
        },
        { timeout: 5000 }
      );
    } else {
      // No geolocation support, use default
      if (!hasSearchedRef.current) {
        setUserLocation(defaultLocation);
      }
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Core search function that takes coordinates directly
  const searchAtLocation = async (location: { lat: number; lng: number }) => {
    // Mark that user has searched - prevents geolocation from overriding
    hasSearchedRef.current = true;
    
    setLoading(true);
    setError(null);
    
    try {
      // Calculate bounds for the new location (approximate ~10 mile radius)
      const latOffset = 0.145; // ~10 miles
      const lngOffset = 0.18; // ~10 miles (varies by latitude)
      const newBounds = {
        north: location.lat + latOffset,
        south: location.lat - latOffset,
        east: location.lng + lngOffset,
        west: location.lng - lngOffset,
      };
      
      // Load stores at new location BEFORE updating the map
      const newStores = await loadStarbucksInBounds(newBounds);
      
      // Skip bounds searches during transition
      skipBoundsSearchRef.current = true;
      
      // Now update everything at once for a smooth transition
      setSelectedStore(null);
      setUserLocation(location);
      setStores(newStores);
      setPendingLocation(location);
      
      // Clear pending location and re-enable bounds search after transition settles
      setTimeout(() => {
        setPendingLocation(null);
        skipBoundsSearchRef.current = false;
      }, 1000);
      
    } catch (err) {
      console.error('Search error:', err);
      setError('Error searching for Starbucks locations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Search by text query (geocodes first)
  const searchStarbucks = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Geocode the search location
      const result = await geocode(searchQuery);
      
      if (!result || !result.lat || !result.lng) {
        setError('Location not found. Please try a different address, city, or zip code.');
        setLoading(false);
        return;
      }
      
      await searchAtLocation({ lat: result.lat, lng: result.lng });
      
    } catch (err) {
      console.error('Search error:', err);
      setError('Error searching for Starbucks locations. Please try again.');
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

  // Use pending location for smooth transition to new search area
  const mapCenter = selectedStore 
    ? { lat: selectedStore.lat, lng: selectedStore.lng }
    : pendingLocation || userLocation || { lat: 39.8283, lng: -98.5795 };

  // Don't zoom out while loading or if we're transitioning to a new location
  const mapZoom = (stores.length > 0 || pendingLocation || loading) ? 13 : 4;

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
      label: store.address ? `${store.address}${store.city ? `, ${store.city}` : ''}` : store.name,
      iconUrl: starbucksIconUrl,
      iconSize: [28, 28] as [number, number],
    })),
  ];

  // Debounce ref to prevent too many API calls
  const boundsSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Skip bounds search during manual search transition
  const skipBoundsSearchRef = useRef(false);
  
  const handleBoundsChange = async (bounds: { north: number; south: number; east: number; west: number }) => {
    setMapBounds(bounds);
    
    // Skip bounds-based search if we just did a manual search
    if (skipBoundsSearchRef.current) {
      return;
    }
    
    // Debounce the search - wait 500ms after user stops panning/zooming
    if (boundsSearchTimeoutRef.current) {
      clearTimeout(boundsSearchTimeoutRef.current);
    }
    
    boundsSearchTimeoutRef.current = setTimeout(async () => {
      // Double-check we shouldn't skip
      if (skipBoundsSearchRef.current) return;
      
      setLoading(true);
      const newStores = await loadStarbucksInBounds(bounds);
      
      // Merge with existing stores, avoiding duplicates
      setStores(prevStores => {
        const existingIds = new Set(prevStores.map(s => s.id));
        const uniqueNew = newStores.filter(s => !existingIds.has(s.id));
        const merged = [...prevStores, ...uniqueNew];
        // Sort by distance if we have user location
        if (userLocation) {
          merged.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        }
        return merged;
      });
      setLoading(false);
    }, 500);
  };

  return (
    <div 
      className="prism-widget w-full md:w-[900px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': STARBUCKS_GREEN,
      } as React.CSSProperties}
    >
      <div className="flex flex-col md:flex-row md:h-[520px]">
        {/* Map - shown first on mobile */}
        <div className="min-w-0 h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || ''}
            center={mapCenter}
            zoom={mapZoom}
            minZoom={12}
            darkMode={darkMode}
            accentColor={STARBUCKS_GREEN}
            height="100%"
            markers={markers}
            onBoundsChange={handleBoundsChange}
          />
        </div>
        {/* Left Panel - Store list visible on mobile */}
        <div 
          className="w-full md:w-80 flex flex-col border-t md:border-t-0 md:border-r md:order-1 flex-1 md:flex-initial min-h-[300px] md:min-h-0"
          style={{ borderColor: 'var(--border-subtle)' }}
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
              onChange={(v) => {
                setSearchQuery(v);
                // Don't keep showing the previous "Your Location" marker while typing a new search.
                setUserLocation(null);
                setPendingLocation(null);
                setSelectedStore(null);
              }}
              onSelect={async (result) => {
                if (result.lat && result.lng) {
                  setSearchQuery(result.displayString);
                  // Use the coordinates from autocomplete directly instead of re-geocoding
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
                      {store.address && (
                        <div 
                          className="text-xs truncate mt-0.5"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {store.address}{store.city ? `, ${store.city}` : ''}
                        </div>
                      )}
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
