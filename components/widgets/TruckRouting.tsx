// components/widgets/TruckRouting.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Navigation, Truck, Loader2, ChevronDown, ChevronUp, Clock, Settings2, AlertTriangle } from 'lucide-react';
import { geocode } from '@/lib/mapquest';
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

interface VehicleProfile {
  height: number; // feet
  weight: number; // tons
  length: number; // feet
  width: number;  // feet
  axleCount: number;
}

interface TruckRoutingProps {
  defaultFrom?: string;
  defaultTo?: string;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  // Default vehicle profile values
  defaultVehicle?: Partial<VehicleProfile>;
  // Min/max constraints (to be provided in next iteration)
  vehicleConstraints?: {
    height?: { min: number; max: number };
    weight?: { min: number; max: number };
    length?: { min: number; max: number };
    width?: { min: number; max: number };
    axleCount?: { min: number; max: number };
  };
  onRouteCalculated?: (route: RouteInfo, vehicle: VehicleProfile) => void;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

// HERE Flexible Polyline decoder
// Based on https://github.com/heremaps/flexible-polyline
function decodeHerePolyline(encoded: string): { lat: number; lng: number }[] {
  const DECODING_TABLE = [
    62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51
  ];

  const result: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  // Decode header
  let version = 0;
  let shift = 0;
  let value = 0;

  // Skip header bytes (version + precision info)
  while (index < encoded.length) {
    const char = encoded.charCodeAt(index++) - 45;
    const v = DECODING_TABLE[char];
    value |= (v & 31) << shift;
    if ((v & 32) === 0) {
      version = value;
      break;
    }
    shift += 5;
  }

  // Skip precision bytes
  shift = 0;
  value = 0;
  while (index < encoded.length) {
    const char = encoded.charCodeAt(index++) - 45;
    const v = DECODING_TABLE[char];
    value |= (v & 31) << shift;
    if ((v & 32) === 0) break;
    shift += 5;
  }

  const precision = Math.pow(10, -(value & 15));
  const precision3D = Math.pow(10, -((value >> 4) & 15));
  const hasElevation = (value >> 8) & 1;

  // Decode points
  while (index < encoded.length) {
    // Decode latitude delta
    shift = 0;
    value = 0;
    while (index < encoded.length) {
      const char = encoded.charCodeAt(index++) - 45;
      if (char < 0 || char >= DECODING_TABLE.length) break;
      const v = DECODING_TABLE[char];
      if (v === -1) break;
      value |= (v & 31) << shift;
      if ((v & 32) === 0) break;
      shift += 5;
    }
    const latDelta = (value & 1) ? ~(value >> 1) : (value >> 1);
    lat += latDelta;

    // Decode longitude delta
    shift = 0;
    value = 0;
    while (index < encoded.length) {
      const char = encoded.charCodeAt(index++) - 45;
      if (char < 0 || char >= DECODING_TABLE.length) break;
      const v = DECODING_TABLE[char];
      if (v === -1) break;
      value |= (v & 31) << shift;
      if ((v & 32) === 0) break;
      shift += 5;
    }
    const lngDelta = (value & 1) ? ~(value >> 1) : (value >> 1);
    lng += lngDelta;

    // Skip elevation if present
    if (hasElevation) {
      shift = 0;
      value = 0;
      while (index < encoded.length) {
        const char = encoded.charCodeAt(index++) - 45;
        if (char < 0 || char >= DECODING_TABLE.length) break;
        const v = DECODING_TABLE[char];
        if (v === -1) break;
        value |= (v & 31) << shift;
        if ((v & 32) === 0) break;
        shift += 5;
      }
    }

    result.push({
      lat: lat * precision,
      lng: lng * precision
    });
  }

  return result;
}

// Default vehicle constraints (can be overridden via props)
const DEFAULT_CONSTRAINTS = {
  height: { min: 8, max: 14 },
  weight: { min: 5, max: 40 },
  length: { min: 20, max: 75 },
  width: { min: 8, max: 8.5 },
  axleCount: { min: 2, max: 6 },
};

// Default vehicle profile
const DEFAULT_VEHICLE: VehicleProfile = {
  height: 13.5,
  weight: 20,
  length: 48,
  width: 8.5,
  axleCount: 5,
};

export default function TruckRouting({
  defaultFrom = '',
  defaultTo = '',
  accentColor = '#F97316', // Orange for trucks
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  defaultVehicle,
  vehicleConstraints,
  onRouteCalculated,
}: TruckRoutingProps) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [toCoords, setToCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [showVehicleSettings, setShowVehicleSettings] = useState(true);
  const [departureTime, setDepartureTime] = useState<'now' | Date>('now');
  const [showDepartureOptions, setShowDepartureOptions] = useState(false);
  const [useHereRouting, setUseHereRouting] = useState(true); // Default to HERE for better truck routing
  const [routePolyline, setRoutePolyline] = useState<{ lat: number; lng: number }[] | undefined>(undefined);

  // Vehicle profile state
  const [vehicle, setVehicle] = useState<VehicleProfile>({
    ...DEFAULT_VEHICLE,
    ...defaultVehicle,
  });

  // Merge constraints with defaults
  const constraints = {
    ...DEFAULT_CONSTRAINTS,
    ...vehicleConstraints,
  };

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

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  // Get truck directions using HERE Routing API (better truck restrictions support)
  const getHereTruckDirections = async (
    fromCoords: { lat: number; lng: number },
    toCoords: { lat: number; lng: number },
    vehicleProfile: VehicleProfile,
    departure?: 'now' | Date
  ) => {
    // Convert dimensions to centimeters for HERE API
    const heightCm = Math.round(vehicleProfile.height * 30.48); // feet to cm
    const widthCm = Math.round(vehicleProfile.width * 30.48);
    const lengthCm = Math.round(vehicleProfile.length * 30.48);
    // Convert weight to kg (short tons to kg)
    const weightKg = Math.round(vehicleProfile.weight * 907.185);

    console.log('[TruckRouting] Vehicle profile:', {
      heightFt: vehicleProfile.height,
      heightCm,
      widthFt: vehicleProfile.width,
      widthCm,
      lengthFt: vehicleProfile.length,
      lengthCm,
      weightTons: vehicleProfile.weight,
      weightKg,
      axles: vehicleProfile.axleCount,
    });

    const params = new URLSearchParams({
      endpoint: 'routes',
      origin: `${fromCoords.lat},${fromCoords.lng}`,
      destination: `${toCoords.lat},${toCoords.lng}`,
      transportMode: 'truck',
      truckHeight: heightCm.toString(),
      truckWidth: widthCm.toString(),
      truckLength: lengthCm.toString(),
      truckWeight: weightKg.toString(),
      truckAxles: vehicleProfile.axleCount.toString(),
    });

    // Add departure time if specified
    if (departure && departure !== 'now') {
      params.append('departureTime', departure.toISOString());
    } else {
      params.append('departureTime', new Date().toISOString());
    }

    console.log('[TruckRouting] HERE request URL:', `/api/here?${params.toString()}`);
    const response = await fetch(`/api/here?${params.toString()}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TruckRouting] HERE API error:', response.status, errorText);
      throw new Error('Failed to get truck route from HERE');
    }

    const data = await response.json();
    console.log('[TruckRouting] HERE API full response:', JSON.stringify(data, null, 2));
    
    // Check for notices (warnings about route)
    if (data.notices) {
      console.log('[TruckRouting] HERE API notices:', data.notices);
    }
    
    if (!data.routes || data.routes.length === 0) {
      // Check if there's an error message
      if (data.error) {
        console.error('[TruckRouting] HERE API error:', data.error);
        throw new Error(data.error.message || 'Failed to calculate truck route');
      }
      throw new Error('No truck-safe route found. Try adjusting vehicle dimensions.');
    }

    const route = data.routes[0];
    
    // Log route notices if any
    if (route.notices) {
      console.log('[TruckRouting] Route notices:', route.notices);
    }
    
    const section = route.sections[0];
    
    // Log section notices if any (these might contain restriction warnings)
    if (section.notices) {
      console.log('[TruckRouting] Section notices:', section.notices);
      section.notices.forEach((notice: any) => {
        console.log('[TruckRouting] Notice:', notice.title, '-', notice.code);
      });
    }
    
    // Log transport info for debugging
    if (section.transport) {
      console.log('[TruckRouting] Transport mode:', section.transport.mode);
    }
    
    // Check if there are any truck-related attributes in the response
    if (section.truck) {
      console.log('[TruckRouting] Truck info in response:', section.truck);
    }
    
    // Get polyline for map display and decode it
    const encodedPolyline = section.polyline;
    let decodedPolyline: { lat: number; lng: number }[] = [];
    
    if (encodedPolyline) {
      try {
        decodedPolyline = decodeHerePolyline(encodedPolyline);
        console.log('[TruckRouting] Decoded polyline with', decodedPolyline.length, 'points');
      } catch (err) {
        console.error('[TruckRouting] Failed to decode polyline:', err);
      }
    }
    
    // Parse instructions
    const steps = section.actions?.map((action: any) => ({
      narrative: action.instruction || action.action,
      distance: (action.length || 0) / 1609.34, // meters to miles
      time: (action.duration || 0) / 60, // seconds to minutes
    })) || [];

    return {
      distance: (section.summary?.length || 0) / 1609.34, // meters to miles
      time: (section.summary?.duration || 0) / 60, // seconds to minutes
      fuelUsed: section.summary?.consumption,
      hasTolls: section.tolls && section.tolls.length > 0,
      hasHighway: true, // HERE doesn't provide this directly
      steps,
      polyline: decodedPolyline, // Decoded coordinates array
    };
  };

  // Get truck directions using MapQuest Truck Routing API (fallback)
  const getMapQuestTruckDirections = async (
    fromLocation: string,
    toLocation: string,
    vehicleProfile: VehicleProfile,
    departure?: 'now' | Date
  ) => {
    const params = new URLSearchParams({
      endpoint: 'directions',
      from: fromLocation,
      to: toLocation,
      routeType: 'fastest',
      type: 'truck',
      // Truck-specific parameters (convert to metric for API)
      // Height in meters (convert from feet)
      vehicleHeight: (vehicleProfile.height * 0.3048).toFixed(2),
      // Weight in metric tons (convert from short tons)
      vehicleWeight: (vehicleProfile.weight * 0.907185).toFixed(2),
      // Length in meters (convert from feet)
      vehicleLength: (vehicleProfile.length * 0.3048).toFixed(2),
      // Width in meters (convert from feet)
      vehicleWidth: (vehicleProfile.width * 0.3048).toFixed(2),
      // Axle count
      vehicleAxles: vehicleProfile.axleCount.toString(),
    });

    // Add departure time if specified
    if (departure && departure !== 'now') {
      params.append('timeType', '1');
      params.append('dateTime', departure.toISOString());
    }

    console.log('[TruckRouting] MapQuest request params:', params.toString());
    const response = await fetch(`/api/mapquest?${params.toString()}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TruckRouting] MapQuest API error:', response.status, errorText);
      throw new Error('Failed to get truck route');
    }

    const data = await response.json();
    console.log('[TruckRouting] MapQuest API response:', data);
    
    if (data.info?.statuscode !== 0) {
      console.error('[TruckRouting] Route error:', data.info);
      throw new Error(data.info?.messages?.[0] || 'Route calculation failed');
    }

    const routeData = data.route;
    return {
      distance: routeData.distance,
      time: routeData.time / 60, // Convert seconds to minutes
      fuelUsed: routeData.fuelUsed,
      hasTolls: routeData.hasTollRoad,
      hasHighway: routeData.hasHighway,
      steps: routeData.legs?.[0]?.maneuvers?.map((m: { narrative: string; distance: number; time: number }) => ({
        narrative: m.narrative,
        distance: m.distance,
        time: m.time / 60,
      })) || [],
      polyline: undefined, // MapQuest uses different polyline format
    };
  };

