export type ClusterDemoStop = {
  id: string;
  lat: number;
  lng: number;
  metroId: string;
  /** User-assigned pin color — clusters only merge pins of the same color. */
  color: string;
};

/** Typical user color-codes for map pins (categories, teams, status, etc.). */
export const DEMO_PIN_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#ca8a04',
  '#db2777',
  '#4f46e5',
  '#0d9488',
  '#7c3aed',
  '#b45309',
] as const;

export type DemoMetro = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Rough metro radius in degrees for local scatter. */
  spread: number;
};

export const DEMO_METROS: DemoMetro[] = [
  { id: 'nyc', name: 'New York', lat: 40.758, lng: -73.9855, spread: 0.18 },
  { id: 'la', name: 'Los Angeles', lat: 34.0522, lng: -118.2437, spread: 0.22 },
  { id: 'chicago', name: 'Chicago', lat: 41.8781, lng: -87.6298, spread: 0.16 },
  { id: 'dallas', name: 'Dallas', lat: 32.7767, lng: -96.797, spread: 0.2 },
  { id: 'houston', name: 'Houston', lat: 29.7604, lng: -95.3698, spread: 0.2 },
  { id: 'atlanta', name: 'Atlanta', lat: 33.749, lng: -84.388, spread: 0.18 },
  { id: 'seattle', name: 'Seattle', lat: 47.6062, lng: -122.3321, spread: 0.14 },
  { id: 'denver', name: 'Denver', lat: 39.7392, lng: -104.9903, spread: 0.16 },
  { id: 'miami', name: 'Miami', lat: 25.7617, lng: -80.1918, spread: 0.15 },
];

type LandBox = { south: number; north: number; west: number; east: number };

type PlacementRegion = {
  center: { lat: number; lng: number };
  bounds: LandBox;
  /** Axis-aligned water areas inside/near the bounds — never place pins here. */
  water: LandBox[];
};

/** Urban land only — bounds exclude coastlines; water boxes catch bays / lakes / rivers. */
const METRO_PLACEMENT: Record<string, PlacementRegion> = {
  nyc: {
    center: { lat: 40.758, lng: -73.985 },
    bounds: { south: 40.62, north: 40.92, west: -74.08, east: -73.82 },
    water: [
      { south: 40.55, north: 40.78, west: -73.82, east: -73.65 }, // East River / LI Sound
      { south: 40.55, north: 40.65, west: -74.15, east: -73.95 }, // NY Harbor south
      { south: 40.65, north: 40.72, west: -74.05, east: -73.98 }, // Hudson mouth
    ],
  },
  la: {
    center: { lat: 34.052, lng: -118.29 },
    bounds: { south: 33.82, north: 34.15, west: -118.48, east: -118.12 },
    water: [
      { south: 33.75, north: 34.05, west: -118.55, east: -118.42 }, // Pacific / Santa Monica Bay
      { south: 33.72, north: 33.88, west: -118.28, east: -118.12 }, // San Pedro Bay south
    ],
  },
  chicago: {
    center: { lat: 41.878, lng: -87.75 },
    bounds: { south: 41.72, north: 42.02, west: -87.92, east: -87.66 },
    water: [
      { south: 41.68, north: 42.08, west: -87.66, east: -87.35 }, // Lake Michigan (east of shoreline)
    ],
  },
  dallas: {
    center: { lat: 32.777, lng: -96.797 },
    bounds: { south: 32.62, north: 32.95, west: -97.05, east: -96.55 },
    water: [],
  },
  houston: {
    center: { lat: 29.76, lng: -95.37 },
    bounds: { south: 29.62, north: 29.92, west: -95.58, east: -95.15 },
    water: [
      { south: 29.55, north: 29.72, west: -95.35, east: -95.05 }, // Galveston Bay fringe
    ],
  },
  atlanta: {
    center: { lat: 33.749, lng: -84.388 },
    bounds: { south: 33.62, north: 33.92, west: -84.55, east: -84.22 },
    water: [],
  },
  seattle: {
    center: { lat: 47.606, lng: -122.33 },
    bounds: { south: 47.52, north: 47.72, west: -122.42, east: -122.22 },
    water: [
      { south: 47.52, north: 47.68, west: -122.42, east: -122.32 }, // Puget Sound / Elliott Bay
      { south: 47.58, north: 47.72, west: -122.35, east: -122.22 }, // Lake Union north arm
    ],
  },
  denver: {
    center: { lat: 39.739, lng: -104.99 },
    bounds: { south: 39.62, north: 39.88, west: -105.08, east: -104.82 },
    water: [],
  },
  miami: {
    center: { lat: 25.772, lng: -80.22 },
    bounds: { south: 25.72, north: 25.88, west: -80.32, east: -80.14 },
    water: [
      { south: 25.72, north: 25.86, west: -80.14, east: -80.05 }, // Atlantic / Biscayne
      { south: 25.74, north: 25.82, west: -80.22, east: -80.14 }, // Biscayne Bay east side
    ],
  },
};

