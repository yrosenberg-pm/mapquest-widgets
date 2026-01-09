// components/widgets/CitiBikeFinder.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Bike, Navigation, Loader2, ChevronRight, X, Clock } from 'lucide-react';
import { geocode } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

interface BikeStation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  availableBikes: number;
  availableEbikes: number;
  availableDocks: number;
  totalDocks: number;
  status: 'active' | 'maintenance' | 'offline';
  lastUpdated: string;
}

interface CitiBikeFinderProps {
  darkMode?: boolean;
  showBranding?: boolean;
  fontFamily?: string;
  defaultLocation?: { lat: number; lng: number };
  onStationSelect?: (station: BikeStation) => void;
}

// Citi Bike brand colors (from official logo)
const CITIBIKE_BLUE = '#0033A0';
const CITIBIKE_ORANGE = '#FF6B00'; // Orange dot on the 'i'
const LYFT_PINK = '#FF00BF';

// Generate mock Citi Bike stations around a location
const generateMockStations = (centerLat: number, centerLng: number, count: number = 30): BikeStation[] => {
  const stations: BikeStation[] = [];
  const streetNames = [
    'Broadway', 'Park Ave', 'Madison Ave', '5th Ave', 'Lexington Ave',
    'Amsterdam Ave', 'Columbus Ave', 'West End Ave', 'Central Park West',
    '1st Ave', '2nd Ave', '3rd Ave', 'York Ave', 'East End Ave',
    'Hudson St', 'Greenwich St', 'Varick St', 'Lafayette St', 'Bowery',
    'Canal St', 'Houston St', 'Bleecker St', 'Spring St', 'Prince St'
  ];
  
  const crossStreets = [
    '14th St', '23rd St', '34th St', '42nd St', '50th St', '59th St',
    '66th St', '72nd St', '79th St', '86th St', '96th St', '110th St',
    'Grand St', 'Delancey St', 'Rivington St', 'Stanton St', 'Broome St'
  ];

  for (let i = 0; i < count; i++) {
    // Spread stations within ~2 miles of center
    const latOffset = (Math.random() - 0.5) * 0.04;
    const lngOffset = (Math.random() - 0.5) * 0.05;
    
    const totalDocks = Math.floor(Math.random() * 30) + 15; // 15-45 docks
    const availableBikes = Math.floor(Math.random() * (totalDocks - 2));
    const availableEbikes = Math.floor(Math.random() * Math.min(5, availableBikes));
    const availableDocks = totalDocks - availableBikes;
    
    const statusRand = Math.random();
    const status: BikeStation['status'] = statusRand > 0.95 ? 'offline' : statusRand > 0.9 ? 'maintenance' : 'active';
    
    const street = streetNames[Math.floor(Math.random() * streetNames.length)];
    const cross = crossStreets[Math.floor(Math.random() * crossStreets.length)];
    
    stations.push({
      id: `station-${i + 1}`,
      name: `${street} & ${cross}`,
      address: `${street} & ${cross}`,
      lat: centerLat + latOffset,
      lng: centerLng + lngOffset,
      availableBikes: status === 'offline' ? 0 : availableBikes,
      availableEbikes: status === 'offline' ? 0 : availableEbikes,
      availableDocks: status === 'offline' ? 0 : availableDocks,
      totalDocks,
      status,
      lastUpdated: new Date(Date.now() - Math.floor(Math.random() * 300000)).toISOString(), // Within last 5 min
    });
  }
  
  return stations;
};

// Get status color
const getStatusColor = (station: BikeStation): string => {
  if (station.status === 'offline') return '#9CA3AF'; // gray
  if (station.status === 'maintenance') return '#F59E0B'; // amber
  if (station.availableBikes === 0) return '#EF4444'; // red - no bikes
  if (station.availableBikes <= 3) return '#F97316'; // orange - low bikes
  return '#22C55E'; // green - good availability
};

