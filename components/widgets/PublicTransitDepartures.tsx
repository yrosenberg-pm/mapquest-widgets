// components/widgets/PublicTransitDepartures.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bus,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Train,
  TramFront,
  Ship,
  AlertTriangle,
  Filter,
  Locate,
  CircleDot,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import WidgetHeader from './WidgetHeader';
import AddressAutocomplete from '../AddressAutocomplete';
import MapQuestMap from './MapQuestMap';
import { geocode } from '@/lib/mapquest';

interface PublicTransitDeparturesProps {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
}

type TransitMode = 'bus' | 'rail' | 'subway' | 'tram' | 'ferry' | 'other';

interface TransitStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance: number;
  modes: TransitMode[];
}

interface Departure {
  lineId: string;
  lineName: string;
  direction: string;
  mode: TransitMode;
  scheduledTime: string;
  estimatedTime?: string;
  isRealtime: boolean;
  delayMinutes: number;
  status: 'on-time' | 'delayed' | 'cancelled';
}

interface DepartureGroup {
  lineId: string;
  lineName: string;
  direction: string;
  mode: TransitMode;
  departures: Departure[];
}

function classifyMode(transport: any): TransitMode {
  const mode = (transport?.mode || '').toLowerCase();
  const name = (transport?.name || '').toLowerCase();
  if (mode.includes('bus') || name.includes('bus')) return 'bus';
  if (mode.includes('subway') || mode.includes('metro') || name.includes('subway') || name.includes('metro')) return 'subway';
  if (mode.includes('tram') || mode.includes('light') || name.includes('tram') || name.includes('light rail')) return 'tram';
  if (mode.includes('rail') || mode.includes('train') || mode.includes('regional') || mode.includes('intercity') || name.includes('rail') || name.includes('train') || name.includes('amtrak') || name.includes('commuter')) return 'rail';
  if (mode.includes('ferry') || mode.includes('boat') || name.includes('ferry')) return 'ferry';
  return 'other';
}

function ModeIcon({ mode, className, style }: { mode: TransitMode; className?: string; style?: React.CSSProperties }) {
  const cn = className || 'w-4 h-4';
  switch (mode) {
    case 'bus': return <Bus className={cn} style={style} />;
    case 'rail': return <Train className={cn} style={style} />;
    case 'subway': return <CircleDot className={cn} style={style} />;
    case 'tram': return <TramFront className={cn} style={style} />;
    case 'ferry': return <Ship className={cn} style={style} />;
    default: return <Navigation className={cn} style={style} />;
  }
}

function modeColor(mode: TransitMode): string {
  switch (mode) {
    case 'bus': return '#F59E0B';
    case 'rail': return '#3B82F6';
    case 'subway': return '#8B5CF6';
    case 'tram': return '#10B981';
    case 'ferry': return '#06B6D4';
    default: return '#6B7280';
  }
}

function modeLabel(mode: TransitMode): string {
  switch (mode) {
    case 'bus': return 'Bus';
    case 'rail': return 'Rail';
    case 'subway': return 'Subway';
    case 'tram': return 'Tram';
    case 'ferry': return 'Ferry';
    default: return 'Other';
  }
}

// Lucide-style SVG icon paths (24x24 viewBox, stroke-based)
function modeIconStroke(mode: TransitMode): string {
  switch (mode) {
    case 'bus':
      return '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M3 10h18"/><path d="M7 16v2"/><path d="M17 16v2"/><circle cx="7" cy="13" r="1"/><circle cx="17" cy="13" r="1"/>';
    case 'rail':
      return '<rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="M12 3v7"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/><path d="M8 17l-2 4"/><path d="M16 17l2 4"/>';
    case 'subway':
      return '<rect x="5" y="2" width="14" height="15" rx="3"/><path d="M5 9h14"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/><path d="M9 17l-1.5 4"/><path d="M15 17l1.5 4"/>';
    case 'tram':
      return '<path d="M9 2l-1 2h8l-1-2"/><rect x="5" y="4" width="14" height="12" rx="2"/><path d="M5 10h14"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9 16l-2 5"/><path d="M15 16l2 5"/>';
    case 'ferry':
      return '<path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M4 18l2-8h12l2 8"/><path d="M12 4v6"/><circle cx="12" cy="4" r="2"/>';
    default:
      return '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>';
  }
}