/** Secondary inland / land-locked cities for long-range stray noise. */
const STRAY_ANCHORS: Array<{ id: string; lat: number; lng: number; spread: number }> = [
  { id: 'phoenix', lat: 33.4484, lng: -112.074, spread: 0.14 },
  { id: 'philadelphia', lat: 39.9526, lng: -75.1652, spread: 0.12 },
  { id: 'minneapolis', lat: 44.9778, lng: -93.265, spread: 0.12 },
  { id: 'detroit', lat: 42.3314, lng: -83.0458, spread: 0.12 },
  { id: 'portland', lat: 45.5152, lng: -122.6784, spread: 0.1 },
  { id: 'nashville', lat: 36.1627, lng: -86.7816, spread: 0.12 },
  { id: 'austin', lat: 30.2672, lng: -97.7431, spread: 0.12 },
  { id: 'kansas-city', lat: 39.0997, lng: -94.5786, spread: 0.12 },
  { id: 'cleveland', lat: 41.4993, lng: -81.6944, spread: 0.1 },
  { id: 'salt-lake', lat: 40.7608, lng: -111.891, spread: 0.1 },
  { id: 'st-louis', lat: 38.627, lng: -90.1994, spread: 0.12 },
  { id: 'charlotte', lat: 35.2271, lng: -80.8431, spread: 0.12 },
];

const STRAY_PLACEMENT: Record<string, PlacementRegion> = {
  phoenix: {
    center: { lat: 33.448, lng: -112.074 },
    bounds: { south: 33.28, north: 33.62, west: -112.32, east: -111.88 },
    water: [],
  },
  philadelphia: {
    center: { lat: 39.953, lng: -75.165 },
    bounds: { south: 39.84, north: 40.06, west: -75.32, east: -74.98 },
    water: [
      { south: 39.84, north: 40.02, west: -75.05, east: -74.95 }, // Delaware River east
    ],
  },
  minneapolis: {
    center: { lat: 44.978, lng: -93.265 },
    bounds: { south: 44.84, north: 45.1, west: -93.42, east: -93.08 },
    water: [
      { south: 44.9, north: 45.05, west: -93.28, east: -93.18 }, // Mississippi corridor
    ],
  },
  detroit: {
    center: { lat: 42.331, lng: -83.046 },
    bounds: { south: 42.2, north: 42.45, west: -83.22, east: -82.88 },
    water: [
      { south: 42.28, north: 42.38, west: -83.08, east: -82.88 }, // Detroit River
    ],
  },
  portland: {
    center: { lat: 45.515, lng: -122.678 },
    bounds: { south: 45.38, north: 45.58, west: -122.78, east: -122.55 },
    water: [
      { south: 45.38, north: 45.55, west: -122.78, east: -122.65 }, // Willamette / Columbia
    ],
  },
  nashville: {
    center: { lat: 36.163, lng: -86.782 },
    bounds: { south: 36.0, north: 36.3, west: -86.95, east: -86.6 },
    water: [],
  },
  austin: {
    center: { lat: 30.267, lng: -97.743 },
    bounds: { south: 30.1, north: 30.42, west: -97.92, east: -97.58 },
    water: [],
  },
  'kansas-city': {
    center: { lat: 39.1, lng: -94.579 },
    bounds: { south: 38.9, north: 39.25, west: -94.78, east: -94.42 },
    water: [
      { south: 39.02, north: 39.15, west: -94.62, east: -94.52 }, // Missouri River
    ],
  },
  cleveland: {
    center: { lat: 41.499, lng: -81.694 },
    bounds: { south: 41.34, north: 41.56, west: -81.85, east: -81.55 },
    water: [
      { south: 41.42, north: 41.52, west: -81.72, east: -81.55 }, // Lake Erie shore
    ],
  },
  'salt-lake': {
    center: { lat: 40.761, lng: -111.891 },
    bounds: { south: 40.6, north: 40.82, west: -112.05, east: -111.75 },
    water: [],
  },
  'st-louis': {
    center: { lat: 38.627, lng: -90.199 },
    bounds: { south: 38.5, north: 38.75, west: -90.38, east: -90.05 },
    water: [
      { south: 38.55, north: 38.68, west: -90.25, east: -90.12 }, // Mississippi
    ],
  },
  charlotte: {
    center: { lat: 35.227, lng: -80.843 },
    bounds: { south: 35.08, north: 35.35, west: -81.0, east: -80.68 },
    water: [],
  },
};

