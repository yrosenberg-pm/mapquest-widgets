'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, MapPin, Crosshair } from 'lucide-react';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';
import { geocode, reverseGeocode } from '@/lib/mapquest';

type TravelTimePreset = 15 | 30 | 45 | 60;
type ModeOption = 'drive' | 'walk' | 'bike';

type LocationItem = {
  id: string;
  label: string;
  color: string;
  address: string;
  lat?: number;
  lng?: number;
  timeMinutes: TravelTimePreset;
  mode: ModeOption;
};

type OverlapStats = {
  hasOverlap: boolean;
  areaSqMi?: number;
  center?: { lat: number; lng: number };
  centerAddress?: string;
};

const mapQuestApiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

const COLORS = ['#2563EB', '#EF4444', '#10B981', '#A855F7', '#F59E0B'];

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function modeToHereTransportMode(mode: ModeOption): 'car' | 'pedestrian' | 'bicycle' {
  if (mode === 'walk') return 'pedestrian';
  if (mode === 'bike') return 'bicycle';
  return 'car';
}

function closeRing(coords: { lat: number; lng: number }[]) {
  if (coords.length < 3) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first.lat === last.lat && first.lng === last.lng) return coords;
  return [...coords, first];
}

function toTurfPolygon(coords: { lat: number; lng: number }[]) {
  const ring = closeRing(coords);
  const lngLat = ring.map((p) => [p.lng, p.lat]);
  return turf.polygon([lngLat]);
}

function asPolygonFeatures(f: Feature<Polygon | MultiPolygon>): Feature<Polygon>[] {
  if (f.geometry.type === 'Polygon') return [f as unknown as Feature<Polygon>];
  const coords = (f.geometry as MultiPolygon).coordinates || [];
  return coords.map((polyCoords) => turf.polygon(polyCoords) as unknown as Feature<Polygon>);
}

function cleanPolyFeature(f: Feature<Polygon | MultiPolygon>): Feature<Polygon | MultiPolygon> {
  // Turf operations can be sensitive to minor self-intersections / duplicate points.
  // cleanCoords reduces vertex noise; rewind normalizes winding order.
  let out: any = f;
  try {
    out = turf.cleanCoords(out);
  } catch {
    // ignore
  }
  try {
    out = turf.rewind(out, { reverse: false });
  } catch {
    // ignore
  }
  return out as Feature<Polygon | MultiPolygon>;
}

function intersectRobust(
  aIn: Feature<Polygon | MultiPolygon>,
  bIn: Feature<Polygon | MultiPolygon>
): Feature<Polygon | MultiPolygon> | null {
  const a = cleanPolyFeature(aIn);
  const b = cleanPolyFeature(bIn);

  const aPolys = asPolygonFeatures(a);
  const bPolys = asPolygonFeatures(b);

  const pieces: Feature<Polygon | MultiPolygon>[] = [];
  for (const pa of aPolys) {
    for (const pb of bPolys) {
      try {
        // Turf v7 expects a FeatureCollection of 2+ geometries.
        const r = turf.intersect(turf.featureCollection([pa, pb]) as any) as Feature<Polygon | MultiPolygon> | null;
        if (r) pieces.push(r);
      } catch {
        // ignore topo errors and keep trying other pieces
      }
    }
  }
  if (pieces.length === 0) return null;

  // Union pieces back together into a single polygon/multipolygon.
  try {
    return (turf.union(turf.featureCollection(pieces as any) as any) as unknown as Feature<Polygon | MultiPolygon>) || pieces[0];
  } catch {
    return pieces[0];
  }
}

function fmtSqMi(areaSqMi: number) {
  if (areaSqMi < 1) return `${areaSqMi.toFixed(2)} sq mi`;
  if (areaSqMi < 10) return `${areaSqMi.toFixed(1)} sq mi`;
  return `${Math.round(areaSqMi)} sq mi`;
}

