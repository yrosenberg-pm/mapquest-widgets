// components/widgets/TruckRouting.tsx
'use client';

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Navigation, Truck, Loader2, ChevronDown, ChevronUp, Clock, Settings2 } from 'lucide-react';
import { jitter, sleep } from '@/lib/gallery/jitter';
import { geocode, searchPlaces } from '@/lib/mapquest';
import {
  TRUCK_GALLERY_DURHAM_FROM,
  TRUCK_GALLERY_DURHAM_TO,
  TRUCK_GALLERY_DURHAM_MAP_VIEW,
} from '@/lib/truckRouting/constants';
import {
  DEFAULT_VEHICLE,
  fetchHereTruckDirections,
  fetchMapQuestTruckDirections,
  type VehicleProfile,
} from '@/lib/truckRouting/directions';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import AddressAutocomplete from '../AddressAutocomplete';
import WidgetHeader from './WidgetHeader';
import CollapsibleSection from './CollapsibleSection';

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
  maxElevationFt?: number | null;
}

export type TruckRoutingGalleryReveal = 'header' | 'map' | 'controls' | 'full';

export interface TruckRoutingHandle {
  /** Runs the built-in Durham, NC bridge-clearance demo (same as the Durham demo button). */
  runDurhamDemo: () => void;
  /** Gallery sequence: loading first, then route API + traced reveal. */
  startGalleryDurhamRoute: () => Promise<void>;
}

export { TRUCK_GALLERY_DURHAM_FROM, TRUCK_GALLERY_DURHAM_TO, TRUCK_GALLERY_DURHAM_MAP_VIEW };

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
  /**
   * Optional ceiling for elevation along the route. Used to avoid routing freight above a certain elevation.
   * Units: feet.
   */
  defaultMaxElevationFt?: number;
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
  /** Gallery scripted build: stagger header → map → controls (default: full). */
  galleryReveal?: TruckRoutingGalleryReveal;
  /** When `skeleton`, map area shows a placeholder until `live`. */
  mapDisplayMode?: 'skeleton' | 'live';
  /** Hide route polyline until `runDurhamDemo()` (gallery demo — route draws on camera). */
  deferRouteVisualization?: boolean;
  /** Hide Durham / Donner preset buttons (gallery demo). */
  hidePresetDemoButtons?: boolean;
  onMapReady?: () => void;
  /** Stagger Leaflet tile fade-in (gallery demo). */
  mapTilesRaggedReveal?: boolean;
  /** Trace route polyline over ~1.3–1.6s with ease + mid-path hesitation. */
  animateRouteReveal?: boolean;
  routeRevealDurationMs?: number;
  /** Scripted gallery build (empty form → staged fill). */
  galleryScriptedDemo?: boolean;
  /** Keep road/street basemap at all zoom levels (no satellite auto-switch). */
  lockBasemap?: 'road';
  /** Map center/zoom before route coords exist (gallery). */
  mapViewOverride?: { lat: number; lng: number; zoom: number };
  /** Bumps to trigger a smooth flyTo via MapQuestMap. */
  mapFlyToKey?: number;
  mapFlyToDurationMs?: number;
  /** Display strings for staged address fill (gallery). */
  galleryFromDisplay?: string;
  galleryToDisplay?: string;
  /** When true, vehicle profile fields show real values. */
  galleryVehicleReady?: boolean;
  /** Keep CTA in "Calculating…" until route trace animation finishes. */
  holdLoadingUntilRouteReveal?: boolean;
  onRouteRevealComplete?: () => void;
  /** No card shadow/border during gallery build (parent adds elevation when done). */
  suppressCardElevation?: boolean;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

// Default vehicle constraints (can be overridden via props)
const DEFAULT_CONSTRAINTS = {
  height: { min: 8, max: 14 },
  weight: { min: 5, max: 40 },
  length: { min: 20, max: 75 },
  width: { min: 8, max: 8.5 },
  axleCount: { min: 2, max: 6 },
};

const EMPTY_VEHICLE: VehicleProfile = {
  height: 0,
  weight: 0,
  length: 0,
  width: 0,
  axleCount: 0,
};

function metersToFeet(m: number) {
  return m * 3.28084;
}

function feetToMeters(ft: number) {
  return ft / 3.28084;
}

