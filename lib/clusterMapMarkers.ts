import { demoPinColorName, type ClusterDemoStop } from './hereClusterDemoStops';

/** Teardrop pin footprint for individual stops. */
export const PIN_W = 28;
export const PIN_H = 36;
export const PIN_ANCHOR: [number, number] = [14, 36];
/** Circle cluster icon — same anchor as a pin so clusters sit on the map consistently. */
export const CLUSTER_CIRCLE_SIZE = 28;
export const CLUSTER_ANCHOR: [number, number] = [14, 14];
/** Stacking for cluster demo markers (MapQuestMap uses el.style.zIndex). */
export const DEMO_PIN_MARKER_Z = 400;
export const DEMO_CLUSTER_MARKER_Z = 800;
export const DEMO_CLUSTER_HOVER_Z = 100_000;

export type ClusterStyleMode = 'by-color' | 'all-pins' | 'off';

export type ClusterMapMarker = {
  lat: number;
  lng: number;
  label?: string;
  /** On touch, first tap pins tooltip; second tap runs onClick (drill-in). */
  touchTooltipFirst?: boolean;
  /** All-pins cluster breakdown — rendered in map overlay (not inline). */
  clusterBreakdownTooltip?: {
    total: number;
    rows: Array<{ color: string; colorName: string; count: number }>;
  };
  color?: string;
  type?: 'default';
  iconUrl?: string;
  iconSize?: [number, number];
  iconAnchor?: [number, number];
  iconCircular?: boolean;
  clusterable?: boolean;
  iconOpacity?: number;
  zIndexOffset?: number;
  onClick?: () => void;
};

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function stopPinIconUrl(color: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 28 36" fill="none" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.25))">
      <path d="M14 1C7.373 1 2 6.373 2 13c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="${color}" stroke="white" stroke-width="2.5"/>
    </svg>
  `.trim();
  return svgDataUri(svg);
}

const DONUT_ICON_CACHE = new Map<string, string>();
const SOLID_CLUSTER_ICON_CACHE = new Map<string, string>();

export type ClusterSizeTier = 'S' | 'M' | 'L';

export function clusterCountTier(count: number): ClusterSizeTier {
  if (count >= 50) return 'L';
  if (count >= 10) return 'M';
  return 'S';
}

export function formatClusterCountLabel(count: number): string {
  return count > 999 ? '999+' : String(count);
}

export function clusterTierMetrics(count: number) {
  const tier = clusterCountTier(count);
  const size = tier === 'L' ? 46 : tier === 'M' ? 38 : 32;
  const fontSize = tier === 'L' ? 17 : tier === 'M' ? 15 : 13;
  const ringThickness = tier === 'L' ? 6 : tier === 'M' ? 5 : 4;
  const anchor: [number, number] = [size / 2, size / 2];
  return { tier, size, fontSize, ringThickness, anchor };
}

/** All-pins donut clusters — slightly larger ring + label for color breakdown readability. */
export function clusterAllPinsTierMetrics(count: number) {
  const tier = clusterCountTier(count);
  const size = tier === 'L' ? 52 : tier === 'M' ? 44 : 36;
  const fontSize = tier === 'L' ? 18 : tier === 'M' ? 16 : 14;
  const ringThickness = tier === 'L' ? 7 : tier === 'M' ? 6 : 5;
  const anchor: [number, number] = [size / 2, size / 2];
  return { tier, size, fontSize, ringThickness, anchor };
}

function roundCountsForCacheKey(total: number, counts: Map<string, number>, tier: ClusterSizeTier): string {
  const step = total >= 500 ? 10 : total >= 50 ? 5 : 1;
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([color, n]) => `${color}:${Math.round(n / step) * step}`);
  return `${tier}|${total}|${parts.join('|')}`;
}

function aggregateColorCounts(members: ClusterDemoStop[], fallback: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const member of members) {
    const color = stopColor(member, fallback);
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return counts;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function annularSegmentPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
): string {
  const startOuter = polarToCartesian(cx, cy, outerR, startDeg);
  const endOuter = polarToCartesian(cx, cy, outerR, endDeg);
  const startInner = polarToCartesian(cx, cy, innerR, endDeg);
  const endInner = polarToCartesian(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

/** Donut cluster — ring segments by color share, dark center with white count. */
export function multiColorClusterDonutIconUrl(total: number, colorCounts: Map<string, number>) {
  const { tier, size, fontSize, ringThickness } = clusterAllPinsTierMetrics(total);
  const cacheKey = roundCountsForCacheKey(total, colorCounts, tier);
  const cached = DONUT_ICON_CACHE.get(cacheKey);
  if (cached) return cached;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 1;
  const innerR = outerR - ringThickness;
  const gapDeg = colorCounts.size > 1 ? 2 : 0;
  const entries = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalGap = gapDeg * entries.length;
  const avail = Math.max(0, 360 - totalGap);
  let cursor = -90;
  const segments: string[] = [];
  for (const [color, count] of entries) {
    const sweep = (count / total) * avail;
    if (sweep <= 0) continue;
    const end = cursor + sweep;
    segments.push(
      `<path d="${annularSegmentPath(cx, cy, innerR, outerR, cursor, end)}" fill="${color}"/>`,
    );
    cursor = end + gapDeg;
  }

  const label = formatClusterCountLabel(total);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25))">
      ${segments.join('\n')}
      <circle cx="${cx}" cy="${cy}" r="${Math.max(0, innerR - 0.5)}" fill="#1A1A1F"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
            font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
            font-size="${fontSize}" font-weight="700" fill="#ffffff">${label}</text>
    </svg>
  `.trim();
  const uri = svgDataUri(svg);
  DONUT_ICON_CACHE.set(cacheKey, uri);
  return uri;
}