// Bike icon SVG for map markers
const BIKE_ICON_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <circle cx="16" cy="16" r="15" fill="${CITIBIKE_BLUE}" stroke="white" stroke-width="2"/>
  <g transform="translate(6, 8)" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="4" cy="10" r="3"/>
    <circle cx="16" cy="10" r="3"/>
    <path d="M4 10L7 4H12L10 10"/>
    <path d="M10 10L12 4L16 10"/>
    <circle cx="10" cy="4" r="1.5" fill="white"/>
  </g>
</svg>
`)}`;

export default function CitiBikeFinder({
  darkMode = false,
  showBranding = true,
  fontFamily,
  defaultLocation = { lat: 40.7580, lng: -73.9855 }, // Midtown Manhattan
  onStationSelect,
}: CitiBikeFinderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [stations, setStations] = useState<BikeStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<BikeStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tailwind classes for AddressAutocomplete
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  // Track if user has manually searched
  const hasSearchedRef = useRef(false);

  // Calculate distance between two points in miles
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

  // Load stations at a location
  const loadStationsAtLocation = (location: { lat: number; lng: number }) => {
    const newStations = generateMockStations(location.lat, location.lng, 35);
    
    // Add distance from user location
    const stationsWithDistance = newStations.map(station => ({
      ...station,
      distance: calculateDistance(location.lat, location.lng, station.lat, station.lng),
    })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
    
    setStations(stationsWithDistance as BikeStation[]);
  };

  // Initial load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!hasSearchedRef.current) {
            const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
            setUserLocation(loc);
            loadStationsAtLocation(loc);
          }
          setLoading(false);
        },
        () => {
          if (!hasSearchedRef.current) {
            setUserLocation(defaultLocation);
            loadStationsAtLocation(defaultLocation);
          }
          setLoading(false);
        },
        { timeout: 5000 }
      );
    } else {
      setUserLocation(defaultLocation);
      loadStationsAtLocation(defaultLocation);
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search at specific location
  const searchAtLocation = async (location: { lat: number; lng: number }) => {
    hasSearchedRef.current = true;
    setLoading(true);
    setError(null);
    
    try {
      setUserLocation(location);
      loadStationsAtLocation(location);
      setSelectedStation(null);
    } catch (err) {
      console.error('Search error:', err);
      setError('Error loading bike stations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Search by text query
  const searchStations = async () => {
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
      
      await searchAtLocation({ lat: result.lat, lng: result.lng });
    } catch (err) {
      console.error('Search error:', err);
      setError('Error searching for location. Please try again.');
      setLoading(false);
    }
  };

  const handleStationSelect = (station: BikeStation) => {
    setSelectedStation(station);
    onStationSelect?.(station);
  };

  const mapCenter = selectedStation 
    ? { lat: selectedStation.lat, lng: selectedStation.lng }
    : userLocation || defaultLocation;

  const markers = [
    ...(userLocation ? [{
      lat: userLocation.lat,
      lng: userLocation.lng,
      label: 'Your Location',
      color: '#3B82F6',
      type: 'home' as const,
    }] : []),
    ...stations.map((station) => ({
      lat: station.lat,
      lng: station.lng,
      label: `${station.name} • ${station.availableBikes} bikes`,
      iconUrl: BIKE_ICON_SVG,
      iconSize: [28, 28] as [number, number],
    })),
  ];

  // Format time ago
  const formatTimeAgo = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins === 1) return '1 min ago';
    return `${mins} mins ago`;
  };

  return (
    <div 
      className="prism-widget"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        minWidth: '900px', 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': CITIBIKE_BLUE,
      } as React.CSSProperties}
    >
      <div className="flex" style={{ height: '520px' }}>
        {/* Left Panel */}
        <div 
          className="w-80 flex flex-col"
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          {/* Header with Citi Bike + Lyft Branding */}
          <div 
            className="p-5"
            style={{ 
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: CITIBIKE_BLUE }}
              >
                <Bike className="w-6 h-6 text-white" />
              </div>
              <div>
                {/* Citi Bike logo text matching official branding */}
                <h3 
                  className="text-xl font-bold flex items-baseline"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  <span style={{ color: CITIBIKE_BLUE }}>cit</span>
                  <span style={{ color: CITIBIKE_BLUE, position: 'relative' }}>
                    i
                    <span 
                      style={{ 
                        position: 'absolute', 
                        top: '-2px', 
                        left: '50%', 
                        transform: 'translateX(-50%)',
                        width: '6px', 
                        height: '6px', 
                        borderRadius: '50%', 
                        background: CITIBIKE_ORANGE 
                      }} 
                    />
                  </span>
                  <span style={{ color: CITIBIKE_BLUE, marginLeft: '1px' }}>b</span>
                  <span style={{ color: CITIBIKE_BLUE }}>ike</span>
                </h3>
                <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  powered by <span style={{ color: LYFT_PINK, fontWeight: 600, fontStyle: 'italic' }}>lyft</span>
                </p>
              </div>
            </div>
            <AddressAutocomplete
              value={searchQuery}
              onChange={setSearchQuery}
              onSelect={async (result) => {
                if (result.lat && result.lng) {
                  setSearchQuery(result.displayString);
                  await searchAtLocation({ lat: result.lat, lng: result.lng });
                }
              }}
              placeholder="Enter address or neighborhood..."
              darkMode={darkMode}
              inputBg={inputBg}
              textColor={textColor}
              mutedText={mutedText}
              borderColor={borderColor}
            />
            <button
              onClick={searchStations}
              disabled={loading || !searchQuery.trim()}
              className="prism-btn prism-btn-primary w-full mt-4"
              style={{ 
                background: `linear-gradient(135deg, ${CITIBIKE_BLUE} 0%, ${LYFT_PINK} 100%)`,
                boxShadow: `0 4px 12px ${CITIBIKE_BLUE}40`,
              }}
            >
              {loading ? <Loader2 className="w-4 h-4 prism-spinner" /> : <Search className="w-4 h-4" />}
              {loading ? 'Finding Stations...' : 'Find Stations'}
            </button>
            {error && (
              <p 
                className="mt-3 text-sm font-medium px-3 py-2 rounded-lg"
                style={{ color: 'var(--color-error)', background: 'var(--color-error-bg)' }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Station List */}
          <div className="flex-1 overflow-y-auto prism-scrollbar">
            {stations.length === 0 && !loading && (
              <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                <div 
                  className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                  style={{ background: `${CITIBIKE_BLUE}15` }}
                >
                  <Bike className="w-5 h-5" style={{ color: CITIBIKE_BLUE }} />
                </div>
                Enter your location to find nearby stations
              </div>
            )}
            {stations.length > 0 && (
              <div 
                className="px-4 py-2 text-xs font-medium"
                style={{ color: 'var(--text-muted)', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' }}
              >
                {stations.length} stations nearby
              </div>
            )}
            {stations.map((station) => {
              const isSelected = selectedStation?.id === station.id;
              const statusColor = getStatusColor(station);
              
              return (
                <button
                  key={station.id}
                  onClick={() => handleStationSelect(station)}
                  className={`prism-list-item w-full text-left ${isSelected ? 'prism-list-item-selected' : ''}`}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Status indicator */}
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${statusColor}15` }}
                    >
                      <Bike className="w-5 h-5" style={{ color: statusColor }} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div 
                        className="font-semibold text-sm truncate"
                        style={{ color: 'var(--text-main)' }}
                      >
                        {station.name}
                      </div>
                      
                      {/* Availability badges - compact */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span 
                          className="text-[11px] px-2 py-0.5 rounded font-medium inline-flex items-center gap-1"
                          style={{ 
                            background: station.availableBikes > 0 ? '#22C55E15' : '#EF444415',
                            color: station.availableBikes > 0 ? '#22C55E' : '#EF4444',
                          }}
                        >
                          {station.availableBikes} <span>🚲</span>
                        </span>
                        {station.availableEbikes > 0 && (
                          <span 
                            className="text-[11px] px-2 py-0.5 rounded font-medium inline-flex items-center gap-1"
                            style={{ background: `${LYFT_PINK}15`, color: LYFT_PINK }}
                          >
                            {station.availableEbikes} <span>⚡</span>
                          </span>
                        )}
                        <span 
                          className="text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {station.availableDocks} open
                        </span>
                      </div>
                      
                      {station.status !== 'active' && (
                        <div 
                          className="text-xs mt-1 font-medium"
                          style={{ color: station.status === 'offline' ? '#9CA3AF' : '#F59E0B' }}
                        >
                          {station.status === 'offline' ? '⚠ Station Offline' : '🔧 Under Maintenance'}
                        </div>
                      )}
                    </div>
                    
                    <ChevronRight 
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: isSelected ? CITIBIKE_BLUE : 'var(--text-muted)' }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Station Details */}
          {selectedStation && (
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
                  {selectedStation.name}
                </div>
                <button 
                  onClick={() => setSelectedStation(null)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--bg-input)' }}
                >
                  <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
              
              {/* Detailed availability */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div 
                  className="p-3 rounded-lg text-center"
                  style={{ background: 'var(--bg-input)' }}
                >
                  <div className="text-xl font-bold" style={{ color: '#22C55E' }}>
                    {selectedStation.availableBikes}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Bikes</div>
                </div>
                <div 
                  className="p-3 rounded-lg text-center"
                  style={{ background: 'var(--bg-input)' }}
                >
                  <div className="text-xl font-bold" style={{ color: LYFT_PINK }}>
                    {selectedStation.availableEbikes}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>E-Bikes</div>
                </div>
                <div 
                  className="p-3 rounded-lg text-center"
                  style={{ background: 'var(--bg-input)' }}
                >
                  <div className="text-xl font-bold" style={{ color: 'var(--text-secondary)' }}>
                    {selectedStation.availableDocks}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Docks</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                <Clock className="w-3 h-3" />
                Updated {formatTimeAgo(selectedStation.lastUpdated)}
              </div>
              
              <button
                className="prism-btn prism-btn-primary w-full"
                style={{ 
                  background: `linear-gradient(135deg, ${CITIBIKE_BLUE} 0%, ${LYFT_PINK} 100%)`,
                }}
                onClick={() => {
                  window.open(
                    `https://www.mapquest.com/directions/to/${selectedStation.lat},${selectedStation.lng}`,
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
            zoom={15}
            minZoom={13}
            darkMode={darkMode}
            accentColor={CITIBIKE_BLUE}
            height="520px"
            markers={markers}
          />
        </div>
      </div>

      {/* Footer / Branding */}
      {showBranding && (
        <div className="prism-footer">
          <div className="flex items-center gap-2">
            <span className="flex items-baseline font-bold text-sm">
              <span style={{ color: CITIBIKE_BLUE }}>cit</span>
              <span style={{ color: CITIBIKE_BLUE, position: 'relative' }}>
                i
                <span 
                  style={{ 
                    position: 'absolute', 
                    top: '-1px', 
                    left: '50%', 
                    transform: 'translateX(-50%)',
                    width: '4px', 
                    height: '4px', 
                    borderRadius: '50%', 
                    background: CITIBIKE_ORANGE 
                  }} 
                />
              </span>
              <span style={{ color: CITIBIKE_BLUE }}>bike</span>
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              powered by <span style={{ color: LYFT_PINK, fontWeight: 600, fontStyle: 'italic' }}>lyft</span>
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}> · Powered by </span>
            <strong style={{ fontSize: '12px' }}>MapQuest</strong>
          </div>
        </div>
      )}
    </div>
  );
}
