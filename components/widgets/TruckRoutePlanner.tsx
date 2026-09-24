'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Truck,
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  Route,
  Settings2,
  List,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import MapQuestPoweredLogo from './MapQuestPoweredLogo';
import AddressAutocomplete from '../AddressAutocomplete';
import {
  truckRoute,
  parseTruckShapePoints,
  buildVisitOrder,
  remapTruckRouteToVisitOrder,
  truckRouteBoundingBoxToFitBounds,
  type TruckRouteCallResult,
  type TruckRouteOptions,
  type TruckRouteLocation,
} from '@/lib/mapquest';
import { buildTrafficRouteSegments } from '@/lib/truckRouteTrafficSegments';
import type { TruckRouteTraceState } from '@/lib/truckRoutePlannerTrace';
import {
  depotMarkerHtml,
  homeStopMarkerHtml,
  schoolMarkerHtml,
} from '@/lib/mapMarkerIcons';
import TruckRouteFleetView from './TruckRouteFleetView';

/** Deep blue route ribbon (Zonar brand) — traffic colors overlay this base. */
const ROUTE_LINE_BLUE = '#0054A6';

const ENDPOINT_MARKER_SIZE = 52 as const;
const PICKUP_MARKER_SIZE = 44 as const;

export interface TruckRoutePlannerProps {
  apiKey?: string;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  /** Gallery-only: streams API trace to the external panel. */
  onRouteTrace?: (trace: TruckRouteTraceState) => void;
}

type StopKind = 'start' | 'pickup' | 'end';
type SidebarView = 'vehicle' | 'stops' | 'options';
type PlannerMode = 'single' | 'fleet';

interface RouteStop {
  id: string;
  kind: StopKind;
  address: string;
}

interface VehicleDims {
  lengthFt: number;
  lengthIn: number;
  widthFt: number;
  widthIn: number;
  heightFt: number;
  heightIn: number;
  grossLb: number;
  axles: number;
}

interface ScheduleRow {
  label: string;
  address: string;
  arrive: Date;
  depart: Date;
}

interface VehiclePreset {
  id: string;
  label: string;
  dims: VehicleDims;
}

export const DEMO_START = '12025 NE 5th St, Bellevue, WA';
export const DEMO_END = '14310 SE 12th St, Bellevue, WA';
export const DEMO_PICKUPS = [
  '825 156th Ave SE, Bellevue, WA',
  '1215 156th Ave SE, Bellevue, WA',
  '1425 156th Ave SE, Bellevue, WA',
  '15420 SE 16th St, Bellevue, WA',
  '15020 SE 16th St, Bellevue, WA',
  '14840 SE 16th St, Bellevue, WA',
  '1610 145th Pl SE, Bellevue, WA',
];

const VEHICLE_PRESETS: VehiclePreset[] = [
  {
    id: 'school-bus',
    label: '72-passenger school bus',
    dims: { lengthFt: 40, lengthIn: 0, widthFt: 8, widthIn: 0, heightFt: 10, heightIn: 8, grossLb: 33000, axles: 2 },
  },
  {
    id: 'cargo-van',
    label: 'Cargo van',
    dims: { lengthFt: 19, lengthIn: 0, widthFt: 7, widthIn: 0, heightFt: 8, heightIn: 0, grossLb: 9000, axles: 2 },
  },
  {
    id: 'class-8',
    label: 'Class 8 tractor',
    dims: { lengthFt: 72, lengthIn: 0, widthFt: 8, widthIn: 6, heightFt: 13, heightIn: 6, grossLb: 80000, axles: 5 },
  },
];

function feetInchesToInches(ft: number, inches: number) {
  return Math.max(0, Math.round(ft * 12 + inches));
}

function defaultDeparture(): Date {
  const d = new Date();
  d.setHours(7, 16, 0, 0);
  return d;
}

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