export function buildClusterBreakdownTooltip(
  total: number,
  colorCounts: Map<string, number>,
): ClusterMapMarker['clusterBreakdownTooltip'] {
  return {
    total,
    rows: [...colorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([color, count]) => ({
        color,
        colorName: demoPinColorName(color),
        count,
      })),
  };
}

/** Solid circle cluster (by-color mode). */
export function clusterPinIconUrl(count: number, fill = '#111827') {
  const { tier, size, fontSize } = clusterTierMetrics(count);
  const label = formatClusterCountLabel(count);
  const cacheKey = `${tier}|${fill}|${label}`;
  const cached = SOLID_CLUSTER_ICON_CACHE.get(cacheKey);
  if (cached) return cached;

  const r = size / 2;
  const fillR = r - 2;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25))">
      <circle cx="${r}" cy="${r}" r="${fillR}" fill="${fill}" stroke="white" stroke-width="2"/>
      <text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="middle"
            font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
            font-size="${fontSize}" font-weight="700" fill="white">${label}</text>
    </svg>
  `.trim();
  const uri = svgDataUri(svg);
  SOLID_CLUSTER_ICON_CACHE.set(cacheKey, uri);
  return uri;
}

function latLngToPixel(lat: number, lng: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  return { x, y };
}

function pixelToLatLng(x: number, y: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function stopColor(stop: ClusterDemoStop, fallback: string) {
  return stop.color || fallback;
}

/** When a cluster mixes pin colors (regional/national view), use the most common one. */
function dominantStopColor(members: ClusterDemoStop[], fallback: string) {
  const counts = new Map<string, number>();
  for (const member of members) {
    const color = stopColor(member, fallback);
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  let best = fallback;
  let max = 0;
  for (const [color, count] of counts) {
    if (count > max) {
      max = count;
      best = color;
    }
  }
  return best;
}

function minPixelSeparation(stops: ClusterDemoStop[], zoom: number) {
  if (stops.length < 2) return Infinity;
  const pxPoints = stops.map((s) => latLngToPixel(s.lat, s.lng, zoom));
  let minDist = Infinity;
  for (let i = 0; i < pxPoints.length; i++) {
    for (let j = i + 1; j < pxPoints.length; j++) {
      const dx = pxPoints[i].x - pxPoints[j].x;
      const dy = pxPoints[i].y - pxPoints[j].y;
      minDist = Math.min(minDist, Math.hypot(dx, dy));
    }
  }
  return minDist;
}

/** Spread overlapping stops in a ring so every pin is visible after expanding a cluster. */
export function buildSpiderPinMarkers(
  stops: ClusterDemoStop[],
  zoom: number,
  fallbackColor: string,
): ClusterMapMarker[] {
  const pinSize: [number, number] = [PIN_W, PIN_H];
  if (stops.length === 0) return [];
  if (stops.length === 1) {
    const stop = stops[0];
    return [
      {
        lat: stop.lat,
        lng: stop.lng,
        color: stopColor(stop, fallbackColor),
        iconUrl: stopPinIconUrl(stopColor(stop, fallbackColor)),
        iconSize: pinSize,
        iconAnchor: PIN_ANCHOR,
        iconCircular: false,
        clusterable: false,
        zIndexOffset: DEMO_PIN_MARKER_Z,
      },
    ];
  }

  const centroidLat = stops.reduce((s, m) => s + m.lat, 0) / stops.length;
  const centroidLng = stops.reduce((s, m) => s + m.lng, 0) / stops.length;
  const centerPx = latLngToPixel(centroidLat, centroidLng, zoom);
  const needsSpider = minPixelSeparation(stops, zoom) < PIN_W * 0.9;
  const radiusPx = Math.max(32, 16 + stops.length * 5);

  return stops.map((stop, idx) => {
    const color = stopColor(stop, fallbackColor);
    const pinIcon = stopPinIconUrl(color);
    if (!needsSpider) {
      return {
        lat: stop.lat,
        lng: stop.lng,
        color,
        iconUrl: pinIcon,
        iconSize: pinSize,
        iconAnchor: PIN_ANCHOR,
        iconCircular: false,
        clusterable: false,
        zIndexOffset: DEMO_PIN_MARKER_Z,
      };
    }
    const angle = (2 * Math.PI * idx) / stops.length - Math.PI / 2;
    const p = pixelToLatLng(
      centerPx.x + radiusPx * Math.cos(angle),
      centerPx.y + radiusPx * Math.sin(angle),
      zoom,
    );
    return {
      lat: p.lat,
      lng: p.lng,
      color,
      iconUrl: pinIcon,
      iconSize: pinSize,
      iconAnchor: PIN_ANCHOR,
      iconCircular: false,
      clusterable: false,
      zIndexOffset: DEMO_PIN_MARKER_Z,
    };
  });
}

/** Bounds that include spider-expanded positions at the current zoom. */
export function boundsForExpandedCluster(
  stops: ClusterDemoStop[],
  zoom: number,
  padDeg = 0.00035,
) {
  const markers = buildSpiderPinMarkers(stops, zoom, '#000');
  return boundsFromPoints(markers, padDeg);
}

/** All stops as individual pins (no clustering). */
export function buildIndividualPinMarkers(
  stops: ClusterDemoStop[],
  fallbackColor: string,
): ClusterMapMarker[] {
  const pinSize: [number, number] = [PIN_W, PIN_H];
  return stops.map((stop) => {
    const color = stopColor(stop, fallbackColor);
    return {
      lat: stop.lat,
      lng: stop.lng,
      color,
      iconUrl: stopPinIconUrl(color),
      iconSize: pinSize,
      iconAnchor: PIN_ANCHOR,
      iconCircular: false,
      clusterable: false,
      zIndexOffset: DEMO_PIN_MARKER_Z,
    };
  });
}

export type ViewportBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

/** Above this zoom, prefer individual pins (Mapbox Supercluster default maxZoom is 16). */
export const DEFAULT_MAX_CLUSTER_ZOOM = 12;
/** At/above this zoom, clusters only merge same-color pins; below = one cluster per cell. */
export const DEFAULT_COLOR_CLUSTER_MIN_ZOOM = 11;
/** Neutral bubble for regional/national clusters that combine all pin colors. */
export const UNIFIED_CLUSTER_COLOR = '#111827';
/** Max individual DOM markers before falling back to light clustering in dense viewports. */
export const VIEWPORT_INDIVIDUAL_PIN_CAP = 400;

export function filterStopsInViewport(
  stops: ClusterDemoStop[],
  bounds: ViewportBounds | null | undefined,
  padRatio = 0.12,
): ClusterDemoStop[] {
  if (!bounds) return stops;
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const latPad = latSpan * padRatio;
  const lngPad = lngSpan * padRatio;
  const north = bounds.north + latPad;
  const south = bounds.south - latPad;
  const east = bounds.east + lngPad;
  const west = bounds.west - lngPad;
  return stops.filter(
    (s) => s.lat >= south && s.lat <= north && s.lng >= west && s.lng <= east,
  );
}

function effectiveCellPx(zoom: number, eps: number): number {
  const base = Math.max(8, Math.min(128, eps));
  if (zoom <= 10) return base;
  const shrink = 0.7 ** (zoom - 10);
  return Math.max(12, Math.round(base * shrink));
}

function effectiveMinWeight(_zoom: number, minWeight: number, _maxClusterZoom: number): number {
  return minWeight;
}

function clusterStopsToMarkers(opts: {
  stops: ClusterDemoStop[];
  zoom: number;
  cellPx: number;
  minWeight: number;
  accentColor: string;
  groupByColor: boolean;
  clusterStyle: ClusterStyleMode;
  touchTooltipFirst?: boolean;
  onClusterTap?: (weight: number, lat: number, lng: number, members: ClusterDemoStop[]) => void;
  spiderIds: Set<string>;
}): ClusterMapMarker[] {
  const {
    stops,
    zoom,
    cellPx,
    minWeight,
    accentColor,
    groupByColor,
    clusterStyle,
    touchTooltipFirst = false,
    onClusterTap,
    spiderIds,
  } = opts;
  const pinSize: [number, number] = [PIN_W, PIN_H];
  const buckets = new Map<string, ClusterDemoStop[]>();

  for (const stop of stops) {
    if (spiderIds.has(stop.id)) continue;
    const p = latLngToPixel(stop.lat, stop.lng, zoom);
    const cellKey = `${Math.floor(p.x / cellPx)}:${Math.floor(p.y / cellPx)}`;
    const key = groupByColor ? `${cellKey}:${stopColor(stop, accentColor)}` : cellKey;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(stop);
    else buckets.set(key, [stop]);
  }

  const out: ClusterMapMarker[] = [];
  for (const members of buckets.values()) {
    if (members.length >= minWeight) {
      const weight = members.length;
      const lat = members.reduce((s, m) => s + m.lat, 0) / weight;
      const lng = members.reduce((s, m) => s + m.lng, 0) / weight;
      const colorCounts = aggregateColorCounts(members, accentColor);
      const color = groupByColor
        ? stopColor(members[0], accentColor)
        : dominantStopColor(members, accentColor);

      if (clusterStyle === 'all-pins') {
        const { size, anchor } = clusterAllPinsTierMetrics(weight);
        const iconUrl = multiColorClusterDonutIconUrl(weight, colorCounts);
        out.push({
          lat,
          lng,
          color,
          iconUrl,
          iconSize: [size, size],
          iconAnchor: anchor,
          iconCircular: false,
          clusterable: false,
          clusterBreakdownTooltip: buildClusterBreakdownTooltip(weight, colorCounts),
          touchTooltipFirst,
          zIndexOffset: DEMO_CLUSTER_MARKER_Z,
          onClick: () => {
            onClusterTap?.(weight, lat, lng, members);
          },
        });
      } else {
        const { size, anchor } = clusterTierMetrics(weight);
        out.push({
          lat,
          lng,
          color,
          iconUrl: clusterPinIconUrl(weight, color),
          iconSize: [size, size],
          iconAnchor: anchor,
          iconCircular: false,
          clusterable: false,
          zIndexOffset: DEMO_CLUSTER_MARKER_Z,
          clusterBreakdownTooltip: buildClusterBreakdownTooltip(weight, colorCounts),
          touchTooltipFirst,
          onClick: () => {
            onClusterTap?.(weight, lat, lng, members);
          },
        });
      }
    } else {
      for (const stop of members) {
        const color = stopColor(stop, accentColor);
        out.push({
          lat: stop.lat,
          lng: stop.lng,
          color,
          iconUrl: stopPinIconUrl(color),
          iconSize: pinSize,
          iconAnchor: PIN_ANCHOR,
          iconCircular: false,
          clusterable: false,
          zIndexOffset: DEMO_PIN_MARKER_Z,
        });
      }
    }
  }
  return out;
}

/**
 * Pixel-grid clustering at the current zoom — zoom in to split, zoom out to merge.
 * Buckets below minWeight render as individual pins; isolated pins stay alone.
 */
export function buildClusterMapMarkers(opts: {
  stops: ClusterDemoStop[];
  zoom: number;
  eps: number;
  minWeight: number;
  accentColor: string;
  clusterStyle?: ClusterStyleMode;
  /** First tap shows tooltip on touch devices (all-pins clusters). */
  touchTooltipFirst?: boolean;
  onClusterTap?: (weight: number, lat: number, lng: number, members: ClusterDemoStop[]) => void;
  /** Stops in these groups are never re-clustered — shown as individual/spider pins. */
  spiderGroups?: ClusterDemoStop[][];
  /** Stop clustering at this zoom and show pins (viewport-capped for performance). */
  maxClusterZoom?: number;
  /** Only cluster/render stops near the visible map area. */
  viewportBounds?: ViewportBounds | null;
  individualPinCap?: number;
  /** Zoom at/above which clusters split by pin color (below = unified neutral clusters). */
  colorClusterMinZoom?: number;
}): ClusterMapMarker[] {
  const {
    stops,
    zoom,
    eps,
    minWeight,
    accentColor,
    clusterStyle = 'by-color',
    touchTooltipFirst = false,
    onClusterTap,
    spiderGroups = [],
    maxClusterZoom = DEFAULT_MAX_CLUSTER_ZOOM,
    viewportBounds = null,
    individualPinCap = VIEWPORT_INDIVIDUAL_PIN_CAP,
    colorClusterMinZoom = DEFAULT_COLOR_CLUSTER_MIN_ZOOM,
  } = opts;

  const spiderIds = new Set<string>();
  for (const group of spiderGroups) {
    for (const stop of group) spiderIds.add(stop.id);
  }

  const visibleStops = filterStopsInViewport(stops, viewportBounds);
  const cellPx = effectiveCellPx(zoom, eps);
  const clusterMin = effectiveMinWeight(zoom, minWeight, maxClusterZoom);
  const groupByColor =
    clusterStyle === 'by-color' ? zoom >= colorClusterMinZoom : clusterStyle !== 'all-pins';

  let clustered: ClusterMapMarker[];
  if (clusterStyle === 'off') {
    clustered = buildIndividualPinMarkers(
      visibleStops.filter((s) => !spiderIds.has(s.id)),
      accentColor,
    );
  } else if (zoom >= maxClusterZoom) {
    if (visibleStops.length <= individualPinCap) {
      clustered = buildIndividualPinMarkers(
        visibleStops.filter((s) => !spiderIds.has(s.id)),
        accentColor,
      );
    } else {
      let denseCellPx = Math.max(cellPx, 48);
      clustered = clusterStopsToMarkers({
        stops: visibleStops,
        zoom,
        cellPx: denseCellPx,
        minWeight: 3,
        accentColor,
        groupByColor: clusterStyle === 'by-color',
        clusterStyle,
        touchTooltipFirst,
        onClusterTap,
        spiderIds,
      });
      for (let i = 0; i < 9 && clustered.length > individualPinCap; i++) {
        denseCellPx = Math.min(128, Math.round(denseCellPx * 1.3));
        clustered = clusterStopsToMarkers({
          stops: visibleStops,
          zoom,
          cellPx: denseCellPx,
          minWeight: 2,
          accentColor,
          groupByColor: clusterStyle === 'by-color',
          clusterStyle,
          touchTooltipFirst,
          onClusterTap,
          spiderIds,
        });
      }
    }
  } else {
    clustered = clusterStopsToMarkers({
      stops: visibleStops,
      zoom,
      cellPx,
      minWeight: clusterMin,
      accentColor,
      groupByColor,
      clusterStyle,
      touchTooltipFirst,
      onClusterTap,
      spiderIds,
    });
  }

  const spiderMarkers: ClusterMapMarker[] = [];
  for (const group of spiderGroups) {
    spiderMarkers.push(...buildSpiderPinMarkers(group, zoom, accentColor));
  }

  return [...clustered, ...spiderMarkers];
}

export function largeNumberedPinIconUrl(label: string, color: string) {
  const n = label.length;
  const fontSize = n >= 2 ? 13 : 16;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46" fill="none" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28))">
      <path d="M18 1.5C9.55 1.5 2.5 8.55 2.5 17c0 11.5 15.5 25.5 15.5 25.5S33.5 28.5 33.5 17C33.5 8.55 26.45 1.5 18 1.5z" fill="${color}" stroke="white" stroke-width="3"/>
      <g transform="translate(18, 17)">
        <text x="0" y="0" text-anchor="middle" dominant-baseline="middle"
              font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
              font-size="${fontSize}" font-weight="800" fill="white">${label}</text>
      </g>
    </svg>
  `.trim();
  return svgDataUri(svg);
}

