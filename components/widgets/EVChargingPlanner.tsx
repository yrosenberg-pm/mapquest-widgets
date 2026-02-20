'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BatteryCharging, Bolt, CheckCircle2, CircleDashed, Filter, Loader2, MapPin, PlugZap, Route, XCircle } from 'lucide-react';
import AddressAutocomplete from '../AddressAutocomplete';
import MapQuestMap from './MapQuestMap';
import WidgetHeader from './WidgetHeader';

type VehiclePresetId =
  | 'tesla-model-3'
  | 'tesla-model-y'
  | 'rivian-r1t'
  | 'rivian-r1s'
  | 'ford-mach-e'
  | 'hyundai-ioniq-5'
  | 'kia-ev6';

type VehiclePreset = {
  id: VehiclePresetId;
  name: string;
  batteryKWh: number;
  efficiencyMiPerKWh: number;
  port: 'NACS' | 'CCS';
  maxChargeKW: number;
};

const VEHICLES: VehiclePreset[] = [
  { id: 'tesla-model-3', name: 'Tesla Model 3', batteryKWh: 75, efficiencyMiPerKWh: 4.0, port: 'NACS', maxChargeKW: 250 },
  { id: 'tesla-model-y', name: 'Tesla Model Y', batteryKWh: 75, efficiencyMiPerKWh: 3.6, port: 'NACS', maxChargeKW: 250 },
  { id: 'rivian-r1t', name: 'Rivian R1T', batteryKWh: 135, efficiencyMiPerKWh: 2.2, port: 'CCS', maxChargeKW: 220 },
  // Tuned so max range ~= 400 mi (batteryKWh * efficiencyMiPerKWh).
  { id: 'rivian-r1s', name: 'Rivian R1S', batteryKWh: 140, efficiencyMiPerKWh: 2.85, port: 'CCS', maxChargeKW: 220 },
  { id: 'ford-mach-e', name: 'Ford Mustang Mach‑E', batteryKWh: 88, efficiencyMiPerKWh: 2.9, port: 'CCS', maxChargeKW: 150 },
  { id: 'hyundai-ioniq-5', name: 'Hyundai Ioniq 5', batteryKWh: 77, efficiencyMiPerKWh: 3.2, port: 'CCS', maxChargeKW: 235 },
  { id: 'kia-ev6', name: 'Kia EV6', batteryKWh: 77, efficiencyMiPerKWh: 3.1, port: 'CCS', maxChargeKW: 235 },
];

type Connector = 'CCS' | 'CHAdeMO' | 'J1772' | 'NACS';
type Availability = 'high' | 'medium' | 'low';

type Station = {
  id: string;
  name: string;
  network: string;
  lat: number;
  lng: number;
  stallCount: number;
  maxPowerKW: number;
  connectors: Connector[];
  // Charger availability is not always provided by the upstream dataset; we simulate when missing.
  availability: Availability;
  availableStalls: number;
  addressLine?: string;
};

