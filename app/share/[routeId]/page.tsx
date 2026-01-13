// app/share/[routeId]/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
  Route, Clock, MapPin, ArrowRight, RefreshCw, Share2, 
  Check, Navigation, Loader2, AlertCircle, Calendar,
  Timer, CornerDownRight, Truck, CheckCircle2
} from 'lucide-react';
import { getDirections } from '@/lib/mapquest';
import MapQuestMap from '@/components/widgets/MapQuestMap';

interface SharedStop {
  address: string;
  lat: number;
  lng: number;
}

interface SharedRouteData {
  stops: SharedStop[];
  type: 'fastest' | 'shortest' | 'balanced';
  departureTime?: string;
  companyName?: string;
}

interface LegInfo {
  from: string;
  to: string;
  distance: number;
  time: number;
}

interface RouteResult {
  totalDistance: number;
  totalTime: number;
  legs: LegInfo[];
}

const API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

export default function ShareRoutePage() {
  const params = useParams();
  const routeId = params.routeId as string;
  
  const [routeData, setRouteData] = useState<SharedRouteData | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nextUpdate, setNextUpdate] = useState<number>(300); // 5 minutes in seconds
  const [copied, setCopied] = useState(false);
  const [etas, setEtas] = useState<Date[]>([]);
  
  const accentColor = '#3B82F6';
  const darkMode = false;

  // Decode route data from URL
  useEffect(() => {
    try {
      const decoded = JSON.parse(atob(routeId)) as SharedRouteData;
      if (decoded.stops && decoded.stops.length >= 2) {
        setRouteData(decoded);
      } else {
        setError('Invalid route data');
      }
    } catch (err) {
      setError('Failed to decode route. The link may be corrupted.');
    }
  }, [routeId]);

  // Calculate route
  const calculateRoute = useCallback(async () => {
    if (!routeData) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { stops, type } = routeData;
      let totalDistance = 0;
      let totalTime = 0;
      const legs: LegInfo[] = [];
      
      for (let i = 0; i < stops.length - 1; i++) {
        const from = `${stops[i].lat},${stops[i].lng}`;
        const to = `${stops[i + 1].lat},${stops[i + 1].lng}`;
        const routeType = type === 'balanced' ? 'fastest' : type;
        const directions = await getDirections(from, to, routeType);
        
        if (directions) {
          totalDistance += directions.distance;
          totalTime += directions.time;
          legs.push({
            from: stops[i].address,
            to: stops[i + 1].address,
            distance: directions.distance,
            time: directions.time,
          });
        }
      }
      
      setRouteResult({ totalDistance, totalTime, legs });
      
      // Calculate ETAs
      const departureTime = routeData.departureTime 
        ? new Date(routeData.departureTime) 
        : new Date();
      
      let currentTime = new Date(departureTime);
      const calculatedEtas: Date[] = [new Date(currentTime)];
      
      for (const leg of legs) {
        currentTime = new Date(currentTime.getTime() + leg.time * 60 * 1000);
        calculatedEtas.push(new Date(currentTime));
      }
      
      setEtas(calculatedEtas);
      setLastUpdated(new Date());
      setNextUpdate(300); // Reset countdown
    } catch (err) {
      setError('Failed to calculate route');
    } finally {
      setLoading(false);
    }
  }, [routeData]);

  // Initial calculation
  useEffect(() => {
    if (routeData) {
      calculateRoute();
    }
  }, [routeData, calculateRoute]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!routeData) return;
    
    const interval = setInterval(() => {
      setNextUpdate(prev => {
        if (prev <= 1) {
          calculateRoute();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [routeData, calculateRoute]);

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy');
    }
  };

  if (error && !routeData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Route Not Found</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const stops = routeData?.stops || [];
  const mapCenter = stops.length > 0
    ? { 
        lat: stops.reduce((sum, s) => sum + s.lat, 0) / stops.length, 
        lng: stops.reduce((sum, s) => sum + s.lng, 0) / stops.length 
      }
    : { lat: 39.8283, lng: -98.5795 };

  const markers = stops.map((stop, index) => ({
    lat: stop.lat,
    lng: stop.lng,
    label: `${index + 1}`,
    color: '#4b5563',
  }));

  const routeWaypoints = stops.length > 2 
    ? stops.slice(1, -1).map(s => ({ lat: s.lat, lng: s.lng }))
    : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: `${accentColor}15` }}
              >
                <Route className="w-6 h-6" style={{ color: accentColor }} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Shared Route</h1>
                <p className="text-sm text-gray-500">
                  {stops.length} stops · {routeResult?.totalDistance.toFixed(1) || '--'} mi
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Last Updated / Auto-refresh indicator */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100">
                <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                <div className="text-xs text-gray-600">
                  <span>Updates in </span>
                  <span className="font-mono font-semibold">{formatCountdown(nextUpdate)}</span>
                </div>
              </div>
              
              <button
                onClick={copyShareLink}
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all"
                style={{ 
                  background: copied ? '#22c55e15' : `${accentColor}15`,
                  color: copied ? '#22c55e' : accentColor,
                }}
              >
                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span className="text-sm font-medium">{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
              
              <button
                onClick={calculateRoute}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium transition-all"
                style={{ background: accentColor }}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span className="text-sm">Refresh Now</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Route Info */}
          <div className="lg:col-span-1 space-y-4">
            {/* Summary Card */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Route Summary
              </h2>
              
              {routeResult ? (
                <div className="space-y-4">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-gray-50">
                      <div className="flex items-center gap-2 mb-2">
                        <Route className="w-4 h-4" style={{ color: accentColor }} />
                        <span className="text-xs font-medium text-gray-500">Total Distance</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {routeResult.totalDistance.toFixed(1)}
                        <span className="text-sm font-normal text-gray-500 ml-1">mi</span>
                      </p>
                    </div>
                    
                    <div className="p-4 rounded-xl bg-gray-50">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4" style={{ color: accentColor }} />
                        <span className="text-xs font-medium text-gray-500">Total Time</span>
                      </div>
                      <p className="text-2xl font-bold" style={{ color: accentColor }}>
                        {formatTime(routeResult.totalTime)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Departure & Arrival */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Departure</p>
                        {etas[0] && (
                          <>
                            <p className="text-lg font-bold text-gray-900">
                              {etas[0].toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-xs text-gray-500">
                              {etas[0].toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </p>
                          </>
                        )}
                      </div>
                      
                      <ArrowRight className="w-5 h-5 text-blue-400" />
                      
                      <div className="text-right">
                        <p className="text-xs font-medium text-gray-500 mb-1">Arrival</p>
                        {etas[etas.length - 1] && (
                          <>
                            <p className="text-lg font-bold" style={{ color: accentColor }}>
                              {etas[etas.length - 1].toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-xs text-gray-500">
                              {etas[etas.length - 1].toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              )}
            </div>

            {/* Stops List */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Stops ({stops.length})
              </h2>
              
              <div className="space-y-3">
                {stops.map((stop, index) => {
                  const eta = etas[index];
                  const isFirst = index === 0;
                  const isLast = index === stops.length - 1;
                  
                  return (
                    <div key={index} className="relative">
                      {/* Connecting line */}
                      {!isLast && (
                        <div 
                          className="absolute left-[15px] top-[36px] w-0.5 h-[calc(100%+4px)]"
                          style={{ background: `${accentColor}30` }}
                        />
                      )}
                      
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 relative z-10">
                        {/* Stop Number */}
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
                          style={{ 
                            background: isFirst || isLast ? accentColor : '#6b7280',
                            color: 'white' 
                          }}
                        >
                          {index + 1}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isFirst && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
                                START
                              </span>
                            )}
                            {isLast && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                                END
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-900 font-medium truncate" title={stop.address}>
                            {stop.address}
                          </p>
                          {eta && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Timer className="w-3 h-3 text-gray-400" />
                              <span className="text-xs text-gray-500">
                                ETA: <span className="font-semibold" style={{ color: accentColor }}>
                                  {eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {eta && (
                          <div className="flex-shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-gray-300" />
                          </div>
                        )}
                      </div>
                      
                      {/* Leg info between stops */}
                      {routeResult?.legs[index] && (
                        <div className="ml-[15px] pl-6 py-2 text-xs text-gray-400 flex items-center gap-2">
                          <CornerDownRight className="w-3 h-3" />
                          <span>{routeResult.legs[index].distance.toFixed(1)} mi</span>
                          <span>·</span>
                          <span>{formatTime(routeResult.legs[index].time)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Last Updated Info */}
            {lastUpdated && (
              <div className="bg-white rounded-2xl shadow-lg p-4">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-7">
                  Route automatically refreshes every 5 minutes with live traffic data
                </p>
              </div>
            )}
          </div>

          {/* Right Column - Map */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden sticky top-24">
              <MapQuestMap
                apiKey={API_KEY}
                center={mapCenter}
                zoom={stops.length > 0 ? 10 : 4}
                darkMode={darkMode}
                accentColor={accentColor}
                height="600px"
                markers={markers}
                showRoute={!!routeResult && stops.length >= 2}
                routeStart={stops.length >= 2 ? { lat: stops[0].lat, lng: stops[0].lng } : undefined}
                routeEnd={stops.length >= 2 ? { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng } : undefined}
                waypoints={routeWaypoints}
                stops={stops.map(s => ({ lat: s.lat, lng: s.lng }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center text-sm text-gray-500">
          <Truck className="w-4 h-4 mr-2" />
          <span>Route shared via <strong>MapQuest Multi-Stop Planner</strong></span>
        </div>
      </div>
    </div>
  );
}
