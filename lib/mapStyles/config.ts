/** Base path for file-based styles (change only this when moving to a CDN / Vector Maps API). */
export const STYLE_BASE_URL = '/styles/';

export type MapStyleCamera = {
  lng: number;
  lat: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
};

export type MapStyleConfigEntry = {
  id: string;
  name: string;
  description: string;
  /** Drives on-map MapQuest logo (black on light basemaps, white on dark). */
  basemapTone: 'light' | 'dark';
  /** Hosted MapQuest vector theme or a JSON file under STYLE_BASE_URL */
  styleRef: { kind: 'hosted'; theme: 'light' | 'dark' } | { kind: 'file'; fileName: string };
  /** Optional path under `public/` (e.g. `/styles/thumbnails/streets.png`) */
  thumbnail?: string;
  showcase: MapStyleCamera;
  /** Curated fly-to for presentations when demo mode is enabled in the gallery. */
  demoShowcase: MapStyleCamera;
};

/**
 * Earliest zoom for 3D building extrusions (styles often default to 14).
 * Kept low so bird's-eye demos (~12.4) and slight zoom-out still show massing.
 */
export const MAP_STYLE_BUILDING_3D_MIN_ZOOM = 8;

/** Zoom at which extrusions reach full height. */
export const MAP_STYLE_BUILDING_3D_FULL_ZOOM = 11.5;

/** Shared demo view (Las Vegas Strip) so every style shows the same geography. */
export const MAP_STYLE_SHOWCASE: MapStyleCamera = {
  lng: -115.1728,
  lat: 36.1147,
  zoom: 14,
  pitch: 0,
  bearing: 0,
};

/** Bird's-eye San Francisco — compare Light / Dark / Logistics on the same frame. */
export const MAP_STYLE_DEMO_SF_BIRDSEYE: MapStyleCamera = {
  lng: -122.4194,
  lat: 37.7749,
  zoom: 11.9,
  pitch: 0,
  bearing: 0,
};

/** SF downtown tilt — 3D buildings (Graphite), same city as Light/Dark/Logistics. */
export const MAP_STYLE_DEMO_SF_BUILDINGS: MapStyleCamera = {
  lng: -122.401,
  lat: 37.792,
  zoom: 12.4,
  pitch: 56,
  bearing: 0,
};

/** Mammoth Lakes / eastern Sierra (Outdoors). */
export const MAP_STYLE_DEMO_MOUNTAINS: MapStyleCamera = {
  lng: -118.972,
  lat: 37.648,
  zoom: 9.8,
  pitch: 48,
  bearing: 0,
};

export const MAP_STYLE_ENTRIES: MapStyleConfigEntry[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Default light vector basemap',
    basemapTone: 'light',
    styleRef: { kind: 'hosted', theme: 'light' },
    showcase: MAP_STYLE_SHOWCASE,
    demoShowcase: MAP_STYLE_DEMO_SF_BIRDSEYE,
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Default dark vector basemap',
    basemapTone: 'dark',
    styleRef: { kind: 'hosted', theme: 'dark' },
    showcase: MAP_STYLE_SHOWCASE,
    demoShowcase: MAP_STYLE_DEMO_SF_BIRDSEYE,
  },
  {
    id: 'logistics',
    name: 'Logistics',
    description: 'Freight, ports, and truck restrictions',
    basemapTone: 'light',
    styleRef: { kind: 'file', fileName: 'logistics.json' },
    showcase: MAP_STYLE_SHOWCASE,
    demoShowcase: MAP_STYLE_DEMO_SF_BIRDSEYE,
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'High-contrast charcoal basemap with crisp road hierarchy',
    basemapTone: 'dark',
    styleRef: { kind: 'file', fileName: 'graphite.json' },
    showcase: MAP_STYLE_SHOWCASE,
    demoShowcase: MAP_STYLE_DEMO_SF_BUILDINGS,
  },
  {
    id: 'outdoors',
    name: 'Outdoors',
    description: 'Terrain and outdoor recreation',
    basemapTone: 'light',
    styleRef: { kind: 'file', fileName: 'outdoors.json' },
    showcase: MAP_STYLE_SHOWCASE,
    demoShowcase: MAP_STYLE_DEMO_MOUNTAINS,
  },
];

export function getMapStyleEntry(id: string): MapStyleConfigEntry | undefined {
  return MAP_STYLE_ENTRIES.find((e) => e.id === id);
}

/** Presentation chrome (widget shell / gallery backdrop) for Map Styles demos. */
export function isMapStyleBasemapDark(entry: MapStyleConfigEntry | null | undefined): boolean {
  const resolved = entry ?? getMapStyleEntry(DEFAULT_MAP_STYLE_ID);
  return resolved?.basemapTone === 'dark';
}

/** White MapQuest on-map logo when true; black logo when false. */
export function mapStyleUsesLightBackground(entry: MapStyleConfigEntry): boolean {
  return entry.basemapTone === 'light';
}

export function getMapStyleFlyCamera(
  entry: MapStyleConfigEntry,
  styleDemoMode: boolean,
): MapStyleCamera {
  return styleDemoMode ? entry.demoShowcase : entry.showcase;
}

export const DEFAULT_MAP_STYLE_ID = 'light';