function formatMapQuestDate(dt: Date) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function formatLocalTime(dt: Date) {
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function formatClock(dt: Date) {
  return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDurationMinutes(minutes: number) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function makeDemoStops(): RouteStop[] {
  const pickups = DEMO_PICKUPS.map((address, i) => ({
    id: `pickup-${i}`,
    kind: 'pickup' as const,
    address,
  }));
  return [{ id: 'start', kind: 'start', address: DEMO_START }, ...pickups, { id: 'end', kind: 'end', address: DEMO_END }];
}

function locationDisplay(loc?: TruckRouteLocation, fallback?: string) {
  if (!loc) return fallback || '—';
  const parts = [loc.street, loc.adminArea5, loc.adminArea3].filter(Boolean);
  return parts.join(', ') || fallback || loc.unknownInput || '—';
}

function pickupListNumber(stops: RouteStop[], locIdx: number): number | null {
  const stop = stops[locIdx];
  if (!stop || stop.kind !== 'pickup') return null;
  const pickups = stops.filter((s) => s.kind === 'pickup');
  const idx = pickups.findIndex((s) => s.id === stop.id);
  return idx >= 0 ? idx + 1 : null;
}

function buildSchedule(params: {
  departure: Date;
  dwellSec: number;
  legs: { time: number }[];
  visitOrder: number[];
  stops: RouteStop[];
  resolvedLocations: TruckRouteLocation[];
}): ScheduleRow[] {
  const { departure, dwellSec, legs, visitOrder, stops, resolvedLocations } = params;
  let cursor = new Date(departure);
  const rows: ScheduleRow[] = [];

  for (let i = 0; i < visitOrder.length; i++) {
    const locIdx = visitOrder[i];
    const isStart = i === 0;
    const isEnd = i === visitOrder.length - 1;
    const arrive = new Date(cursor);
    const isPickup = !isStart && !isEnd;
    const depart = new Date(arrive.getTime() + (isPickup ? dwellSec * 1000 : 0));

    const pickupNum = isPickup ? pickupListNumber(stops, locIdx) : null;

    rows.push({
      label: isStart ? 'Start' : isEnd ? 'End' : `Pickup ${pickupNum ?? i}`,
      address: locationDisplay(resolvedLocations[locIdx], stops[locIdx]?.address),
      arrive,
      depart,
    });

    if (i < legs.length) {
      // MapQuest v2 leg.time is seconds (same as route.time / realTime).
      cursor = new Date(depart.getTime() + legs[i].time * 1000);
    }
  }

  return rows;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
      {children}
    </span>
  );
}

export default function TruckRoutePlanner({
  apiKey = '',
  accentColor = '#0054A6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  borderRadius = '1rem',
  onRouteTrace,
}: TruckRoutePlannerProps) {
  const [stops, setStops] = useState<RouteStop[]>(makeDemoStops);
  const [pickupsExpanded, setPickupsExpanded] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>('vehicle');
  const [vehicle, setVehicle] = useState<VehicleDims>(VEHICLE_PRESETS[0].dims);
  const [presetId, setPresetId] = useState(VEHICLE_PRESETS[0].id);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [departure, setDeparture] = useState<Date>(defaultDeparture);
  const [departureDate, setDepartureDate] = useState(() => {
    const d = defaultDeparture();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  });
  const [departureTime, setDepartureTime] = useState('07:16');
  const [useTraffic, setUseTraffic] = useState(true);
  const [dwellSec, setDwellSec] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<TruckRouteCallResult | null>(null);
  const [plannerMode, setPlannerMode] = useState<PlannerMode>('single');

  const [draggedPickupId, setDraggedPickupId] = useState<string | null>(null);
  const [dragOverPickupId, setDragOverPickupId] = useState<string | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(event.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [presetMenuOpen]);

  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-500/60' : 'border-gray-200';
  const textMain = darkMode ? '#F1F5F9' : 'var(--text-main)';
  const textMuted = darkMode ? '#A8B8CC' : 'var(--text-muted)';
  const bgWidget = darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)';

  const syncDepartureFromFields = useCallback((dateStr: string, timeStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return;
    setDeparture(new Date(y, m - 1, d, hh, mm, 0, 0));
  }, []);

  const vehicleInches = useMemo(
    () => ({
      length: feetInchesToInches(vehicle.lengthFt, vehicle.lengthIn),
      width: feetInchesToInches(vehicle.widthFt, vehicle.widthIn),
      height: feetInchesToInches(vehicle.heightFt, vehicle.heightIn),
    }),
    [vehicle],
  );

  const buildOptions = useCallback((): TruckRouteOptions => {
    const [y, m, d] = departureDate.split('-').map(Number);
    const [hh, mm] = departureTime.split(':').map(Number);
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    syncDepartureFromFields(departureDate, departureTime);

    return {
      routeType: 'TRUCK',
      unit: 'm',
      narrativeType: 'none',
      manMaps: true,
      timeType: 2,
      useTraffic,
      shapeFormat: 'raw',
      fullShape: true,
      date: formatMapQuestDate(dt),
      localTime: formatLocalTime(dt),
      vehicleLength: vehicleInches.length,
      vehicleWidth: vehicleInches.width,
      vehicleHeight: vehicleInches.height,
      vehicleWeightTotal: vehicle.grossLb,
      vehicleAxleWeight: `${vehicle.axles}:${vehicle.grossLb}`,
    };
  }, [departureDate, departureTime, useTraffic, vehicle, vehicleInches, syncDepartureFromFields]);

  const emitTrace = useCallback(
    (trace: TruckRouteTraceState) => {
      onRouteTrace?.(trace);
    },
    [onRouteTrace],
  );

  const handleGetRoute = async () => {
    setError(null);
    setLoading(true);
    setRouteResult(null);
    emitTrace({ loading: true, result: null, error: null });

    const addresses = stops.map((s) => s.address.trim()).filter(Boolean);
    if (addresses.length < 2) {
      const msg = 'Enter a start and end, or load the Bellevue demo route.';
      setError(msg);
      emitTrace({ loading: false, result: null, error: msg });
      setLoading(false);
      return;
    }

    try {
      const options = buildOptions();
      const result = await truckRoute({
        locations: addresses,
        options,
        optimized: true,
      });

      const status = result.data.info?.statuscode;
      if (status !== undefined && status !== 0) {
        const msgs = result.data.info?.messages?.join(' ') || 'Route request failed.';
        const msg = `API status ${status}: ${msgs}`;
        setError(msg);
        emitTrace({ loading: false, result, error: msg });
      } else if (!result.data.route?.shape?.shapePoints?.length) {
        const msg = 'No route geometry returned.';
        setError(msg);
        emitTrace({ loading: false, result, error: msg });
      } else {
        let finalResult = result;
        const visitOrder = buildVisitOrder(addresses.length, result.data.route?.locationSequence);
        const wasReordered = visitOrder.some((idx, i) => idx !== i);

        if (wasReordered && result.data.route) {
          finalResult = {
            ...result,
            data: {
              ...result.data,
              route: remapTruckRouteToVisitOrder(result.data.route, visitOrder),
            },
          };
          setStops((prev) => visitOrder.map((i) => prev[i]));
        }

        emitTrace({ loading: false, result: finalResult, error: null });
        setRouteResult(finalResult);
        setSidebarView('stops');
        return;
      }

      setRouteResult(result);
      setSidebarView('stops');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to calculate route';
      setError(msg);
      emitTrace({ loading: false, result: null, error: msg });
    } finally {
      setLoading(false);
    }
  };

  const activePreset = VEHICLE_PRESETS.find((p) => p.id === presetId) ?? VEHICLE_PRESETS[0];

  const applyPreset = (id: string) => {
    const preset = VEHICLE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setVehicle({ ...preset.dims });
  };

  const pickupStops = stops.filter((s) => s.kind === 'pickup');
  const endStop = stops.find((s) => s.kind === 'end');

  const addPickup = () => {
    if (!endStop) return;
    const endIdx = stops.findIndex((s) => s.id === endStop.id);
    const next: RouteStop = { id: `pickup-${Date.now()}`, kind: 'pickup', address: '' };
    setStops((prev) => [...prev.slice(0, endIdx), next, ...prev.slice(endIdx)]);
    setPickupsExpanded(true);
  };

  const removePickup = (id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id || s.kind !== 'pickup'));
  };

  const updateStopAddress = (id: string, address: string) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, address } : s)));
  };

  const reorderPickups = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setStops((prev) => {
      const start = prev.find((s) => s.kind === 'start');
      const end = prev.find((s) => s.kind === 'end');
      if (!start || !end) return prev;
      const pickups = prev.filter((s) => s.kind === 'pickup');
      const fromIdx = pickups.findIndex((p) => p.id === fromId);
      const toIdx = pickups.findIndex((p) => p.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const nextPickups = [...pickups];
      const [moved] = nextPickups.splice(fromIdx, 1);
      nextPickups.splice(toIdx, 0, moved);
      return [start, ...nextPickups, end];
    });
  };

  const route = routeResult?.data.route;
  const visitOrder = buildVisitOrder(stops.length, route?.locationSequence);
  const shapePolyline = parseTruckShapePoints(route?.shape?.shapePoints);
  const fitBounds = truckRouteBoundingBoxToFitBounds(route?.boundingBox);
  const trafficRouteSegments = useMemo(() => {
    if (!route || !useTraffic) return [];
    return buildTrafficRouteSegments(route);
  }, [route, useTraffic]);
  const resolvedLocations = route?.locations ?? [];
  const legs = route?.legs ?? [];

  const schedule = useMemo(() => {
    if (!route || legs.length === 0) return [];
    return buildSchedule({
      departure,
      dwellSec,
      legs,
      visitOrder,
      stops,
      resolvedLocations,
    });
  }, [route, legs, departure, dwellSec, visitOrder, stops, resolvedLocations]);

  const pickupCount = pickupStops.length;
  const totalDwellMin = (pickupCount * dwellSec) / 60;
  const driveMin = (route?.realTime ?? route?.time ?? 0) / 60;
  const totalMiles = route?.distance ?? 0;
  const yardToBellMin =
    schedule.length >= 2
      ? (schedule[schedule.length - 1].arrive.getTime() - schedule[0].depart.getTime()) / 60000
      : 0;

  const markers = useMemo(() => {
    if (!route || resolvedLocations.length === 0) return [];
    return visitOrder
      .map((locIdx, runIdx) => {
        const loc = resolvedLocations[locIdx];
        const lat = loc?.latLng?.lat;
        const lng = loc?.latLng?.lng;
        if (lat == null || lng == null) return null;

        const isStart = runIdx === 0;
        const isEnd = runIdx === visitOrder.length - 1;
        const pickupNum = isStart || isEnd ? null : pickupListNumber(stops, locIdx);

        let iconHtml: string;
        let iconSize: [number, number];
        let iconAnchor: [number, number];
        const color = accentColor;

        if (isStart) {
          iconHtml = depotMarkerHtml({ color });
          iconSize = [ENDPOINT_MARKER_SIZE, ENDPOINT_MARKER_SIZE];
          iconAnchor = [ENDPOINT_MARKER_SIZE / 2, ENDPOINT_MARKER_SIZE / 2];
        } else if (isEnd) {
          iconHtml = schoolMarkerHtml({ color });
          iconSize = [ENDPOINT_MARKER_SIZE, ENDPOINT_MARKER_SIZE];
          iconAnchor = [ENDPOINT_MARKER_SIZE / 2, ENDPOINT_MARKER_SIZE / 2];
        } else {
          iconHtml = homeStopMarkerHtml({ color, label: String(pickupNum ?? runIdx) });
          iconSize = [PICKUP_MARKER_SIZE, PICKUP_MARKER_SIZE];
          iconAnchor = [PICKUP_MARKER_SIZE / 2, PICKUP_MARKER_SIZE / 2];
        }

        return {
          lat,
          lng,
          label: locationDisplay(loc, stops[locIdx]?.address),
          iconHtml,
          iconSize,
          iconAnchor,
          color,
          zIndexOffset: isStart ? 1200 : isEnd ? 1100 : 800,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m != null);
  }, [route, resolvedLocations, visitOrder, stops, accentColor]);

  const renderPickupRow = (stop: RouteStop, pickupIndex: number) => (
    <div
      key={stop.id}
      draggable
      onDragStart={(e) => {
        setDraggedPickupId(stop.id);
        dragNode.current = e.currentTarget as HTMLDivElement;
        setTimeout(() => {
          if (dragNode.current) dragNode.current.style.opacity = '0.5';
        }, 0);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (draggedPickupId && draggedPickupId !== stop.id) setDragOverPickupId(stop.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (draggedPickupId && draggedPickupId !== stop.id) reorderPickups(draggedPickupId, stop.id);
        setDragOverPickupId(null);
      }}
      onDragEnd={() => {
        if (dragNode.current) dragNode.current.style.opacity = '1';
        setDraggedPickupId(null);
        setDragOverPickupId(null);
        dragNode.current = null;
      }}
      className="rounded-md transition-all cursor-grab active:cursor-grabbing"
      style={{
        background: dragOverPickupId === stop.id ? `${accentColor}15` : 'var(--bg-input)',
        border: dragOverPickupId === stop.id ? `2px dashed ${accentColor}` : '1px solid var(--border-subtle)',
        padding: '12px 14px',
        opacity: draggedPickupId === stop.id ? 0.45 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        <GripVertical className="w-4 h-4 flex-shrink-0" style={{ color: textMuted }} />
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm"
          style={{ background: accentColor, color: 'white' }}
        >
          {pickupIndex + 1}
        </div>
        <div className="flex-1 min-w-0">
          <AddressAutocomplete
            value={stop.address}
            onChange={(value) => updateStopAddress(stop.id, value)}
            placeholder={`Pickup ${pickupIndex + 1}`}
            darkMode={darkMode}
            inputBg={inputBg}
            textColor={textColor}
            mutedText={mutedText}
            borderColor={borderColor}
            className="w-full"
            hideIcon
          />
        </div>
        {pickupStops.length > 1 && (
          <button
            type="button"
            onClick={() => removePickup(stop.id)}
            className="p-1 rounded-lg transition-colors hover:bg-black/10"
            style={{ color: textMuted }}
            aria-label="Remove pickup"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const tabBtn = (view: SidebarView, label: string, Icon: typeof Settings2) => (
    <button
      type="button"
      onClick={() => setSidebarView(view)}
      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-all hover:opacity-80"
      style={{
        background: sidebarView === view ? bgWidget : 'transparent',
        color: darkMode ? '#fff' : sidebarView === view ? accentColor : textMuted,
        boxShadow: sidebarView === view ? (darkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)') : 'none',
      }}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  const renderRouteDetails = () => {
    if (!route || schedule.length === 0) return null;
    return (
      <div className="space-y-3 mb-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Total miles', totalMiles.toFixed(2)],
            ['Drive time', formatDurationMinutes(driveMin)],
            ['Total dwell', formatDurationMinutes(totalDwellMin)],
            ['Yard to bell', formatDurationMinutes(yardToBellMin)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-md px-3 py-2.5 border"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textMuted }}>
                {label}
              </div>
              <div className="text-base font-semibold tabular-nums mt-0.5" style={{ color: textMain }}>
                {value}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs leading-snug rounded-md px-3 py-2.5" style={{ background: 'var(--bg-input)', color: textMain }}>
          <span className="font-semibold">Route notes</span>
          <span className="block mt-1" style={{ color: textMuted }}>
            {route.hasUTurn ? 'Includes at least one U-turn.' : 'No U-turns flagged.'}{' '}
            {route.hasDifficultTurn
              ? 'Some turns may be difficult for this vehicle.'
              : 'No difficult turns flagged.'}
          </span>
        </p>
      </div>
    );
  };

  return (
    <div
      className="prism-widget w-full md:w-[1180px] overflow-hidden"
      data-theme={darkMode ? 'dark' : 'light'}
      style={
        {
          fontFamily: fontFamily || 'var(--brand-font)',
          '--brand-primary': accentColor,
          borderRadius,
        } as CSSProperties
      }
    >
      <div
        className="prism-header flex items-center gap-4"
        style={{ padding: '12px 16px', overflow: 'visible', background: '#ffffff', borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1 overflow-visible">
          {companyLogo ? (
            <div
              className="flex-shrink-0 flex items-center justify-center"
              style={{ height: 40, minWidth: 0 }}
            >
              <img
                src={companyLogo}
                alt="Zonar"
                draggable={false}
                style={{ height: 40, width: 'auto', maxWidth: 'none', display: 'block' }}
              />
            </div>
          ) : (
            <div
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--brand-primary)', color: 'white' }}
            >
              <Truck className="w-5 h-5" />
            </div>
          )}
          <h2
            className="prism-header-title whitespace-nowrap min-w-0"
            style={{ fontSize: 18, lineHeight: '24px', fontWeight: 700, color: '#111827' }}
          >
            School Bus Route Planner
          </h2>
        </div>
        <div className="flex p-0.5 rounded-md gap-0.5 flex-shrink-0" style={{ background: 'var(--bg-input)' }}>
          {(
            [
              ['single', 'Single route'],
              ['fleet', 'Multi-bus'],
            ] as const
          ).map(([mode, label]) => {
            const active = plannerMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setPlannerMode(mode)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap"
                style={{
                  background: active ? accentColor : 'transparent',
                  color: active ? '#ffffff' : '#374151',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {plannerMode === 'fleet' ? (
        <TruckRouteFleetView apiKey={apiKey} accentColor={accentColor} darkMode={darkMode} departure={departure} />
      ) : (
      <div className="flex flex-col md:flex-row md:h-[720px]">
        <div
          className="w-full md:w-[400px] flex flex-col flex-shrink-0 border-t md:border-t-0 md:border-r md:order-1 min-h-[360px] md:min-h-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="px-3 pt-3 pb-2">
            <div className="flex p-1 rounded-md gap-0.5" style={{ background: 'var(--bg-input)' }}>
              {tabBtn('vehicle', 'Vehicle', Settings2)}
              {tabBtn('stops', 'Stops', List)}
              {tabBtn('options', 'Schedule', CalendarClock)}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 prism-scrollbar">
            {renderRouteDetails()}

            {sidebarView === 'vehicle' && (
              <div className="space-y-3">
                <div>
                  <FieldLabel>Preset</FieldLabel>
                  <div ref={presetMenuRef} className="relative mt-1.5">
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={presetMenuOpen}
                      onClick={() => setPresetMenuOpen((open) => !open)}
                      className="w-full flex items-center justify-between gap-2 pl-3 pr-3 py-2 rounded-lg border text-sm text-left transition-colors"
                      style={{
                        background: bgWidget,
                        borderColor: presetMenuOpen ? accentColor : 'var(--border-subtle)',
                        color: textMain,
                        boxShadow: presetMenuOpen ? `0 0 0 3px color-mix(in srgb, ${accentColor} 20%, transparent)` : undefined,
                      }}
                    >
                      <span className="truncate">{activePreset.label}</span>
                      <ChevronDown
                        className={`w-4 h-4 flex-shrink-0 transition-transform ${presetMenuOpen ? 'rotate-180' : ''}`}
                        style={{ color: textMuted }}
                        aria-hidden
                      />
                    </button>
                    {presetMenuOpen && (
                      <ul
                        role="listbox"
                        aria-label="Vehicle preset"
                        className="absolute z-50 left-0 right-0 mt-1 py-1 rounded-lg border overflow-hidden"
                        style={{
                          background: bgWidget,
                          borderColor: 'var(--border-subtle)',
                          boxShadow: 'var(--elevation-medium)',
                        }}
                      >
                        {VEHICLE_PRESETS.map((p) => {
                          const selected = p.id === presetId;
                          return (
                            <li key={p.id} role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  applyPreset(p.id);
                                  setPresetMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors"
                                style={{
                                  background: selected ? accentColor : 'transparent',
                                  color: selected ? '#ffffff' : textMain,
                                }}
                                onMouseEnter={(e) => {
                                  if (!selected) e.currentTarget.style.background = 'var(--bg-input)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!selected) e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                                  {selected ? <Check className="w-4 h-4" strokeWidth={2.5} /> : null}
                                </span>
                                <span className="truncate">{p.label}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['Length', 'lengthFt', 'lengthIn', vehicleInches.length],
                      ['Width', 'widthFt', 'widthIn', vehicleInches.width],
                      ['Height', 'heightFt', 'heightIn', vehicleInches.height],
                    ] as const
                  ).map(([label, ftKey, inKey, totalIn]) => (
                    <div
                      key={label}
                      className="rounded-md p-2.5"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                    >
                      <FieldLabel>{label}</FieldLabel>
                      <div className="mt-1.5 flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={vehicle[ftKey]}
                          onChange={(e) => setVehicle((v) => ({ ...v, [ftKey]: Number(e.target.value) || 0 }))}
                          className="w-full px-2 py-1.5 rounded-lg border text-sm"
                          style={{ background: bgWidget, borderColor: 'var(--border-subtle)', color: textMain }}
                        />
                        <span className="text-[10px] flex-shrink-0" style={{ color: textMuted }}>
                          ft
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={11}
                          value={vehicle[inKey]}
                          onChange={(e) => setVehicle((v) => ({ ...v, [inKey]: Number(e.target.value) || 0 }))}
                          className="w-full px-2 py-1.5 rounded-lg border text-sm"
                          style={{ background: bgWidget, borderColor: 'var(--border-subtle)', color: textMain }}
                        />
                        <span className="text-[10px] flex-shrink-0" style={{ color: textMuted }}>
                          in
                        </span>
                      </div>
                      <p className="text-[10px] mt-1 tabular-nums" style={{ color: textMuted }}>
                        {totalIn} in
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md p-2.5" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                    <FieldLabel>Gross (lb)</FieldLabel>
                    <input
                      type="number"
                      min={0}
                      value={vehicle.grossLb}
                      onChange={(e) => setVehicle((v) => ({ ...v, grossLb: Number(e.target.value) || 0 }))}
                      className="w-full mt-1.5 px-2 py-2 rounded-lg border text-sm"
                      style={{ background: bgWidget, borderColor: 'var(--border-subtle)', color: textMain }}
                    />
                  </div>
                  <div className="rounded-md p-2.5" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                    <FieldLabel>Axles</FieldLabel>
                    <input
                      type="number"
                      min={1}
                      max={9}
                      value={vehicle.axles}
                      onChange={(e) => setVehicle((v) => ({ ...v, axles: Number(e.target.value) || 1 }))}
                      className="w-full mt-1.5 px-2 py-2 rounded-lg border text-sm"
                      style={{ background: bgWidget, borderColor: 'var(--border-subtle)', color: textMain }}
                    />
                  </div>
                </div>
              </div>
            )}

            {sidebarView === 'options' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md p-2.5" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                    <FieldLabel>Departure date</FieldLabel>
                    <input
                      type="date"
                      value={departureDate}
                      onChange={(e) => {
                        setDepartureDate(e.target.value);
                        syncDepartureFromFields(e.target.value, departureTime);
                      }}
                      className="w-full mt-1.5 px-2 py-2 rounded-lg border text-sm"
                      style={{ background: bgWidget, borderColor: 'var(--border-subtle)', color: textMain }}
                    />
                  </div>
                  <div className="rounded-md p-2.5" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                    <FieldLabel>Departure time</FieldLabel>
                    <input
                      type="time"
                      value={departureTime}
                      onChange={(e) => {
                        setDepartureTime(e.target.value);
                        syncDepartureFromFields(departureDate, e.target.value);
                      }}
                      className="w-full mt-1.5 px-2 py-2 rounded-lg border text-sm"
                      style={{ background: bgWidget, borderColor: 'var(--border-subtle)', color: textMain }}
                    />
                  </div>
                </div>

                <div
                  className="rounded-md p-3 space-y-3"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: textMain }}>
                      Traffic on route ribbon
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={useTraffic}
                      aria-label="Traffic on route ribbon"
                      onClick={() => setUseTraffic((v) => !v)}
                      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-colors hover:opacity-90"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        background: useTraffic ? accentColor : bgWidget,
                      }}
                    >
                      <span
                        className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                        style={{ transform: useTraffic ? 'translateX(22px)' : 'translateX(2px)' }}
                      />
                    </button>
                  </div>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: textMain }}>
                      Dwell per pickup (sec)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={dwellSec}
                      onChange={(e) => setDwellSec(Number(e.target.value) || 0)}
                      className="w-20 px-2 py-1.5 rounded-lg border text-sm text-right tabular-nums"
                      style={{ background: bgWidget, borderColor: 'var(--border-subtle)', color: textMain }}
                    />
                  </label>
                </div>
              </div>
            )}

            {sidebarView === 'stops' && (
              <div className="space-y-2">
                {pickupCount > 0 && (
                  <div className="rounded-md overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => setPickupsExpanded((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left"
                      style={{ background: 'var(--bg-input)', color: textMain }}
                    >
                      <span className="text-sm font-medium">
                        {pickupCount} pickup{pickupCount === 1 ? '' : 's'}
                        {!pickupsExpanded ? ' · Bellevue, WA' : ''}
                      </span>
                      <span className="flex items-center gap-2">
                        {pickupsExpanded ? (
                          <ChevronUp className="w-4 h-4" style={{ color: textMuted }} />
                        ) : (
                          <ChevronDown className="w-4 h-4" style={{ color: textMuted }} />
                        )}
                      </span>
                    </button>
                    <div className="flex justify-end px-2 pb-1" style={{ background: 'var(--bg-input)' }}>
                      <button
                        type="button"
                        onClick={addPickup}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-black/5"
                        style={{ color: accentColor }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add pickup
                      </button>
                    </div>
                    {pickupsExpanded && (
                      <div className="p-3 space-y-2.5" style={{ background: 'var(--bg-panel)' }}>
                        {pickupStops.map((stop, i) => renderPickupRow(stop, i))}
                      </div>
                    )}
                  </div>
                )}

                {pickupCount === 0 && (
                  <button
                    type="button"
                    onClick={addPickup}
                    className="flex items-center gap-1.5 text-sm px-2 py-1.5 rounded-lg"
                    style={{ color: accentColor }}
                  >
                    <Plus className="w-4 h-4" />
                    Add pickup
                  </button>
                )}
              </div>
            )}

            {error && (
              <div
                className="mt-3 text-sm px-3 py-2.5 rounded-md border"
                style={{ color: textMain, background: 'var(--bg-input)', borderColor: 'var(--border-default)' }}
              >
                {error}
              </div>
            )}
          </div>

          <div className="px-3 pb-3 pt-1 flex-shrink-0">
            <button
              type="button"
              onClick={handleGetRoute}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-md text-sm font-semibold text-white disabled:opacity-60 shadow-sm"
              style={{ background: accentColor }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
              Get route
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-[340px] md:min-h-0 md:order-2">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(0,0,0,0.35)' }}>
              <div className="px-6 py-4 rounded-lg flex items-center gap-4 shadow-2xl" style={{ background: 'var(--bg-widget)' }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
                <span className="text-base font-medium" style={{ color: textMain }}>
                  Calculating truck route…
                </span>
              </div>
            </div>
          )}
          <MapQuestMap
            apiKey={apiKey}
            center={{ lat: 47.6101, lng: -122.2015 }}
            zoom={12}
            height="100%"
            className="h-full min-h-[340px] md:min-h-[720px]"
            darkMode={darkMode}
            accentColor={accentColor}
            markers={markers}
            routePolyline={
              trafficRouteSegments.length > 0
                ? undefined
                : shapePolyline.length > 0
                  ? shapePolyline
                  : undefined
            }
            routeSegments={trafficRouteSegments.length > 0 ? trafficRouteSegments : undefined}
            routeColor={ROUTE_LINE_BLUE}
            showRoute={Boolean(route && (shapePolyline.length > 0 || trafficRouteSegments.length > 0))}
            showTraffic={false}
            fitBounds={fitBounds}
            interactive
          />
        </div>
      </div>
      )}

      {plannerMode === 'single' && route && schedule.length > 0 && (
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div
            className="overflow-x-auto overflow-y-auto max-h-[280px] rounded-md border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: 'var(--bg-input)', color: textMuted }}>
                  <th className="text-left py-2.5 px-3 font-semibold sticky top-0" style={{ background: 'var(--bg-input)' }}>
                    Stop
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold sticky top-0" style={{ background: 'var(--bg-input)' }}>
                    Address
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold sticky top-0" style={{ background: 'var(--bg-input)' }}>
                    Arrive
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold sticky top-0" style={{ background: 'var(--bg-input)' }}>
                    Depart
                  </th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2.5 px-3 whitespace-nowrap font-medium" style={{ color: textMain }}>
                      {row.label}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: textMuted }}>
                      {row.address}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums" style={{ color: textMain }}>
                      {formatClock(row.arrive)}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums" style={{ color: textMain }}>
                      {formatClock(row.depart)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showBranding && (
        <div className="prism-footer" style={{ background: '#ffffff', borderTop: '1px solid #e5e7eb' }}>
          {companyLogo && (
            <img
              src={companyLogo}
              alt="Zonar"
              className="block flex-shrink-0"
              style={{ height: 24, width: 'auto', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span aria-label="Powered by MapQuest" style={{ color: '#6b7280' }}>
            {companyName && <span style={{ fontWeight: 600, color: '#374151' }}>{companyName} · </span>}
            Powered by
          </span>
          <MapQuestPoweredLogo darkMode={false} />
        </div>
      )}
    </div>
  );
}