/** Stops within an expanded bounding box around a route polyline. */
export function filterStopsNearRoute(
  stops: ClusterDemoStop[],
  polyline: Array<{ lat: number; lng: number }>,
  padDeg = 0.025,
) {
  if (polyline.length < 2) return stops;
  const routeBounds = boundsFromPoints(polyline, padDeg * 0.35);
  return stops.filter(
    (s) =>
      s.lat >= routeBounds.south &&
      s.lat <= routeBounds.north &&
      s.lng >= routeBounds.west &&
      s.lng <= routeBounds.east,
  );
}

/** Frame the route with nearby pins visible around it — not the whole metro. */
export function boundsForRouteWithSurroundingPins(
  polyline: Array<{ lat: number; lng: number }>,
  surroundingStops: Array<{ lat: number; lng: number }>,
  padDeg = 0.014,
) {
  if (polyline.length < 2) {
    return boundsFromPoints([...polyline, ...surroundingStops], padDeg);
  }

  const routeBounds = boundsFromPoints(polyline, padDeg * 0.35);
  const nearby = surroundingStops.filter(
    (s) =>
      s.lat >= routeBounds.south &&
      s.lat <= routeBounds.north &&
      s.lng >= routeBounds.west &&
      s.lng <= routeBounds.east,
  );
  const points =
    nearby.length >= 12 ? [...polyline, ...nearby] : [...polyline, ...surroundingStops];
  return boundsFromPoints(points, padDeg);
}

export function boundsFromPoints(
  points: Array<{ lat: number; lng: number }>,
  padDeg = 0.012,
) {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const p of points) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }
  if (points.length === 0) {
    return { north: 0, south: 0, east: 0, west: 0 };
  }
  north += padDeg;
  south -= padDeg;
  east += padDeg;
  west -= padDeg;
  if (north === south) {
    north += padDeg;
    south -= padDeg;
  }
  if (east === west) {
    east += padDeg;
    west -= padDeg;
  }
  return { north, south, east, west };
}