/** Default map framing for the cluster demo — city-level view. */
export const DEFAULT_CLUSTER_METRO = DEMO_METROS.find((m) => m.id === 'chicago') ?? DEMO_METROS[0];

/** Fixed seed so reloads produce comparable stop layouts. */
export const CLUSTER_DEMO_SEED = 20250921;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isInWater(lat: number, lng: number, water: LandBox[]) {
  return water.some(
    (z) => lat >= z.south && lat <= z.north && lng >= z.west && lng <= z.east,
  );
}

function isLandPoint(region: PlacementRegion, lat: number, lng: number) {
  const { bounds, water } = region;
  if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) {
    return false;
  }
  return !isInWater(lat, lng, water);
}

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gaussianPair(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const mag = Math.sqrt(-2 * Math.log(u));
  return {
    z0: mag * Math.cos(2 * Math.PI * v),
    z1: mag * Math.sin(2 * Math.PI * v),
  };
}

type ClusterSeed = { lat: number; lng: number; sigmaLat: number; sigmaLng: number };

/** Irregular neighborhood blobs — avoids filling the whole bounding box like a grid. */
function buildClusterSeeds(
  region: PlacementRegion,
  regionId: string,
  seed: number,
): ClusterSeed[] {
  const rng = mulberry32(seed + hashString(regionId));
  const { bounds, center } = region;
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const base = Math.min(latSpan, lngSpan);
  const want = 5 + Math.floor(rng() * 9);
  const seeds: ClusterSeed[] = [];

  let attempts = 0;
  while (seeds.length < want && attempts < want * 16) {
    attempts += 1;
    const lat = bounds.south + rng() * latSpan;
    const lng = bounds.west + rng() * lngSpan;
    if (!isLandPoint(region, lat, lng)) continue;

    const minDist = base * (0.07 + rng() * 0.06);
    const tooClose = seeds.some(
      (s) => (s.lat - lat) ** 2 + (s.lng - lng) ** 2 < minDist ** 2,
    );
    if (tooClose) continue;

    seeds.push({
      lat,
      lng,
      sigmaLat: base * (0.035 + rng() * 0.11),
      sigmaLng: base * (0.035 + rng() * 0.11),
    });
  }

  if (seeds.length === 0) {
    seeds.push({
      lat: center.lat,
      lng: center.lng,
      sigmaLat: latSpan * 0.18,
      sigmaLng: lngSpan * 0.18,
    });
  }

  return seeds;
}

/** Gaussian scatter around random neighborhood seeds, with occasional outliers. */
function randomOnLandOrganic(
  rng: () => number,
  region: PlacementRegion,
  clusterSeeds: ClusterSeed[],
) {
  const { bounds, center } = region;
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;

  for (let attempt = 0; attempt < 64; attempt++) {
    let lat: number;
    let lng: number;

    if (rng() < 0.1) {
      lat = bounds.south + rng() * latSpan;
      lng = bounds.west + rng() * lngSpan;
    } else {
      const seed = clusterSeeds[Math.floor(rng() * clusterSeeds.length)];
      const { z0, z1 } = gaussianPair(rng);
      lat = seed.lat + z0 * seed.sigmaLat;
      lng = seed.lng + z1 * seed.sigmaLng;
    }

    if (isLandPoint(region, lat, lng)) {
      return { lat, lng };
    }
  }

  return { lat: center.lat, lng: center.lng };
}

const STOP_CACHE = new Map<number, ClusterDemoStop[]>();
const STOP_CACHE_VERSION = 8;

