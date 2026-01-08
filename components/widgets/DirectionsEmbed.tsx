// components/widgets/DirectionsEmbed.tsx
'use client';

import { useState } from 'react';
import { Navigation, Car, Bike, PersonStanding, Loader2, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
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

type RouteType = 'fastest' | 'shortest' | 'pedestrian' | 'bicycle';

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

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const routeTypes = [
    { id: 'fastest' as RouteType, label: 'Drive', icon: Car },
    { id: 'pedestrian' as RouteType, label: 'Walk', icon: PersonStanding },
    { id: 'bicycle' as RouteType, label: 'Bike', icon: Bike },
  ];

  // === ALL FUNCTIONAL LOGIC UNCHANGED ===
  
  const calculateRoute = async () => {
    if (!from.trim() || !to.trim()) {
      setError('Please enter both start and destination');
      return;
    }

    setLoading(true);
    setError(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate route');
      setRoute(null);
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
      <div className="flex" style={{ height: '500px' }}>
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
                <Navigation className="w-4 h-4" style={{ color: accentColor }} />
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
                  iconClassName="hidden"
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
                  iconClassName="hidden"
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
              className="p-5 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div 
                  className="p-4 rounded-xl text-center"
                  style={{ background: 'var(--bg-panel)' }}
                >
                  <p 
                    className="text-xs font-medium uppercase tracking-wide mb-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Distance
                  </p>
                  <p 
                    className="text-2xl font-bold"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {formatDistance(route.distance)}
                  </p>
                </div>
                <div 
                  className="p-4 rounded-xl text-center"
                  style={{ background: `${accentColor}10` }}
                >
                  <p 
                    className="text-xs font-medium uppercase tracking-wide mb-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Time
                  </p>
                  <p 
                    className="text-2xl font-bold"
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
                  {stepsExpanded ? (
                    <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>
              </button>

              {stepsExpanded && (
                <div 
                  className="flex-1 overflow-y-auto prism-scrollbar"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
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
            height="500px"
            markers={markers}
            showRoute={!!(fromCoords && toCoords)}
            routeStart={fromCoords || undefined}
            routeEnd={toCoords || undefined}
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