export default function IsolineOverlapWidget({
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
}) {
  const [locations, setLocations] = useState<LocationItem[]>(() => ([
    { id: uid('loc'), label: 'Home', color: COLORS[0], address: '', timeMinutes: 30, mode: 'drive' },
    { id: uid('loc'), label: 'Work', color: COLORS[1], address: '', timeMinutes: 30, mode: 'drive' },
  ]));

  const [polygonsById, setPolygonsById] = useState<Record<string, { coords: { lat: number; lng: number }[] }>>({});
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [geocodingIds, setGeocodingIds] = useState<Record<string, boolean>>({});
  const [meetingSpotLoading, setMeetingSpotLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlapStats, setOverlapStats] = useState<OverlapStats>({ hasOverlap: false });

  const overlapGeoRef = useRef<Feature<Polygon | MultiPolygon> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const geocodeTimersRef = useRef<Record<string, any>>({});
  const skipNextAutoGeocodeRef = useRef<Record<string, boolean>>({});
  const meetingSpotAbortRef = useRef<AbortController | null>(null);

  // Decode HERE flexible polyline (copied from HereIsolineWidget for reuse)
  const decodeFlexiblePolyline = (encoded: string): { lat: number; lng: number }[] => {
    const coordinates: { lat: number; lng: number }[] = [];

    let index = 0;
    const version = decodeUnsignedVarint(encoded, { index: 0 });
    index = version.newIndex;

    const header = decodeUnsignedVarint(encoded, { index });
    index = header.newIndex;

    const precision = header.value & 0x0f;
    const thirdDimType = (header.value >> 8) & 0x07;

    const multiplier = Math.pow(10, precision);

    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      const latResult = decodeSignedVarint(encoded, { index });
      lat += latResult.value;
      index = latResult.newIndex;

      if (index >= encoded.length) break;

      const lngResult = decodeSignedVarint(encoded, { index });
      lng += lngResult.value;
      index = lngResult.newIndex;

      if (thirdDimType !== 0 && index < encoded.length) {
        const thirdResult = decodeSignedVarint(encoded, { index });
        index = thirdResult.newIndex;
      }

      coordinates.push({
        lat: lat / multiplier,
        lng: lng / multiplier,
      });
    }

    return coordinates;
  };

  const decodeUnsignedVarint = (encoded: string, pos: { index: number }): { value: number; newIndex: number } => {
    const DECODING_TABLE: Record<string, number> = {};
    const ENCODING_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < ENCODING_CHARS.length; i++) {
      DECODING_TABLE[ENCODING_CHARS[i]] = i;
    }

    let result = 0;
    let shift = 0;
    let index = pos.index;

    while (index < encoded.length) {
      const char = encoded[index];
      const value = DECODING_TABLE[char];
      if (value === undefined) {
        throw new Error(`Invalid character: ${char}`);
      }

      result |= (value & 0x1f) << shift;

      if ((value & 0x20) === 0) {
        return { value: result, newIndex: index + 1 };
      }

      shift += 5;
      index++;
    }

    throw new Error('Incomplete varint');
  };

  const decodeSignedVarint = (encoded: string, pos: { index: number }): { value: number; newIndex: number } => {
    const unsigned = decodeUnsignedVarint(encoded, pos);
    const value = unsigned.value;
    const decoded = (value >> 1) ^ (-(value & 1));
    return { value: decoded, newIndex: unsigned.newIndex };
  };

  const fetchHereIsochrone = async (center: { lat: number; lng: number }, timeMinutes: number, mode: ModeOption, signal: AbortSignal) => {
    const rangeSeconds = Math.max(60, Math.round(timeMinutes * 60));
    const params = new URLSearchParams({
      endpoint: 'isoline',
      origin: `${center.lat},${center.lng}`,
      rangeType: 'time',
      rangeValues: String(rangeSeconds),
      transportMode: modeToHereTransportMode(mode),
      optimizeFor: 'balanced',
    });

    const res = await fetch(`/api/here?${params.toString()}`, { signal });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || `Failed to compute isochrone (${res.status})`);
    }
    const data = await res.json();
    const outer = data?.isolines?.[0]?.polygons?.[0]?.outer;
    if (!outer) return null;
    const coords = decodeFlexiblePolyline(String(outer));
    return coords.length >= 3 ? coords : null;
  };

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const canCompute = useMemo(() => {
    const valid = locations.filter((l) => typeof l.lat === 'number' && typeof l.lng === 'number');
    return valid.length >= 2;
  }, [locations]);

  const addLocation = () => {
    setLocations((prev) => {
      if (prev.length >= 5) return prev;
      const nextColor = COLORS[prev.length % COLORS.length];
      return [
        ...prev,
        {
          id: uid('loc'),
          label: `Location ${prev.length + 1}`,
          color: nextColor,
          address: '',
          timeMinutes: 30,
          mode: 'drive',
        },
      ];
    });
  };

  const removeLocation = (id: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== id));
    setPolygonsById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLoadingIds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateLocation = (id: string, patch: Partial<LocationItem>) => {
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const clearPolygonFor = (id: string) => {
    setPolygonsById((p) => {
      if (!p[id]) return p;
      const next = { ...p };
      delete next[id];
      return next;
    });
  };

  const geocodeLocation = async (id: string, address: string) => {
    const trimmed = (address || '').trim();
    if (trimmed.length < 4) return;
    setGeocodingIds((p) => ({ ...p, [id]: true }));
    try {
      const g = await geocode(trimmed, 1);
      if (g?.lat && g?.lng) {
        updateLocation(id, { lat: g.lat, lng: g.lng });
        clearPolygonFor(id);
      }
    } finally {
      setGeocodingIds((p) => ({ ...p, [id]: false }));
    }
  };

  // If the user types (without selecting a dropdown suggestion), geocode after a short pause.
  useEffect(() => {
    for (const loc of locations) {
      const hasCoords = typeof loc.lat === 'number' && typeof loc.lng === 'number';
      const hasText = (loc.address || '').trim().length >= 6;
      if (hasCoords || !hasText) continue;
      if (skipNextAutoGeocodeRef.current[loc.id]) {
        skipNextAutoGeocodeRef.current[loc.id] = false;
        continue;
      }
      if (geocodeTimersRef.current[loc.id]) clearTimeout(geocodeTimersRef.current[loc.id]);
      geocodeTimersRef.current[loc.id] = setTimeout(() => {
        geocodeLocation(loc.id, loc.address);
      }, 800);
    }
    return () => {
      // don't clear timers globally here; per-location updates handle it
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations.map(l => `${l.id}:${l.address}:${l.lat},${l.lng}`).join('|')]);

  // Fetch isolines for any location with coordinates.
  useEffect(() => {
    if (!canCompute) {
      setError(null);
      setOverlapStats({ hasOverlap: false });
      overlapGeoRef.current = null;
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const run = async () => {
      setError(null);
      const targets = locations.filter((l) => typeof l.lat === 'number' && typeof l.lng === 'number');
      // Mark all targets loading
      setLoadingIds((p) => {
        const next = { ...p };
        targets.forEach((t) => (next[t.id] = true));
        return next;
      });

      try {
        const results = await Promise.all(
          targets.map(async (loc) => {
            const key = `${loc.lat},${loc.lng}|${loc.timeMinutes}|${loc.mode}`;
            const coords = await fetchHereIsochrone({ lat: loc.lat!, lng: loc.lng! }, loc.timeMinutes, loc.mode, ac.signal);
            return { id: loc.id, key, coords };
          })
        );

        const nextPolys: Record<string, any> = {};
        results.forEach((r) => {
          if (r.coords) nextPolys[r.id] = { coords: r.coords, __key: r.key };
        });
        setPolygonsById(nextPolys);
      } catch (e) {
        if ((e as any)?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Failed to compute isochrones');
        setPolygonsById({});
      } finally {
        if (!ac.signal.aborted) {
          setLoadingIds((p) => {
            const next = { ...p };
            targets.forEach((t) => (next[t.id] = false));
            return next;
          });
        }
      }
    };

    const t = setTimeout(run, 250);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [canCompute, locations]);

  // Compute overlap polygon + centroid + area whenever all needed polygons are available.
  useEffect(() => {
    if (!canCompute) return;
    const active = locations.filter((l) => typeof l.lat === 'number' && typeof l.lng === 'number');
    const polys = active.map((l) => polygonsById[l.id]?.coords).filter(Boolean) as { lat: number; lng: number }[][];

    if (polys.length < 2) {
      setOverlapStats({ hasOverlap: false });
      overlapGeoRef.current = null;
      return;
    }

    try {
      let acc: Feature<Polygon | MultiPolygon> | null = null;
      for (const ring of polys) {
        const poly = toTurfPolygon(ring);
        if (!acc) {
          acc = poly as unknown as Feature<Polygon | MultiPolygon>;
          continue;
        }
        // Robust intersect (handles MultiPolygons + minor geometry issues).
        const next = intersectRobust(acc, poly as unknown as Feature<Polygon | MultiPolygon>);
        if (!next) {
          acc = null;
          break;
        }
        acc = next;
      }

      if (!acc) {
        setOverlapStats({ hasOverlap: false });
        overlapGeoRef.current = null;
        return;
      }

      overlapGeoRef.current = acc;
      const areaM2 = turf.area(acc);
      const areaSqMi = areaM2 / 2_589_988.110336; // m^2 -> sq mi
      const c = turf.centroid(acc);
      const center = { lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0] };
      setOverlapStats({ hasOverlap: true, areaSqMi, center });
    } catch (e) {
      console.error('Overlap computation failed', e);
      setOverlapStats({ hasOverlap: false });
      overlapGeoRef.current = null;
    }
  }, [canCompute, locations, polygonsById]);

  // Auto-resolve the overlap centroid to a display address (ideal meeting spot).
  useEffect(() => {
    const center = overlapStats.center;
    if (!overlapStats.hasOverlap || !center) {
      setMeetingSpotLoading(false);
      setOverlapStats((s) => ({ ...s, centerAddress: undefined }));
      if (meetingSpotAbortRef.current) meetingSpotAbortRef.current.abort();
      return;
    }

    if (meetingSpotAbortRef.current) meetingSpotAbortRef.current.abort();
    const ac = new AbortController();
    meetingSpotAbortRef.current = ac;

    setMeetingSpotLoading(true);
    const t = setTimeout(async () => {
      try {
        // reverseGeocode doesn't accept a signal; we can still abort the state update below.
        const rev = await reverseGeocode(center.lat, center.lng);
        if (ac.signal.aborted) return;
        const label = rev
          ? [rev.street, rev.adminArea5, rev.adminArea3, rev.postalCode].filter(Boolean).join(', ')
          : undefined;
        setOverlapStats((s) => ({ ...s, centerAddress: label }));
      } finally {
        if (!ac.signal.aborted) setMeetingSpotLoading(false);
      }
    }, 350);

    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [overlapStats.hasOverlap, overlapStats.center?.lat, overlapStats.center?.lng]);

  const overlapPolygonCoords = useMemo(() => {
    const f = overlapGeoRef.current;
    if (!f) return null;
    const geom = f.geometry;
    const firstRing = geom.type === 'Polygon'
      ? geom.coordinates?.[0]
      : geom.coordinates?.[0]?.[0];
    if (!firstRing || firstRing.length < 3) return null;
    return firstRing.map(([lng, lat]) => ({ lat, lng }));
  }, [overlapStats.hasOverlap, overlapStats.center?.lat, overlapStats.center?.lng, overlapStats.areaSqMi]); // recompute when overlap updates

  const onOverlapClick = async () => {
    if (!overlapStats.center) return;
    const rev = await reverseGeocode(overlapStats.center.lat, overlapStats.center.lng);
    const label = rev
      ? [rev.street, rev.adminArea5, rev.adminArea3, rev.postalCode].filter(Boolean).join(', ')
      : undefined;
    setOverlapStats((s) => ({ ...s, centerAddress: label }));
  };

  const markers = useMemo(() => {
    const ms: any[] = [];
    for (const loc of locations) {
      if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;
      ms.push({
        lat: loc.lat,
        lng: loc.lng,
        label: `${loc.label}${loc.address ? ` • ${loc.address}` : ''}`,
        color: loc.color,
        type: 'home',
        draggable: true,
        onDragEnd: async (lat: number, lng: number) => {
          updateLocation(loc.id, { lat, lng });
          // Clear cached polygon for this location so it recomputes.
          setPolygonsById((p) => {
            const next = { ...p };
            delete next[loc.id];
            return next;
          });
          try {
            const rev = await reverseGeocode(lat, lng);
            const label = rev ? [rev.street, rev.adminArea5, rev.adminArea3].filter(Boolean).join(', ') : '';
            updateLocation(loc.id, { address: label });
          } catch {
            // ignore
          }
        },
      });
    }

    if (overlapStats.hasOverlap && overlapStats.center) {
      ms.push({
        lat: overlapStats.center.lat,
        lng: overlapStats.center.lng,
        label: overlapStats.centerAddress ? `Ideal meeting spot • ${overlapStats.centerAddress}` : 'Ideal meeting spot',
        color: accentColor,
        type: 'poi',
        zIndexOffset: 1500,
      });
    }
    return ms;
  }, [locations, overlapStats, accentColor]);

  const polygons = useMemo(() => {
    const out: any[] = [];
    const active = locations.filter((l) => typeof l.lat === 'number' && typeof l.lng === 'number');
    for (const loc of active) {
      const poly = polygonsById[loc.id]?.coords;
      if (!poly) continue;
      out.push({
        coordinates: poly,
        color: loc.color,
        // Keep base isolines slightly more transparent so overlap stands out clearly.
        fillOpacity: 0.16,
        strokeWidth: 2,
      });
    }
    if (overlapPolygonCoords) {
      // Halo stroke for visibility
      out.push({
        coordinates: overlapPolygonCoords,
        color: '#ffffff',
        fillOpacity: 0,
        strokeWidth: 4,
      });
      out.push({
        coordinates: overlapPolygonCoords,
        // Use a *different* purple than any location color in COLORS so it reads as "intersection"
        // even when a location isoline is also purple.
        color: '#7C3AED', // violet-600
        fillOpacity: 0.58,
        strokeWidth: 3,
        onClick: () => {
          onOverlapClick();
        },
      });
    }
    return out;
  }, [locations, polygonsById, overlapPolygonCoords]);

  const mapCenter = useMemo(() => {
    const first = locations.find((l) => typeof l.lat === 'number' && typeof l.lng === 'number');
    return first ? { lat: first.lat!, lng: first.lng! } : { lat: 39.8283, lng: -98.5795 };
  }, [locations]);

  // Intentionally do not show an explicit "no overlap" callout; overlap can be visually inspected on the map.

  return (
    <div
      className="prism-widget w-full md:w-[980px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className="flex flex-col md:flex-row md:h-[640px]">
        {/* Map */}
        <div className="h-[320px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={mapQuestApiKey}
            center={mapCenter}
            zoom={locations.some((l) => l.lat != null && l.lng != null) ? 11 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            polygons={polygons}
          />
        </div>

        {/* Controls */}
        <div
          className="w-full md:w-[380px] flex-shrink-0 flex flex-col overflow-hidden border-t md:border-t-0 md:border-r md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex-1 overflow-y-auto prism-scrollbar p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${accentColor}15` }}
                >
                  <span style={{ color: accentColor }}><Crosshair className="w-4 h-4" /></span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold truncate" style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                    Isochrone Visualizer
                  </h3>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    Add 2–5 places and find the overlap zone
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addLocation}
                disabled={locations.length >= 5}
                className="prism-btn prism-btn-secondary"
                style={{ height: 36, paddingInline: 10 }}
                title={locations.length >= 5 ? 'Max 5 locations' : 'Add a location'}
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add</span>
              </button>
            </div>

            {error && (
              <div
                className="mb-3 p-2.5 rounded-lg text-xs flex items-start gap-2"
                style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              {locations.map((loc, idx) => {
                const isLoading = !!loadingIds[loc.id];
                const isGeocoding = !!geocodingIds[loc.id];
                const hasCoords = loc.lat != null && loc.lng != null;
                const hasPoly = !!polygonsById[loc.id]?.coords;
                return (
                  <div
                    key={loc.id}
                    className="p-3 rounded-xl"
                    style={{ background: 'var(--bg-panel)', border: `1px solid var(--border-subtle)` }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: loc.color }}
                        />
                        <input
                          value={loc.label}
                          onChange={(e) => updateLocation(loc.id, { label: e.target.value })}
                          className="text-sm font-semibold bg-transparent outline-none min-w-0"
                          style={{ color: 'var(--text-main)' }}
                        />
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />}
                        {isGeocoding && !isLoading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />}
                      </div>
                      {locations.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeLocation(loc.id)}
                          className="p-2 rounded-lg hover:bg-black/5"
                          title="Remove"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="mb-2">
                      <AddressAutocomplete
                        value={loc.address}
                        onChange={(v) => {
                          // If user edits the text, clear coords so it's obvious we need to re-resolve the location.
                          updateLocation(loc.id, { address: v, lat: undefined, lng: undefined });
                          clearPolygonFor(loc.id);
                        }}
                        onSelect={(r) => {
                          if (typeof r.lat === 'number' && typeof r.lng === 'number') {
                            // Prevent the auto-geocode effect from re-geocoding immediately after a suggestion selection.
                            skipNextAutoGeocodeRef.current[loc.id] = true;
                            updateLocation(loc.id, { lat: r.lat, lng: r.lng, address: r.displayString });
                            clearPolygonFor(loc.id);
                          }
                        }}
                        placeholder="Search an address..."
                        darkMode={darkMode}
                        inputBg={inputBg}
                        textColor={textColor}
                        mutedText={mutedText}
                        borderColor={borderColor}
                      />
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {!hasCoords
                            ? 'Pick a suggestion (or wait a moment to auto-geocode)'
                            : isLoading
                              ? 'Calculating isochrone…'
                              : hasPoly
                                ? 'Isochrone ready (drag marker to adjust)'
                                : 'Waiting for isochrone…'}
                        </span>
                        {(loc.lat != null && loc.lng != null) && (
                          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                            {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                          </span>
                        )}
                      </div>
                      {!hasCoords && (loc.address || '').trim().length >= 4 && (
                        <button
                          type="button"
                          onClick={() => geocodeLocation(loc.id, loc.address)}
                          className="mt-2 prism-btn prism-btn-secondary w-full"
                          style={{ height: 36 }}
                        >
                          {isGeocoding ? <><Loader2 className="w-4 h-4 prism-spinner" /> Geocoding…</> : 'Use typed address'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Time</div>
                        <select
                          className="prism-input w-full"
                          value={loc.timeMinutes}
                          onChange={(e) => {
                            updateLocation(loc.id, { timeMinutes: Number(e.target.value) as TravelTimePreset });
                            setPolygonsById((p) => {
                              const next = { ...p };
                              delete next[loc.id];
                              return next;
                            });
                          }}
                          style={{ height: 36 }}
                        >
                          {[15, 30, 45, 60].map((m) => (
                            <option key={m} value={m}>{m} min</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Mode</div>
                        <select
                          className="prism-input w-full"
                          value={loc.mode}
                          onChange={(e) => {
                            updateLocation(loc.id, { mode: e.target.value as ModeOption });
                            setPolygonsById((p) => {
                              const next = { ...p };
                              delete next[loc.id];
                              return next;
                            });
                          }}
                          style={{ height: 36 }}
                        >
                          <option value="drive">Drive</option>
                          <option value="walk">Walk</option>
                          <option value="bike">Bike</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ideal meeting spot (read-only) */}
            {overlapStats.hasOverlap && overlapStats.center && (
              <div
                className="mt-3 p-3 rounded-xl"
                style={{ background: 'var(--bg-panel)', border: `1px solid var(--border-subtle)` }}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                    style={{ background: '#7C3AED' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      Ideal meeting spot
                    </div>
                    <div className="text-sm mt-0.5" style={{ color: 'var(--text-main)' }}>
                      {meetingSpotLoading
                        ? 'Looking up address…'
                        : (overlapStats.centerAddress || 'Address unavailable')}
                    </div>
                    <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                      {overlapStats.center.lat.toFixed(5)}, {overlapStats.center.lng.toFixed(5)}
                    </div>
                  </div>
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            )}
          </div>
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
          <span>
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by <strong>MapQuest</strong>
          </span>
        </div>
      )}
    </div>
  );
}