/** Fixed, cached stop sets — identical every load for a given point count. */
export function getClusterDemoStops(count: number): ClusterDemoStop[] {
  const cacheKey = count * 100 + STOP_CACHE_VERSION;
  const cached = STOP_CACHE.get(cacheKey);
  if (cached) return cached;
  const stops = generateClusterDemoStops(count);
  STOP_CACHE.set(cacheKey, stops);
  return stops;
}

export function generateClusterDemoStops(count: number, seed = CLUSTER_DEMO_SEED): ClusterDemoStop[] {
  const rng = mulberry32(seed);
  const strayCount = Math.round(count * 0.12);
  const metroCount = count - strayCount;
  const stops: ClusterDemoStop[] = [];

  const metroSeeds = new Map<string, ClusterSeed[]>();
  for (const metro of DEMO_METROS) {
    metroSeeds.set(
      metro.id,
      buildClusterSeeds(METRO_PLACEMENT[metro.id], metro.id, seed),
    );
  }

  const straySeeds = new Map<string, ClusterSeed[]>();
  for (const anchor of STRAY_ANCHORS) {
    straySeeds.set(
      anchor.id,
      buildClusterSeeds(STRAY_PLACEMENT[anchor.id], anchor.id, seed + 17),
    );
  }

  for (let i = 0; i < metroCount; i++) {
    const metro = DEMO_METROS[Math.floor(rng() * DEMO_METROS.length)];
    const seeds = metroSeeds.get(metro.id)!;
    const { lat, lng } = randomOnLandOrganic(rng, METRO_PLACEMENT[metro.id], seeds);
    stops.push({
      id: `m-${i}`,
      lat,
      lng,
      metroId: metro.id,
      color: DEMO_PIN_COLORS[Math.floor(rng() * DEMO_PIN_COLORS.length)],
    });
  }

  for (let i = 0; i < strayCount; i++) {
    const anchor = STRAY_ANCHORS[Math.floor(rng() * STRAY_ANCHORS.length)];
    const seeds = straySeeds.get(anchor.id)!;
    const { lat, lng } = randomOnLandOrganic(rng, STRAY_PLACEMENT[anchor.id], seeds);
    stops.push({
      id: `s-${i}`,
      lat,
      lng,
      metroId: 'stray',
      color: DEMO_PIN_COLORS[Math.floor(rng() * DEMO_PIN_COLORS.length)],
    });
  }

  return stops;
}

export function getMetroById(id: string): DemoMetro | undefined {
  return DEMO_METROS.find((m) => m.id === id);
}

/**
 * Pick routeStopCount stops through the geographic center of a metro's pin field
 * so the generated route sits amid surrounding clusters.
 */
export function pickRouteStops(
  allStops: ClusterDemoStop[],
  routeStopCount: number,
  preferredMetroId = DEFAULT_CLUSTER_METRO.id,
): { metro: DemoMetro; stops: ClusterDemoStop[] } | null {
  const metro =
    DEMO_METROS.find((m) => m.id === preferredMetroId) ?? DEFAULT_CLUSTER_METRO;
  const local = allStops.filter((s) => s.metroId === metro.id);
  if (local.length < routeStopCount) return null;

  const centroidLat = local.reduce((sum, s) => sum + s.lat, 0) / local.length;
  const centroidLng = local.reduce((sum, s) => sum + s.lng, 0) / local.length;

  const byDistance = [...local]
    .map((stop) => ({
      stop,
      dist: (stop.lat - centroidLat) ** 2 + (stop.lng - centroidLng) ** 2,
    }))
    .sort((a, b) => a.dist - b.dist);

  // Core band: inner ~35% of stops — keeps the route in the dense middle.
  const coreCount = Math.max(routeStopCount * 3, Math.ceil(local.length * 0.35));
  const core = byDistance.slice(0, coreCount).map((entry) => entry.stop);

  const ordered = [...core].sort((a, b) => {
    const angA = Math.atan2(a.lat - centroidLat, a.lng - centroidLng);
    const angB = Math.atan2(b.lat - centroidLat, b.lng - centroidLng);
    return angA - angB;
  });

  const picked: ClusterDemoStop[] = [];
  const step = ordered.length / routeStopCount;
  for (let i = 0; i < routeStopCount; i++) {
    picked.push(ordered[Math.min(ordered.length - 1, Math.floor(i * step))]);
  }

  return { metro, stops: picked };
}
