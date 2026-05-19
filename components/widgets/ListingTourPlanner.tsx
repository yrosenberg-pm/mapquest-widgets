// components/widgets/ListingTourPlanner.tsx
'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  geocode,
  getDirections,
  optimizeRoute,
  reverseGeocode,
  searchPlaces,
} from '@/lib/mapquest';
import { accentShadesForDays, numberedPinIconDataUri } from '@/lib/mapMarkerIcons';
import AddressAutocomplete from '../AddressAutocomplete';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import WidgetHeader from './WidgetHeader';
import {
  Plus,
  Trash2,
  GripVertical,
  Loader2,
  RotateCcw,
  Route,
  Clock,
  Check,
  Share2,
  MoreHorizontal,
  Timer,
  TrendingDown,
  List,
  ArrowRight,
  Calendar,
  Pencil,
  Navigation,
  Shuffle,
  Download,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Utensils,
  GraduationCap,
  Trees,
  Bus,
  Coffee,
  ShoppingCart,
  Dumbbell,
  X,
  MapPin,
} from 'lucide-react';

// TODO: update annually
const IRS_MILEAGE_RATE_DEFAULT = 0.7;

export interface Stop {
  id: string;
  address: string;
  lat?: number;
  lng?: number;
  geocoded?: boolean;
  showingEnabled?: boolean;
  showingStart?: string;
  showingEnd?: string;
  showingDuration: number;
  eta?: Date;
  arrivalTime?: Date;
  departureAt?: Date;
  showingStatus?: 'on-time' | 'tight' | 'early-wait' | 'late' | 'no-window';
  buffer?: number;
  waitTime?: number;
  lateBy?: number;
}

export interface TourDay {
  id: string;
  /** User-defined name (e.g. "Tour w/ the Sterns"). Empty or generic "Day N" → show auto "Day N" from position. */
  label: string;
  date: string;
  departureTime: string;
  stops: Stop[];
}

interface LegInfo {
  from: string;
  to: string;
  distance: number;
  time: number;
  fuelUsed?: number;
  trafficCondition?: 'light' | 'moderate' | 'heavy';
}

interface RouteResult {
  totalDistance: number;
  totalTime: number;
  legs: LegInfo[];
  totalFuelUsed?: number;
}

type SidebarView = 'overview' | 'stops' | 'route';

interface ListingTourPlannerProps {
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

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Visible day title: custom label, or auto "Day N" (1-based) from slot. */
function displayDayTitle(day: TourDay, indexZeroBased: number): string {
  const raw = (day.label ?? '').trim();
  if (!raw || /^day\s*\d+$/i.test(raw)) return `Day ${indexZeroBased + 1}`;
  return raw;
}

function blankStop(): Stop {
  return {
    id: createId('stop'),
    address: '',
    showingDuration: 30,
  };
}

function padDatePart(n: number) {
  return n.toString().padStart(2, '0');
}

/** YYYY-MM-DD in local timezone */
function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${padDatePart(d.getMonth() + 1)}-${padDatePart(d.getDate())}`;
}

/**
 * Calendar Friday / Saturday / Sunday used for the weekend demo.
 * If today is Friday, starts this weekend; otherwise the upcoming Friday–Sunday block.
 */
function nextFridaySaturdaySundayISO(): { fri: string; sat: string; sun: string } {
  const now = new Date();
  const dow = now.getDay();
  const daysToFriday = (5 - dow + 7) % 7;
  const fri = new Date(now);
  fri.setDate(fri.getDate() + daysToFriday);
  const sat = new Date(fri);
  sat.setDate(sat.getDate() + 1);
  const sun = new Date(fri);
  sun.setDate(sun.getDate() + 2);
  return { fri: toIsoLocal(fri), sat: toIsoLocal(sat), sun: toIsoLocal(sun) };
}

/** Pre-geocoded demo listings (Los Angeles area) — works offline for map + routing. */
function demoGeocodedStop(address: string, lat: number, lng: number): Stop {
  return {
    id: createId('stop'),
    address,
    lat,
    lng,
    geocoded: true,
    showingDuration: 30,
  };
}

function defaultTourDays(): TourDay[] {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return [
    {
      id: createId('day'),
      label: '',
      date: `${y}-${m}-${day}`,
      departureTime: '09:00',
      stops: [blankStop(), blankStop()],
    },
  ];
}

/** 1-based index of a listing in sidebar order */
function listingSequenceNumber(allStops: Stop[], stop: Stop): number {
  const i = allStops.findIndex((s) => s.id === stop.id);
  return i >= 0 ? i + 1 : 0;
}

function geoKey(stop: Pick<Stop, 'lat' | 'lng'>): string | null {
  if (stop.lat == null || stop.lng == null) return null;
  return `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
}

/** Row shape returned by MapQuest POI helpers */
type PlaceHit = {
  name: string;
  displayString?: string;
  distance?: number;
  place?: {
    geometry?: { coordinates?: [number, number] };
    properties?: { street?: string };
  };
};

interface NeighborhoodBundles {
  coffee: PlaceHit[];
  grocery: PlaceHit[];
  restaurants: PlaceHit[];
  parks: PlaceHit[];
  elementarySchools: PlaceHit[];
  middleSchools: PlaceHit[];
  highSchools: PlaceHit[];
  transit: PlaceHit[];
  gyms: PlaceHit[];
  essentialsWithinHalfMile: number;
}

async function fetchNeighborhoodForPoint(lat: number, lng: number): Promise<NeighborhoodBundles> {
  const [
    coffee,
    grocery,
    restaurants,
    parks,
    elementarySchools,
    middleSchools,
    highSchools,
    transit,
    gyms,
  ] = await Promise.all([
    searchPlaces(lat, lng, 'q:coffee shop', 0.5, 3),
    searchPlaces(lat, lng, 'q:grocery', 1.0, 3),
    searchPlaces(lat, lng, 'q:restaurant', 0.5, 5),
    searchPlaces(lat, lng, 'q:park', 1.0, 3),
    searchPlaces(lat, lng, 'q:elementary school', 1.5, 3),
    searchPlaces(lat, lng, 'q:middle school', 1.5, 3),
    searchPlaces(lat, lng, 'q:high school', 1.5, 3),
    searchPlaces(lat, lng, 'multi:bus stop,subway station,train station', 0.5, 3),
    searchPlaces(lat, lng, 'q:gym', 1.0, 2),
  ]);

  const dedupeSig = (p: PlaceHit) => {
    const c = p.place?.geometry?.coordinates;
    return `${String(p.name).toLowerCase()}|${c?.[1] ?? ''}|${c?.[0] ?? ''}|${Number(p.distance)?.toFixed(3)}`;
  };

  function essentialsCount(): number {
    const pool = [...coffee, ...grocery, ...restaurants, ...transit];
    const seen = new Set<string>();
    let n = 0;
    for (const r of pool) {
      const d = r.distance ?? 999;
      if (d <= 0.5) {
        const sig = dedupeSig(r);
        if (!seen.has(sig)) {
          seen.add(sig);
          n++;
        }
      }
    }
    return n;
  }

  return {
    coffee,
    grocery,
    restaurants,
    parks,
    elementarySchools,
    middleSchools,
    highSchools,
    transit,
    gyms,
    essentialsWithinHalfMile: essentialsCount(),
  };
}

