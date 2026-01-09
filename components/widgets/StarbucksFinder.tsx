// components/widgets/StarbucksFinder.tsx
'use client';

import { useState } from 'react';
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
  onStoreSelect?: (store: StarbucksLocation) => void;
}

// Starbucks brand color
const STARBUCKS_GREEN = '#00704A';

export default function StarbucksFinder({
  darkMode = false,
  showBranding = true,
  fontFamily,
  maxResults = 10,
  searchRadius = 10,
  onStoreSelect,
}: StarbucksFinderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [stores, setStores] = useState<StarbucksLocation[]>([]);
  const [selectedStore, setSelectedStore] = useState<StarbucksLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const searchStarbucks = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    setStores([]);
    
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
      const starbucksResults = await searchPlaces(
        location.lat,
        location.lng,
        'q:starbucks',
        searchRadius,
        maxResults
      );
      
      if (starbucksResults.length === 0) {
        setError('No Starbucks locations found nearby. Try a different location.');
        setLoading(false);
        return;
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
      
      // Get drive times for closest stores (limit to first 5 for performance)
      const storesWithDuration = await Promise.all(
        storesList.slice(0, 5).map(async (store) => {
          const duration = await getDriveTime(location.lat, location.lng, store.lat, store.lng);
          return { ...store, duration: duration ?? undefined };
        })
      );
      
      // Combine with remaining stores (without duration)
      const allStores = [
        ...storesWithDuration,
        ...storesList.slice(5),
      ];
      
      setStores(allStores);
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

  const mapCenter = selectedStore 
    ? { lat: selectedStore.lat, lng: selectedStore.lng }
    : userLocation || { lat: 39.8283, lng: -98.5795 };

  const markers = [
    ...(userLocation ? [{
      lat: userLocation.lat,
      lng: userLocation.lng,
      label: 'Your Location',
      color: '#EF4444',
      type: 'home' as const,
    }] : []),
    ...stores.map((store, idx) => ({
      lat: store.lat,
      lng: store.lng,
      label: store.name,
      color: selectedStore?.id === store.id ? STARBUCKS_GREEN : '#1E3932',
    })),
  ];

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
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: STARBUCKS_GREEN }}
              >
                <Coffee className="w-5 h-5 text-white" />
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
            {stores.map((store, idx) => {
              const isSelected = selectedStore?.id === store.id;
              return (
                <button
                  key={store.id}
                  onClick={() => handleStoreSelect(store)}
                  className={`prism-list-item w-full text-left ${isSelected ? 'prism-list-item-selected' : ''}`}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{ 
                        background: isSelected ? STARBUCKS_GREEN : 'var(--bg-panel)',
                        color: isSelected ? 'white' : 'var(--text-secondary)',
                        border: isSelected ? 'none' : '1px solid var(--border-subtle)',
                        boxShadow: isSelected ? `0 2px 8px ${STARBUCKS_GREEN}40` : 'none',
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div 
                        className="font-semibold"
                        style={{ color: 'var(--text-main)' }}
                      >
                        {store.name}
                      </div>
                      {store.address && (
                        <div 
                          className="text-sm mt-0.5"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {store.address}
                        </div>
                      )}
                      {store.city && (
                        <div 
                          className="text-sm"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {store.city}{store.state ? `, ${store.state}` : ''}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {store.distance !== undefined && (
                          <span 
                            className="text-xs font-medium px-2 py-1 rounded-full"
                            style={{ 
                              color: 'var(--text-secondary)',
                              background: 'var(--bg-panel)',
                            }}
                          >
                            {store.distance.toFixed(1)} mi
                          </span>
                        )}
                        {store.duration !== undefined && store.duration !== null && (
                          <span 
                            className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={{ 
                              color: STARBUCKS_GREEN,
                              background: `${STARBUCKS_GREEN}15`,
                            }}
                          >
                            {store.duration} min drive
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight 
                      className="w-5 h-5 flex-shrink-0 mt-1"
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
          />
        </div>
      </div>

      {/* Footer / Branding */}
      {showBranding && (
        <div className="prism-footer">
          <span>
            <span style={{ fontWeight: 600, color: STARBUCKS_GREEN }}>Starbucks Finder</span>
            <span style={{ color: 'var(--text-muted)' }}> · Powered by </span>
            <strong>MapQuest</strong>
          </span>
        </div>
      )}
    </div>
  );
}
