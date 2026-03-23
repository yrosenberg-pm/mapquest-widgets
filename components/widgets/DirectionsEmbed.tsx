// components/widgets/DirectionsEmbed.tsx
'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react';
import { Navigation, Car, Bike, PersonStanding, Loader2, ChevronDown, ChevronUp, Clock, Train, Bus, Footprints, Ship, TramFront, Star, Trash2 } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
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
  /** Polyline for this leg (for map focus). Synced with snapped pedestrian geometry where applicable. */
  pathCoords?: { lat: number; lng: number }[];
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

/** Same key as Route Weather so favorites sync between widgets. */
const DIRECTIONS_FAVORITES_KEY = 'mq-route-weather-favorite-places';
const MAX_FAVORITE_PLACES = 25;

type FavoritePlace = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  addedAt: number;
};

type PlaceSelection = { label: string; lat: number; lng: number };

function loadFavoritePlaces(): FavoritePlace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DIRECTIONS_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is FavoritePlace =>
          !!x &&
          typeof (x as FavoritePlace).id === 'string' &&
          typeof (x as FavoritePlace).label === 'string' &&
          typeof (x as FavoritePlace).lat === 'number' &&
          typeof (x as FavoritePlace).lng === 'number',
      )
      .slice(0, MAX_FAVORITE_PLACES);
  } catch {
    return [];
  }
}

function sameFavoriteCoords(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lng - b.lng) < 1e-4;
}

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

function boundsFromCoords(coords: { lat: number; lng: number }[]): { north: number; south: number; east: number; west: number } | null {
  if (!coords.length) return null;
  let north = coords[0].lat;
  let south = coords[0].lat;
  let east = coords[0].lng;
  let west = coords[0].lng;
  for (let i = 1; i < coords.length; i++) {
    const c = coords[i];
    if (c.lat > north) north = c.lat;
    if (c.lat < south) south = c.lat;
    if (c.lng > east) east = c.lng;
    if (c.lng < west) west = c.lng;
  }
  return { north, south, east, west };
}

/** Pad and ensure a minimum span so fitBounds doesn’t over-zoom on tiny segments. */
function expandBounds(
  b: { north: number; south: number; east: number; west: number },
  padLat = 0.00085,
  padLng = 0.00085,
  minSpanLat = 0.0022,
  minSpanLng = 0.0022,
) {
  let north = b.north + padLat;
  let south = b.south - padLat;
  let east = b.east + padLng;
  let west = b.west - padLng;
  let latSpan = north - south;
  let lngSpan = east - west;
  if (latSpan < minSpanLat) {
    const mid = (north + south) / 2;
    north = mid + minSpanLat / 2;
    south = mid - minSpanLat / 2;
  }
  if (lngSpan < minSpanLng) {
    const mid = (east + west) / 2;
    east = mid + minSpanLng / 2;
    west = mid - minSpanLng / 2;
  }
  return { north, south, east, west };
}

/** Slice full route shape into one maneuver using MapQuest `maneuverIndexes` (point indices along the shape). */
function sliceShapeForManeuver(
  shapePoints: { lat: number; lng: number }[],
  maneuverIndexes: number[],
  i: number,
  maneuverCount: number,
): { lat: number; lng: number }[] {
  const pointPairs = shapePoints.length;
  const startPt = Math.max(0, Math.min(pointPairs - 1, Number(maneuverIndexes[i]) || 0));
  const endPt =
    i === maneuverCount - 1
      ? pointPairs - 1
      : Math.max(startPt + 1, Math.min(pointPairs - 1, Number(maneuverIndexes[i + 1]) || startPt + 1));
  const coords: { lat: number; lng: number }[] = [];
  for (let p = startPt; p <= endPt; p++) {
    coords.push(shapePoints[p]);
  }
  return coords;
}

