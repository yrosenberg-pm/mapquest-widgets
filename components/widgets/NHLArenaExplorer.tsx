// components/widgets/NHLArenaExplorer.tsx
'use client';

import { useState, useEffect } from 'react';
import { Utensils, ParkingCircle, Cloud, Sun, CloudRain, Snowflake, Navigation, Search, Droplets, Wind, Star, Sparkles, ExternalLink, Moon, Hotel, Car, Bike, PersonStanding, Train } from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

const NHL_STADIUMS = [
  { id: 1, abbrev: 'ANA', team: 'Anaheim Ducks', arena: 'Honda Center', city: 'Anaheim', state: 'CA', lat: 33.8078, lng: -117.8765, capacity: 17174, color: '#F47A38', year: 1993, conference: 'Western', division: 'Pacific' },
  { id: 2, abbrev: 'BOS', team: 'Boston Bruins', arena: 'TD Garden', city: 'Boston', state: 'MA', lat: 42.3662, lng: -71.0621, capacity: 17850, color: '#FFB81C', year: 1995, conference: 'Eastern', division: 'Atlantic' },
  { id: 3, abbrev: 'BUF', team: 'Buffalo Sabres', arena: 'KeyBank Center', city: 'Buffalo', state: 'NY', lat: 42.8750, lng: -78.8764, capacity: 19070, color: '#003087', year: 1996, conference: 'Eastern', division: 'Atlantic' },
  { id: 4, abbrev: 'CGY', team: 'Calgary Flames', arena: 'Scotiabank Saddledome', city: 'Calgary', state: 'AB', lat: 51.0374, lng: -114.0519, capacity: 19289, color: '#D2001C', year: 1983, conference: 'Western', division: 'Pacific' },
  { id: 5, abbrev: 'CAR', team: 'Carolina Hurricanes', arena: 'PNC Arena', city: 'Raleigh', state: 'NC', lat: 35.8033, lng: -78.7220, capacity: 18680, color: '#CC0000', year: 1999, conference: 'Eastern', division: 'Metropolitan' },
  { id: 6, abbrev: 'CHI', team: 'Chicago Blackhawks', arena: 'United Center', city: 'Chicago', state: 'IL', lat: 41.8807, lng: -87.6742, capacity: 19717, color: '#CF0A2C', year: 1994, conference: 'Western', division: 'Central' },
  { id: 7, abbrev: 'COL', team: 'Colorado Avalanche', arena: 'Ball Arena', city: 'Denver', state: 'CO', lat: 39.7487, lng: -105.0077, capacity: 18007, color: '#6F263D', year: 1999, conference: 'Western', division: 'Central' },
  { id: 8, abbrev: 'CBJ', team: 'Columbus Blue Jackets', arena: 'Nationwide Arena', city: 'Columbus', state: 'OH', lat: 39.9691, lng: -83.0061, capacity: 18500, color: '#002654', year: 2000, conference: 'Eastern', division: 'Metropolitan' },
  { id: 9, abbrev: 'DAL', team: 'Dallas Stars', arena: 'American Airlines Center', city: 'Dallas', state: 'TX', lat: 32.7905, lng: -96.8103, capacity: 18532, color: '#006847', year: 2001, conference: 'Western', division: 'Central' },
  { id: 10, abbrev: 'DET', team: 'Detroit Red Wings', arena: 'Little Caesars Arena', city: 'Detroit', state: 'MI', lat: 42.3411, lng: -83.0553, capacity: 19515, color: '#CE1126', year: 2017, conference: 'Eastern', division: 'Atlantic' },
  { id: 11, abbrev: 'EDM', team: 'Edmonton Oilers', arena: 'Rogers Place', city: 'Edmonton', state: 'AB', lat: 53.5469, lng: -113.4979, capacity: 18347, color: '#FF4C00', year: 2016, conference: 'Western', division: 'Pacific' },
  { id: 12, abbrev: 'FLA', team: 'Florida Panthers', arena: 'Amerant Bank Arena', city: 'Sunrise', state: 'FL', lat: 26.1584, lng: -80.3256, capacity: 19250, color: '#041E42', year: 1998, conference: 'Eastern', division: 'Atlantic' },
  { id: 13, abbrev: 'LAK', team: 'Los Angeles Kings', arena: 'Crypto.com Arena', city: 'Los Angeles', state: 'CA', lat: 34.0430, lng: -118.2673, capacity: 18230, color: '#A2AAAD', year: 1999, conference: 'Western', division: 'Pacific' },
  { id: 14, abbrev: 'MIN', team: 'Minnesota Wild', arena: 'Xcel Energy Center', city: 'St. Paul', state: 'MN', lat: 44.9448, lng: -93.1010, capacity: 17954, color: '#154734', year: 2000, conference: 'Western', division: 'Central' },
  { id: 15, abbrev: 'MTL', team: 'Montreal Canadiens', arena: 'Bell Centre', city: 'Montreal', state: 'QC', lat: 45.4961, lng: -73.5693, capacity: 21302, color: '#AF1E2D', year: 1996, conference: 'Eastern', division: 'Atlantic' },
  { id: 16, abbrev: 'NSH', team: 'Nashville Predators', arena: 'Bridgestone Arena', city: 'Nashville', state: 'TN', lat: 36.1592, lng: -86.7785, capacity: 17159, color: '#FFB81C', year: 1996, conference: 'Western', division: 'Central' },
  { id: 17, abbrev: 'NJD', team: 'New Jersey Devils', arena: 'Prudential Center', city: 'Newark', state: 'NJ', lat: 40.7334, lng: -74.1713, capacity: 16514, color: '#CE1126', year: 2007, conference: 'Eastern', division: 'Metropolitan' },
  { id: 18, abbrev: 'NYI', team: 'New York Islanders', arena: 'UBS Arena', city: 'Elmont', state: 'NY', lat: 40.7170, lng: -73.7246, capacity: 17255, color: '#00539B', year: 2021, conference: 'Eastern', division: 'Metropolitan' },
  { id: 19, abbrev: 'NYR', team: 'New York Rangers', arena: 'Madison Square Garden', city: 'New York', state: 'NY', lat: 40.7505, lng: -73.9934, capacity: 18006, color: '#0038A8', year: 1968, conference: 'Eastern', division: 'Metropolitan' },
  { id: 20, abbrev: 'OTT', team: 'Ottawa Senators', arena: 'Canadian Tire Centre', city: 'Ottawa', state: 'ON', lat: 45.2969, lng: -75.9272, capacity: 18652, color: '#C52032', year: 1996, conference: 'Eastern', division: 'Atlantic' },
  { id: 21, abbrev: 'PHI', team: 'Philadelphia Flyers', arena: 'Wells Fargo Center', city: 'Philadelphia', state: 'PA', lat: 39.9012, lng: -75.1720, capacity: 19543, color: '#F74902', year: 1996, conference: 'Eastern', division: 'Metropolitan' },
  { id: 22, abbrev: 'PIT', team: 'Pittsburgh Penguins', arena: 'PPG Paints Arena', city: 'Pittsburgh', state: 'PA', lat: 40.4395, lng: -79.9892, capacity: 18387, color: '#FCB514', year: 2010, conference: 'Eastern', division: 'Metropolitan' },
  { id: 23, abbrev: 'SJS', team: 'San Jose Sharks', arena: 'SAP Center', city: 'San Jose', state: 'CA', lat: 37.3327, lng: -121.9012, capacity: 17562, color: '#006D75', year: 1993, conference: 'Western', division: 'Pacific' },
  { id: 24, abbrev: 'SEA', team: 'Seattle Kraken', arena: 'Climate Pledge Arena', city: 'Seattle', state: 'WA', lat: 47.6220, lng: -122.3540, capacity: 17100, color: '#99D9D9', year: 2021, conference: 'Western', division: 'Pacific' },
  { id: 25, abbrev: 'STL', team: 'St. Louis Blues', arena: 'Enterprise Center', city: 'St. Louis', state: 'MO', lat: 38.6268, lng: -90.2025, capacity: 18096, color: '#002F87', year: 1994, conference: 'Western', division: 'Central' },
  { id: 26, abbrev: 'TBL', team: 'Tampa Bay Lightning', arena: 'Amalie Arena', city: 'Tampa', state: 'FL', lat: 27.9428, lng: -82.4519, capacity: 19092, color: '#002868', year: 1996, conference: 'Eastern', division: 'Atlantic' },
  { id: 27, abbrev: 'TOR', team: 'Toronto Maple Leafs', arena: 'Scotiabank Arena', city: 'Toronto', state: 'ON', lat: 43.6435, lng: -79.3791, capacity: 18800, color: '#00205B', year: 1999, conference: 'Eastern', division: 'Atlantic' },
  { id: 28, abbrev: 'UTA', team: 'Utah Hockey Club', arena: 'Delta Center', city: 'Salt Lake City', state: 'UT', lat: 40.7683, lng: -111.9011, capacity: 18206, color: '#6CACE4', year: 1991, conference: 'Western', division: 'Central' },
  { id: 29, abbrev: 'VAN', team: 'Vancouver Canucks', arena: 'Rogers Arena', city: 'Vancouver', state: 'BC', lat: 49.2778, lng: -123.1089, capacity: 18910, color: '#00205B', year: 1995, conference: 'Western', division: 'Pacific' },
  { id: 30, abbrev: 'VGK', team: 'Vegas Golden Knights', arena: 'T-Mobile Arena', city: 'Las Vegas', state: 'NV', lat: 36.1029, lng: -115.1785, capacity: 17500, color: '#B4975A', year: 2016, conference: 'Western', division: 'Pacific' },
  { id: 31, abbrev: 'WSH', team: 'Washington Capitals', arena: 'Capital One Arena', city: 'Washington', state: 'DC', lat: 38.8981, lng: -77.0209, capacity: 18573, color: '#041E42', year: 1997, conference: 'Eastern', division: 'Metropolitan' },
  { id: 32, abbrev: 'WPG', team: 'Winnipeg Jets', arena: 'Canada Life Centre', city: 'Winnipeg', state: 'MB', lat: 49.8928, lng: -97.1437, capacity: 15321, color: '#041E42', year: 2004, conference: 'Western', division: 'Central' },
];

