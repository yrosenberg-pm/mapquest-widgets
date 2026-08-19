'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Route, Bus as BusIcon } from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import {
  DEFAULT_PRESET,
  depots,
  fleetPresets,
  getActiveFleet,
  school,
  type PresetName,
} from '@/lib/data/bellevue';
import { busColor, hexToHsl } from '@/lib/busColors';
import { clearFleetMatrixCache } from '@/lib/fleet/matrix';
import { planFleet, replanFleet } from '@/lib/fleet/planFleet';
import { combinedFitBounds, shapeToPolyline } from '@/lib/fleet/sequencing';
import type { FleetPlanResult } from '@/lib/fleet/types';
import {
  depotMarkerHtml,
  homeStopMarkerHtml,
  schoolMarkerHtml,
} from '@/lib/mapMarkerIcons';

const ENDPOINT_MARKER_SIZE = 52 as const;
const PICKUP_MARKER_SIZE = 44 as const;

const PRESET_LABELS: Record<PresetName, string> = {
  two: '2 buses',
  three: '3 buses',
  five: '5 buses',
};

function formatDurationMinutes(seconds: number) {
  const minutes = seconds / 60;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function formatClockFromDeparture(departure: Date, offsetSec: number) {
  const t = new Date(departure.getTime() + offsetSec * 1000);
  return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
      {children}
    </span>
  );
}

export interface TruckRouteFleetViewProps {
  apiKey?: string;
  accentColor?: string;
  darkMode?: boolean;
  departure: Date;
}

