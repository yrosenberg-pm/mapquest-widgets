// components/widgets/MultiStopPlanner.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Plus, Trash2, GripVertical, Loader2, RotateCcw, ArrowUpDown, Route, 
  Sparkles, Clock, Check, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Download, Share2, Shuffle, Map, Layers, Navigation, Car
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
  arriveBy?: string; // HH:MM format
  duration: number; // minutes at stop
  eta?: Date; // calculated ETA
  departureTime?: Date; // calculated departure time
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
  description: string;
  distance: number;
  time: number;
  stops: Stop[];
  savings?: { distance: number; time: number };
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

// Generate a unique short ID for shareable links
const generateShortId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Duration options in minutes
const DURATION_OPTIONS = [0, 5, 10, 15, 30, 45, 60];

export default function MultiStopPlanner({
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  maxStops = 25, // Increased for demo
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

  // New state for enhancements
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteType, setSelectedRouteType] = useState<'fastest' | 'shortest' | 'balanced'>('fastest');
  const [originalRoute, setOriginalRoute] = useState<{ distance: number; time: number } | null>(null);
  const [showLegDetails, setShowLegDetails] = useState(false);
  const [selectedLegIndex, setSelectedLegIndex] = useState<number | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [departureTime, setDepartureTime] = useState<Date>(new Date());
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Keep Tailwind classes for AddressAutocomplete compatibility
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
    setSelectedLegIndex(null);
    setShareUrl(null);
  };

  const updateStop = (id: string, address: string) => {
    setStops(stops.map(s => s.id === id ? { ...s, address, geocoded: false } : s));
    setRouteResult(null);
    setRouteOptions([]);
  };

  const updateStopArriveBy = (id: string, arriveBy: string) => {
    setStops(stops.map(s => s.id === id ? { ...s, arriveBy } : s));
  };

  const updateStopDuration = (id: string, duration: number) => {
    setStops(stops.map(s => s.id === id ? { ...s, duration } : s));
    // Recalculate ETAs if route exists
    if (routeResult) {
      calculateETAs(stops.map(s => s.id === id ? { ...s, duration } : s), routeResult);
    }
  };

  // Calculate ETAs for all stops based on departure time and durations
  const calculateETAs = (stopsToCalc: Stop[], result: RouteResult) => {
    let currentTime = new Date(departureTime);
    const updatedStops = stopsToCalc.map((stop, index) => {
      const eta = new Date(currentTime);
      
      // Add travel time from previous leg
      if (index > 0 && result.legs[index - 1]) {
        currentTime = new Date(currentTime.getTime() + result.legs[index - 1].time * 60 * 1000);
      }
      
      const arrivalEta = new Date(currentTime);
      const departureFromStop = new Date(currentTime.getTime() + stop.duration * 60 * 1000);
      currentTime = departureFromStop;

      return {
        ...stop,
        eta: arrivalEta,
        departureTime: stop.duration > 0 ? departureFromStop : undefined,
      };
    });
    
    setStops(updatedStops);
  };

  // Check if stop will arrive on time
  const getTimeStatus = (stop: Stop): 'ontime' | 'close' | 'late' | null => {
    if (!stop.arriveBy || !stop.eta) return null;
    
    const [hours, minutes] = stop.arriveBy.split(':').map(Number);
    const deadline = new Date(stop.eta);
    deadline.setHours(hours, minutes, 0, 0);
    
    const diffMinutes = (deadline.getTime() - stop.eta.getTime()) / (60 * 1000);
    
    if (diffMinutes < 0) return 'late';
    if (diffMinutes <= 10) return 'close';
    return 'ontime';
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
    setRouteOptions([]);

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

  const calculateRouteForStops = async (stopsToCalc: Stop[], routeType: 'fastest' | 'shortest' | 'pedestrian' | 'bicycle' = 'fastest') => {
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
      const legs: LegInfo[] = [];

      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = `${waypoints[i].lat},${waypoints[i].lng}`;
        const to = `${waypoints[i + 1].lat},${waypoints[i + 1].lng}`;
        const directions = await getDirections(from, to, routeType, departureTime);
        if (directions) {
          totalDistance += directions.distance;
          totalTime += directions.time;
          
          // Estimate traffic condition based on time
          let trafficCondition: 'light' | 'moderate' | 'heavy' = 'light';
          const expectedTime = directions.distance * 2; // Rough estimate: 2 min per mile
          if (directions.time > expectedTime * 1.3) trafficCondition = 'heavy';
          else if (directions.time > expectedTime * 1.1) trafficCondition = 'moderate';
          
          legs.push({ 
            from: validStops[i].address,
            to: validStops[i + 1].address,
            distance: directions.distance, 
            time: directions.time,
            trafficCondition,
          });
        }
      }

      const result = { totalDistance, totalTime, legs };
      setRouteResult(result);
      
      // Store original route for comparison
      if (!originalRoute) {
        setOriginalRoute({ distance: totalDistance, time: totalTime });
      }
      
      // Calculate ETAs
      calculateETAs(geocodedStops, result);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate route');
    } finally {
      setLoading(false);
    }
  };

  const calculateRoute = async () => {
    await calculateRouteForStops(stops, selectedRouteType);
  };

  // Optimize route using MapQuest API
  const handleOptimizeRoute = async () => {
    const validStops = stops.filter(s => s.lat && s.lng);
    if (validStops.length < 3) {
      setError('Need at least 3 stops to optimize');
      return;
    }

    setOptimizing(true);
    setError(null);

    try {
      // Store original order for comparison
      const originalOrder = [...validStops];
      let originalDistance = 0;
      let originalTime = 0;

      // Calculate original route metrics
      for (let i = 0; i < originalOrder.length - 1; i++) {
        const from = `${originalOrder[i].lat},${originalOrder[i].lng}`;
        const to = `${originalOrder[i + 1].lat},${originalOrder[i + 1].lng}`;
        const directions = await getDirections(from, to, 'fastest');
        if (directions) {
          originalDistance += directions.distance;
          originalTime += directions.time;
        }
      }

      setOriginalRoute({ distance: originalDistance, time: originalTime });

      // Get optimized route from MapQuest
      const locations = validStops.map(s => ({ lat: s.lat!, lng: s.lng! }));
      const optimized = await optimizeRoute(locations);

      if (!optimized) {
        throw new Error('Optimization failed');
      }

      // Calculate all three route options
      const options: RouteOption[] = [];

      // 1. Fastest (optimized sequence)
      const optimizedStops = optimized.locationSequence.map(idx => validStops[idx]);
      let fastestDistance = 0;
      let fastestTime = 0;
      for (let i = 0; i < optimizedStops.length - 1; i++) {
        const from = `${optimizedStops[i].lat},${optimizedStops[i].lng}`;
        const to = `${optimizedStops[i + 1].lat},${optimizedStops[i + 1].lng}`;
        const directions = await getDirections(from, to, 'fastest');
        if (directions) {
          fastestDistance += directions.distance;
          fastestTime += directions.time;
        }
      }
      
      options.push({
        type: 'fastest',
        label: 'Fastest',
        description: 'Least travel time',
        distance: fastestDistance,
        time: fastestTime,
        stops: optimizedStops,
        savings: {
          distance: originalDistance - fastestDistance,
          time: originalTime - fastestTime,
        },
      });

      // 2. Shortest distance route
      let shortestDistance = 0;
      let shortestTime = 0;
      for (let i = 0; i < optimizedStops.length - 1; i++) {
        const from = `${optimizedStops[i].lat},${optimizedStops[i].lng}`;
        const to = `${optimizedStops[i + 1].lat},${optimizedStops[i + 1].lng}`;
        const directions = await getDirections(from, to, 'shortest');
        if (directions) {
          shortestDistance += directions.distance;
          shortestTime += directions.time;
        }
      }
      
      options.push({
        type: 'shortest',
        label: 'Shortest',
        description: 'Least distance',
        distance: shortestDistance,
        time: shortestTime,
        stops: optimizedStops,
        savings: {
          distance: originalDistance - shortestDistance,
          time: originalTime - shortestTime,
        },
      });

      // 3. Balanced (average of fastest and shortest)
      options.push({
        type: 'balanced',
        label: 'Balanced',
        description: 'Time & distance compromise',
        distance: (fastestDistance + shortestDistance) / 2,
        time: (fastestTime + shortestTime) / 2,
        stops: optimizedStops,
        savings: {
          distance: originalDistance - (fastestDistance + shortestDistance) / 2,
          time: originalTime - (fastestTime + shortestTime) / 2,
        },
      });

      setRouteOptions(options);
      
      // Apply fastest by default
      selectRouteOption('fastest', options);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to optimize route');
    } finally {
      setOptimizing(false);
    }
  };

  const selectRouteOption = async (type: 'fastest' | 'shortest' | 'balanced', options?: RouteOption[]) => {
    const opts = options || routeOptions;
    const option = opts.find(o => o.type === type);
    if (!option) return;

    setSelectedRouteType(type);
    
    // Update stops with optimized order
    const updatedStops = option.stops.map((s, i) => ({
      ...s,
      id: (i + 1).toString(),
    }));
    setStops(updatedStops);
    
    // Recalculate full route
    await calculateRouteForStops(updatedStops, type === 'balanced' ? 'fastest' : type);
  };

  // Add random stops for demo
  const addRandomStops = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get center point from existing stops or use default
      const validStops = stops.filter(s => s.lat && s.lng);
      let centerLat = 40.7128; // NYC default
      let centerLng = -74.0060;
      
      if (validStops.length > 0) {
        centerLat = validStops.reduce((sum, s) => sum + s.lat!, 0) / validStops.length;
        centerLng = validStops.reduce((sum, s) => sum + s.lng!, 0) / validStops.length;
      }
      
      // Search for random POIs nearby
      const categories = ['restaurant', 'gas station', 'coffee shop', 'hotel', 'pharmacy', 'grocery'];
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      
      const places = await searchPlaces(centerLat, centerLng, `q:${randomCategory}`, 15, 15);
      
      if (places.length < 5) {
        // Fallback: generate random coordinates nearby
        const newStops: Stop[] = [];
        for (let i = 0; i < 10; i++) {
          const lat = centerLat + (Math.random() - 0.5) * 0.3;
          const lng = centerLng + (Math.random() - 0.5) * 0.3;
          
          // Reverse geocode to get address
          const result = await geocode(`${lat},${lng}`);
          if (result) {
            newStops.push({
              id: Date.now().toString() + i,
              address: `${result.street || ''}, ${result.adminArea5 || ''}, ${result.adminArea3 || ''}`.replace(/^, /, ''),
              lat: result.lat,
              lng: result.lng,
              geocoded: true,
              duration: 0,
            });
          }
        }
        
        if (newStops.length > 0) {
          setStops([...stops.filter(s => s.address.trim()), ...newStops].slice(0, maxStops));
        }
      } else {
        // Use found places
        const newStops = places.slice(0, 10).map((place, i) => {
          const coords = place.place?.geometry?.coordinates;
          return {
            id: Date.now().toString() + i,
            address: place.displayString || place.name,
            lat: coords ? coords[1] : undefined,
            lng: coords ? coords[0] : undefined,
            geocoded: !!coords,
            duration: Math.random() > 0.5 ? DURATION_OPTIONS[Math.floor(Math.random() * 4) + 1] : 0,
          };
        }).filter(s => s.lat && s.lng);
        
        const existingValid = stops.filter(s => s.address.trim());
        setStops([...existingValid, ...newStops].slice(0, maxStops));
      }
    } catch (err) {
      setError('Failed to add random stops');
    } finally {
      setLoading(false);
    }
  };

  // Generate shareable URL
  const generateShareUrl = () => {
    const validStops = stops.filter(s => s.lat && s.lng);
    if (validStops.length < 2) return;

    // Encode route data in URL params
    const routeData = {
      stops: validStops.map(s => ({
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        duration: s.duration,
      })),
      type: selectedRouteType,
    };

    const encoded = btoa(JSON.stringify(routeData));
    const shortId = generateShortId();
    
    // In production, you'd store this server-side
    // For now, we'll use URL params
    const url = `${window.location.origin}/shared/route/${shortId}?data=${encoded}`;
    setShareUrl(url);
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Generate PDF (simplified - in production use a PDF library)
  const generatePdf = async () => {
    if (!routeResult) return;
    setGeneratingPdf(true);
    
    try {
      const validStops = stops.filter(s => s.lat && s.lng);
      
      // Create printable content
      const content = `
MULTI-STOP ROUTE SHEET
Generated: ${new Date().toLocaleString()}
================================

ROUTE SUMMARY
Total Distance: ${routeResult.totalDistance.toFixed(1)} miles
Total Time: ${formatTime(routeResult.totalTime)}
Number of Stops: ${validStops.length}

STOPS
${validStops.map((stop, i) => `
${i + 1}. ${stop.address}
   ${stop.eta ? `ETA: ${stop.eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
   ${stop.duration > 0 ? `Duration: ${stop.duration} min` : ''}
   ${stop.arriveBy ? `Arrive by: ${stop.arriveBy}` : ''}
`).join('')}

LEG DETAILS
${routeResult.legs.map((leg, i) => `
Leg ${i + 1}: ${leg.from} → ${leg.to}
   Distance: ${leg.distance.toFixed(1)} mi
   Time: ${formatTime(leg.time)}
`).join('')}

================================
Powered by MapQuest
      `;
      
      // Create downloadable text file (in production, use jsPDF or similar)
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `route-sheet-${new Date().toISOString().slice(0,10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to generate route sheet');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const resetRoute = () => {
    setRouteResult(null);
    setRouteOptions([]);
    setOriginalRoute(null);
    setError(null);
    setSelectedLegIndex(null);
    setShareUrl(null);
  };

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const formatTimeShort = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    color: selectedLegIndex !== null && (index === selectedLegIndex || index === selectedLegIndex + 1) 
      ? accentColor 
      : (darkMode ? '#6b7280' : '#4b5563'),
  }));

  const routeWaypoints = validStops.length > 2 
    ? validStops.slice(1, -1).map(s => ({ lat: s.lat!, lng: s.lng! }))
    : undefined;

  return (
    <div 
      className="prism-widget"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        minWidth: '1000px', 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className="flex" style={{ height: '600px' }}>
        {/* Sidebar */}
        <div 
          className="w-96 flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          {/* Header */}
          <div 
            className="p-3"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between">
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
                    {validStops.length} stops · Drag to reorder
                  </p>
                </div>
              </div>
              
              {/* Demo Actions */}
              <div className="flex gap-1">
                <button
                  onClick={addRandomStops}
                  disabled={loading || stops.length >= maxStops}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ 
                    color: 'var(--text-muted)',
                    background: 'var(--bg-hover)',
                  }}
                  title="Add 10 random stops (demo)"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <button
                  onClick={clearAllStops}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Clear all stops"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Stops List */}
          <div className="flex-1 overflow-y-auto prism-scrollbar p-3 min-h-0">
            <div className="space-y-1">
              {stops.map((stop, index) => {
                const timeStatus = getTimeStatus(stop);
                
                return (
                  <div
                    key={stop.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`rounded-lg transition-all ${
                      draggedIndex === index ? 'opacity-50' : ''
                    }`}
                    style={{
                      background: dragOverIndex === index ? 'var(--bg-hover)' : 'transparent',
                      border: dragOverIndex === index ? '2px dashed var(--border-default)' : '2px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-2 py-1.5">
                      <GripVertical 
                        className="w-4 h-4 cursor-grab active:cursor-grabbing flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ 
                          background: 'var(--bg-panel)',
                          border: '2px solid var(--border-default)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {index + 1}
                      </div>

                      <div className="relative flex-1 min-w-0">
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
                        
                        {/* Status indicators */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-20">
                          {stop.geocoded && (
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ background: 'var(--color-success)' }}
                              title="Geocoded" 
                            />
                          )}
                          {timeStatus && (
                            <div title={
                              timeStatus === 'ontime' ? 'Will arrive on time' :
                              timeStatus === 'close' ? 'Cutting it close!' :
                              'Cannot reach in time'
                            }>
                              {timeStatus === 'ontime' && <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />}
                              {timeStatus === 'close' && <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />}
                              {timeStatus === 'late' && <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />}
                            </div>
                          )}
                        </div>
                      </div>

                      {stops.length > 2 && (
                        <button
                          onClick={() => removeStop(stop.id)}
                          className="p-1 rounded-lg transition-colors flex-shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    
                    {/* Advanced Options (Time Window & Duration) */}
                    {showAdvancedOptions && stop.geocoded && (
                      <div 
                        className="ml-12 mr-2 mb-2 p-2 rounded-lg space-y-2"
                        style={{ background: 'var(--bg-panel)' }}
                      >
                        <div className="flex gap-2">
                          {/* Arrive By */}
                          <div className="flex-1">
                            <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                              Arrive by
                            </label>
                            <input
                              type="time"
                              value={stop.arriveBy || ''}
                              onChange={(e) => updateStopArriveBy(stop.id, e.target.value)}
                              className="w-full px-2 py-1 rounded text-xs"
                              style={{ 
                                background: 'var(--bg-input)', 
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-main)',
                              }}
                            />
                          </div>
                          
                          {/* Duration */}
                          <div className="flex-1">
                            <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                              Time at stop
                            </label>
                            <select
                              value={stop.duration}
                              onChange={(e) => updateStopDuration(stop.id, parseInt(e.target.value))}
                              className="w-full px-2 py-1 rounded text-xs"
                              style={{ 
                                background: 'var(--bg-input)', 
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-main)',
                              }}
                            >
                              {DURATION_OPTIONS.map(d => (
                                <option key={d} value={d}>{d === 0 ? 'None' : `${d} min`}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        
                        {/* ETA Display */}
                        {stop.eta && (
                          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            Arrive {formatTimeShort(stop.eta)}
                            {stop.duration > 0 && stop.departureTime && (
                              <> · {stop.duration}min stop · Depart {formatTimeShort(stop.departureTime)}</>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Leg Details (between stops) */}
                    {showLegDetails && routeResult && index < stops.length - 1 && stops[index + 1].geocoded && (
                      <div 
                        className={`ml-12 mr-2 mb-1 px-2 py-1.5 rounded cursor-pointer transition-all ${
                          selectedLegIndex === index ? 'ring-2' : ''
                        }`}
                        style={{ 
                          background: selectedLegIndex === index ? `${accentColor}15` : 'var(--bg-hover)',
                          borderLeft: `3px solid ${
                            routeResult.legs[index]?.trafficCondition === 'heavy' ? 'var(--color-error)' :
                            routeResult.legs[index]?.trafficCondition === 'moderate' ? 'var(--color-warning)' :
                            'var(--color-success)'
                          }`,
                          ['--tw-ring-color' as any]: accentColor,
                        }}
                        onClick={() => setSelectedLegIndex(selectedLegIndex === index ? null : index)}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {routeResult.legs[index]?.distance.toFixed(1)} mi
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {formatTime(routeResult.legs[index]?.time || 0)}
                          </span>
                          <span 
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ 
                              background: 
                                routeResult.legs[index]?.trafficCondition === 'heavy' ? 'var(--color-error-bg)' :
                                routeResult.legs[index]?.trafficCondition === 'moderate' ? 'var(--color-warning-bg)' :
                                'var(--color-success-bg)',
                              color: 
                                routeResult.legs[index]?.trafficCondition === 'heavy' ? 'var(--color-error)' :
                                routeResult.legs[index]?.trafficCondition === 'moderate' ? 'var(--color-warning)' :
                                'var(--color-success)',
                            }}
                          >
                            {routeResult.legs[index]?.trafficCondition || 'light'} traffic
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
            
            {/* Advanced Options Toggle */}
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="w-full mt-2 py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
              style={{ 
                color: 'var(--text-muted)',
                background: showAdvancedOptions ? 'var(--bg-panel)' : 'transparent',
              }}
            >
              {showAdvancedOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showAdvancedOptions ? 'Hide' : 'Show'} Time Windows & Durations
            </button>
            
            {/* Leg Details Toggle */}
            {routeResult && (
              <button
                onClick={() => setShowLegDetails(!showLegDetails)}
                className="w-full mt-1 py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                style={{ 
                  color: 'var(--text-muted)',
                  background: showLegDetails ? 'var(--bg-panel)' : 'transparent',
                }}
              >
                {showLegDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showLegDetails ? 'Hide' : 'Show'} Leg Details
              </button>
            )}
          </div>

          {/* Route Options (after optimization) */}
          {routeOptions.length > 0 && (
            <div 
              className="p-3"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                Route Options
              </p>
              <div className="grid grid-cols-3 gap-2">
                {routeOptions.map(option => (
                  <button
                    key={option.type}
                    onClick={() => selectRouteOption(option.type)}
                    className={`p-2 rounded-lg text-left transition-all ${
                      selectedRouteType === option.type ? 'ring-2' : ''
                    }`}
                    style={{ 
                      background: selectedRouteType === option.type ? `${accentColor}15` : 'var(--bg-panel)',
                      border: '1px solid var(--border-subtle)',
                      ['--tw-ring-color' as any]: accentColor,
                    }}
                  >
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                      {option.label}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {option.distance.toFixed(1)}mi · {formatTime(option.time)}
                    </p>
                    {option.savings && option.savings.time > 0 && (
                      <p className="text-[10px] font-medium" style={{ color: 'var(--color-success)' }}>
                        Save {formatTime(option.savings.time)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                {originalRoute && routeResult.totalTime < originalRoute.time && (
                  <span 
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}
                  >
                    Saved {formatTime(originalRoute.time - routeResult.totalTime)}!
                  </span>
                )}
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
              
              {/* Comparison with original */}
              {originalRoute && (
                <div 
                  className="mt-2 p-2 rounded-lg text-xs"
                  style={{ 
                    background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Original: {originalRoute.distance.toFixed(1)} mi, {formatTime(originalRoute.time)}
                </div>
              )}
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
            {/* Departure Time */}
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Depart:</span>
              <input
                type="datetime-local"
                value={departureTime.toISOString().slice(0, 16)}
                onChange={(e) => setDepartureTime(new Date(e.target.value))}
                className="flex-1 px-2 py-1 rounded text-xs"
                style={{ 
                  background: 'var(--bg-input)', 
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              />
            </div>
            
            <div className="flex gap-2 mb-2">
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
                  <><Navigation className="w-4 h-4" /> Calculate Route</>
                )}
              </button>
              
              {validStops.length >= 3 && (
                <button
                  onClick={handleOptimizeRoute}
                  disabled={optimizing || loading}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                  style={{ 
                    background: `${accentColor}15`,
                    color: accentColor,
                    border: `1px solid ${accentColor}40`,
                  }}
                  title="Optimize route order"
                >
                  {optimizing ? (
                    <Loader2 className="w-4 h-4 prism-spinner" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>
              )}
              
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
            
            {/* Export Options */}
            {routeResult && (
              <div className="flex gap-2">
                <button
                  onClick={generatePdf}
                  disabled={generatingPdf}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                  style={{ 
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {generatingPdf ? (
                    <Loader2 className="w-3 h-3 prism-spinner" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  Route Sheet
                </button>
                
                <button
                  onClick={shareUrl ? copyShareUrl : generateShareUrl}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                  style={{ 
                    border: '1px solid var(--border-subtle)',
                    color: copySuccess ? 'var(--color-success)' : 'var(--text-secondary)',
                  }}
                >
                  {copySuccess ? (
                    <><Check className="w-3 h-3" /> Copied!</>
                  ) : (
                    <><Share2 className="w-3 h-3" /> {shareUrl ? 'Copy Link' : 'Share Route'}</>
                  )}
                </button>
              </div>
            )}
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
            height="600px"
            markers={markers}
            showRoute={validStops.length >= 2}
            routeStart={validStops.length >= 2 ? { lat: validStops[0].lat!, lng: validStops[0].lng! } : undefined}
            routeEnd={validStops.length >= 2 ? { lat: validStops[validStops.length - 1].lat!, lng: validStops[validStops.length - 1].lng! } : undefined}
            waypoints={routeWaypoints}
          />
          
          {/* Traffic Toggle */}
          <div 
            className="absolute top-3 right-3 z-10"
          >
            <button
              onClick={() => setShowTraffic(!showTraffic)}
              className={`p-2 rounded-lg shadow-md transition-colors flex items-center gap-1.5 text-xs font-medium ${
                showTraffic ? 'ring-2' : ''
              }`}
              style={{ 
                background: 'var(--bg-widget)',
                border: '1px solid var(--border-subtle)',
                color: showTraffic ? accentColor : 'var(--text-secondary)',
                ['--tw-ring-color' as any]: accentColor,
              }}
            >
              <Layers className="w-4 h-4" />
              Traffic
            </button>
          </div>
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
