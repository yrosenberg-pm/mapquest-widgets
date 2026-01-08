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
  5: '#22c55e',
  10: '#84cc16',
  15: '#eab308',
  20: '#f97316',
  30: '#ef4444',
  45: '#dc2626',
  60: '#b91c1c',
};

const TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60];

export default function HereIsolineWidget({
  address: initialAddress = '',
  lat: initialLat,
  lng: initialLng,
  defaultTimeMinutes = 15,
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
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

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const transportModes: { id: TransportMode; icon: any; label: string }[] = [
    { id: 'car', icon: Car, label: 'Drive' },
    { id: 'bicycle', icon: Bike, label: 'Bike' },
    { id: 'pedestrian', icon: PersonStanding, label: 'Walk' },
  ];

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const getIsolineColor = (minutes: number): string => {
    const presets = Object.keys(ISOLINE_COLORS).map(Number).sort((a, b) => a - b);
    for (const preset of presets) {
      if (minutes <= preset) {
        return ISOLINE_COLORS[preset];
      }
    }
    return ISOLINE_COLORS[60];
  };

  const calculateIsoline = async () => {
    if (!address && !location) {
      setError('Please enter an address');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      let center = location;

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

      if (center.lat < -90 || center.lat > 90 || center.lng < -180 || center.lng > 180) {
        throw new Error('Invalid coordinates');
      }

      const rangeSeconds = timeMinutes * 60;

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

      if (!data.isolines || data.isolines.length === 0) {
        throw new Error('No reachable area found. The location may be inaccessible.');
      }

      const isolineData = data.isolines[0];
      if (!isolineData.polygons || isolineData.polygons.length === 0) {
        throw new Error('Could not calculate reachable area for this location.');
      }

      const polygonData = isolineData.polygons[0];
      let coordinates: { lat: number; lng: number }[] = [];

      if (polygonData.outer) {
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
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to calculate reachable area');
      setIsoline(null);
    } finally {
      setLoading(false);
    }
  };

  const decodeFlexiblePolyline = (encoded: string): { lat: number; lng: number }[] => {
    const coordinates: { lat: number; lng: number }[] = [];
    
    let index = 0;
    const version = decodeUnsignedVarint(encoded, { index: 0 });
    index = version.newIndex;
    
    const header = decodeUnsignedVarint(encoded, { index });
    index = header.newIndex;
    
    const precision = header.value & 0x0F;
    const thirdDimPrecision = (header.value >> 4) & 0x0F;
    const thirdDimType = (header.value >> 8) & 0x07;
    
    const multiplier = Math.pow(10, precision);
    
    let lat = 0;
    let lng = 0;
    
    while (index < encoded.length) {
      const latResult = decodeSignedVarint(encoded, { index });
      lat += latResult.value;
      index = latResult.newIndex;
      
      if (index >= encoded.length) break;
      
      const lngResult = decodeSignedVarint(encoded, { index });
      lng += lngResult.value;
      index = lngResult.newIndex;
      
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

  const mapCenter = location || { lat: 39.8283, lng: -98.5795 };
  const mapMarkers = location
    ? [{ lat: location.lat, lng: location.lng, label: 'Start', color: accentColor }]
    : [];

  // Pass isoline polygon coordinates to the map
  const mapPolygons = location && isoline ? [{
    coordinates: isoline.coordinates,
    color: isoline.color,
    fillOpacity: 0.25,
  }] : [];

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
        {/* Controls Panel */}
        <div 
          className="w-80 flex-shrink-0 flex flex-col h-full overflow-hidden"
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          <div className="flex-1 overflow-y-auto prism-scrollbar p-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${accentColor}15` }}
              >
                <span style={{ color: accentColor }}><MapPin className="w-4 h-4" /></span>
              </div>
              <div>
                <h3 
                  className="font-bold"
                  style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
                >
                  Reachable Area
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Travel within specified time
                </p>
              </div>
            </div>

            {/* Address Input */}
            <div className="mb-3">
              <label 
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Starting Location
              </label>
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
            <div className="mb-3">
              <label 
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Travel Mode
              </label>
              <div className="flex gap-1.5">
                {transportModes.map((mode) => {
                  const isActive = transportMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setTransportMode(mode.id)}
                      className="flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors"
                      style={{
                        background: isActive ? accentColor : 'var(--bg-panel)',
                        color: isActive ? 'white' : 'var(--text-muted)',
                        border: `2px solid ${isActive ? accentColor : 'var(--border-subtle)'}`,
                      }}
                    >
                      <mode.icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Duration */}
            <div className="mb-3">
              <label 
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Travel Time
              </label>
              
              <div className="flex flex-wrap gap-1.5 mb-2">
                {TIME_PRESETS.map((preset) => {
                  const isActive = timeMinutes === preset && !customTime;
                  return (
                    <button
                      key={preset}
                      onClick={() => handlePresetClick(preset)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                      style={{
                        background: isActive ? accentColor : 'var(--bg-panel)',
                        color: isActive ? 'white' : 'var(--text-muted)',
                        border: `2px solid ${isActive ? accentColor : 'var(--border-subtle)'}`,
                      }}
                    >
                      {preset} min
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="120"
                  placeholder="Custom"
                  value={customTime}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="prism-input flex-1"
                  style={{ height: '36px' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>minutes</span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Max: 120 min</p>
            </div>

            {/* Error Display */}
            {error && (
              <div 
                className="mb-3 p-2.5 rounded-lg text-xs flex items-start gap-2"
                style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Calculate Button */}
            <button
              onClick={calculateIsoline}
              disabled={loading || (!address && !location)}
              className="prism-btn prism-btn-primary w-full"
              style={{ 
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                boxShadow: `0 4px 12px ${accentColor}40`,
              }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 prism-spinner" /> Calculating...</>
              ) : (
                <><Clock className="w-4 h-4" /> Calculate Area</>
              )}
            </button>

            {/* Result Legend */}
            {isoline && (
              <div 
                className="mt-3 p-3 rounded-xl"
                style={{ background: 'var(--bg-panel)' }}
              >
                <div 
                  className="text-xs font-medium mb-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Reachable Area
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ 
                      backgroundColor: isoline.color + '40', 
                      border: `2px solid ${isoline.color}` 
                    }}
                  />
                  <span style={{ color: 'var(--text-main)' }}>
                    Within <strong>{isoline.timeMinutes} min</strong> by {transportMode}
                  </span>
                </div>
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
            polygons={mapPolygons}
          />
        </div>
      </div>

      {/* Footer */}
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