function samplePointsForElevation(points: Array<{ lat: number; lng: number }>, maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const out: Array<{ lat: number; lng: number }> = [];
  out.push(points[0]);
  const innerCount = maxPoints - 2;
  const step = (points.length - 2) / Math.max(1, innerCount);
  for (let i = 1; i <= innerCount; i++) {
    const idx = 1 + Math.round(i * step);
    out.push(points[Math.min(points.length - 2, idx)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function stablePoiKey(item: any) {
  const id = item?.id || item?.place_id || item?.placeId;
  if (typeof id === 'string' && id.trim()) return `id:${id.trim()}`;
  const lat = item?.position?.lat ?? item?.lat;
  const lng = item?.position?.lng ?? item?.lng;
  const title = item?.title || item?.name || '';
  if (typeof lat === 'number' && typeof lng === 'number') return `ll:${lat.toFixed(6)},${lng.toFixed(6)}|${String(title).trim()}`;
  return `raw:${String(title).trim()}`;
}

const TruckRouting = forwardRef<TruckRoutingHandle, TruckRoutingProps>(function TruckRouting(
  {
    defaultFrom = '',
    defaultTo = '',
    accentColor = '#F97316', // Orange for trucks
    darkMode = false,
    showBranding = true,
    companyName,
    companyLogo,
    fontFamily,
    defaultMaxElevationFt,
    defaultVehicle,
    vehicleConstraints,
    onRouteCalculated,
    galleryReveal = 'full',
    mapDisplayMode = 'live',
    deferRouteVisualization = false,
    hidePresetDemoButtons = false,
    onMapReady,
    mapTilesRaggedReveal = false,
    animateRouteReveal = false,
    routeRevealDurationMs = 1450,
    galleryScriptedDemo = false,
    lockBasemap,
    mapViewOverride,
    mapFlyToKey = 0,
    mapFlyToDurationMs = 1000,
    galleryFromDisplay,
    galleryToDisplay,
    galleryVehicleReady = false,
    holdLoadingUntilRouteReveal = false,
    onRouteRevealComplete,
    suppressCardElevation = false,
  },
  ref
) {
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
  const [useHereRouting, setUseHereRouting] = useState(true); // Default to provider routing for better truck restrictions support
  const [routePolyline, setRoutePolyline] = useState<{ lat: number; lng: number }[] | undefined>(undefined);
  const [showTruckPois, setShowTruckPois] = useState(true);
  const [truckPois, setTruckPois] = useState<Array<{ lat: number; lng: number; title: string }>>([]);
  const [truckPoisLoading, setTruckPoisLoading] = useState(false);
  const [truckPoisError, setTruckPoisError] = useState<string | null>(null);
  const [truckMapZoom, setTruckMapZoom] = useState(10);
  const handleTruckBoundsChange = useCallback((b: { zoom: number }) => setTruckMapZoom(b.zoom), []);
  const [demoMode, setDemoMode] = useState(false);
  const [demoScenario, setDemoScenario] = useState<'durham' | 'donner' | null>(null);
  const [routeVisualizationAllowed, setRouteVisualizationAllowed] = useState(!deferRouteVisualization);
  const [maxElevationFt, setMaxElevationFt] = useState<number | null>(
    typeof defaultMaxElevationFt === 'number' && Number.isFinite(defaultMaxElevationFt) ? defaultMaxElevationFt : null
  );
  const [elevationNote, setElevationNote] = useState<string | null>(null);
  const [routeMaxElevationFt, setRouteMaxElevationFt] = useState<number | null>(null);
  const lastAutoRecalcKeyRef = useRef<string | null>(null);
  const pendingAutoRecalcKeyRef = useRef<string | null>(null);
  const hasCalculatedRef = useRef(false);
  const [galleryRouteRevealActive, setGalleryRouteRevealActive] = useState(false);
  const galleryRouteRevealActiveRef = useRef(false);
  const [mapFadedIn, setMapFadedIn] = useState(!galleryScriptedDemo);

  useEffect(() => {
    if (!galleryScriptedDemo) {
      setMapFadedIn(true);
      return;
    }
    if (mapDisplayMode === 'live') {
      const id = requestAnimationFrame(() => setMapFadedIn(true));
      return () => cancelAnimationFrame(id);
    }
    setMapFadedIn(false);
  }, [galleryScriptedDemo, mapDisplayMode]);

  // Vehicle profile state
  const [vehicle, setVehicle] = useState<VehicleProfile>(
    galleryScriptedDemo
      ? { ...EMPTY_VEHICLE }
      : { ...DEFAULT_VEHICLE, ...defaultVehicle },
  );

  useEffect(() => {
    if (!galleryScriptedDemo || !galleryVehicleReady) return;
    setVehicle({ ...DEFAULT_VEHICLE, ...defaultVehicle });
  }, [galleryScriptedDemo, galleryVehicleReady, defaultVehicle]);

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
  const border = darkMode ? '#3E5060' : 'var(--border-subtle)';
  const textMain = darkMode ? '#F1F5F9' : 'var(--text-main)';
  const textMuted = darkMode ? '#A8B8CC' : 'var(--text-muted)';
  const buttonMuted = darkMode ? '#94A3B8' : 'var(--text-muted)';
  const bgWidget = darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)';

  const getHereTruckDirections = async (
    fromCoords: { lat: number; lng: number },
    toCoords: { lat: number; lng: number },
    vehicleProfile: VehicleProfile,
    departure?: 'now' | Date,
    elevationCeilingFt?: number | null,
    via?: string[],
  ) => {
    const result = await fetchHereTruckDirections(fromCoords, toCoords, vehicleProfile, {
      departure,
      elevationCeilingFt,
      via,
    });
    setElevationNote(result.elevationNote ?? null);
    setRouteMaxElevationFt(result.routeMaxElevationFt ?? null);
    return result;
  };

  const getMapQuestTruckDirections = (
    fromLocation: string,
    toLocation: string,
    vehicleProfile: VehicleProfile,
    departure?: 'now' | Date,
  ) => fetchMapQuestTruckDirections(fromLocation, toLocation, vehicleProfile, departure);

  const DEMO_FROM = '126 S Gregson St, Durham, NC 27701';
  const DEMO_TO = '310 S Gregson St, Durham, NC 27701';
  const DEMO_DONNER_FROM = '700 Capitol Mall, Sacramento, CA 95814';
  const DEMO_DONNER_TO = '100 N Sierra St, Reno, NV 89503';
  const DEMO_DONNER_MAX_ELEV_FT = 5600;
  // Low-elevation corridor via Feather River Canyon / Beckwourth Pass area (approx).
  // These `via` points make the demo deterministic: ceilings below ~5600 ft will route around the high summit corridor.
  const DEMO_DONNER_LOW_VIA: string[] = [
    '39.9368,-120.9472', // Quincy, CA
    '39.8107,-120.4694', // Portola, CA
  ];

  const calculateRoute = async (opts?: { from?: string; to?: string; applyInputs?: boolean; preferSelectedCoords?: boolean }) => {
    const fromValue = (opts?.from ?? from).trim();
    const toValue = (opts?.to ?? to).trim();

    if (!fromValue || !toValue) {
      setError('Please enter both start and destination');
      return;
    }

    // If we're applying demo (or any override) inputs, update UI state first.
    if (opts?.applyInputs) {
      if (typeof opts.from === 'string') setFrom(opts.from);
      if (typeof opts.to === 'string') setTo(opts.to);
      setFromCoords(null);
      setToCoords(null);
      setRoute(null);
      setRoutePolyline(undefined);
      setStepsExpanded(false);
      setError(null);
      setElevationNote(null);
      setRouteMaxElevationFt(null);
    }

    setLoading(true);
    setError(null);
    setRoutePolyline(undefined);

    try {
      // If we already have selected coordinates (from autocomplete selection),
      // prefer those for rerouting (prevents re-geocoding + state churn loops).
      let fromLoc: { lat: number; lng: number } | null = null;
      let toLoc: { lat: number; lng: number } | null = null;

      if (opts?.preferSelectedCoords && fromCoords && toCoords) {
        fromLoc = fromCoords;
        toLoc = toCoords;
      } else {
        const [fromResult, toResult] = await Promise.all([
          geocode(fromValue),
          geocode(toValue),
        ]);

        if (!fromResult?.lat || !fromResult?.lng) {
          throw new Error('Could not find start location');
        }
        if (!toResult?.lat || !toResult?.lng) {
          throw new Error('Could not find destination');
        }

        fromLoc = { lat: fromResult.lat, lng: fromResult.lng };
        toLoc = { lat: toResult.lat, lng: toResult.lng };

        // Only update coords state if it actually changed (prevents reroute loops).
        setFromCoords((prev) => (prev && prev.lat === fromLoc!.lat && prev.lng === fromLoc!.lng ? prev : fromLoc));
        setToCoords((prev) => (prev && prev.lat === toLoc!.lat && prev.lng === toLoc!.lng ? prev : toLoc));
      }

      let directions;
      
      // Use routing API for better truck routing (with vehicle dimension restrictions)
      if (useHereRouting) {
        try {
          const via =
            demoScenario === 'donner' &&
            maxElevationFt != null &&
            maxElevationFt < DEMO_DONNER_MAX_ELEV_FT
              ? DEMO_DONNER_LOW_VIA
              : undefined;

          directions = await getHereTruckDirections(fromLoc!, toLoc!, vehicle, departureTime, maxElevationFt, via);
          if (directions.polyline && directions.polyline.length > 0) {
            setRoutePolyline(directions.polyline);
          } else {
            setRoutePolyline(undefined);
          }
        } catch (hereErr) {
          console.warn('[TruckRouting] HERE truck routing failed, falling back to MapQuest:', hereErr);
          setRoutePolyline(undefined);
          directions = await getMapQuestTruckDirections(
            `${fromLoc!.lat},${fromLoc!.lng}`,
            `${toLoc!.lat},${toLoc!.lng}`,
            vehicle,
            departureTime,
          );
          if (directions.polyline && directions.polyline.length > 0) {
            setRoutePolyline(directions.polyline);
          }
          setElevationNote(null);
          setRouteMaxElevationFt(null);
        }
      } else {
        directions = await getMapQuestTruckDirections(
          `${fromLoc!.lat},${fromLoc!.lng}`,
          `${toLoc!.lat},${toLoc!.lng}`,
          vehicle,
          departureTime,
        );
        if (directions.polyline && directions.polyline.length > 0) {
          setRoutePolyline(directions.polyline);
        } else {
          setRoutePolyline(undefined);
        }
        setElevationNote(null);
        setRouteMaxElevationFt(null);
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
        maxElevationFt: directions.maxElevationFt ?? routeMaxElevationFt,
      };

      setRoute(routeInfo);
      onRouteCalculated?.(routeInfo, vehicle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate truck route');
      setRoute(null);
    } finally {
      if (!holdLoadingUntilRouteReveal) {
        setLoading(false);
      }
    }
  };

  const calculateRouteRef = useRef(calculateRoute);
  calculateRouteRef.current = calculateRoute;

  const handleRouteRevealComplete = useCallback(() => {
    galleryRouteRevealActiveRef.current = false;
    setGalleryRouteRevealActive(false);
    onRouteRevealComplete?.();
    if (holdLoadingUntilRouteReveal) {
      setLoading(false);
    }
  }, [holdLoadingUntilRouteReveal, onRouteRevealComplete]);

  const effectiveAnimateRouteReveal = animateRouteReveal || galleryRouteRevealActive;

  useEffect(() => {
    if (!holdLoadingUntilRouteReveal || !loading) return;
    const fallbackMs = (routeRevealDurationMs ?? 1450) + 1200;
    const t = window.setTimeout(() => {
      galleryRouteRevealActiveRef.current = false;
      setGalleryRouteRevealActive(false);
      setLoading(false);
    }, fallbackMs);
    return () => window.clearTimeout(t);
  }, [holdLoadingUntilRouteReveal, loading, routeRevealDurationMs]);

  const startGalleryDurhamRoute = useCallback(async () => {
    setGalleryRouteRevealActive(true);
    setRouteVisualizationAllowed(true);
    setDemoMode(true);
    setDemoScenario('durham');
    setMaxElevationFt(null);
    setFrom(TRUCK_GALLERY_DURHAM_FROM);
    setTo(TRUCK_GALLERY_DURHAM_TO);
    setLoading(true);
    setError(null);
    setRoute(null);
    setRoutePolyline(undefined);
    setStepsExpanded(false);

    const minLoadingMs = jitter(600, 0.3);

    const routeVehicle: VehicleProfile = { ...DEFAULT_VEHICLE, ...defaultVehicle };

    try {
      const routingWork = (async () => {
        const [fromResult, toResult] = await Promise.all([
          geocode(TRUCK_GALLERY_DURHAM_FROM),
          geocode(TRUCK_GALLERY_DURHAM_TO),
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
        if (useHereRouting) {
          try {
            directions = await getHereTruckDirections(
              fromLoc,
              toLoc,
              routeVehicle,
              departureTime,
              maxElevationFt,
            );
          } catch (hereErr) {
            console.warn('[TruckRouting] HERE truck routing failed, falling back to MapQuest:', hereErr);
            directions = await getMapQuestTruckDirections(
              `${fromLoc.lat},${fromLoc.lng}`,
              `${toLoc.lat},${toLoc.lng}`,
              routeVehicle,
              departureTime,
            );
          }
        } else {
          directions = await getMapQuestTruckDirections(
            `${fromLoc.lat},${fromLoc.lng}`,
            `${toLoc.lat},${toLoc.lng}`,
            routeVehicle,
            departureTime,
          );
        }

        if (!directions) {
          throw new Error('Could not calculate truck route');
        }

        return directions;
      })();

      const [, directions] = await Promise.all([sleep(minLoadingMs), routingWork]);

      if (directions.polyline && directions.polyline.length > 0) {
        setRoutePolyline(directions.polyline);
      } else {
        setRoutePolyline(undefined);
      }

      const routeInfo: RouteInfo = {
        distance: directions.distance,
        time: directions.time,
        fuelUsed: directions.fuelUsed,
        hasTolls: directions.hasTolls,
        hasHighway: directions.hasHighway,
        steps: directions.steps || [],
        maxElevationFt: directions.maxElevationFt ?? routeMaxElevationFt,
      };

      setRoute(routeInfo);
      onRouteCalculated?.(routeInfo, routeVehicle);
      hasCalculatedRef.current = true;

      if (!holdLoadingUntilRouteReveal || !galleryRouteRevealActiveRef.current) {
        setLoading(false);
        galleryRouteRevealActiveRef.current = false;
        setGalleryRouteRevealActive(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate truck route');
      setRoute(null);
      galleryRouteRevealActiveRef.current = false;
      setGalleryRouteRevealActive(false);
      setLoading(false);
    }
  }, [
    departureTime,
    maxElevationFt,
    useHereRouting,
    routeMaxElevationFt,
    onRouteCalculated,
    defaultVehicle,
    holdLoadingUntilRouteReveal,
  ]);

  const runDurhamDemo = useCallback(() => {
    setRouteVisualizationAllowed(true);
    setDemoMode(true);
    setDemoScenario('durham');
    setMaxElevationFt(null);
    void calculateRouteRef.current({ from: DEMO_FROM, to: DEMO_TO, applyInputs: true });
  }, []);

  useImperativeHandle(
    ref,
    () => ({ runDurhamDemo, startGalleryDurhamRoute }),
    [runDurhamDemo, startGalleryDurhamRoute],
  );

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
  };

  const formatDistance = (miles: number) => `${miles.toFixed(1)} mi`;

  const mapCenter =
    fromCoords || toCoords || mapViewOverride || { lat: 39.8283, lng: -98.5795 };

  const mapZoom =
    fromCoords && toCoords && !galleryScriptedDemo
      ? 10
      : mapViewOverride?.zoom ?? (fromCoords && toCoords ? 10 : 4);

  const lockRoadBasemap = lockBasemap === 'road';
  const resolvedMapType = lockRoadBasemap
    ? darkMode
      ? 'dark'
      : 'map'
    : truckMapZoom >= 18
      ? 'hybrid'
      : undefined;

  const displayedFrom =
    galleryScriptedDemo && galleryFromDisplay !== undefined ? galleryFromDisplay : from;
  const displayedTo = galleryScriptedDemo && galleryToDisplay !== undefined ? galleryToDisplay : to;

  const vehicleFieldsReady = !galleryScriptedDemo || galleryVehicleReady;

  const showMapSection =
    galleryReveal === 'map' || galleryReveal === 'controls' || galleryReveal === 'full';
  const showSidebar = galleryReveal === 'controls' || galleryReveal === 'full';
  const showFooter = galleryReveal === 'full';
  const showRouteOnMap =
    routeVisualizationAllowed && !!(fromCoords && toCoords);

  const revealSectionClass = (visible: boolean) =>
    [
      'transition-all duration-[400ms] ease-out',
      visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-1 scale-[0.98] max-h-0 overflow-hidden pointer-events-none',
    ].join(' ');
  
  const markers: Array<{
    lat: number;
    lng: number;
    label?: string;
    color?: string;
    type?: 'home' | 'poi' | 'default';
    iconUrl?: string;
    iconSize?: [number, number];
    iconCircular?: boolean;
    clusterable?: boolean;
  }> = [];
  if (fromCoords) markers.push({ ...fromCoords, label: 'A', color: '#16A34A', clusterable: false });
  if (toCoords) markers.push({ ...toCoords, label: 'B', color: '#DC2626', clusterable: false });

  if (showTruckPois && truckPois.length) {
    const truckPoiIconUrl = darkMode ? '/brand/truck-poi-dark.svg' : '/brand/truck-poi-light.svg';
    for (const p of truckPois) {
      markers.push({
        lat: p.lat,
        lng: p.lng,
        label: p.title,
        iconUrl: truckPoiIconUrl,
        iconSize: [34, 34],
        iconCircular: false,
      });
    }
  }

  // Auto-recalculate when vehicle profile or departure time changes
  useEffect(() => {
    if (galleryScriptedDemo) return;
    if (hasCalculatedRef.current && from.trim() && to.trim()) {
      calculateRoute();
    }
  }, [vehicle, departureTime, galleryScriptedDemo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-recalculate when elevation ceiling changes (exactly once per distinct input state).
  // Debounced so typing doesn't spam requests.
  useEffect(() => {
    if (galleryScriptedDemo) return;
    if (!fromCoords || !toCoords) return;
    if (!from.trim() || !to.trim()) return;

    const key = `${fromCoords.lat.toFixed(6)},${fromCoords.lng.toFixed(6)}|${toCoords.lat.toFixed(6)},${toCoords.lng.toFixed(6)}|${maxElevationFt ?? 'none'}`;
    if (key === lastAutoRecalcKeyRef.current) return;

    // If a request is currently running, queue the latest key and run once after loading completes.
    pendingAutoRecalcKeyRef.current = key;
    if (loading) return;

    const t = window.setTimeout(() => {
      const pending = pendingAutoRecalcKeyRef.current;
      if (!pending) return;
      lastAutoRecalcKeyRef.current = pending;
      pendingAutoRecalcKeyRef.current = null;
      calculateRoute({ preferSelectedCoords: true });
    }, 650);

    return () => window.clearTimeout(t);
  }, [maxElevationFt, fromCoords, toCoords, loading, galleryScriptedDemo]); // eslint-disable-line react-hooks/exhaustive-deps

  // If a queued elevation change exists, run it once when loading finishes.
  useEffect(() => {
    if (galleryScriptedDemo) return;
    if (loading) return;
    const pending = pendingAutoRecalcKeyRef.current;
    if (!pending) return;
    if (pending === lastAutoRecalcKeyRef.current) {
      pendingAutoRecalcKeyRef.current = null;
      return;
    }
    lastAutoRecalcKeyRef.current = pending;
    pendingAutoRecalcKeyRef.current = null;
    calculateRoute({ preferSelectedCoords: true });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark that we've calculated when route is set
  useEffect(() => {
    if (route) {
      hasCalculatedRef.current = true;
    }
  }, [route]);

  // Truck POIs "layer": fetch truck-friendly POIs along the generated route and render as POI markers.
  useEffect(() => {
    if (!showTruckPois) {
      setTruckPois([]);
      setTruckPoisError(null);
      return;
    }
    if (!routePolyline || routePolyline.length < 2) {
      setTruckPois([]);
      setTruckPoisError(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setTruckPoisLoading(true);
      setTruckPoisError(null);
      try {
        // Sample a handful of points along the route to query POIs without spamming requests.
        const sampled = samplePointsForElevation(routePolyline, 5);
        const seen = new Set<string>();
        const out: Array<{ lat: number; lng: number; title: string }> = [];

        // Use a small set of focused queries to get better coverage without too many requests.
        const queries = ['truck stop', 'rest area'];
        // ~20km radius around each sample point.
        const r = 20000;
        let firstErr: string | null = null;

        const radiusMi = r / 1609.34;
        for (const pt of sampled) {
          for (const q of queries) {
            try {
              const results = await searchPlaces(pt.lat, pt.lng, `q:${q}`, radiusMi, 30);
              for (const item of results) {
                const coords = item.place?.geometry?.coordinates;
                const latVal = coords?.[1];
                const lngVal = coords?.[0];
                const title = String(item.name || '').trim();
                if (typeof latVal !== 'number' || typeof lngVal !== 'number' || !Number.isFinite(latVal) || !Number.isFinite(lngVal) || !title) continue;
                const key = stablePoiKey({ position: { lat: latVal, lng: lngVal }, title });
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ lat: latVal, lng: lngVal, title });
              }
            } catch (err) {
              if (!firstErr) firstErr = String(err);
            }
          }
        }

        if (!cancelled) setTruckPois(out.slice(0, 120));
        if (!cancelled) setTruckPoisError(firstErr);
      } catch (_) {
        if (!cancelled) setTruckPois([]);
        if (!cancelled) setTruckPoisError('Truck POI lookup failed.');
      } finally {
        if (!cancelled) setTruckPoisLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [showTruckPois, routePolyline]);

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
        <label className="text-[11px] font-medium mb-1 block" style={{ color: textMuted }}>
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={vehicleFieldsReady ? value : ''}
            min={constraint?.min}
            max={constraint?.max}
            step={step}
            readOnly={!vehicleFieldsReady}
            onChange={(e) => {
              if (!vehicleFieldsReady) return;
              const newValue = parseFloat(e.target.value);
              if (!isNaN(newValue)) {
                setVehicle(prev => ({ ...prev, [field]: newValue }));
              }
            }}
            className="w-20 px-2.5 py-1.5 rounded-lg text-sm font-medium tabular-nums"
            style={{
              background: 'var(--bg-input)',
              border: `1px solid ${border}`,
              color: textMain,
            }}
          />
          <span className="text-xs font-medium flex-shrink-0" style={{ color: textMuted }}>
            {unit}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`prism-widget w-full md:w-[1240px]${suppressCardElevation ? ' prism-widget--flat' : ''}`}
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className={revealSectionClass(true)}>
        <WidgetHeader
          title="Truck Routing"
          subtitle="Plan a truck-safe route with constraints and restrictions."
          variant="impressive"
          layout="inline"
          icon={<Truck className="w-4 h-4" />}
        />
      </div>
      {/* Wider + shorter (avoid page scroll; keep settings visible) */}
      <div className="flex flex-col md:flex-row md:h-[700px]">
        {/* Map - shown first on mobile */}
        <div
          className={`h-[300px] md:h-auto md:flex-1 md:order-2 ${revealSectionClass(showMapSection)}`}
        >
          {mapDisplayMode === 'skeleton' ? (
            <div
              className="h-full min-h-[300px] w-full animate-pulse"
              style={{
                background: darkMode
                  ? 'linear-gradient(180deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)'
                  : 'linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)',
              }}
              aria-hidden
            />
          ) : (
            <div
              className={`h-full min-h-[300px] w-full transition-opacity duration-700 ease-out ${
                mapFadedIn ? 'opacity-100' : 'opacity-0'
              }`}
            >
            <MapQuestMap
              apiKey={apiKey}
              center={mapCenter}
              zoom={mapZoom}
              darkMode={darkMode}
              accentColor={accentColor}
              height="100%"
              markers={markers}
              clusterMarkers={showTruckPois && truckPois.length > 0}
              clusterRadiusPx={56}
              showRoute={showRouteOnMap}
              routeStart={showRouteOnMap ? fromCoords || undefined : undefined}
              routeEnd={showRouteOnMap ? toCoords || undefined : undefined}
              routeType="fastest"
              routePolyline={showRouteOnMap ? routePolyline : undefined}
              mapType={resolvedMapType}
              lockBasemap={lockRoadBasemap ? 'road' : undefined}
              flyToView={
                mapFlyToKey > 0 && mapViewOverride
                  ? {
                      lat: mapViewOverride.lat,
                      lng: mapViewOverride.lng,
                      zoom: mapViewOverride.zoom,
                      durationMs: mapFlyToDurationMs,
                      key: mapFlyToKey,
                    }
                  : undefined
              }
              suppressRouteAutoFit={galleryScriptedDemo}
              onBoundsChange={handleTruckBoundsChange}
              onMapReady={onMapReady}
              tilesRaggedReveal={mapTilesRaggedReveal}
              animateRouteReveal={effectiveAnimateRouteReveal && showRouteOnMap}
              routeRevealDurationMs={routeRevealDurationMs}
              onRouteRevealComplete={handleRouteRevealComplete}
            />
            </div>
          )}
        </div>
        {/* Sidebar */}
        <div
          className={`w-full md:w-[500px] flex flex-col border-t md:border-t-0 md:border-r md:order-1 ${revealSectionClass(showSidebar)}`}
          style={{ borderColor: border }}
        >
          {/* Body: fixed controls + scrollable results + fixed CTA footer */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Controls (fixed) */}
            <div className="p-3 space-y-2 flex-shrink-0" style={{ borderBottom: route ? `1px solid ${border}` : undefined }}>
          {/* Vehicle Profile Section */}
              <div className="rounded-2xl overflow-hidden" style={{ background: bgWidget, border: `1px solid ${border}` }}>
                <div className="px-4 py-3">
                  <CollapsibleSection
                    title="Vehicle Profile"
                    summary={
                      vehicleFieldsReady
                        ? `${vehicle.height} ft H × ${vehicle.width} ft W × ${vehicle.length} ft L · ${vehicle.weight} tons · ${vehicle.axleCount} axles`
                        : 'Height, weight, dimensions…'
                    }
                    open={showVehicleSettings}
                    defaultOpen={true}
                    onOpenChange={setShowVehicleSettings}
                  >
                    <div className="pt-3 max-h-[280px] overflow-y-auto overflow-x-hidden prism-scrollbar">

                      {/* Vehicle Inputs (ordered for fast editing) */}
                      <div className="grid grid-cols-2 gap-2">
                        <VehicleInput label="Height" value={vehicle.height} unit="ft" field="height" step={0.5} />
                        <VehicleInput label="Weight" value={vehicle.weight} unit="tons" field="weight" step={1} />
                        <VehicleInput label="Width" value={vehicle.width} unit="ft" field="width" step={0.5} />
                        <VehicleInput label="Axles" value={vehicle.axleCount} unit="" field="axleCount" step={1} />
                        <VehicleInput label="Length" value={vehicle.length} unit="ft" field="length" step={1} />
                        {/* Elevation constraint – inline with Length */}
                        <div>
                          <label className="text-xs font-medium mb-1 block" style={{ color: textMuted }}>
                            Max elevation
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={maxElevationFt ?? ''}
                              min={0}
                              step={100}
                              placeholder="No limit"
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  setMaxElevationFt(null);
                                  return;
                                }
                                const next = Number(raw);
                                if (Number.isFinite(next) && next >= 0) setMaxElevationFt(next);
                              }}
                              className="w-full px-3 py-2 rounded-lg text-sm font-medium"
                              style={{
                                background: 'var(--bg-input)',
                                border: `1px solid ${border}`,
                                color: textMain,
                              }}
                            />
                            <span className="text-xs font-medium flex-shrink-0" style={{ color: textMuted, width: '30px' }}>
                              ft
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Truck POIs layer toggle */}
                      <div className="mt-2 flex items-center justify-between gap-3" style={{ paddingRight: 35 }}>
                        <div className="min-w-0">
                          <div className="text-xs font-medium" style={{ color: textMain }}>
                            Truck POIs
                          </div>
                          <div className="text-[11px] truncate" style={{ color: textMuted }}>
                            Rest areas and truck stops along the route
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {truckPoisLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" style={{ color: textMuted }} aria-hidden="true" />
                          ) : (
                            <span className="text-xs tabular-nums" style={{ color: textMuted }}>
                              {truckPois.length || 0}
                            </span>
                          )}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={showTruckPois}
                            onClick={() => setShowTruckPois((v) => !v)}
                            disabled={!routePolyline || routePolyline.length < 2}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${routePolyline && routePolyline.length >= 2 ? 'hover:opacity-80' : ''}`}
                            style={{
                              borderColor: border,
                              background: showTruckPois ? 'var(--brand-primary)' : 'var(--bg-input)',
                              opacity: routePolyline && routePolyline.length > 1 ? 1 : 0.55,
                            }}
                            aria-label="Toggle truck POIs layer"
                          >
                            <span
                              className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                              style={{
                                transform: showTruckPois ? 'translateX(22px)' : 'translateX(2px)',
                              }}
                            />
                          </button>
                        </div>
                      </div>

                      {showTruckPois && routePolyline && routePolyline.length > 1 && truckPoisError && truckPois.length === 0 ? (
                        <div className="mt-2 text-[11px]" style={{ color: textMuted }}>
                          Truck POIs unavailable. {truckPoisError}
                        </div>
                      ) : null}

                    </div>
                  </CollapsibleSection>
                </div>
          </div>

          {/* Address Inputs */}
              <div className="rounded-2xl p-3" style={{ background: bgWidget, border: `1px solid ${border}` }}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: textMuted }}>
                    Route
                  </div>
                  <div className="flex items-center gap-2">
                    {!hidePresetDemoButtons ? (
                    <button
                      type="button"
                      onClick={() => void runDurhamDemo()}
                      disabled={loading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!loading ? 'hover:brightness-110' : ''}`}
                      style={{
                        background: loading ? 'var(--bg-panel)' : `${accentColor}15`,
                        border: `1px solid ${loading ? border : `${accentColor}35`}`,
                        color: loading ? textMuted : accentColor,
                      }}
                      title="Bridge clearance demo (Durham, NC)"
                    >
                      Durham demo
                    </button>
                    ) : null}
                    {!hidePresetDemoButtons ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDemoMode(true);
                        setDemoScenario('donner');
                        setMaxElevationFt(DEMO_DONNER_MAX_ELEV_FT);
                        calculateRoute({ from: DEMO_DONNER_FROM, to: DEMO_DONNER_TO, applyInputs: true });
                      }}
                      disabled={loading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!loading ? 'hover:brightness-110' : ''}`}
                      style={{
                        background: loading ? 'var(--bg-panel)' : `${accentColor}15`,
                        border: `1px solid ${loading ? border : `${accentColor}35`}`,
                        color: loading ? textMuted : accentColor,
                      }}
                      title="Elevation-sensitive freight demo (Sacramento → Reno)"
                    >
                      Donner Pass demo
                    </button>
                    ) : null}
                  </div>
                </div>
            <div className="space-y-2">
              {/* From Input */}
              <div
                className="rounded-xl flex items-center gap-2.5"
                style={{
                  background: 'var(--bg-input)',
                  border: `1px solid ${border}`,
                  padding: '10px 12px',
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
                  style={{ background: accentColor, color: 'white' }}
                >
                  A
                </div>
                <AddressAutocomplete
                  value={displayedFrom}
                    onChange={(v) => {
                      if (galleryScriptedDemo) return;
                      if (demoMode) setDemoMode(false);
                      if (demoScenario) setDemoScenario(null);
                      setFrom(v);
                      setFromCoords(null);
                      setRoute(null);
                      setRoutePolyline(undefined);
                      setError(null);
                    }}
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
                    readOnly={demoMode || galleryScriptedDemo}
                />
              </div>

              {/* To Input */}
              <div
                className="rounded-xl flex items-center gap-2.5"
                style={{
                  background: 'var(--bg-input)',
                  border: `1px solid ${border}`,
                  padding: '10px 12px',
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
                  style={{ background: accentColor, color: 'white' }}
                >
                  B
                </div>
                <AddressAutocomplete
                  value={displayedTo}
                    onChange={(v) => {
                      if (galleryScriptedDemo) return;
                      if (demoMode) setDemoMode(false);
                      if (demoScenario) setDemoScenario(null);
                      setTo(v);
                      setToCoords(null);
                      setRoute(null);
                      setRoutePolyline(undefined);
                      setError(null);
                    }}
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
                    readOnly={demoMode || galleryScriptedDemo}
                />
              </div>
            </div>

            {/* Departure Time */}
              <div className="mt-2 relative">
              <button
                onClick={() => setShowDepartureOptions(!showDepartureOptions)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl transition-all hover:opacity-80"
                style={{
                  background: 'var(--bg-panel)',
                  border: `1px solid ${border}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-sm font-medium" style={{ color: textMain }}>
                    {formatDepartureTime(departureTime)}
                  </span>
                </div>
                <ChevronDown 
                  className={`w-4 h-4 transition-transform ${showDepartureOptions ? 'rotate-180' : ''}`} 
                  style={{ color: textMuted }} 
                />
              </button>

              {showDepartureOptions && (
                <div 
                    className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-40"
                  style={{
                    background: bgWidget,
                    border: `1px solid ${border}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  <button
                    onClick={() => { setDepartureTime('now'); setShowDepartureOptions(false); }}
                    className="w-full px-3 py-2.5 text-left text-sm transition-colors hover:opacity-80"
                    style={{ 
                      background: departureTime === 'now' ? `${accentColor}15` : 'transparent',
                      color: departureTime === 'now' ? accentColor : textMain,
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
                        className="w-full px-3 py-2.5 text-left text-sm transition-colors hover:opacity-80"
                        style={{ color: textMain }}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <div 
                    className="px-3 py-2.5"
                    style={{ borderTop: `1px solid ${border}` }}
                  >
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: textMuted }}>
                      Custom time
                    </label>
                    <input
                      type="datetime-local"
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-2 py-1.5 rounded-lg text-sm"
                      style={{
                        background: 'var(--bg-input)',
                        border: `1px solid ${border}`,
                        color: textMain,
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

            {/* Results (scroll) */}
              {route ? (
              <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar">
          {/* Route Summary */}
            <div 
              className="p-4 flex-shrink-0"
              style={{ borderBottom: `1px solid ${border}` }}
            >
                  {elevationNote && (
                    <div
                      className="mb-3 text-xs font-medium px-3 py-2 rounded-lg"
                      style={{
                        color: 'var(--color-warning)',
                        background: 'var(--color-warning-bg)',
                      }}
                    >
                      {elevationNote}
                    </div>
                  )}
              <div className="grid grid-cols-2 gap-2">
                <div 
                  className="p-3 rounded-lg text-center"
                  style={{ background: 'var(--bg-panel)' }}
                >
                  <p 
                    className="text-[10px] font-medium uppercase tracking-wide mb-0.5"
                    style={{ color: textMuted }}
                  >
                    Distance
                  </p>
                  <p 
                    className="text-lg font-bold"
                    style={{ color: textMain }}
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
                    style={{ color: textMuted }}
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
                {typeof routeMaxElevationFt === 'number' && Number.isFinite(routeMaxElevationFt) && (
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{
                      background: 'var(--bg-panel)',
                      color: textMuted,
                    }}
                    title="Maximum elevation along the selected route (from the route elevation profile)"
                  >
                    Max elev: {Math.round(routeMaxElevationFt).toLocaleString()} ft
                  </span>
                )}
                {typeof maxElevationFt === 'number' && Number.isFinite(maxElevationFt) && (
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{
                      background: `${accentColor}15`,
                      color: accentColor,
                    }}
                    title="Configured elevation ceiling"
                  >
                    Ceiling: {Math.round(maxElevationFt).toLocaleString()} ft
                  </span>
                )}
              </div>
            </div>
          {/* Turn-by-Turn */}
                {route.steps.length > 0 && (
                  <div className="flex flex-col">

              <div className="px-4 py-3">
                <CollapsibleSection
                  title="Turn-by-turn directions"
                  summary="Step-by-step instructions for the selected route."
                  open={stepsExpanded}
                  defaultOpen={false}
                  onOpenChange={setStepsExpanded}
                  rightHint={
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--bg-panel)', color: textMuted }}
                    >
                      {route.steps.length} steps
                    </span>
                  }
                >
                  <div className="mt-3 -mx-4" style={{ borderTop: `1px solid ${border}` }}>
                  {route.steps.map((step, index) => (
                    <div 
                      key={index} 
                      className="flex items-start gap-3 px-4 py-3"
                      style={{ borderBottom: `1px solid ${border}` }}
                    >
                      <div
                        className="prism-number-badge flex-shrink-0"
                        style={{ 
                          width: '24px', 
                          height: '24px', 
                          fontSize: '10px',
                          background: index === 0 ? accentColor : buttonMuted,
                        }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div 
                          className="text-sm"
                          style={{ color: textMain }}
                        >
                          {step.narrative}
                        </div>
                        <div 
                          className="text-xs mt-1 flex items-center gap-2"
                          style={{ color: textMuted }}
                        >
                          <span>{formatDistance(step.distance)}</span>
                          <span>·</span>
                          <span>{formatTime(step.time)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </CollapsibleSection>
              </div>
            </div>
          )}
        </div>
            ) : (
              <div className="flex-1 min-h-0" />
            )}

            {/* Fixed CTA footer */}
            <div
              className="p-4 flex-shrink-0"
              style={{
                borderTop: `1px solid ${border}`,
                background: 'var(--bg-panel)',
              }}
            >
              <button
                onClick={() => calculateRoute()}
                disabled={
                  !displayedFrom.trim() ||
                  !displayedTo.trim() ||
                  (loading && !galleryScriptedDemo)
                }
                aria-busy={loading || undefined}
                className={`prism-btn prism-btn-primary w-full ${!(loading || !from.trim() || !to.trim()) ? 'hover:brightness-110 transition-all' : ''}`}
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

      </div>

      {/* Footer / Branding */}
      {showBranding && showFooter && (
        <div className={`prism-footer ${revealSectionClass(true)}`}>
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
          <span aria-label="Powered by MapQuest">
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by
          </span>
          <MapQuestPoweredLogo darkMode={darkMode} />
        </div>
      )}
    </div>
  );
});

export default TruckRouting;
