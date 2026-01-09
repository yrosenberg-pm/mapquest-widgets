// components/widgets/DirectionsEmbed.tsx
'use client';

import { useState } from 'react';
import { Navigation, Car, Bike, PersonStanding, Train, Loader2, ChevronDown, ChevronUp, MapPin, Clock } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

interface RouteStep {
  narrative: string;
  distance: number;
  time: number;
}

interface RouteInfo {
  distance: number;
  time: number;
  fuelUsed?: number;
  hasTolls?: boolean;
  hasHighway?: boolean;
  steps: RouteStep[];
}

type RouteType = 'fastest' | 'shortest' | 'pedestrian' | 'bicycle' | 'transit';

interface DirectionsEmbedProps {
  defaultFrom?: string;
  defaultTo?: string;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  onRouteCalculated?: (route: RouteInfo) => void;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

export default function DirectionsEmbed({
  defaultFrom = '',
  defaultTo = '',
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  onRouteCalculated,
}: DirectionsEmbedProps) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [toCoords, setToCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeType, setRouteType] = useState<RouteType>('fastest');
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [transitPolyline, setTransitPolyline] = useState<{ lat: number; lng: number }[]>([]);
  const [transitSteps, setTransitSteps] = useState<{ type: string; instruction: string; duration: string; lineName?: string }[]>([]);
  const [transitSegments, setTransitSegments] = useState<{ type: string; coords: { lat: number; lng: number }[] }[]>([]);
  const [transitRouteInfo, setTransitRouteInfo] = useState<{ distance: string; duration: string; mode: string } | null>(null);
  const [departureTime, setDepartureTime] = useState<'now' | Date>('now');
  const [showDepartureOptions, setShowDepartureOptions] = useState(false);