export default function TruckRouteFleetView({
  apiKey = '',
  accentColor = '#0054A6',
  darkMode = false,
  departure,
}: TruckRouteFleetViewProps) {
  const [preset, setPreset] = useState<PresetName>(DEFAULT_PRESET);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<FleetPlanResult | null>(null);
  const [highlightedBusId, setHighlightedBusId] = useState<string | null>(null);
  const [hasMatrix, setHasMatrix] = useState(false);

  const textMain = darkMode ? '#F1F5F9' : 'var(--text-main)';
  const textMuted = darkMode ? '#A8B8CC' : 'var(--text-muted)';
  const bgWidget = darkMode ? 'rgba(26, 35, 50, 0.96)' : 'var(--bg-widget)';

  const accentHsl = useMemo(() => hexToHsl(accentColor), [accentColor]);
  const fleet = useMemo(() => getActiveFleet(preset), [preset]);
  const depotsById = useMemo(() => new Map(depots.map((d) => [d.depotId, d])), []);

  const busColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bus of fleet.activeBuses) {
      map.set(bus.busId, busColor(bus.colorIndex, accentHsl));
    }
    return map;
  }, [fleet.activeBuses, accentHsl]);

  const stopAssignment = useMemo(() => {
    const map = new Map<string, string>();
    if (!plan) return map;
    for (const [busId, stopIds] of Object.entries(plan.assignments)) {
      for (const stopId of stopIds) map.set(stopId, busId);
    }
    return map;
  }, [plan]);

  const stopNumberById = useMemo(() => {
    const map = new Map<string, number>();
    if (!plan) return map;
    for (const route of plan.routes) {
      route.stopIds.forEach((stopId, idx) => map.set(stopId, idx + 1));
    }
    return map;
  }, [plan]);

  const handlePlan = useCallback(
    async (replan = false) => {
      setError(null);
      setLoading(true);
      try {
        if (!replan) clearFleetMatrixCache();
        const result = replan
          ? await replanFleet({
              activeBuses: fleet.activeBuses,
              activeDepots: fleet.activeDepots,
              activeStops: fleet.activeStops,
              school,
              departure,
            })
          : await planFleet({
              activeBuses: fleet.activeBuses,
              activeDepots: fleet.activeDepots,
              activeStops: fleet.activeStops,
              school,
              departure,
            });
        setPlan(result);
        setHasMatrix(true);
        setHighlightedBusId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fleet planning failed.');
        if (!replan) setHasMatrix(false);
      } finally {
        setLoading(false);
      }
    },
    [fleet, departure],
  );

  const handlePresetChange = (next: PresetName) => {
    setPreset(next);
    setPlan(null);
    setHighlightedBusId(null);
    setHasMatrix(false);
    clearFleetMatrixCache();
  };

  const polylines = useMemo(() => {
    if (!plan) return [];
    return plan.routes
      .map((route) => {
        const coords = shapeToPolyline(route.shape);
        if (coords.length < 2) return null;
        const color = busColorById.get(route.busId) ?? accentColor;
        const dimmed = highlightedBusId != null && highlightedBusId !== route.busId;
        return {
          coords,
          color,
          weight: highlightedBusId === route.busId ? 6 : 4,
          opacity: dimmed ? 0.22 : 0.92,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [plan, busColorById, accentColor, highlightedBusId]);

  const markers = useMemo(() => {
    const out: {
      lat: number;
      lng: number;
      label: string;
      iconHtml: string;
      iconSize: [number, number];
      iconAnchor: [number, number];
      iconOpacity?: number;
      zIndexOffset?: number;
    }[] = [];

    for (const depot of fleet.activeDepots) {
      out.push({
        lat: depot.lat,
        lng: depot.lng,
        label: depot.name,
        iconHtml: depotMarkerHtml({ color: accentColor }),
        iconSize: [ENDPOINT_MARKER_SIZE, ENDPOINT_MARKER_SIZE],
        iconAnchor: [ENDPOINT_MARKER_SIZE / 2, ENDPOINT_MARKER_SIZE / 2],
        zIndexOffset: 1200,
      });
    }

    out.push({
      lat: school.lat,
      lng: school.lng,
      label: school.name,
      iconHtml: schoolMarkerHtml({ color: accentColor }),
      iconSize: [ENDPOINT_MARKER_SIZE, ENDPOINT_MARKER_SIZE],
      iconAnchor: [ENDPOINT_MARKER_SIZE / 2, ENDPOINT_MARKER_SIZE / 2],
      zIndexOffset: 1100,
    });

    if (!plan) return out;

    for (const stop of fleet.activeStops) {
      const busId = stopAssignment.get(stop.stopId);
      if (!busId) continue;
      if (highlightedBusId && highlightedBusId !== busId) continue;
      const color = busColorById.get(busId) ?? accentColor;
      const num = stopNumberById.get(stop.stopId) ?? '?';
      out.push({
        lat: stop.lat,
        lng: stop.lng,
        label: stop.name,
        iconHtml: homeStopMarkerHtml({ color, label: String(num) }),
        iconSize: [PICKUP_MARKER_SIZE, PICKUP_MARKER_SIZE],
        iconAnchor: [PICKUP_MARKER_SIZE / 2, PICKUP_MARKER_SIZE / 2],
        zIndexOffset: 800,
      });
    }

    return out;
  }, [fleet, plan, stopAssignment, stopNumberById, busColorById, accentColor, highlightedBusId]);

  const fitBounds = plan ? combinedFitBounds(plan.routes) : undefined;
  const totalRiders = fleet.activeStops.reduce((s, stop) => s + stop.riders, 0);
  const totalSeats = fleet.activeBuses.reduce((s, b) => s + b.capacity, 0);

  return (
    <div className="flex flex-col md:flex-row md:h-[720px]">
      <div
        className="w-full md:w-[400px] flex flex-col flex-shrink-0 border-t md:border-t-0 md:border-r md:order-1 min-h-[360px] md:min-h-0"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3 prism-scrollbar space-y-3">
          <div>
            <FieldLabel>Fleet size</FieldLabel>
            <div className="flex p-1 rounded-md gap-0.5 mt-1.5" style={{ background: 'var(--bg-input)' }}>
              {(Object.keys(fleetPresets) as PresetName[]).map((key) => {
                const active = preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePresetChange(key)}
                    className="flex-1 py-2 rounded-md text-xs font-semibold transition-colors"
                    style={{
                      background: active ? accentColor : 'transparent',
                      color: active ? '#fff' : textMain,
                    }}
                  >
                    {PRESET_LABELS[key]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-2 leading-snug" style={{ color: textMuted }}>
              {fleet.activeBuses.length} buses · {fleet.activeDepots.length} depots · {fleet.activeStops.length}{' '}
              stops · {totalRiders} riders · {totalSeats} seats (
              {Math.round((totalRiders / totalSeats) * 100)}% util.)
            </p>
          </div>

          {plan && (
            <>
              <div
                className="rounded-md p-3 text-sm space-y-1"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              >
                <p style={{ color: textMain }}>
                  <span className="font-semibold">Balance</span>
                </p>
                <p className="text-xs tabular-nums" style={{ color: textMuted }}>
                  Longest {formatDurationMinutes(plan.longestSec)} · Shortest{' '}
                  {formatDurationMinutes(plan.shortestSec)} · Spread {plan.balanceSpreadPct.toFixed(1)}%
                </p>
                <p className="text-[10px] tabular-nums" style={{ color: textMuted }}>
                  Matrix calls {plan.matrixCallCount} · Route calls {plan.optimizedRouteCallCount}
                </p>
              </div>

              <div className="space-y-2">
                <FieldLabel>Buses</FieldLabel>
                {plan.routes.map((route) => {
                  const bus = fleet.activeBuses.find((b) => b.busId === route.busId);
                  if (!bus) return null;
                  const depot = depotsById.get(bus.depotId);
                  const color = busColorById.get(bus.busId) ?? accentColor;
                  const selected = highlightedBusId === bus.busId;
                  return (
                    <button
                      key={bus.busId}
                      type="button"
                      onClick={() => setHighlightedBusId(selected ? null : bus.busId)}
                      className="w-full text-left rounded-md p-3 transition-colors"
                      style={{
                        background: selected ? 'color-mix(in srgb, var(--brand-primary) 12%, var(--bg-input))' : 'var(--bg-input)',
                        border: `1px solid ${selected ? accentColor : 'var(--border-subtle)'}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ background: color }}
                          aria-hidden
                        />
                        <span className="text-sm font-semibold" style={{ color: textMain }}>
                          {bus.label}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: textMuted }}>
                        {depot?.name ?? bus.depotId}
                      </p>
                      <p className="text-xs mt-1 tabular-nums" style={{ color: textMuted }}>
                        {route.stopIds.length} stops · {route.riders}/{bus.capacity} riders ·{' '}
                        {formatDurationMinutes(route.durationSec)} · School{' '}
                        {formatClockFromDeparture(departure, route.arrivalAtSchoolSec)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {error && (
            <div
              className="text-sm px-3 py-2.5 rounded-md border"
              style={{ color: textMain, background: 'var(--bg-input)', borderColor: 'var(--border-default)' }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-3 pb-3 pt-1 flex-shrink-0 space-y-2">
          <button
            type="button"
            onClick={() => handlePlan(false)}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-md text-sm font-semibold text-white disabled:opacity-60 shadow-sm"
            style={{ background: accentColor }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
            Plan fleet
          </button>
          {hasMatrix && (
            <button
              type="button"
              onClick={() => handlePlan(true)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold border disabled:opacity-60"
              style={{ color: textMain, borderColor: 'var(--border-subtle)', background: bgWidget }}
            >
              <BusIcon className="w-4 h-4" />
              Re-plan
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-[340px] md:min-h-0 md:order-2">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(0,0,0,0.35)' }}>
            <div className="px-6 py-4 rounded-lg flex items-center gap-4 shadow-2xl" style={{ background: 'var(--bg-widget)' }}>
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
              <span className="text-base font-medium" style={{ color: textMain }}>
                Planning fleet routes…
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
          polylines={polylines}
          showRoute={false}
          fitBounds={fitBounds}
          interactive
        />
      </div>
    </div>
  );
}
