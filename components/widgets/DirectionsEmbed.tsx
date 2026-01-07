// components/widgets/DirectionsEmbed.tsx
'use client';

import { useState } from 'react';
import { Navigation, Car, Bike, PersonStanding, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';

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
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
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

  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-900' : 'bg-gray-50';

  // Subtle marker color based on theme
  const markerColor = darkMode ? '#6b7280' : '#4b5563'; // gray-500 / gray-600

  const routeTypes = [
    { id: 'fastest' as RouteType, label: 'Drive', icon: Car },
    { id: 'pedestrian' as RouteType, label: 'Walk', icon: PersonStanding },
    { id: 'bicycle' as RouteType, label: 'Bike', icon: Bike },
  ];

  const calculateRoute = async () => {
    if (!from.trim() || !to.trim()) {
      setError('Please enter both start and destination');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Geocode both addresses
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

      // Get directions
      const directions = await getDirections(fromLoc, toLoc, { routeType });

      if (!directions) {
        throw new Error('Could not calculate route');
      }

      const routeInfo: RouteInfo = {
        distance: directions.distance,
        time: directions.time,
        fuelUsed: directions.fuelUsed,
        hasTolls: directions.hasTolls,
        hasHighway: directions.hasHighway,
        steps: directions.maneuvers || [],
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
  
  // Subtle gray markers instead of bright green/red
  const markers = [];
  if (fromCoords) markers.push({ ...fromCoords, label: 'A', color: markerColor });
  if (toCoords) markers.push({ ...toCoords, label: 'B', color: markerColor });

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} style={{ minWidth: '900px', fontFamily, borderRadius }}>
      <div className="flex" style={{ height: '500px' }}>
        {/* Sidebar */}
        <div className={`w-80 border-r ${borderColor} flex flex-col overflow-hidden`}>
          {/* Header */}
          <div className={`p-4 border-b ${borderColor} flex-shrink-0`}>
            <div className="flex items-center gap-2">
              <Navigation className={`w-5 h-5 ${mutedText}`} />
              <h3 className={`font-semibold ${textColor}`}>Get Directions</h3>
            </div>
          </div>

          {/* Inputs */}
          <div className={`p-4 border-b ${borderColor} flex-shrink-0`}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-600'
                }`}>
                  A
                </div>
                <input
                  type="text"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="Enter start location"
                  className={`flex-1 px-3 py-2 rounded-lg border ${borderColor} ${inputBg} ${textColor} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-600'
                }`}>
                  B
                </div>
                <input
                  type="text"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="Enter destination"
                  className={`flex-1 px-3 py-2 rounded-lg border ${borderColor} ${inputBg} ${textColor} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                />
              </div>
            </div>

            {/* Route Type */}
            <div className="flex gap-2 mt-4">
              {routeTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setRouteType(type.id)}
                  className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all ${
                    routeType === type.id
                      ? 'border-2 text-white'
                      : `${borderColor} ${mutedText} hover:border-gray-400`
                  }`}
                  style={routeType === type.id ? { backgroundColor: accentColor, borderColor: accentColor } : {}}
                >
                  <type.icon className="w-4 h-4" />
                  <span className="text-xs">{type.label}</span>
                </button>
              ))}
            </div>

            {/* Calculate Button */}
            <button
              onClick={calculateRoute}
              disabled={loading || !from.trim() || !to.trim()}
              className="w-full mt-4 py-2.5 px-4 rounded-lg text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: accentColor }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
              ) : (
                <><Navigation className="w-4 h-4" /> Get Directions</>
              )}
            </button>

            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}
          </div>

          {/* Route Summary */}
          {route && (
            <div className={`p-4 border-b ${borderColor} flex-shrink-0`}>
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-2 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <p className={`text-xs ${mutedText}`}>Distance</p>
                  <p className={`text-lg font-semibold ${textColor}`}>{formatDistance(route.distance)}</p>
                </div>
                <div className={`p-2 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <p className={`text-xs ${mutedText}`}>Time</p>
                  <p className={`text-lg font-semibold ${textColor}`}>{formatTime(route.time)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Turn-by-Turn */}
          {route && route.steps.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <button
                onClick={() => setStepsExpanded(!stepsExpanded)}
                className={`flex items-center justify-between px-4 py-3 flex-shrink-0 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
              >
                <span className={`text-sm font-medium ${textColor}`}>
                  Turn-by-turn ({route.steps.length} steps)
                </span>
                {stepsExpanded ? <ChevronUp className={`w-4 h-4 ${mutedText}`} /> : <ChevronDown className={`w-4 h-4 ${mutedText}`} />}
              </button>

              {stepsExpanded && (
                <div className={`flex-1 overflow-y-auto border-t ${borderColor}`}>
                  {route.steps.map((step, index) => (
                    <div key={index} className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 ${borderColor}`}>
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 border ${
                          darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-600'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm ${textColor}`}>{step.narrative}</div>
                        <div className={`text-xs mt-0.5 ${mutedText}`}>
                          {formatDistance(step.distance)} · {formatTime(step.time)}
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