  // Helper to format departure time for display
  const formatDepartureTime = (time: 'now' | Date) => {
    if (time === 'now') return 'Leave now';
    const now = new Date();
    const isToday = time.toDateString() === now.toDateString();
    const isTomorrow = time.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    const timeStr = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today at ${timeStr}`;
    if (isTomorrow) return `Tomorrow at ${timeStr}`;
    return time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
  };

  // Get departure time as ISO string
  const getDepartureISO = () => {
    if (departureTime === 'now') return new Date().toISOString();
    return departureTime.toISOString();
  };

  // HERE Flexible Polyline decoder
  const decodeFlexiblePolyline = (encoded: string): { lat: number; lng: number }[] => {
    const DECODING_TABLE: Record<string, number> = {};
    const ENCODING_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < ENCODING_CHARS.length; i++) {
      DECODING_TABLE[ENCODING_CHARS[i]] = i;
    }
    
    const result: { lat: number; lng: number }[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    
    // Skip header byte
    index++;
    
    while (index < encoded.length) {
      // Decode latitude
      let shift = 0;
      let value = 0;
      while (index < encoded.length) {
        const char = encoded[index++];
        const num = DECODING_TABLE[char] || 0;
        value |= (num & 0x1F) << shift;
        shift += 5;
        if (num < 32) break;
      }
      lat += (value & 1) ? ~(value >> 1) : (value >> 1);
      
      // Decode longitude
      shift = 0;
      value = 0;
      while (index < encoded.length) {
        const char = encoded[index++];
        const num = DECODING_TABLE[char] || 0;
        value |= (num & 0x1F) << shift;
        shift += 5;
        if (num < 32) break;
      }
      lng += (value & 1) ? ~(value >> 1) : (value >> 1);
      
      result.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    
    return result;
  };

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const routeTypes = [
    { id: 'fastest' as RouteType, label: 'Drive', icon: Car },
    { id: 'pedestrian' as RouteType, label: 'Walk', icon: PersonStanding },
    { id: 'bicycle' as RouteType, label: 'Bike', icon: Bike },
    { id: 'transit' as RouteType, label: 'Transit', icon: Train },
  ];

  // === ALL FUNCTIONAL LOGIC UNCHANGED ===
  
  const calculateRoute = async () => {
    if (!from.trim() || !to.trim()) {
      setError('Please enter both start and destination');
      return;
    }

    setLoading(true);
    setError(null);
    setTransitPolyline([]);
    setTransitSteps([]);
    setTransitSegments([]);
    setTransitRouteInfo(null);

    try {
      const [fromResult, toResult] = await Promise.all([
        geocode(from),
        geocode(to),
      ]);

      if (!fromResult?.lat || !fromResult?.lng) {
        throw new Error('Could not find start location');
      }
      if (!toResult?.lat || !toResult?.lng) {
        throw new Error('Could not find destination');
      }

      const fromLoc = { lat: fromResult.lat, lng: fromResult.lng };
      const toLoc = { lat: toResult.lat, lng: toResult.lng };

      setFromCoords(fromLoc);
      setToCoords(toLoc);

      if (routeType === 'transit') {
        // Use HERE Public Transit API
        const hereRes = await fetch('/api/here?' + new URLSearchParams({
          endpoint: 'transit',
          origin: `${fromLoc.lat},${fromLoc.lng}`,
          destination: `${toLoc.lat},${toLoc.lng}`,
          departureTime: getDepartureISO(),
        }));
        const hereData = await hereRes.json();
        
        if (hereData.error) {
          throw new Error(hereData.details || 'Transit routing failed');
        }
        
        if (hereData.routes && hereData.routes.length > 0) {
          const route = hereData.routes[0];
          const sections = route.sections || [];
          
          let totalDistance = 0;
          let totalDuration = 0;
          const transitModes: string[] = [];
          const transitLines: string[] = [];
          const steps: { type: string; instruction: string; duration: string; lineName?: string }[] = [];
          const segments: { type: string; coords: { lat: number; lng: number }[] }[] = [];
          
          // Mode name mapping
          const modeNameMap: Record<string, string> = {
            'pedestrian': 'Walk',
            'subway': 'Subway',
            'bus': 'Bus',
            'tram': 'Tram',
            'rail': 'Train',
            'ferry': 'Ferry',
            'lightRail': 'Light Rail',
            'intercityRail': 'Train',
            'highSpeedTrain': 'Train',
            'monorail': 'Monorail',
          };
          
          for (const section of sections) {
            if (section.travelSummary) {
              totalDistance += section.travelSummary.length || 0;
              totalDuration += section.travelSummary.duration || 0;
            }
            
            const sectionType = section.transport?.mode || section.type || 'unknown';
            if (sectionType !== 'pedestrian' && sectionType !== 'unknown') {
              transitModes.push(sectionType);
            }
            
            const lineName = section.transport?.name || section.transport?.shortName || section.transport?.headsign;
            if (lineName) {
              transitLines.push(lineName);
            }
            
            // Build step instruction
            const modeName = modeNameMap[sectionType] || sectionType;
            let instruction = '';
            if (sectionType === 'pedestrian') {
              const walkDist = section.travelSummary?.length ? (section.travelSummary.length * 0.000621371).toFixed(2) : '?';
              instruction = `Walk ${walkDist} mi`;
            } else if (lineName) {
              instruction = `Take ${lineName}`;
            } else {
              instruction = `Take ${modeName}`;
            }
            
            const durationMins = section.travelSummary?.duration ? Math.round(section.travelSummary.duration / 60) : 0;
            steps.push({
              type: sectionType,
              instruction,
              duration: durationMins > 0 ? `${durationMins} min` : '',
              lineName,
            });
            
            // Decode polyline for this section
            if (section.polyline) {
              const coords = decodeFlexiblePolyline(section.polyline);
              if (coords.length > 0) {
                segments.push({ type: sectionType, coords });
              }
            }
          }
          
          // Build mode description
          const uniqueModes = [...new Set(transitModes)];
          const uniqueLines = [...new Set(transitLines)];
          
          let modeDescription = 'Transit';
          if (uniqueModes.length > 0) {
            const modeNames = uniqueModes.map(m => modeNameMap[m] || m);
            modeDescription = modeNames.join(' + ');
            if (uniqueLines.length > 0 && uniqueLines.length <= 2) {
              modeDescription += ` (${uniqueLines.join(', ')})`;
            }
          }
          
          setTransitSegments(segments);
          setTransitSteps(steps);
          setTransitRouteInfo({
            distance: (totalDistance * 0.000621371).toFixed(1) + ' mi',
            duration: Math.round(totalDuration / 60) + ' min',
            mode: modeDescription,
          });
          setRoute(null); // Clear MapQuest route
        } else {
          throw new Error('No transit route found for this trip');
        }
      } else {
        // Use MapQuest for other route types
        const directions = await getDirections(`${fromLoc.lat},${fromLoc.lng}`, `${toLoc.lat},${toLoc.lng}`, routeType);

        if (!directions) {
          throw new Error('Could not calculate route');
        }

        const routeInfo: RouteInfo = {
          distance: directions.distance,
          time: directions.time,
          fuelUsed: directions.fuelUsed,
          hasTolls: directions.hasTolls,
          hasHighway: directions.hasHighway,
          steps: directions.steps || [],
        };

        setRoute(routeInfo);
        onRouteCalculated?.(routeInfo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate route');
      setRoute(null);
      setTransitRouteInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
  };

  const formatDistance = (miles: number) => `${miles.toFixed(1)} mi`;

  const mapCenter = fromCoords || toCoords || { lat: 39.8283, lng: -98.5795 };
  
  const markers: Array<{ lat: number; lng: number; label: string; color: string }> = [];
  if (fromCoords) markers.push({ ...fromCoords, label: 'A', color: '#64748B' });
  if (toCoords) markers.push({ ...toCoords, label: 'B', color: '#64748B' });

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
      <div className="flex" style={{ height: '600px' }}>
        {/* Sidebar */}
        <div 
          className="w-80 flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          {/* Header */}
          <div 
            className="p-5 flex-shrink-0"
            style={{ 
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${accentColor}15` }}
              >
                <span style={{ color: accentColor }}><Navigation className="w-4 h-4" /></span>
              </div>
              <h3 
                className="font-bold text-lg"
                style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
              >
                Get Directions
              </h3>
            </div>
          </div>

          {/* Inputs */}
          <div 
            className="p-5 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="space-y-1">
              {/* From Input */}
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ 
                    background: 'var(--bg-panel)',
                    border: '2px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  A
                </div>
                <AddressAutocomplete
                  value={from}
                  onChange={setFrom}
                  onSelect={(result) => {
                    if (result.lat && result.lng) {
                      setFromCoords({ lat: result.lat, lng: result.lng });
                    }
                  }}
                  placeholder="Enter start location"
                  darkMode={darkMode}
                  inputBg={inputBg}
                  textColor={textColor}
                  mutedText={mutedText}
                  borderColor={borderColor}
                  className="flex-1"
                  hideIcon
                />
              </div>

              {/* Connection Line */}
              <div className="flex items-center gap-3">
                <div className="w-8 flex justify-center">
                  <div 
                    className="w-0.5 h-2 rounded-full"
                    style={{ background: 'var(--border-default)' }}
                  />
                </div>
              </div>

              {/* To Input */}
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ 
                    background: `${accentColor}15`,
                    border: `2px solid ${accentColor}`,
                    color: accentColor,
                  }}
                >
                  B
                </div>
                <AddressAutocomplete
                  value={to}
                  onChange={setTo}
                  onSelect={(result) => {
                    if (result.lat && result.lng) {
                      setToCoords({ lat: result.lat, lng: result.lng });
                    }
                  }}
                  placeholder="Enter destination"
                  darkMode={darkMode}
                  inputBg={inputBg}
                  textColor={textColor}
                  mutedText={mutedText}
                  borderColor={borderColor}
                  className="flex-1"
                  hideIcon
                />
              </div>
            </div>

            {/* Route Type */}
            <div className="flex gap-2 mt-5">
              {routeTypes.map((type) => {
                const isActive = routeType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setRouteType(type.id)}
                    className="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl transition-all"
                    style={{
                      background: isActive ? accentColor : 'var(--bg-panel)',
                      color: isActive ? 'white' : 'var(--text-muted)',
                      border: isActive ? `2px solid ${accentColor}` : '2px solid var(--border-subtle)',
                      boxShadow: isActive ? `0 4px 12px ${accentColor}30` : 'none',
                    }}
                  >
                    <type.icon className="w-5 h-5" />
                    <span className="text-xs font-semibold">{type.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Departure Time - Available for all modes */}
            <div className="mt-4 relative">
                <button
                  onClick={() => setShowDepartureOptions(!showDepartureOptions)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl transition-all"
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: accentColor }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>
                      {formatDepartureTime(departureTime)}
                    </span>
                  </div>
                  <ChevronDown 
                    className={`w-4 h-4 transition-transform ${showDepartureOptions ? 'rotate-180' : ''}`} 
                    style={{ color: 'var(--text-muted)' }} 
                  />
                </button>

                {showDepartureOptions && (
                  <div 
                    className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-20"
                    style={{
                      background: 'var(--bg-widget)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  >
                    {/* Leave Now Option */}
                    <button
                      onClick={() => { setDepartureTime('now'); setShowDepartureOptions(false); }}
                      className="w-full px-3 py-2.5 text-left text-sm transition-colors"
                      style={{ 
                        background: departureTime === 'now' ? `${accentColor}15` : 'transparent',
                        color: departureTime === 'now' ? accentColor : 'var(--text-main)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = departureTime === 'now' ? `${accentColor}15` : 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = departureTime === 'now' ? `${accentColor}15` : 'transparent'}
                    >
                      Leave now
                    </button>

                    {/* Quick Time Options */}
                    {[15, 30, 60].map((mins) => {
                      const time = new Date(Date.now() + mins * 60000);
                      const label = mins < 60 ? `In ${mins} minutes` : 'In 1 hour';
                      return (
                        <button
                          key={mins}
                          onClick={() => { setDepartureTime(time); setShowDepartureOptions(false); }}
                          className="w-full px-3 py-2.5 text-left text-sm transition-colors"
                          style={{ color: 'var(--text-main)' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          {label}
                        </button>
                      );
                    })}

                    {/* Custom Time Input */}
                    <div 
                      className="px-3 py-2.5"
                      style={{ borderTop: '1px solid var(--border-subtle)' }}
                    >
                      <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                        Custom time
                      </label>
                      <input
                        type="datetime-local"
                        min={new Date().toISOString().slice(0, 16)}
                        className="w-full px-2 py-1.5 rounded-lg text-sm"
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                        }}
                        onChange={(e) => {
                          if (e.target.value) {
                            setDepartureTime(new Date(e.target.value));
                            setShowDepartureOptions(false);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

            {/* Calculate Button */}
            <button
              onClick={calculateRoute}
              disabled={loading || !from.trim() || !to.trim()}
              className="prism-btn prism-btn-primary w-full mt-5"
              style={{ 
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                boxShadow: `0 4px 12px ${accentColor}40`,
              }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 prism-spinner" /> Calculating...</>
              ) : (
                <><Navigation className="w-4 h-4" /> Get Directions</>
              )}
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

          {/* Route Summary */}
          {route && (
            <div 
              className="p-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div 
                  className="p-3 rounded-lg text-center"
                  style={{ background: 'var(--bg-panel)' }}
                >
                  <p 
                    className="text-[10px] font-medium uppercase tracking-wide mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Distance
                  </p>
                  <p 
                    className="text-lg font-bold"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {formatDistance(route.distance)}
                  </p>
                </div>
                <div 
                  className="p-3 rounded-lg text-center"
                  style={{ background: `${accentColor}10` }}
                >
                  <p 
                    className="text-[10px] font-medium uppercase tracking-wide mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Time
                  </p>
                  <p 
                    className="text-lg font-bold"
                    style={{ color: accentColor }}
                  >
                    {formatTime(route.time)}
                  </p>
                </div>
              </div>
              
              {/* Route Tags */}
              {(route.hasTolls || route.hasHighway) && (
                <div className="flex gap-2 mt-3">
                  {route.hasHighway && (
                    <span 
                      className="text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ 
                        background: 'var(--color-info-bg)', 
                        color: 'var(--color-info)' 
                      }}
                    >
                      Highway
                    </span>
                  )}
                  {route.hasTolls && (
                    <span 
                      className="text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ 
                        background: 'var(--color-warning-bg)', 
                        color: 'var(--color-warning)' 
                      }}
                    >
                      Tolls
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Transit Route Summary */}
          {transitRouteInfo && (
            <div 
              className="p-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div 
                  className="p-3 rounded-lg text-center"
                  style={{ background: 'var(--bg-panel)' }}
                >
                  <p 
                    className="text-[10px] font-medium uppercase tracking-wide mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Distance
                  </p>
                  <p 
                    className="text-lg font-bold"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {transitRouteInfo.distance}
                  </p>
                </div>
                <div 
                  className="p-3 rounded-lg text-center"
                  style={{ background: `${accentColor}10` }}
                >
                  <p 
                    className="text-[10px] font-medium uppercase tracking-wide mb-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Time
                  </p>
                  <p 
                    className="text-lg font-bold"
                    style={{ color: accentColor }}
                  >
                    {transitRouteInfo.duration}
                  </p>
                </div>
              </div>
              
              {/* Transit Mode Tag */}
              <div className="flex gap-2 mt-3">
                <span 
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ 
                    background: `${accentColor}15`, 
                    color: accentColor 
                  }}
                >
                  <Train className="w-3 h-3 inline mr-1" />
                  {transitRouteInfo.mode}
                </span>
              </div>
            </div>
          )}

          {/* Transit Steps */}
          {transitSteps.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <button
                onClick={() => setStepsExpanded(!stepsExpanded)}
                className="flex items-center justify-between px-5 py-4 flex-shrink-0 transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span 
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-main)' }}
                >
                  Transit directions
                </span>
                <div className="flex items-center gap-2">
                  <span 
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-panel)', color: 'var(--text-muted)' }}
                  >
                    {transitSteps.length} steps
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {stepsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </div>
              </button>
              
              {stepsExpanded && (
                <div 
                  className="flex-1 overflow-y-auto prism-scrollbar px-5 pb-5"
                  style={{ maxHeight: '250px' }}
                >
                  <div className="space-y-1">
                    {transitSteps.map((step, i) => {
                      const stepColors: Record<string, string> = {
                        pedestrian: '#6B7280',
                        subway: '#8B5CF6',
                        bus: '#F59E0B',
                        tram: '#10B981',
                        rail: '#3B82F6',
                        ferry: '#06B6D4',
                        lightRail: '#10B981',
                      };
                      const stepColor = stepColors[step.type] || accentColor;
                      const isDotted = step.type === 'pedestrian' || step.type === 'subway';
                      
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div 
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                              style={{ backgroundColor: stepColor }}
                            />
                            {i < transitSteps.length - 1 && (
                              <div 
                                className="w-0.5 h-8 mt-1"
                                style={{ 
                                  backgroundImage: isDotted ? `repeating-linear-gradient(to bottom, ${stepColor} 0px, ${stepColor} 3px, transparent 3px, transparent 6px)` : 'none',
                                  backgroundColor: isDotted ? 'transparent' : stepColor + '60',
                                }}
                              />
                            )}
                          </div>
                          <div className="flex-1 pb-2">
                            <p 
                              className="text-sm font-medium"
                              style={{ color: 'var(--text-main)' }}
                            >
                              {step.instruction}
                            </p>
                            {step.duration && (
                              <p 
                                className="text-xs mt-0.5"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {step.duration}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Turn-by-Turn */}
          {route && route.steps.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <button
                onClick={() => setStepsExpanded(!stepsExpanded)}
                className="flex items-center justify-between px-5 py-4 flex-shrink-0 transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span 
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-main)' }}
                >
                  Turn-by-turn directions
                </span>
                <div className="flex items-center gap-2">
                  <span 
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-panel)', color: 'var(--text-muted)' }}
                  >
                    {route.steps.length} steps
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {stepsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </div>
              </button>

              {stepsExpanded && (
                <div 
                  className="flex-1 overflow-y-auto prism-scrollbar"
                  style={{ borderTop: '1px solid var(--border-subtle)', maxHeight: '200px' }}
                >
                  {route.steps.map((step, index) => (
                    <div 
                      key={index} 
                      className="flex items-start gap-3 px-5 py-4"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <div
                        className="prism-number-badge flex-shrink-0"
                        style={{ 
                          width: '24px', 
                          height: '24px', 
                          fontSize: '10px',
                          background: index === 0 ? accentColor : 'var(--text-muted)',
                        }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div 
                          className="text-sm"
                          style={{ color: 'var(--text-main)' }}
                        >
                          {step.narrative}
                        </div>
                        <div 
                          className="text-xs mt-1 flex items-center gap-2"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span>{formatDistance(step.distance)}</span>
                          <span>·</span>
                          <span>{formatTime(step.time)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={fromCoords && toCoords ? 10 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="600px"
            markers={markers}
            showRoute={!!(fromCoords && toCoords) && routeType !== 'transit'}
            routeStart={fromCoords || undefined}
            routeEnd={toCoords || undefined}
            routeType={routeType === 'transit' || routeType === 'shortest' ? undefined : routeType}
            transitSegments={routeType === 'transit' && transitSegments.length > 0 ? transitSegments : undefined}
            routePolyline={routeType === 'transit' && transitSegments.length === 0 ? transitPolyline : undefined}
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
