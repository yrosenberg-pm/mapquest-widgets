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
};

/** Earliest zoom for 3D building extrusions in the Map Styles widget (styles often default to 14). */
export const MAP_STYLE_BUILDING_3D_MIN_ZOOM = 12;

/** Shared demo view (Las Vegas Strip) so every style shows the same geography. */
export const MAP_STYLE_SHOWCASE: MapStyleCamera = {
  lng: -115.1728,
  lat: 36.1147,
  zoom: 14,
  pitch: 0,
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
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Default dark vector basemap',
    basemapTone: 'dark',
    styleRef: { kind: 'hosted', theme: 'dark' },
    showcase: MAP_STYLE_SHOWCASE,
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'High-contrast charcoal basemap with crisp road hierarchy',
    basemapTone: 'dark',
    styleRef: { kind: 'file', fileName: 'graphite.json' },
    showcase: MAP_STYLE_SHOWCASE,
  },
  {
    id: 'outdoors',
    name: 'Outdoors',
    description: 'Terrain and outdoor recreation',
    basemapTone: 'light',
    styleRef: { kind: 'file', fileName: 'outdoors.json' },
    showcase: MAP_STYLE_SHOWCASE,
  },
  {
    id: 'logistics',
    name: 'Logistics',
    description: 'Freight, ports, and truck restrictions',
    basemapTone: 'light',
    styleRef: { kind: 'file', fileName: 'logistics.json' },
    showcase: MAP_STYLE_SHOWCASE,
  },
];

export function getMapStyleEntry(id: string): MapStyleConfigEntry | undefined {
  return MAP_STYLE_ENTRIES.find((e) => e.id === id);
}

/** White MapQuest on-map logo when true; black logo when false. */
export function mapStyleUsesLightBackground(entry: MapStyleConfigEntry): boolean {
  return entry.basemapTone === 'light';
}

export const DEFAULT_MAP_STYLE_ID = 'light';