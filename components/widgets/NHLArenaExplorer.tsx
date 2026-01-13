// components/widgets/NHLArenaExplorer.tsx
'use client';

import { useState, useEffect } from 'react';
import { Utensils, ParkingCircle, Cloud, Sun, CloudRain, Snowflake, Navigation, Search, Droplets, Wind, Star, ExternalLink, Hotel, Car, Bike, PersonStanding, Train } from 'lucide-react';
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
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  searchRadius?: number; // Search radius in miles (default: 5)
}

export default function NHLArenaExplorer({ 
  apiKey, 
  accentColor = '#F47A38',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  borderRadius,
  searchRadius = 5,
}: NHLArenaExplorerProps) {
  const [selectedStadium, setSelectedStadium] = useState<typeof NHL_STADIUMS[0] | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [places, setPlaces] = useState<{ parking: any[]; food: any[]; hotels: any[] }>({ parking: [], food: [], hotels: [] });
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState<{ temp: number; condition: string; humidity: number; wind: number } | null>(null);
  const [fromAddress, setFromAddress] = useState('');
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string; mode: string } | null>(null);
  const [routeStart, setRouteStart] = useState<{ lat: number; lng: number } | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeType, setRouteType] = useState<'fastest' | 'pedestrian' | 'bicycle' | 'transit'>('fastest');
  const [transitPolyline, setTransitPolyline] = useState<{ lat: number; lng: number }[]>([]);
  const [transitSteps, setTransitSteps] = useState<{ type: string; instruction: string; duration: string; lineName?: string }[]>([]);
  const [transitSegments, setTransitSegments] = useState<{ type: string; coords: { lat: number; lng: number }[] }[]>([]);

  const filteredStadiums = NHL_STADIUMS.filter(s => 
    s.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.arena.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // HERE Flexible Polyline decoder
  const decodeFlexiblePolyline = (encoded: string): { lat: number; lng: number }[] => {
    const DECODING_TABLE: Record<string, number> = {};
    const ENCODING_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < ENCODING_CHARS.length; i++) {
      DECODING_TABLE[ENCODING_CHARS[i]] = i;
    }
    
    const decodeUnsignedVarint = (pos: { index: number }): number => {
      let result = 0;
      let shift = 0;
      while (pos.index < encoded.length) {
        const value = DECODING_TABLE[encoded[pos.index]];
        if (value === undefined) break;
        result |= (value & 0x1F) << shift;
        pos.index++;
        if ((value & 0x20) === 0) break;
        shift += 5;
      }
      return result;
    };
    
    const decodeSignedVarint = (pos: { index: number }): number => {
      const value = decodeUnsignedVarint(pos);
      return (value >> 1) ^ (-(value & 1));
    };
    
    const coordinates: { lat: number; lng: number }[] = [];
    const pos = { index: 0 };
    
    // Read header
    decodeUnsignedVarint(pos); // version
    const header = decodeUnsignedVarint(pos);
    const precision = header & 0x0F;
    const thirdDimType = (header >> 8) & 0x07;
    const multiplier = Math.pow(10, precision);
    
    let lat = 0, lng = 0;
    while (pos.index < encoded.length) {
      lat += decodeSignedVarint(pos);
      if (pos.index >= encoded.length) break;
      lng += decodeSignedVarint(pos);
      if (thirdDimType !== 0 && pos.index < encoded.length) {
        decodeSignedVarint(pos); // skip third dimension
      }
      coordinates.push({ lat: lat / multiplier, lng: lng / multiplier });
    }
    return coordinates;
  };

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
    fetchWeather(selectedStadium.lat, selectedStadium.lng);
  }, [selectedStadium]);

  const fetchWeather = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/here?endpoint=weather&latitude=${lat}&longitude=${lng}&product=observation`);
      const data = await res.json();
      
      if (data?.observations?.location?.[0]?.observation?.[0]) {
        const obs = data.observations.location[0].observation[0];
        
        // Map HERE weather icon codes to our conditions
        const iconCode = obs.iconName || '';
        let condition = 'Cloudy';
        if (iconCode.includes('sunny') || iconCode.includes('clear')) condition = 'Sunny';
        else if (iconCode.includes('rain') || iconCode.includes('shower')) condition = 'Rainy';
        else if (iconCode.includes('snow') || iconCode.includes('flurr')) condition = 'Snowy';
        else if (iconCode.includes('cloud') || iconCode.includes('overcast')) condition = 'Cloudy';
        
        setWeather({
          temp: Math.round(parseFloat(obs.temperature) || 50),
          condition,
          humidity: Math.round(parseFloat(obs.humidity) || 50),
          wind: Math.round(parseFloat(obs.windSpeed) || 5),
        });
      } else {
        // Fallback if API fails
        setWeather({ temp: 55, condition: 'Cloudy', humidity: 50, wind: 8 });
      }
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      // Fallback weather
      setWeather({ temp: 55, condition: 'Cloudy', humidity: 50, wind: 8 });
    }
  };

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
      const radiusMeters = searchRadius * 1609.34; // Convert miles to meters
      
      const fetchCategory = async (query: string) => {
        // Use circle filter with configurable radius and fetch more results
        const url = `https://www.mapquestapi.com/search/v4/place?key=${MQ_KEY}&location=${stadium.lng},${stadium.lat}&sort=distance&q=${encodeURIComponent(query)}&limit=20&circle=${stadium.lng},${stadium.lat},${radiusMeters}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.results || [];
      };

      const [parkingResults, foodResults, hotelResults] = await Promise.all([
        fetchCategory('parking'),
        fetchCategory('restaurant'),
        fetchCategory('hotel'),
      ]);
      
      const formatResults = (results: any[]) => results
        .map(r => {
          const distanceMeters = r.distance || 0;
          const distanceMiles = distanceMeters * 0.000621371;
          return {
            name: r.name,
            address: r.place?.properties?.street || r.displayString || 'Nearby',
            distance: distanceMiles > 0 ? distanceMiles.toFixed(1) + ' mi' : '—',
            distanceNum: distanceMiles,
            lat: r.place?.geometry?.coordinates?.[1] || stadium.lat,
            lng: r.place?.geometry?.coordinates?.[0] || stadium.lng,
          };
        })
        // Filter to only include results within the search radius
        .filter(r => r.distanceNum <= searchRadius)
        // Sort by distance
        .sort((a, b) => a.distanceNum - b.distanceNum);

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
    setTransitPolyline([]);
    setTransitSteps([]);
    setTransitSegments([]);
    
    try {
      const MQ_KEY = '78TTOXc0cKtnj1pSD71bHAaFrdU4EvHw';
      
      // First geocode the from address using MapQuest
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
      
      if (routeType === 'transit') {
        // Use HERE Intermodal API for transit routing
        console.log('Transit routing from:', fromLocation, 'to:', selectedStadium.arena, selectedStadium.lat, selectedStadium.lng);
        
        const hereParams = new URLSearchParams({
          endpoint: 'transit',
          origin: `${fromLocation.lat},${fromLocation.lng}`,
          destination: `${selectedStadium.lat},${selectedStadium.lng}`,
          departureTime: new Date().toISOString(),
        });
        
        const hereRes = await fetch(`/api/here?${hereParams}`);
        const hereData = await hereRes.json();
        
        console.log('HERE Transit Response:', hereData);
        
        console.log('HERE Transit Full Response:', JSON.stringify(hereData, null, 2));
        
        if (hereData.error) {
          console.error('HERE API Error:', hereData.error, hereData.details);
          setRouteInfo({
            distance: '—',
            duration: '—',
            mode: 'Transit error: ' + (hereData.error || 'Unknown error')
          });
        } else if (!hereData.routes && Object.keys(hereData).length === 0) {
          // Empty response - likely API key doesn't have transit enabled
          console.error('Empty response from HERE Transit API - Transit service may not be enabled for this API key');
          setRouteInfo({
            distance: '—',
            duration: '—',
            mode: 'Transit not available (API access required)'
          });
        } else if (hereData.routes && hereData.routes.length > 0) {
          const route = hereData.routes[0];
          const sections = route.sections || [];
          
          // Sum up all sections for total distance and duration
          let totalLength = 0;
          let totalDuration = 0;
          const transitModes: string[] = [];
          const transitLines: string[] = [];
          const allPolylineCoords: { lat: number; lng: number }[] = [];
          const steps: { type: string; instruction: string; duration: string; lineName?: string }[] = [];
          const segments: { type: string; coords: { lat: number; lng: number }[] }[] = [];
          
          // Mode name mapping (public transit only - no taxi/car)
          const modeNameMap: Record<string, string> = {
            'pedestrian': 'Walk',
            'subway': 'Subway',
            'bus': 'Bus', 
            'train': 'Train',
            'regionalTrain': 'Regional Train',
            'intercityTrain': 'Intercity Train',
            'highSpeedTrain': 'High Speed Train',
            'ferry': 'Ferry',
            'tram': 'Tram',
            'lightRail': 'Light Rail',
            'monorail': 'Monorail',
            'metro': 'Metro',
            'rail': 'Rail',
          };
          
          sections.forEach((section: any) => {
            const sectionType = section.type || 'unknown';
            const sectionDuration = section.travelSummary?.duration || section.summary?.duration || 0;
            const durationMins = Math.ceil(sectionDuration / 60);
            
            // Use travelSummary for intermodal routes
            if (section.travelSummary) {
              totalLength += section.travelSummary.length || 0;
              totalDuration += section.travelSummary.duration || 0;
            } else if (section.summary) {
              totalLength += section.summary.length || 0;
              totalDuration += section.summary.duration || 0;
            }
            
            // Track the transport types used (exclude 'pedestrian' from main display)
            if (sectionType && sectionType !== 'pedestrian') {
              transitModes.push(sectionType);
            }
            
            // Extract transit line names from transport info
            const lineName = section.transport?.name || section.transport?.shortName || section.transport?.headsign;
            if (lineName) {
              transitLines.push(lineName);
            }
            
            // Build step instruction
            const friendlyMode = modeNameMap[sectionType] || sectionType.charAt(0).toUpperCase() + sectionType.slice(1);
            let instruction = '';
            
            if (sectionType === 'pedestrian') {
              const distMeters = section.travelSummary?.length || section.summary?.length || 0;
              const distFeet = Math.round(distMeters * 3.28084);
              instruction = `Walk ${distFeet > 1000 ? (distMeters / 1609.34).toFixed(1) + ' mi' : distFeet + ' ft'}`;
            } else if (lineName) {
              instruction = `Take ${friendlyMode}: ${lineName}`;
              if (section.transport?.headsign && section.transport.headsign !== lineName) {
                instruction += ` toward ${section.transport.headsign}`;
              }
            } else {
              instruction = `${friendlyMode}`;
            }
            
            // Add departure/arrival info if available
            if (section.departure?.place?.name) {
              instruction += ` from ${section.departure.place.name}`;
            }
            if (section.arrival?.place?.name && sectionType !== 'pedestrian') {
              instruction += ` to ${section.arrival.place.name}`;
            }
            
            steps.push({
              type: sectionType,
              instruction,
              duration: durationMins > 0 ? `${durationMins} min` : '',
              lineName: lineName || undefined,
            });
            
            // Decode and collect polyline coordinates from each section
            if (section.polyline) {
              try {
                const coords = decodeFlexiblePolyline(section.polyline);
                allPolylineCoords.push(...coords);
                segments.push({ type: sectionType, coords });
              } catch (e) {
                console.error('Failed to decode polyline:', e);
              }
            }
          });
          
          // Store the combined polyline and segments for map display
          if (allPolylineCoords.length > 0) {
            setTransitPolyline(allPolylineCoords);
          }
          setTransitSegments(segments);
          setTransitSteps(steps);
          
          if (totalDuration > 0) {
            const distanceMiles = (totalLength / 1000) * 0.621371;
            const hours = Math.floor(totalDuration / 3600);
            const mins = Math.floor((totalDuration % 3600) / 60);
            
            // Build mode description - show transit types (not pedestrian)
            const uniqueModes = [...new Set(transitModes)];
            const uniqueLines = [...new Set(transitLines)];
            
            let modeLabel = 'Transit';
            if (uniqueModes.length > 0) {
              const modeNames = uniqueModes.map(m => modeNameMap[m] || m.charAt(0).toUpperCase() + m.slice(1));
              modeLabel = modeNames.join(' + ');
            }
            if (uniqueLines.length > 0) {
              modeLabel += ` (${uniqueLines.slice(0, 2).join(', ')})`;
            }
            
            setRouteInfo({
              distance: distanceMiles.toFixed(1) + ' miles',
              duration: hours > 0 ? hours + 'h ' + mins + 'm' : mins + ' min',
              mode: modeLabel
            });
          } else {
            setRouteInfo({
              distance: '—',
              duration: '—',
              mode: 'Transit unavailable for this route'
            });
          }
        } else {
          console.error('No transit route found in response:', hereData);
          // Check if there are notices or other info in response
          if (hereData.notices) {
            console.log('HERE API Notices:', hereData.notices);
          }
          setRouteInfo({
            distance: '—',
            duration: '—',
            mode: 'No transit route found'
          });
        }
      } else {
        // Use MapQuest for other modes
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
    const markers: Array<{ lat: number; lng: number; label: string; color?: string; type?: 'home' | 'poi' }> = [];
    
    if (routeStart) {
      markers.push({ 
        lat: routeStart.lat, 
        lng: routeStart.lng, 
        label: fromAddress || 'Starting Point',
        color: '#10b981',
        type: 'home'
      });
    }
    
    if (selectedStadium) {
      // Stadium marker
      markers.push({ 
        lat: selectedStadium.lat, 
        lng: selectedStadium.lng, 
        label: selectedStadium.arena,
        color: selectedStadium.color
      });
      
      // POI markers based on active tab (or show all if on overview/directions)
      const showAllPOIs = activeTab === 'overview' || activeTab === 'directions';
      
      // Parking markers (blue)
      if (showAllPOIs || activeTab === 'parking') {
        places.parking.forEach(p => {
          if (p.lat && p.lng) {
            markers.push({
              lat: p.lat,
              lng: p.lng,
              label: `🅿️ ${p.name}`,
              color: '#3b82f6',
              type: 'poi'
            });
          }
        });
      }
      
      // Food markers (orange/red)
      if (showAllPOIs || activeTab === 'food') {
        places.food.forEach(p => {
          if (p.lat && p.lng) {
            markers.push({
              lat: p.lat,
              lng: p.lng,
              label: `🍽️ ${p.name}`,
              color: '#f97316',
              type: 'poi'
            });
          }
        });
      }
      
      // Hotel markers (purple)
      if (showAllPOIs || activeTab === 'hotels') {
        places.hotels.forEach(p => {
          if (p.lat && p.lng) {
            markers.push({
              lat: p.lat,
              lng: p.lng,
              label: `🏨 ${p.name}`,
              color: '#8b5cf6',
              type: 'poi'
            });
          }
        });
      }
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
          <span style={{ color }}><Icon className="w-4 h-4" /></span>
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
        <span style={{ color: 'var(--text-muted)' }}>
          <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
        </span>
      </div>
    </div>
  );

  return (
    <div 
      className="prism-widget w-full lg:max-w-[900px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        '--brand-primary': accentColor,
        fontFamily: fontFamily || undefined,
        borderRadius: borderRadius || undefined,
      } as React.CSSProperties}
    >
      <div className="flex flex-col-reverse lg:flex-row min-h-[550px] lg:h-[675px]">
        {/* Sidebar */}
        <div 
          className="w-full lg:w-64 flex flex-col border-t lg:border-t-0 lg:border-r"
          style={{ 
            borderColor: 'var(--border-subtle)',
            background: 'var(--bg-panel)',
          }}
        >
          <div 
            className="p-3 pb-3.5"
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
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                <Search className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                placeholder="Search teams..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)}
                className="prism-input w-full text-sm"
                style={{ height: '36px', paddingLeft: '42px' }}
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
                  background: selectedStadium?.id === s.id ? `${accentColor}33` : 'transparent',
                  border: selectedStadium?.id === s.id ? `1px solid ${accentColor}80` : '1px solid transparent',
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
        <div className="flex-1 flex flex-col min-h-[300px] lg:min-h-0">
          {/* Map */}
          <div className="h-[180px] lg:h-[220px]">
            <MapQuestMap
              apiKey={apiKey}
              center={mapCenter}
              zoom={selectedStadium ? 14 : 4}
              darkMode={darkMode}
              markers={mapMarkers}
              height="100%"
              showRoute={!!routeStart && !!selectedStadium && routeType !== 'transit'}
              routeStart={routeStart || undefined}
              routeEnd={selectedStadium ? { lat: selectedStadium.lat, lng: selectedStadium.lng } : undefined}
              routeType={routeType === 'transit' ? undefined : routeType}
              transitSegments={routeType === 'transit' && transitSegments.length > 0 ? transitSegments : undefined}
              routePolyline={routeType === 'transit' && transitSegments.length === 0 ? transitPolyline : undefined}
              accentColor={selectedStadium?.color || accentColor}
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
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium transition-colors hover:opacity-90"
                    style={{ backgroundColor: accentColor }}
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
                      background: activeTab === t.id ? accentColor : 'transparent',
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
                          { id: 'transit' as const, label: 'Transit', icon: Train }
                        ].map(({ id, label, icon: Icon }) => {
                          const IconComponent = Icon as React.ComponentType<{ className?: string }>;
                          const isSelected = routeType === id;
                          return (
                            <button
                              key={id}
                              onClick={() => setRouteType(id)}
                              className="p-2.5 rounded-xl transition-all"
                              style={{
                                background: isSelected ? `${accentColor}33` : 'var(--bg-hover)',
                                border: isSelected ? `1px solid ${accentColor}80` : '1px solid var(--border-subtle)',
                              }}
                              title={id === 'transit' ? 'Public transit via HERE API' : ''}
                            >
                              <span style={{ color: isSelected ? accentColor : 'var(--text-muted)' }}>
                                <IconComponent className="w-4 h-4 mx-auto mb-1" />
                              </span>
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
                          className="px-4 py-2 rounded-lg disabled:opacity-50 text-white text-sm font-medium transition-colors hover:opacity-90"
                          style={{ backgroundColor: accentColor }}
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
                        
                        {/* Step-by-step directions for transit */}
                        {routeType === 'transit' && transitSteps.length > 0 && (
                          <div className="mb-3">
                            <p 
                              className="text-xs font-medium mb-2"
                              style={{ color: 'var(--text-main)' }}
                            >
                              Directions
                            </p>
                            <div 
                              className="space-y-1.5 max-h-32 overflow-y-auto prism-scrollbar rounded-lg"
                              style={{ background: 'var(--bg-input)', padding: '8px' }}
                            >
                              {transitSteps.map((step, i) => {
                                const stepColors: Record<string, string> = {
                                  pedestrian: '#6B7280',
                                  subway: '#8B5CF6',
                                  metro: '#8B5CF6',
                                  bus: '#F59E0B',
                                  train: '#3B82F6',
                                  rail: '#3B82F6',
                                  regionalTrain: '#3B82F6',
                                  intercityTrain: '#1D4ED8',
                                  highSpeedTrain: '#1D4ED8',
                                  lightRail: '#10B981',
                                  tram: '#10B981',
                                  ferry: '#0EA5E9',
                                  monorail: '#8B5CF6',
                                };
                                const color = stepColors[step.type] || 'var(--text-muted)';
                                const isDotted = step.type === 'pedestrian' || step.type === 'subway';
                                
                                return (
                                  <div 
                                    key={i} 
                                    className="flex items-start gap-2 text-xs py-1"
                                  >
                                    <div className="flex flex-col items-center pt-0.5">
                                      <div 
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: color }}
                                      />
                                      {i < transitSteps.length - 1 && (
                                        <div 
                                          className="w-0.5 h-4 mt-1"
                                          style={{ 
                                            backgroundColor: color,
                                            opacity: 0.5,
                                            ...(isDotted ? { 
                                              backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0px, ${color} 2px, transparent 2px, transparent 4px)`,
                                              backgroundColor: 'transparent'
                                            } : {})
                                          }}
                                        />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p style={{ color: 'var(--text-main)' }}>{step.instruction}</p>
                                      {step.duration && (
                                        <p style={{ color: 'var(--text-muted)' }}>{step.duration}</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
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
          
          {/* Footer - always visible */}
          {showBranding && (
            <div className="prism-footer">
              <span>Powered by <strong>MapQuest</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
