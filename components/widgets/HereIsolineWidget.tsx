// components/widgets/HereIsolineWidget.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Clock, Car, Bike, PersonStanding, Loader2, MapPin, AlertCircle } from 'lucide-react';
import { geocode } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

type TransportMode = 'car' | 'pedestrian' | 'bicycle';

interface IsolinePolygon {
  timeMinutes: number;
  color: string;
  coordinates: { lat: number; lng: number }[];
}

interface HereIsolineWidgetProps {
  address?: string;
  lat?: number;
  lng?: number;
  defaultTimeMinutes?: number;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  onIsolineCalculated?: (polygon: IsolinePolygon) => void;
}

const mapQuestApiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

const ISOLINE_COLORS: Record<number, string> = {
  5: '#22c55e',   // Green for 5 min
  10: '#84cc16',  // Lime for 10 min
  15: '#eab308',  // Yellow for 15 min
  20: '#f97316',  // Orange for 20 min
  30: '#ef4444',  // Red for 30 min
  45: '#dc2626',  // Darker red for 45 min
  60: '#b91c1c',  // Even darker red for 60 min
};

const TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60];

export default function HereIsolineWidget({
  address: initialAddress = '',
  lat: initialLat,
  lng: initialLng,
  defaultTimeMinutes = 15,
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
  onIsolineCalculated,
}: HereIsolineWidgetProps) {
  const [address, setAddress] = useState(initialAddress);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  const [transportMode, setTransportMode] = useState<TransportMode>('car');
  const [timeMinutes, setTimeMinutes] = useState(defaultTimeMinutes);
  const [customTime, setCustomTime] = useState('');
  const [isoline, setIsoline] = useState<IsolinePolygon | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Theme colors following existing patterns
  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-900' : 'bg-gray-50';

  const transportModes: { id: TransportMode; icon: any; label: string }[] = [
    { id: 'car', icon: Car, label: 'Drive' },
    { id: 'bicycle', icon: Bike, label: 'Bike' },
    { id: 'pedestrian', icon: PersonStanding, label: 'Walk' },
  ];

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const getIsolineColor = (minutes: number): string => {
    // Find closest preset color
    const presets = Object.keys(ISOLINE_COLORS).map(Number).sort((a, b) => a - b);
    for (const preset of presets) {
      if (minutes <= preset) {
        return ISOLINE_COLORS[preset];
      }
    }
    return ISOLINE_COLORS[60]; // Default to max
  };

  const calculateIsoline = async () => {
    if (!address && !location) {
      setError('Please enter an address');
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      let center = location;

      // Geocode address if we don't have coordinates
      if (!center && address) {
        const geocoded = await geocode(address);
        if (!geocoded || !geocoded.lat || !geocoded.lng) {
          throw new Error('Could not find that address. Please try a different location.');
        }
        center = { lat: geocoded.lat, lng: geocoded.lng };
        setLocation(center);
      }

      if (!center) {
        throw new Error('No location available');
      }

      // Validate coordinates
      if (center.lat < -90 || center.lat > 90 || center.lng < -180 || center.lng > 180) {
        throw new Error('Invalid coordinates');
      }

      // Convert minutes to seconds for HERE API
      const rangeSeconds = timeMinutes * 60;

      // Cap time to reasonable values (max 2 hours)
      if (rangeSeconds > 7200) {
        throw new Error('Maximum travel time is 2 hours');
      }

      const params = new URLSearchParams({
        endpoint: 'isoline',
        origin: `${center.lat},${center.lng}`,
        rangeType: 'time',
        rangeValues: String(rangeSeconds),
        transportMode: transportMode,
      });

      const response = await fetch(`/api/here?${params}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 429) {
          throw new Error('Too many requests. Please wait a moment and try again.');
        }
        
        if (response.status === 500 && errorData.error?.includes('not configured')) {
          throw new Error('HERE API is not configured. Please add your HERE_API_KEY to the environment.');
        }

        throw new Error(errorData.error || 'Failed to calculate reachable area');
      }

      const data = await response.json();

      // Parse HERE isoline response
      if (!data.isolines || data.isolines.length === 0) {
        throw new Error('No reachable area found. The location may be inaccessible.');
      }

      const isolineData = data.isolines[0];
      if (!isolineData.polygons || isolineData.polygons.length === 0) {
        throw new Error('Could not calculate reachable area for this location.');
      }

      // HERE API returns polygons in flexible polyline format
      // Parse the outer ring of the first polygon
      const polygonData = isolineData.polygons[0];
      let coordinates: { lat: number; lng: number }[] = [];

      if (polygonData.outer) {
        // Decode flexible polyline (HERE's format)
        coordinates = decodeFlexiblePolyline(polygonData.outer);
      }

      if (coordinates.length === 0) {
        throw new Error('Invalid polygon data received');
      }

      const polygon: IsolinePolygon = {
        timeMinutes,
        color: getIsolineColor(timeMinutes),
        coordinates,
      };

      setIsoline(polygon);
      onIsolineCalculated?.(polygon);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't show error
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to calculate reachable area');
      setIsoline(null);
    } finally {
      setLoading(false);
    }
  };

  // Decode HERE's flexible polyline format
  // Based on HERE's flexible polyline encoding specification
  const decodeFlexiblePolyline = (encoded: string): { lat: number; lng: number }[] => {
    const coordinates: { lat: number; lng: number }[] = [];
    
    // Flexible polyline header
    let index = 0;
    const version = decodeUnsignedVarint(encoded, { index: 0 });
    index = version.newIndex;
    
    // Get precision values from header
    const header = decodeUnsignedVarint(encoded, { index });
    index = header.newIndex;
    
    const precision = header.value & 0x0F;
    const thirdDimPrecision = (header.value >> 4) & 0x0F;
    const thirdDimType = (header.value >> 8) & 0x07;
    
    const multiplier = Math.pow(10, precision);
    
    let lat = 0;
    let lng = 0;
    
    while (index < encoded.length) {
      // Decode lat delta
      const latResult = decodeSignedVarint(encoded, { index });
      lat += latResult.value;
      index = latResult.newIndex;
      
      if (index >= encoded.length) break;
      
      // Decode lng delta
      const lngResult = decodeSignedVarint(encoded, { index });
      lng += lngResult.value;
      index = lngResult.newIndex;
      
      // Skip third dimension if present
      if (thirdDimType !== 0 && index < encoded.length) {
        const thirdResult = decodeSignedVarint(encoded, { index });
        index = thirdResult.newIndex;
      }
      
      coordinates.push({
        lat: lat / multiplier,
        lng: lng / multiplier,
      });
    }
    
    return coordinates;
  };

  const decodeUnsignedVarint = (encoded: string, pos: { index: number }): { value: number; newIndex: number } => {
    const DECODING_TABLE: Record<string, number> = {};
    const ENCODING_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < ENCODING_CHARS.length; i++) {
      DECODING_TABLE[ENCODING_CHARS[i]] = i;
    }
    
    let result = 0;
    let shift = 0;
    let index = pos.index;
    
    while (index < encoded.length) {
      const char = encoded[index];
      const value = DECODING_TABLE[char];
      if (value === undefined) {
        throw new Error(`Invalid character: ${char}`);
      }
      
      result |= (value & 0x1F) << shift;
      
      if ((value & 0x20) === 0) {
        return { value: result, newIndex: index + 1 };
      }
      
      shift += 5;
      index++;
    }
    
    throw new Error('Incomplete varint');
  };

  const decodeSignedVarint = (encoded: string, pos: { index: number }): { value: number; newIndex: number } => {
    const unsigned = decodeUnsignedVarint(encoded, pos);
    const value = unsigned.value;
    
    // ZigZag decoding
    const decoded = (value >> 1) ^ (-(value & 1));
    
    return { value: decoded, newIndex: unsigned.newIndex };
  };

  const handleTimeChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0 && num <= 120) {
      setTimeMinutes(num);
      setCustomTime(value);
    }
  };

  const handlePresetClick = (preset: number) => {
    setTimeMinutes(preset);
    setCustomTime('');
  };

  // Map configuration
  const mapCenter = location || { lat: 39.8283, lng: -98.5795 }; // Default to US center
  const mapMarkers = location
    ? [{ lat: location.lat, lng: location.lng, label: 'Start', color: accentColor }]
    : [];

  // Convert isoline to map circles (approximation for visualization)
  // Since MapQuestMap supports circles, we'll use them to show the isoline boundary
  const mapCircles = location && isoline ? [{
    lat: location.lat,
    lng: location.lng,
    radius: estimateIsolineRadius(isoline.coordinates, location),
    color: isoline.color,
    fillOpacity: 0.2,
  }] : [];

  // Estimate radius from polygon for circle approximation
  function estimateIsolineRadius(
    coords: { lat: number; lng: number }[],
    center: { lat: number; lng: number }
  ): number {
    if (coords.length === 0) return 1000;
    
    // Calculate average distance from center to polygon points
    let totalDistance = 0;
    coords.forEach(coord => {
      const dLat = (coord.lat - center.lat) * 111320; // meters per degree latitude
      const dLng = (coord.lng - center.lng) * 111320 * Math.cos(center.lat * Math.PI / 180);
      totalDistance += Math.sqrt(dLat * dLat + dLng * dLng);
    });
    
    return totalDistance / coords.length;
  }

  return (
    <div 
      className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} 
      style={{ minWidth: '900px', width: '100%', fontFamily, borderRadius }}
    >
      {/* Main content */}
      <div className="flex" style={{ height: '500px' }}>
        {/* Controls Panel */}
        <div className={`w-80 flex-shrink-0 border-r ${borderColor} flex flex-col h-full overflow-hidden`}>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className={`w-5 h-5`} style={{ color: accentColor }} />
              <h3 className={`font-semibold ${textColor}`}>Reachable Area</h3>
            </div>
            <p className={`text-sm ${mutedText} mb-4`}>
              See where you can travel within a specified time
            </p>

            {/* Address Input */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${mutedText}`}>Starting Location</label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={(result) => {
                  if (result.lat && result.lng) {
                    setLocation({ lat: result.lat, lng: result.lng });
                  }
                }}
                placeholder="Enter an address..."
                darkMode={darkMode}
                inputBg={inputBg}
                textColor={textColor}
                mutedText={mutedText}
                borderColor={borderColor}
              />
            </div>

            {/* Transport Mode */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${mutedText}`}>Travel Mode</label>
              <div className="flex gap-2">
                {transportModes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setTransportMode(mode.id)}
                    className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all ${
                      transportMode === mode.id
                        ? 'border-2 text-white'
                        : `${borderColor} ${mutedText} hover:border-gray-400`
                    }`}
                    style={transportMode === mode.id ? { borderColor: accentColor, backgroundColor: accentColor } : undefined}
                  >
                    <mode.icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Time Duration */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${mutedText}`}>Travel Time</label>
              
              {/* Preset buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handlePresetClick(preset)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      timeMinutes === preset && !customTime
                        ? 'text-white'
                        : `${borderColor} ${mutedText} hover:border-gray-400`
                    }`}
                    style={timeMinutes === preset && !customTime ? { borderColor: accentColor, backgroundColor: accentColor } : undefined}
                  >
                    {preset} min
                  </button>
                ))}
              </div>

              {/* Custom time input */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="120"
                  placeholder="Custom"
                  value={customTime}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className={`flex-1 px-3 py-2 rounded-lg border ${borderColor} ${inputBg} ${textColor} text-sm focus:outline-none focus:ring-2 focus:ring-opacity-50`}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                />
                <span className={`text-sm ${mutedText}`}>minutes</span>
              </div>
              <p className={`text-xs ${mutedText} mt-1`}>Max: 120 minutes (2 hours)</p>
            </div>

            {/* Error Display */}
            {error && (
              <div className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
                darkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-600'
              }`}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Calculate Button */}
            <button
              onClick={calculateIsoline}
              disabled={loading || (!address && !location)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-white font-medium disabled:opacity-50 transition-colors"
              style={{ backgroundColor: accentColor }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
              ) : (
                <><Clock className="w-4 h-4" /> Calculate Reachable Area</>
              )}
            </button>

            {/* Result Legend */}
            {isoline && (
              <div className={`mt-4 p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-xs font-medium mb-2 ${mutedText}`}>Reachable Area</div>
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ 
                      backgroundColor: isoline.color + '40', 
                      border: `2px solid ${isoline.color}` 
                    }}
                  />
                  <span className={textColor}>
                    Within <strong>{isoline.timeMinutes} minutes</strong> by {transportMode}
                  </span>
                </div>
                <p className={`text-xs ${mutedText} mt-2`}>
                  The highlighted area shows where you can travel from your starting point within the specified time.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 h-full">
          <MapQuestMap
            apiKey={mapQuestApiKey}
            center={mapCenter}
            zoom={location ? 11 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={mapMarkers}
            circles={mapCircles}
          />
        </div>
      </div>

      {/* Branding Footer */}
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
              Powered by <strong>HERE</strong> & <strong>MapQuest</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
