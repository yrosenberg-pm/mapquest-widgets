'use client';

import { useMemo, useState } from 'react';
import { Flame, CloudLightning, Database, SlidersHorizontal, RefreshCw } from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import WidgetHeader from './WidgetHeader';

type HeatMode = 'traffic' | 'weather' | 'custom';
type RegionId = 'los-angeles' | 'new-york' | 'chicago';

type HeatPoint = {
  lat: number;
  lng: number;
  intensity: number; // 0..1
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function mulberry32(seed: number) {
  // Small deterministic RNG
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kmToLatDegrees(km: number) {
  return km / 111;
}

function kmToLngDegrees(km: number, atLat: number) {
  const cos = Math.cos((atLat * Math.PI) / 180);
  return km / (111 * Math.max(0.15, cos));
}

function gradientColor(intensity01: number) {
  // Heatmap-y: blue -> green -> yellow -> red (220 -> 0)
  const t = clamp01(intensity01);
  const hue = 220 - 220 * t;
  return `hsl(${hue} 90% 55%)`;
}

function formatPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

const REGIONS: Record<RegionId, { name: string; center: { lat: number; lng: number }; zoom: number }> = {
  'los-angeles': { name: 'Los Angeles', center: { lat: 34.0522, lng: -118.2437 }, zoom: 10 },
  'new-york': { name: 'New York City', center: { lat: 40.7128, lng: -74.006 }, zoom: 11 },
  chicago: { name: 'Chicago', center: { lat: 41.8781, lng: -87.6298 }, zoom: 11 },
};

function buildClusters(region: RegionId, mode: HeatMode) {
  // Cluster centers (roughly plausible hotspots)
  if (region === 'los-angeles') {
    return mode === 'weather'
      ? [
          { lat: 34.0522, lng: -118.2437, strength: 0.9, spreadKm: 9 },
          { lat: 34.1397, lng: -118.0353, strength: 0.7, spreadKm: 7 },
          { lat: 33.9416, lng: -118.4085, strength: 0.6, spreadKm: 6 },
        ]
      : [
          { lat: 34.0522, lng: -118.2437, strength: 0.95, spreadKm: 7 },
          { lat: 34.1016, lng: -118.3269, strength: 0.75, spreadKm: 6 },
          { lat: 33.985, lng: -118.4695, strength: 0.6, spreadKm: 5 },
        ];
  }
  if (region === 'new-york') {
    return mode === 'weather'
      ? [
          { lat: 40.758, lng: -73.9855, strength: 0.85, spreadKm: 6 },
          { lat: 40.706, lng: -74.0086, strength: 0.7, spreadKm: 5 },
          { lat: 40.8448, lng: -73.8648, strength: 0.55, spreadKm: 7 },
        ]
      : [
          { lat: 40.758, lng: -73.9855, strength: 0.95, spreadKm: 5 },
          { lat: 40.7128, lng: -74.006, strength: 0.8, spreadKm: 5 },
          { lat: 40.7306, lng: -73.9352, strength: 0.65, spreadKm: 6 },
        ];
  }
  // chicago
  return mode === 'weather'
    ? [
        { lat: 41.8781, lng: -87.6298, strength: 0.85, spreadKm: 7 },
        { lat: 41.8339, lng: -87.872, strength: 0.65, spreadKm: 8 },
        { lat: 42.0411, lng: -87.6901, strength: 0.55, spreadKm: 6 },
      ]
    : [
        { lat: 41.8781, lng: -87.6298, strength: 0.95, spreadKm: 6 },
        { lat: 41.8955, lng: -87.6217, strength: 0.75, spreadKm: 5 },
        { lat: 41.79, lng: -87.6, strength: 0.6, spreadKm: 7 },
      ];
}

function generateHeatPoints(opts: {
  region: RegionId;
  mode: HeatMode;
  seed: number;
  pointsPerCluster: number;
  baseSpreadKm: number;
  intensityBoost: number; // 0..1
}): HeatPoint[] {
  const rng = mulberry32(opts.seed);
  const clusters = buildClusters(opts.region, opts.mode);
  const out: HeatPoint[] = [];

  for (const c of clusters) {
    const spreadKm = Math.max(1, c.spreadKm * (opts.baseSpreadKm / 6));
    const latSpread = kmToLatDegrees(spreadKm);
    const lngSpread = kmToLngDegrees(spreadKm, c.lat);

    for (let i = 0; i < opts.pointsPerCluster; i++) {
      // Box-muller-ish approximation (sum of uniforms)
      const u1 = (rng() + rng() + rng()) / 3;
      const u2 = (rng() + rng() + rng()) / 3;
      const dLat = (u1 - 0.5) * 2 * latSpread;
      const dLng = (u2 - 0.5) * 2 * lngSpread;

      const intensity = clamp01((c.strength * (0.55 + rng() * 0.45)) * (0.7 + opts.intensityBoost * 0.6));
      out.push({ lat: c.lat + dLat, lng: c.lng + dLng, intensity });
    }
  }

  // Add a few faint background points to make the map feel alive
  const regionCenter = REGIONS[opts.region].center;
  for (let i = 0; i < Math.max(10, Math.floor(opts.pointsPerCluster * 0.35)); i++) {
    const spreadKm = 18;
    const latSpread = kmToLatDegrees(spreadKm);
    const lngSpread = kmToLngDegrees(spreadKm, regionCenter.lat);
    const dLat = (rng() - 0.5) * 2 * latSpread;
    const dLng = (rng() - 0.5) * 2 * lngSpread;
    out.push({
      lat: regionCenter.lat + dLat,
      lng: regionCenter.lng + dLng,
      intensity: clamp01(0.12 + rng() * 0.22),
    });
  }

  return out;
}

function safeParseCustomPoints(raw: string): HeatPoint[] | null {
  const txt = raw.trim();
  if (!txt) return [];
  try {
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed) ? parsed : parsed?.points;
    if (!Array.isArray(arr)) return null;
    const pts: HeatPoint[] = [];
    for (const it of arr) {
      const lat = Number(it?.lat);
      const lng = Number(it?.lng);
      const intensity = clamp01(Number(it?.intensity ?? it?.weight ?? 0.5));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      pts.push({ lat, lng, intensity });
    }
    return pts;
  } catch {
    return null;
  }
}

export default function HeatmapDensity({
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
  const [mode, setMode] = useState<HeatMode>('traffic');
  const [region, setRegion] = useState<RegionId>('los-angeles');
  const [seed, setSeed] = useState(7);
  const [pointsPerCluster, setPointsPerCluster] = useState(55);
  const [baseRadiusMeters, setBaseRadiusMeters] = useState(1200);
  const [baseSpreadKm, setBaseSpreadKm] = useState(6);
  const [intensityBoost, setIntensityBoost] = useState(0.35);
  const [autoFit, setAutoFit] = useState(true);

  const [customRaw, setCustomRaw] = useState(
    JSON.stringify(
      [
        { lat: 34.0522, lng: -118.2437, intensity: 0.95 },
        { lat: 34.0622, lng: -118.2437, intensity: 0.75 },
        { lat: 34.0452, lng: -118.25, intensity: 0.6 },
        { lat: 34.0322, lng: -118.26, intensity: 0.55 },
      ],
      null,
      2
    )
  );

  const generatedPoints = useMemo(() => {
    if (mode === 'custom') {
      const parsed = safeParseCustomPoints(customRaw);
      return parsed ?? [];
    }
    return generateHeatPoints({
      region,
      mode,
      seed,
      pointsPerCluster,
      baseSpreadKm,
      intensityBoost,
    });
  }, [mode, region, seed, pointsPerCluster, baseSpreadKm, intensityBoost, customRaw]);

  const circles = useMemo(() => {
    // Heat illusion: stack multiple circles per point with decreasing opacity.
    const layers: Array<{
      lat: number;
      lng: number;
      radius: number;
      color: string;
      fillOpacity: number;
      strokeWeight: number;
      strokeOpacity: number;
    }> = [];

    for (const p of generatedPoints) {
      const color = gradientColor(p.intensity);
      const base = baseRadiusMeters * (0.75 + p.intensity * 0.7);

      layers.push({
        lat: p.lat,
        lng: p.lng,
        radius: base * 1.35,
        color,
        fillOpacity: 0.06 + p.intensity * 0.10,
        strokeWeight: 0,
        strokeOpacity: 0,
      });
      layers.push({
        lat: p.lat,
        lng: p.lng,
        radius: base * 1.0,
        color,
        fillOpacity: 0.10 + p.intensity * 0.16,
        strokeWeight: 0,
        strokeOpacity: 0,
      });
      layers.push({
        lat: p.lat,
        lng: p.lng,
        radius: base * 0.6,
        color,
        fillOpacity: 0.14 + p.intensity * 0.22,
        strokeWeight: 0,
        strokeOpacity: 0,
      });
    }

    return layers;
  }, [generatedPoints, baseRadiusMeters]);

  const fitBounds = useMemo(() => {
    if (!autoFit || circles.length === 0) return undefined;
    let north = -90;
    let south = 90;
    let east = -180;
    let west = 180;
    for (const p of generatedPoints) {
      north = Math.max(north, p.lat);
      south = Math.min(south, p.lat);
      east = Math.max(east, p.lng);
      west = Math.min(west, p.lng);
    }
    // Pad bounds slightly
    const padLat = 0.06;
    const padLng = 0.08;
    return { north: north + padLat, south: south - padLat, east: east + padLng, west: west - padLng };
  }, [autoFit, circles.length, generatedPoints]);

  const regionCfg = REGIONS[region];
  const bgPanel = 'var(--bg-panel)';
  const border = 'var(--border-subtle)';
  const textMain = 'var(--text-main)';
  const textMuted = 'var(--text-muted)';
  const icon =
    mode === 'traffic' ? <Flame className="w-4 h-4" /> : mode === 'weather' ? <CloudLightning className="w-4 h-4" /> : <Database className="w-4 h-4" />;

  const customParseOk = mode !== 'custom' ? true : safeParseCustomPoints(customRaw) !== null;

  return (
    <div
      className="prism-widget w-full md:w-[1100px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <WidgetHeader
        title="Heatmap Density"
        subtitle="Visualize hotspots for traffic, weather, or custom data."
        variant="impressive"
        layout="inline"
        icon={<Flame className="w-4 h-4" />}
      />
      <div className="flex flex-col md:flex-row md:h-[760px]">
        {/* Left panel */}
        <div className="w-full md:w-[420px] flex flex-col border-t md:border-t-0 md:border-r md:order-1" style={{ borderColor: border }}>
          <div className="p-4" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: textMain }}>Controls</div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar p-4 space-y-4">
            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
              <div className="flex items-center gap-2 mb-3">
                <SlidersHorizontal className="w-4 h-4" style={{ color: textMuted }} />
                <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: textMuted }}>
                  Dataset
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'traffic' as HeatMode, label: 'Traffic' },
                    { id: 'weather' as HeatMode, label: 'Weather' },
                    { id: 'custom' as HeatMode, label: 'Custom' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                    style={{
                      background: mode === m.id ? `${accentColor}18` : bgPanel,
                      border: `1px solid ${mode === m.id ? `${accentColor}45` : border}`,
                      color: mode === m.id ? accentColor : 'var(--text-secondary)',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                  Region
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value as RegionId)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold outline-none"
                  style={{ background: bgPanel, border: `1px solid ${border}`, color: textMain }}
                  disabled={mode === 'custom'}
                  title={mode === 'custom' ? 'Custom dataset controls region' : undefined}
                >
                  <option value="los-angeles">Los Angeles</option>
                  <option value="new-york">New York City</option>
                  <option value="chicago">Chicago</option>
                </select>
              </div>
            </div>

            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: textMuted }}>
                  Rendering
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
                  onClick={() => setSeed((s) => s + 1)}
                  style={{ background: bgPanel, border: `1px solid ${border}`, color: 'var(--text-secondary)' }}
                  disabled={mode === 'custom'}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reroll
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                    Hotspot size
                  </label>
                  <input
                    type="range"
                    min={600}
                    max={3000}
                    step={100}
                    value={baseRadiusMeters}
                    onChange={(e) => setBaseRadiusMeters(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor }}
                  />
                  <div className="text-xs mt-1" style={{ color: textMuted }}>
                    {Math.round(baseRadiusMeters)} m
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                    Intensity
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={intensityBoost}
                    onChange={(e) => setIntensityBoost(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor }}
                    disabled={mode === 'custom'}
                  />
                  <div className="text-xs mt-1" style={{ color: textMuted }}>
                    {formatPct(intensityBoost)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                    Cluster spread
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={14}
                    step={1}
                    value={baseSpreadKm}
                    onChange={(e) => setBaseSpreadKm(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor }}
                    disabled={mode === 'custom'}
                  />
                  <div className="text-xs mt-1" style={{ color: textMuted }}>
                    {baseSpreadKm} km
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                    Density
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={120}
                    step={5}
                    value={pointsPerCluster}
                    onChange={(e) => setPointsPerCluster(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor }}
                    disabled={mode === 'custom'}
                  />
                  <div className="text-xs mt-1" style={{ color: textMuted }}>
                    {pointsPerCluster} pts/cluster
                  </div>
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={autoFit} onChange={(e) => setAutoFit(e.target.checked)} style={{ accentColor }} />
                Auto-fit to hotspots
              </label>
            </div>

            {mode === 'custom' && (
              <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: `1px solid ${border}` }}>
                <div className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: textMuted }}>
                  Custom data (sample)
                </div>
                <p className="text-xs mb-2" style={{ color: textMuted }}>
                  Paste JSON: <span style={{ color: 'var(--text-secondary)' }}>array of</span> <code>{`{lat,lng,intensity}`}</code> (intensity 0..1).
                </p>
                <textarea
                  value={customRaw}
                  onChange={(e) => setCustomRaw(e.target.value)}
                  className="w-full h-[160px] rounded-xl p-3 text-xs font-mono outline-none prism-scrollbar"
                  style={{
                    background: bgPanel,
                    border: `1px solid ${customParseOk ? border : 'var(--color-error)'}`,
                    color: textMain,
                  }}
                />
                {!customParseOk && (
                  <div className="text-xs mt-2" style={{ color: 'var(--color-error)' }}>
                    Invalid JSON. Expected an array (or <code>{`{ points: [...] }`}</code>).
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Map */}
        <div className="h-[320px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={regionCfg.center}
            zoom={regionCfg.zoom}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            circles={circles as any}
            fitBounds={fitBounds}
            showZoomControls
            interactive
          />
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