/** Per-step path for map zoom / highlight; falls back to maneuver start/end points when indexes are missing. */
function buildDriveStepPaths(
  shapePoints: { lat: number; lng: number }[] | undefined,
  maneuverIndexes: number[] | undefined,
  rawManeuvers: unknown[],
): ({ lat: number; lng: number }[] | undefined)[] {
  const n = rawManeuvers.length;
  const out: ({ lat: number; lng: number }[] | undefined)[] = Array.from({ length: n }, () => undefined);
  if (shapePoints && shapePoints.length >= 2 && maneuverIndexes && maneuverIndexes.length === n && n > 0) {
    for (let i = 0; i < n; i++) {
      const seg = sliceShapeForManeuver(shapePoints, maneuverIndexes, i, n);
      if (seg.length >= 2) out[i] = seg;
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const m = rawManeuvers[i] as {
      startPoint?: { lat?: number; lng?: number };
      endPoint?: { lat?: number; lng?: number };
    };
    const sp =
      m?.startPoint?.lat != null && m?.startPoint?.lng != null
        ? { lat: Number(m.startPoint.lat), lng: Number(m.startPoint.lng) }
        : null;
    const ep =
      m?.endPoint?.lat != null && m?.endPoint?.lng != null
        ? { lat: Number(m.endPoint.lat), lng: Number(m.endPoint.lng) }
        : null;
    if (sp && ep && (Math.abs(sp.lat - ep.lat) + Math.abs(sp.lng - ep.lng) > 1e-8)) {
      out[i] = [sp, ep];
    } else if (sp && i < n - 1) {
      const next = (rawManeuvers[i + 1] as typeof m)?.startPoint;
      if (next?.lat != null && next?.lng != null) {
        out[i] = [sp, { lat: Number(next.lat), lng: Number(next.lng) }];
      }
    } else if (sp && ep) {
      out[i] = [sp, ep];
    }
  }
  return out;
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
  /** When set, map fits this step’s path; tap the same step again to show the full route. */
  const [transitFocusedStepIndex, setTransitFocusedStepIndex] = useState<number | null>(null);

  /** Drive / bike / walk: path coords per turn-by-turn step (from route shape + maneuver indexes). */
  const [routeStepPathCoords, setRouteStepPathCoords] = useState<({ lat: number; lng: number }[] | undefined)[]>([]);
  /** Non-transit: zoom map to this step’s segment; tap again to show full route. */
  const [focusedRouteStepIndex, setFocusedRouteStepIndex] = useState<number | null>(null);

  const [favoritesPanelOpen, setFavoritesPanelOpen] = useState(false);
  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>(() => loadFavoritePlaces());
  const [closeToken, setCloseToken] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(DIRECTIONS_FAVORITES_KEY, JSON.stringify(favoritePlaces));
    } catch {
      /* quota / private mode */
    }
  }, [favoritePlaces]);

  const addFavoritePlace = useCallback((p: PlaceSelection) => {
    setFavoritePlaces((prev) => {
      if (prev.some((f) => sameFavoriteCoords(f, p))) return prev;
      const next: FavoritePlace = {
        id: `fav-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}-${Date.now()}`,
        label: p.label,
        lat: p.lat,
        lng: p.lng,
        addedAt: Date.now(),
      };
      return [next, ...prev].slice(0, MAX_FAVORITE_PLACES);
    });
  }, []);

  const removeFavoritePlace = useCallback((id: string) => {
    setFavoritePlaces((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const toggleFavoriteSelection = useCallback(
    (sel: PlaceSelection) => {
      const existing = favoritePlaces.find((f) => sameFavoriteCoords(f, sel));
      if (existing) removeFavoritePlace(existing.id);
      else addFavoritePlace(sel);
    },
    [favoritePlaces, addFavoritePlace, removeFavoritePlace],
  );

  const fromSelection = useMemo((): PlaceSelection | null => {
    if (!fromCoords || !from.trim()) return null;
    return { label: from.trim(), lat: fromCoords.lat, lng: fromCoords.lng };
  }, [from, fromCoords]);

  const toSelection = useMemo((): PlaceSelection | null => {
    if (!toCoords || !to.trim()) return null;
    return { label: to.trim(), lat: toCoords.lat, lng: toCoords.lng };
  }, [to, toCoords]);

  const fromIsFavorite = useMemo(
    () => !!(fromSelection && favoritePlaces.some((f) => sameFavoriteCoords(f, fromSelection))),
    [fromSelection, favoritePlaces],
  );
  const toIsFavorite = useMemo(
    () => !!(toSelection && favoritePlaces.some((f) => sameFavoriteCoords(f, toSelection))),
    [toSelection, favoritePlaces],
  );

  const clearTransitData = useCallback(() => {
    setTransitSegs([]);
    setTransitSteps([]);
    setTransitSummary(null);
    setPedestrianShape([]);
    setTransitFocusedStepIndex(null);
  }, []);

  const applyFavoriteFrom = useCallback((f: FavoritePlace) => {
    setFrom(f.label);
    setFromCoords({ lat: f.lat, lng: f.lng });
    setRoute(null);
    clearTransitData();
    setError(null);
    setCloseToken((t) => t + 1);
  }, [clearTransitData]);

  const applyFavoriteTo = useCallback((f: FavoritePlace) => {
    setTo(f.label);
    setToCoords({ lat: f.lat, lng: f.lng });
    setRoute(null);
    clearTransitData();
    setError(null);
    setCloseToken((t) => t + 1);
  }, [clearTransitData]);

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
          pathCoords: segCoords.length ? [...segCoords] : undefined,
        });
      }

      // Snap pedestrian segments to roads via MapQuest Pedestrian Routing
      const snappedSegs = await Promise.all(
        segs.map(async (seg) => {
          if (seg.type !== 'pedestrian' || seg.coords.length < 2) return seg;
          const start = seg.coords[0];
          const end = seg.coords[seg.coords.length - 1];
          try {
            const pedResult = await getDirections(
              `${start.lat},${start.lng}`,
              `${end.lat},${end.lng}`,
              'pedestrian',
            );
            if (pedResult?.shapePoints && pedResult.shapePoints.length >= 2) {
              return { ...seg, coords: pedResult.shapePoints };
            }
          } catch { /* keep original straight-line coords */ }
          return seg;
        })
      );

      let snapSegIdx = 0;
      const mergedSteps: TransitStep[] = steps.map((st) => {
        const pc = st.pathCoords;
        let nextCoords = pc;
        if (pc && pc.length >= 2 && snapSegIdx < snappedSegs.length) {
          nextCoords = [...snappedSegs[snapSegIdx].coords];
          snapSegIdx++;
        }
        return { ...st, pathCoords: nextCoords };
      });

      setTransitSegs(snappedSegs);
      setTransitSteps(mergedSteps);

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
  }, [departureTime, accentColor, clearTransitData]);
  
  const calculateRoute = async () => {
    if (!from.trim() || !to.trim()) {
      setError('Please enter both start and destination');
      return;
    }

    setLoading(true);
    setError(null);
    setFocusedRouteStepIndex(null);
    setRouteStepPathCoords([]);

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

      const rawSteps = directions.steps || [];
      const routeInfo: RouteInfo = {
        distance: directions.distance,
        time: directions.time,
        fuelUsed: directions.fuelUsed,
        hasTolls: directions.hasTolls,
        hasHighway: directions.hasHighway,
        steps: rawSteps,
      };

      setRouteStepPathCoords(
        buildDriveStepPaths(directions.shapePoints, directions.maneuverIndexes, rawSteps),
      );

      setRoute(routeInfo);
      onRouteCalculated?.(routeInfo);

      // For pedestrian mode, get road-snapped shape from MapQuest Pedestrian Routing
      if (routeType === 'pedestrian') {
        try {
          const pedResult = await getDirections(
            `${fromLoc.lat},${fromLoc.lng}`,
            `${toLoc.lat},${toLoc.lng}`,
            'pedestrian',
          );
          if (pedResult?.shapePoints && pedResult.shapePoints.length >= 2) {
            const dLat = Math.abs(pedResult.shapePoints[0].lat - fromLoc.lat);
            const dLng = Math.abs(pedResult.shapePoints[0].lng - fromLoc.lng);
            if (dLat < 2 && dLng < 2) {
              setPedestrianShape(pedResult.shapePoints);
            }
          }
        } catch { /* fall back to MapQuest rendering */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate route');
      setRoute(null);
      setRouteStepPathCoords([]);
      setFocusedRouteStepIndex(null);
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
      const lines: Array<{
        coords: { lat: number; lng: number }[];
        color: string;
        weight: number;
        opacity: number;
        dashed: boolean;
        className?: string;
      }> = transitSegs.map((seg) => {
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
      if (transitFocusedStepIndex !== null) {
        const seg = transitSegs[transitFocusedStepIndex];
        if (seg?.coords?.length >= 2) {
          const segType = seg.type;
          const base = TRANSIT_SEG_COLORS[segType] || accentColor;
          const isPed = segType === 'pedestrian';
          const isBus = BUS_TYPES.has(segType);
          const isFerry = segType === 'ferry';
          lines.push({
            coords: seg.coords,
            color: base,
            weight: isPed ? 7 : isBus ? 9 : 10,
            opacity: 1,
            dashed: isPed || isFerry,
            className: 'highlighted-segment-glow',
          });
        }
      }
      return lines;
    }
    const stepOverlay =
      focusedRouteStepIndex !== null ? routeStepPathCoords[focusedRouteStepIndex] : undefined;
    const hasStepFocus = !!(stepOverlay && stepOverlay.length >= 2);

    if (isPedestrian && pedestrianShape.length >= 2) {
      const base: Array<{
        coords: { lat: number; lng: number }[];
        color: string;
        weight: number;
        opacity: number;
        dashed: boolean;
        className?: string;
      }> = [{
        coords: pedestrianShape,
        color: accentColor,
        weight: 5,
        opacity: 0.9,
        dashed: false,
      }];
      if (hasStepFocus) {
        base.push({
          coords: stepOverlay,
          color: accentColor,
          weight: 9,
          opacity: 1,
          dashed: false,
          className: 'highlighted-segment-glow',
        });
      }
      return base;
    }
    // Drive / bike: base route from MapQuest showRoute; overlay highlighted step only when selected
    if (!isTransit && hasStepFocus) {
      return [{
        coords: stepOverlay!,
        color: accentColor,
        weight: 8,
        opacity: 0.95,
        dashed: false,
        className: 'highlighted-segment-glow',
      }];
    }
    return undefined;
  }, [isTransit, isPedestrian, transitSegs, pedestrianShape, accentColor, focusedRouteStepIndex, routeStepPathCoords, transitFocusedStepIndex]);

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

  /** Fit map to one step segment (transit leg or turn-by-turn); tap again for full route. */
  const directionsMapFitBounds = useMemo(() => {
    if (isTransit && transitFocusedStepIndex !== null) {
      const coords = transitSteps[transitFocusedStepIndex]?.pathCoords;
      if (coords?.length) {
        const b = boundsFromCoords(coords);
        if (b) return expandBounds(b);
      }
    }
    if (!isTransit && focusedRouteStepIndex !== null) {
      const coords = routeStepPathCoords[focusedRouteStepIndex];
      if (coords && coords.length >= 2) {
        const b = boundsFromCoords(coords);
        if (b) return expandBounds(b);
      }
    }
    return mapFitBounds;
  }, [isTransit, transitFocusedStepIndex, transitSteps, mapFitBounds, focusedRouteStepIndex, routeStepPathCoords]);
  
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
        <div className="relative h-[300px] md:h-auto md:flex-1 md:order-2">
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
            fitBounds={directionsMapFitBounds}
          />

          {/* Favorites — floating collapsible, top-right of map (same storage as Route Weather) */}
          <div
            className="absolute top-3 right-3 z-[1001] w-[min(calc(100%-24px),288px)]"
            style={{ pointerEvents: 'auto' }}
          >
            <div
              className="rounded-2xl shadow-xl overflow-hidden"
              style={{
                background: 'var(--bg-widget)',
                border: '1px solid var(--border-subtle)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <button
                type="button"
                onClick={() => setFavoritesPanelOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:brightness-[1.02]"
                style={{
                  background: 'var(--bg-panel)',
                  borderBottom: favoritesPanelOpen ? '1px solid var(--border-subtle)' : 'none',
                }}
                aria-expanded={favoritesPanelOpen}
                aria-controls="directions-favorites-panel"
                id="directions-favorites-trigger"
              >
                <Star className="w-4 h-4 shrink-0" style={{ color: accentColor }} aria-hidden />
                <span className="text-xs font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--text-main)' }}>
                  Favorites
                </span>
                {favoritePlaces.length > 0 ? (
                  <span
                    className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md shrink-0"
                    style={{ background: `${accentColor}22`, color: accentColor }}
                  >
                    {favoritePlaces.length}
                  </span>
                ) : null}
                {favoritesPanelOpen ? (
                  <ChevronUp className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden />
                )}
              </button>
              {favoritesPanelOpen ? (
                <div id="directions-favorites-panel" className="p-3" role="region" aria-labelledby="directions-favorites-trigger">
                  <p className="text-[10px] mb-2 leading-snug" style={{ color: 'var(--text-muted)' }}>
                    Saved on this device. Tap the <strong className="font-semibold">star</strong> next to a field to save; click again to remove.
                  </p>
                  {favoritePlaces.length === 0 ? (
                    <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
                      No favorites yet — pick a place from suggestions, then fill the star.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 max-h-[220px] overflow-y-auto prism-scrollbar pr-0.5" aria-label="Favorite places">
                      {favoritePlaces.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center gap-1 rounded-lg px-1.5 py-1"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                        >
                          <span
                            className="flex-1 min-w-0 text-[11px] leading-snug truncate"
                            title={f.label}
                            style={{ color: 'var(--text-main)' }}
                          >
                            {f.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => applyFavoriteFrom(f)}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 hover:brightness-110"
                            style={{ background: '#16A34A22', color: '#16A34A' }}
                            title="Use as start (A)"
                          >
                            From
                          </button>
                          <button
                            type="button"
                            onClick={() => applyFavoriteTo(f)}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 hover:brightness-110"
                            style={{ background: '#DC262622', color: '#DC2626' }}
                            title="Use as destination (B)"
                          >
                            To
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFavoritePlace(f.id)}
                            className="p-1 rounded-md shrink-0 hover:opacity-80"
                            style={{ color: 'var(--text-muted)' }}
                            title="Remove favorite"
                            aria-label={`Remove ${f.label}`}
                          >
                            <Trash2 className="w-3 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </div>
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
                    setRouteStepPathCoords([]);
                    setFocusedRouteStepIndex(null);
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
                  closeToken={closeToken}
                />
                <button
                  type="button"
                  disabled={!fromSelection}
                  onClick={() => fromSelection && toggleFavoriteSelection(fromSelection)}
                  className="p-1 rounded-lg shrink-0 transition-opacity disabled:opacity-35 hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-widget)]"
                  title={
                    !fromSelection
                      ? 'Choose a place from suggestions or run Go to set a start point'
                      : fromIsFavorite
                        ? 'Remove from favorites'
                        : 'Add to favorites'
                  }
                  aria-pressed={fromIsFavorite}
                  aria-label={
                    !fromSelection
                      ? 'Favorite start (choose a place first)'
                      : fromIsFavorite
                        ? 'Remove start from favorites'
                        : 'Add start to favorites'
                  }
                >
                  <Star
                    className="w-4 h-4"
                    aria-hidden
                    style={{
                      color: fromIsFavorite ? accentColor : 'var(--text-muted)',
                      fill: fromIsFavorite ? accentColor : 'transparent',
                    }}
                    strokeWidth={fromIsFavorite ? 0 : 2}
                  />
                </button>
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
                    setRouteStepPathCoords([]);
                    setFocusedRouteStepIndex(null);
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
                  closeToken={closeToken}
                />
                <button
                  type="button"
                  disabled={!toSelection}
                  onClick={() => toSelection && toggleFavoriteSelection(toSelection)}
                  className="p-1 rounded-lg shrink-0 transition-opacity disabled:opacity-35 hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-widget)]"
                  title={
                    !toSelection
                      ? 'Choose a place from suggestions or run Go to set a destination'
                      : toIsFavorite
                        ? 'Remove from favorites'
                        : 'Add to favorites'
                  }
                  aria-pressed={toIsFavorite}
                  aria-label={
                    !toSelection
                      ? 'Favorite destination (choose a place first)'
                      : toIsFavorite
                        ? 'Remove destination from favorites'
                        : 'Add destination to favorites'
                  }
                >
                  <Star
                    className="w-4 h-4"
                    aria-hidden
                    style={{
                      color: toIsFavorite ? accentColor : 'var(--text-muted)',
                      fill: toIsFavorite ? accentColor : 'transparent',
                    }}
                    strokeWidth={toIsFavorite ? 0 : 2}
                  />
                </button>
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
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg transition-all text-xs font-medium hover:opacity-80"
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
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs hover:brightness-95 transition-all"
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
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ background: departureTime === 'now' ? `${accentColor}15` : 'transparent', color: departureTime === 'now' ? accentColor : 'var(--text-main)' }}
                    >
                      Leave now
                    </button>
                    {[15, 30, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => { setDepartureTime(new Date(Date.now() + mins * 60000)); setShowDepartureOptions(false); }}
                        className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white flex-shrink-0 disabled:opacity-50 hover:brightness-110 transition-all"
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
                        const isFocused = transitFocusedStepIndex === i;
                        return (
                          <div
                            key={i}
                            role="button"
                            tabIndex={0}
                            onClick={() => setTransitFocusedStepIndex((prev) => (prev === i ? null : i))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setTransitFocusedStepIndex((prev) => (prev === i ? null : i));
                              }
                            }}
                            className={`relative h-full flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${isFocused ? 'directions-transit-bar-segment--breathing' : ''}`}
                            style={{
                              width: `${pct}%`,
                              minWidth: 6,
                              background: isPed
                                ? `repeating-linear-gradient(90deg, ${step.color}30 0 4px, transparent 4px 8px)`
                                : step.color,
                              opacity: isPed ? 1 : 0.85,
                              ...(isFocused ? { ['--directions-ring' as string]: accentColor } : {}),
                            } as CSSProperties}
                            title={`${step.instruction} · ${step.durationMin} min — click to zoom map`}
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
                <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                  Tap a step to zoom the map to that leg. Tap again to show the full route.
                </p>
                {transitSteps.map((step, i) => {
                  const Icon = transitStepIcon(step.type);
                  const isLast = i === transitSteps.length - 1;
                  const isFocused = transitFocusedStepIndex === i;
                  const canFocus = !!(step.pathCoords && step.pathCoords.length > 0);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!canFocus}
                      onClick={() => canFocus && setTransitFocusedStepIndex((prev) => (prev === i ? null : i))}
                      className={`w-full text-left flex gap-2.5 relative rounded-xl px-1 -mx-1 transition-colors ${canFocus ? 'cursor-pointer hover:opacity-95' : 'cursor-default'} ${isFocused ? 'directions-selected-step-breathe' : ''}`}
                      style={
                        isFocused
                          ? ({ ['--directions-accent' as string]: step.color } as CSSProperties)
                          : undefined
                      }
                      title={canFocus ? 'Zoom map to this step' : undefined}
                    >
                      <div className="flex flex-col items-center flex-shrink-0 pt-2.5">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: step.color + '20', border: `2px solid ${step.color}` }}
                        >
                          <Icon className="w-3 h-3" style={{ color: step.color }} />
                        </div>
                        {!isLast && (
                          <div
                            className="w-0.5 flex-1 min-h-[12px] my-0.5 rounded-full"
                            style={{ background: step.color, opacity: 0.5 }}
                          />
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
                    </button>
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

              {/* Turn-by-turn — always visible, scrollable; tap a step to zoom the map to that segment */}
              {route.steps.length > 0 && (
                <div className="flex-1 overflow-y-auto prism-scrollbar flex flex-col min-h-0">
                  <p className="text-[10px] px-4 pt-2 pb-1 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    Tap a step to zoom the map to that turn. Tap again to show the full route.
                  </p>
                  {route.steps.map((step, index) => {
                    const narrative = (step as { narrative?: string }).narrative ?? '';
                    const canFocus = (routeStepPathCoords[index]?.length ?? 0) >= 2;
                    const isFocused = focusedRouteStepIndex === index;
                    return (
                      <button
                        key={index}
                        type="button"
                        disabled={!canFocus}
                        onClick={() =>
                          canFocus &&
                          setFocusedRouteStepIndex((prev) => (prev === index ? null : index))
                        }
                        className={`flex items-start gap-2.5 px-4 py-3 text-left w-full transition-colors ${
                          canFocus ? 'cursor-pointer hover:opacity-95' : 'cursor-default opacity-90'
                        } ${isFocused && canFocus ? 'directions-selected-step-breathe-drive' : ''}`}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          ...(isFocused && canFocus
                            ? ({ ['--directions-accent' as string]: accentColor } as CSSProperties)
                            : {}),
                        }}
                        title={canFocus ? 'Zoom map to this turn' : undefined}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5"
                          style={{
                            background:
                              isFocused || index === 0 ? accentColor : 'var(--text-muted)',
                            color: 'white',
                          }}
                        >
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm leading-snug" style={{ color: 'var(--text-main)' }}>{narrative}</div>
                          <div className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                            <span>{formatDistance(step.distance)}</span>
                            <span>·</span>
                            <span>{formatTime(step.time)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
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
          <MapQuestPoweredLogo darkMode={darkMode} />
        </div>
      )}
    </div>
  );
}
