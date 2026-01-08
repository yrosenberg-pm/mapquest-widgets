// components/widgets/StoreLocator.tsx
'use client';

import { useState } from 'react';
import { Search, Phone, Clock, Navigation, Loader2, ChevronRight, X } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

interface StoreLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  phone?: string;
  hours?: string;
}

interface StoreLocatorProps {
  stores: StoreLocation[];
  apiKey: string;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  maxResults?: number;
  onStoreSelect?: (store: StoreLocation & { distance?: number; duration?: number }) => void;
}

export default function StoreLocator({
  stores,
  apiKey,
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  maxResults = 10,
  onStoreSelect,
}: StoreLocatorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyStores, setNearbyStores] = useState<(StoreLocation & { distance?: number; duration?: number })[]>([]);
  const [selectedStore, setSelectedStore] = useState<(StoreLocation & { distance?: number; duration?: number }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  // === ALL FUNCTIONAL LOGIC UNCHANGED BELOW ===
  
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getDriveTime = async (fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<number | null> => {
    try {
      const route = await getDirections(
        `${fromLat},${fromLng}`,
        `${toLat},${toLng}`
      );
      
      if (!route || (route as any).routeError) {
        return null;
      }
      
      return Math.round(route.time / 60);
    } catch (err) {
      return null;
    }
  };

  const searchLocation = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await geocode(searchQuery);
      
      if (!result || !result.lat || !result.lng) {
        setError('Location not found. Please try a different address.');
        setLoading(false);
        return;
      }
      
      const location = { lat: result.lat, lng: result.lng };
      setUserLocation(location);
      
      const storesWithDistance = stores.map(store => ({
        ...store,
        distance: calculateDistance(location.lat, location.lng, store.lat, store.lng),
      }));
      
      const sorted = storesWithDistance
        .sort((a, b) => (a.distance || 0) - (b.distance || 0))
        .slice(0, maxResults);
      
      const withDuration = await Promise.all(
        sorted.map(async (store) => {
          const duration = await getDriveTime(location.lat, location.lng, store.lat, store.lng);
          return { ...store, duration: duration ?? undefined };
        })
      );
      
      setNearbyStores(withDuration);
      setSelectedStore(null);
    } catch (err) {
      setError('Error searching location. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStoreSelect = (store: StoreLocation & { distance?: number; duration?: number }) => {
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
      title: 'Your Location',
      color: '#10b981',
    }] : []),
    ...nearbyStores.map((store, idx) => ({
      lat: store.lat,
      lng: store.lng,
      title: store.name,
      label: String(idx + 1),
      color: selectedStore?.id === store.id ? accentColor : '#64748B',
    })),
  ];

  // === END FUNCTIONAL LOGIC ===

  return (
    <div 
      className="prism-widget"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        minWidth: '900px', 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className="flex" style={{ height: '500px' }}>
        {/* Left Panel */}
        <div 
          className="w-80 flex flex-col"
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          {/* Search Header */}
          <div 
            className="p-5"
            style={{ 
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <h3 
              className="text-lg font-bold mb-3"
              style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
            >
              Find a Store
            </h3>
            <AddressAutocomplete
              value={searchQuery}
              onChange={setSearchQuery}
              onSelect={(result) => {
                if (result.lat && result.lng) {
                  setUserLocation({ lat: result.lat, lng: result.lng });
                  searchLocation();
                }
              }}
              placeholder="Enter city, zip, or address..."
              darkMode={darkMode}
              inputBg={inputBg}
              textColor={textColor}
              mutedText={mutedText}
              borderColor={borderColor}
            />
            <button
              onClick={searchLocation}
              disabled={loading || !searchQuery.trim()}
              className="prism-btn prism-btn-primary w-full mt-4"
              style={{ 
                '--brand-primary': accentColor,
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                boxShadow: `0 4px 12px ${accentColor}40`,
              } as React.CSSProperties}
            >
              {loading ? <Loader2 className="w-4 h-4 prism-spinner" /> : <Search className="w-4 h-4" />}
              {loading ? 'Searching...' : 'Find Stores'}
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
            {nearbyStores.length === 0 && !loading && (
              <div 
                className="p-6 text-center text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                <div 
                  className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                  style={{ background: 'var(--bg-panel)' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}><Search className="w-5 h-5" /></span>
                </div>
                Enter your location to find nearby stores
              </div>
            )}
            {nearbyStores.map((store, idx) => {
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
                      className={`prism-number-badge ${isSelected ? 'prism-number-badge-active' : ''}`}
                      style={isSelected ? { 
                        background: accentColor,
                        boxShadow: `0 2px 8px ${accentColor}40`,
                      } : {}}
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
                      <div 
                        className="text-sm mt-0.5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {store.address}
                      </div>
                      <div 
                        className="text-sm"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {store.city}, {store.state} {store.zip}
                      </div>
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
                              color: accentColor,
                              background: `${accentColor}15`,
                            }}
                          >
                            {store.duration} min drive
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight 
                      className="w-5 h-5 flex-shrink-0 mt-1"
                      style={{ color: isSelected ? accentColor : 'var(--text-muted)' }}
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
                <div>{selectedStore.address}</div>
                <div>{selectedStore.city}, {selectedStore.state} {selectedStore.zip}</div>
                {selectedStore.phone && (
                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-muted)' }}><Phone className="w-4 h-4" /></span>
                    <span className="font-medium">{selectedStore.phone}</span>
                  </div>
                )}
                {selectedStore.hours && (
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-muted)' }}><Clock className="w-4 h-4" /></span>
                    <span>{selectedStore.hours}</span>
                  </div>
                )}
              </div>
              <button
                className="prism-btn prism-btn-primary w-full mt-4"
                style={{ 
                  background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                  boxShadow: `0 4px 12px ${accentColor}40`,
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
            apiKey={apiKey}
            center={mapCenter}
            zoom={nearbyStores.length > 0 ? 11 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="500px"
            markers={markers}
          />
        </div>
      </div>

      {/* Footer / Branding */}
      {showBranding && (
        <div className="prism-footer">
          {companyLogo && (
            <img 
              src={companyLogo} 
              alt={companyName || 'Company logo'} 
              className="prism-footer-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span>
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by <strong>MapQuest</strong>
          </span>
        </div>
      )}
    </div>
  );
}
