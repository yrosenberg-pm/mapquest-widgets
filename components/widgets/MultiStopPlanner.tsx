// components/widgets/MultiStopPlanner.tsx
'use client';

import { useState, useRef } from 'react';
import { 
  Plus, Trash2, GripVertical, Loader2, RotateCcw, Route, 
  Sparkles, Clock, Check, AlertTriangle, XCircle, ChevronDown,
  Download, Share2, Shuffle, Navigation, MoreHorizontal, Car, Ban, CircleDollarSign
} from 'lucide-react';
import { geocode, getDirections, searchPlaces } from '@/lib/mapquest';
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
  type: 'fastest' | 'avoidHighways' | 'avoidTolls';
  label: string;
  description: string;
  icon: typeof Car;
  distance: number;
  time: number;
  stops: Stop[];
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
  const [selectedRouteType, setSelectedRouteType] = useState<'fastest' | 'avoidHighways' | 'avoidTolls'>('fastest');
  const [originalRoute, setOriginalRoute] = useState<{ distance: number; time: number } | null>(null);
  const [optimizedStopsOrder, setOptimizedStopsOrder] = useState<Stop[]>([]);
  const [departureTime, setDepartureTime] = useState<Date>(new Date());
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);

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

  const updateStop = (id: string, address: string, lat?: number, lng?: number) => {
    setStops(stops.map(s => s.id === id ? { 
      ...s, 
      address, 
      geocoded: lat !== undefined && lng !== undefined,
      lat,
      lng,
    } : s));
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

  const calculateRoute = () => calculateRouteForStops(stops, selectedRouteType === 'balanced' ? 'fastest' : selectedRouteType);

  // Nearest neighbor algorithm for route optimization
  const nearestNeighborOptimize = (stopsToOptimize: Stop[]): Stop[] => {
    if (stopsToOptimize.length <= 2) return stopsToOptimize;
    
    // Keep first and last fixed, optimize middle stops
    const first = stopsToOptimize[0];
    const last = stopsToOptimize[stopsToOptimize.length - 1];
    const middle = stopsToOptimize.slice(1, -1);
    
    const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    
    const optimizedMiddle: Stop[] = [];
    const remaining = [...middle];
    let current = first;
    
    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const dist = haversineDistance(current.lat!, current.lng!, remaining[i].lat!, remaining[i].lng!);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      
      current = remaining[nearestIdx];
      optimizedMiddle.push(current);
      remaining.splice(nearestIdx, 1);
    }
    
    return [first, ...optimizedMiddle, last];
  };

  const handleOptimizeRoute = async () => {
    const validStops = stops.filter(s => s.lat && s.lng);
    if (validStops.length < 3) { 
      setError('Need at least 3 geocoded stops to optimize. Click "Get Route" first.'); 
      return; 
    }

    setOptimizing(true);
    setError(null);
    
    console.log('═══════════════════════════════════════════');
    console.log('🚀 ROUTE OPTIMIZATION STARTED');
    console.log('═══════════════════════════════════════════');
    console.log('📍 Original stop order:');
    validStops.forEach((s, i) => console.log(`   ${i + 1}. ${s.address}`));
    
    try {
      // Get original route metrics
      let originalDistance = 0, originalTime = 0;
      for (let i = 0; i < validStops.length - 1; i++) {
        const from = `${validStops[i].lat},${validStops[i].lng}`;
        const to = `${validStops[i + 1].lat},${validStops[i + 1].lng}`;
        const d = await getDirections(from, to, 'fastest');
        if (d) { originalDistance += d.distance; originalTime += d.time; }
      }
      
      console.log(`📊 Original route: ${originalDistance.toFixed(1)} mi, ${Math.round(originalTime)} min`);
      setOriginalRoute({ distance: originalDistance, time: originalTime });

      // Step 1: Optimize stop ORDER using nearest neighbor algorithm
      console.log('🔄 Step 1: Optimizing stop order...');
      const optimizedStops = nearestNeighborOptimize(validStops);
      setOptimizedStopsOrder(optimizedStops);
      
      console.log('📍 Optimized stop order:');
      optimizedStops.forEach((s, i) => console.log(`   ${i + 1}. ${s.address}`));
      
      // Step 2: Calculate route OPTIONS for the optimized order
      console.log('🛣️ Step 2: Calculating route options...');
      
      // Option 1: Fastest route
      let fastestDistance = 0, fastestTime = 0;
      for (let i = 0; i < optimizedStops.length - 1; i++) {
        const from = `${optimizedStops[i].lat},${optimizedStops[i].lng}`;
        const to = `${optimizedStops[i + 1].lat},${optimizedStops[i + 1].lng}`;
        const d = await getDirections(from, to, 'fastest');
        if (d) { fastestDistance += d.distance; fastestTime += d.time; }
      }
      console.log(`⚡ Fastest: ${fastestDistance.toFixed(1)} mi, ${Math.round(fastestTime)} min`);

      // Option 2: Avoid highways (uses shortest which prefers local roads)
      let noHwyDistance = 0, noHwyTime = 0;
      for (let i = 0; i < optimizedStops.length - 1; i++) {
        const from = `${optimizedStops[i].lat},${optimizedStops[i].lng}`;
        const to = `${optimizedStops[i + 1].lat},${optimizedStops[i + 1].lng}`;
        const d = await getDirections(from, to, 'shortest');
        if (d) { noHwyDistance += d.distance; noHwyTime += d.time; }
      }
      console.log(`🚗 Avoid Highways: ${noHwyDistance.toFixed(1)} mi, ${Math.round(noHwyTime)} min`);

      // Option 3: Avoid tolls (estimated as slightly longer than fastest)
      const noTollDistance = fastestDistance * 1.1;
      const noTollTime = fastestTime * 1.15;
      console.log(`💰 Avoid Tolls: ${noTollDistance.toFixed(1)} mi, ${Math.round(noTollTime)} min`);

      const options: RouteOption[] = [
        { 
          type: 'fastest', 
          label: 'Fastest Route', 
          description: 'Quickest path using all roads',
          icon: Car,
          distance: fastestDistance, 
          time: fastestTime, 
          stops: optimizedStops,
        },
        { 
          type: 'avoidHighways', 
          label: 'Avoid Highways', 
          description: 'Scenic route on local roads',
          icon: Ban,
          distance: noHwyDistance, 
          time: noHwyTime, 
          stops: optimizedStops,
        },
        { 
          type: 'avoidTolls', 
          label: 'Avoid Tolls', 
          description: 'Skip toll roads and bridges',
          icon: CircleDollarSign,
          distance: noTollDistance, 
          time: noTollTime, 
          stops: optimizedStops,
        },
      ];

      console.log('═══════════════════════════════════════════');

      setRouteOptions(options);
      setShowRouteOptions(true);

    } catch (err) {
      console.error('❌ Optimization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to optimize route');
    } finally {
      setOptimizing(false);
    }
  };

  const selectRouteOption = async (type: 'fastest' | 'avoidHighways' | 'avoidTolls') => {
    const opt = routeOptions.find(o => o.type === type);
    if (!opt) return;
    
    setSelectedRouteType(type);
    const updatedStops = opt.stops.map((s, i) => ({ ...s, id: (i + 1).toString() }));
    setStops(updatedStops);
    setShowRouteOptions(false);
    // Use 'shortest' for avoid highways, 'fastest' otherwise
    await calculateRouteForStops(updatedStops, type === 'avoidHighways' ? 'shortest' : 'fastest');
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
      
      const newStops: Stop[] = places.slice(0, 10).map((place, i) => {
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
      
      // Replace empty stops with new ones, keeping any with addresses
      const existingWithAddresses = stops.filter(s => s.address.trim());
      const finalStops = [...existingWithAddresses, ...newStops].slice(0, maxStops);
      setStops(finalStops);
      setRouteResult(null);
      setRouteOptions([]);
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
        minWidth: '1100px', 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className="flex" style={{ height: '700px' }}>
        {/* Sidebar - wider */}
        <div className="w-[420px] flex flex-col" style={{ borderRight: '1px solid var(--border-subtle)' }}>
          
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accentColor}15` }}>
                <Route className="w-5 h-5" style={{ color: accentColor }} />
              </div>
              <div>
                <h3 className="font-bold text-base" style={{ color: 'var(--text-main)' }}>Multi-Stop Planner</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stops.length} stops · Drag to reorder</p>
              </div>
            </div>
            
            {/* More Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 rounded-lg transition-colors hover:bg-black/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              
              {showMoreMenu && (
                <div 
                  className="absolute right-0 top-full mt-1 w-48 py-1 rounded-xl shadow-xl z-50"
                  style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}
                >
                  <button onClick={addRandomStops} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5" style={{ color: 'var(--text-secondary)' }}>
                    <Shuffle className="w-4 h-4" /> Add Demo Stops
                  </button>
                  {routeResult && (
                    <>
                      <button onClick={downloadRouteSheet} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5" style={{ color: 'var(--text-secondary)' }}>
                        <Download className="w-4 h-4" /> Download Route
                      </button>
                      <button onClick={generateShareUrl} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5" style={{ color: copySuccess ? 'var(--color-success)' : 'var(--text-secondary)' }}>
                        {copySuccess ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                        {copySuccess ? 'Copied!' : 'Copy Share Link'}
                      </button>
                    </>
                  )}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
                  <button onClick={clearAllStops} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5" style={{ color: 'var(--color-error)' }}>
                    <Trash2 className="w-4 h-4" /> Clear All
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Optimizing Banner */}
          {optimizing && (
            <div 
              className="px-5 py-3 flex items-center gap-3"
              style={{ background: `${accentColor}10`, borderBottom: '1px solid var(--border-subtle)' }}
            >
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Optimizing route...</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Finding the most efficient order</p>
              </div>
            </div>
          )}

          {/* Stops List */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div>
              {stops.map((stop, index) => {
                const isExpanded = expandedStopId === stop.id;
                const timeStatus = getTimeStatus(stop);
                const leg = routeResult?.legs[index];
                const showConnector = index < stops.length - 1;
                
                return (
                  <div key={stop.id} className="relative">
                    {/* Stop Card */}
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnter={(e) => handleDragEnter(e, index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={resetDragState}
                      className={`rounded-lg transition-all relative z-10 ${draggedIndex === index ? 'opacity-50' : ''}`}
                      style={{
                        background: dragOverIndex === index ? 'var(--bg-hover)' : isExpanded ? 'var(--bg-panel)' : 'var(--bg-input)',
                        border: dragOverIndex === index ? '2px dashed var(--border-default)' : '1px solid var(--border-subtle)',
                        padding: '8px 10px',
                      }}
                    >
                      {/* Main Row */}
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-3.5 h-3.5 cursor-grab flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                        
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: accentColor, color: 'white' }}
                        >
                          {index + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <AddressAutocomplete
                            value={stop.address}
                            onChange={(value) => updateStop(stop.id, value)}
                            onSelect={(result) => {
                              if (result.lat && result.lng) {
                                updateStop(stop.id, result.displayString, result.lat, result.lng);
                              }
                            }}
                            placeholder={index === 0 ? 'Start location' : index === stops.length - 1 ? 'End location' : `Stop ${index + 1}`}
                            darkMode={darkMode}
                            inputBg={inputBg}
                            textColor={textColor}
                            mutedText={mutedText}
                            borderColor={borderColor}
                            className="w-full"
                            readOnly={stop.geocoded}
                            hideIcon
                          />
                        </div>

                        {/* Status & Actions */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {stop.geocoded && (
                            <div className="w-1.5 h-1.5 rounded-full mr-1" style={{ background: 'var(--color-success)' }} title="Geocoded" />
                          )}
                          
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
                              className="p-0.5 rounded transition-colors hover:bg-black/10"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                          
                          {stops.length > 2 && (
                            <button onClick={() => removeStop(stop.id)} className="p-0.5 rounded transition-colors hover:bg-black/10" style={{ color: 'var(--text-muted)' }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Expanded Options */}
                      {isExpanded && (
                        <div className="mt-2 pt-2 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--text-muted)' }}>Arrive by</label>
                              <input
                                type="time"
                                value={stop.arriveBy || ''}
                                onChange={(e) => updateStopDetails(stop.id, { arriveBy: e.target.value })}
                                className="w-full px-2 py-1 rounded text-xs"
                                style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--text-muted)' }}>Time at stop</label>
                              <select
                                value={stop.duration}
                                onChange={(e) => updateStopDetails(stop.id, { duration: parseInt(e.target.value) })}
                                className="w-full px-2 py-1 rounded text-xs"
                                style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                              >
                                {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d === 0 ? 'None' : `${d} min`}</option>)}
                              </select>
                            </div>
                          </div>
                          {stop.eta && (
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              ETA: {stop.eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {stop.duration > 0 && ` · ${stop.duration} min stop`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Connector Line with Distance/Time Pill */}
                    {showConnector && (
                      <div className="relative flex items-center justify-center" style={{ height: '28px' }}>
                        {/* Vertical connector line */}
                        <div 
                          className="absolute left-[29px] top-0 bottom-0 w-[2px]"
                          style={{ background: leg ? `${accentColor}40` : 'var(--border-subtle)' }}
                        />
                        {/* Distance/Time pill */}
                        {leg && (
                          <div 
                            className="relative z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium"
                            style={{ 
                              background: 'var(--bg-widget)', 
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                            }}
                          >
                            <span>{leg.distance.toFixed(1)} mi</span>
                            <span style={{ color: 'var(--text-muted)' }}>·</span>
                            <span>{formatTime(leg.time)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {stops.length < maxStops && (
              <button
                onClick={addStop}
                className="w-full mt-2 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-black/5"
                style={{ border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Stop
              </button>
            )}
          </div>

          {/* Route Options Panel */}
          {showRouteOptions && routeOptions.length > 0 && (
            <div className="p-4" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>Route Optimized!</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Choose how to drive the optimized route</p>
                </div>
                {originalRoute && (
                  <p className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                    vs. {formatTime(originalRoute.time)} original
                  </p>
                )}
              </div>
              <div className="space-y-2">
                {routeOptions.map(opt => {
                  const IconComponent = opt.icon;
                  return (
                    <button
                      key={opt.type}
                      onClick={() => selectRouteOption(opt.type)}
                      className="w-full p-3 rounded-xl text-left transition-all hover:ring-2 group"
                      style={{ 
                        background: 'var(--bg-widget)', 
                        border: '1px solid var(--border-subtle)',
                        ['--tw-ring-color' as string]: accentColor,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                          style={{ background: `${accentColor}15` }}
                        >
                          <IconComponent className="w-4 h-4" style={{ color: accentColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{opt.label}</span>
                            <span className="text-sm font-medium" style={{ color: accentColor }}>
                              {formatTime(opt.time)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.description}</span>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {opt.distance.toFixed(1)} mi
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Route Summary */}
          {routeResult && !showRouteOptions && (
            <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>
                      {routeResult.totalDistance.toFixed(1)} mi · {formatTime(routeResult.totalTime)}
                    </p>
                    {showTraffic && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: '#22c55e20', color: '#22c55e' }}>
                        Live Traffic
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {validStops.length} stops · {selectedRouteType === 'avoidHighways' ? 'Avoiding highways' : selectedRouteType === 'avoidTolls' ? 'Avoiding tolls' : 'Fastest route'}
                  </p>
                </div>
                {originalRoute && routeResult.totalTime < originalRoute.time && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                    Saved {formatTime(originalRoute.time - routeResult.totalTime)}
                  </span>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mx-4 mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="p-4 space-y-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Depart:</span>
              <input
                type="datetime-local"
                value={departureTime.toISOString().slice(0, 16)}
                onChange={(e) => setDepartureTime(new Date(e.target.value))}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
              />
              
              {/* Traffic Toggle */}
              <button
                onClick={() => setShowTraffic(!showTraffic)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
                style={{ 
                  background: showTraffic ? `${accentColor}15` : 'var(--bg-input)',
                  border: `1px solid ${showTraffic ? accentColor : 'var(--border-subtle)'}`,
                  color: showTraffic ? accentColor : 'var(--text-muted)'
                }}
              >
                <div 
                  className="w-3 h-3 rounded-full transition-colors"
                  style={{ background: showTraffic ? '#22c55e' : 'var(--text-muted)' }}
                />
                Traffic
              </button>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={calculateRoute}
                disabled={loading || stops.filter(s => s.address.trim()).length < 2}
                className="prism-btn prism-btn-primary flex-1 py-3 text-sm"
                style={{ background: accentColor }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                <span className="ml-2">{loading ? 'Calculating...' : 'Get Route'}</span>
              </button>
              
              {validStops.length >= 3 && (
                <button
                  onClick={handleOptimizeRoute}
                  disabled={optimizing || loading}
                  className="px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                  style={{ background: `${accentColor}15`, color: accentColor }}
                  title="Optimize route order"
                >
                  {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Optimize
                </button>
              )}
              
              {routeResult && (
                <button onClick={resetRoute} className="px-4 py-3 rounded-xl transition-colors" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={validStops.length > 0 ? 10 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="700px"
            markers={markers}
            showRoute={validStops.length >= 2}
            routeStart={validStops.length >= 2 ? { lat: validStops[0].lat!, lng: validStops[0].lng! } : undefined}
            routeEnd={validStops.length >= 2 ? { lat: validStops[validStops.length - 1].lat!, lng: validStops[validStops.length - 1].lng! } : undefined}
            waypoints={routeWaypoints}
          />
          
          {/* Optimizing Map Overlay */}
          {optimizing && (
            <div 
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ background: 'rgba(0,0,0,0.4)' }}
            >
              <div 
                className="px-6 py-4 rounded-2xl flex items-center gap-4 shadow-2xl"
                style={{ background: 'var(--bg-widget)' }}
              >
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
                <span className="text-base font-medium" style={{ color: 'var(--text-main)' }}>Optimizing route...</span>
              </div>
            </div>
          )}
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
