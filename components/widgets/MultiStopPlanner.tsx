// components/widgets/MultiStopPlanner.tsx
'use client';

import { useState, useRef } from 'react';
import { Plus, Trash2, GripVertical, Loader2, RotateCcw, ArrowUpDown, Route } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

interface Stop {
  id: string;
  address: string;
  lat?: number;
  lng?: number;
  geocoded?: boolean;
}

interface RouteResult {
  totalDistance: number;
  totalTime: number;
  legs: { distance: number; time: number }[];
}

interface MultiStopPlannerProps {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  maxStops?: number;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

export default function MultiStopPlanner({
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  maxStops = 10,
}: MultiStopPlannerProps) {
  const [stops, setStops] = useState<Stop[]>([
    { id: '1', address: '' },
    { id: '2', address: '' },
  ]);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const addStop = () => {
    if (stops.length < maxStops) {
      setStops([...stops, { id: Date.now().toString(), address: '' }]);
      setRouteResult(null);
    }
  };

  const removeStop = (id: string) => {
    if (stops.length > 2) {
      setStops(stops.filter(s => s.id !== id));
      setRouteResult(null);
    }
  };

  const updateStop = (id: string, address: string) => {
    setStops(stops.map(s => s.id === id ? { ...s, address, geocoded: false } : s));
    setRouteResult(null);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    dragNode.current = e.target as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    setTimeout(() => {
      if (dragNode.current) {
        dragNode.current.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      resetDragState();
      return;
    }

    const newStops = [...stops];
    const [draggedStop] = newStops.splice(draggedIndex, 1);
    newStops.splice(dropIndex, 0, draggedStop);
    
    setStops(newStops);
    resetDragState();
    setRouteResult(null);

    const validStops = newStops.filter(s => s.lat && s.lng);
    if (validStops.length >= 2) {
      await calculateRouteForStops(newStops);
    }
  };

  const handleDragEnd = () => {
    resetDragState();
  };

  const resetDragState = () => {
    if (dragNode.current) {
      dragNode.current.style.opacity = '1';
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNode.current = null;
  };

  const geocodeStops = async (stopsToGeocode: Stop[]): Promise<Stop[]> => {
    const geocodedStops = await Promise.all(
      stopsToGeocode.map(async (stop) => {
        if (stop.geocoded && stop.lat && stop.lng) return stop;
        if (!stop.address.trim()) return stop;

        try {
          const result = await geocode(stop.address);
          if (result && result.lat && result.lng) {
            return { ...stop, lat: result.lat, lng: result.lng, geocoded: true };
          }
        } catch (err) {
          console.error('Geocode error:', err);
        }
        return stop;
      })
    );
    return geocodedStops;
  };

  const calculateRouteForStops = async (stopsToCalc: Stop[]) => {
    setLoading(true);
    setError(null);

    try {
      const geocodedStops = await geocodeStops(stopsToCalc);
      setStops(geocodedStops);
      
      const validStops = geocodedStops.filter(s => s.lat && s.lng);
      if (validStops.length < 2) {
        throw new Error('Need at least 2 valid addresses');
      }

      const waypoints = validStops.map(s => ({ lat: s.lat!, lng: s.lng! }));
      
      let totalDistance = 0;
      let totalTime = 0;
      const legs: { distance: number; time: number }[] = [];

      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = `${waypoints[i].lat},${waypoints[i].lng}`;
        const to = `${waypoints[i + 1].lat},${waypoints[i + 1].lng}`;
        const directions = await getDirections(from, to);
        if (directions) {
          totalDistance += directions.distance;
          totalTime += directions.time;
          legs.push({ distance: directions.distance, time: directions.time });
        }
      }

      setRouteResult({ totalDistance, totalTime, legs });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate route');
    } finally {
      setLoading(false);
    }
  };

  const calculateRoute = async () => {
    await calculateRouteForStops(stops);
  };

  const resetRoute = () => {
    setRouteResult(null);
    setError(null);
  };

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const validStops = stops.filter(s => s.lat && s.lng);
  
  const mapCenter = validStops.length > 0
    ? {
        lat: validStops.reduce((sum, s) => sum + s.lat!, 0) / validStops.length,
        lng: validStops.reduce((sum, s) => sum + s.lng!, 0) / validStops.length,
      }
    : { lat: 39.8283, lng: -98.5795 };

  const markers = validStops.map((stop, index) => ({
    lat: stop.lat!,
    lng: stop.lng!,
    label: `${index + 1}`,
    color: darkMode ? '#6b7280' : '#4b5563',
  }));

  const routeWaypoints = validStops.length > 2 
    ? validStops.slice(1, -1).map(s => ({ lat: s.lat!, lng: s.lng! }))
    : undefined;

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
            className="p-3"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${accentColor}15` }}
              >
                <span style={{ color: accentColor }}><Route className="w-4 h-4" /></span>
              </div>
              <div>
                <h3 
                  className="font-bold"
                  style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
                >
                  Multi-Stop Planner
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Drag stops to reorder
                </p>
              </div>
            </div>
          </div>

          {/* Stops List */}
          <div className="flex-1 overflow-y-auto prism-scrollbar p-3 min-h-0">
            <div className="space-y-1.5">
              {stops.map((stop, index) => (
                <div
                  key={stop.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-1.5 p-2 rounded-lg transition-all ${
                    draggedIndex === index ? 'opacity-50' : ''
                  }`}
                  style={{
                    background: dragOverIndex === index ? 'var(--bg-hover)' : 'transparent',
                    border: dragOverIndex === index ? '2px dashed var(--border-default)' : '2px solid transparent',
                  }}
                >
                  <GripVertical 
                    className="w-4 h-4 cursor-grab active:cursor-grabbing flex-shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                    style={{ 
                      background: 'var(--bg-panel)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {index + 1}
                  </div>

                  <div className="relative flex-1">
                    <AddressAutocomplete
                      value={stop.address}
                      onChange={(value) => updateStop(stop.id, value)}
                      onSelect={(result) => {
                        if (result.lat && result.lng) {
                          updateStop(stop.id, result.displayString);
                          setStops(stops.map(s => s.id === stop.id ? { ...s, lat: result.lat, lng: result.lng, geocoded: true } : s));
                        }
                      }}
                      placeholder={index === 0 ? 'Start address' : index === stops.length - 1 ? 'End address' : `Stop ${index + 1}`}
                      darkMode={darkMode}
                      inputBg={inputBg}
                      textColor={textColor}
                      mutedText={mutedText}
                      borderColor={borderColor}
                      className="w-full"
                    />
                    {stop.geocoded && (
                      <div 
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full z-20"
                        style={{ background: 'var(--color-success)' }}
                        title="Geocoded" 
                      />
                    )}
                  </div>

                  {stops.length > 2 && (
                    <button
                      onClick={() => removeStop(stop.id)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {stops.length < maxStops && (
              <button
                onClick={addStop}
                className="w-full mt-2 py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
                style={{ 
                  border: '2px dashed var(--border-default)',
                  color: 'var(--text-muted)',
                }}
              >
                <Plus className="w-4 h-4" />
                Add Stop
              </button>
            )}
          </div>

          {/* Route Summary */}
          {routeResult && (
            <div 
              className="p-3"
              style={{ 
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span 
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-main)' }}
                >
                  Route Summary
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div 
                  className="p-2 rounded-lg"
                  style={{ 
                    background: 'var(--bg-widget)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Distance</p>
                  <p 
                    className="text-lg font-semibold"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {routeResult.totalDistance.toFixed(1)} mi
                  </p>
                </div>
                <div 
                  className="p-2 rounded-lg"
                  style={{ 
                    background: 'var(--bg-widget)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Time</p>
                  <p 
                    className="text-lg font-semibold"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {formatTime(routeResult.totalTime)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div 
              className="mx-3 mb-3 p-2.5 rounded-lg text-sm"
              style={{ 
                background: 'var(--color-error-bg)',
                border: '1px solid var(--color-error)',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div 
            className="p-3"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <div className="flex gap-2">
              <button
                onClick={calculateRoute}
                disabled={loading || stops.filter(s => s.address.trim()).length < 2}
                className="prism-btn prism-btn-primary flex-1 text-sm"
                style={{ 
                  background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                  boxShadow: `0 4px 12px ${accentColor}40`,
                }}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 prism-spinner" /> Calculating...</>
                ) : (
                  <><ArrowUpDown className="w-4 h-4" /> Calculate Route</>
                )}
              </button>
              {routeResult && (
                <button
                  onClick={resetRoute}
                  className="px-3 py-2 rounded-lg transition-colors"
                  style={{ 
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                  title="Reset"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={validStops.length > 0 ? 10 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="500px"
            markers={markers}
            showRoute={validStops.length >= 2}
            routeStart={validStops.length >= 2 ? { lat: validStops[0].lat!, lng: validStops[0].lng! } : undefined}
            routeEnd={validStops.length >= 2 ? { lat: validStops[validStops.length - 1].lat!, lng: validStops[validStops.length - 1].lng! } : undefined}
            waypoints={routeWaypoints}
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