  const calculateRoute = async () => {
    if (!from.trim() || !to.trim()) {
      setError('Please enter both start and destination');
      return;
    }

    setLoading(true);
    setError(null);
    setRoutePolyline(undefined);

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

      let directions;
      
      // Use HERE API for better truck routing (with vehicle dimension restrictions)
      if (useHereRouting) {
        try {
          directions = await getHereTruckDirections(fromLoc, toLoc, vehicle, departureTime);
          if (directions.polyline && directions.polyline.length > 0) {
            setRoutePolyline(directions.polyline);
          } else {
            setRoutePolyline(undefined);
          }
        } catch (hereErr) {
          console.warn('[TruckRouting] HERE routing failed, falling back to MapQuest:', hereErr);
          setRoutePolyline(undefined);
          // Fallback to MapQuest
          directions = await getMapQuestTruckDirections(
            `${fromLoc.lat},${fromLoc.lng}`, 
            `${toLoc.lat},${toLoc.lng}`, 
            vehicle,
            departureTime
          );
        }
      } else {
        setRoutePolyline(undefined);
        directions = await getMapQuestTruckDirections(
          `${fromLoc.lat},${fromLoc.lng}`, 
          `${toLoc.lat},${toLoc.lng}`, 
          vehicle,
          departureTime
        );
      }

      if (!directions) {
        throw new Error('Could not calculate truck route');
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
      onRouteCalculated?.(routeInfo, vehicle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate truck route');
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

  // Track if we've calculated a route before
  const hasCalculatedRef = useRef(false);
  
  // Auto-recalculate when vehicle profile or departure time changes
  useEffect(() => {
    if (hasCalculatedRef.current && from.trim() && to.trim()) {
      calculateRoute();
    }
  }, [vehicle, departureTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark that we've calculated when route is set
  useEffect(() => {
    if (route) {
      hasCalculatedRef.current = true;
    }
  }, [route]);

  // Vehicle input component
  const VehicleInput = ({ 
    label, 
    value, 
    unit, 
    field,
    step = 0.5,
  }: { 
    label: string; 
    value: number; 
    unit: string; 
    field: keyof VehicleProfile;
    step?: number;
  }) => {
    const constraint = constraints[field];
    return (
      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            min={constraint?.min}
            max={constraint?.max}
            step={step}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value);
              if (!isNaN(newValue)) {
                setVehicle(prev => ({ ...prev, [field]: newValue }));
              }
            }}
            className="w-full px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
            }}
          />
          <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--text-muted)', width: '30px' }}>
            {unit}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="prism-widget w-full md:w-[950px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className="flex flex-col md:flex-row md:h-[750px]">
        {/* Map - shown first on mobile */}
        <div className="h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={fromCoords && toCoords ? 10 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            showRoute={!!(fromCoords && toCoords)}
            routeStart={fromCoords || undefined}
            routeEnd={toCoords || undefined}
            routeType="fastest"
            routePolyline={routePolyline}
          />
        </div>
        {/* Sidebar */}
        <div 
          className="w-full md:w-96 flex flex-col border-t md:border-t-0 md:border-r md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Header */}
          <div 
            className="p-4 flex-shrink-0"
            style={{ 
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${accentColor}15` }}
              >
                <span style={{ color: accentColor }}><Truck className="w-5 h-5" /></span>
              </div>
              <div>
                <h3 
                  className="font-bold text-lg"
                  style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
                >
                  Truck Safe Routing
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Commercial vehicle route planning
                </p>
              </div>
            </div>
          </div>

          {/* Body: keep inputs visible; make results scroll when needed */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Controls (no scrolling) */}
            <div className="p-4 space-y-3 flex-shrink-0" style={{ borderBottom: route ? '1px solid var(--border-subtle)' : undefined }}>
              {/* Vehicle Profile Section */}
              <div className="rounded-2xl" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setShowVehicleSettings(!showVehicleSettings)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-colors"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4" style={{ color: accentColor }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                      Vehicle Profile
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {showVehicleSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </button>

                {showVehicleSettings && (
                  <div className="px-4 pb-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {vehicle.height} ft H × {vehicle.width} ft W × {vehicle.length} ft L · {vehicle.weight} tons · {vehicle.axleCount} axles
                      </p>
                    </div>

                    {/* Vehicle Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <VehicleInput label="Height" value={vehicle.height} unit="ft" field="height" step={0.5} />
                      <VehicleInput label="Width" value={vehicle.width} unit="ft" field="width" step={0.5} />
                      <VehicleInput label="Length" value={vehicle.length} unit="ft" field="length" step={1} />
                      <VehicleInput label="Weight" value={vehicle.weight} unit="tons" field="weight" step={1} />
                      <VehicleInput label="Axle Count" value={vehicle.axleCount} unit="" field="axleCount" step={1} />
                    </div>

                    {/* Compact warning */}
                    <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--color-warning-bg)' }}>
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
                      <p className="text-xs" style={{ color: 'var(--color-warning)' }}>
                        Avoids low bridges and restricted roads using your vehicle profile.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Address Inputs */}
              <div className="rounded-2xl p-4" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
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
                    placeholder="Enter origin"
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

              {/* Departure Time */}
              <div className="mt-3 relative">
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
                    className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-40"
                    style={{
                      background: 'var(--bg-widget)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  >
                    <button
                      onClick={() => { setDepartureTime('now'); setShowDepartureOptions(false); }}
                      className="w-full px-3 py-2.5 text-left text-sm transition-colors"
                      style={{ 
                        background: departureTime === 'now' ? `${accentColor}15` : 'transparent',
                        color: departureTime === 'now' ? accentColor : 'var(--text-main)',
                      }}
                    >
                      Leave now
                    </button>
                    {[15, 30, 60].map((mins) => {
                      const time = new Date(Date.now() + mins * 60000);
                      const label = mins < 60 ? `In ${mins} minutes` : 'In 1 hour';
                      return (
                        <button
                          key={mins}
                          onClick={() => { setDepartureTime(time); setShowDepartureOptions(false); }}
                          className="w-full px-3 py-2.5 text-left text-sm transition-colors"
                          style={{ color: 'var(--text-main)' }}
                        >
                          {label}
                        </button>
                      );
                    })}
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
              </div>
            </div>

            {/* Results (scroll only when route exists) */}
            {route ? (
              <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar">

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
              <div className="flex flex-wrap gap-2 mt-3">
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
            </div>
          )}

                {/* Turn-by-Turn */}
                {route.steps.length > 0 && (
                  <div className="flex flex-col">
              <button
                onClick={() => setStepsExpanded(!stepsExpanded)}
                className="flex items-center justify-between px-4 py-3 transition-colors"
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
                    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {route.steps.map((step, index) => (
                    <div 
                      key={index} 
                      className="flex items-start gap-3 px-4 py-3"
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
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center">
                <div>
                  <Truck className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                    Enter origin and destination to calculate a truck-safe route
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer CTA (always visible) */}
          <div
            className="p-4 flex-shrink-0"
            style={{
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <button
              onClick={calculateRoute}
              disabled={loading || !from.trim() || !to.trim()}
              className="prism-btn prism-btn-primary w-full"
              style={{ 
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                boxShadow: `0 8px 20px ${accentColor}40`,
              }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 prism-spinner" /> Calculating Truck Route...</>
              ) : (
                <><Navigation className="w-4 h-4" /> Get Truck Route</>
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