const getLogoUrl = (abbrev: string, darkMode: boolean) => 
  `https://assets.nhle.com/logos/nhl/svg/${abbrev}_${darkMode ? 'dark' : 'light'}.svg`;

const NHLShield = ({ className = "w-8 h-8" }: { className?: string }) => (
  <div className={`${className} bg-black rounded flex items-center justify-center`}>
    <span className="text-orange-500 font-black text-xs">NHL</span>
  </div>
);

interface NHLArenaExplorerProps {
  apiKey: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
}

export default function NHLArenaExplorer({ 
  apiKey, 
  darkMode: initialDarkMode = false,
  showBranding = true,
  companyName,
  companyLogo
}: NHLArenaExplorerProps) {
  const [selectedStadium, setSelectedStadium] = useState<typeof NHL_STADIUMS[0] | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [places, setPlaces] = useState<{ parking: any[]; food: any[]; hotels: any[] }>({ parking: [], food: [], hotels: [] });
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState<{ temp: number; condition: string; humidity: number; wind: number } | null>(null);
  const [darkMode, setDarkMode] = useState(initialDarkMode);
  const [fromAddress, setFromAddress] = useState('');
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string; mode: string } | null>(null);
  const [routeStart, setRouteStart] = useState<{ lat: number; lng: number } | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeType, setRouteType] = useState<'fastest' | 'pedestrian' | 'bicycle'>('fastest');

  const filteredStadiums = NHL_STADIUMS.filter(s => 
    s.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.arena.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  useEffect(() => {
    if (!selectedStadium) return;
    fetchPlaces(selectedStadium);
    setRouteInfo(null);
    setRouteStart(null);
    setWeather({ 
      temp: Math.floor(Math.random() * 30) + 30, 
      condition: ['Sunny', 'Cloudy', 'Rainy', 'Snowy'][Math.floor(Math.random() * 4)], 
      humidity: Math.floor(Math.random() * 40) + 40, 
      wind: Math.floor(Math.random() * 15) + 5 
    });
  }, [selectedStadium]);

  useEffect(() => {
    if (fromAddress && selectedStadium) {
      getDirections();
    } else {
      setRouteInfo(null);
      setRouteStart(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeType]);

  const fetchPlaces = async (stadium: typeof NHL_STADIUMS[0]) => {
    setLoading(true);
    try {
      const MQ_KEY = '78TTOXc0cKtnj1pSD71bHAaFrdU4EvHw';
      
      const fetchCategory = async (query: string) => {
        const url = 'https://www.mapquestapi.com/search/v4/place?key=' + MQ_KEY + '&location=' + stadium.lng + ',' + stadium.lat + '&sort=distance&q=' + encodeURIComponent(query) + '&limit=5';
        const res = await fetch(url);
        const data = await res.json();
        return data.results || [];
      };

      const [parkingResults, foodResults, hotelResults] = await Promise.all([
        fetchCategory('parking'),
        fetchCategory('restaurant'),
        fetchCategory('hotel'),
      ]);
      
      const formatResults = (results: any[]) => results.map(r => ({
        name: r.name,
        address: r.place?.properties?.street || r.displayString || 'Nearby',
        distance: r.distance ? (r.distance * 0.000621371).toFixed(1) + ' mi' : '—',
        lat: r.place?.geometry?.coordinates?.[1] || stadium.lat,
        lng: r.place?.geometry?.coordinates?.[0] || stadium.lng,
      }));

      setPlaces({
        parking: formatResults(parkingResults || []),
        food: formatResults(foodResults || []),
        hotels: formatResults(hotelResults || []),
      });
    } catch (err) {
      console.error('Error fetching places:', err);
      setPlaces({ parking: [], food: [], hotels: [] });
    }
    setLoading(false);
  };

  const getDirections = async () => {
    if (!fromAddress || !selectedStadium) return;
    setCalculatingRoute(true);
    setRouteInfo(null);
    setRouteStart(null);
    
    try {
      const MQ_KEY = '78TTOXc0cKtnj1pSD71bHAaFrdU4EvHw';
      
      const geocodeUrl = 'https://www.mapquestapi.com/geocoding/v1/address?key=' + MQ_KEY + '&location=' + encodeURIComponent(fromAddress);
      const geoRes = await fetch(geocodeUrl);
      const geoData = await geoRes.json();
      const fromLocation = geoData.results?.[0]?.locations?.[0]?.latLng;
      
      if (!fromLocation) {
        console.error('Could not geocode address');
        setCalculatingRoute(false);
        return;
      }
      
      setRouteStart({ lat: fromLocation.lat, lng: fromLocation.lng });
      
      const dirUrl = 'https://www.mapquestapi.com/directions/v2/route?key=' + MQ_KEY + '&from=' + fromLocation.lat + ',' + fromLocation.lng + '&to=' + selectedStadium.lat + ',' + selectedStadium.lng + '&routeType=' + routeType;
      const dirRes = await fetch(dirUrl);
      const dirData = await dirRes.json();
      
      if (dirData.route && dirData.route.distance) {
        const hours = Math.floor(dirData.route.time / 3600);
        const mins = Math.floor((dirData.route.time % 3600) / 60);
        const modeLabels: Record<string, string> = {
          'fastest': 'Driving',
          'pedestrian': 'Walking',
          'bicycle': 'Biking'
        };
        setRouteInfo({
          distance: dirData.route.distance.toFixed(1) + ' miles',
          duration: hours > 0 ? hours + 'h ' + mins + 'm' : mins + ' min',
          mode: modeLabels[routeType] || 'Driving'
        });
      }
    } catch (err) {
      console.error('Error getting directions:', err);
    }
    setCalculatingRoute(false);
  };

  const openDirectionsInMapQuest = () => {
    if (fromAddress && selectedStadium) {
      window.open('https://www.mapquest.com/directions/from/' + encodeURIComponent(fromAddress) + '/to/' + selectedStadium.lat + ',' + selectedStadium.lng, '_blank');
    }
  };

  const openInMapQuest = (lat: number, lng: number, name: string) => 
    window.open(`https://www.mapquest.com/search/${encodeURIComponent(name)}?lat=${lat}&lng=${lng}`, '_blank');

  const mapCenter = selectedStadium 
    ? { lat: selectedStadium.lat, lng: selectedStadium.lng }
    : { lat: 39.8283, lng: -98.5795 };

  const mapMarkers = (() => {
    const markers: Array<{ lat: number; lng: number; label: string; color?: string }> = [];
    
    if (routeStart) {
      markers.push({ 
        lat: routeStart.lat, 
        lng: routeStart.lng, 
        label: fromAddress || 'Starting Point',
        color: '#10b981'
      });
    }
    
    if (selectedStadium) {
      markers.push({ 
        lat: selectedStadium.lat, 
        lng: selectedStadium.lng, 
        label: selectedStadium.arena,
        color: selectedStadium.color
      });
    } else {
      markers.push(...NHL_STADIUMS.map(s => ({ 
        lat: s.lat, 
        lng: s.lng, 
        label: s.arena 
      })));
    }
    
    return markers;
  })();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Star },
    { id: 'parking', label: 'Parking', icon: ParkingCircle },
    { id: 'food', label: 'Food', icon: Utensils },
    { id: 'hotels', label: 'Hotels', icon: Hotel },
    { id: 'directions', label: 'Directions', icon: Navigation },
  ];

  const WeatherIcon = ({ condition }: { condition: string }) => {
    const icons: Record<string, any> = { Sunny: Sun, Cloudy: Cloud, Rainy: CloudRain, Snowy: Snowflake };
    const Icon = icons[condition] || Cloud;
    return <Icon className="w-8 h-8 text-orange-400" />;
  };

  const PlaceCard = ({ place, icon: Icon, color }: { place: any; icon: any; color: string }) => (
    <div 
      className="p-2.5 rounded-xl cursor-pointer group transition-all"
      style={{ 
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
      }}
      onClick={() => openInMapQuest(place.lat, place.lng, place.name)}
    >
      <div className="flex items-start gap-2.5">
        <div 
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 
            className="font-medium text-sm truncate group-hover:text-orange-400 transition-colors"
            style={{ color: 'var(--text-main)' }}
          >
            {place.name}
          </h4>
          <p 
            className="text-xs truncate"
            style={{ color: 'var(--text-muted)' }}
          >
            {place.address || 'Nearby'}
          </p>
          <span 
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            {place.distance || '—'}
          </span>
        </div>
        <ExternalLink 
          className="w-4 h-4 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
        />
      </div>
    </div>
  );

  return (
    <div 
      className="prism-widget"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        minWidth: '900px', 
        height: 650,
        '--brand-primary': '#F47A38',
      } as React.CSSProperties}
    >
      <div className="flex h-full">
        {/* Sidebar */}
        <div 
          className="w-64 flex flex-col"
          style={{ 
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel)',
          }}
        >
          <div 
            className="p-3"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <NHLShield className="w-7 h-7" />
                <span 
                  className="font-bold text-sm"
                  style={{ color: 'var(--text-main)' }}
                >
                  Arena Explorer
                </span>
              </div>
              <button 
                onClick={() => setDarkMode(!darkMode)} 
                className="p-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--bg-hover)' }}
              >
                {darkMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
              </button>
            </div>
            <div className="relative">
              <Search 
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--text-muted)' }}
              />
              <input 
                type="text" 
                placeholder="Search teams..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)}
                className="prism-input w-full pl-8 text-sm"
                style={{ height: '34px' }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto prism-scrollbar p-1.5 space-y-0.5">
            {filteredStadiums.map(s => (
              <button 
                key={s.id} 
                onClick={() => { setSelectedStadium(s); setActiveTab('overview'); }}
                className="w-full p-2 rounded-xl text-left transition-all"
                style={{
                  background: selectedStadium?.id === s.id ? 'rgba(244, 122, 56, 0.2)' : 'transparent',
                  border: selectedStadium?.id === s.id ? '1px solid rgba(244, 122, 56, 0.5)' : '1px solid transparent',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <img src={getLogoUrl(s.abbrev, darkMode)} alt={s.team} className="w-7 h-7 object-contain" />
                  <div className="min-w-0 flex-1">
                    <p 
                      className="font-medium text-xs truncate"
                      style={{ color: 'var(--text-main)' }}
                    >
                      {s.team}
                    </p>
                    <p 
                      className="text-xs truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {s.arena}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Map */}
          <div className="h-[220px]">
            <MapQuestMap
              apiKey={apiKey}
              center={mapCenter}
              zoom={selectedStadium ? 14 : 4}
              darkMode={darkMode}
              markers={mapMarkers}
              height="220px"
              showRoute={!!routeStart && !!selectedStadium}
              routeStart={routeStart || undefined}
              routeEnd={selectedStadium ? { lat: selectedStadium.lat, lng: selectedStadium.lng } : undefined}
              routeType={routeType}
              accentColor={selectedStadium?.color || '#F47A38'}
            />
          </div>
          
          {selectedStadium ? (
            <>
              {/* Header */}
              <div 
                className="px-3 py-2.5"
                style={{ 
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-widget)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img src={getLogoUrl(selectedStadium.abbrev, darkMode)} alt={selectedStadium.team} className="w-9 h-9 object-contain" />
                    <div>
                      <h2 
                        className="text-base font-bold"
                        style={{ color: 'var(--text-main)' }}
                      >
                        {selectedStadium.arena}
                      </h2>
                      <p 
                        className="text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {selectedStadium.city}, {selectedStadium.state}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => openInMapQuest(selectedStadium.lat, selectedStadium.lng, selectedStadium.arena)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> MapQuest
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div 
                className="flex gap-1 px-3 py-2 overflow-x-auto prism-scrollbar"
                style={{ 
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-panel)',
                }}
              >
                {tabs.map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => setActiveTab(t.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
                    style={{
                      background: activeTab === t.id ? '#F47A38' : 'transparent',
                      color: activeTab === t.id ? 'white' : 'var(--text-muted)',
                    }}
                  >
                    <t.icon className="w-3.5 h-3.5" />{t.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div 
                className="flex-1 overflow-y-auto prism-scrollbar p-3"
                style={{ background: 'var(--bg-widget)' }}
              >
                {activeTab === 'overview' && (
                  <div className="space-y-3">
                    {weather && (
                      <div 
                        className="p-3 rounded-xl"
                        style={{ 
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <h3 
                          className="text-xs font-semibold mb-2"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Current Weather
                        </h3>
                        <div className="flex items-center gap-3">
                          <WeatherIcon condition={weather.condition} />
                          <div>
                            <p 
                              className="text-xl font-bold"
                              style={{ color: 'var(--text-main)' }}
                            >
                              {weather.temp}°F
                            </p>
                            <p 
                              className="text-xs"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {weather.condition}
                            </p>
                          </div>
                          <div 
                            className="ml-auto text-xs space-y-1"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <p className="flex items-center gap-1"><Droplets className="w-3 h-3" />{weather.humidity}%</p>
                            <p className="flex items-center gap-1"><Wind className="w-3 h-3" />{weather.wind} mph</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div 
                      className="p-3 rounded-xl"
                      style={{ 
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <h3 
                        className="text-xs font-semibold mb-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Arena Info
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Capacity</p>
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>{selectedStadium.capacity?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Opened</p>
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>{selectedStadium.year}</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Conference</p>
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>{selectedStadium.conference}</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Division</p>
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>{selectedStadium.division}</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([['Parking', ParkingCircle, 'parking'], ['Food', Utensils, 'food'], ['Directions', Navigation, 'directions']] as const).map(([label, Icon, tab]) => {
                        const IconComponent = Icon as React.ComponentType<{ className?: string }>;
                        return (
                          <button 
                            key={tab} 
                            onClick={() => setActiveTab(tab)} 
                            className="p-2.5 rounded-xl transition-colors"
                            style={{ 
                              background: 'var(--bg-panel)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <IconComponent className="w-4 h-4 mx-auto mb-1 text-orange-400" />
                            <p 
                              className="text-xs font-medium"
                              style={{ color: 'var(--text-main)' }}
                            >
                              {label}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {['parking', 'food', 'hotels'].includes(activeTab) && (
                  <div className="space-y-2">
                    {loading ? (
                      <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>Loading...</div>
                    ) : places[activeTab as keyof typeof places]?.length ? (
                      places[activeTab as keyof typeof places].map((p, i) => (
                        <PlaceCard 
                          key={i} 
                          place={p} 
                          icon={activeTab === 'parking' ? ParkingCircle : activeTab === 'food' ? Utensils : Hotel} 
                          color={selectedStadium.color} 
                        />
                      ))
                    ) : (
                      <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>No results found</div>
                    )}
                  </div>
                )}

                {activeTab === 'directions' && (
                  <div className="space-y-3">
                    <div 
                      className="p-3 rounded-xl"
                      style={{ 
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <label 
                        className="text-xs font-medium block mb-2"
                        style={{ color: 'var(--text-main)' }}
                      >
                        Transportation Mode
                      </label>
                      <div className="grid grid-cols-4 gap-1.5 mb-3">
                        {[
                          { id: 'fastest' as const, label: 'Drive', icon: Car },
                          { id: 'pedestrian' as const, label: 'Walk', icon: PersonStanding },
                          { id: 'bicycle' as const, label: 'Bike', icon: Bike },
                          { id: 'transit' as const, label: 'Train', icon: Train, disabled: true }
                        ].map(({ id, label, icon: Icon, disabled }) => {
                          const IconComponent = Icon as React.ComponentType<{ className?: string }>;
                          const isTransit = id === 'transit';
                          const isSelected = !isTransit && routeType === id;
                          const handleClick = () => {
                            if (!disabled && !isTransit && (id === 'fastest' || id === 'pedestrian' || id === 'bicycle')) {
                              setRouteType(id);
                            }
                          };
                          return (
                            <button
                              key={id}
                              onClick={handleClick}
                              disabled={disabled || isTransit}
                              className="p-2.5 rounded-xl transition-all"
                              style={{
                                background: isSelected ? 'rgba(244, 122, 56, 0.2)' : 'var(--bg-hover)',
                                border: isSelected ? '1px solid rgba(244, 122, 56, 0.5)' : '1px solid var(--border-subtle)',
                                opacity: isTransit ? 0.5 : 1,
                                cursor: isTransit ? 'not-allowed' : 'pointer',
                              }}
                              title={isTransit ? 'Transit routing not available via MapQuest API' : ''}
                            >
                              <IconComponent 
                                className="w-4 h-4 mx-auto mb-1"
                                style={{ color: isSelected ? '#F47A38' : 'var(--text-muted)' }}
                              />
                              <p 
                                className="text-xs font-medium"
                                style={{ color: isSelected ? 'var(--text-main)' : 'var(--text-muted)' }}
                              >
                                {label}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                      <label 
                        className="text-xs font-medium block mb-1.5"
                        style={{ color: 'var(--text-main)' }}
                      >
                        Your Starting Location
                      </label>
                      <div className="flex gap-2">
                        <AddressAutocomplete
                          value={fromAddress}
                          onChange={setFromAddress}
                          placeholder="Enter address..."
                          darkMode={darkMode}
                          inputBg={inputBg}
                          textColor={textColor}
                          mutedText={mutedText}
                          borderColor={borderColor}
                          className="flex-1"
                          iconClassName="hidden"
                        />
                        <button 
                          onClick={getDirections} 
                          disabled={calculatingRoute || !fromAddress}
                          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                        >
                          {calculatingRoute ? '...' : 'Go'}
                        </button>
                      </div>
                    </div>
                    
                    {routeInfo && (
                      <div 
                        className="p-3 rounded-xl"
                        style={{ 
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      > 
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-success)' }} />
                          <span 
                            className="text-sm font-medium"
                            style={{ color: 'var(--text-main)' }}
                          >
                            Route Found ({routeInfo.mode})
                          </span>
                          <span 
                            className="text-xs ml-auto"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Shown on map
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div 
                            className="p-2.5 rounded-lg"
                            style={{ background: 'var(--bg-input)' }}
                          >
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Distance</p>
                            <p className="text-base font-bold" style={{ color: 'var(--text-main)' }}>{routeInfo.distance}</p>
                          </div>
                          <div 
                            className="p-2.5 rounded-lg"
                            style={{ background: 'var(--bg-input)' }}
                          >
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Est. Time</p>
                            <p className="text-base font-bold" style={{ color: 'var(--text-main)' }}>{routeInfo.duration}</p>
                          </div>
                        </div>
                        <button 
                          onClick={openDirectionsInMapQuest}
                          className="w-full py-2 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                          style={{ background: 'var(--color-success)' }}
                        >
                          <ExternalLink className="w-4 h-4" /> Open in MapQuest
                        </button>
                      </div>
                    )}
                    
                    {!routeInfo && !calculatingRoute && (
                      <div 
                        className="p-3 rounded-xl text-center"
                        style={{ 
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <Navigation className="w-7 h-7 mx-auto mb-2 text-orange-400" />
                        <p 
                          className="text-xs"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Enter your address to get directions to {selectedStadium.arena}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              {showBranding && (
                <div className="prism-footer">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                    <span>Powered by <strong>MapQuest</strong></span>
                  </div>
                  <span>NHL Arena Data</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div 
                  className="w-20 h-20 rounded-2xl mx-auto mb-3 flex items-center justify-center p-3"
                  style={{ background: darkMode ? 'white' : 'var(--text-main)' }}
                >
                  <NHLShield className="w-14 h-14" />
                </div>
                <p 
                  className="font-semibold text-base mb-1"
                  style={{ color: 'var(--text-main)' }}
                >
                  Select an Arena
                </p>
                <p 
                  className="text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Choose a team to explore
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
