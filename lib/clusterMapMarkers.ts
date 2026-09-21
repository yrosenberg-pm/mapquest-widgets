import type { ClusterDemoStop } from './hereClusterDemoStops';

/** Match MapQuestMap teardrop pin footprint — clusters use the same box. */
export const PIN_W = 28;
export const PIN_H = 36;
export const PIN_ANCHOR: [number, number] = [14, 36];

export type ClusterMapMarker = {
  lat: number;
  lng: number;
  label?: string;
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

/** Same 28×36 footprint as a pin — circle in the pin head with count. */
function clusterPinIconUrl(count: number, fill = '#111827') {
  const digits = String(count).length;
  const fontSize = digits >= 3 ? 8 : digits === 2 ? 9 : 11;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 28 36" fill="none" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.25))">
      <circle cx="14" cy="13" r="10.5" fill="${fill}" stroke="white" stroke-width="2.5"/>
      <text x="14" y="13.25" text-anchor="middle" dominant-baseline="middle"
            font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
            font-size="${fontSize}" font-weight="800" fill="white">${count}</text>
    </svg>
  `.trim();
  return svgDataUri(svg);
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
  accentColor: string,
): ClusterMapMarker[] {
  const pinIcon = stopPinIconUrl(accentColor);
  const pinSize: [number, number] = [PIN_W, PIN_H];
  if (stops.length === 0) return [];
  if (stops.length === 1) {
    const stop = stops[0];
    return [
      {
        lat: stop.lat,
        lng: stop.lng,
        iconUrl: pinIcon,
        iconSize: pinSize,
        iconAnchor: PIN_ANCHOR,
        iconCircular: false,
        clusterable: false,
      },
    ];
  }

  const centroidLat = stops.reduce((s, m) => s + m.lat, 0) / stops.length;
  const centroidLng = stops.reduce((s, m) => s + m.lng, 0) / stops.length;
  const centerPx = latLngToPixel(centroidLat, centroidLng, zoom);
  const needsSpider = minPixelSeparation(stops, zoom) < PIN_W * 0.9;
  const radiusPx = Math.max(32, 16 + stops.length * 5);

  return stops.map((stop, idx) => {
    if (!needsSpider) {
      return {
        lat: stop.lat,
        lng: stop.lng,
        iconUrl: pinIcon,
        iconSize: pinSize,
        iconAnchor: PIN_ANCHOR,
        iconCircular: false,
        clusterable: false,
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
      iconUrl: pinIcon,
      iconSize: pinSize,
      iconAnchor: PIN_ANCHOR,
      iconCircular: false,
      clusterable: false,
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
  accentColor: string,
): ClusterMapMarker[] {
  const pinIcon = stopPinIconUrl(accentColor);
  const pinSize: [number, number] = [PIN_W, PIN_H];
  return stops.map((stop) => ({
    lat: stop.lat,
    lng: stop.lng,
    iconUrl: pinIcon,
    iconSize: pinSize,
    iconAnchor: PIN_ANCHOR,
    iconCircular: false,
    clusterable: false,
  }));
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
  onClusterTap?: (weight: number, lat: number, lng: number, members: ClusterDemoStop[]) => void;
  /** Stops in these groups are never re-clustered — shown as individual/spider pins. */
  spiderGroups?: ClusterDemoStop[][];
}): ClusterMapMarker[] {
  const { stops, zoom, eps, minWeight, accentColor, onClusterTap, spiderGroups = [] } = opts;
  const cellPx = Math.max(8, Math.min(128, eps));
  const pinIcon = stopPinIconUrl(accentColor);
  const pinSize: [number, number] = [PIN_W, PIN_H];

  const spiderIds = new Set<string>();
  for (const group of spiderGroups) {
    for (const stop of group) spiderIds.add(stop.id);
  }

  const buckets = new Map<string, ClusterDemoStop[]>();

  for (const stop of stops) {
    if (spiderIds.has(stop.id)) continue;
    const p = latLngToPixel(stop.lat, stop.lng, zoom);
    const key = `${Math.floor(p.x / cellPx)}:${Math.floor(p.y / cellPx)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(stop);
    } else {
      buckets.set(key, [stop]);
    }
  }

  const out: ClusterMapMarker[] = [];

  for (const members of buckets.values()) {
    if (members.length >= minWeight) {
      const weight = members.length;
      const lat = members.reduce((s, m) => s + m.lat, 0) / weight;
      const lng = members.reduce((s, m) => s + m.lng, 0) / weight;
      out.push({
        lat,
        lng,
        iconUrl: clusterPinIconUrl(weight),
        iconSize: pinSize,
        iconAnchor: PIN_ANCHOR,
        iconCircular: false,
        clusterable: false,
        onClick: () => {
          console.log('[Cluster]', { weight, lat, lng, members: members.length });
          onClusterTap?.(weight, lat, lng, members);
        },
      });
    } else {
      for (const stop of members) {
        out.push({
          lat: stop.lat,
          lng: stop.lng,
          iconUrl: pinIcon,
          iconSize: pinSize,
          iconAnchor: PIN_ANCHOR,
          iconCircular: false,
          clusterable: false,
        });
      }
    }
  }

  for (const group of spiderGroups) {
    out.push(...buildSpiderPinMarkers(group, zoom, accentColor));
  }

  return out;
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
