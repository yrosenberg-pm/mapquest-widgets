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
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
  maxResults = 10,
  onStoreSelect,
}: StoreLocatorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyStores, setNearbyStores] = useState<(StoreLocation & { distance?: number; duration?: number })[]>([]);
  const [selectedStore, setSelectedStore] = useState<(StoreLocation & { distance?: number; duration?: number }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';

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
      color: selectedStore?.id === store.id ? accentColor : '#6b7280',
    })),
  ];

  return (
    <div 
      className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} 
      style={{ minWidth: '900px', fontFamily, borderRadius }}
    >
      <div className="flex" style={{ height: '500px' }}>
        {/* Left Panel */}
        <div className={`w-80 flex flex-col border-r ${borderColor}`}>
          {/* Search */}
          <div className={`p-4 border-b ${borderColor}`}>
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
              style={{ borderRadius }}
            />
            <button
              onClick={searchLocation}
              disabled={loading || !searchQuery.trim()}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: accentColor, borderRadius }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? 'Searching...' : 'Find Stores'}
            </button>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {nearbyStores.length === 0 && !loading && (
              <div className={`p-4 text-center ${mutedText} text-sm`}>
                Enter your location to find nearby stores
              </div>
            )}
            {nearbyStores.map((store, idx) => (
              <button
                key={store.id}
                onClick={() => handleStoreSelect(store)}
                className={`w-full p-4 text-left border-b ${borderColor} transition-colors ${
                  selectedStore?.id === store.id 
                    ? darkMode ? 'bg-gray-700' : 'bg-blue-50'
                    : darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: selectedStore?.id === store.id ? accentColor : '#6b7280' }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${textColor}`}>{store.name}</div>
                    <div className={`text-sm ${mutedText}`}>{store.address}</div>
                    <div className={`text-sm ${mutedText}`}>{store.city}, {store.state} {store.zip}</div>
                    <div className="flex items-center gap-3 mt-1">
                      {store.distance !== undefined && (
                        <span className={`text-xs ${mutedText}`}>
                          {store.distance.toFixed(1)} mi
                        </span>
                      )}
                      {store.duration !== undefined && store.duration !== null && (
                        <span className={`text-xs font-medium`} style={{ color: accentColor }}>
                          {store.duration} min drive
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${mutedText} flex-shrink-0`} />
                </div>
              </button>
            ))}
          </div>

          {/* Selected Store Details */}
          {selectedStore && (
            <div className={`p-4 border-t ${borderColor} ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className={`font-medium ${textColor}`}>{selectedStore.name}</div>
                <button onClick={() => setSelectedStore(null)} className={mutedText}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className={`text-sm ${mutedText} space-y-1`}>
                <div>{selectedStore.address}</div>
                <div>{selectedStore.city}, {selectedStore.state} {selectedStore.zip}</div>
                {selectedStore.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {selectedStore.phone}
                  </div>
                )}
                {selectedStore.hours && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {selectedStore.hours}
                  </div>
                )}
              </div>
              <button
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: accentColor, borderRadius }}
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

      {showBranding && (
        <div className={`p-3 border-t ${borderColor} ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="flex items-center justify-center gap-3">
            {companyLogo && (
              <img 
                src={companyLogo} 
                alt={companyName || 'Company logo'} 
                className="h-6 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className={`text-xs ${mutedText}`}>
              {companyName && <span className="font-medium">{companyName} · </span>}
              Powered by <strong>MapQuest</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}