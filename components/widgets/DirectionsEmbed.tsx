// components/widgets/DirectionsEmbed.tsx
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Navigation, Car, Bike, PersonStanding, Loader2, ChevronDown, ChevronUp, Clock, Train, Bus, Footprints, Ship, TramFront } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';
import WidgetHeader from './WidgetHeader';

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

interface TransitStep {
  type: string;
  instruction: string;
  durationMin: number;
  lengthM: number;
  lineName?: string;
  color: string;
  departureName?: string;
  arrivalName?: string;
  departureTime?: string;
  arrivalTime?: string;
  intermediateStops?: number;
}

interface TransitSummary {
  durationMin: number;
  distanceMi: number;
  modes: string;
  lines: string;
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

const TRANSIT_MODE_LABELS: Record<string, string> = {
  pedestrian: 'Walk', subway: 'Subway', metro: 'Metro', bus: 'Bus',
  train: 'Train', regionalTrain: 'Regional Train', intercityTrain: 'Intercity Train',
  highSpeedTrain: 'High-Speed Train', lightRail: 'Light Rail', tram: 'Tram',
  ferry: 'Ferry', monorail: 'Monorail', rail: 'Rail', cityTrain: 'City Train',
};

const TRANSIT_SEG_COLORS: Record<string, string> = {
  pedestrian: '#6B7280', subway: '#8B5CF6', metro: '#8B5CF6', bus: '#F59E0B',
  train: '#3B82F6', rail: '#3B82F6', regionalTrain: '#3B82F6',
  intercityTrain: '#1D4ED8', lightRail: '#10B981', tram: '#10B981',
  ferry: '#0EA5E9', monorail: '#8B5CF6', cityTrain: '#3B82F6',
};

const RAIL_TYPES = new Set(['subway', 'metro', 'train', 'rail', 'regionalTrain', 'intercityTrain', 'highSpeedTrain', 'lightRail', 'cityTrain', 'monorail']);

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function waypointPinIcon(opts: { label: string; color: string }) {
  const label = (opts.label || '').slice(0, 3);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15.5" fill="${opts.color}" stroke="white" stroke-width="3"/>
      <text x="18" y="19.5" text-anchor="middle" dominant-baseline="middle"
            font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
            font-size="14" font-weight="800" fill="white">${label}</text>
    </svg>
  `.trim();
  return svgDataUri(svg);
}

const BUS_TYPES = new Set(['bus', 'privateBus', 'busRapid']);
const TRAM_TYPES = new Set(['tram', 'lightRail']);

function transitStepIcon(type: string) {
  if (type === 'pedestrian') return Footprints;
  if (type === 'ferry') return Ship;
  if (TRAM_TYPES.has(type)) return TramFront;
  if (BUS_TYPES.has(type)) return Bus;
  if (RAIL_TYPES.has(type)) return Train;
  return Bus;
}

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
  const [departureTime, setDepartureTime] = useState<'now' | Date>('now');
  const [showDepartureOptions, setShowDepartureOptions] = useState(false);

  const [transitSegs, setTransitSegs] = useState<{ type: string; coords: { lat: number; lng: number }[] }[]>([]);
  const [transitSteps, setTransitSteps] = useState<TransitStep[]>([]);
  const [transitSummary, setTransitSummary] = useState<TransitSummary | null>(null);
  const [pedestrianShape, setPedestrianShape] = useState<{ lat: number; lng: number }[]>([]);

  const isTransit = routeType === 'transit';
  const isPedestrian = routeType === 'pedestrian';
  const hasResults = !!(route || transitSummary);

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

  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const routeTypes = [
    { id: 'fastest' as RouteType, label: 'Drive', icon: Car },
    { id: 'transit' as RouteType, label: 'Transit', icon: Train },
    { id: 'pedestrian' as RouteType, label: 'Walk', icon: PersonStanding },
    { id: 'bicycle' as RouteType, label: 'Bike', icon: Bike },
  ];

  const clearTransitData = () => {
    setTransitSegs([]);
    setTransitSteps([]);
    setTransitSummary(null);
    setPedestrianShape([]);
  };

  const calculateTransitRoute = useCallback(async (origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) => {
    setLoading(true);
    setError(null);
    clearTransitData();
    setRoute(null);

    try {
      const depTime = departureTime === 'now' ? new Date().toISOString() : departureTime.toISOString();
      const params = new URLSearchParams({
        endpoint: 'transit',
        origin: `${origin.lat},${origin.lng}`,
        destination: `${dest.lat},${dest.lng}`,
        departureTime: depTime,
      });
      const res = await fetch(`/api/here?${params}`);
      const data = await res.json();

      if (data.error || !data.routes?.length) {
        throw new Error(data.error || 'No transit route found between these locations. Try locations with public transit access.');
      }

      const bestRoute = data.routes[0];
      const sections = bestRoute.sections || [];
      let totalDuration = 0;
      let totalLength = 0;
      const modes: string[] = [];
      const lineNames: string[] = [];
      const steps: TransitStep[] = [];
      const segs: { type: string; coords: { lat: number; lng: number }[] }[] = [];
      const { decodeHereFlexiblePolyline } = await import('@/lib/hereFlexiblePolyline');

      for (const section of sections) {
        // HERE Transit API: section.type is generic ("pedestrian" or "transit").
        // section.transport.mode has the specific mode (bus, subway, regionalTrain, etc.)
        const rawType = section.type || 'unknown';
        const transportMode = section.transport?.mode || '';
        const sType = rawType === 'pedestrian' ? 'pedestrian' : (transportMode || rawType);
        console.log('[Transit] Section:', { rawType, transportMode, sType, color: TRANSIT_SEG_COLORS[sType] || 'fallback→accentColor' });
        const dur = section.travelSummary?.duration || section.summary?.duration || 0;
        const len = section.travelSummary?.length || section.summary?.length || 0;
        totalDuration += dur;
        totalLength += len;

        if (sType !== 'pedestrian') modes.push(sType);
        const lineName = section.transport?.name || section.transport?.shortName || section.transport?.headsign;
        if (lineName) lineNames.push(lineName);

        const friendly = TRANSIT_MODE_LABELS[sType] || sType.charAt(0).toUpperCase() + sType.slice(1);
        const segColor = TRANSIT_SEG_COLORS[sType] || accentColor;

        let instruction = '';
        if (sType === 'pedestrian') {
          const ft = Math.round(len * 3.28084);
          instruction = `Walk ${ft > 1500 ? (len / 1609.34).toFixed(1) + ' mi' : ft + ' ft'}`;
        } else if (lineName) {
          instruction = `Take ${friendly}: ${lineName}`;
          if (section.transport?.headsign && section.transport.headsign !== lineName) {
            instruction += ` toward ${section.transport.headsign}`;
          }
        } else {
          instruction = friendly;
        }

        const depPlace = section.departure?.place?.name;
        const arrPlace = section.arrival?.place?.name;
        if (depPlace) instruction += ` from ${depPlace}`;
        if (arrPlace && sType !== 'pedestrian') instruction += ` to ${arrPlace}`;

        const fmtT = (iso: string | undefined) => {
          if (!iso) return undefined;
          try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
          catch { return undefined; }
        };

        steps.push({
          type: sType,
          instruction,
          durationMin: Math.ceil(dur / 60),
          lengthM: len,
          lineName: lineName || undefined,
          color: segColor,
          departureName: depPlace,
          arrivalName: arrPlace,
          departureTime: fmtT(section.departure?.time),
          arrivalTime: fmtT(section.arrival?.time),
          intermediateStops: section.intermediateStops?.length || 0,
        });

        // Use server-decoded polyline coordinates for road/rail-snapped geometry.
        // Fall back to raw departure/arrival coordinates if unavailable.
        let segCoords: { lat: number; lng: number }[] = [];
        const depLoc = section.departure?.place?.location;
        const arrLoc = section.arrival?.place?.location;

        // Prefer server-decoded coords (decoded on the API proxy to avoid browser issues)
        if (section.decodedCoords && Array.isArray(section.decodedCoords) && section.decodedCoords.length >= 2) {
          const pts = section.decodedCoords as { lat: number; lng: number }[];
          // Sanity check: first point should be near the departure location
          if (depLoc?.lat != null) {
            const dLat = Math.abs(pts[0].lat - depLoc.lat);
            const dLng = Math.abs(pts[0].lng - depLoc.lng);
            if (dLat < 5 && dLng < 5) {
              segCoords = pts;
            }
          } else {
            segCoords = pts;
          }
        }

        // Fallback: try client-side decoding of the raw polyline
        if (segCoords.length < 2 && section.polyline) {
          try {
            const decoded = decodeHereFlexiblePolyline(section.polyline);
            const pts = decoded.points.map((p: any) => ({ lat: p.lat, lng: p.lng }));
            if (pts.length >= 2) segCoords = pts;
          } catch { /* fall through to raw coords */ }
        }

        // Final fallback: raw departure/intermediate/arrival coordinates (straight lines)
        if (segCoords.length < 2) {
          if (depLoc?.lat != null && depLoc?.lng != null) segCoords.push({ lat: depLoc.lat, lng: depLoc.lng });
          if (section.intermediateStops) {
            for (const stop of section.intermediateStops) {
              const loc = stop.departure?.place?.location || stop.arrival?.place?.location;
              if (loc?.lat != null && loc?.lng != null) segCoords.push({ lat: loc.lat, lng: loc.lng });
            }
          }
          if (arrLoc?.lat != null && arrLoc?.lng != null) segCoords.push({ lat: arrLoc.lat, lng: arrLoc.lng });
        }

        if (segCoords.length >= 2) {
          segs.push({ type: sType, coords: segCoords });
        }
      }

      // Snap pedestrian segments to roads via HERE Routing API
      const snappedSegs = await Promise.all(
        segs.map(async (seg) => {
          if (seg.type !== 'pedestrian' || seg.coords.length < 2) return seg;
          const start = seg.coords[0];
          const end = seg.coords[seg.coords.length - 1];
          try {
            const pedParams = new URLSearchParams({
              endpoint: 'routes',
              origin: `${start.lat},${start.lng}`,
              destination: `${end.lat},${end.lng}`,
              transportMode: 'pedestrian',
            });
            const pedRes = await fetch(`/api/here?${pedParams}`);
            const pedData = await pedRes.json();
            const sections = pedData?.routes?.[0]?.sections || [];
            const { decodeHereFlexiblePolyline } = await import('@/lib/hereFlexiblePolyline');
            const allPts: { lat: number; lng: number }[] = [];
            for (const sec of sections) {
              if (!sec.polyline) continue;
              const decoded = decodeHereFlexiblePolyline(sec.polyline);
              allPts.push(...decoded.points.map(p => ({ lat: p.lat, lng: p.lng })));
            }
            if (allPts.length >= 2) return { ...seg, coords: allPts };
          } catch { /* keep original straight-line coords */ }
          return seg;
        })
      );

      setTransitSegs(snappedSegs);
      setTransitSteps(steps);

      const distMi = totalLength / 1609.34;
      const uniqueModes = [...new Set(modes)].map(m => TRANSIT_MODE_LABELS[m] || m);
      const uniqueLines = [...new Set(lineNames)].slice(0, 4);

      setTransitSummary({
        durationMin: Math.round(totalDuration / 60),
        distanceMi: distMi,
        modes: uniqueModes.join(' + ') || 'Transit',
        lines: uniqueLines.join(', '),
      });
    } catch (err: any) {
      setError(err?.message || 'Transit routing failed.');
    } finally {
      setLoading(false);
    }
  }, [departureTime, accentColor]);
  
  const calculateRoute = async () => {
    if (!from.trim() || !to.trim()) {
      setError('Please enter both start and destination');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [fromResult, toResult] = await Promise.all([
        fromCoords ? Promise.resolve(fromCoords) : geocode(from),
        toCoords ? Promise.resolve(toCoords) : geocode(to),
      ]);

      const fromLat = fromResult && 'lat' in fromResult ? fromResult.lat : null;
      const fromLng = fromResult && 'lng' in fromResult ? fromResult.lng : null;
      const toLat = toResult && 'lat' in toResult ? toResult.lat : null;
      const toLng = toResult && 'lng' in toResult ? toResult.lng : null;

      if (!fromLat || !fromLng) throw new Error('Could not find start location');
      if (!toLat || !toLng) throw new Error('Could not find destination');

      const fromLoc = { lat: fromLat, lng: fromLng };
      const toLoc = { lat: toLat, lng: toLng };

      setFromCoords(fromLoc);
      setToCoords(toLoc);

      if (routeType === 'transit') {
        clearTransitData();
        await calculateTransitRoute(fromLoc, toLoc);
        return;
      }

      clearTransitData();
      setPedestrianShape([]);

      const mqRouteType = routeType as Exclude<RouteType, 'transit'>;
      const directions = await getDirections(
        `${fromLoc.lat},${fromLoc.lng}`, 
        `${toLoc.lat},${toLoc.lng}`, 
        mqRouteType,
        departureTime
      );

      if (!directions) throw new Error('Could not calculate route');

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

      // For pedestrian mode, fetch road-snapped shape from HERE Routing API
      // (MapQuest pedestrian routing can produce straight lines over water).
      // Combine ALL sections since the route may be split across multiple segments.
      if (routeType === 'pedestrian') {
        try {
          const pedParams = new URLSearchParams({
            endpoint: 'routes',
            origin: `${fromLoc.lat},${fromLoc.lng}`,
            destination: `${toLoc.lat},${toLoc.lng}`,
            transportMode: 'pedestrian',
            return: 'polyline',
          });
          const pedRes = await fetch(`/api/here?${pedParams}`);
          const pedData = await pedRes.json();
          const sections = pedData?.routes?.[0]?.sections || [];
          const { decodeHereFlexiblePolyline } = await import('@/lib/hereFlexiblePolyline');
          const allPts: { lat: number; lng: number }[] = [];
          for (const sec of sections) {
            if (!sec.polyline) continue;
            const decoded = decodeHereFlexiblePolyline(sec.polyline);
            const pts = decoded.points.map((p: any) => ({ lat: p.lat, lng: p.lng }));
            if (pts.length > 0) allPts.push(...pts);
          }
          if (allPts.length >= 2) {
            const dLat = Math.abs(allPts[0].lat - fromLoc.lat);
            const dLng = Math.abs(allPts[0].lng - fromLoc.lng);
            if (dLat < 2 && dLng < 2) {
              setPedestrianShape(allPts);
            }
          }
        } catch { /* fall back to MapQuest rendering */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate route');
      setRoute(null);
      clearTransitData();
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

  // Per-segment colored polylines — visually distinct per transit mode,
  // and road-snapped shape for pedestrian mode
  const routePolylines = useMemo(() => {
    if (isTransit && transitSegs.length > 0) {
      return transitSegs.map((seg) => {
        const segType = seg.type;
        const color = TRANSIT_SEG_COLORS[segType] || accentColor;
        const isPed = segType === 'pedestrian';
        const isBus = BUS_TYPES.has(segType);
        const isFerry = segType === 'ferry';
        return {
          coords: seg.coords,
          color,
          weight: isPed ? 4 : isBus ? 5 : 7,
          opacity: isPed ? 0.7 : 0.95,
          dashed: isPed || isFerry,
        };
      });
    }
    if (isPedestrian && pedestrianShape.length >= 2) {
      return [{
        coords: pedestrianShape,
        color: accentColor,
        weight: 5,
        opacity: 0.9,
        dashed: false,
      }];
    }
    return undefined;
  }, [isTransit, isPedestrian, transitSegs, pedestrianShape, accentColor]);

  const mapFitBounds = useMemo(() => {
    if (!fromCoords || !toCoords) return undefined;
    let north = Math.max(fromCoords.lat, toCoords.lat);
    let south = Math.min(fromCoords.lat, toCoords.lat);
    let east = Math.max(fromCoords.lng, toCoords.lng);
    let west = Math.min(fromCoords.lng, toCoords.lng);
    const allSegs = isTransit ? transitSegs : isPedestrian && pedestrianShape.length > 0 ? [{ coords: pedestrianShape }] : [];
    for (const seg of allSegs) {
      for (const c of seg.coords) {
        if (c.lat > north) north = c.lat;
        if (c.lat < south) south = c.lat;
        if (c.lng > east) east = c.lng;
        if (c.lng < west) west = c.lng;
      }
    }
    return { north, south, east, west };
  }, [fromCoords?.lat, fromCoords?.lng, toCoords?.lat, toCoords?.lng, isTransit, isPedestrian, transitSegs, pedestrianShape]);
  
  const markers = useMemo(() => {
    const result: Array<{
      lat: number; lng: number; label: string; color: string;
      iconUrl?: string; iconCircular?: boolean; iconSize?: [number, number];
      zIndexOffset?: number; type?: 'home' | 'default';
    }> = [];
    if (fromCoords) {
      result.push({
        ...fromCoords, label: 'A', color: accentColor, type: 'home',
        iconUrl: waypointPinIcon({ label: 'A', color: accentColor }),
        iconCircular: false, iconSize: [30, 30], zIndexOffset: 2000,
      });
    }
    if (toCoords) {
      result.push({
        ...toCoords, label: 'B', color: accentColor, type: 'default',
        iconUrl: waypointPinIcon({ label: 'B', color: accentColor }),
        iconCircular: false, iconSize: [30, 30], zIndexOffset: 1500,
      });
    }
    return result;
  }, [fromCoords?.lat, fromCoords?.lng, toCoords?.lat, toCoords?.lng, accentColor]);

  const hasCalculatedRef = useRef(false);
  
  useEffect(() => {
    if (hasCalculatedRef.current && from.trim() && to.trim()) {
      calculateRoute();
    }
  }, [routeType, departureTime]);

  useEffect(() => {
    if (route || transitSummary) {
      hasCalculatedRef.current = true;
    }
  }, [route, transitSummary]);

  return (
    <div 
      className="prism-widget w-full md:w-[900px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <WidgetHeader
        title="Directions"
        subtitle="Get a route, ETA, and turn-by-turn directions."
        variant="impressive"
        layout="inline"
        icon={<Navigation className="w-4 h-4" />}
      />
      <div className="flex flex-col md:flex-row md:h-[700px]">
        {/* Map */}
        <div className="h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            showRoute={!isTransit && !isPedestrian && !!(fromCoords && toCoords)}
            routeStart={!isTransit && !isPedestrian ? (fromCoords || undefined) : undefined}
            routeEnd={!isTransit && !isPedestrian ? (toCoords || undefined) : undefined}
            routeType={isTransit || isPedestrian ? undefined : (routeType === 'shortest' ? 'fastest' : routeType)}
            polylines={routePolylines}
            fitBounds={mapFitBounds}
          />
        </div>
        {/* Sidebar */}
        <div 
          className="w-full md:w-80 flex flex-col border-t md:border-t-0 md:border-r overflow-y-auto md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Compact inputs area */}
          <div 
            className="p-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="space-y-1.5">
              <div
                className="rounded-lg flex items-center gap-2"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '7px 10px' }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                  style={{ background: accentColor, color: 'white' }}
                >
                  A
                </div>
                <AddressAutocomplete
                  value={from}
                  onChange={(v) => {
                    setFrom(v);
                    setFromCoords(null);
                    setRoute(null);
                    clearTransitData();
                    setError(null);
                  }}
                  onSelect={(result) => {
                    if (result.lat && result.lng) setFromCoords({ lat: result.lat, lng: result.lng });
                  }}
                  placeholder="Start location"
                  darkMode={darkMode}
                  inputBg={inputBg}
                  textColor={textColor}
                  mutedText={mutedText}
                  borderColor={borderColor}
                  className="flex-1"
                  hideIcon
                />
              </div>

              <div
                className="rounded-lg flex items-center gap-2"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '7px 10px' }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                  style={{ background: accentColor, color: 'white' }}
                >
                  B
                </div>
                <AddressAutocomplete
                  value={to}
                  onChange={(v) => {
                    setTo(v);
                    setToCoords(null);
                    setRoute(null);
                    clearTransitData();
                    setError(null);
                  }}
                  onSelect={(result) => {
                    if (result.lat && result.lng) setToCoords({ lat: result.lat, lng: result.lng });
                  }}
                  placeholder="Destination"
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

            {/* Mode selector — compact pill row */}
            <div className="flex gap-1.5 mt-3">
              {routeTypes.map((type) => {
                const isActive = routeType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setRouteType(type.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg transition-all text-xs font-medium"
                    style={{
                      background: isActive ? accentColor : 'transparent',
                      color: isActive ? 'white' : 'var(--text-muted)',
                      border: isActive ? `1.5px solid ${accentColor}` : '1.5px solid var(--border-subtle)',
                    }}
                  >
                    <type.icon className="w-3.5 h-3.5" />
                    {type.label}
                  </button>
                );
              })}
            </div>

            {/* Departure time + calculate — inline row */}
            <div className="flex gap-2 mt-3">
              <div className="relative flex-1">
                <button
                  onClick={() => setShowDepartureOptions(!showDepartureOptions)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <Clock className="w-3 h-3 flex-shrink-0" style={{ color: accentColor }} />
                  <span className="truncate">{formatDepartureTime(departureTime)}</span>
                  <ChevronDown className={`w-3 h-3 ml-auto flex-shrink-0 transition-transform ${showDepartureOptions ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
                </button>

                {showDepartureOptions && (
                  <div 
                    className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-20"
                    style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                  >
                    <button
                      onClick={() => { setDepartureTime('now'); setShowDepartureOptions(false); }}
                      className="w-full px-3 py-2 text-left text-xs transition-colors"
                      style={{ background: departureTime === 'now' ? `${accentColor}15` : 'transparent', color: departureTime === 'now' ? accentColor : 'var(--text-main)' }}
                    >
                      Leave now
                    </button>
                    {[15, 30, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => { setDepartureTime(new Date(Date.now() + mins * 60000)); setShowDepartureOptions(false); }}
                        className="w-full px-3 py-2 text-left text-xs transition-colors"
                        style={{ color: 'var(--text-main)' }}
                      >
                        {mins < 60 ? `In ${mins} min` : 'In 1 hour'}
                      </button>
                    ))}
                    <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <input
                        type="datetime-local"
                        min={new Date().toISOString().slice(0, 16)}
                        className="w-full px-2 py-1 rounded text-xs"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                        onChange={(e) => { if (e.target.value) { setDepartureTime(new Date(e.target.value)); setShowDepartureOptions(false); } }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={calculateRoute}
                disabled={loading || !from.trim() || !to.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white flex-shrink-0 disabled:opacity-50"
                style={{ background: accentColor }}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                Go
              </button>
            </div>

            {error && (
              <p className="mt-2 text-xs font-medium px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-error)', background: 'var(--color-error-bg)' }}>
                {error}
              </p>
            )}
          </div>

          {/* ============ RESULTS AREA — the main focus ============ */}

          {/* Transit results */}
          {isTransit && transitSummary && (
            <>
              {/* Summary bar */}
              <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Train className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                  <span className="text-base font-bold" style={{ color: 'var(--text-main)' }}>{formatTime(transitSummary.durationMin)}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {formatDistance(transitSummary.distanceMi)}</span>
                  {transitSummary.lines && (
                    <span className="text-[11px] ml-auto truncate max-w-[40%]" style={{ color: 'var(--text-muted)' }}>{transitSummary.lines}</span>
                  )}
                </div>
                {/* Route segment preview bar */}
                {(() => {
                  const totalDur = transitSteps.reduce((s, st) => s + Math.max(st.durationMin, 1), 0);
                  return (
                    <div className="flex w-full h-3 rounded-full overflow-hidden">
                      {transitSteps.map((step, i) => {
                        const pct = (Math.max(step.durationMin, 1) / totalDur) * 100;
                        const isPed = step.type === 'pedestrian';
                        const Icon = transitStepIcon(step.type);
                        return (
                          <div
                            key={i}
                            className="relative h-full flex items-center justify-center"
                            style={{
                              width: `${pct}%`,
                              minWidth: 6,
                              background: isPed
                                ? `repeating-linear-gradient(90deg, ${step.color}30 0 4px, transparent 4px 8px)`
                                : step.color,
                              opacity: isPed ? 1 : 0.85,
                            }}
                            title={`${step.instruction} · ${step.durationMin} min`}
                          >
                            {pct > 12 && (
                              <Icon className="w-2.5 h-2.5" style={{ color: isPed ? step.color : '#fff' }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Transit step-by-step — always visible, scrollable */}
              <div className="flex-1 overflow-y-auto prism-scrollbar px-4 py-2">
                {transitSteps.map((step, i) => {
                  const Icon = transitStepIcon(step.type);
                  const isLast = i === transitSteps.length - 1;
                  return (
                    <div key={i} className="flex gap-2.5 relative">
                      <div className="flex flex-col items-center flex-shrink-0 pt-2.5">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: step.color + '20', border: `2px solid ${step.color}` }}
                        >
                          <Icon className="w-3 h-3" style={{ color: step.color }} />
                        </div>
                        {!isLast && (
                          <div className="w-0.5 flex-1 min-h-[12px] my-0.5 rounded-full" style={{ background: transitSteps[i + 1]?.color || 'var(--border-default)', opacity: 0.3 }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 py-2" style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)' }}>
                        <div className="text-sm leading-snug" style={{ color: 'var(--text-main)' }}>{step.instruction}</div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
                          {step.durationMin > 0 && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{step.durationMin} min</span>}
                          {step.departureTime && step.type !== 'pedestrian' && (
                            <span className="text-[11px] font-medium" style={{ color: step.color }}>Departs {step.departureTime}</span>
                          )}
                          {(step.intermediateStops ?? 0) > 0 && (
                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{step.intermediateStops} stop{(step.intermediateStops ?? 0) > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Non-transit results */}
          {!isTransit && route && (
            <>
              {/* Compact summary bar */}
              <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {(() => {
                    const ModeIcon = routeTypes.find(r => r.id === routeType)?.icon || Car;
                    return <ModeIcon className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />;
                  })()}
                  <span className="text-base font-bold" style={{ color: 'var(--text-main)' }}>{formatTime(route.time)}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {formatDistance(route.distance)}</span>
                </div>
                <div className="flex gap-1.5">
                  {route.hasHighway && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>Hwy</span>
                  )}
                  {route.hasTolls && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>Tolls</span>
                  )}
                </div>
              </div>

              {/* Turn-by-turn — always visible, scrollable */}
              {route.steps.length > 0 && (
                <div className="flex-1 overflow-y-auto prism-scrollbar">
                  {route.steps.map((step, index) => (
                    <div 
                      key={index} 
                      className="flex items-start gap-2.5 px-4 py-3"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5"
                        style={{ background: index === 0 ? accentColor : 'var(--text-muted)', color: 'white' }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm leading-snug" style={{ color: 'var(--text-main)' }}>{step.narrative}</div>
                        <div className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                          <span>{formatDistance(step.distance)}</span>
                          <span>·</span>
                          <span>{formatTime(step.time)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Empty state when no results yet */}
          {!hasResults && !loading && !error && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <Navigation className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Enter locations and tap Go to see directions</p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex-1 flex items-center justify-center p-6">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
            </div>
          )}
        </div>
      </div>

      {showBranding && (
        <div className="prism-footer">
          {companyLogo && (
            <img src={companyLogo} alt={companyName || 'Company logo'} className="prism-footer-logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <span aria-label="Powered by MapQuest">
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by
          </span>
          <img src="/brand/mapquest-footer-light.svg" alt="MapQuest" className="prism-footer-logo prism-footer-logo--light" />
          <img src="/brand/mapquest-footer-dark.svg" alt="MapQuest" className="prism-footer-logo prism-footer-logo--dark" />
        </div>
      )}
    </div>
  );
}