const MARKER_SIZE = 40;

function transitMarkerSvg(mode: TransitMode, selected: boolean): string {
  const color = modeColor(mode);
  const s = selected ? 46 : MARKER_SIZE;
  const half = s / 2;
  const r = half - 2;
  const bg = selected ? color : '#FFFFFF';
  const fg = selected ? '#FFFFFF' : color;
  const borderColor = selected ? 'white' : color;
  const borderW = selected ? 3.5 : 2.5;
  const iconScale = s / 48;
  const iconOff = half - 12 * iconScale;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none">` +
      `<circle cx="${half}" cy="${half}" r="${r}" fill="${bg}" stroke="${borderColor}" stroke-width="${borderW}"/>` +
      `<g transform="translate(${iconOff},${iconOff}) scale(${iconScale})" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
        modeIconStroke(mode) +
      `</g>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function minutesUntil(iso: string): number {
  try {
    const d = new Date(iso);
    return Math.max(0, Math.round((d.getTime() - Date.now()) / 60000));
  } catch {
    return 0;
  }
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

export default function PublicTransitDepartures({
  accentColor = '#8B5CF6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: PublicTransitDeparturesProps) {
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const [stations, setStations] = useState<TransitStation[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [selectedStation, setSelectedStation] = useState<TransitStation | null>(null);

  const [departureGroups, setDepartureGroups] = useState<DepartureGroup[]>([]);
  const [loadingDepartures, setLoadingDepartures] = useState(false);
  const [departureError, setDepartureError] = useState<string | null>(null);

  const [modeFilter, setModeFilter] = useState<Set<TransitMode>>(new Set());
  const [stationModeFilter, setStationModeFilter] = useState<Set<TransitMode>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const lastRefreshRef = useRef(0);

  // Chat state
  interface ChatMsg { role: 'user' | 'assistant'; content: string }
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 150);
  }, [chatOpen]);

  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        try {
          const result = await geocode(`${loc.lat},${loc.lng}`);
          if (result) {
            const parts = [result.street, result.adminArea5, result.adminArea3].filter(Boolean);
            setAddress(parts.join(', ') || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
          }
        } catch { /* noop */ }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  const searchStations = useCallback(async (lat: number, lng: number) => {
    setLoadingStations(true);
    setStations([]);
    setSelectedStation(null);
    setDepartureGroups([]);
    setDepartureError(null);
    setStationModeFilter(new Set());

    try {
      const res = await fetch(`/api/here?endpoint=stations&in=${lat},${lng}%3Br%3D5000&maxPlaces=50`);
      if (!res.ok) throw new Error('Station search failed');
      const data = await res.json();

      const rawStations = data.stations || [];
      const allRawModes = rawStations.flatMap((s: any) =>
        (s.transports || s.place?.transports || []).map((t: any) => t?.mode)
      );
      const modeCounts: Record<string, number> = {};
      for (const m of allRawModes) modeCounts[m] = (modeCounts[m] || 0) + 1;
      console.log('[Transit] Station API response:', {
        totalStations: rawStations.length,
        rawModeCounts: modeCounts,
        stations: rawStations.map((s: any) => ({
          name: s.place?.name || s.name,
          modes: (s.transports || s.place?.transports || []).map((t: any) => t?.mode),
        })),
      });

      const R = 3959;
      const stationList: TransitStation[] = (data.stations || []).map((s: any) => {
        const sLat = s.place?.location?.lat ?? s.place?.lat ?? 0;
        const sLng = s.place?.location?.lng ?? s.place?.lng ?? 0;
        const dLat = (sLat - lat) * Math.PI / 180;
        const dLon = (sLng - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(sLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const transports: any[] = s.transports || s.place?.transports || [];
        const modes = [...new Set(transports.map(classifyMode))] as TransitMode[];

        return {
          id: s.place?.id || s.id || `${sLat}-${sLng}`,
          name: s.place?.name || s.name || 'Unknown Station',
          lat: sLat,
          lng: sLng,
          distance: Math.round(dist * 100) / 100,
          modes: modes.length > 0 ? modes : ['other' as TransitMode],
        };
      }).sort((a: TransitStation, b: TransitStation) => a.distance - b.distance);

      setStations(stationList);
    } catch (err) {
      console.error('Station search error:', err);
      setStations([]);
    } finally {
      setLoadingStations(false);
    }
  }, []);

  useEffect(() => {
    if (location) {
      searchStations(location.lat, location.lng);
    }
  }, [location, searchStations]);

  const fetchDepartures = useCallback(async (station: TransitStation) => {
    setLoadingDepartures(true);
    setDepartureError(null);
    setDepartureGroups([]);
    lastRefreshRef.current = Date.now();

    try {
      const res = await fetch(`/api/here?endpoint=departures&ids=${encodeURIComponent(station.id)}&maxPerBoard=15`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Departure fetch failed');
      }
      const data = await res.json();

      const boards = data.boards || [];
      const departures: Departure[] = [];

      for (const board of boards) {
        const deps = board.departures || [];
        for (const dep of deps) {
          const transport = dep.transport || {};
          const scheduledTime = dep.time || '';
          const estimatedTime = dep.estimatedTime || dep.realtime?.time || undefined;
          const delayMinutes = dep.realtime?.delay != null ? Math.round(dep.realtime.delay / 60) : 0;
          const cancelled = dep.realtime?.status === 'cancelled' || dep.cancelled === true;

          departures.push({
            lineId: transport.shortName || transport.name || transport.headsign || 'Line',
            lineName: transport.longName || transport.name || transport.shortName || 'Unknown',
            direction: transport.headsign || dep.headsign || dep.direction || '—',
            mode: classifyMode(transport),
            scheduledTime,
            estimatedTime,
            isRealtime: !!dep.realtime || !!estimatedTime,
            delayMinutes,
            status: cancelled ? 'cancelled' : delayMinutes > 2 ? 'delayed' : 'on-time',
          });
        }
      }

      const groupMap = new Map<string, DepartureGroup>();
      for (const dep of departures) {
        const key = `${dep.lineId}__${dep.direction}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            lineId: dep.lineId,
            lineName: dep.lineName,
            direction: dep.direction,
            mode: dep.mode,
            departures: [],
          });
        }
        const group = groupMap.get(key)!;
        if (group.departures.length < 3) {
          group.departures.push(dep);
        }
      }

      const groups = [...groupMap.values()].sort((a, b) => {
        const aTime = a.departures[0]?.scheduledTime || '';
        const bTime = b.departures[0]?.scheduledTime || '';
        return aTime.localeCompare(bTime);
      });

      setDepartureGroups(groups);
      if (groups.length === 0) {
        setDepartureError('No upcoming departures found for this station.');
      }
    } catch (err: any) {
      console.error('Departure fetch error:', err);
      setDepartureError(err.message || 'Could not load departures.');
    } finally {
      setLoadingDepartures(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStation) {
      fetchDepartures(selectedStation);
    }
  }, [selectedStation, fetchDepartures]);

  const handleRefresh = () => {
    if (selectedStation && !loadingDepartures) {
      setRefreshing(true);
      fetchDepartures(selectedStation);
    }
  };

  const buildTransitContext = useCallback(() => {
    const parts: string[] = ['WIDGET: Public Transit Departures'];
    if (address) parts.push(`LOCATION: ${address}`);
    if (location) parts.push(`COORDINATES: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`);

    parts.push(`\nNEARBY STATIONS: ${stations.length}`);
    if (stations.length > 0) {
      for (const s of stations.slice(0, 8)) {
        parts.push(`  - ${s.name} (${s.distance.toFixed(2)} mi) — modes: ${s.modes.join(', ')}`);
      }
    }

    if (selectedStation) {
      parts.push(`\nSELECTED STATION: ${selectedStation.name}`);
      parts.push(`  Distance: ${selectedStation.distance.toFixed(2)} mi`);
      parts.push(`  Modes: ${selectedStation.modes.join(', ')}`);

      if (departureGroups.length > 0) {
        parts.push(`\nUPCOMING DEPARTURES (${departureGroups.length} lines):`);
        for (const g of departureGroups) {
          const depTimes = g.departures.map(d => {
            const mins = Math.max(0, Math.round((new Date(d.estimatedTime || d.scheduledTime).getTime() - Date.now()) / 60000));
            const status = d.status === 'cancelled' ? ' [CANCELLED]' : d.status === 'delayed' ? ` [DELAYED +${d.delayMinutes}min]` : '';
            const live = d.isRealtime ? ' (live)' : ' (scheduled)';
            return `${mins}min${live}${status}`;
          }).join(', ');
          parts.push(`  - ${g.lineName} → ${g.direction} (${g.mode}): ${depTimes}`);
        }
      } else if (!loadingDepartures) {
        parts.push(`\nNo departures loaded yet for this station.`);
      }
    } else {
      parts.push(`\nNo station selected yet. The user needs to select a station from the list.`);
    }

    if (!location && stations.length === 0) {
      parts.push(`\nNo location entered yet. The user needs to enter a location or allow geolocation first.`);
    }

    return parts.join('\n');
  }, [address, location, stations, selectedStation, departureGroups, loadingDepartures]);

  const sendChatMessage = useCallback(async (text?: string) => {
    const msg = text ?? chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    const userMsg: ChatMsg = { role: 'user', content: msg };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/widget-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: chatMessages.slice(-10),
          context: buildTransitContext(),
          lat: location?.lat,
          lng: location?.lng,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${data.error}` }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t connect to the assistant. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, buildTransitContext, location]);

  const availableModes = [...new Set(departureGroups.map(g => g.mode))];
  const filteredGroups = modeFilter.size === 0
    ? departureGroups
    : departureGroups.filter(g => modeFilter.has(g.mode));

  const toggleMode = (m: TransitMode) => {
    setModeFilter(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const availableStationModes = [...new Set(stations.flatMap(s => s.modes))];
  const filteredStations = stationModeFilter.size === 0
    ? stations
    : stations.filter(s => s.modes.some(m => stationModeFilter.has(m)));

  const toggleStationMode = (m: TransitMode) => {
    setStationModeFilter(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const mapCenter = selectedStation
    ? { lat: selectedStation.lat, lng: selectedStation.lng }
    : location || { lat: 40.7128, lng: -74.006 };

  const markers = [
    ...(location ? [{ lat: location.lat, lng: location.lng, label: 'Your Location', color: '#16A34A', type: 'home' as const }] : []),
    ...(selectedStation ? stations : filteredStations).map(s => {
      const isSelected = selectedStation?.id === s.id;
      const primaryMode = s.modes[0] || 'other';
      const sz = isSelected ? 46 : MARKER_SIZE;
      return {
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        color: modeColor(primaryMode),
        iconUrl: transitMarkerSvg(primaryMode, isSelected),
        iconSize: [sz, sz] as [number, number],
        iconCircular: false,
        zIndexOffset: isSelected ? 100 : 0,
        onClick: () => setSelectedStation(s),
      };
    }),
  ];

  return (
    <div
      className="prism-widget w-full md:w-[1000px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <WidgetHeader
        title="Upcoming Departures"
        subtitle={selectedStation ? selectedStation.name : 'Find nearby transit departures'}
        variant="impressive"
        layout="inline"
        icon={<Train className="w-4 h-4" />}
        right={
          selectedStation ? (
            <button
              onClick={handleRefresh}
              disabled={loadingDepartures}
              className="p-2 rounded-lg transition-colors hover:bg-black/5"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Refresh departures"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          ) : null
        }
      />

      <div className="flex flex-col md:flex-row md:h-[620px]">
        {/* Map */}
        <div className="relative h-[280px] md:h-auto md:w-[55%] md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={location ? 15 : 12}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            zoomToLocation={selectedStation ? { lat: selectedStation.lat, lng: selectedStation.lng, zoom: 16 } : undefined}
          />

          {/* Chat overlay — bottom-right of map */}
          <div className="absolute bottom-3 right-3 z-[1000]" style={{ pointerEvents: 'auto' }}>
            {chatOpen ? (
              <div
                className="flex flex-col rounded-2xl overflow-hidden shadow-xl"
                style={{
                  width: 340,
                  height: 380,
                  background: 'var(--bg-widget)',
                  border: '1px solid var(--border-subtle)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-main)' }}>
                    Transit Assistant
                  </span>
                  <button
                    onClick={() => setChatOpen(false)}
                    className="p-1 rounded-md transition-colors hover:bg-black/5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto prism-scrollbar px-3 py-2 space-y-2">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-6">
                      <Sparkles className="w-6 h-6 mx-auto mb-2" style={{ color: accentColor, opacity: 0.5 }} />
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Ask me about transit departures
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                        {[
                          'When is the next bus?',
                          'Which lines run here?',
                          'Any delays right now?',
                        ].map(q => (
                          <button
                            key={q}
                            onClick={() => sendChatMessage(q)}
                            className="text-[10px] px-2 py-1 rounded-full transition-colors"
                            style={{
                              background: accentColor + '15',
                              color: accentColor,
                              border: `1px solid ${accentColor}30`,
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className="max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                        style={
                          msg.role === 'user'
                            ? { background: accentColor, color: 'white', borderBottomRightRadius: 4 }
                            : { background: 'var(--bg-input)', color: 'var(--text-main)', borderBottomLeftRadius: 4 }
                        }
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div
                        className="px-3 py-2 rounded-xl text-xs"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', borderBottomLeftRadius: 4 }}
                      >
                        <span className="inline-flex gap-1">
                          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div
                  className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                  style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}
                >
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                    placeholder="Ask about departures..."
                    className="flex-1 text-xs px-3 py-2 rounded-lg outline-none"
                    style={{
                      background: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => sendChatMessage()}
                    disabled={!chatInput.trim() || chatLoading}
                    className="p-2 rounded-lg transition-colors disabled:opacity-30"
                    style={{ background: accentColor, color: 'white' }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all hover:scale-105"
                style={{
                  background: 'var(--bg-widget)',
                  border: '1px solid var(--border-subtle)',
                  color: accentColor,
                }}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-semibold">Ask AI</span>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div
          className="w-full md:w-[45%] flex flex-col overflow-hidden border-t md:border-t-0 md:border-r md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Location input */}
          <div
            className="p-4"
            style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}
          >
            <div
              className="rounded-xl flex items-center gap-2.5"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
            >
              <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={(result) => {
                  if (result.lat && result.lng) {
                    setLocation({ lat: result.lat, lng: result.lng });
                  }
                }}
                placeholder="Enter a location..."
                darkMode={darkMode}
                inputBg={inputBg}
                textColor={textColor}
                mutedText={mutedText}
                borderColor={borderColor}
                className="flex-1"
                hideIcon
              />
              <button
                onClick={detectLocation}
                disabled={locating}
                className="p-1.5 rounded-lg transition-colors hover:bg-black/5 flex-shrink-0"
                style={{ color: locating ? accentColor : 'var(--text-muted)' }}
                title="Use my location"
                aria-label="Detect my location"
              >
                <Locate className={`w-4 h-4 ${locating ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          </div>

          {/* Station list or Departures */}
          <div className="flex-1 overflow-y-auto prism-scrollbar">
            {!selectedStation ? (
              /* Station picker */
              <div className="p-3">
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {loadingStations ? 'Searching nearby stations...' : stations.length > 0 ? 'Nearby Stations' : 'Enter a location to find stations'}
                </div>

                {/* Transit mode filter pills */}
                {availableStationModes.length > 1 && !loadingStations && (
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap px-1">
                    <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <button
                      onClick={() => setStationModeFilter(new Set())}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: stationModeFilter.size === 0 ? `${accentColor}20` : 'var(--bg-panel)',
                        color: stationModeFilter.size === 0 ? accentColor : 'var(--text-muted)',
                        border: `1px solid ${stationModeFilter.size === 0 ? `${accentColor}40` : 'var(--border-subtle)'}`,
                        opacity: stationModeFilter.size === 0 ? 1 : 0.6,
                      }}
                    >
                      All
                    </button>
                    {availableStationModes.map(m => {
                      const active = stationModeFilter.has(m);
                      return (
                        <button
                          key={m}
                          onClick={() => toggleStationMode(m)}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors flex items-center gap-1"
                          style={{
                            background: active ? `${modeColor(m)}20` : 'var(--bg-panel)',
                            color: active ? modeColor(m) : 'var(--text-muted)',
                            border: `1px solid ${active ? `${modeColor(m)}40` : 'var(--border-subtle)'}`,
                            opacity: active ? 1 : 0.6,
                          }}
                        >
                          <ModeIcon mode={m} className="w-3 h-3" />
                          {modeLabel(m)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {loadingStations && (
                  <div className="flex items-center gap-2 p-4 justify-center" style={{ color: 'var(--text-muted)' }}>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Finding stations...</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  {filteredStations.map(station => (
                    <button
                      key={station.id}
                      onClick={() => setSelectedStation(station)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left"
                      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${accentColor}08`)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${modeColor(station.modes[0])}15`, color: modeColor(station.modes[0]) }}
                      >
                        <ModeIcon mode={station.modes[0]} className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-main)' }}>
                          {station.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {station.distance.toFixed(2)} mi
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>·</span>
                          <div className="flex items-center gap-1">
                            {station.modes.map(m => (
                              <span
                                key={m}
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: `${modeColor(m)}15`, color: modeColor(m) }}
                              >
                                {modeLabel(m)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    </button>
                  ))}
                </div>
                {!loadingStations && filteredStations.length === 0 && stations.length > 0 && stationModeFilter.size > 0 && (
                  <div className="text-center py-6">
                    <Filter className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No stations match the selected filter.
                    </p>
                    <button
                      onClick={() => setStationModeFilter(new Set())}
                      className="text-[10px] font-semibold mt-2 px-3 py-1 rounded-full transition-colors"
                      style={{ color: accentColor, background: `${accentColor}10` }}
                    >
                      Clear filter
                    </button>
                  </div>
                )}
                {!loadingStations && stations.length === 0 && location && (
                  <div className="text-center py-8">
                    <Train className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No transit stations found nearby.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Departures view */
              <div className="p-3">
                {/* Back + station info */}
                <button
                  onClick={() => {
                    setSelectedStation(null);
                    setDepartureGroups([]);
                    setDepartureError(null);
                    setModeFilter(new Set());
                  }}
                  className="flex items-center gap-1.5 text-xs mb-3 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-180" /> All Stations
                </button>

                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${accentColor}15`, color: accentColor }}
                  >
                    <ModeIcon mode={selectedStation.modes[0]} className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                      {selectedStation.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {selectedStation.modes.map(m => (
                        <span
                          key={m}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: `${modeColor(m)}15`, color: modeColor(m) }}
                        >
                          {modeLabel(m)}
                        </span>
                      ))}
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        · {selectedStation.distance.toFixed(2)} mi
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mode filter pills */}
                {availableModes.length > 1 && (
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    <Filter className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    {availableModes.map(m => {
                      const active = modeFilter.size === 0 || modeFilter.has(m);
                      return (
                        <button
                          key={m}
                          onClick={() => toggleMode(m)}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                          style={{
                            background: active ? `${modeColor(m)}20` : 'var(--bg-panel)',
                            color: active ? modeColor(m) : 'var(--text-muted)',
                            border: `1px solid ${active ? `${modeColor(m)}40` : 'var(--border-subtle)'}`,
                            opacity: active ? 1 : 0.6,
                          }}
                        >
                          {modeLabel(m)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Loading state */}
                {loadingDepartures && (
                  <div className="flex items-center gap-2 p-6 justify-center" style={{ color: 'var(--text-muted)' }}>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading departures...</span>
                  </div>
                )}

                {/* Error state */}
                {departureError && !loadingDepartures && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl text-xs"
                    style={{ background: 'var(--color-error-bg, #FEF2F2)', color: 'var(--color-error, #DC2626)' }}
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {departureError}
                  </div>
                )}

                {/* Departure groups */}
                {!loadingDepartures && filteredGroups.length > 0 && (
                  <div className="space-y-3">
                    {filteredGroups.map((group, gi) => {
                      const mc = modeColor(group.mode);
                      return (
                        <div
                          key={`${group.lineId}-${group.direction}-${gi}`}
                          className="rounded-xl overflow-hidden"
                          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                        >
                          {/* Group header */}
                          <div className="flex items-center gap-3 px-3.5 py-3">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ background: mc, boxShadow: `0 2px 8px ${mc}40` }}
                            >
                              <ModeIcon mode={group.mode} className="w-4 h-4" style={{ color: 'white' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded"
                                  style={{ background: `${mc}18`, color: mc }}
                                >
                                  {group.lineId.length > 6 ? group.lineId.slice(0, 6) : group.lineId}
                                </span>
                                <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                                  {group.lineName !== group.lineId ? group.lineName : ''}
                                </span>
                              </div>
                              <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                                {group.direction}
                              </div>
                            </div>
                          </div>

                          {/* Departure times */}
                          <div
                            className="mx-3.5 mb-3 rounded-lg overflow-hidden"
                            style={{ border: '1px solid var(--border-subtle)' }}
                          >
                            {group.departures.map((dep, di) => {
                              const mins = minutesUntil(dep.estimatedTime || dep.scheduledTime);
                              const timeStr = formatTime(dep.estimatedTime || dep.scheduledTime);
                              const isFirst = di === 0;
                              const urgentColor = mins <= 2 ? '#EF4444' : mins <= 8 ? '#F59E0B' : '#22C55E';
                              return (
                                <div
                                  key={di}
                                  className="flex items-center gap-3 px-3 py-2.5"
                                  style={{
                                    background: isFirst ? `${urgentColor}06` : 'transparent',
                                    borderTop: di > 0 ? '1px solid var(--border-subtle)' : 'none',
                                  }}
                                >
                                  {/* Countdown badge */}
                                  <div
                                    className="w-14 flex-shrink-0 text-center rounded-lg py-1"
                                    style={{
                                      background: isFirst ? `${urgentColor}14` : 'var(--bg-input)',
                                      color: isFirst ? urgentColor : 'var(--text-muted)',
                                    }}
                                  >
                                    <div className="text-sm font-bold tabular-nums leading-tight">
                                      {mins === 0 ? 'Now' : `${mins}`}
                                    </div>
                                    {mins > 0 && (
                                      <div className="text-[8px] font-semibold uppercase tracking-wider leading-tight">min</div>
                                    )}
                                  </div>

                                  {/* Time + badges */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                                      <span
                                        className="text-[13px] font-medium tabular-nums"
                                        style={{ color: 'var(--text-main)' }}
                                      >
                                        {timeStr}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      {dep.isRealtime ? (
                                        <span
                                          className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-px rounded"
                                          style={{ background: '#22C55E18', color: '#16A34A' }}
                                        >
                                          Live
                                        </span>
                                      ) : (
                                        <span
                                          className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-px rounded"
                                          style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}
                                        >
                                          Scheduled
                                        </span>
                                      )}
                                      {dep.status === 'delayed' && (
                                        <span
                                          className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-px rounded"
                                          style={{ background: '#F59E0B18', color: '#D97706' }}
                                        >
                                          +{dep.delayMinutes} min late
                                        </span>
                                      )}
                                      {dep.status === 'cancelled' && (
                                        <span
                                          className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-px rounded"
                                          style={{ background: '#EF444418', color: '#DC2626' }}
                                        >
                                          Cancelled
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No departures after filter */}
                {!loadingDepartures && !departureError && filteredGroups.length === 0 && departureGroups.length > 0 && (
                  <div className="text-center py-6">
                    <Filter className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No departures match the selected filter.
                    </p>
                  </div>
                )}
              </div>
            )}
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
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