type StopPoint = {
  type: 'origin' | 'charger' | 'destination';
  // The "slot" index in the planner (0-based) for charger stops. Used for skip/replace UX.
  planStopIndex?: number;
  name: string;
  lat: number;
  lng: number;
  arriveSoc: number;
  departSoc: number;
  chargeMinutes: number;
  station?: Station;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.7613; // miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function seeded01(seed: number) {
  // deterministic pseudo-rand [0,1)
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function availabilityFromStationId(idNum: number, stalls: number) {
  const r = seeded01(idNum * 97 + stalls * 13);
  const available = Math.max(0, Math.min(stalls, Math.round(r * stalls)));
  const ratio = stalls > 0 ? available / stalls : 0;
  const availability: Availability = ratio >= 0.6 ? 'high' : ratio >= 0.3 ? 'medium' : 'low';
  return { available, availability };
}

function colorForAvailability(a: Availability) {
  if (a === 'high') return '#22c55e';
  if (a === 'medium') return '#f59e0b';
  return '#ef4444';
}

function normalizeConnectorTitle(title?: string): Connector | null {
  const t = (title || '').toLowerCase();
  if (!t) return null;
  if (t.includes('ccs')) return 'CCS';
  if (t.includes('chademo')) return 'CHAdeMO';
  if (t.includes('j1772')) return 'J1772';
  if (t.includes('tesla') || t.includes('nacs')) return 'NACS';
  return null;
}

function normalizeNetworkTitle(title?: string): string {
  const t = (title || '').trim();
  const lower = t.toLowerCase();
  if (!t) return 'Unknown';
  if (lower.includes('tesla')) return 'Tesla';
  if (lower.includes('supercharger')) return 'Tesla';
  if (lower.includes('electrify america')) return 'Electrify America';
  if (lower.includes('chargepoint')) return 'ChargePoint';
  if (lower.includes('evgo')) return 'EVgo';
  if (lower.includes('shell')) return 'Shell Recharge';
  if (lower.includes('blink')) return 'Blink';
  if (lower.includes('volta')) return 'Volta';
  if (lower.includes('flo')) return 'FLO';
  if (lower.includes('sema') || lower.includes('sema connect')) return 'SemaConnect';
  if (lower.includes('greenlots') || lower.includes('shell recharge')) return 'Shell Recharge';
  if (lower.includes('chargepoint network')) return 'ChargePoint';
  if (lower.includes('electrifyamerica')) return 'Electrify America';
  // Normalize common noise
  if (lower === 'unknown' || lower === 'n/a' || lower === 'na') return 'Unknown';
  return t;
}

function inferNetworkFromName(name?: string): string | null {
  const n = (name || '').toLowerCase();
  if (!n) return null;
  if (n.includes('tesla')) return 'Tesla';
  if (n.includes('supercharger')) return 'Tesla';
  if (n.includes('electrify america') || n.includes('electrifyamerica')) return 'Electrify America';
  if (n.includes('chargepoint')) return 'ChargePoint';
  if (n.includes('evgo')) return 'EVgo';
  if (n.includes('shell')) return 'Shell Recharge';
  return null;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function svgDataUrl(svg: string) {
  // Encode as a data URL safe for <img src="...">.
  // Leaflet will embed this into a divIcon via <img>.
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function chargerBoltIconUrl(opts: { bg: string; ring?: string; size: number; selected?: boolean }) {
  const { bg, ring, size, selected } = opts;
  const stroke = ring || 'rgba(255,255,255,0.9)';
  const ringW = selected ? 3 : 2;
  const boltScale = selected ? 1.06 : 1.0;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="${bg}" stroke="${stroke}" stroke-width="${ringW}"/>
      <path d="M18.8 5.8 11.7 18.2h6.0l-2.5 8.0 7.1-12.4h-6.0l2.5-8.0z" fill="white"
        transform="scale(${boltScale}) translate(${(1 - boltScale) * 16}, ${(1 - boltScale) * 16})"/>
    </svg>
  `;
  return svgDataUrl(svg);
}

export default function EVChargingPlanner({
  apiKey,
  darkMode = false,
  accentColor = '#2563eb',
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: {
  apiKey: string;
  darkMode?: boolean;
  accentColor?: string;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
}) {
  const bgPanel = 'var(--bg-panel)';
  const border = 'var(--border-subtle)';
  const textMain = 'var(--text-main)';
  const textMuted = 'var(--text-muted)';

  const [tab, setTab] = useState<'map' | 'vehicle' | 'trip'>('trip');
  const [showFilters, setShowFilters] = useState(false);

  // Vehicle profile
  const [vehicleId, setVehicleId] = useState<VehiclePresetId>('tesla-model-y');
  const vehicle = useMemo(() => VEHICLES.find(v => v.id === vehicleId) || VEHICLES[0], [vehicleId]);
  const [chargeMode, setChargeMode] = useState<'soc' | 'miles'>('soc');
  // Tesla drivers commonly charge to ~80% day-to-day; use that as the default "full".
  const [socPercent, setSocPercent] = useState(80);
  const [milesRemaining, setMilesRemaining] = useState(180);
  const [arrivalReserveSoc, setArrivalReserveSoc] = useState(15); // target arrival %
  const [autoPlanToReserve, setAutoPlanToReserve] = useState(true);

  // Location / route
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [dest, setDest] = useState<{ lat: number; lng: number } | null>(null);
  const [routePolyline, setRoutePolyline] = useState<{ lat: number; lng: number }[] | null>(null);
  const [routeMiles, setRouteMiles] = useState<number | null>(null);
  const [routeSeconds, setRouteSeconds] = useState<number | null>(null);

  // Chargers
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const selectedStation = useMemo(() => stations.find(s => s.id === selectedStationId) || null, [stations, selectedStationId]);
  const [loadingStations, setLoadingStations] = useState(false);
  // Planning overrides
  const [excludedStationIds, setExcludedStationIds] = useState<string[]>([]);
  const [stopOverrides, setStopOverrides] = useState<Record<number, string>>({});
  const [replacingStopIdx, setReplacingStopIdx] = useState<number | null>(null);
  const [browseAllChargers, setBrowseAllChargers] = useState(false);
  const [skippedStopIdxs, setSkippedStopIdxs] = useState<number[]>([]);
  const [lastFetchMeta, setLastFetchMeta] = useState<{
    source?: string;
    providerUrl?: string;
    attemptSummary?: string;
    httpStatus?: number;
    errorMessage?: string;
    centerLabel?: string;
    radiusMiles?: number;
    total?: number;
    tesla?: number;
  } | null>(null);

  // Filters
  const [filterConnectors, setFilterConnectors] = useState<Record<Connector, boolean>>({
    CCS: true,
    CHAdeMO: false,
    J1772: true,
    NACS: true,
  });
  const [minPower, setMinPower] = useState(50);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [networkFilter, setNetworkFilter] = useState<string>('Tesla');

  // Trip results
  const [checking, setChecking] = useState(false);
  const [tripStatus, setTripStatus] = useState<'unknown' | 'ok' | 'needs-charge'>('unknown');
  const [arrivalSoc, setArrivalSoc] = useState<number | null>(null);
  const [shortByMiles, setShortByMiles] = useState<number | null>(null);

  const [planning, setPlanning] = useState(false);
  const [planStops, setPlanStops] = useState<StopPoint[] | null>(null);
  const [planSummary, setPlanSummary] = useState<{ driveMinutes: number; chargeMinutes: number; stops: number } | null>(null);
  const [basePlanStops, setBasePlanStops] = useState<StopPoint[] | null>(null);
  const [basePlanSummary, setBasePlanSummary] = useState<{ driveMinutes: number; chargeMinutes: number; stops: number } | null>(null);

  const skippedSet = useMemo(() => new Set(skippedStopIdxs), [skippedStopIdxs]);
  const showOnlyPlannedStopsInChargersTab = !!routePolyline && !browseAllChargers && replacingStopIdx == null;
  const showOnlyPlannedStopsOnMap = !!routePolyline && !browseAllChargers && replacingStopIdx == null;

  const recomputeStopsAfterSkips = (stops: StopPoint[], skip: Set<number>) => {
    if (!stops || stops.length < 2) return { stops, summary: planSummary };

    const factor = 1.08; // quick road-distance fudge vs straight-line
    const reserveMiles = (clamp(arrivalReserveSoc, 0, 80) / 100) * vehicle.batteryKWh * vehicle.efficiencyMiPerKWh;
    const out: StopPoint[] = [];

    // Ensure origin SOC reflects current inputs
    const originStop = stops[0];
    out.push({
      ...originStop,
      arriveSoc: currentSoc,
      departSoc: currentSoc,
      chargeMinutes: 0,
    });

    let totalChargeMinutes = 0;
    let chargeStops = 0;

    for (let i = 1; i < stops.length; i++) {
      const prev = out[i - 1];
      const curr = stops[i];
      const legMiles = haversineMiles(prev, curr) * factor;
      const kWhUsed = legMiles / vehicle.efficiencyMiPerKWh;
      const prevKWh = vehicle.batteryKWh * (prev.departSoc / 100);
      const arriveKWh = prevKWh - kWhUsed;
      const arriveSoc = (arriveKWh / vehicle.batteryKWh) * 100; // allow negative

      if (curr.type === 'charger') {
        const slot = typeof curr.planStopIndex === 'number' ? curr.planStopIndex : chargeStops;
        const isSkipped = skip.has(slot);
        chargeStops += 1;

        if (isSkipped) {
          out.push({ ...curr, arriveSoc, departSoc: arriveSoc, chargeMinutes: 0 });
          continue;
        }

        const next = stops[i + 1];
        const distToNext = next ? haversineMiles(curr, next) * factor : 0;
        const needMiles =
          distToNext * 1.1 + (next?.type === 'destination' ? reserveMiles : 0);
        const neededSoc = (needMiles / (vehicle.batteryKWh * vehicle.efficiencyMiPerKWh)) * 100;
        const targetSoc = clamp(Math.max(80, neededSoc), arriveSoc, 100);

        const neededKWh = vehicle.batteryKWh * ((targetSoc - arriveSoc) / 100);
        const chargerKW = Math.max(10, Math.min(vehicle.maxChargeKW, curr.station?.maxPowerKW ?? vehicle.maxChargeKW));
        const chargeMin = Math.max(0, (neededKWh / chargerKW) * 60);
        totalChargeMinutes += chargeMin;

        out.push({
          ...curr,
          arriveSoc,
          departSoc: targetSoc,
          chargeMinutes: Math.round(chargeMin),
        });
      } else {
        out.push({ ...curr, arriveSoc, departSoc: arriveSoc, chargeMinutes: 0 });
      }
    }

    const summary = {
      driveMinutes: basePlanSummary?.driveMinutes ?? (planSummary?.driveMinutes ?? (routeSeconds != null ? Math.round(routeSeconds / 60) : 0)),
      chargeMinutes: Math.round(totalChargeMinutes),
      stops: out.filter(s => s.type === 'charger' && s.chargeMinutes > 0).length,
    };
    return { stops: out, summary };
  };

  // Persist vehicle profile
  useEffect(() => {
    try {
      const raw = localStorage.getItem('evProfile');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.vehicleId) setVehicleId(p.vehicleId);
        if (p.chargeMode) setChargeMode(p.chargeMode);
        if (typeof p.socPercent === 'number') setSocPercent(p.socPercent);
        if (typeof p.milesRemaining === 'number') setMilesRemaining(p.milesRemaining);
        if (typeof p.arrivalReserveSoc === 'number') setArrivalReserveSoc(p.arrivalReserveSoc);
        if (typeof p.autoPlanToReserve === 'boolean') setAutoPlanToReserve(p.autoPlanToReserve);
      }
    } catch { /* ignore */ }
  }, []);

  // If user switches to a Tesla preset and they're at 100%, snap to the more realistic default (80%),
  // unless they've already explicitly set something else.
  const lastVehicleIdRef = useRef<VehiclePresetId>('tesla-model-y');
  useEffect(() => {
    const prev = lastVehicleIdRef.current;
    lastVehicleIdRef.current = vehicleId;
    const isTesla = vehicleId.startsWith('tesla-');
    if (!isTesla) return;
    if (chargeMode !== 'soc') return;
    // Only adjust when switching into Tesla from a different vehicle and the slider is at 100%.
    if (prev !== vehicleId && socPercent >= 99) {
      setSocPercent(80);
    }
  }, [vehicleId, chargeMode, socPercent]);

  useEffect(() => {
    try {
      localStorage.setItem('evProfile', JSON.stringify({ vehicleId, chargeMode, socPercent, milesRemaining, arrivalReserveSoc, autoPlanToReserve }));
    } catch { /* ignore */ }
  }, [vehicleId, chargeMode, socPercent, milesRemaining, arrivalReserveSoc, autoPlanToReserve]);

  const currentSoc = useMemo(() => {
    if (chargeMode === 'soc') return clamp(socPercent, 1, 100);
    const maxRange = vehicle.batteryKWh * vehicle.efficiencyMiPerKWh;
    return clamp((milesRemaining / maxRange) * 100, 1, 100);
  }, [chargeMode, socPercent, milesRemaining, vehicle]);

  const availableRangeMiles = useMemo(() => {
    return (vehicle.batteryKWh * (currentSoc / 100)) * vehicle.efficiencyMiPerKWh;
  }, [vehicle, currentSoc]);

  const reserveMiles = useMemo(() => {
    return (vehicle.batteryKWh * (clamp(arrivalReserveSoc, 0, 80) / 100)) * vehicle.efficiencyMiPerKWh;
  }, [vehicle, arrivalReserveSoc]);

  const vehicleConnectorOk = (s: Station) => {
    if (vehicle.port === 'NACS') {
      // Tesla can often use CCS with adapter in reality; keep simple and allow NACS + CCS
      return s.connectors.includes('NACS') || s.connectors.includes('CCS') || s.connectors.includes('J1772');
    }
    // CCS vehicles: allow CCS + J1772
    return s.connectors.includes('CCS') || s.connectors.includes('J1772');
  };

  const filteredStations = useMemo(() => {
    const activeConnectors = Object.entries(filterConnectors).filter(([, v]) => v).map(([k]) => k as Connector);
    return stations.filter(s => {
      if (networkFilter !== 'all' && s.network !== networkFilter) return false;
      if (onlyAvailable && s.availability === 'low') return false;
      if (s.maxPowerKW < minPower) return false;
      if (!vehicleConnectorOk(s)) return false;
      if (activeConnectors.length > 0 && !s.connectors.some(c => activeConnectors.includes(c))) return false;
      return true;
    });
  }, [stations, filterConnectors, minPower, onlyAvailable, networkFilter, vehicle]);

  const networks = useMemo(() => {
    return uniq(stations.map(s => s.network)).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [stations]);

  const networkCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stations) m.set(s.network, (m.get(s.network) || 0) + 1);
    return m;
  }, [stations]);

  const groupedNetworks = useMemo(() => {
    const majors = new Set(['Tesla', 'Electrify America', 'ChargePoint', 'EVgo', 'Shell Recharge', 'Blink', 'Volta', 'FLO', 'SemaConnect']);
    const known: string[] = [];
    const other: string[] = [];
    for (const n of networks) {
      if (n === 'Unknown') continue;
      if (majors.has(n)) known.push(n);
      else other.push(n);
    }
    known.sort((a, b) => (networkCounts.get(b) || 0) - (networkCounts.get(a) || 0));
    other.sort((a, b) => (networkCounts.get(b) || 0) - (networkCounts.get(a) || 0));
    return { majors: known, other, hasUnknown: networks.includes('Unknown') };
  }, [networks, networkCounts]);

  // Default to Tesla network when available; otherwise fall back to "All".
  useEffect(() => {
    // Keep Tesla as the default view (even if no Tesla stations are in the current dataset),
    // but allow the user to switch manually.
    if (networkFilter === 'Tesla') return;
    if (networkFilter !== 'all' && !networks.includes(networkFilter)) {
      setNetworkFilter('all');
    }
  }, [networks, networkFilter]);

  const fetchStationsNear = async (
    center: { lat: number; lng: number },
    opts?: { merge?: boolean; distanceMiles?: number; max?: number }
  ): Promise<Station[]> => {
    setLoadingStations(true);
    try {
      const distanceMiles = opts?.distanceMiles ?? 10;
      // HERE EV/Search endpoints cap limit to [1, 100]
      const max = clamp(opts?.max ?? 100, 1, 100);
      const radiusMeters = Math.round(distanceMiles * 1609.34);
      const q = networkFilter === 'Tesla' ? 'tesla supercharger' : 'ev charging station';
      const res = await fetch(`/api/here?endpoint=evchargers&at=${center.lat},${center.lng}&radiusMeters=${radiusMeters}&limit=${max}&q=${encodeURIComponent(q)}`);
      const json = await res.json();

      if (!res.ok) {
        const msg =
          (typeof json?.details === 'string' && json.details) ||
          (typeof json?.error === 'string' && json.error) ||
          `Request failed (${res.status})`;
        setLastFetchMeta({
          source: 'here',
          httpStatus: res.status,
          errorMessage: msg.slice(0, 220),
          radiusMiles: distanceMiles,
          total: 0,
          tesla: 0,
        });
        if (!opts?.merge) setStations([]);
        return [];
      }

      const attemptSummary = Array.isArray(json?.__debug?.attempts)
        ? json.__debug.attempts
            .slice(0, 3)
            .map((a: any) => `${String(a?.status ?? '')}`)
            .filter(Boolean)
            .join(', ')
        : undefined;

      // HERE responses vary depending on product entitlement:
      // - EV Charge Points: may include EVSE/connector/power/availability
      // - Search/Discover fallback: POI items (title/position), no EVSE details
      const items: any[] = Array.isArray(json.items) ? json.items : Array.isArray(json.chargepoints) ? json.chargepoints : [];

      const normalized: Station[] = items
        .map((it: any, idx: number) => {
          const pos = it.position || it.location?.position || it.address?.position || it.place?.location?.position;
          const lat = Number(pos?.lat ?? it.lat);
          const lng = Number(pos?.lng ?? it.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          const name = it.title || it.name || it.location?.name || 'Charging Station';
          // IMPORTANT: don't use address/id as a fallback "network" — that explodes the list and looks duplicated.
          const networkRaw =
            it.operator?.name ||
            it.operator?.title ||
            (typeof it.operator === 'string' ? it.operator : undefined) ||
            it.provider?.name ||
            it.provider?.title ||
            it.brand?.name ||
            it.brand?.title ||
            undefined;
          const inferred = inferNetworkFromName(name);
          const network = inferred || normalizeNetworkTitle(networkRaw);

          // Try EVSE-style structures
          const evses = Array.isArray(it.evses) ? it.evses : Array.isArray(it.evse) ? it.evse : Array.isArray(it.evseList) ? it.evseList : [];
          const plugs = Array.isArray(it.plugs) ? it.plugs : [];

          const connectors = uniq(
            [
              ...evses.flatMap((e: any) =>
                (Array.isArray(e.connectors) ? e.connectors : []).map((c: any) => normalizeConnectorTitle(c?.type || c?.connectorType || c?.title))
              ),
              ...plugs.map((p: any) => normalizeConnectorTitle(p?.type || p?.title)),
              normalizeConnectorTitle(it?.connectorType),
              network === 'Tesla' ? 'NACS' : null,
            ].filter(Boolean) as Connector[]
          );

          const maxPowerKW =
            Math.max(
              0,
              ...evses.flatMap((e: any) =>
                (Array.isArray(e.connectors) ? e.connectors : []).map((c: any) => Number(c?.powerKW ?? c?.power ?? c?.maxPowerKW ?? 0) || 0)
              ),
              ...plugs.map((p: any) => Number(p?.powerKW ?? p?.power ?? 0) || 0),
              Number(it?.powerKW ?? it?.maxPowerKW ?? 0) || 0
            ) || 50;

          const stallCount =
            Number(it?.stallCount ?? it?.numberOfPoints ?? it?.connectors?.length ?? it?.evseCount ?? 0) ||
            (Array.isArray(evses) ? evses.length : 0) ||
            4;

          // Availability if present, otherwise simulate
          const statusRaw = it?.availability?.status || it?.status || it?.state || null;
          const statusLower = String(statusRaw || '').toLowerCase();
          const hasRealTime =
            typeof it?.availability?.available === 'number' ||
            typeof it?.available === 'number' ||
            typeof it?.availability?.total === 'number';
          let availableStalls = Number(it?.availability?.available ?? it?.available ?? NaN);
          if (!Number.isFinite(availableStalls)) {
            const sim = availabilityFromStationId(Number(it?.id ?? idx) || Math.round(lat * 1000), Math.max(1, stallCount));
            availableStalls = sim.available;
          }
          let availability: Availability = 'medium';
          if (hasRealTime) {
            const ratio = stallCount > 0 ? availableStalls / stallCount : 0;
            availability = ratio >= 0.6 ? 'high' : ratio >= 0.3 ? 'medium' : 'low';
          } else if (statusLower.includes('unavailable') || statusLower.includes('closed') || statusLower.includes('out')) {
            availability = 'low';
          } else {
            availability = availabilityFromStationId(Number(it?.id ?? idx) || Math.round(lat * 1000), Math.max(1, stallCount)).availability;
          }

          const addressLine = it?.address?.label || it?.vicinity || it?.address?.city || '';

          return {
            id: String(it?.id || it?.chargingStationId || it?.place_id || `${lat},${lng}`),
            name,
            network,
            lat,
            lng,
            stallCount,
            maxPowerKW,
            connectors: connectors.length ? connectors : [network === 'Tesla' ? 'NACS' : 'CCS'],
            availability,
            availableStalls: clamp(Math.round(availableStalls), 0, stallCount),
            addressLine,
          } satisfies Station;
        })
        .filter(Boolean) as Station[];

      if (opts?.merge) {
        setStations((prev) => {
          const byId = new Map<string, Station>();
          prev.forEach((s) => byId.set(s.id, s));
          normalized.forEach((s) => byId.set(s.id, s));
          return Array.from(byId.values());
        });
      } else {
        setStations(normalized);
      }
      if (!selectedStationId && normalized[0]) setSelectedStationId(normalized[0].id);
      setLastFetchMeta({
        source: 'here',
        providerUrl: json?.__debug?.providerUrl,
        attemptSummary,
        httpStatus: res.status,
        radiusMiles: distanceMiles,
        total: normalized.length,
        tesla: normalized.filter(s => s.network === 'Tesla').length,
      });
      return normalized;
    } finally {
      setLoadingStations(false);
    }
  };

  const fetchStationsAlongRoute = async (polyline: { lat: number; lng: number }[], opts?: { distanceMiles?: number }) => {
    if (!polyline || polyline.length < 2) return;
    // Sample a few points along the route (including destination) and merge results.
    const idxs = uniq([
      0,
      Math.floor(polyline.length * 0.25),
      Math.floor(polyline.length * 0.5),
      Math.floor(polyline.length * 0.75),
      polyline.length - 1,
    ]).filter((i) => i >= 0 && i < polyline.length);

    const distanceMiles = opts?.distanceMiles ?? 10;
    const results = await Promise.all(
      idxs.map((i) => fetchStationsNear(polyline[i], { merge: true, distanceMiles, max: 100 }))
    );
    const byId = new Map<string, Station>();
    for (const list of results) for (const s of list) byId.set(s.id, s);
    return Array.from(byId.values());
  };

  const planTripWithRoute = async (route: { polyline: { lat: number; lng: number }[]; miles: number; seconds: number }) => {
    if (!origin || !dest) return;
    if (!route.polyline || route.polyline.length < 2) return;

    setPlanning(true);
    setPlanStops(null);
    setPlanSummary(null);
    setBasePlanStops(null);
    setBasePlanSummary(null);
    setSkippedStopIdxs([]);

    try {
      // Pull chargers along the route with a wider radius so the plan can stay feasible.
      const alongStations = (await fetchStationsAlongRoute(route.polyline, { distanceMiles: 25 })) || [];

      // Apply filters to the locally fetched list (don't rely on state being updated synchronously).
      const activeConnectors = Object.entries(filterConnectors).filter(([, v]) => v).map(([k]) => k as Connector);
      const excluded = new Set(excludedStationIds);
      const localFiltered = alongStations.filter((s) => {
        if (excluded.has(s.id)) return false;
        if (networkFilter !== 'all' && s.network !== networkFilter) return false;
        if (onlyAvailable && s.availability === 'low') return false;
        if (s.maxPowerKW < minPower) return false;
        if (!vehicleConnectorOk(s)) return false;
        if (activeConnectors.length > 0 && !s.connectors.some(c => activeConnectors.includes(c))) return false;
        return true;
      });
      // If the chosen network filter yields nothing, fall back to "any network" so planning still works.
      const localFilteredForPlanning =
        localFiltered.length > 0
          ? localFiltered
          : alongStations.filter((s) => {
              if (excluded.has(s.id)) return false;
              if (onlyAvailable && s.availability === 'low') return false;
              if (s.maxPowerKW < minPower) return false;
              if (!vehicleConnectorOk(s)) return false;
              if (activeConnectors.length > 0 && !s.connectors.some(c => activeConnectors.includes(c))) return false;
              return true;
            });

      const initialMaxLegMiles = availableRangeMiles * 0.9; // buffer
      const totalKWhUsed = route.miles / vehicle.efficiencyMiPerKWh;
      const startKWh = vehicle.batteryKWh * (currentSoc / 100);
      const endKWh = startKWh - totalKWhUsed;
      const endSoc = clamp((endKWh / vehicle.batteryKWh) * 100, 0, 100);
      const needsReserveStop = endSoc < clamp(arrivalReserveSoc, 0, 80);

      if (route.miles <= initialMaxLegMiles && !needsReserveStop) {
        const justStops: StopPoint[] = [
          { type: 'origin', name: 'Origin', lat: origin.lat, lng: origin.lng, arriveSoc: currentSoc, departSoc: currentSoc, chargeMinutes: 0 },
          { type: 'destination', name: 'Destination', lat: dest.lat, lng: dest.lng, arriveSoc: arrivalSoc ?? 0, departSoc: arrivalSoc ?? 0, chargeMinutes: 0 },
        ];
        const justSummary = { driveMinutes: Math.round(route.seconds / 60), chargeMinutes: 0, stops: 0 };
        setBasePlanStops(justStops);
        setBasePlanSummary(justSummary);
        setPlanStops(justStops);
        setPlanSummary(justSummary);
        return;
      }

      const stops: StopPoint[] = [];
      stops.push({ type: 'origin', name: 'Origin', lat: origin.lat, lng: origin.lng, arriveSoc: currentSoc, departSoc: currentSoc, chargeMinutes: 0 });

      let currentIndex = 0;
      let currentSocPct = currentSoc;
      let chargeMinutesTotal = 0;
      // Allow more stops so the plan summary can usually produce a feasible trip
      // (rather than ending early with negative destination SOC).
      const maxStops = 12;

      for (let stopIdx = 0; stopIdx < maxStops; stopIdx++) {
        // Find farthest reachable point along polyline within current leg range (depends on SOC after each stop)
        const legRangeMiles = (vehicle.batteryKWh * (currentSocPct / 100)) * vehicle.efficiencyMiPerKWh * 0.9;
        let bestIdx = currentIndex + 1;
        let accMiles = 0;
        for (let i = currentIndex + 1; i < route.polyline.length; i++) {
          const seg = haversineMiles(route.polyline[i - 1], route.polyline[i]);
          accMiles += seg;
          if (accMiles > legRangeMiles) break;
          bestIdx = i;
        }

        // If destination is within reach, finish
        const milesToDestFromHere = haversineMiles(route.polyline[bestIdx], dest);
        if (accMiles + milesToDestFromHere <= legRangeMiles * 1.05) {
          stops.push({ type: 'destination', name: 'Destination', lat: dest.lat, lng: dest.lng, arriveSoc: endSoc, departSoc: endSoc, chargeMinutes: 0 });
          const summary = { driveMinutes: Math.round(route.seconds / 60), chargeMinutes: Math.round(chargeMinutesTotal), stops: stops.filter(s => s.type === 'charger').length };
          setBasePlanStops(stops);
          setBasePlanSummary(summary);
          setPlanStops(stops);
          setPlanSummary(summary);
          return;
        }

        const target = route.polyline[bestIdx];

        // If the user explicitly chose a charger for this stop slot, prefer it.
        const overrideId = stopOverrides[stopIdx];
        const overrideStation =
          overrideId != null
            ? (localFilteredForPlanning.find(s => s.id === overrideId) ||
                alongStations.find(s => s.id === overrideId) ||
                stations.find(s => s.id === overrideId) ||
                null)
            : null;

        const scored = localFilteredForPlanning
          .map(s => ({ s, d: haversineMiles(target, s) }))
          .sort((a, b) => {
            const av = (x: Availability) => (x === 'high' ? 2 : x === 'medium' ? 1 : 0);
            const sa = av(a.s.availability);
            const sb = av(b.s.availability);
            if (sa !== sb) return sb - sa;
            if (a.s.maxPowerKW !== b.s.maxPowerKW) return b.s.maxPowerKW - a.s.maxPowerKW;
            return a.d - b.d;
          });

        // Wider candidate search radius to improve feasibility; fall back further if needed.
        const candidates = scored.filter(x => x.d <= 50);
        const candidatesFar = candidates.length ? candidates : scored.filter(x => x.d <= 100);
        const candidatesAny = candidatesFar.length ? candidatesFar : scored;

        const chosen =
          overrideStation && haversineMiles(target, overrideStation) <= 100
            ? overrideStation
            : candidatesAny[0]?.s;
        if (!chosen) break;

        const legMiles = accMiles;
        const kWhUsed = legMiles / vehicle.efficiencyMiPerKWh;
        const startKWh = vehicle.batteryKWh * (currentSocPct / 100);
        const arriveKWh = startKWh - kWhUsed;
        const arrivePct = clamp((arriveKWh / vehicle.batteryKWh) * 100, 0, 100);

        const remainingMiles = route.miles - (route.miles * (bestIdx / (route.polyline.length - 1)));
        const neededMiles = Math.min(remainingMiles * 1.1 + reserveMiles, vehicle.batteryKWh * vehicle.efficiencyMiPerKWh);
        const neededSoc = clamp(
          (neededMiles / (vehicle.batteryKWh * vehicle.efficiencyMiPerKWh)) * 100,
          clamp(arrivalReserveSoc, 0, 80),
          95
        );
        // Assume most users charge to ~80% by default (less time spent at chargers),
        // but allow higher if needed to reach the destination / reserve.
        const defaultChargeTarget = 80;
        const departPct = clamp(Math.max(neededSoc, defaultChargeTarget), arrivePct, 100);

        const neededKWh = vehicle.batteryKWh * ((departPct - arrivePct) / 100);
        const chargerKW = Math.max(10, Math.min(vehicle.maxChargeKW, chosen.maxPowerKW));
        const chargeMin = (neededKWh / chargerKW) * 60;
        chargeMinutesTotal += chargeMin;

        stops.push({
          type: 'charger',
          planStopIndex: stopIdx,
          name: chosen.name,
          lat: chosen.lat,
          lng: chosen.lng,
          arriveSoc: arrivePct,
          departSoc: departPct,
          chargeMinutes: Math.round(chargeMin),
          station: chosen,
        });

        // Jump forward along the route near the chosen station
        let nextIndex = bestIdx;
        let bestDist = Infinity;
        for (let i = bestIdx; i < route.polyline.length; i += 10) {
          const d = haversineMiles(route.polyline[i], chosen);
          if (d < bestDist) {
            bestDist = d;
            nextIndex = i;
          }
        }
        currentIndex = nextIndex;
        currentSocPct = departPct;
      }

      // If we couldn't reach destination within maxStops, still add Destination with the projected SOC
      // so the UI can show "negative SOC" and the user can add/replace stops.
      const last = stops[stops.length - 1];
      if (last?.type !== 'destination') {
        const progress = clamp(currentIndex / Math.max(1, route.polyline.length - 1), 0, 1);
        const remainingMiles = Math.max(0, route.miles * (1 - progress));
        const kWhUsed = remainingMiles / vehicle.efficiencyMiPerKWh;
        const startKWh = vehicle.batteryKWh * (currentSocPct / 100);
        const arriveKWh = startKWh - kWhUsed;
        const arrivePct = (arriveKWh / vehicle.batteryKWh) * 100; // allow negative
        stops.push({ type: 'destination', name: 'Destination', lat: dest.lat, lng: dest.lng, arriveSoc: arrivePct, departSoc: arrivePct, chargeMinutes: 0 });
      }

      setPlanStops(stops);
      setPlanSummary({
        driveMinutes: Math.round(route.seconds / 60),
        chargeMinutes: Math.round(chargeMinutesTotal),
        stops: stops.filter(s => s.type === 'charger').length,
      });
      setBasePlanStops(stops);
      setBasePlanSummary({
        driveMinutes: Math.round(route.seconds / 60),
        chargeMinutes: Math.round(chargeMinutesTotal),
        stops: stops.filter(s => s.type === 'charger').length,
      });
    } finally {
      setPlanning(false);
    }
  };

  const getRoute = async (opts?: { autoPlan?: boolean }) => {
    if (!origin || !dest) return;
    setChecking(true);
    setTripStatus('unknown');
    setArrivalSoc(null);
    setShortByMiles(null);
    setPlanStops(null);
    setPlanSummary(null);
    setBasePlanStops(null);
    setBasePlanSummary(null);
    setSkippedStopIdxs([]);
    setBrowseAllChargers(false);

    try {
      const from = `${origin.lat},${origin.lng}`;
      const to = `${dest.lat},${dest.lng}`;
      const url = `/api/mapquest?endpoint=directions&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&routeType=fastest&fullShape=true`;
      const res = await fetch(url);
      const data = await res.json();
      const route = data?.route;
      const miles = typeof route?.distance === 'number' ? route.distance : null;
      const seconds = typeof route?.time === 'number' ? route.time : null;
      setRouteMiles(miles);
      setRouteSeconds(seconds);

      const pts = route?.shape?.shapePoints;
      let computedPolyline: { lat: number; lng: number }[] = [];
      if (Array.isArray(pts) && pts.length >= 4) {
        for (let i = 0; i < pts.length; i += 2) computedPolyline.push({ lat: pts[i], lng: pts[i + 1] });
      } else {
        // Fallback so planning can still run even if a full shape isn't returned
        computedPolyline = [origin, dest];
      }
      setRoutePolyline(computedPolyline);

      // Initial discovery:
      // - start with 10 miles (nearby)
      // - broaden to 25 miles for better browsing
      // - if Tesla results are still sparse, broaden to 50 miles (Tesla-only filter can be very limiting depending on data coverage)
      const near = await fetchStationsNear(dest, { distanceMiles: 10, max: 100 });
      const broad = await fetchStationsNear(dest, { merge: true, distanceMiles: 25, max: 100 });
      const teslaCount = [...near, ...broad].filter(s => s.network === 'Tesla').length;
      if (networkFilter === 'Tesla' && teslaCount < 12) {
        await fetchStationsNear(dest, { merge: true, distanceMiles: 50, max: 100 });
      }

      if (miles != null) {
        const buffer = miles * 0.1;
        const needMiles = miles + buffer + reserveMiles;
        const canMake = availableRangeMiles > needMiles;
        const kWhUsed = miles / vehicle.efficiencyMiPerKWh;
        const startKWh = vehicle.batteryKWh * (currentSoc / 100);
        const endKWh = startKWh - kWhUsed;
        const endSoc = clamp((endKWh / vehicle.batteryKWh) * 100, 0, 100);
        setArrivalSoc(endSoc);
        const meetsReserve = endSoc >= clamp(arrivalReserveSoc, 0, 80);
        const status = canMake ? 'ok' : 'needs-charge';
        setTripStatus(status);

        if (!canMake) {
          setShortByMiles(Math.max(0, needMiles - availableRangeMiles));
        }

        // Always build a plan on route creation:
        // - If no charging is needed, the plan will just be Origin → Destination.
        // - If charging is needed (or reserve isn't met), chargers will be inserted automatically.
        // Users can then skip/replace/add chargers and immediately see the impact.
        if ((opts?.autoPlan ?? true) && computedPolyline.length > 1 && seconds != null) {
          await planTripWithRoute({ polyline: computedPolyline, miles, seconds });
        }
      }
    } catch {
      // ignore; UI will show unknown
    } finally {
      setChecking(false);
    }
  };

  const planTrip = async () => {
    if (!origin || !dest || !routePolyline || routeMiles == null || routeSeconds == null) return;
    try {
      await planTripWithRoute({ polyline: routePolyline, miles: routeMiles, seconds: routeSeconds });
    } catch {
      // ignore
    }
  };

  const clearOverridesFrom = (fromStopIdx: number) => {
    setStopOverrides((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const idx = Number(k);
        if (!Number.isFinite(idx)) continue;
        if (idx < fromStopIdx) next[idx] = v;
      }
      return next;
    });
  };

  // Keep arrival SOC + charge-needed status in sync when the user changes starting charge or reserve %
  // (without requiring a full route refetch).
  useEffect(() => {
    if (routeMiles == null) return;
    const buffer = routeMiles * 0.1;
    const needMiles = routeMiles + buffer + reserveMiles;
    const canMake = availableRangeMiles > needMiles;
    const kWhUsed = routeMiles / vehicle.efficiencyMiPerKWh;
    const startKWh = vehicle.batteryKWh * (currentSoc / 100);
    const endKWh = startKWh - kWhUsed;
    const endSoc = clamp((endKWh / vehicle.batteryKWh) * 100, 0, 100);
    setArrivalSoc(endSoc);
    setTripStatus(canMake ? 'ok' : 'needs-charge');
    setShortByMiles(canMake ? null : Math.max(0, needMiles - availableRangeMiles));
  }, [routeMiles, currentSoc, reserveMiles, availableRangeMiles, vehicle]);

  // Auto-suggest charging stops when the reserve / starting battery changes (or whenever a route exists).
  const autoPlanKey = useMemo(() => {
    if (!origin || !dest || !routePolyline || routeMiles == null || routeSeconds == null) return null;
    return [
      routeMiles.toFixed(3),
      routeSeconds,
      currentSoc.toFixed(1),
      arrivalReserveSoc,
      autoPlanToReserve ? 1 : 0,
      networkFilter,
      minPower,
      onlyAvailable ? 1 : 0,
      Object.entries(filterConnectors).filter(([, v]) => v).map(([k]) => k).sort().join('|'),
    ].join('::');
  }, [origin, dest, routePolyline, routeMiles, routeSeconds, currentSoc, arrivalReserveSoc, autoPlanToReserve, networkFilter, minPower, onlyAvailable, filterConnectors]);

  const lastAutoPlanKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPlanKey) return;
    if (planning) return;
    if (lastAutoPlanKeyRef.current === autoPlanKey) return;

    const meetsReserve = arrivalSoc != null && arrivalSoc >= clamp(arrivalReserveSoc, 0, 80);
    const shouldAutoPlan = tripStatus === 'needs-charge' || (autoPlanToReserve && tripStatus === 'ok' && !meetsReserve);
    if (!shouldAutoPlan) return;

    lastAutoPlanKeyRef.current = autoPlanKey;
    planTrip().catch(() => {});
  }, [autoPlanKey, planning, tripStatus, autoPlanToReserve, arrivalSoc, arrivalReserveSoc]);

  const markers = useMemo(() => {
    const m: any[] = [];
    if (origin) m.push({ lat: origin.lat, lng: origin.lng, label: 'Origin', color: '#EF6351', type: 'home' });
    if (dest) m.push({ lat: dest.lat, lng: dest.lng, label: 'Destination', color: '#4ADE80', type: 'home' });

    const stationsToRender = showOnlyPlannedStopsOnMap
      ? []
      : filteredStations;

    for (const s of stationsToRender) {
      const selected = s.id === selectedStationId;
      // Unify all charger pins to the primary (blue) color.
      const bg = accentColor;
      m.push({
        lat: s.lat,
        lng: s.lng,
        label: `${s.name} • ${s.network} • ${s.maxPowerKW.toFixed(0)}kW • ${s.availableStalls}/${s.stallCount}`,
        iconUrl: chargerBoltIconUrl({
          bg,
          ring: selected ? accentColor : undefined,
          // Reduce size ~10%
          size: selected ? 30 : 25,
          selected,
        }),
        iconSize: [selected ? 30 : 25, selected ? 30 : 25],
        zIndexOffset: selected ? 1400 : 600,
        onClick: () => setSelectedStationId(s.id),
      });
    }

    if (planStops) {
      planStops
        .filter(p => p.type === 'charger')
        .forEach((p, idx) => {
          const slot = typeof p.planStopIndex === 'number' ? p.planStopIndex : idx;
          if (skippedSet.has(slot)) return;
          m.push({
            lat: p.lat,
            lng: p.lng,
            label: `Charge Stop ${idx + 1}: ${p.name}`,
            iconUrl: chargerBoltIconUrl({ bg: accentColor, ring: 'white', size: 30, selected: true }),
            iconSize: [30, 30],
            zIndexOffset: 1500,
          });
        });
    }

    return m;
  }, [origin, dest, filteredStations, selectedStationId, accentColor, planStops, showOnlyPlannedStopsOnMap, skippedSet]);

  const plannedWaypoints = useMemo(() => {
    if (!planStops) return undefined;
    const wps = planStops.filter(p => p.type === 'charger').map(p => ({ lat: p.lat, lng: p.lng }));
    return wps.length ? wps : undefined;
  }, [planStops]);

  const shouldShowWaypointRoute = !!plannedWaypoints && !!origin && !!dest;
  const routeStart = shouldShowWaypointRoute && origin ? origin : undefined;
  const routeEnd = shouldShowWaypointRoute && dest ? dest : undefined;

  const mapCenter = useMemo(() => {
    if (dest) return dest;
    if (origin) return origin;
    return { lat: 34.0522, lng: -118.2437 };
  }, [origin, dest]);

  // Initial load: show a healthy set of chargers near the default center (or selected origin/destination).
  useEffect(() => {
    if (stations.length > 0) return;
    (async () => {
      const near = await fetchStationsNear(mapCenter, { distanceMiles: 25, max: 100 });
      const teslaCount = near.filter(s => s.network === 'Tesla').length;
      if (networkFilter === 'Tesla' && teslaCount < 12) {
        await fetchStationsNear(mapCenter, { merge: true, distanceMiles: 50, max: 100 });
      }
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenter.lat, mapCenter.lng]);

  const fitBounds = useMemo(() => {
    const pts: { lat: number; lng: number }[] = [];
    if (origin) pts.push(origin);
    if (dest) pts.push(dest);
    filteredStations.slice(0, 40).forEach(s => pts.push({ lat: s.lat, lng: s.lng }));
    if (pts.length < 2) return undefined;
    let north = -90, south = 90, east = -180, west = 180;
    for (const p of pts) {
      north = Math.max(north, p.lat);
      south = Math.min(south, p.lat);
      east = Math.max(east, p.lng);
      west = Math.min(west, p.lng);
    }
    return { north: north + 0.05, south: south - 0.05, east: east + 0.07, west: west - 0.07 };
  }, [origin, dest, filteredStations]);

  const summaryLine = useMemo(() => {
    if (routeMiles == null) return null;
    const driveMin = routeSeconds != null ? Math.round(routeSeconds / 60) : null;
    const range = Math.round(availableRangeMiles);
    return { driveMin, range };
  }, [routeMiles, routeSeconds, availableRangeMiles]);

  return (
    <div
      className="prism-widget w-full md:w-[990px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <WidgetHeader
        title="EV Charging Planner"
        subtitle="Plan an EV trip with charger discovery and range checks."
        variant="impressive"
        layout="inline"
        icon={<BatteryCharging className="w-4 h-4" />}
      />
      <div className="flex flex-col md:flex-row md:h-[684px]">
        {/* Left panel */}
        <div className="w-full md:w-[400px] flex flex-col border-t md:border-t-0 md:border-r md:order-1" style={{ borderColor: border }}>
          <div className="p-4" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: textMain }}>Controls</div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              {(
                [
                  { id: 'trip' as const, label: 'Trip', icon: Route },
                  { id: 'map' as const, label: 'Chargers', icon: MapPin },
                  { id: 'vehicle' as const, label: 'Vehicle', icon: Bolt },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2"
                  style={{
                    background: tab === t.id ? `${accentColor}18` : bgPanel,
                    border: `1px solid ${tab === t.id ? `${accentColor}45` : border}`,
                    color: tab === t.id ? accentColor : 'var(--text-secondary)',
                  }}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                className="px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2"
                onClick={() => setShowFilters(v => !v)}
                style={{ background: bgPanel, border: `1px solid ${border}`, color: 'var(--text-secondary)' }}
                title="Filters"
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="p-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="rounded-2xl p-3 space-y-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: textMuted }}>
                    Filters
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNetworkFilter('Tesla');
                      setMinPower(50);
                      setOnlyAvailable(false);
                      setFilterConnectors({ CCS: true, CHAdeMO: false, J1772: true, NACS: true });
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                    style={{ background: bgPanel, border: `1px solid ${border}`, color: 'var(--text-secondary)' }}
                  >
                    Reset
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                      Network
                    </label>
                    <select
                      value={networkFilter}
                      onChange={(e) => setNetworkFilter(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold outline-none"
                      style={{ background: bgPanel, border: `1px solid ${border}`, color: textMain }}
                    >
                      <option value="Tesla">Tesla</option>
                      <option value="all">All networks</option>
                      {groupedNetworks.majors.length > 0 && (
                        <optgroup label="Major networks">
                          {groupedNetworks.majors
                            .filter((n) => n !== 'Tesla')
                            .map((n) => (
                              <option key={n} value={n}>
                                {n} ({networkCounts.get(n) || 0})
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {groupedNetworks.other.length > 0 && (
                        <optgroup label="Other networks">
                          {groupedNetworks.other.map((n) => (
                            <option key={n} value={n}>
                              {n} ({networkCounts.get(n) || 0})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {groupedNetworks.hasUnknown && (
                        <optgroup label="Unknown">
                          <option value="Unknown">Unknown ({networkCounts.get('Unknown') || 0})</option>
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                      Min charging speed
                    </label>
                    <input
                      type="range"
                      min={6}
                      max={350}
                      step={5}
                      value={minPower}
                      onChange={(e) => setMinPower(Number(e.target.value))}
                      className="w-full"
                      style={{ accentColor }}
                    />
                    <div className="text-xs mt-1" style={{ color: textMuted }}>
                      {minPower} kW+
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                    Connectors
                  </label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {(['NACS', 'CCS', 'J1772', 'CHAdeMO'] as Connector[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFilterConnectors(prev => ({ ...prev, [c]: !prev[c] }))}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{
                          background: filterConnectors[c] ? `${accentColor}18` : bgPanel,
                          border: `1px solid ${filterConnectors[c] ? `${accentColor}45` : border}`,
                          color: filterConnectors[c] ? accentColor : 'var(--text-secondary)',
                        }}
                      >
                        {c}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => setOnlyAvailable(v => !v)}
                      className="ml-auto px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{
                        background: onlyAvailable ? `${accentColor}18` : bgPanel,
                        border: `1px solid ${onlyAvailable ? `${accentColor}45` : border}`,
                        color: onlyAvailable ? accentColor : 'var(--text-secondary)',
                      }}
                    >
                      Hide low availability
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar p-4 space-y-3">
            {tab === 'vehicle' && (
              <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                <div className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: textMuted }}>
                  Vehicle profile
                </div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                  Vehicle
                </label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value as VehiclePresetId)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold outline-none"
                  style={{ background: bgPanel, border: `1px solid ${border}`, color: textMain }}
                >
                  {VEHICLES.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                    <div className="text-xs" style={{ color: textMuted }}>Battery</div>
                    <div className="text-sm font-semibold mt-1" style={{ color: textMain }}>{vehicle.batteryKWh} kWh</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                    <div className="text-xs" style={{ color: textMuted }}>Efficiency</div>
                    <div className="text-sm font-semibold mt-1" style={{ color: textMain }}>{vehicle.efficiencyMiPerKWh.toFixed(1)} mi/kWh</div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
                      Current charge
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setChargeMode('soc')}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                        style={{
                          background: chargeMode === 'soc' ? `${accentColor}18` : 'transparent',
                          border: `1px solid ${chargeMode === 'soc' ? `${accentColor}45` : border}`,
                          color: chargeMode === 'soc' ? accentColor : 'var(--text-secondary)',
                        }}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setChargeMode('miles')}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                        style={{
                          background: chargeMode === 'miles' ? `${accentColor}18` : 'transparent',
                          border: `1px solid ${chargeMode === 'miles' ? `${accentColor}45` : border}`,
                          color: chargeMode === 'miles' ? accentColor : 'var(--text-secondary)',
                        }}
                      >
                        mi
                      </button>
                    </div>
                  </div>

                  {chargeMode === 'soc' ? (
                    <div className="mt-2">
                      <input type="range" min={5} max={100} step={1} value={socPercent} onChange={(e) => setSocPercent(Number(e.target.value))} className="w-full" style={{ accentColor }} />
                      <div className="text-sm font-semibold mt-1" style={{ color: textMain }}>
                        {Math.round(currentSoc)}% • ~{Math.round(availableRangeMiles)} mi range
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <input
                        type="number"
                        value={milesRemaining}
                        onChange={(e) => setMilesRemaining(Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold outline-none"
                        style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, color: textMain }}
                      />
                      <div className="text-sm font-semibold mt-1" style={{ color: textMain }}>
                        {Math.round(currentSoc)}% • ~{Math.round(availableRangeMiles)} mi range
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'trip' && (
              <>
                <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                  <div className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: textMuted }}>
                    Trip
                  </div>
                  <div className="space-y-2">
                    <div
                      className="rounded-xl flex items-center gap-2.5"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm" style={{ background: accentColor, color: 'white' }}>A</div>
                      <AddressAutocomplete
                        value={originText}
                        onChange={(v) => { setOriginText(v); setOrigin(null); }}
                        onSelect={(r) => {
                          setOriginText(r.displayString);
                          if (r.lat && r.lng) setOrigin({ lat: r.lat, lng: r.lng });
                        }}
                        placeholder="Origin"
                        darkMode={darkMode}
                        hideIcon
                        className="flex-1"
                      />
                    </div>
                    <div
                      className="rounded-xl flex items-center gap-2.5"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm" style={{ background: accentColor, color: 'white' }}>B</div>
                      <AddressAutocomplete
                        value={destText}
                        onChange={(v) => { setDestText(v); setDest(null); }}
                        onSelect={(r) => {
                          setDestText(r.displayString);
                          if (r.lat && r.lng) setDest({ lat: r.lat, lng: r.lng });
                        }}
                        placeholder="Destination"
                        darkMode={darkMode}
                        hideIcon
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => getRoute({ autoPlan: true })}
                      disabled={!origin || !dest || checking || planning}
                      className="prism-btn prism-btn-primary flex-1 py-3 text-sm inline-flex items-center justify-center gap-2"
                      style={{ background: accentColor, opacity: !origin || !dest || checking || planning ? 0.6 : 1 }}
                      title="Build the route and automatically suggest charging stops"
                    >
                      {checking || planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
                      Plan trip
                    </button>
                  </div>

                  {summaryLine && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                        <div className="text-xs" style={{ color: textMuted }}>Distance</div>
                        <div className="text-sm font-semibold mt-1" style={{ color: textMain }}>{routeMiles?.toFixed(0)} mi</div>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                        <div className="text-xs" style={{ color: textMuted }}>Drive</div>
                        <div className="text-sm font-semibold mt-1" style={{ color: textMain }}>{summaryLine.driveMin != null ? `${summaryLine.driveMin} min` : '—'}</div>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                        <div className="text-xs" style={{ color: textMuted }}>Range</div>
                        <div className="text-sm font-semibold mt-1" style={{ color: textMain }}>{summaryLine.range} mi</div>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
                        Arrive with
                      </div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        {Math.round(arrivalReserveSoc)}%
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      step={1}
                      value={arrivalReserveSoc}
                      onChange={(e) => setArrivalReserveSoc(Number(e.target.value))}
                      className="w-full mt-2"
                      style={{ accentColor }}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Auto-plan stops to meet arrival reserve
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoPlanToReserve}
                        onClick={() => setAutoPlanToReserve((v) => !v)}
                        className="relative inline-flex h-5 w-9 items-center rounded-full border transition-colors"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          background: autoPlanToReserve ? accentColor : 'var(--bg-input)',
                        }}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                          style={{ transform: autoPlanToReserve ? 'translateX(17px)' : 'translateX(2px)' }}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Removed the "Charging required" banner — the plan summary below is the source of truth */}
                </div>

                {planSummary && planStops && (
                  <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: textMuted }}>
                        Plan summary
                      </div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        {planSummary.stops} stops • {planSummary.driveMinutes}m drive • {planSummary.chargeMinutes}m charge
                      </div>
                    </div>

                    {(() => {
                      const destStop = planStops.findLast?.((x: any) => x.type === 'destination') || planStops[planStops.length - 1];
                      const destSoc = destStop?.type === 'destination' ? Number(destStop.arriveSoc) : NaN;
                      const bad = Number.isFinite(destSoc) && destSoc < 0;
                      if (!bad) return null;
                      return (
                        <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                          <div className="text-xs font-semibold" style={{ color: textMain }}>
                            Plan is not feasible (arrival charge is negative). Add/replace a charger stop.
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mt-3 space-y-2">
                      {planStops.map((p, idx) => (
                        <div key={idx} className="rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate" style={{ color: textMain }}>
                                {p.type === 'charger' ? `Stop ${planStops.slice(0, idx + 1).filter(x => x.type === 'charger').length}: ${p.name}` : p.type === 'origin' ? 'Origin' : 'Destination'}
                              </div>
                              {p.station?.addressLine ? (
                                <div className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>
                                  {p.station.addressLine}
                                </div>
                              ) : null}
                            </div>
                            {p.type === 'charger' ? (
                              <div className="text-right">
                                <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                  {p.chargeMinutes}m charge
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: textMuted }}>
                                  {p.arriveSoc.toFixed(0)}% → {p.departSoc.toFixed(0)}%
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs font-semibold" style={{ color: Number(p.arriveSoc) < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                                {Number(p.arriveSoc) < 0 ? `${p.arriveSoc.toFixed(0)}%` : `${p.arriveSoc.toFixed(0)}%`}
                              </div>
                            )}
                          </div>

                          {p.type === 'charger' && p.station?.id && (
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="text-[11px]" style={{ color: textMuted }}>
                                {p.station.network} • {p.station.connectors.join('/')} • {p.station.maxPowerKW.toFixed(0)}kW
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (typeof p.planStopIndex !== 'number') return;
                                    setSkippedStopIdxs((prev) =>
                                      prev.includes(p.planStopIndex!) ? prev : [...prev, p.planStopIndex!]
                                    );
                                    if (basePlanStops) {
                                      const next = recomputeStopsAfterSkips(basePlanStops, new Set([...skippedStopIdxs, p.planStopIndex]));
                                      setPlanStops(next.stops);
                                      if (next.summary) setPlanSummary(next.summary as any);
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                                  style={{ background: bgPanel, border: `1px solid ${border}`, color: 'var(--text-secondary)' }}
                                >
                                  Skip
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplacingStopIdx(typeof p.planStopIndex === 'number' ? p.planStopIndex : 0);
                                    setTab('map');
                                  }}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                                  style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}35`, color: accentColor }}
                                >
                                  Replace
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'map' && (
              <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: textMuted }}>
                    Stations near destination
                  </div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {filteredStations.length} shown
                  </div>
                </div>
                {!!routePolyline && (
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-xs" style={{ color: textMuted }}>
                      {showOnlyPlannedStopsInChargersTab ? 'Showing planned charge stops.' : 'Browsing all chargers.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => setBrowseAllChargers(v => !v)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                      style={{ background: bgPanel, border: `1px solid ${border}`, color: 'var(--text-secondary)' }}
                    >
                      {browseAllChargers ? 'Show planned stops' : 'Browse all chargers'}
                    </button>
                  </div>
                )}
                {replacingStopIdx != null && (
                  <div className="mb-3 rounded-xl p-3" style={{ background: `${accentColor}10`, border: `1px solid ${accentColor}35` }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold" style={{ color: textMain }}>
                        Replacing <span style={{ color: accentColor, fontWeight: 700 }}>Stop {replacingStopIdx + 1}</span> — choose a station below.
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplacingStopIdx(null)}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                        style={{ background: bgPanel, border: `1px solid ${border}`, color: 'var(--text-secondary)' }}
                      >
                        Cancel
                      </button>
                    </div>
                    {selectedStationId && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const idx = replacingStopIdx;
                            if (idx == null) return;
                            if (!selectedStationId) return;
                            setExcludedStationIds((prev) => prev.filter((id) => id !== selectedStationId));
                            setStopOverrides((prev) => ({ ...prev, [idx]: selectedStationId }));
                            setReplacingStopIdx(null);
                            planTrip().catch(() => {});
                            setTab('trip');
                          }}
                          className="w-full px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2"
                          style={{ background: accentColor, color: 'white' }}
                        >
                          <PlugZap className="w-4 h-4" />
                          Use selected station for Stop {replacingStopIdx + 1}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {lastFetchMeta?.total != null && (
                  <div className="text-xs mb-2" style={{ color: textMuted }}>
                    Loaded {lastFetchMeta.total} ({lastFetchMeta.tesla ?? 0} Tesla) • radius {lastFetchMeta.radiusMiles ?? 0} mi
                    {lastFetchMeta.source ? ` • ${lastFetchMeta.source}` : ''}
                    {lastFetchMeta.providerUrl ? ` • ${new URL(lastFetchMeta.providerUrl).host}` : ''}
                    {lastFetchMeta.attemptSummary ? ` • attempts: ${lastFetchMeta.attemptSummary}` : ''}
                    {typeof lastFetchMeta.httpStatus === 'number' ? ` • ${lastFetchMeta.httpStatus}` : ''}
                    {lastFetchMeta.errorMessage ? ` • ${lastFetchMeta.errorMessage}` : ''}
                  </div>
                )}
                {!dest ? (
                  <div className="text-sm" style={{ color: textMuted }}>
                    Enter a destination to load nearby chargers.
                  </div>
                ) : loadingStations ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: textMuted }}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading stations…
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {(showOnlyPlannedStopsInChargersTab
                        ? (planStops || []).filter(p => p.type === 'charger' && !skippedSet.has(typeof p.planStopIndex === 'number' ? p.planStopIndex : 0)).map((p) => {
                            const s = p.station;
                            const sid = s?.id || `${p.lat},${p.lng}`;
                            const selected = selectedStationId === sid;
                            return (
                              <button
                                key={sid}
                                type="button"
                                onClick={() => {
                                  if (s?.id) setSelectedStationId(s.id);
                                }}
                                className="w-full text-left rounded-2xl p-3 transition-colors"
                                style={{
                                  background: selected ? `${accentColor}12` : bgPanel,
                                  border: `1px solid ${selected ? `${accentColor}35` : border}`,
                                  color: textMain,
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accentColor }} />
                                      <div className="text-sm font-semibold truncate">{p.name}</div>
                                    </div>
                                    <div className="text-xs mt-1 truncate" style={{ color: textMuted }}>
                                      {s ? `${s.network} • ${s.connectors.join('/')}` : 'Charging stop'}
                                    </div>
                                    {s?.addressLine ? (
                                      <div className="text-xs mt-1 truncate" style={{ color: textMuted }}>
                                        {s.addressLine}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                      {p.chargeMinutes}m
                                    </div>
                                    <div className="text-xs mt-1" style={{ color: textMuted }}>
                                      {p.arriveSoc.toFixed(0)}% → {p.departSoc.toFixed(0)}%
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        : filteredStations.map((s) => {
                        const selected = selectedStationId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedStationId(s.id)}
                            className="w-full text-left rounded-2xl p-3 transition-colors"
                            style={{
                              background: selected ? `${accentColor}12` : bgPanel,
                              border: `1px solid ${selected ? `${accentColor}35` : border}`,
                              color: textMain,
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accentColor }} />
                                  <div className="text-sm font-semibold truncate">{s.name}</div>
                                </div>
                                <div className="text-xs mt-1 truncate" style={{ color: textMuted }}>
                                  {s.network} • {s.connectors.join('/')}
                                </div>
                                {s.addressLine ? (
                                  <div className="text-xs mt-1 truncate" style={{ color: textMuted }}>
                                    {s.addressLine}
                                  </div>
                                ) : null}
                              </div>

                              <div className="text-right flex-shrink-0">
                                <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                  {s.maxPowerKW.toFixed(0)} kW
                                </div>
                                <div className="text-xs mt-1" style={{ color: textMuted }}>
                                  {s.availableStalls}/{s.stallCount} stalls
                                </div>
                              </div>
                            </div>

                            {routePolyline && (
                              <div className="mt-2 flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Override the next stop slot (Stop 1) with this station.
                                    setExcludedStationIds((prev) => prev.filter((id) => id !== s.id));
                                    setStopOverrides((prev) => ({ ...prev, 0: s.id }));
                                    setSkippedStopIdxs([]);
                                    planTrip().catch(() => {});
                                    setTab('trip');
                                  }}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                                  style={{ background: bgPanel, border: `1px solid ${border}`, color: 'var(--text-secondary)' }}
                                  title="Add this station as the next charging stop and recompute the plan"
                                >
                                  Add as next stop
                                </button>
                              </div>
                            )}
                          </button>
                        );
                      }))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="h-[320px] md:h-auto md:flex-1 md:order-2 relative">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={origin && dest ? 9 : 10}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            showRoute={shouldShowWaypointRoute ? true : !!routePolyline}
            routeStart={routeStart}
            routeEnd={routeEnd}
            waypoints={plannedWaypoints}
            routeType="fastest"
            routePolyline={shouldShowWaypointRoute ? undefined : (routePolyline || undefined)}
            fitBounds={fitBounds}
          />

          {/* Mobile bottom sheet for selected station */}
          {selectedStation && (
            <div className="md:hidden absolute left-3 right-3 bottom-3 rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}`, boxShadow: '0 18px 50px rgba(0,0,0,0.18)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: textMain }}>{selectedStation.name}</div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>{selectedStation.network} • {selectedStation.connectors.join('/')}</div>
                </div>
                <button type="button" onClick={() => setSelectedStationId(null)} className="p-2 rounded-xl" style={{ background: bgPanel, border: `1px solid ${border}`, color: 'var(--text-secondary)' }}>
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-xl p-2" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                  <div className="text-[11px]" style={{ color: textMuted }}>Power</div>
                  <div className="text-xs font-semibold mt-0.5" style={{ color: textMain }}>{selectedStation.maxPowerKW.toFixed(0)}kW</div>
                </div>
                <div className="rounded-xl p-2" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                  <div className="text-[11px]" style={{ color: textMuted }}>Stalls</div>
                  <div className="text-xs font-semibold mt-0.5" style={{ color: textMain }}>{selectedStation.availableStalls}/{selectedStation.stallCount}</div>
                </div>
                <div className="rounded-xl p-2" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                  <div className="text-[11px]" style={{ color: textMuted }}>Avail</div>
                  <div className="text-xs font-semibold mt-0.5" style={{ color: textMain }}>{selectedStation.availability.toUpperCase()}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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