export default function ListingTourPlanner({
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  borderRadius,
  maxStops = 12,
}: ListingTourPlannerProps) {
  const [days, setDays] = useState<TourDay[]>(() => defaultTourDays());
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [routeByDayId, setRouteByDayId] = useState<Record<string, RouteResult | null>>({});
  const [originalRouteByDayId, setOriginalRouteByDayId] = useState<
    Record<string, { distance: number; time: number; fuel?: number } | null>
  >({});
  const [optimizedOnceByDayId, setOptimizedOnceByDayId] = useState<Record<string, boolean>>({});

  const routeByDayIdRef = useRef(routeByDayId);
  routeByDayIdRef.current = routeByDayId;

  /** Route inputs changed vs last successful calc — drives "Out of date" UI (Part 3). */
  const [staleByDayId, setStaleByDayId] = useState<Record<string, boolean>>({});
  /** Per-day shimmer on Overview during recalculate-all */
  const [recalcLoadingByDayId, setRecalcLoadingByDayId] = useState<Record<string, boolean>>({});
  /** Stops/Tour bottom primary button loading */
  const [panelRouteLoading, setPanelRouteLoading] = useState(false);
  const [overviewToast, setOverviewToast] = useState<string | null>(null);
  /** Inline error near Stops/Tour recalculate button */
  const [dayPanelError, setDayPanelError] = useState<string | null>(null);
  const departureOverviewPickerRef = useRef<HTMLDivElement | null>(null);

  const activeDay = days[activeDayIndex];
  const activeDayId = activeDay?.id ?? '';
  const stops = activeDay?.stops ?? [];
  const routeResult = routeByDayId[activeDayId] ?? null;
  const originalRoute = originalRouteByDayId[activeDayId] ?? null;

  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const daysRef = useRef(days);
  daysRef.current = days;

  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [selectedRouteType, setSelectedRouteType] = useState<'fastest' | 'shortest' | 'balanced'>(
    'fastest'
  );
  const [sidebarView, setSidebarView] = useState<SidebarView>('stops');
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);
  /** Tour-wide depart picker on Overview (multi-day) — top of panel */
  const [showDepartureOverviewPicker, setShowDepartureOverviewPicker] = useState(false);
  /** Batch recalc-all in flight (disables Overview CTA) */
  const [overviewRecalcAllBusy, setOverviewRecalcAllBusy] = useState(false);
  const [showingExpandedStopId, setShowingExpandedStopId] = useState<string | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  /** Overview: hovering a day highlights that day's pins on the map */
  const [overviewHoveredDayId, setOverviewHoveredDayId] = useState<string | null>(null);
  /** Overview inline remove-day confirm row index */
  const [overviewRemovePromptIdx, setOverviewRemovePromptIdx] = useState<number | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  /** Inline rename (Overview / day picker): day id + input draft */
  const [renamingDay, setRenamingDay] = useState<null | { id: string; draft: string }>(null);

  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const departurePickerRef = useRef<HTMLDivElement | null>(null);
  const dayBreadcrumbPopoverRef = useRef<HTMLDivElement | null>(null);
  const mapPanelRef = useRef<HTMLDivElement | null>(null);
  const mapPinPromptRef = useRef<HTMLDivElement | null>(null);
  const [mapPinPrompt, setMapPinPrompt] = useState<
    null | { x: number; y: number; lat: number; lng: number }
  >(null);

  /** Right-click marker: move stop to another day (confirm → pick day) */
  const moveStopPromptRef = useRef<HTMLDivElement | null>(null);
  const [moveStopFlow, setMoveStopFlow] = useState<
    null | { phase: 'confirm' | 'pickDay'; stopId: string; fromDayId: string; x: number; y: number }
  >(null);

  /** Neighborhood cache + lazy fetch */
  const neighborhoodCacheRef = useRef<Map<string, NeighborhoodBundles>>(new Map());
  const neighborhoodInflightRef = useRef<Map<string, Promise<NeighborhoodBundles>>>(new Map());
  const [neighborhoodBump, setNeighborhoodBump] = useState(0);

  /** Collapsed-by-default row expansion (keyed by stop id — reorder-stable). */
  const [expandedStopRowIds, setExpandedStopRowIds] = useState<Set<string>>(() => new Set());
  /** Right-side POI drawer over map (listing stop target). */
  const [nearbyDrawer, setNearbyDrawer] = useState<
    null | { stopId: string; address: string; lat: number; lng: number }
  >(null);
  const nearbyDrawerRef = useRef<HTMLDivElement | null>(null);

  const [mpgInput, setMpgInput] = useState('28');
  const [gasPriceInput, setGasPriceInput] = useState('3.50');
  const [irsRateInput, setIrsRateInput] = useState(String(IRS_MILEAGE_RATE_DEFAULT));

  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-500/60' : 'border-gray-200';
  const border = darkMode ? '#3E5060' : 'var(--border-subtle)';
  const textMain = darkMode ? '#F1F5F9' : 'var(--text-main)';
  const textMuted = darkMode ? '#A8B8CC' : 'var(--text-muted)';
  const buttonMuted = darkMode ? '#94A3B8' : 'var(--text-muted)';
  const bgWidget = darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)';
  const chipNeutralFill = darkMode ? 'bg-white/5' : 'bg-gray-100';

  const mpg = Number(mpgInput) || 28;
  const gasPricePerGal = Number(gasPriceInput) || 3.5;
  const irsRate = Number(irsRateInput) || IRS_MILEAGE_RATE_DEFAULT;

  const departureCombined = useMemo(() => {
    if (!activeDay) return new Date();
    const d = new Date(`${activeDay.date}T${activeDay.departureTime || '09:00'}:00`);
    return isNaN(d.getTime()) ? new Date() : d;
  }, [activeDay?.date, activeDay?.departureTime, activeDayId]);

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const departureDateValue = activeDay?.date ?? `${new Date().getFullYear()}-01-01`;
  const departureTimeValue =
    activeDay?.departureTime ?? `${pad2(departureCombined.getHours())}:${pad2(departureCombined.getMinutes())}`;

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false);
      }
      if (showDeparturePicker && !departurePickerRef.current?.contains(target)) {
        setShowDeparturePicker(false);
      }
      if (
        showDepartureOverviewPicker &&
        !departureOverviewPickerRef.current?.contains(target)
      ) {
        setShowDepartureOverviewPicker(false);
      }
      if (dayPickerOpen && dayBreadcrumbPopoverRef.current && !dayBreadcrumbPopoverRef.current.contains(target)) {
        setDayPickerOpen(false);
      }
      if (overviewRemovePromptIdx !== null) {
        const el = (target as HTMLElement).closest?.('[data-overview-remove-panel="1"]');
        const hitTrash = (target as HTMLElement).closest?.('[data-overview-trash="1"]');
        if (!el && !hitTrash) setOverviewRemovePromptIdx(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [
    showMoreMenu,
    showDeparturePicker,
    showDepartureOverviewPicker,
    dayPickerOpen,
    overviewRemovePromptIdx,
  ]);

  useEffect(() => {
    if (!overviewToast) return;
    const t = setTimeout(() => setOverviewToast(null), 4000);
    return () => clearTimeout(t);
  }, [overviewToast]);

  useEffect(() => {
    if (sidebarView !== 'overview') setOverviewHoveredDayId(null);
  }, [sidebarView]);

  useEffect(() => {
    if (!mapPinPrompt) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (mapPinPromptRef.current?.contains(target)) return;
      setMapPinPrompt(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [mapPinPrompt]);

  useEffect(() => {
    if (!moveStopFlow) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moveStopPromptRef.current?.contains(target)) return;
      setMoveStopFlow(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoveStopFlow(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moveStopFlow]);

  useEffect(() => {
    if (!nearbyDrawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNearbyDrawer(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nearbyDrawer]);

  const markAllRoutedDaysStale = useCallback(() => {
    setStaleByDayId((prev) => {
      const next = { ...prev };
      for (const d of daysRef.current) {
        if (routeByDayIdRef.current[d.id] != null) next[d.id] = true;
      }
      return next;
    });
  }, []);

  const markDayRouteStale = useCallback((dayId: string) => {
    if (routeByDayIdRef.current[dayId] == null) return;
    setStaleByDayId((prev) => ({ ...prev, [dayId]: true }));
  }, []);

  const setTourDepartureParts = useCallback(
    (dateStr: string, timeStr: string, dayId: string, syncTimeToAllDays: boolean) => {
      if (!dateStr || !timeStr) return;
      setDays((prev) => {
        if (syncTimeToAllDays) {
          return prev.map((d) =>
            d.id === dayId ? { ...d, date: dateStr, departureTime: timeStr } : { ...d, departureTime: timeStr }
          );
        }
        return prev.map((d) => (d.id === dayId ? { ...d, date: dateStr, departureTime: timeStr } : d));
      });
      markAllRoutedDaysStale();
    },
    [markAllRoutedDaysStale]
  );

  const patchDay = useCallback((dayId: string, patch: Partial<TourDay> | ((d: TourDay) => TourDay)) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        return typeof patch === 'function' ? patch(d) : { ...d, ...patch };
      })
    );
  }, []);

  const escapeDayRenameRef = useRef(false);

  const commitDayName = useCallback(
    (dayId: string, indexZeroBased: number, draft: string) => {
      const trimmed = draft.trim();
      const auto = `Day ${indexZeroBased + 1}`;
      patchDay(dayId, { label: trimmed === '' || trimmed === auto ? '' : trimmed });
      setRenamingDay(null);
    },
    [patchDay]
  );

  useEffect(() => {
    if (renamingDay && !days.some((d) => d.id === renamingDay.id)) {
      setRenamingDay(null);
    }
  }, [days, renamingDay]);

  const ensureNeighborhoodCached = useCallback(
    async (lat: number, lng: number) => {
      const k = geoKey({ lat, lng });
      if (!k) return null;
      if (neighborhoodCacheRef.current.has(k)) return neighborhoodCacheRef.current.get(k)!;
      let p = neighborhoodInflightRef.current.get(k);
      if (!p) {
        p = fetchNeighborhoodForPoint(lat, lng).then((b) => {
          neighborhoodCacheRef.current.set(k, b);
          neighborhoodInflightRef.current.delete(k);
          setNeighborhoodBump((x) => x + 1);
          return b;
        });
        neighborhoodInflightRef.current.set(k, p);
      }
      return await p;
    },
    []
  );

  const toggleStopRowExpanded = useCallback(
    (stopId: string, lat?: number, lng?: number) => {
      setExpandedStopRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(stopId)) {
          next.delete(stopId);
          return next;
        }
        next.add(stopId);
        if (lat != null && lng != null) {
          void ensureNeighborhoodCached(lat, lng);
        }
        return next;
      });
    },
    [ensureNeighborhoodCached]
  );

  useEffect(() => {
    if (!nearbyDrawer) return;
    void ensureNeighborhoodCached(nearbyDrawer.lat, nearbyDrawer.lng);
  }, [nearbyDrawer, ensureNeighborhoodCached]);

  useEffect(() => {
    if (!routeResult && sidebarView === 'route') {
      setSidebarView('stops');
    }
  }, [routeResult, sidebarView]);

  useEffect(() => {
    if (days.length < 2 && sidebarView === 'overview') setSidebarView('stops');
  }, [days.length, sidebarView]);

  useEffect(() => {
    if (sidebarView !== 'stops') setDayPickerOpen(false);
  }, [sidebarView]);

  const canPlaceStopFromMap = useCallback(
    (list: Stop[]) => list.some((s) => s.lat == null || s.lng == null) || list.length < maxStops,
    [maxStops]
  );

  const addStopAtLatLng = useCallback(
    async (lat: number, lng: number) => {
      if (!canPlaceStopFromMap(stopsRef.current)) {
        setError('Maximum properties reached.');
        return;
      }
      let useLat = lat;
      let useLng = lng;
      let address = '';
      try {
        const loc = await reverseGeocode(lat, lng);
        if (loc) {
          useLat = loc.lat ?? lat;
          useLng = loc.lng ?? lng;
          const street = String((loc as { street?: string }).street || '').trim();
          const city = String((loc as { adminArea5?: string }).adminArea5 || '').trim();
          const state = String((loc as { adminArea3?: string }).adminArea3 || '').trim();
          const line2 = [city, state].filter(Boolean).join(', ');
          address = [street, line2].filter(Boolean).join(', ').trim();
        }
      } catch {
        /* keep coordinates fallback */
      }
      if (!address) address = `${useLat.toFixed(5)}, ${useLng.toFixed(5)}`;
      patchDay(activeDayId, (day) => {
        const prev = day.stops;
        if (!canPlaceStopFromMap(prev)) return day;
        const emptyIdx = prev.findIndex((s) => s.lat == null || s.lng == null);
        if (emptyIdx !== -1) {
          const next = prev.map((s, i) =>
            i === emptyIdx ? { ...s, address, lat: useLat, lng: useLng, geocoded: true } : s
          );
          return { ...day, stops: next };
        }
        if (prev.length >= maxStops) return day;
        const id = createId('stop');
        return {
          ...day,
          stops: [...prev, { id, address, lat: useLat, lng: useLng, geocoded: true, showingDuration: 30 }],
        };
      });
      markDayRouteStale(activeDayId);
      setError(null);
    },
    [activeDayId, canPlaceStopFromMap, markDayRouteStale, patchDay, maxStops]
  );

  const handleMapRightClick = useCallback(
    (lat: number, lng: number, meta?: { clientX: number; clientY: number }) => {
      if (!canPlaceStopFromMap(daysRef.current[activeDayIndex]?.stops ?? [])) {
        setError('Maximum properties reached.');
        return;
      }
      setError(null);
      const rect = mapPanelRef.current?.getBoundingClientRect();
      const x = rect ? (meta?.clientX ?? 0) - rect.left : 16;
      const y = rect ? (meta?.clientY ?? 0) - rect.top : 16;
      setMapPinPrompt({ x, y, lat, lng });
    },
    [activeDayIndex, canPlaceStopFromMap]
  );

  const openMoveStopFromMarker = useCallback(
    (stopId: string, fromDayId: string, meta?: { clientX: number; clientY: number }) => {
      setNearbyDrawer(null);
      setMapPinPrompt(null);
      if (daysRef.current.length < 2) {
        setError('Add another tour day before moving a stop to a different day.');
        return;
      }
      setError(null);
      const rect = mapPanelRef.current?.getBoundingClientRect();
      const x = rect ? (meta?.clientX ?? 0) - rect.left : 16;
      const y = rect ? (meta?.clientY ?? 0) - rect.top : 16;
      setMoveStopFlow({ phase: 'confirm', stopId, fromDayId, x, y });
    },
    []
  );

  const applyMoveStopToDay = useCallback(
    (stopId: string, fromDayId: string, toDayId: string) => {
      if (fromDayId === toDayId) {
        setMoveStopFlow(null);
        return;
      }
      const toDay = daysRef.current.find((d) => d.id === toDayId);
      if (!toDay || toDay.stops.length >= maxStops) {
        setError(`That day already has the maximum of ${maxStops} properties.`);
        return;
      }
      const fromDay = daysRef.current.find((d) => d.id === fromDayId);
      const stop = fromDay?.stops.find((s) => s.id === stopId);
      if (!fromDay || !stop) return;

      const targetIdx = daysRef.current.findIndex((d) => d.id === toDayId);

      setDays((prev) =>
        prev.map((d) => {
          if (d.id === fromDayId) return { ...d, stops: d.stops.filter((s) => s.id !== stopId) };
          if (d.id === toDayId) return { ...d, stops: [...d.stops, stop] };
          return d;
        })
      );
      markDayRouteStale(fromDayId);
      markDayRouteStale(toDayId);
      setMoveStopFlow(null);
      setError(null);
      if (targetIdx >= 0) {
        setActiveDayIndex(targetIdx);
        setSidebarView('stops');
      }
    },
    [maxStops, markDayRouteStale]
  );

  const addListing = () => {
    patchDay(activeDayId, (d) =>
      d.stops.length >= maxStops
        ? d
        : { ...d, stops: [...d.stops, blankStop()] }
    );
    markDayRouteStale(activeDayId);
  };

  const removeStop = (id: string) => {
    patchDay(activeDayId, (d) => ({
      ...d,
      stops: d.stops.filter((s) => s.id !== id),
    }));
    markDayRouteStale(activeDayId);
  };

  const clearActiveDayTour = () => {
    patchDay(activeDayId, () => ({
      ...activeDay!,
      stops: [blankStop(), blankStop()],
    }));
    setRouteByDayId((r) => ({ ...r, [activeDayId]: null }));
    setOriginalRouteByDayId((prev) => ({ ...prev, [activeDayId]: null }));
    setOptimizedOnceByDayId((prev) => ({ ...prev, [activeDayId]: false }));
    setSidebarView('stops');
    setMapPinPrompt(null);
    setError(null);
  };

  const clearAllDays = () => {
    const next = defaultTourDays();
    setDays(next);
    setActiveDayIndex(0);
    setRouteByDayId({});
    setOriginalRouteByDayId({});
    setOptimizedOnceByDayId({});
    setSidebarView('stops');
    setMapPinPrompt(null);
    setError(null);
    setShowMoreMenu(false);
    setStaleByDayId({});
  };

  const addDemoTourStops = useCallback(() => {
    const { fri, sat, sun } = nextFridaySaturdaySundayISO();
    setDays([
      {
        id: createId('day'),
        label: '',
        date: fri,
        departureTime: '09:00',
        stops: [
          demoGeocodedStop('2800 E Observatory Rd, Los Angeles, CA 90027', 34.1184, -118.3004),
          demoGeocodedStop('6333 W 3rd St, Los Angeles, CA 90036', 34.0716, -118.3577),
          demoGeocodedStop('6925 Hollywood Blvd, Hollywood, CA 90028', 34.102, -118.3407),
          demoGeocodedStop('751 Echo Park Ave, Los Angeles, CA 90026', 34.0787, -118.2606),
          demoGeocodedStop('111 S Grand Ave, Los Angeles, CA 90012', 34.0553, -118.2499),
        ],
      },
      {
        id: createId('day'),
        label: '',
        date: sat,
        departureTime: '09:00',
        stops: [
          demoGeocodedStop('200 Santa Monica Pier, Santa Monica, CA 90401', 34.0089, -118.4973),
          demoGeocodedStop('1800 Ocean Front Walk, Venice, CA 90291', 33.985, -118.4695),
          demoGeocodedStop('2 Manhattan Beach Blvd, Manhattan Beach, CA 90266', 33.8847, -118.4109),
        ],
      },
      {
        id: createId('day'),
        label: '',
        date: sun,
        departureTime: '09:00',
        stops: [
          demoGeocodedStop('1200 Getty Center Dr, Los Angeles, CA 90049', 34.078, -118.4741),
          demoGeocodedStop('1501 Will Rogers State Park Rd, Pacific Palisades, CA 90272', 34.0565, -118.5081),
          demoGeocodedStop('15255 Palisades Village Ln, Pacific Palisades, CA 90272', 34.0475, -118.5264),
          demoGeocodedStop('9641 Sunset Blvd, Beverly Hills, CA 90210', 34.0679, -118.4008),
        ],
      },
    ]);
    setActiveDayIndex(0);
    setRouteByDayId({});
    setOriginalRouteByDayId({});
    setOptimizedOnceByDayId({});
    setSidebarView('overview');
    setExpandedStopRowIds(new Set());
    setOverviewRemovePromptIdx(null);
    setDayPickerOpen(false);
    setNearbyDrawer(null);
    setShowingExpandedStopId(null);
    setMapPinPrompt(null);
    setHoveredStopId(null);
    setError(null);
    setShowMoreMenu(false);
    setStaleByDayId({});
  }, []);

  const parseTimeToMinutes = (t: string): number | null => {
    const parts = t.split(':').map(Number);
    if (parts.length < 2) return null;
    const [h, m] = parts;
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };

  const addMinutes = (d: Date, mins: number) => new Date(d.getTime() + mins * 60 * 1000);

  const timeOnTourDate = useCallback((minsFromMidnight: number, tourDateIso: string): Date => {
    const base = new Date(`${tourDateIso}T00:00:00`);
    if (isNaN(base.getTime())) return addMinutes(departureCombined, minsFromMidnight);
    base.setHours(0, 0, 0, 0);
    return addMinutes(base, minsFromMidnight);
  }, [departureCombined]);

  const calculateETAsForDay = useCallback(
    (
      stopsToCalc: Stop[],
      result: RouteResult,
      dayIdForPatch: string,
      tourStart: Date,
      tourDateIso: string
    ) => {
      const geocoded = stopsToCalc.filter((s) => s.lat !== undefined && s.lng !== undefined);
      if (geocoded.length < 1) {
        patchDay(dayIdForPatch, (d) =>
          d.id !== dayIdForPatch
            ? d
            : {
                ...d,
                stops: stopsToCalc.map((s) => ({
                  ...s,
                  eta: undefined,
                  arrivalTime: undefined,
                  departureAt: undefined,
                  showingStatus: undefined,
                  buffer: undefined,
                  waitTime: undefined,
                  lateBy: undefined,
                })),
              }
        );
        return;
      }

      let current = new Date(tourStart);
      const computedById = new Map<string, Partial<Stop>>();
      let legIdx = 0;

      for (let i = 0; i < geocoded.length; i++) {
        const stop = geocoded[i];
        if (i > 0 && result.legs[legIdx]) {
          current = addMinutes(current, result.legs[legIdx].time);
          legIdx += 1;
        }

        const arrivalTime = new Date(current);

        let showingStatus: Stop['showingStatus'] = stop.showingEnabled ? 'on-time' : 'no-window';
        let waitTime = 0;
        let lateBy = 0;
        let buffer: number | undefined = undefined;

        let serviceStart = new Date(arrivalTime);

        if (stop.showingEnabled && stop.showingStart && stop.showingEnd) {
          const startMin = parseTimeToMinutes(stop.showingStart);
          const endMin = parseTimeToMinutes(stop.showingEnd);
          if (startMin !== null && endMin !== null) {
            const windowStart = timeOnTourDate(startMin, tourDateIso);
            const windowEnd = timeOnTourDate(endMin, tourDateIso);

            if (arrivalTime < windowStart) {
              waitTime = Math.round((windowStart.getTime() - arrivalTime.getTime()) / 60000);
              serviceStart = windowStart;
              showingStatus = 'early-wait';
            } else {
              serviceStart = arrivalTime;
            }

            if (serviceStart > windowEnd) {
              lateBy = Math.round((serviceStart.getTime() - windowEnd.getTime()) / 60000);
              showingStatus = 'late';
            } else {
              buffer = Math.round((windowEnd.getTime() - serviceStart.getTime()) / 60000);
              if (showingStatus !== 'early-wait') {
                showingStatus = buffer <= 10 ? 'tight' : 'on-time';
              }
            }
          }
        }

        const eta = new Date(serviceStart);
        const departureAt = addMinutes(serviceStart, stop.showingDuration ?? 0);
        current = new Date(departureAt);

        computedById.set(stop.id, {
          arrivalTime,
          eta,
          departureAt,
          showingStatus,
          buffer,
          waitTime: waitTime || undefined,
          lateBy: lateBy || undefined,
        });
      }

      const merged = stopsToCalc.map((s) => {
        const computed = computedById.get(s.id);
        if (!computed) {
          return {
            ...s,
            eta: undefined,
            arrivalTime: undefined,
            departureAt: undefined,
            showingStatus: undefined,
            buffer: undefined,
            waitTime: undefined,
            lateBy: undefined,
          };
        }
        return { ...s, ...computed };
      });

      patchDay(dayIdForPatch, (d) => (d.id === dayIdForPatch ? { ...d, stops: merged } : d));
    },
    [patchDay, timeOnTourDate]
  );

  const updateStopAddr = useCallback(
    (id: string, address: string, lat?: number, lng?: number) => {
      patchDay(activeDayId, (d) => ({
        ...d,
        stops: d.stops.map((s) =>
          s.id === id
            ? {
                ...s,
                address,
                geocoded: lat !== undefined && lng !== undefined,
                lat,
                lng,
              }
            : s
        ),
      }));
      markDayRouteStale(activeDayId);
    },
    [activeDayId, markDayRouteStale, patchDay]
  );

  const updateStopDetail = useCallback(
    (id: string, updates: Partial<Stop>) => {
      const nextFull = stops.map((s) => (s.id === id ? { ...s, ...updates } : s));
      patchDay(activeDayId, (d) => ({
        ...d,
        stops: d.stops.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      }));
      if (routeResult && activeDay) {
        calculateETAsForDay(
          nextFull,
          routeResult,
          activeDayId,
          departureCombined,
          activeDay.date
        );
      }
    },
    [activeDay, activeDayId, calculateETAsForDay, departureCombined, patchDay, routeResult, stops]
  );

  const maybeGeocodeOnBlurForStopId = async (stopId: string) => {
    const s = stops.find((x) => x.id === stopId);
    if (!s || !s.address.trim() || (s.lat && s.lng)) return;
    try {
      const r = await geocode(s.address.trim());
      if (r?.lat != null && r?.lng != null) {
        updateStopAddr(stopId, s.address.trim(), r.lat, r.lng);
      }
    } catch {
      /* noop */
    }
  };

  const geocodeStops = async (stopsToGeocode: Stop[]): Promise<Stop[]> => {
    return Promise.all(
      stopsToGeocode.map(async (stop) => {
        if (stop.geocoded && stop.lat && stop.lng) return stop;
        if (!stop.address.trim()) return stop;
        try {
          const result = await geocode(stop.address);
          if (result?.lat && result?.lng) {
            return { ...stop, lat: result.lat, lng: result.lng, geocoded: true };
          }
        } catch {
          /* noop */
        }
        return stop;
      })
    );
  };

  const calculateRouteForStops = async (
    stopsToCalc: Stop[],
    dayIdOverride?: string,
    loadMode: 'panel' | 'none' = 'panel'
  ) => {
    const dayId = dayIdOverride ?? activeDayId;
    const dayMeta = daysRef.current.find((d) => d.id === dayId);
    if (!dayMeta) return;
    if (loadMode === 'panel') {
      setPanelRouteLoading(true);
      setDayPanelError(null);
    }
    try {
      const mergedList = await geocodeStops(stopsToCalc);
      patchDay(dayId, (d) =>
        d.id !== dayId
          ? d
          : { ...d, stops: d.stops.map((s) => mergedList.find((g) => g.id === s.id) ?? s) }
      );

      const afterStops = stopsToCalc.map((s) => mergedList.find((g) => g.id === s.id) ?? s);

      const validStops = afterStops.filter((s) => s.lat != null && s.lng != null);
      if (validStops.length < 2) {
        throw new Error('Need at least 2 geocoded properties on this day.');
      }

      const dt = new Date(`${dayMeta.date}T${dayMeta.departureTime || '09:00'}:00`);
      const tourStart = isNaN(dt.getTime()) ? new Date(`${dayMeta.date}T09:00:00`) : dt;

      const routeTypeEffective = selectedRouteType === 'balanced' ? 'fastest' : selectedRouteType;

      let totalDistance = 0;
      let totalTime = 0;
      let totalFuel = 0;
      let anyFuel = false;
      const legs: LegInfo[] = [];

      for (let i = 0; i < validStops.length - 1; i++) {
        const from = `${validStops[i].lat},${validStops[i].lng}`;
        const to = `${validStops[i + 1].lat},${validStops[i + 1].lng}`;
        const dirs = await getDirections(from, to, routeTypeEffective, tourStart);
        if (dirs) {
          totalDistance += dirs.distance;
          totalTime += dirs.time;
          if (dirs.fuelUsed != null && Number.isFinite(dirs.fuelUsed)) {
            totalFuel += dirs.fuelUsed;
            anyFuel = true;
          }
          const expectedTime = dirs.distance * 2;
          let trafficCondition: 'light' | 'moderate' | 'heavy' = 'light';
          if (dirs.time > expectedTime * 1.3) trafficCondition = 'heavy';
          else if (dirs.time > expectedTime * 1.1) trafficCondition = 'moderate';

          legs.push({
            from: validStops[i].address,
            to: validStops[i + 1].address,
            distance: dirs.distance,
            time: dirs.time,
            trafficCondition,
            fuelUsed: dirs.fuelUsed,
          });
        }
      }

      const result: RouteResult = {
        totalDistance,
        totalTime,
        legs,
        totalFuelUsed: anyFuel ? totalFuel : undefined,
      };

      setRouteByDayId((prev) => ({ ...prev, [dayId]: result }));
      setOriginalRouteByDayId((prev) =>
        prev[dayId]
          ? prev
          : {
              ...prev,
              [dayId]: { distance: totalDistance, time: totalTime, fuel: anyFuel ? totalFuel : undefined },
            }
      );

      setStaleByDayId((prev) => ({ ...prev, [dayId]: false }));
      calculateETAsForDay(afterStops, result, dayId, tourStart, dayMeta.date);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to build tour route';
      if (loadMode === 'panel') setDayPanelError(msg);
      else throw err instanceof Error ? err : new Error(msg);
    } finally {
      if (loadMode === 'panel') setPanelRouteLoading(false);
    }
  };

  const runCalculateActiveDay = () => {
    if (!activeDay) return;
    void calculateRouteForStops(activeDay.stops, activeDayId, 'panel');
  };

  const recalculateAllDays = async () => {
    const list = daysRef.current;
    const hadAnyCalculatedTour = Object.values(routeByDayIdRef.current).some((r) => r != null);
    const ineligibleCount = list.filter(
      (d) => d.stops.filter((s) => s.lat != null && s.lng != null).length < 2
    ).length;
    let calculated = 0;
    setOverviewRecalcAllBusy(true);
    try {
      for (const day of list) {
        const geo = day.stops.filter((s) => s.lat != null && s.lng != null);
        if (geo.length < 2) continue;
        setRecalcLoadingByDayId((prev) => ({ ...prev, [day.id]: true }));
        try {
          await calculateRouteForStops(day.stops, day.id, 'none');
          calculated++;
        } catch {
          /* skip failed day */
        } finally {
          setRecalcLoadingByDayId((prev) => ({ ...prev, [day.id]: false }));
        }
      }
      const verb = hadAnyCalculatedTour ? 'Recalculated' : 'Calculated';
      if (ineligibleCount > 0) {
        setOverviewToast(
          `${verb} ${calculated} days · ${ineligibleCount} skipped (empty or single stop)`
        );
      } else {
        setOverviewToast(`${verb} ${calculated} days`);
      }
    } finally {
      setOverviewRecalcAllBusy(false);
    }
  };

  function normalizeOptimizedSequence(seq: number[], n: number): number[] {
    const nums = (Array.isArray(seq) ? seq : [])
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x));
    if (!nums.length || !Number.isFinite(n) || n <= 0) return [];
    if (nums.length < n) return [];
    const slice = nums.slice(0, n);
    if (slice.every((x) => x >= 1 && x <= n)) return slice.map((x) => x - 1);
    if (slice.every((x) => x >= 0 && x < n)) return slice.slice();
    return [];
  }

  const handleOptimizeTourOrder = async () => {
    const geoOnly = stops.filter((s) => s.lat != null && s.lng != null);
    if (geoOnly.length < 3 || !routeResult) return;
    setShowMoreMenu(false);

    const dayMetaOpt = activeDay;
    const tourDtOpt = dayMetaOpt
      ? new Date(`${dayMetaOpt.date}T${dayMetaOpt.departureTime || '09:00'}:00`)
      : departureCombined;
    const tourStartForOptimize = isNaN(tourDtOpt.getTime()) ? departureCombined : tourDtOpt;

    setOptimizing(true);
    setError(null);
    try {
      if (
        routeResult &&
        !originalRouteByDayId[activeDayId] &&
        optimizedOnceByDayId[activeDayId] !== true
      ) {
        setOriginalRouteByDayId((prev) => ({
          ...prev,
          [activeDayId]: {
            distance: routeResult.totalDistance,
            time: routeResult.totalTime,
            fuel: routeResult.totalFuelUsed,
          },
        }));
      } else if (!originalRouteByDayId[activeDayId] && geoOnly.length >= 2) {
        let originalDistance = 0;
        let originalTime = 0;
        let originalFuel = 0;
        let anyFuel = false;
        for (let i = 0; i < geoOnly.length - 1; i++) {
          const from = `${geoOnly[i].lat},${geoOnly[i].lng}`;
          const to = `${geoOnly[i + 1].lat},${geoOnly[i + 1].lng}`;
          const d = await getDirections(
            from,
            to,
            selectedRouteType === 'shortest' ? 'shortest' : 'fastest',
            tourStartForOptimize
          );
          if (d) {
            originalDistance += d.distance;
            originalTime += d.time;
            if (d.fuelUsed != null) {
              originalFuel += d.fuelUsed;
              anyFuel = true;
            }
          }
        }
        setOriginalRouteByDayId((prev) => ({
          ...prev,
          [activeDayId]: {
            distance: originalDistance,
            time: originalTime,
            fuel: anyFuel ? originalFuel : undefined,
          },
        }));
      }

      const locs = geoOnly.map((s) => ({ lat: s.lat!, lng: s.lng! }));
      const opt = await optimizeRoute(locs);
      if (!opt?.locationSequence?.length) throw new Error('Optimize failed — MapQuest returned no sequence.');

      const seq = normalizeOptimizedSequence(opt.locationSequence, geoOnly.length);
      if (seq.length !== geoOnly.length) {
        console.warn('[ListingTourPlanner] Unexpected locationSequence; falling back as-is', opt.locationSequence);
      }
      const order = seq.length === geoOnly.length ? seq.map((idx) => geoOnly[idx]).filter(Boolean) : geoOnly;

      const reorderedGeo: Stop[] = order.map((s, i) => ({
        ...s,
        id: `opt-${Date.now()}-${i}`,
        geocoded: true,
      }));

      patchDay(activeDayId, (day) => {
        /* Drop non-geocoded rows during optimize (parity with Multi-Stop Planner) */
        return { ...day, stops: reorderedGeo };
      });

      setRouteByDayId((r) => ({ ...r, [activeDayId]: null }));

      await new Promise((resolve) => setTimeout(resolve, 50));

      const routeTypeEffective = selectedRouteType === 'balanced' ? 'fastest' : selectedRouteType;
      let totalDistance = 0;
      let totalTime = 0;
      let totalFuel = 0;
      let anyFuel = false;
      const legs: LegInfo[] = [];
      const finalStopsState = stopsRef.current.filter((x) => x.lat && x.lng);

      for (let i = 0; i < finalStopsState.length - 1; i++) {
        const from = `${finalStopsState[i].lat},${finalStopsState[i].lng}`;
        const to = `${finalStopsState[i + 1].lat},${finalStopsState[i + 1].lng}`;
        const dirs = await getDirections(from, to, routeTypeEffective, tourStartForOptimize);
        if (dirs) {
          totalDistance += dirs.distance;
          totalTime += dirs.time;
          if (dirs.fuelUsed != null) {
            totalFuel += dirs.fuelUsed;
            anyFuel = true;
          }
          const expectedTime = dirs.distance * 2;
          let trafficCondition: 'light' | 'moderate' | 'heavy' = 'light';
          if (dirs.time > expectedTime * 1.3) trafficCondition = 'heavy';
          else if (dirs.time > expectedTime * 1.1) trafficCondition = 'moderate';

          legs.push({
            from: finalStopsState[i].address,
            to: finalStopsState[i + 1].address,
            distance: dirs.distance,
            time: dirs.time,
            trafficCondition,
            fuelUsed: dirs.fuelUsed,
          });
        }
      }

      const resultNew: RouteResult = {
        totalDistance,
        totalTime,
        legs,
        totalFuelUsed: anyFuel ? totalFuel : undefined,
      };

      setRouteByDayId((prev) => ({ ...prev, [activeDayId]: resultNew }));
      if (dayMetaOpt) {
        calculateETAsForDay(
          finalStopsState,
          resultNew,
          activeDayId,
          tourStartForOptimize,
          dayMetaOpt.date
        );
      }

      setOptimizedOnceByDayId((prev) => ({ ...prev, [activeDayId]: true }));
      setStaleByDayId((prev) => ({ ...prev, [activeDayId]: false }));
      setSidebarView('route');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to optimize tour order');
    } finally {
      setOptimizing(false);
    }
  };

  const resetTourRouteMetrics = () => {
    setRouteByDayId((r) => ({ ...r, [activeDayId]: null }));
    setOriginalRouteByDayId((prev) => ({ ...prev, [activeDayId]: null }));
    setOptimizedOnceByDayId((prev) => ({ ...prev, [activeDayId]: false }));
    setStaleByDayId((prev) => ({ ...prev, [activeDayId]: false }));
    setError(null);
    setSidebarView('stops');
  };

  const buildSharePayloadUrl = (): string | null => {
    const shareDays = days
      .map((d) => ({
        ...d,
        stops: d.stops.filter((s) => s.lat != null && s.lng != null),
      }))
      .filter((d) => d.stops.length >= 2)
      .map((d) => {
        const dayIndex = days.findIndex((x) => x.id === d.id);
        return {
          label: displayDayTitle(d, dayIndex >= 0 ? dayIndex : 0),
          date: d.date,
          departureTime: d.departureTime,
          stops: d.stops.map((s) => ({
            address: s.address,
            lat: s.lat as number,
            lng: s.lng as number,
            showingStart: s.showingStart || undefined,
            showingEnd: s.showingEnd || undefined,
          })),
        };
      });

    if (shareDays.length === 0) return null;

    const shareData = {
      kind: 'listing-tour',
      days: shareDays,
      type: selectedRouteType,
      companyName: companyName ?? undefined,
    };

    const data = btoa(JSON.stringify(shareData))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${data}`;
  };

  const copyTourLink = async () => {
    const url = buildSharePayloadUrl();
    if (!url) {
      setError('Add two geocoded properties on at least one day to share an itinerary.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError('Failed to copy link');
    }
    setShowMoreMenu(false);
  };

  const downloadItineraryPdf = () => {
    const url = buildSharePayloadUrl();
    if (!url) {
      setError('Add two geocoded properties on at least one day to print.');
      setShowMoreMenu(false);
      return;
    }
    window.open(`${url}?print=1`, '_blank', 'noopener,noreferrer');
    setShowMoreMenu(false);
  };

  const formatTimeMin = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const formatOverviewDateHeading = (dateIso: string): string => {
    const d = new Date(`${dateIso}T12:00:00`);
    return isNaN(d.getTime())
      ? dateIso
      : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const overviewSecondLineForDay = (day: TourDay): { empty: boolean; text: string } => {
    const n = day.stops.length;
    if (n === 0) return { empty: true, text: 'Empty — add your first stop' };

    const parts: string[] = [];
    parts.push(n === 1 ? '1 stop' : `${n} stops`);

    const route = routeByDayId[day.id];
    if (route != null) {
      parts.push(formatTimeMin(route.totalTime));
      parts.push(`${Math.round(route.totalDistance)} mi`);
    }

    const withWin = day.stops.filter((s) => s.showingEnabled && s.showingStart && s.showingEnd);
    if (withWin.length > 0) {
      let minS = Infinity;
      let maxE = -Infinity;
      for (const s of withWin) {
        const a = parseTimeToMinutes(s.showingStart!);
        const b = parseTimeToMinutes(s.showingEnd!);
        if (a != null && b != null) {
          minS = Math.min(minS, a);
          maxE = Math.max(maxE, b);
        }
      }
      if (minS !== Infinity && maxE !== -Infinity) {
        const ws = timeOnTourDate(minS, day.date);
        const we = timeOnTourDate(maxE, day.date);
        const tf = { hour: 'numeric', minute: '2-digit' } as const;
        parts.push(`${ws.toLocaleTimeString(undefined, tf)} – ${we.toLocaleTimeString(undefined, tf)}`);
      }
    }

    return { empty: false, text: parts.join(' · ') };
  };

  /* Drag reorder */
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    dragNode.current = e.target as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.5';
    }, 0);
  };
  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index);
  };
  const resetDragState = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNode.current = null;
  };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      resetDragState();
      return;
    }
    patchDay(activeDayId, (d) => {
      const nextStops = [...d.stops];
      const [moved] = nextStops.splice(draggedIndex, 1);
      nextStops.splice(dropIndex, 0, moved);
      return { ...d, stops: nextStops };
    });
    resetDragState();
    markDayRouteStale(activeDayId);
  };

  function appendTourDayAfterPrevDate(prevDays: TourDay[]): TourDay[] {
    if (prevDays.length >= 7) return prevDays;
    const last = prevDays[prevDays.length - 1];
    const base = new Date(`${last.date}T12:00:00`);
    if (isNaN(base.getTime())) return prevDays;
    base.setDate(base.getDate() + 1);
    const ymd = `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
    const nextDay: TourDay = {
      id: createId('day'),
      label: '',
      date: ymd,
      departureTime: '09:00',
      stops: [],
    };
    return [...prevDays, nextDay];
  }

  const addAnotherDayFromOverview = () => {
    setDays((prev) => appendTourDayAfterPrevDate(prev));
  };

  const addSecondTourDayFromStopsLink = () => {
    setDays((prev) => {
      if (prev.length !== 1) return prev;
      return appendTourDayAfterPrevDate(prev);
    });
    setSidebarView('overview');
  };

  const removeDayAtIndex = useCallback((idx: number) => {
    const snap = daysRef.current;
    if (snap.length <= 1) return;
    const removedId = snap[idx]?.id;

    if (removedId) {
      setRouteByDayId((routes) => {
        const { [removedId]: _, ...rest } = routes;
        return rest;
      });
      setOriginalRouteByDayId((o) => {
        const { [removedId]: __, ...rest } = o;
        return rest;
      });
      setOptimizedOnceByDayId((o) => {
        const { [removedId]: ___, ...rest } = o;
        return rest;
      });
      setStaleByDayId((s) => {
        const { [removedId]: __, ...rest } = s;
        return rest;
      });
    }

    setDays((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });

    setActiveDayIndex((cur) => {
      if (cur === idx) return idx === 0 ? 0 : idx - 1;
      return cur > idx ? cur - 1 : cur;
    });

    setOverviewRemovePromptIdx(null);
    setDayPickerOpen(false);
  }, []);

  const validStops = stops.filter((s) => s.lat && s.lng);
  /** Overview tab: show every geocoded stop across all days. Other tabs: active day only. */
  const overviewMapMode = sidebarView === 'overview' && days.length >= 2;
  const mapGeoStops = overviewMapMode
    ? days.flatMap((d) => d.stops).filter((s) => s.lat != null && s.lng != null)
    : validStops;

  const overviewDayPinColors = useMemo(
    () => accentShadesForDays(accentColor, Math.max(1, days.length)),
    [accentColor, days.length]
  );

  const firstDay = days[0];
  const departureOverviewCombined = useMemo(() => {
    if (!firstDay) return new Date();
    const d = new Date(`${firstDay.date}T${firstDay.departureTime || '09:00'}:00`);
    return isNaN(d.getTime()) ? new Date() : d;
  }, [firstDay?.id, firstDay?.date, firstDay?.departureTime]);

  const departureOverviewDateValue = firstDay?.date ?? `${new Date().getFullYear()}-01-01`;
  const departureOverviewTimeValue =
    firstDay?.departureTime ??
    `${pad2(departureOverviewCombined.getHours())}:${pad2(departureOverviewCombined.getMinutes())}`;

  const hasAnyCalculatedDay = useMemo(
    () => Object.values(routeByDayId).some((r) => r != null),
    [routeByDayId]
  );

  const tourHasEligibleStopPair = useMemo(
    () => days.some((d) => d.stops.filter((s) => s.lat != null && s.lng != null).length >= 2),
    [days]
  );

  const showOverviewMultiPanel = sidebarView === 'overview' && days.length >= 2;

  const routeTotals = useMemo(() => {
    const driveTime = routeResult?.totalTime ?? 0;
    const onSite =
      activeDay?.stops.reduce((sum, s) => sum + (s.showingDuration || 0), 0) ?? 0;
    const wait =
      activeDay?.stops.reduce((sum, s) => sum + (s.waitTime || 0), 0) ?? 0;
    const total = driveTime + onSite + wait;
    const conflicts = activeDay?.stops.filter((s) => s.showingStatus === 'late').length ?? 0;
    return { driveTime, onSite, waitTime: wait, total, conflictCount: conflicts };
  }, [routeResult, activeDay?.stops]);

  const estimatedFuelGal =
    routeResult?.totalFuelUsed != null && routeResult.totalFuelUsed > 0
      ? routeResult.totalFuelUsed
      : routeResult != null && routeResult.totalDistance > 0
        ? routeResult.totalDistance / mpg
        : null;
  const fuelCostUsd = estimatedFuelGal != null ? estimatedFuelGal * gasPricePerGal : null;
  const irsUsd = routeResult != null ? routeResult.totalDistance * irsRate : null;

  const mapCenter =
    mapGeoStops.length > 0
      ? {
          lat: mapGeoStops.reduce((sum, s) => sum + s.lat!, 0) / mapGeoStops.length,
          lng: mapGeoStops.reduce((sum, s) => sum + s.lng!, 0) / mapGeoStops.length,
        }
      : { lat: 39.8283, lng: -98.5795 };

  const markers = useMemo(() => {
    if (overviewMapMode) {
      return days.flatMap((day, dayIdx) => {
        const pinColor = overviewDayPinColors[dayIdx] ?? accentColor;
        const geoOnDay = day.stops.filter((s) => s.lat != null && s.lng != null);
        return geoOnDay.map((stop, si) => {
          const seq = String(si + 1);
          const pinDayHighlight = overviewHoveredDayId === day.id;
          const pulse = hoveredStopId === stop.id || pinDayHighlight;
          const anyDayHovered = overviewHoveredDayId != null;
          const iconOpacity =
            !anyDayHovered ? 1 : pinDayHighlight ? 1 : 0.28;
          const zIndexOffset = pulse
            ? 2600
            : anyDayHovered && !pinDayHighlight
              ? 120 + dayIdx
              : 400 + dayIdx;
          return {
            lat: stop.lat!,
            lng: stop.lng!,
            label: stop.address?.trim() || `Stop ${seq}`,
            iconUrl: numberedPinIconDataUri({ label: seq, color: pinColor }),
            iconSize: [28, 36] as [number, number],
            iconAnchor: [14, 36] as [number, number],
            iconCircular: false,
            color: pinColor,
            pulse,
            iconOpacity,
            zIndexOffset,
            onClick: () => {
              // TODO(v3): When ATTOM is licensed, open a property-detail modal here
            },
            onContextMenu: (_lat, _lng, meta) => openMoveStopFromMarker(stop.id, day.id, meta),
          };
        });
      });
    }
    return mapGeoStops.map((stop, index) => {
      const seq = String(index + 1);
      const pulse = hoveredStopId === stop.id;
      return {
        lat: stop.lat!,
        lng: stop.lng!,
        label: stop.address?.trim() || `Stop ${seq}`,
        iconUrl: numberedPinIconDataUri({ label: seq, color: accentColor }),
        iconSize: [28, 36] as [number, number],
        iconAnchor: [14, 36] as [number, number],
        iconCircular: false,
        color: accentColor,
        pulse,
        zIndexOffset: pulse ? 1200 : 500,
        onClick: () => {
          // TODO(v3): When ATTOM is licensed, open a property-detail modal here
          // (bed/bath/sqft/price/MLS#/last-sold). UI pattern: right-side card
          // overlaying the map, similar to the "View nearby" drawer.
        },
        onContextMenu: (_lat, _lng, meta) => openMoveStopFromMarker(stop.id, activeDayId, meta),
      };
    });
  }, [
    overviewMapMode,
    days,
    overviewDayPinColors,
    accentColor,
    mapGeoStops,
    hoveredStopId,
    overviewHoveredDayId,
    openMoveStopFromMarker,
    activeDayId,
  ]);

  const routeWaypoints = validStops.length > 2 ? validStops.slice(1, -1).map((s) => ({ lat: s.lat!, lng: s.lng! })) : undefined;

  function trafficBadge(tc?: 'light' | 'moderate' | 'heavy') {
    if (!tc) return null;
    const bg =
      tc === 'heavy'
        ? 'rgba(239,68,68,0.12)'
        : tc === 'moderate'
          ? 'rgba(234,179,8,0.15)'
          : 'rgba(34,197,94,0.12)';
    const fg =
      tc === 'heavy' ? '#dc2626' : tc === 'moderate' ? '#ca8a04' : '#16a34a';
    const label = tc === 'heavy' ? 'Heavy' : tc === 'moderate' ? 'Moderate' : 'Light';

    return (
      <span
        className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
        style={{ background: bg, color: fg }}
      >
        {label}
      </span>
    );
  }

  type NbIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

  function poiAddressLine(p: PlaceHit): string {
    const st = String(p.place?.properties?.street || '').trim();
    if (st) return st;
    const ds = String(p.displayString || '').trim();
    return ds.includes(',') ? ds.split(',').slice(1).join(',').trim() : ds;
  }

  function formatPoiMi(p: PlaceHit): string {
    return typeof p.distance === 'number' ? `${p.distance.toFixed(2)} mi` : '—';
  }

  function renderPoiCard(p: PlaceHit, iKey: string) {
    const line2 = poiAddressLine(p);
    return (
      <div key={iKey} className="py-3 border-b border-[var(--border-subtle)] last:border-b-0">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm truncate flex-1" style={{ color: textMain }}>
            {p.name}
          </span>
          <span
            className={`text-xs shrink-0 tabular-nums px-2 py-0.5 rounded ${chipNeutralFill}`}
            style={{ color: textMuted }}
          >
            {formatPoiMi(p)}
          </span>
        </div>
        {line2 ? (
          <p className="text-xs mt-1" style={{ color: textMuted }}>
            {line2}
          </p>
        ) : null}
      </div>
    );
  }

  function NeighborhoodChipsInline({ bundles: d }: { bundles: NeighborhoodBundles }) {
    const schoolCount =
      d.elementarySchools.length + d.middleSchools.length + d.highSchools.length;
    const defs: { Icon: NbIcon; label: string; count: number }[] = [
      { Icon: Utensils, label: 'Dining', count: d.restaurants.length },
      { Icon: GraduationCap, label: 'Schools', count: schoolCount },
      { Icon: Trees, label: 'Parks', count: d.parks.length },
      { Icon: Bus, label: 'Transit', count: d.transit.length },
      { Icon: Coffee, label: 'Coffee', count: d.coffee.length },
      { Icon: ShoppingCart, label: 'Grocery', count: d.grocery.length },
      { Icon: Dumbbell, label: 'Gym', count: d.gyms.length },
    ];
    const visible = defs.filter((x) => x.count > 0);
    if (!visible.length) return null;
    return (
      <div className="grid grid-cols-2 gap-2">
        {visible.map(({ Icon, label, count }) => (
          <div
            key={label}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${chipNeutralFill}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: textMuted }}>
              {count} {label.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    );
  }

  function NeighborhoodInlineSummary({ lat, lng }: { lat: number; lng: number }) {
    const k = geoKey({ lat, lng });
    const data = k ? neighborhoodCacheRef.current.get(k) : undefined;
    if (!data && k) ensureNeighborhoodCached(lat, lng).catch(() => {});
    const loading = !!k && !data && neighborhoodInflightRef.current.has(k);
    if (loading) {
      return (
        <p className="text-xs py-1" style={{ color: textMuted }}>
          Loading nearby…
        </p>
      );
    }
    if (!data) return null;
    return (
      <div key={`nbi-${k}-${neighborhoodBump}`}>
        <NeighborhoodChipsInline bundles={data} />
      </div>
    );
  }

  function NearbyDrawerInterior({ bundles: d }: { bundles: NeighborhoodBundles }) {
    const schoolTotal =
      d.elementarySchools.length + d.middleSchools.length + d.highSchools.length;

    const restCats: {
      Icon: NbIcon;
      title: string;
      items: PlaceHit[];
    }[] = [
      { Icon: Utensils, title: 'Dining', items: d.restaurants },
      { Icon: Coffee, title: 'Coffee', items: d.coffee },
      { Icon: ShoppingCart, title: 'Grocery', items: d.grocery },
      { Icon: Trees, title: 'Parks', items: d.parks },
      { Icon: Bus, title: 'Transit', items: d.transit },
      { Icon: Dumbbell, title: 'Gyms', items: d.gyms },
    ];

    return (
      <div className="space-y-0">
        {schoolTotal > 0 ? (
          <section className="mb-6 pb-6 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <GraduationCap className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm font-semibold truncate" style={{ color: textMain }}>
                  Schools
                </span>
              </div>
              <span className="text-xs shrink-0" style={{ color: textMuted }}>
                {schoolTotal} nearby
              </span>
            </div>
            {d.elementarySchools.length ? (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2" style={{ color: textMuted }}>
                  Elementary · {d.elementarySchools.length}
                </p>
                <div>{d.elementarySchools.map((p, i) => renderPoiCard(p, `el-${i}`))}</div>
              </div>
            ) : null}
            {d.middleSchools.length ? (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2" style={{ color: textMuted }}>
                  Middle · {d.middleSchools.length}
                </p>
                <div>{d.middleSchools.map((p, i) => renderPoiCard(p, `mid-${i}`))}</div>
              </div>
            ) : null}
            {d.highSchools.length ? (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: textMuted }}>
                  High · {d.highSchools.length}
                </p>
                <div>{d.highSchools.map((p, i) => renderPoiCard(p, `hi-${i}`))}</div>
              </div>
            ) : null}
          </section>
        ) : null}

        {restCats.map((cat) => {
          const CatIcon = cat.Icon;
          return cat.items.length ? (
            <section
              key={cat.title}
              className="mb-6 pb-6 border-b last:border-0 last:pb-0 last:mb-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <CatIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm font-semibold truncate" style={{ color: textMain }}>
                    {cat.title}
                  </span>
                </div>
                <span className="text-xs shrink-0" style={{ color: textMuted }}>
                  {cat.items.length} nearby
                </span>
              </div>
              <div>{cat.items.map((p, i) => renderPoiCard(p, `${cat.title}-${i}`))}</div>
            </section>
          ) : null;
        })}
      </div>
    );
  }

  /* --- savings vs baseline (fuel $ from API gallons or MPG fallback) --- */
  const origFuelGal =
    originalRoute?.fuel != null && originalRoute.fuel > 0
      ? originalRoute.fuel
      : originalRoute != null && originalRoute.distance > 0
        ? originalRoute.distance / mpg
        : null;
  const origFuelCost = origFuelGal != null ? origFuelGal * gasPricePerGal : null;
  const origIrsUsd = originalRoute != null ? originalRoute.distance * irsRate : null;

  if (!activeDay) return null;

  return (
    <div
      className="prism-widget w-full md:w-[1100px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={
        {
          fontFamily: fontFamily || 'var(--brand-font)',
          '--brand-primary': accentColor,
          borderRadius: borderRadius ?? undefined,
        } as React.CSSProperties
      }
    >
      <WidgetHeader
        title="Listing Tour Planner"
        subtitle="Plan tours, optimize drives, share itineraries."
        variant="impressive"
        layout="inline"
        icon={<Route className="w-4.5 h-4.5" />}
      />

      <div className="relative flex flex-col md:flex-row md:h-[915px]">
        <div className="relative h-[300px] md:h-auto md:flex-1 md:order-2" ref={mapPanelRef}>
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={mapGeoStops.length > 0 ? 10 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            showRoute={!overviewMapMode && !!routeResult && validStops.length >= 2}
            routeStart={
              !overviewMapMode &&
              routeResult &&
              validStops.length >= 2
                ? { lat: validStops[0].lat!, lng: validStops[0].lng! }
                : undefined
            }
            routeEnd={
              !overviewMapMode &&
              routeResult &&
              validStops.length >= 2
                ? {
                    lat: validStops[validStops.length - 1].lat!,
                    lng: validStops[validStops.length - 1].lng!,
                  }
                : undefined
            }
            waypoints={!overviewMapMode && routeResult ? routeWaypoints ?? [] : []}
            stops={
              overviewMapMode
                ? []
                : validStops.map((s) => ({ lat: s.lat!, lng: s.lng! }))
            }
            onRightClick={handleMapRightClick}
            onClick={() => {
              setNearbyDrawer(null);
            }}
          />

          {panelRouteLoading ? (
            <div
              className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none"
              style={{ background: 'rgba(0,0,0,0.12)' }}
              aria-hidden
            >
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: accentColor }} />
            </div>
          ) : null}

          {nearbyDrawer ? (
            <div
              ref={nearbyDrawerRef}
              className="listing-tour-nearby-drawer absolute top-0 right-0 bottom-0 z-[600] flex flex-col w-[min(420px,100%)] border-l"
              style={{
                background: bgWidget,
                borderColor: 'var(--border-subtle)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex-shrink-0 px-4 pt-4 pb-3 border-b"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-semibold truncate" style={{ color: textMain }}>
                      {nearbyDrawer.address || 'Listing'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>
                      Nearby points of interest
                    </p>
                  </div>
                  <button
                    type="button"
                    className="p-1 rounded-lg shrink-0 transition-opacity hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Close"
                    onClick={() => setNearbyDrawer(null)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div
                className="listing-tour-nearby-scroll flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-3"
                key={`nd-body-${nearbyDrawer.stopId}-${neighborhoodBump}`}
              >
                {(() => {
                  const dk = geoKey({ lat: nearbyDrawer.lat, lng: nearbyDrawer.lng });
                  const bundles = dk ? neighborhoodCacheRef.current.get(dk) : undefined;
                  const loading =
                    !!dk && !bundles && neighborhoodInflightRef.current.has(dk);
                  if (loading) {
                    return (
                      <p className="text-sm py-8 text-center" style={{ color: textMuted }}>
                        Loading…
                      </p>
                    );
                  }
                  if (!bundles) {
                    return (
                      <p className="text-sm py-8 text-center" style={{ color: textMuted }}>
                        No nearby points of interest yet.
                      </p>
                    );
                  }
                  return <NearbyDrawerInterior bundles={bundles} />;
                })()}
              </div>
            </div>
          ) : null}

          {(overviewMapMode ? mapGeoStops.length < 2 : validStops.length < 2) ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-[5]" aria-hidden>
              <p className="text-sm text-center px-8 max-w-sm" style={{ color: textMuted }}>
                Add 2 or more properties to plan your tour
              </p>
            </div>
          ) : null}

          {mapPinPrompt ? (
            <div
              ref={mapPinPromptRef}
              className="absolute z-[650] rounded-xl border shadow-lg overflow-hidden max-w-[min(280px,calc(100%-16px))]"
              style={{
                left: Math.max(8, mapPinPrompt.x),
                top: Math.max(8, mapPinPrompt.y),
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-panel)',
                color: 'var(--text-main)',
              }}
            >
              <div className="px-3 py-2 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                Add a property here?
              </div>
              <div className="p-2 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm hover:opacity-80"
                  style={{ borderColor: 'var(--border-subtle)', background: 'transparent', color: 'var(--text-main)' }}
                  onClick={async () => {
                    if (!mapPinPrompt) return;
                    const { lat, lng } = mapPinPrompt;
                    setMapPinPrompt(null);
                    await addStopAtLatLng(lat, lng);
                  }}
                >
                  Add pin
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-80"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => setMapPinPrompt(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {moveStopFlow ? (
            <div
              ref={moveStopPromptRef}
              className="absolute z-[655] rounded-xl border shadow-lg overflow-hidden max-w-[min(320px,calc(100%-16px))]"
              style={{
                left: Math.max(8, moveStopFlow.x),
                top: Math.max(8, moveStopFlow.y),
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-panel)',
                color: 'var(--text-main)',
              }}
            >
              {moveStopFlow.phase === 'confirm' ? (
                <>
                  <div className="px-3 py-2 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    Move to another day?
                  </div>
                  <p className="px-3 py-2 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                    Move this listing to a different day on your tour. Your route for both days will need to be
                    recalculated if it was already planned.
                  </p>
                  <div className="p-2 flex items-center gap-2 flex-wrap justify-end">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-80"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() => setMoveStopFlow(null)}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm hover:opacity-80"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        background: accentColor,
                        color: 'white',
                      }}
                      onClick={() =>
                        setMoveStopFlow((prev) =>
                          prev ? { ...prev, phase: 'pickDay' } : null
                        )
                      }
                    >
                      Yes
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-3 py-2 text-xs font-semibold flex items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <span>Add to which day?</span>
                    <button
                      type="button"
                      className="text-[10px] font-medium hover:opacity-80 shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() =>
                        setMoveStopFlow((prev) =>
                          prev ? { ...prev, phase: 'confirm' } : null
                        )
                      }
                    >
                      Back
                    </button>
                  </div>
                  <div className="max-h-[min(240px,40vh)] overflow-y-auto p-2 space-y-1">
                    {days.map((day, idx) => {
                      if (day.id === moveStopFlow.fromDayId) return null;
                      const atMax = day.stops.length >= maxStops;
                      return (
                        <button
                          key={day.id}
                          type="button"
                          disabled={atMax}
                          title={
                            atMax
                              ? `This day already has the maximum of ${maxStops} properties.`
                              : undefined
                          }
                          className="w-full text-left rounded-lg px-2.5 py-2 text-xs transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-main)',
                          }}
                          onClick={() =>
                            applyMoveStopToDay(
                              moveStopFlow.stopId,
                              moveStopFlow.fromDayId,
                              day.id
                            )
                          }
                        >
                          <span className="font-semibold">{displayDayTitle(day, idx)}</span>
                          <span className="text-[var(--text-muted)]"> · </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {formatOverviewDateHeading(day.date)}
                          </span>
                          {atMax ? (
                            <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              Full ({maxStops} stops)
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      type="button"
                      className="w-full rounded-lg py-1.5 text-xs font-medium hover:opacity-80"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() => setMoveStopFlow(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {optimizing ? (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(0,0,0,0.4)' }}>
              <div className="px-6 py-4 rounded-2xl flex items-center gap-4 shadow-2xl" style={{ background: 'var(--bg-widget)' }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
                <span className="text-base font-medium" style={{ color: 'var(--text-main)' }}>
                  Optimizing tour order...
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className="w-full md:w-[420px] flex flex-col flex-shrink-0 border-t md:border-t-0 md:border-r flex-1 md:flex-initial min-h-[300px] md:min-h-0 md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {optimizing ? (
            <div
              className="px-5 py-3 flex items-center gap-3"
              style={{ background: `${accentColor}10`, borderBottom: '1px solid var(--border-subtle)' }}
            >
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>
                  Optimizing tour order...
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Shorter drives between stops where MapQuest recommends
                </p>
              </div>
            </div>
          ) : null}


          {/* Sidebar view tabs */}
          <div className="px-3 pt-3 pb-2 flex items-center gap-1.5">
            <div
              className="flex p-1 rounded-xl gap-0.5 flex-1 min-w-0 flex-wrap"
              style={{ background: 'var(--bg-input)' }}
            >
              {days.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => setSidebarView('overview')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors hover:opacity-80 min-w-[72px]"
                  style={{
                    background: sidebarView === 'overview' ? `${accentColor}1F` : 'transparent',
                    color: sidebarView === 'overview' ? accentColor : textMuted,
                    boxShadow: 'none',
                  }}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Overview
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSidebarView('stops')}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors hover:opacity-80 min-w-[72px]"
                style={{
                  background: sidebarView === 'stops' ? `${accentColor}1F` : 'transparent',
                  color:
                    sidebarView === 'stops'
                      ? accentColor
                      : darkMode
                        ? textMuted
                        : textMuted,
                  boxShadow: 'none',
                }}
              >
                <List className="w-3.5 h-3.5" />
                Stops
              </button>
              {routeResult ? (
                  <button
                    type="button"
                    onClick={() => setSidebarView('route')}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors hover:opacity-80 min-w-[72px]"
                    style={{
                      background:
                        sidebarView === 'route' ? `${accentColor}1F` : 'transparent',
                      color: sidebarView === 'route' ? accentColor : darkMode ? textMuted : textMuted,
                      boxShadow: 'none',
                    }}
                  >
                    <Route className="w-3.5 h-3.5" />
                    Tour
                  </button>
              ) : null}
            </div>

            <div className="relative flex-shrink-0" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 rounded-lg transition-colors hover:bg-black/5"
                style={{ color: textMuted }}
                aria-haspopup="true"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {showMoreMenu ? (
                <div
                  className="absolute right-0 top-full mt-1 w-[min(18rem,calc(100vw-24px))] py-2 rounded-xl shadow-xl z-50 max-h-[min(80vh,calc(100vh-80px))] overflow-y-auto"
                  style={{ background: bgWidget, border: `1px solid ${border}` }}
                >
                  <button
                    type="button"
                    disabled={optimizing || panelRouteLoading || !routeResult || validStops.length < 3}
                    className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ color: textMain }}
                    onClick={() => void handleOptimizeTourOrder()}
                  >
                    <Shuffle className="w-4 h-4" /> Optimize stop order
                  </button>

                  <button
                    type="button"
                    disabled={optimizing || panelRouteLoading}
                    className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ color: textMain, borderTop: `1px solid ${border}` }}
                    onClick={() => addDemoTourStops()}
                  >
                    <MapPin className="w-4 h-4" /> Add demo stops
                  </button>

                  <div className="px-4 pb-3 pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                      Route preference
                    </p>
                    <div className="space-y-2">
                      {(['fastest', 'shortest', 'balanced'] as const).map((rt) => (
                        <label
                          key={rt}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                          style={{ color: textMain }}
                        >
                          <input
                            type="radio"
                            name="listing-tour-route-type"
                            className="accent-current"
                            style={{ accentColor }}
                            checked={selectedRouteType === rt}
                            onChange={() => {
                              setSelectedRouteType(rt);
                              markAllRoutedDaysStale();
                            }}
                          />
                          <span className="capitalize">{rt}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ borderTop: `1px solid ${border}` }} />

                  <button
                    type="button"
                    onClick={() => {
                      resetTourRouteMetrics();
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5"
                    style={{ color: textMain }}
                  >
                    <RotateCcw className="w-4 h-4" /> Reset day
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearAllDays();
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5"
                    style={{ color: textMain }}
                  >
                    <Trash2 className="w-4 h-4" /> Clear all
                  </button>

                  <div style={{ borderTop: `1px solid ${border}` }} />

                  <button
                    type="button"
                    onClick={() => copyTourLink()}
                    className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5"
                    style={{ color: copySuccess ? 'var(--color-success)' : textMain }}
                  >
                    {copySuccess ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                    {copySuccess ? 'Copied itinerary link!' : 'Copy itinerary link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadItineraryPdf();
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-black/5"
                    style={{ color: textMain }}
                  >
                    <Download className="w-4 h-4" /> Download itinerary PDF
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
          <div
            className={`flex-1 overflow-y-auto px-3 py-2 relative transition-opacity ${
              panelRouteLoading && !showOverviewMultiPanel ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            {!showOverviewMultiPanel ? (
              <div
                className="-mx-3 px-3 sticky top-0 z-30 mb-2 pb-2 -mt-0.5"
                style={{
                  background: bgWidget,
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    title="Departure time"
                  >
                    <Clock className="w-4 h-4" style={{ color: textMuted }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[11px] font-semibold tracking-wide uppercase"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Depart
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {departureCombined.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="relative mt-1" ref={departurePickerRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeparturePicker((v) => !v);
                          setShowDepartureOverviewPicker(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl text-sm font-medium outline-none transition-all hover:opacity-80 flex items-center justify-between gap-2"
                        style={{
                          background: 'var(--bg-input)',
                          border: `1px solid ${
                            showDeparturePicker ? `${accentColor}80` : 'var(--border-subtle)'
                          }`,
                          color: 'var(--text-main)',
                          boxShadow: showDeparturePicker
                            ? `0 0 0 4px ${accentColor}20`
                            : '0 1px 0 rgba(255,255,255,0.06) inset',
                        }}
                      >
                        <span>
                          {departureCombined.toLocaleDateString([], {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {departureCombined.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                      </button>

                      {showDeparturePicker ? (
                        <div
                          className="absolute left-0 right-0 top-full mt-2 rounded-2xl p-3 z-50 overflow-hidden"
                          style={{
                            background: 'var(--bg-widget)',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="text-[11px] font-semibold uppercase tracking-wider"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Departure
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowDeparturePicker(false)}
                              className="text-xs font-medium px-2 py-1 rounded-lg hover:opacity-80"
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
                              <label
                                className="text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                Date
                              </label>
                              <input
                                type="date"
                                value={departureDateValue}
                                onChange={(e) =>
                                  setTourDepartureParts(e.target.value, departureTimeValue, activeDayId, false)
                                }
                                className="w-full mt-1 px-3 py-2 rounded-xl text-sm font-medium outline-none"
                                style={{
                                  background: 'var(--bg-input)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-main)',
                                }}
                              />
                            </div>
                            <div>
                              <label
                                className="text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                Time
                              </label>
                              <input
                                type="time"
                                value={departureTimeValue}
                                onChange={(e) =>
                                  setTourDepartureParts(departureDateValue, e.target.value, activeDayId, false)
                                }
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
                              onClick={() => {
                                const n = new Date();
                                const ds = `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
                                const ts = `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
                                setTourDepartureParts(ds, ts, activeDayId, false);
                                setShowDeparturePicker(false);
                              }}
                              className="px-2 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-80"
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
                                  const t = new Date(Date.now() + mins * 60 * 1000);
                                  const ds = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
                                  const ts = `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
                                  setTourDepartureParts(ds, ts, activeDayId, false);
                                  setShowDeparturePicker(false);
                                }}
                                className="px-2 py-2 rounded-xl text-[11px] font-semibold transition-all hover:brightness-110"
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
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {sidebarView === 'overview' && days.length >= 2 ? (
              <div className="-mx-3 px-3 pb-2 space-y-3">
                {firstDay ? (
                  <div
                    ref={departureOverviewPickerRef}
                    className="rounded-xl p-3"
                    style={{
                      border: `1px solid ${border}`,
                      background: darkMode ? 'rgba(15, 23, 42, 0.55)' : 'var(--bg-panel)',
                      boxShadow: darkMode ? undefined : '0 1px 2px rgba(15, 23, 42, 0.06)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                        }}
                        title="Tour departure time"
                      >
                        <Clock className="w-4 h-4" style={{ color: textMuted }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-[11px] font-semibold tracking-wide uppercase"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Depart
                          </span>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {departureOverviewCombined.toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <div className="relative mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowDepartureOverviewPicker((v) => !v);
                              setShowDeparturePicker(false);
                            }}
                            className="w-full px-3 py-2 rounded-xl text-sm font-medium outline-none transition-all hover:opacity-80 flex items-center justify-between gap-2"
                            style={{
                              background: 'var(--bg-input)',
                              border: `1px solid ${
                                showDepartureOverviewPicker
                                  ? `${accentColor}80`
                                  : 'var(--border-subtle)'
                              }`,
                              color: 'var(--text-main)',
                              boxShadow: showDepartureOverviewPicker
                                ? `0 0 0 4px ${accentColor}20`
                                : '0 1px 0 rgba(255,255,255,0.06) inset',
                            }}
                          >
                            <span>
                              {departureOverviewCombined.toLocaleDateString([], {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              ·{' '}
                              {departureOverviewCombined.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                          </button>

                          {showDepartureOverviewPicker ? (
                            <div
                              className="absolute left-0 right-0 top-full mt-2 rounded-2xl p-3 z-50 overflow-hidden"
                              style={{
                                background: 'var(--bg-widget)',
                                border: '1px solid var(--border-subtle)',
                                boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span
                                  className="text-[11px] font-semibold uppercase tracking-wider"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  Departure
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowDepartureOverviewPicker(false)}
                                  className="text-xs font-medium px-2 py-1 rounded-lg hover:opacity-80"
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
                                  <label
                                    className="text-[10px] font-semibold uppercase tracking-wider"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    Date
                                  </label>
                                  <input
                                    type="date"
                                    value={departureOverviewDateValue}
                                    onChange={(e) =>
                                      setTourDepartureParts(
                                        e.target.value,
                                        departureOverviewTimeValue,
                                        firstDay.id,
                                        true
                                      )
                                    }
                                    className="w-full mt-1 px-3 py-2 rounded-xl text-sm font-medium outline-none"
                                    style={{
                                      background: 'var(--bg-input)',
                                      border: '1px solid var(--border-subtle)',
                                      color: 'var(--text-main)',
                                    }}
                                  />
                                </div>
                                <div>
                                  <label
                                    className="text-[10px] font-semibold uppercase tracking-wider"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    Time
                                  </label>
                                  <input
                                    type="time"
                                    value={departureOverviewTimeValue}
                                    onChange={(e) =>
                                      setTourDepartureParts(
                                        departureOverviewDateValue,
                                        e.target.value,
                                        firstDay.id,
                                        true
                                      )
                                    }
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
                                  onClick={() => {
                                    const n = new Date();
                                    const ds = `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
                                    const ts = `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
                                    setTourDepartureParts(ds, ts, firstDay.id, true);
                                    setShowDepartureOverviewPicker(false);
                                  }}
                                  className="px-2 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-80"
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
                                      const t = new Date(Date.now() + mins * 60 * 1000);
                                      const ds = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
                                      const ts = `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
                                      setTourDepartureParts(ds, ts, firstDay.id, true);
                                      setShowDepartureOverviewPicker(false);
                                    }}
                                    className="px-2 py-2 rounded-xl text-[11px] font-semibold transition-all hover:brightness-110"
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
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div
                  className="rounded-xl p-2"
                  style={{
                    border: `1px solid ${border}`,
                    background: darkMode ? 'rgba(15, 23, 42, 0.55)' : 'var(--bg-panel)',
                    boxShadow: darkMode ? undefined : '0 1px 2px rgba(15, 23, 42, 0.06)',
                  }}
                >
                  <p
                    className="px-2 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: textMuted }}
                  >
                    Tour days
                  </p>
                  {days.map((day, idx) => {
                    const meta = overviewSecondLineForDay(day);
                    const isRenamingThis = renamingDay?.id === day.id;
                    const dayPin = overviewDayPinColors[idx] ?? accentColor;
                    return (
                      <div
                        key={day.id}
                        className={idx === 0 ? '' : 'mt-1 pt-1'}
                        style={idx > 0 ? { borderTop: '1px solid var(--border-subtle)' } : undefined}
                        onMouseEnter={() => setOverviewHoveredDayId(day.id)}
                        onMouseLeave={() =>
                          setOverviewHoveredDayId((cur) => (cur === day.id ? null : cur))
                        }
                        onFocus={() => setOverviewHoveredDayId(day.id)}
                        onBlur={(e) => {
                          const next = e.relatedTarget as Node | null;
                          if (!next || !(e.currentTarget as HTMLElement).contains(next)) {
                            setOverviewHoveredDayId((cur) => (cur === day.id ? null : cur));
                          }
                        }}
                      >
                        <div
                          role={isRenamingThis ? undefined : 'button'}
                          tabIndex={isRenamingThis ? undefined : 0}
                          onKeyDown={
                            isRenamingThis
                              ? undefined
                              : (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setOverviewRemovePromptIdx(null);
                                    setActiveDayIndex(idx);
                                    setSidebarView('stops');
                                  }
                                }
                          }
                          className={`rounded-lg px-2 py-2 transition-colors ${
                            isRenamingThis
                              ? ''
                              : `cursor-pointer hover:bg-black/5 dark:hover:bg-white/5`
                          }`}
                          onClick={
                            isRenamingThis
                              ? undefined
                              : () => {
                                  setOverviewRemovePromptIdx(null);
                                  setActiveDayIndex(idx);
                                  setSidebarView('stops');
                                }
                          }
                        >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                            {isRenamingThis && renamingDay ? (
                              <input
                                aria-label="Day name"
                                className="flex-1 min-w-0 max-w-full text-sm font-semibold px-2 py-1 rounded-lg outline-none"
                                style={{
                                  background: 'var(--bg-input)',
                                  border: `1px solid ${accentColor}66`,
                                  color: textMain,
                                }}
                                value={renamingDay.draft}
                                autoFocus
                                onChange={(e) => setRenamingDay({ id: day.id, draft: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitDayName(day.id, idx, renamingDay.draft);
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    escapeDayRenameRef.current = true;
                                    setRenamingDay(null);
                                  }
                                }}
                                onBlur={(e) => {
                                  if (escapeDayRenameRef.current) {
                                    escapeDayRenameRef.current = false;
                                    return;
                                  }
                                  commitDayName(day.id, idx, (e.target as HTMLInputElement).value);
                                }}
                              />
                            ) : (
                              <>
                                <span
                                  className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/80"
                                  style={{ background: dayPin }}
                                  title="Stops for this day use this color on the map"
                                  aria-hidden
                                />
                                <span
                                  className="text-sm font-semibold shrink-0"
                                  style={{ color: textMain }}
                                >
                                  {displayDayTitle(day, idx)}
                                </span>
                                <span className="text-sm shrink-0" style={{ color: textMuted }}>
                                  ·
                                </span>
                                <span className="text-sm truncate" style={{ color: textMuted }}>
                                  {formatOverviewDateHeading(day.date)}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {!isRenamingThis ? (
                              <button
                                type="button"
                                className="p-1.5 rounded-lg transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                                style={{ color: textMuted }}
                                title="Rename day"
                                aria-label="Rename day"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingDay({
                                    id: day.id,
                                    draft: displayDayTitle(day, idx),
                                  });
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            ) : null}
                            {!isRenamingThis ? (
                              <button
                                type="button"
                                data-overview-trash="1"
                                className="p-1.5 rounded-lg transition-colors hover:bg-black/10 dark:hover:bg-white/10 hover:text-red-500"
                                style={{ color: 'var(--text-muted)' }}
                                title="Remove day"
                                aria-label="Remove day"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOverviewRemovePromptIdx((p) => (p === idx ? null : idx));
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : null}
                            {!isRenamingThis ? (
                              <ChevronRight
                                className="w-4 h-4 shrink-0"
                                style={{ color: 'var(--text-muted)' }}
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1 rounded-md -mx-1 px-1 py-0.5 pr-2">
                          <p className="text-xs min-w-0" style={{ color: textMuted }}>
                            {meta.text}
                          </p>
                          {recalcLoadingByDayId[day.id] ? (
                            <Loader2
                              className="w-3.5 h-3.5 animate-spin shrink-0"
                              style={{ color: dayPin }}
                              aria-hidden
                            />
                          ) : null}
                          {staleByDayId[day.id] ? (
                            <span
                              title="Stops or depart time changed. Recalculate to update."
                              className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium"
                              style={{
                                background: 'rgba(245, 158, 11, 0.2)',
                                color: '#b45309',
                              }}
                            >
                              Out of date
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {overviewRemovePromptIdx === idx ? (
                        <div
                          data-overview-remove-panel="1"
                          className="mt-3 p-3 rounded-lg text-xs space-y-3"
                          style={{
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-panel)',
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p style={{ color: textMain }}>
                            Remove {displayDayTitle(day, idx)}?
                            {day.stops.length > 0 ? (
                              <>
                                {' '}
                                This deletes {day.stops.length}{' '}
                                {day.stops.length === 1 ? 'stop' : 'stops'}.
                              </>
                            ) : null}
                          </p>
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              className="text-xs font-medium hover:opacity-80"
                              style={{ color: textMuted }}
                              onClick={() => setOverviewRemovePromptIdx(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold hover:opacity-80"
                              style={{ color: 'var(--color-error)' }}
                              onClick={() => removeDayAtIndex(idx)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                </div>
                <button
                  type="button"
                  disabled={days.length >= 7}
                  onClick={addAnotherDayFromOverview}
                  className="w-full py-2 rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors hover:bg-black/5 disabled:opacity-40 disabled:pointer-events-none"
                  style={{ border: '1px dashed var(--border-default)', color: textMuted }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add another day
                </button>
              </div>
            ) : sidebarView === 'stops' ? (
              <div className="space-y-1.5">
                {days.length === 1 && staleByDayId[activeDay.id] ? (
                  <div className="flex justify-center -mt-0.5 mb-1">
                    <span
                      title="Stops or depart time changed. Recalculate to update."
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        color: '#b45309',
                      }}
                    >
                      Out of date
                    </span>
                  </div>
                ) : null}
                {days.length >= 2 ? (
                  <div ref={dayBreadcrumbPopoverRef} className="relative -mx-3 mb-2 flex flex-col flex-shrink-0">
                    <div
                      className="flex items-center min-h-8 px-3 gap-1 w-full flex-shrink-0 py-1"
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: 'var(--bg-widget)',
                      }}
                    >
                      <button
                        type="button"
                        disabled={activeDayIndex <= 0 || renamingDay?.id === activeDay.id}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-40 disabled:pointer-events-none hover:bg-black/5 dark:hover:bg-white/5"
                        aria-label="Previous day"
                        onClick={() => setActiveDayIndex((i) => Math.max(0, i - 1))}
                      >
                        <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                      </button>
                      {renamingDay?.id === activeDay.id && renamingDay ? (
                        <input
                          aria-label="Day name"
                          className="flex-1 min-w-0 text-center text-sm font-medium px-2 py-1 rounded-lg outline-none"
                          style={{
                            background: 'var(--bg-input)',
                            border: `1px solid ${accentColor}66`,
                            color: 'var(--text-main)',
                          }}
                          value={renamingDay.draft}
                          autoFocus
                          onChange={(e) => setRenamingDay({ id: activeDay.id, draft: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitDayName(activeDay.id, activeDayIndex, renamingDay.draft);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              escapeDayRenameRef.current = true;
                              setRenamingDay(null);
                            }
                          }}
                          onBlur={(e) => {
                            if (escapeDayRenameRef.current) {
                              escapeDayRenameRef.current = false;
                              return;
                            }
                            commitDayName(activeDay.id, activeDayIndex, (e.target as HTMLInputElement).value);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="flex-1 min-w-0 text-center text-sm font-medium truncate px-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                          style={{ color: 'var(--text-main)' }}
                          onClick={() => setDayPickerOpen((open) => !open)}
                        >
                          {`${displayDayTitle(activeDay, activeDayIndex)} · ${activeDayIndex + 1} of ${days.length} · ${formatOverviewDateHeading(activeDay.date)}`}
                        </button>
                      )}
                      {renamingDay?.id !== activeDay.id ? (
                        <button
                          type="button"
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                          title="Rename day"
                          aria-label="Rename day"
                          onClick={() => {
                            setDayPickerOpen(false);
                            setRenamingDay({
                              id: activeDay.id,
                              draft: displayDayTitle(activeDay, activeDayIndex),
                            });
                          }}
                        >
                          <Pencil className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        </button>
                      ) : (
                        <div className="w-8 flex-shrink-0" aria-hidden />
                      )}
                      <button
                        type="button"
                        disabled={activeDayIndex >= days.length - 1 || renamingDay?.id === activeDay.id}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-40 disabled:pointer-events-none hover:bg-black/5 dark:hover:bg-white/5"
                        aria-label="Next day"
                        onClick={() =>
                          setActiveDayIndex((i) => Math.min(days.length - 1, i + 1))
                        }
                      >
                        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>
                    {staleByDayId[activeDay.id] ? (
                      <div className="px-3 pb-1.5 flex justify-center">
                        <span
                          title="Stops or depart time changed. Recalculate to update."
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: 'rgba(245, 158, 11, 0.2)',
                            color: '#b45309',
                          }}
                        >
                          Out of date
                        </span>
                      </div>
                    ) : null}
                    {dayPickerOpen ? (
                      <div
                        className="absolute left-3 right-3 top-full mt-1 rounded-xl shadow-xl max-h-[min(280px,50vh)] overflow-y-auto py-1 z-50"
                        style={{ background: bgWidget, border: `1px solid ${border}` }}
                      >
                        {days.map((day, idx) => {
                          const meta = overviewSecondLineForDay(day);
                          const isSelectedDay = idx === activeDayIndex;
                          return (
                            <button
                              key={day.id}
                              type="button"
                              aria-current={isSelectedDay ? 'true' : undefined}
                              className={`w-full text-left px-3 py-2 transition-colors ${
                                isSelectedDay
                                  ? ''
                                  : 'hover:bg-black/5 dark:hover:bg-white/5'
                              }`}
                              style={{
                                borderTop: idx > 0 ? '1px solid var(--border-subtle)' : undefined,
                                background: isSelectedDay ? `${accentColor}14` : undefined,
                                boxShadow: isSelectedDay ? `inset 3px 0 0 ${accentColor}` : undefined,
                              }}
                              onClick={() => {
                                setActiveDayIndex(idx);
                                setDayPickerOpen(false);
                                setSidebarView('stops');
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span
                                    className="text-sm font-semibold shrink-0"
                                    style={{ color: isSelectedDay ? accentColor : textMain }}
                                  >
                                    {displayDayTitle(day, idx)}
                                  </span>
                                  <span className="text-sm shrink-0" style={{ color: textMuted }}>
                                    ·
                                  </span>
                                  <span className="text-sm truncate" style={{ color: textMuted }}>
                                    {formatOverviewDateHeading(day.date)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs mt-1 pr-2" style={{ color: textMuted }}>
                                {meta.text}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {stops.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 px-2">
                    <p className="text-sm text-center" style={{ color: textMuted }}>
                      Empty — add your first stop
                    </p>
                    {stops.length < maxStops ? (
                      <button
                        type="button"
                        onClick={addListing}
                        className="w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-black/5"
                        style={{ border: '1px dashed var(--border-default)', color: textMuted }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add property
                      </button>
                    ) : null}
                    {days.length === 1 ? (
                      <button
                        type="button"
                        onClick={addSecondTourDayFromStopsLink}
                        className="w-full mt-1 py-2 text-xs font-medium text-center underline underline-offset-2 hover:opacity-80"
                        style={{ color: textMuted }}
                      >
                        + Add a second day
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {stops.map((stop, index) => {
                      const expanded = expandedStopRowIds.has(stop.id);
                      const geo = stop.lat != null && stop.lng != null;

                      return (
                  <div
                    key={stop.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={resetDragState}
                    onMouseEnter={() => setHoveredStopId(stop.id)}
                    onMouseLeave={() => setHoveredStopId((prev) => (prev === stop.id ? null : prev))}
                    className={`rounded-xl transition-all cursor-grab active:cursor-grabbing ${
                      draggedIndex === index ? 'opacity-40 scale-95' : ''
                    }`}
                    style={{
                      background: dragOverIndex === index ? `${accentColor}15` : 'var(--bg-input)',
                      border:
                        dragOverIndex === index
                          ? `2px dashed ${accentColor}`
                          : '1px solid var(--border-subtle)',
                      padding: expanded ? '8px 8px 0' : '8px 8px',
                    }}
                  >
                    <div className="flex items-center gap-2 min-h-[56px] px-2 py-0">
                      <GripVertical className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: accentColor, color: 'white' }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <AddressAutocomplete
                          value={stop.address}
                          onChange={(value) => updateStopAddr(stop.id, value)}
                          onSelect={(result) => {
                            if (result.lat && result.lng)
                              updateStopAddr(stop.id, result.displayString, result.lat, result.lng);
                          }}
                          placeholder="Property address"
                          darkMode={darkMode}
                          inputBg={inputBg}
                          textColor={textColor}
                          mutedText={mutedText}
                          borderColor={borderColor}
                          className="w-full min-w-0 [&_input]:truncate"
                          readOnly={stop.geocoded}
                          hideIcon
                          onInputBlur={() => maybeGeocodeOnBlurForStopId(stop.id)}
                          onEnter={() => maybeGeocodeOnBlurForStopId(stop.id)}
                        />
                      </div>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className="p-1 rounded-lg shrink-0 transition-opacity hover:opacity-80"
                        title={expanded ? 'Collapse' : 'Expand'}
                        style={{ color: 'var(--text-muted)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStopRowExpanded(stop.id, stop.lat ?? undefined, stop.lng ?? undefined);
                        }}
                      >
                        {expanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {stops.length > 0 ? (
                        <button
                          type="button"
                          title="Remove property"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStop(stop.id);
                          }}
                          className="p-1 rounded-lg shrink-0 transition-opacity hover:opacity-80"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>

                    {expanded ? (
                      <div
                        className="px-2 pb-3 pt-4 mt-1 border-t border-[var(--border-subtle)] space-y-4 overflow-x-hidden"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
                            style={{ color: textMuted }}
                          >
                            Time on-site
                          </span>
                          <select
                            value={stop.showingDuration}
                            onChange={(e) =>
                              updateStopDetail(stop.id, {
                                showingDuration: parseInt(e.target.value, 10) || 30,
                              })
                            }
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold min-w-[4.5rem]"
                            style={{
                              background: 'var(--bg-panel)',
                              border: '1px solid var(--border-subtle)',
                              color: textMain,
                            }}
                          >
                            {[15, 20, 30, 45, 60].map((m) => (
                              <option key={m} value={m}>
                                {m}m
                              </option>
                            ))}
                          </select>
                          {!stop.showingEnabled ? (
                            <button
                              type="button"
                              className="text-[11px] font-semibold underline underline-offset-2 hover:opacity-80"
                              style={{ color: textMuted }}
                              onClick={() => {
                                updateStopDetail(stop.id, {
                                  showingEnabled: true,
                                  showingStart: stop.showingStart || '10:00',
                                  showingEnd: stop.showingEnd || '14:00',
                                });
                                setShowingExpandedStopId(stop.id);
                              }}
                            >
                              Add showing time
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors hover:opacity-80"
                              style={{
                                background: 'var(--bg-panel)',
                                border: '1px solid var(--border-subtle)',
                                color: textMain,
                              }}
                              onClick={() =>
                                setShowingExpandedStopId((p) => (p === stop.id ? null : stop.id))
                              }
                            >
                              {stop.showingStart && stop.showingEnd
                                ? `${stop.showingStart}–${stop.showingEnd}`
                                : 'Set showing times'}
                            </button>
                          )}
                        </div>

                        {stop.showingEnabled && showingExpandedStopId === stop.id ? (
                          <div
                            className="p-2 rounded-xl"
                            style={{
                              background: 'var(--bg-widget)',
                              border: '1px solid var(--border-subtle)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span
                                className="text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: textMuted }}
                              >
                                Showing window
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-[10px] font-semibold px-2 py-1 rounded-lg hover:opacity-80"
                                  style={{
                                    background: 'var(--bg-panel)',
                                    border: '1px solid var(--border-subtle)',
                                    color: textMuted,
                                  }}
                                  onClick={() => {
                                    updateStopDetail(stop.id, {
                                      showingEnabled: false,
                                      showingStart: '',
                                      showingEnd: '',
                                    });
                                    setShowingExpandedStopId(null);
                                  }}
                                >
                                  Remove
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowingExpandedStopId(null)}
                                  className="text-[10px] font-semibold px-2 py-1 rounded-lg hover:brightness-110 transition-all"
                                  style={{
                                    background: `${accentColor}12`,
                                    border: `1px solid ${accentColor}25`,
                                    color: accentColor,
                                  }}
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-semibold" style={{ color: textMuted }}>
                                  Start
                                </label>
                                <input
                                  type="time"
                                  value={stop.showingStart || ''}
                                  onChange={(e) =>
                                    updateStopDetail(stop.id, { showingStart: e.target.value })
                                  }
                                  className="w-full mt-1 px-2 py-1.5 rounded-lg text-[11px]"
                                  style={{
                                    background: inputBg,
                                    border: `1px solid ${borderColor}`,
                                    color: textMain,
                                  }}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold" style={{ color: textMuted }}>
                                  End
                                </label>
                                <input
                                  type="time"
                                  value={stop.showingEnd || ''}
                                  onChange={(e) =>
                                    updateStopDetail(stop.id, { showingEnd: e.target.value })
                                  }
                                  className="w-full mt-1 px-2 py-1.5 rounded-lg text-[11px]"
                                  style={{
                                    background: inputBg,
                                    border: `1px solid ${borderColor}`,
                                    color: textMain,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {routeResult && stop.eta ? (
                          <p className="text-xs" style={{ color: textMuted }}>
                            Agent ETA on-site:{` `}
                            <span style={{ color: textMain }}>
                              {stop.eta.toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </p>
                        ) : null}

                        {geo ? (
                          <>
                            <NeighborhoodInlineSummary lat={stop.lat!} lng={stop.lng!} />
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                className="text-sm font-medium inline-flex items-center gap-1 transition-colors hover:underline"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = accentColor;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                onClick={() => {
                                  if (stop.lat == null || stop.lng == null) return;
                                  void ensureNeighborhoodCached(stop.lat, stop.lng);
                                  setNearbyDrawer({
                                    stopId: stop.id,
                                    address: stop.address?.trim() || `Stop ${index + 1}`,
                                    lat: stop.lat,
                                    lng: stop.lng,
                                  });
                                }}
                              >
                                View nearby
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs" style={{ color: textMuted }}>
                            Geocode the address to see nearby points of interest.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                      );
                    })}

                {stops.length < maxStops ? (
                  <button
                    type="button"
                    onClick={addListing}
                    className="w-full mt-2 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-black/5"
                    style={{ border: '1px dashed var(--border-default)', color: textMuted }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add property
                  </button>
                ) : null}
                {days.length === 1 ? (
                  <button
                    type="button"
                    onClick={addSecondTourDayFromStopsLink}
                    className="w-full mt-1 py-2 text-xs font-medium text-center underline underline-offset-2 hover:opacity-80"
                    style={{ color: textMuted }}
                  >
                    + Add a second day
                  </button>
                ) : null}
                  </>
                )}
              </div>
            ) : sidebarView === 'route' ? (
              <div className="space-y-3">
                {days.length === 1 && staleByDayId[activeDay.id] ? (
                  <div className="flex justify-center -mt-1 mb-1">
                    <span
                      title="Stops or depart time changed. Recalculate to update."
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        color: '#b45309',
                      }}
                    >
                      Out of date
                    </span>
                  </div>
                ) : null}
                {days.length >= 2 && staleByDayId[activeDay.id] ? (
                  <div className="flex justify-center -mt-1 mb-1">
                    <span
                      title="Stops or depart time changed. Recalculate to update."
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        color: '#b45309',
                      }}
                    >
                      Out of date
                    </span>
                  </div>
                ) : null}
                {routeResult ? (
                  <>
                    <div className="p-4 rounded-2xl text-center" style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}22` }}>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="p-3 rounded-xl" style={{ background: bgWidget, border: `1px solid var(--border-subtle)` }}>
                          <Route className="w-4 h-4 mx-auto mb-1" style={{ color: textMuted }} />
                          <div className="text-2xl font-bold">{routeResult.totalDistance.toFixed(1)} mi</div>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: bgWidget, border: `1px solid var(--border-subtle)` }}>
                          <Clock className="w-4 h-4 mx-auto mb-1" style={{ color: textMuted }} />
                          <div className="text-2xl font-bold">{formatTimeMin(routeTotals.total)}</div>
                          <div className="text-[10px]" style={{ color: textMuted }}>
                            {formatTimeMin(routeTotals.driveTime)} driving + {routeTotals.onSite}m on-site
                          </div>
                        </div>
                      </div>
                      {routeTotals.conflictCount > 0 ? (
                        <span className="inline-block px-2 py-1 rounded-full text-[11px] font-medium bg-red-500/15 text-red-400">
                          {routeTotals.conflictCount} behind schedule conflict(s)
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: textMuted }}>
                          Tour starts at {activeDay.departureTime} · {activeDay.date}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {routeResult.legs.map((leg, i) => (
                        <div
                          key={i}
                          className="rounded-xl p-3"
                          style={{ background: 'var(--bg-input)', border: `1px solid var(--border-subtle)` }}
                        >
                          <div className="flex items-center gap-2 text-[11px] font-semibold flex-wrap">
                            <span style={{ color: textMain }}>
                              {listingSequenceNumber(stops, validStops[i]!)}→
                              {listingSequenceNumber(stops, validStops[i + 1]!)}
                            </span>
                            <ArrowRight className="w-3 h-3" style={{ color: textMuted }} />
                            <span className="truncate flex-1" style={{ color: textMain }}>
                              {leg.from} → {leg.to}
                            </span>
                            {trafficBadge(leg.trafficCondition)}
                          </div>
                          <div className="text-[11px] mt-2" style={{ color: textMuted }}>
                            {leg.distance.toFixed(1)} mi · {formatTimeMin(leg.time)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 rounded-xl" style={{ background: 'var(--bg-panel)', border: `1px solid var(--border-subtle)` }}>
                      <div className="text-[11px] font-semibold uppercase mb-2" style={{ color: textMuted }}>
                        Agent arrivals
                      </div>
                      {validStops.map((vs) => (
                        <div key={vs.id} className="flex justify-between text-[11px] py-1" style={{ color: textMain }}>
                          <span className="truncate pr-2">#{listingSequenceNumber(stops, vs)}</span>
                          <span>{vs.eta?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—'}</span>
                        </div>
                      ))}
                    </div>

                    <div
                      className="p-4 rounded-xl"
                      style={{ border: `1px solid var(--border-subtle)`, background: 'var(--bg-input)' }}
                    >
                      <Timer className="w-8 h-8 mb-2" style={{ color: textMuted }} />
                      <p className="text-[11px] font-semibold uppercase mb-2" style={{ color: textMuted }}>
                        Tour economics (today)
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-[12px]" style={{ color: textMain }}>
                        <div>
                          Total drive time:{' '}
                          <strong>{formatTimeMin(routeResult.totalTime)}</strong>
                        </div>
                        <div>
                          Drive distance: <strong>{`${routeResult.totalDistance.toFixed(1)} mi`}</strong>
                        </div>
                        <div>
                          Est. fuel:{' '}
                          <strong>
                            {estimatedFuelGal != null && fuelCostUsd != null
                              ? `${estimatedFuelGal.toFixed(2)} gal · ~$${fuelCostUsd.toFixed(2)}`
                              : '—'}
                          </strong>
                        </div>
                        <div>
                          IRS deduction:{' '}
                          <strong>{irsUsd != null ? `$${irsUsd.toFixed(2)}` : '—'}</strong>{' '}
                          <span className="text-[10px]" style={{ color: textMuted }}>
                            @ ${irsRate}/mi
                          </span>
                        </div>
                      </div>
                    </div>

                    {originalRoute &&
                    optimizedOnceByDayId[activeDayId] &&
                    (routeResult.totalTime < originalRoute.time ||
                      routeResult.totalDistance < originalRoute.distance) ? (
                      <div
                        className="p-4 rounded-xl"
                        style={{
                          border: `1px solid #22c55e35`,
                          background: 'linear-gradient(135deg, #22c55e14 0%, transparent)',
                        }}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingDown className="w-5 h-5 text-green-500" />
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                            Vs. order before optimizing
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: textMain }}>
                          {routeResult.totalTime < originalRoute.time ? (
                            <span>
                              Time saved ~<strong>{formatTimeMin(originalRoute.time - routeResult.totalTime)}</strong>
                            </span>
                          ) : null}
                          {routeResult.totalDistance < originalRoute.distance ? (
                            <span>
                              Miles saved <strong>{(originalRoute.distance - routeResult.totalDistance).toFixed(1)} mi</strong>
                            </span>
                          ) : null}
                          {estimatedFuelGal != null && origFuelGal != null && estimatedFuelGal < origFuelGal ? (
                            <span>
                              Fuel saved ~<strong>{(origFuelGal - estimatedFuelGal).toFixed(2)} gal</strong>
                            </span>
                          ) : null}
                          {fuelCostUsd != null && origFuelCost != null && fuelCostUsd < origFuelCost ? (
                            <span>
                              Gas $ saved ~<strong>${(origFuelCost - fuelCostUsd).toFixed(2)}</strong>
                            </span>
                          ) : null}
                          {irsUsd != null && origIrsUsd != null ? (
                            <span className="col-span-2 text-[10px]" style={{ color: textMuted }}>
                              IRS delta (mileage differs): ~
                              {(irsUsd - origIrsUsd) >= 0 ? '+' : ''}
                              {(irsUsd - origIrsUsd).toFixed(2)} $
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-center py-16" style={{ color: textMuted }}>
                    Calculate a tour route to view drive legs, arrivals, and cost estimates.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="p-4 space-y-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {error ? (
              <div
                className="px-3 py-2 rounded-xl text-[12px] font-medium"
                style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}
              >
                {error}
              </div>
            ) : null}

            {!showOverviewMultiPanel && dayPanelError ? (
              <div
                className="px-3 py-2 rounded-xl text-[12px] flex flex-col gap-2"
                style={{
                  background: 'var(--color-error-bg)',
                  color: 'var(--color-error)',
                  border: '1px solid rgba(220,38,38,0.25)',
                }}
              >
                <span>{dayPanelError}</span>
                <button
                  type="button"
                  className="self-start text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                  style={{ color: 'var(--color-error)' }}
                  onClick={() => {
                    setDayPanelError(null);
                    void runCalculateActiveDay();
                  }}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {showOverviewMultiPanel ? (
              <button
                type="button"
                disabled={!tourHasEligibleStopPair || overviewRecalcAllBusy || optimizing}
                title={
                  !tourHasEligibleStopPair
                    ? 'Add stops to at least one day to calculate routes.'
                    : undefined
                }
                onClick={() => void recalculateAllDays()}
                className="prism-btn prism-btn-primary w-full justify-center py-3 text-sm hover:brightness-110 transition-all flex items-center"
                style={{
                  background: accentColor,
                  opacity:
                    !tourHasEligibleStopPair || overviewRecalcAllBusy || optimizing ? 0.42 : 1,
                }}
              >
                {overviewRecalcAllBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="ml-2">Working…</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-4 h-4" />
                    <span className="ml-2">
                      {hasAnyCalculatedDay ? 'Recalculate All Days' : 'Calculate Tour'}
                    </span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={panelRouteLoading || optimizing || validStops.length < 2}
                title={
                  validStops.length < 2
                    ? 'Add at least 2 stops to calculate a route.'
                    : undefined
                }
                onClick={() => void runCalculateActiveDay()}
                className="prism-btn prism-btn-primary w-full justify-center py-3 text-sm hover:brightness-110 transition-all flex items-center"
                style={{
                  background: accentColor,
                  opacity: panelRouteLoading || optimizing || validStops.length < 2 ? 0.42 : 1,
                }}
              >
                {panelRouteLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="ml-2">Calculating route…</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-4 h-4" />
                    <span className="ml-2">
                      {routeByDayId[activeDayId] != null ? 'Recalculate Day' : 'Calculate Day'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
          </div>
        </div>

        {overviewToast ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-5 z-[850] flex justify-center px-4"
            aria-live="polite"
          >
            <div
              className="listing-tour-overview-toast max-w-[min(100%,420px)] origin-center scale-[1.15] rounded-full border border-white/15 px-4 py-1.5 text-center text-[11px] font-semibold leading-snug text-white"
              style={{
                background: '#16a34a',
                boxShadow:
                  '0 10px 28px rgba(22, 101, 52, 0.45), 0 2px 8px rgba(0, 0, 0, 0.18)',
              }}
              role="status"
            >
              {overviewToast}
            </div>
          </div>
        ) : null}
      </div>

      {showBranding ? (
        <div className="prism-footer">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt={companyName || 'Company logo'}
              className="prism-footer-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <span aria-label="Powered by MapQuest">
            {companyName ? <span style={{ fontWeight: 600 }}>{companyName} · </span> : null}
            Powered by
          </span>
          <MapQuestPoweredLogo darkMode={darkMode} />
        </div>
      ) : null}
    </div>
  );
}