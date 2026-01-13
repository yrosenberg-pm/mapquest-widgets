// components/widgets/MultiStopPlanner.tsx
'use client';

import { useState, useRef } from 'react';
import { 
  Plus, Trash2, GripVertical, Loader2, RotateCcw, Route, 
  Sparkles, Clock, Check, AlertTriangle, XCircle, ChevronDown,
  Download, Share2, Shuffle, Navigation, MoreHorizontal
} from 'lucide-react';
import { geocode, getDirections, optimizeRoute, searchPlaces } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

interface Stop {
  id: string;
  address: string;
  lat?: number;
  lng?: number;
  geocoded?: boolean;
  arriveBy?: string;
  duration: number;
  eta?: Date;
}

interface LegInfo {
  from: string;
  to: string;
  distance: number;
  time: number;
  trafficCondition?: 'light' | 'moderate' | 'heavy';
}

interface RouteResult {
  totalDistance: number;
  totalTime: number;
  legs: LegInfo[];
}

interface RouteOption {
  type: 'fastest' | 'shortest' | 'balanced';
  label: string;
  distance: number;
  time: number;
  stops: Stop[];
  savings?: { time: number };
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
const DURATION_OPTIONS = [0, 5, 10, 15, 30, 45, 60];

export default function MultiStopPlanner({
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  maxStops = 25,
}: MultiStopPlannerProps) {
  const [stops, setStops] = useState<Stop[]>([
    { id: '1', address: '', duration: 0 },
    { id: '2', address: '', duration: 0 },
  ]);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  // UI State
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [showRouteOptions, setShowRouteOptions] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteType, setSelectedRouteType] = useState<'fastest' | 'shortest' | 'balanced'>('fastest');
  const [originalRoute, setOriginalRoute] = useState<{ distance: number; time: number } | null>(null);
  const [departureTime, setDepartureTime] = useState<Date>(new Date());
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const addStop = () => {
    if (stops.length < maxStops) {
      setStops([...stops, { id: Date.now().toString(), address: '', duration: 0 }]);
      setRouteResult(null);
      setRouteOptions([]);
    }
  };

  const removeStop = (id: string) => {
    if (stops.length > 2) {
      setStops(stops.filter(s => s.id !== id));
      setRouteResult(null);
      setRouteOptions([]);
    }
  };

  const clearAllStops = () => {
    setStops([
      { id: '1', address: '', duration: 0 },
      { id: '2', address: '', duration: 0 },
    ]);
    setRouteResult(null);
    setRouteOptions([]);
    setOriginalRoute(null);
    setShowMoreMenu(false);
  };

  const updateStop = (id: string, address: string) => {
    setStops(stops.map(s => s.id === id ? { ...s, address, geocoded: false } : s));
    setRouteResult(null);
    setRouteOptions([]);
  };

  const updateStopDetails = (id: string, updates: Partial<Stop>) => {
    setStops(stops.map(s => s.id === id ? { ...s, ...updates } : s));
    if (routeResult && updates.duration !== undefined) {
      calculateETAs(stops.map(s => s.id === id ? { ...s, ...updates } : s), routeResult);
    }
  };

  const calculateETAs = (stopsToCalc: Stop[], result: RouteResult) => {
    let currentTime = new Date(departureTime);
    const updatedStops = stopsToCalc.map((stop, index) => {
      if (index > 0 && result.legs[index - 1]) {
        currentTime = new Date(currentTime.getTime() + result.legs[index - 1].time * 60 * 1000);
      }
      const eta = new Date(currentTime);
      currentTime = new Date(currentTime.getTime() + stop.duration * 60 * 1000);
      return { ...stop, eta };
    });
    setStops(updatedStops);
  };

