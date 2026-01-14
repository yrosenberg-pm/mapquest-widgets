// components/widgets/MultiStopPlanner.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { 
  Plus, Trash2, GripVertical, Loader2, RotateCcw, Route, 
  Sparkles, Clock, Check, AlertTriangle, XCircle,
  Download, Share2, Shuffle, Navigation, MoreHorizontal,
  MapPin, Timer, TrendingDown, List, ArrowRight,
  Edit3, CornerDownRight, Waypoints, Calendar
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
  duration: number;
  eta?: Date;
}

interface LegInfo {
  from: string;
  to: string;
  distance: number;
  time: number;
  trafficCondition?: 'light' | 'moderate' | 'heavy';
  routeType?: 'fastest' | 'shortest';
  avoidHighways?: boolean;
  avoidTolls?: boolean;
}

interface RouteResult {
  totalDistance: number;
  totalTime: number;
  legs: LegInfo[];
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
  const [originalRoute, setOriginalRoute] = useState<{ distance: number; time: number } | null>(null);
  const [departureTime, setDepartureTime] = useState<Date>(new Date());
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [selectedRouteType, setSelectedRouteType] = useState<'fastest' | 'shortest' | 'balanced'>('fastest');
  const [sidebarView, setSidebarView] = useState<'stops' | 'route' | 'segments'>('stops');
  const [segmentSettings, setSegmentSettings] = useState<Record<number, { 
    routeType: 'fastest' | 'shortest'; 
    avoidHighways: boolean; 
    avoidTolls: boolean;
    deliveryWindowStart: string;
    deliveryWindowEnd: string;
    stopDuration: number;
  }>>({});
  const [highlightedSegment, setHighlightedSegment] = useState<number | null>(null);
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const departurePickerRef = useRef<HTMLDivElement | null>(null);

  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const departureDateValue = `${departureTime.getFullYear()}-${pad2(departureTime.getMonth() + 1)}-${pad2(departureTime.getDate())}`;
  const departureTimeValue = `${pad2(departureTime.getHours())}:${pad2(departureTime.getMinutes())}`;
  const setDepartureFromParts = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) return;
    const next = new Date(`${dateStr}T${timeStr}:00`);
    if (!isNaN(next.getTime())) setDepartureTime(next);
  };

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false);
      }
      if (showDeparturePicker && departurePickerRef.current && !departurePickerRef.current.contains(target)) {
        setShowDeparturePicker(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [showMoreMenu, showDeparturePicker]);

  const addStop = () => {
    if (stops.length < maxStops) {
      setStops([...stops, { id: Date.now().toString(), address: '', duration: 0 }]);
      setRouteResult(null);
    }
  };

  const removeStop = (id: string) => {
    if (stops.length > 2) {
      setStops(stops.filter(s => s.id !== id));
      setRouteResult(null);
    }
  };

  const clearAllStops = () => {
    setStops([
      { id: '1', address: '', duration: 0 },
      { id: '2', address: '', duration: 0 },
    ]);
    setRouteResult(null);
    setOriginalRoute(null);
    setShowMoreMenu(false);
    setSidebarView('stops');
    setSegmentSettings({});
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

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
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
    // Clear route result - user needs to click "Recalculate" or "Optimize" to update
    setRouteResult(null);
    setOriginalRoute(null);
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
    setHighlightedSegment(null);
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
      // Don't auto-switch tabs - let user control their view
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate route');
    } finally {
      setLoading(false);
    }
  };

  const calculateRoute = () => calculateRouteForStops(stops, selectedRouteType === 'balanced' ? 'fastest' : selectedRouteType);

  // Build a distance matrix using real route calculations
  const buildDistanceMatrix = async (stopsForMatrix: Stop[]): Promise<number[][]> => {
    const n = stopsForMatrix.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    console.log(`📊 Building ${n}x${n} distance matrix with real routes...`);
    
    // Fetch all pairwise distances
    const promises: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          promises.push((async () => {
            const from = `${stopsForMatrix[i].lat},${stopsForMatrix[i].lng}`;
            const to = `${stopsForMatrix[j].lat},${stopsForMatrix[j].lng}`;
            try {
              const result = await getDirections(from, to, 'fastest');
              matrix[i][j] = result?.time || Infinity; // Use time as the metric (accounts for traffic/roads)
            } catch {
              matrix[i][j] = Infinity;
            }
          })());
        }
      }
    }
    
    await Promise.all(promises);
    console.log('✅ Distance matrix complete');
    return matrix;
  };

  // Optimize route using real road distances
  const optimizeStopOrder = async (stopsToOptimize: Stop[]): Promise<Stop[]> => {
    if (stopsToOptimize.length <= 2) return stopsToOptimize;
    
    // Build distance matrix using actual route calculations
    const distanceMatrix = await buildDistanceMatrix(stopsToOptimize);
    
    const getTotalTime = (indices: number[]): number => {
      let total = 0;
      for (let i = 0; i < indices.length - 1; i++) {
        total += distanceMatrix[indices[i]][indices[i + 1]];
      }
      return total;
    };

    // Keep first stop fixed (starting point), optimize the rest
    const n = stopsToOptimize.length;
    const restIndices = Array.from({ length: n - 1 }, (_, i) => i + 1);
    
    // For small sets (up to 7 stops to permute), try all permutations
    if (restIndices.length <= 7) {
      const permute = (arr: number[]): number[][] => {
        if (arr.length <= 1) return [arr];
        const result: number[][] = [];
        for (let i = 0; i < arr.length; i++) {
          const current = arr[i];
          const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
          const perms = permute(remaining);
          for (const perm of perms) {
            result.push([current, ...perm]);
          }
        }
        return result;
      };

      const allPermutations = permute(restIndices);
      let bestOrder = restIndices;
      let bestTime = Infinity;

      for (const perm of allPermutations) {
        const fullRoute = [0, ...perm]; // 0 is the first stop (fixed)
        const time = getTotalTime(fullRoute);
        if (time < bestTime) {
          bestTime = time;
          bestOrder = perm;
        }
      }

      console.log(`🔍 Checked ${allPermutations.length} permutations using real routes`);
      const optimalIndices = [0, ...bestOrder];
      return optimalIndices.map(i => stopsToOptimize[i]);
    }
    
    // For larger sets, use nearest neighbor with real distances
    const optimizedIndices: number[] = [0]; // Start with first stop
    const remaining = new Set(restIndices);
    
    while (remaining.size > 0) {
      const current = optimizedIndices[optimizedIndices.length - 1];
      let bestNext = -1;
      let bestTime = Infinity;
      
      for (const next of remaining) {
        const time = distanceMatrix[current][next];
        if (time < bestTime) {
          bestTime = time;
          bestNext = next;
        }
      }
      
      if (bestNext !== -1) {
        optimizedIndices.push(bestNext);
        remaining.delete(bestNext);
      } else {
        // Fallback: just add remaining in order
        for (const r of remaining) {
          optimizedIndices.push(r);
        }
        break;
      }
    }
    
    return optimizedIndices.map(i => stopsToOptimize[i]);
  };

  const handleOptimizeRoute = async () => {
    const currentValidStops = stops.filter(s => s.lat && s.lng);
    if (currentValidStops.length < 3) { 
      setError('Need at least 3 geocoded stops to optimize. Click "Get Route" first.'); 
      return; 
    }

    setOptimizing(true);
    setError(null);
    setHighlightedSegment(null);
    
    console.log('═══════════════════════════════════════════');
    console.log('🚀 ROUTE OPTIMIZATION STARTED');
    console.log('═══════════════════════════════════════════');
    console.log('📍 Original stop order:');
    currentValidStops.forEach((s, i) => console.log(`   ${i + 1}. ${s.address}`));
    
    try {
      // Save original route metrics if not already saved
      if (!originalRoute && routeResult) {
        setOriginalRoute({ distance: routeResult.totalDistance, time: routeResult.totalTime });
      } else if (!originalRoute) {
        // Calculate original if we don't have it
        let originalDistance = 0, originalTime = 0;
        for (let i = 0; i < currentValidStops.length - 1; i++) {
          const from = `${currentValidStops[i].lat},${currentValidStops[i].lng}`;
          const to = `${currentValidStops[i + 1].lat},${currentValidStops[i + 1].lng}`;
          const d = await getDirections(from, to, 'fastest');
          if (d) { originalDistance += d.distance; originalTime += d.time; }
        }
        setOriginalRoute({ distance: originalDistance, time: originalTime });
        console.log(`📊 Original route: ${originalDistance.toFixed(1)} mi, ${Math.round(originalTime)} min`);
      }

      // Optimize stop ORDER using real route calculations
      console.log('🔄 Optimizing stop order using real routes...');
      const optimizedStops = await optimizeStopOrder(currentValidStops);
      
      // Check if order actually changed
      const orderChanged = optimizedStops.some((stop, i) => stop.id !== currentValidStops[i].id);
      
      console.log('📍 Optimized stop order:');
      optimizedStops.forEach((s, i) => {
        const originalIdx = currentValidStops.findIndex(v => v.id === s.id);
        const moved = originalIdx !== i ? ` (was #${originalIdx + 1})` : '';
        console.log(`   ${i + 1}. ${s.address}${moved}`);
      });
      
      if (!orderChanged) {
        console.log('ℹ️ Route order is already optimal!');
        setError('Route order is already optimal - no changes needed.');
        setOptimizing(false);
        return;
      }
      
      // Apply the new order with fresh IDs to force React re-render
      const reorderedStops: Stop[] = optimizedStops.map((s, i) => ({ 
        ...s, 
        id: `opt-${Date.now()}-${i}`,
        geocoded: true,
      }));
      
      // Clear current route to force redraw
      setRouteResult(null);
      
      // Update stops state with new order
      setStops(reorderedStops);
      
      // Small delay to ensure state updates propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Calculate the new route with optimized order - directly compute without geocoding
      setLoading(true);
      let totalDistance = 0, totalTime = 0;
      const legs: LegInfo[] = [];

      for (let i = 0; i < reorderedStops.length - 1; i++) {
        const from = `${reorderedStops[i].lat},${reorderedStops[i].lng}`;
        const to = `${reorderedStops[i + 1].lat},${reorderedStops[i + 1].lng}`;
        const directions = await getDirections(from, to, 'fastest', departureTime);
        if (directions) {
          totalDistance += directions.distance;
          totalTime += directions.time;
          const expectedTime = directions.distance * 2;
          let trafficCondition: 'light' | 'moderate' | 'heavy' = 'light';
          if (directions.time > expectedTime * 1.3) trafficCondition = 'heavy';
          else if (directions.time > expectedTime * 1.1) trafficCondition = 'moderate';
          legs.push({ 
            from: reorderedStops[i].address, 
            to: reorderedStops[i + 1].address, 
            distance: directions.distance, 
            time: directions.time, 
            trafficCondition 
          });
        }
      }

      const result = { totalDistance, totalTime, legs };
      setRouteResult(result);
      calculateETAs(reorderedStops, result);
      setLoading(false);
      // Don't auto-switch tabs - user can see the new order in their current view
      
      console.log(`✅ Optimized route: ${totalDistance.toFixed(1)} mi, ${Math.round(totalTime)} min`);
      console.log('═══════════════════════════════════════════');

    } catch (err) {
      console.error('❌ Optimization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to optimize route');
    } finally {
      setOptimizing(false);
    }
  };


  const addRandomStops = async () => {
    setLoading(true);
    setShowMoreMenu(false);
    try {
      // Predefined LA landmarks for reliable demo stops
      const laStops: Stop[] = [
        { id: `demo-${Date.now()}-0`, address: 'Santa Monica Pier, Santa Monica, CA', lat: 34.0094, lng: -118.4973, geocoded: true, duration: 0 },
        { id: `demo-${Date.now()}-1`, address: 'Griffith Observatory, Los Angeles, CA', lat: 34.1184, lng: -118.3004, geocoded: true, duration: 0 },
        { id: `demo-${Date.now()}-2`, address: 'Hollywood Sign, Los Angeles, CA', lat: 34.1341, lng: -118.3215, geocoded: true, duration: 0 },
        { id: `demo-${Date.now()}-3`, address: 'The Getty Center, Los Angeles, CA', lat: 34.0780, lng: -118.4741, geocoded: true, duration: 0 },
        { id: `demo-${Date.now()}-4`, address: 'Venice Beach, Venice, CA', lat: 33.9850, lng: -118.4695, geocoded: true, duration: 0 },
        { id: `demo-${Date.now()}-5`, address: 'Universal Studios Hollywood, Universal City, CA', lat: 34.1381, lng: -118.3534, geocoded: true, duration: 0 },
      ];
      
      // Shuffle and pick 5 stops
      const shuffled = laStops.sort(() => Math.random() - 0.5);
      const selectedStops = shuffled.slice(0, 5);
      
      setStops(selectedStops);
      setRouteResult(null);
      setOriginalRoute(null);
      // Map will auto-center on LA based on the new stops
    } catch { setError('Failed to add demo stops'); }
    finally { setLoading(false); }
  };

  const generateShareUrl = async () => {
    const validStops = stops.filter(s => s.lat && s.lng);
    if (validStops.length < 2) return;
    const shareData = {
      stops: validStops.map(s => ({ address: s.address, lat: s.lat, lng: s.lng })),
      type: selectedRouteType,
      departureTime: departureTime.toISOString(),
      companyName: companyName,
    };
    // Use URL-safe base64 encoding (replace +/= with URL-safe chars)
    const data = btoa(JSON.stringify(shareData))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const url = `${window.location.origin}/share/${data}`;
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
    setOriginalRoute(null);
    setHighlightedSegment(null);
    setError(null);
    setSidebarView('stops');
    setSegmentSettings({});
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
      className="prism-widget w-full md:w-[1100px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className="flex flex-col md:flex-row md:h-[715px]">
        {/* Map - shown first on mobile */}
        <div className="relative h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={validStops.length > 0 ? 10 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            showRoute={!!routeResult && validStops.length >= 2}
            routeStart={routeResult && validStops.length >= 2 ? { lat: validStops[0].lat!, lng: validStops[0].lng! } : undefined}
            routeEnd={routeResult && validStops.length >= 2 ? { lat: validStops[validStops.length - 1].lat!, lng: validStops[validStops.length - 1].lng! } : undefined}
            waypoints={routeResult ? routeWaypoints : []}
            highlightedSegment={highlightedSegment}
            stops={validStops.map(s => ({ lat: s.lat!, lng: s.lng! }))}
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
        {/* Sidebar */}
        <div 
          className="w-full md:w-[420px] flex flex-col flex-shrink-0 border-t md:border-t-0 md:border-r flex-1 md:flex-initial min-h-[300px] md:min-h-0 md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          
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
            <div className="relative" ref={moreMenuRef}>
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

          {/* View Toggle Tabs */}
          <div className="px-3 pt-3 pb-2">
            <div 
              className="flex p-1 rounded-xl gap-0.5"
              style={{ background: 'var(--bg-input)' }}
            >
              <button
                onClick={() => setSidebarView('stops')}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-all"
                style={{ 
                  background: sidebarView === 'stops' ? 'var(--bg-widget)' : 'transparent',
                  color: sidebarView === 'stops' ? accentColor : 'var(--text-muted)',
                  boxShadow: sidebarView === 'stops' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <List className="w-3.5 h-3.5" />
                Stops
              </button>
              <button
                onClick={() => setSidebarView('segments')}
                disabled={!routeResult}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40"
                style={{ 
                  background: sidebarView === 'segments' ? 'var(--bg-widget)' : 'transparent',
                  color: sidebarView === 'segments' ? accentColor : 'var(--text-muted)',
                  boxShadow: sidebarView === 'segments' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Segments
              </button>
              <button
                onClick={() => {
                  setSidebarView('route');
                  setHighlightedSegment(null); // Clear highlight to zoom out and show full route
                }}
                disabled={!routeResult}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40"
                style={{ 
                  background: sidebarView === 'route' ? 'var(--bg-widget)' : 'transparent',
                  color: sidebarView === 'route' ? accentColor : 'var(--text-muted)',
                  boxShadow: sidebarView === 'route' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <Route className="w-3.5 h-3.5" />
                Summary
              </button>
            </div>
          </div>

          {/* Content Area - Stops List or Route Details */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {sidebarView === 'stops' ? (
              /* Stops List View - Drag to reorder */
              <>
                <div className="space-y-1.5">
                  {stops.map((stop, index) => (
                    <div 
                      key={stop.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnter={(e) => handleDragEnter(e, index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={resetDragState}
                      className={`rounded-xl transition-all cursor-grab active:cursor-grabbing ${draggedIndex === index ? 'opacity-40 scale-95' : ''}`}
                      style={{
                        background: dragOverIndex === index 
                          ? `${accentColor}15` 
                          : 'var(--bg-input)',
                        border: dragOverIndex === index 
                          ? `2px dashed ${accentColor}` 
                          : '1px solid var(--border-subtle)',
                        padding: '10px 12px',
                        transform: dragOverIndex === index ? 'scale(1.02)' : 'scale(1)',
                      }}
                    >
                      {/* Main Row */}
                      <div className="flex items-center gap-2.5">
                        <GripVertical className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                        
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
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

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {stop.geocoded && (
                            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-success)' }} title="Geocoded" />
                          )}
                          
                          {stops.length > 2 && (
                            <button 
                              onClick={() => removeStop(stop.id)} 
                              className="p-1 rounded-lg transition-colors hover:bg-black/10" 
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
              </>
            ) : sidebarView === 'segments' ? (
              /* Segments Editor View */
              <div className="space-y-3">
                {routeResult ? (
                  <>
                    {/* Segments Header */}
                    <div 
                      className="p-3 rounded-xl"
                      style={{ 
                        background: `linear-gradient(135deg, ${accentColor}12 0%, ${accentColor}05 100%)`,
                        border: `1px solid ${accentColor}20`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Waypoints className="w-4 h-4" style={{ color: accentColor }} />
                        <span className="text-xs font-semibold" style={{ color: accentColor }}>Edit Route Segments</span>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Customize routing options for each segment individually
                      </p>
                    </div>

                    {/* Editable Segments List */}
                    <div className="space-y-2">
                      {routeResult.legs.map((leg, index) => {
                        const toStop = validStops[index + 1];
                        const defaultSettings = { 
                          routeType: 'fastest' as const, 
                          avoidHighways: false, 
                          avoidTolls: false,
                          deliveryWindowStart: '',
                          deliveryWindowEnd: '',
                          stopDuration: toStop?.duration || 0,
                        };
                        const settings = { ...defaultSettings, ...segmentSettings[index] };
                        
                        const isHighlighted = highlightedSegment === index;
                        
                        return (
                          <div 
                            key={index}
                            className="rounded-xl overflow-hidden transition-all duration-200 cursor-pointer"
                            style={{ 
                              background: isHighlighted 
                                ? `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}08 100%)`
                                : 'var(--bg-input)',
                              border: isHighlighted 
                                ? `2px solid ${accentColor}` 
                                : '1px solid var(--border-subtle)',
                              boxShadow: isHighlighted 
                                ? `0 4px 20px ${accentColor}30, 0 0 0 3px ${accentColor}15` 
                                : 'none',
                              transform: isHighlighted ? 'scale(1.01)' : 'scale(1)',
                            }}
                            onClick={() => setHighlightedSegment(isHighlighted ? null : index)}
                          >
                            {/* Segment Header - Clickable to highlight */}
                            <div 
                              className="px-3 py-2.5"
                              style={{ 
                                borderBottom: isHighlighted ? `1px solid ${accentColor}30` : 'none',
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div 
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-transform"
                                  style={{ 
                                    background: accentColor, 
                                    color: 'white',
                                    transform: isHighlighted ? 'scale(1.1)' : 'scale(1)',
                                    boxShadow: isHighlighted ? `0 2px 8px ${accentColor}50` : 'none',
                                  }}
                                >
                                  {index + 1}
                                </div>
                                <CornerDownRight className="w-3 h-3" style={{ color: isHighlighted ? accentColor : 'var(--text-muted)' }} />
                                <div 
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-transform"
                                  style={{ 
                                    background: accentColor, 
                                    color: 'white',
                                    transform: isHighlighted ? 'scale(1.1)' : 'scale(1)',
                                    boxShadow: isHighlighted ? `0 2px 8px ${accentColor}50` : 'none',
                                  }}
                                >
                                  {index + 2}
                                </div>
                                <span className="text-xs font-semibold" style={{ color: isHighlighted ? accentColor : 'var(--text-main)' }}>
                                  Segment {index + 1}
                                </span>
                                {isHighlighted && (
                                  <span 
                                    className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                                    style={{ background: accentColor, color: 'white' }}
                                  >
                                    Viewing
                                  </span>
                                )}
                                <span className="ml-auto text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                                  {leg.distance.toFixed(1)} mi · {formatTime(leg.time)}
                                </span>
                              </div>
                              
                              {/* Destination Address */}
                              <div 
                                className="px-2.5 py-2 rounded-lg mb-3"
                                style={{ background: 'var(--bg-panel)' }}
                              >
                                <p className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
                                  Destination (Stop {index + 2})
                                </p>
                                <p className="text-[11px] truncate" style={{ color: 'var(--text-main)' }} title={leg.to}>
                                  {leg.to}
                                </p>
                              </div>

                              {/* Delivery Window & Stop Duration */}
                              <div className="space-y-2 mb-3" onClick={(e) => e.stopPropagation()}>
                                <label className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: accentColor }}>
                                  Delivery Window
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                                      Earliest
                                    </label>
                                    <input
                                      type="time"
                                      value={settings.deliveryWindowStart}
                                      onChange={(e) => setSegmentSettings(prev => ({ 
                                        ...prev, 
                                        [index]: { ...settings, deliveryWindowStart: e.target.value } 
                                      }))}
                                      className="w-full px-2 py-1.5 rounded-lg text-[11px]"
                                      style={{ 
                                        background: 'var(--bg-widget)', 
                                        border: '1px solid var(--border-subtle)', 
                                        color: 'var(--text-main)' 
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                                      Latest
                                    </label>
                                    <input
                                      type="time"
                                      value={settings.deliveryWindowEnd}
                                      onChange={(e) => setSegmentSettings(prev => ({ 
                                        ...prev, 
                                        [index]: { ...settings, deliveryWindowEnd: e.target.value } 
                                      }))}
                                      className="w-full px-2 py-1.5 rounded-lg text-[11px]"
                                      style={{ 
                                        background: 'var(--bg-widget)', 
                                        border: '1px solid var(--border-subtle)', 
                                        color: 'var(--text-main)' 
                                      }}
                                    />
                                  </div>
                                </div>
                                
                                {/* Stop Duration */}
                                <div>
                                  <label className="text-[9px] font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                                    Duration at Stop
                                  </label>
                                  <select
                                    value={settings.stopDuration}
                                    onChange={(e) => setSegmentSettings(prev => ({ 
                                      ...prev, 
                                      [index]: { ...settings, stopDuration: parseInt(e.target.value) } 
                                    }))}
                                    className="w-full px-2 py-1.5 rounded-lg text-[11px]"
                                    style={{ 
                                      background: 'var(--bg-widget)', 
                                      border: '1px solid var(--border-subtle)', 
                                      color: 'var(--text-main)' 
                                    }}
                                  >
                                    <option value={0}>No stop time</option>
                                    <option value={5}>5 minutes</option>
                                    <option value={10}>10 minutes</option>
                                    <option value={15}>15 minutes</option>
                                    <option value={20}>20 minutes</option>
                                    <option value={30}>30 minutes</option>
                                    <option value={45}>45 minutes</option>
                                    <option value={60}>1 hour</option>
                                    <option value={90}>1.5 hours</option>
                                    <option value={120}>2 hours</option>
                                  </select>
                                </div>
                              </div>

                              {/* Route Options */}
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <label className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: accentColor }}>
                                  Route Options
                                </label>
                                
                                {/* Route Type */}
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setSegmentSettings(prev => ({ 
                                      ...prev, 
                                      [index]: { ...settings, routeType: 'fastest' } 
                                    }))}
                                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all"
                                    style={{
                                      background: settings.routeType === 'fastest' ? `${accentColor}15` : 'var(--bg-panel)',
                                      border: `1px solid ${settings.routeType === 'fastest' ? accentColor : 'var(--border-subtle)'}`,
                                      color: settings.routeType === 'fastest' ? accentColor : 'var(--text-muted)',
                                    }}
                                  >
                                    Fastest
                                  </button>
                                  <button
                                    onClick={() => setSegmentSettings(prev => ({ 
                                      ...prev, 
                                      [index]: { ...settings, routeType: 'shortest' } 
                                    }))}
                                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all"
                                    style={{
                                      background: settings.routeType === 'shortest' ? `${accentColor}15` : 'var(--bg-panel)',
                                      border: `1px solid ${settings.routeType === 'shortest' ? accentColor : 'var(--border-subtle)'}`,
                                      color: settings.routeType === 'shortest' ? accentColor : 'var(--text-muted)',
                                    }}
                                  >
                                    Shortest
                                  </button>
                                </div>

                                {/* Avoid Options */}
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setSegmentSettings(prev => ({ 
                                      ...prev, 
                                      [index]: { ...settings, avoidHighways: !settings.avoidHighways } 
                                    }))}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all"
                                    style={{
                                      background: settings.avoidHighways ? '#ef444415' : 'var(--bg-panel)',
                                      border: `1px solid ${settings.avoidHighways ? '#ef4444' : 'var(--border-subtle)'}`,
                                      color: settings.avoidHighways ? '#ef4444' : 'var(--text-muted)',
                                    }}
                                  >
                                    {settings.avoidHighways && <Check className="w-3 h-3" />}
                                    Avoid Highways
                                  </button>
                                  <button
                                    onClick={() => setSegmentSettings(prev => ({ 
                                      ...prev, 
                                      [index]: { ...settings, avoidTolls: !settings.avoidTolls } 
                                    }))}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all"
                                    style={{
                                      background: settings.avoidTolls ? '#f59e0b15' : 'var(--bg-panel)',
                                      border: `1px solid ${settings.avoidTolls ? '#f59e0b' : 'var(--border-subtle)'}`,
                                      color: settings.avoidTolls ? '#f59e0b' : 'var(--text-muted)',
                                    }}
                                  >
                                    {settings.avoidTolls && <Check className="w-3 h-3" />}
                                    Avoid Tolls
                                  </button>
                                </div>
                              </div>
                            </div>
                            
                            {/* ETA Warning if outside delivery window */}
                            {toStop?.eta && settings.deliveryWindowStart && settings.deliveryWindowEnd && (() => {
                              const eta = toStop.eta;
                              const etaMinutes = eta.getHours() * 60 + eta.getMinutes();
                              const [startH, startM] = settings.deliveryWindowStart.split(':').map(Number);
                              const [endH, endM] = settings.deliveryWindowEnd.split(':').map(Number);
                              const startMinutes = startH * 60 + startM;
                              const endMinutes = endH * 60 + endM;
                              const isOutside = etaMinutes < startMinutes || etaMinutes > endMinutes;
                              const isTight = !isOutside && (etaMinutes > endMinutes - 15);
                              
                              if (isOutside) {
                                return (
                                  <div 
                                    className="px-3 py-2 flex items-center gap-2"
                                    style={{ background: '#ef444415', borderTop: '1px solid #ef444430' }}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                                    <span className="text-[10px] font-medium" style={{ color: '#ef4444' }}>
                                      ETA {eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} is outside delivery window
                                    </span>
                                  </div>
                                );
                              } else if (isTight) {
                                return (
                                  <div 
                                    className="px-3 py-2 flex items-center gap-2"
                                    style={{ background: '#f59e0b15', borderTop: '1px solid #f59e0b30' }}
                                  >
                                    <Clock className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                                    <span className="text-[10px] font-medium" style={{ color: '#f59e0b' }}>
                                      ETA {eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - cutting it close!
                                    </span>
                                  </div>
                                );
                              }
                              return (
                                <div 
                                  className="px-3 py-2 flex items-center gap-2"
                                  style={{ background: '#22c55e10', borderTop: '1px solid #22c55e20' }}
                                >
                                  <Check className="w-3.5 h-3.5" style={{ color: '#22c55e' }} />
                                  <span className="text-[10px] font-medium" style={{ color: '#22c55e' }}>
                                    ETA {eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - within window
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Edit3 className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No segments to edit</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                      Calculate a route first to edit segments
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Route Summary View - Clean overview without list */
              <div className="space-y-3">
                {routeResult ? (
                  <>
                    {/* Hero Stats Card */}
                    <div 
                      className="p-4 rounded-2xl text-center"
                      style={{ 
                        background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 100%)`,
                        border: `1px solid ${accentColor}25`,
                      }}
                    >
                      {/* Main Stats - Side by Side */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div 
                          className="p-3 rounded-xl"
                          style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}
                        >
                          <div className="flex items-center justify-center gap-2 mb-1.5">
                            <Route className="w-3.5 h-3.5" style={{ color: accentColor }} />
                            <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                              Distance
                            </span>
                          </div>
                          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
                            {routeResult.totalDistance.toFixed(1)}
                            <span className="text-xs font-medium ml-1" style={{ color: 'var(--text-muted)' }}>mi</span>
                          </p>
                        </div>
                        <div 
                          className="p-3 rounded-xl"
                          style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}
                        >
                          <div className="flex items-center justify-center gap-2 mb-1.5">
                            <Clock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                            <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                              Duration
                            </span>
                          </div>
                          <p className="text-2xl font-bold tracking-tight" style={{ color: accentColor }}>
                            {formatTime(routeResult.totalTime)}
                          </p>
                        </div>
                      </div>
                      
                      {/* Stats Pills */}
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <span 
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                          style={{ background: 'var(--bg-widget)', color: 'var(--text-secondary)' }}
                        >
                          {validStops.length} stops
                        </span>
                        <span 
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                          style={{ background: 'var(--bg-widget)', color: 'var(--text-secondary)' }}
                        >
                          {routeResult.legs.length} segments
                        </span>
                      </div>
                    </div>

                    {/* Departure & Arrival Card */}
                    <div 
                      className="p-4 rounded-xl"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                            Departure
                          </p>
                          <p className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>
                            {departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {departureTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="h-px w-8" style={{ background: 'var(--border-default)' }} />
                          <ArrowRight className="w-4 h-4" style={{ color: accentColor }} />
                          <div className="h-px w-8" style={{ background: 'var(--border-default)' }} />
                        </div>
                        
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                            Arrival
                          </p>
                          {validStops.length > 0 && validStops[validStops.length - 1]?.eta ? (
                            <>
                              <p className="text-sm font-bold" style={{ color: accentColor }}>
                                {validStops[validStops.length - 1].eta!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {validStops[validStops.length - 1].eta!.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>--:--</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Optimization Savings */}
                    {originalRoute && (routeResult.totalTime < originalRoute.time || routeResult.totalDistance < originalRoute.distance) && (
                      <div 
                        className="p-4 rounded-xl"
                        style={{ 
                          background: 'linear-gradient(135deg, #22c55e12 0%, #10b98108 100%)',
                          border: '1px solid #22c55e25',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: '#22c55e20' }}
                          >
                            <TrendingDown className="w-5 h-5" style={{ color: '#22c55e' }} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>Route Optimized!</p>
                            <div className="flex items-center gap-3 mt-1">
                              {routeResult.totalTime < originalRoute.time && (
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  <strong style={{ color: '#22c55e' }}>{formatTime(originalRoute.time - routeResult.totalTime)}</strong> saved
                                </span>
                              )}
                              {routeResult.totalDistance < originalRoute.distance && (
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  <strong style={{ color: '#22c55e' }}>{(originalRoute.distance - routeResult.totalDistance).toFixed(1)} mi</strong> shorter
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Original</p>
                            <p className="text-xs line-through" style={{ color: 'var(--text-muted)' }}>
                              {originalRoute.distance.toFixed(1)} mi · {formatTime(originalRoute.time)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={downloadRouteSheet}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                      >
                        <Download className="w-4 h-4" />
                        Export Route
                      </button>
                      <button
                        onClick={generateShareUrl}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all"
                        style={{ 
                          background: copySuccess ? '#22c55e15' : 'var(--bg-input)', 
                          border: `1px solid ${copySuccess ? '#22c55e' : 'var(--border-subtle)'}`, 
                          color: copySuccess ? '#22c55e' : 'var(--text-secondary)' 
                        }}
                      >
                        {copySuccess ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                        {copySuccess ? 'Copied!' : 'Share Route'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Route className="w-12 h-12 mb-3" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No route summary yet</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                      Calculate a route to see the summary
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mx-4 mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="p-4 space-y-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {sidebarView === 'stops' && (
              <div
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}25` }}
                  title="Departure time"
                >
                  <Clock className="w-4 h-4" style={{ color: accentColor }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
                      Depart
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {departureTime.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="relative mt-1" ref={departurePickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowDeparturePicker(v => !v)}
                      className="w-full px-3 py-2 rounded-xl text-sm font-medium outline-none transition-all flex items-center justify-between gap-2"
                      style={{
                        background: 'var(--bg-input)',
                        border: `1px solid ${showDeparturePicker ? `${accentColor}80` : 'var(--border-subtle)'}`,
                        color: 'var(--text-main)',
                        boxShadow: showDeparturePicker
                          ? `0 0 0 4px ${accentColor}20`
                          : '0 1px 0 rgba(255,255,255,0.06) inset',
                      }}
                    >
                      <span className="truncate">
                        {departureTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
                        ·{' '}
                        {departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    </button>

                    {showDeparturePicker && (
                      <div
                        className="absolute left-0 right-0 top-full mt-2 rounded-2xl p-3 z-50"
                        style={{
                          background: 'var(--bg-widget)',
                          border: '1px solid var(--border-subtle)',
                          boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Departure
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowDeparturePicker(false)}
                            className="text-xs font-medium px-2 py-1 rounded-lg"
                            style={{
                              background: 'var(--bg-panel)',
                              color: 'var(--text-muted)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            Done
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                              Date
                            </label>
                            <input
                              type="date"
                              value={departureDateValue}
                              onChange={(e) => setDepartureFromParts(e.target.value, departureTimeValue)}
                              className="w-full mt-1 px-3 py-2 rounded-xl text-sm font-medium outline-none"
                              style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-main)',
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                              Time
                            </label>
                            <input
                              type="time"
                              value={departureTimeValue}
                              onChange={(e) => setDepartureFromParts(departureDateValue, e.target.value)}
                              className="w-full mt-1 px-3 py-2 rounded-xl text-sm font-medium outline-none"
                              style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-main)',
                              }}
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-4 gap-2">
                          <button
                            type="button"
                            onClick={() => { setDepartureTime(new Date()); setShowDeparturePicker(false); }}
                            className="px-2 py-2 rounded-xl text-[11px] font-semibold transition-all"
                            style={{
                              background: 'var(--bg-panel)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            Now
                          </button>
                          {[15, 30, 60].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => {
                                setDepartureTime(new Date(Date.now() + mins * 60 * 1000));
                                setShowDeparturePicker(false);
                              }}
                              className="px-2 py-2 rounded-xl text-[11px] font-semibold transition-all"
                              style={{
                                background: `${accentColor}12`,
                                border: `1px solid ${accentColor}25`,
                                color: accentColor,
                              }}
                            >
                              +{mins}m
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={calculateRoute}
                disabled={loading || optimizing || stops.filter(s => s.address.trim()).length < 2}
                className="prism-btn prism-btn-primary flex-1 py-3 text-sm"
                style={{ background: accentColor }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                <span className="ml-2">
                  {loading ? 'Calculating...' : routeResult ? 'Recalculate' : 'Get Route'}
                </span>
              </button>
              
              {routeResult && validStops.length >= 3 && (
                <button
                  onClick={handleOptimizeRoute}
                  disabled={optimizing || loading}
                  className="px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                  style={{ 
                    background: optimizing ? accentColor : `${accentColor}15`, 
                    color: optimizing ? 'white' : accentColor 
                  }}
                  title="Reorder stops for shortest route"
                >
                  {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {optimizing ? 'Optimizing...' : 'Optimize Order'}
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