  const getTimeStatus = (stop: Stop): 'ontime' | 'close' | 'late' | null => {
    if (!stop.arriveBy || !stop.eta) return null;
    const [hours, minutes] = stop.arriveBy.split(':').map(Number);
    const deadline = new Date(stop.eta);
    deadline.setHours(hours, minutes, 0, 0);
    const diff = (deadline.getTime() - stop.eta.getTime()) / 60000;
    if (diff < 0) return 'late';
    if (diff <= 10) return 'close';
    return 'ontime';
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    dragNode.current = e.target as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if (dragNode.current) dragNode.current.style.opacity = '0.5'; }, 0);
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index);
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
    if (validStops.length >= 2) await calculateRouteForStops(newStops);
  };

  const resetDragState = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNode.current = null;
  };

  const geocodeStops = async (stopsToGeocode: Stop[]): Promise<Stop[]> => {
    return Promise.all(stopsToGeocode.map(async (stop) => {
      if (stop.geocoded && stop.lat && stop.lng) return stop;
      if (!stop.address.trim()) return stop;
      try {
        const result = await geocode(stop.address);
        if (result?.lat && result?.lng) {
          return { ...stop, lat: result.lat, lng: result.lng, geocoded: true };
        }
      } catch (err) { console.error('Geocode error:', err); }
      return stop;
    }));
  };

  const calculateRouteForStops = async (stopsToCalc: Stop[], routeType: 'fastest' | 'shortest' = 'fastest') => {
    setLoading(true);
    setError(null);
    try {
      const geocodedStops = await geocodeStops(stopsToCalc);
      setStops(geocodedStops);
      const validStops = geocodedStops.filter(s => s.lat && s.lng);
      if (validStops.length < 2) throw new Error('Need at least 2 valid addresses');

      let totalDistance = 0, totalTime = 0;
      const legs: LegInfo[] = [];

      for (let i = 0; i < validStops.length - 1; i++) {
        const from = `${validStops[i].lat},${validStops[i].lng}`;
        const to = `${validStops[i + 1].lat},${validStops[i + 1].lng}`;
        const directions = await getDirections(from, to, routeType, departureTime);
        if (directions) {
          totalDistance += directions.distance;
          totalTime += directions.time;
          const expectedTime = directions.distance * 2;
          let trafficCondition: 'light' | 'moderate' | 'heavy' = 'light';
          if (directions.time > expectedTime * 1.3) trafficCondition = 'heavy';
          else if (directions.time > expectedTime * 1.1) trafficCondition = 'moderate';
          legs.push({ from: validStops[i].address, to: validStops[i + 1].address, distance: directions.distance, time: directions.time, trafficCondition });
        }
      }

      const result = { totalDistance, totalTime, legs };
      setRouteResult(result);
      if (!originalRoute) setOriginalRoute({ distance: totalDistance, time: totalTime });
      calculateETAs(geocodedStops, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate route');
    } finally {
      setLoading(false);
    }
  };

  const calculateRoute = () => calculateRouteForStops(stops, selectedRouteType);

  const handleOptimizeRoute = async () => {
    const validStops = stops.filter(s => s.lat && s.lng);
    if (validStops.length < 3) { setError('Need at least 3 stops to optimize'); return; }

    setOptimizing(true);
    setError(null);
    try {
      // Get original metrics
      let originalDistance = 0, originalTime = 0;
      for (let i = 0; i < validStops.length - 1; i++) {
        const from = `${validStops[i].lat},${validStops[i].lng}`;
        const to = `${validStops[i + 1].lat},${validStops[i + 1].lng}`;
        const d = await getDirections(from, to, 'fastest');
        if (d) { originalDistance += d.distance; originalTime += d.time; }
      }
      setOriginalRoute({ distance: originalDistance, time: originalTime });

      const locations = validStops.map(s => ({ lat: s.lat!, lng: s.lng! }));
      const optimized = await optimizeRoute(locations);
      if (!optimized) throw new Error('Optimization failed');

      const optimizedStops = optimized.locationSequence.map(idx => validStops[idx]);
      
      // Calculate fastest route
      let fastestDistance = 0, fastestTime = 0;
      for (let i = 0; i < optimizedStops.length - 1; i++) {
        const from = `${optimizedStops[i].lat},${optimizedStops[i].lng}`;
        const to = `${optimizedStops[i + 1].lat},${optimizedStops[i + 1].lng}`;
        const d = await getDirections(from, to, 'fastest');
        if (d) { fastestDistance += d.distance; fastestTime += d.time; }
      }

      // Calculate shortest route
      let shortestDistance = 0, shortestTime = 0;
      for (let i = 0; i < optimizedStops.length - 1; i++) {
        const from = `${optimizedStops[i].lat},${optimizedStops[i].lng}`;
        const to = `${optimizedStops[i + 1].lat},${optimizedStops[i + 1].lng}`;
        const d = await getDirections(from, to, 'shortest');
        if (d) { shortestDistance += d.distance; shortestTime += d.time; }
      }

      const options: RouteOption[] = [
        { type: 'fastest', label: 'Fastest', distance: fastestDistance, time: fastestTime, stops: optimizedStops, savings: { time: originalTime - fastestTime } },
        { type: 'shortest', label: 'Shortest', distance: shortestDistance, time: shortestTime, stops: optimizedStops, savings: { time: originalTime - shortestTime } },
        { type: 'balanced', label: 'Balanced', distance: (fastestDistance + shortestDistance) / 2, time: (fastestTime + shortestTime) / 2, stops: optimizedStops, savings: { time: originalTime - (fastestTime + shortestTime) / 2 } },
      ];

      setRouteOptions(options);
      setShowRouteOptions(true);
      selectRouteOption('fastest', options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to optimize route');
    } finally {
      setOptimizing(false);
    }
  };

  const selectRouteOption = async (type: 'fastest' | 'shortest' | 'balanced', options?: RouteOption[]) => {
    const opt = (options || routeOptions).find(o => o.type === type);
    if (!opt) return;
    setSelectedRouteType(type);
    const updatedStops = opt.stops.map((s, i) => ({ ...s, id: (i + 1).toString() }));
    setStops(updatedStops);
    setShowRouteOptions(false);
    await calculateRouteForStops(updatedStops, type === 'balanced' ? 'fastest' : type);
  };

  const addRandomStops = async () => {
    setLoading(true);
    setShowMoreMenu(false);
    try {
      const validStops = stops.filter(s => s.lat && s.lng);
      let centerLat = 40.7128, centerLng = -74.0060;
      if (validStops.length > 0) {
        centerLat = validStops.reduce((sum, s) => sum + s.lat!, 0) / validStops.length;
        centerLng = validStops.reduce((sum, s) => sum + s.lng!, 0) / validStops.length;
      }
      
      const categories = ['restaurant', 'gas station', 'coffee shop', 'hotel', 'pharmacy'];
      const places = await searchPlaces(centerLat, centerLng, `q:${categories[Math.floor(Math.random() * categories.length)]}`, 15, 15);
      
      const newStops = places.slice(0, 10).map((place, i) => {
        const coords = place.place?.geometry?.coordinates;
        return {
          id: Date.now().toString() + i,
          address: place.displayString || place.name,
          lat: coords ? coords[1] : undefined,
          lng: coords ? coords[0] : undefined,
          geocoded: !!coords,
          duration: 0,
        };
      }).filter(s => s.lat && s.lng);
      
      setStops([...stops.filter(s => s.address.trim()), ...newStops].slice(0, maxStops));
    } catch { setError('Failed to add random stops'); }
    finally { setLoading(false); }
  };

  const generateShareUrl = async () => {
    const validStops = stops.filter(s => s.lat && s.lng);
    if (validStops.length < 2) return;
    const data = btoa(JSON.stringify({ stops: validStops.map(s => ({ address: s.address, lat: s.lat, lng: s.lng })), type: selectedRouteType }));
    const url = `${window.location.origin}?route=${data}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch { console.error('Failed to copy'); }
    setShowMoreMenu(false);
  };

  const downloadRouteSheet = () => {
    if (!routeResult) return;
    const validStops = stops.filter(s => s.lat && s.lng);
    const content = `ROUTE SHEET - ${new Date().toLocaleDateString()}\n${'='.repeat(40)}\n\nTotal: ${routeResult.totalDistance.toFixed(1)} mi | ${formatTime(routeResult.totalTime)}\n\nSTOPS:\n${validStops.map((s, i) => `${i + 1}. ${s.address}${s.eta ? ` (ETA: ${s.eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}`).join('\n')}\n\nLEGS:\n${routeResult.legs.map((l, i) => `${i + 1}. ${l.distance.toFixed(1)} mi, ${formatTime(l.time)}`).join('\n')}\n\nPowered by MapQuest`;
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `route-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setShowMoreMenu(false);
  };

  const resetRoute = () => {
    setRouteResult(null);
    setRouteOptions([]);
    setOriginalRoute(null);
    setError(null);
    setShowRouteOptions(false);
  };

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const validStops = stops.filter(s => s.lat && s.lng);
  const mapCenter = validStops.length > 0
    ? { lat: validStops.reduce((sum, s) => sum + s.lat!, 0) / validStops.length, lng: validStops.reduce((sum, s) => sum + s.lng!, 0) / validStops.length }
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
      <div className="flex" style={{ height: '520px' }}>
        {/* Sidebar */}
        <div className="w-80 flex flex-col" style={{ borderRight: '1px solid var(--border-subtle)' }}>
          
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}15` }}>
                <Route className="w-4 h-4" style={{ color: accentColor }} />
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>Multi-Stop Planner</h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{stops.length} stops</p>
              </div>
            </div>
            
            {/* More Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              
              {showMoreMenu && (
                <div 
                  className="absolute right-0 top-full mt-1 w-40 py-1 rounded-lg shadow-lg z-50"
                  style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}
                >
                  <button onClick={addRandomStops} className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-black/5" style={{ color: 'var(--text-secondary)' }}>
                    <Shuffle className="w-3.5 h-3.5" /> Add Demo Stops
                  </button>
                  {routeResult && (
                    <>
                      <button onClick={downloadRouteSheet} className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-black/5" style={{ color: 'var(--text-secondary)' }}>
                        <Download className="w-3.5 h-3.5" /> Download Route
                      </button>
                      <button onClick={generateShareUrl} className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-black/5" style={{ color: copySuccess ? 'var(--color-success)' : 'var(--text-secondary)' }}>
                        {copySuccess ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                        {copySuccess ? 'Copied!' : 'Copy Share Link'}
                      </button>
                    </>
                  )}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
                  <button onClick={clearAllStops} className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-black/5" style={{ color: 'var(--color-error)' }}>
                    <Trash2 className="w-3.5 h-3.5" /> Clear All
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Stops List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {stops.map((stop, index) => {
              const isExpanded = expandedStopId === stop.id;
              const timeStatus = getTimeStatus(stop);
              
              return (
                <div
                  key={stop.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={resetDragState}
                  className={`rounded-lg transition-all ${draggedIndex === index ? 'opacity-50' : ''}`}
                  style={{
                    background: dragOverIndex === index ? 'var(--bg-hover)' : isExpanded ? 'var(--bg-panel)' : 'transparent',
                    border: dragOverIndex === index ? '2px dashed var(--border-default)' : '2px solid transparent',
                  }}
                >
                  {/* Main Row */}
                  <div className="flex items-center gap-2 py-1">
                    <GripVertical className="w-3.5 h-3.5 cursor-grab flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: `${accentColor}15`, color: accentColor }}
                    >
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <AddressAutocomplete
                        value={stop.address}
                        onChange={(value) => updateStop(stop.id, value)}
                        onSelect={(result) => {
                          if (result.lat && result.lng) {
                            setStops(stops.map(s => s.id === stop.id ? { ...s, address: result.displayString, lat: result.lat, lng: result.lng, geocoded: true } : s));
                          }
                        }}
                        placeholder={index === 0 ? 'Start' : index === stops.length - 1 ? 'End' : `Stop ${index + 1}`}
                        darkMode={darkMode}
                        inputBg={inputBg}
                        textColor={textColor}
                        mutedText={mutedText}
                        borderColor={borderColor}
                        className="w-full"
                      />
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {timeStatus && (
                        <div className="w-4 h-4 flex items-center justify-center">
                          {timeStatus === 'ontime' && <Check className="w-3 h-3" style={{ color: 'var(--color-success)' }} />}
                          {timeStatus === 'close' && <AlertTriangle className="w-3 h-3" style={{ color: 'var(--color-warning)' }} />}
                          {timeStatus === 'late' && <XCircle className="w-3 h-3" style={{ color: 'var(--color-error)' }} />}
                        </div>
                      )}
                      
                      {stop.geocoded && (
                        <button
                          onClick={() => setExpandedStopId(isExpanded ? null : stop.id)}
                          className="p-1 rounded transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      
                      {stops.length > 2 && (
                        <button onClick={() => removeStop(stop.id)} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Expanded Options */}
                  {isExpanded && (
                    <div className="px-2 pb-2 pt-1 ml-10 space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Arrive by</label>
                          <input
                            type="time"
                            value={stop.arriveBy || ''}
                            onChange={(e) => updateStopDetails(stop.id, { arriveBy: e.target.value })}
                            className="w-full px-2 py-1 rounded text-xs"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Duration</label>
                          <select
                            value={stop.duration}
                            onChange={(e) => updateStopDetails(stop.id, { duration: parseInt(e.target.value) })}
                            className="w-full px-2 py-1 rounded text-xs"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                          >
                            {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d === 0 ? 'None' : `${d} min`}</option>)}
                          </select>
                        </div>
                      </div>
                      {stop.eta && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          ETA: {stop.eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {stop.duration > 0 && ` · ${stop.duration}m stop`}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Leg Info (compact) */}
                  {routeResult && index < stops.length - 1 && stops[index + 1].geocoded && routeResult.legs[index] && (
                    <div className="ml-10 mr-2 mb-1 flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      <div 
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ 
                          background: routeResult.legs[index].trafficCondition === 'heavy' ? 'var(--color-error)' :
                                     routeResult.legs[index].trafficCondition === 'moderate' ? 'var(--color-warning)' : 'var(--color-success)'
                        }}
                      />
                      <span>{routeResult.legs[index].distance.toFixed(1)} mi</span>
                      <span>·</span>
                      <span>{formatTime(routeResult.legs[index].time)}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {stops.length < maxStops && (
              <button
                onClick={addStop}
                className="w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                style={{ border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Stop
              </button>
            )}
          </div>

          {/* Route Options Modal */}
          {showRouteOptions && routeOptions.length > 0 && (
            <div className="p-3" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-main)' }}>Choose Route</p>
              <div className="space-y-1.5">
                {routeOptions.map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => selectRouteOption(opt.type)}
                    className="w-full p-2 rounded-lg text-left flex items-center justify-between transition-all"
                    style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>{opt.label}</span>
                      <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>
                        {opt.distance.toFixed(1)} mi · {formatTime(opt.time)}
                      </span>
                    </div>
                    {opt.savings && opt.savings.time > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                        -{formatTime(opt.savings.time)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Route Summary */}
          {routeResult && !showRouteOptions && (
            <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>
                    {routeResult.totalDistance.toFixed(1)} mi
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatTime(routeResult.totalTime)}</p>
                </div>
                {originalRoute && routeResult.totalTime < originalRoute.time && (
                  <div className="text-right">
                    <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                      Saved {formatTime(originalRoute.time - routeResult.totalTime)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mx-3 mb-3 p-2 rounded-lg text-xs" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {/* Departure Time */}
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <input
                type="datetime-local"
                value={departureTime.toISOString().slice(0, 16)}
                onChange={(e) => setDepartureTime(new Date(e.target.value))}
                className="flex-1 px-2 py-1.5 rounded text-xs"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
              />
            </div>
            
            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={calculateRoute}
                disabled={loading || stops.filter(s => s.address.trim()).length < 2}
                className="prism-btn prism-btn-primary flex-1 text-sm py-2"
                style={{ background: accentColor }}
              >
                {loading ? <Loader2 className="w-4 h-4 prism-spinner" /> : <Navigation className="w-4 h-4" />}
                <span className="ml-1.5">{loading ? 'Calculating...' : 'Get Route'}</span>
              </button>
              
              {validStops.length >= 3 && (
                <button
                  onClick={handleOptimizeRoute}
                  disabled={optimizing || loading}
                  className="px-3 py-2 rounded-lg text-sm transition-colors flex items-center"
                  style={{ background: `${accentColor}15`, color: accentColor }}
                  title="Optimize route order"
                >
                  {optimizing ? <Loader2 className="w-4 h-4 prism-spinner" /> : <Sparkles className="w-4 h-4" />}
                </button>
              )}
              
              {routeResult && (
                <button onClick={resetRoute} className="px-3 py-2 rounded-lg transition-colors" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
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
            height="520px"
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
            <img src={companyLogo} alt={companyName || 'Company logo'} className="prism-footer-logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
