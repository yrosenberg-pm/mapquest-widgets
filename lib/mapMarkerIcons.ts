/** SVG markers as data URIs for Leaflet `iconUrl` (same pattern as Custom Route). */

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Solid hex fills for map pins only (distinct per index). White digits stay readable. */
const PIN_SOLID_COLORS = [
  '#15803d', '#1d4ed8', '#7c3aed', '#c2410c', '#be185d', '#0f766e', '#a16207', '#1e40af',
  '#b91c1c', '#047857', '#6d28d9', '#ea580c', '#db2777', '#0e7490', '#4f46e5', '#ca8a04',
  '#166534', '#2563eb', '#9333ea', '#c026d3', '#0891b2', '#d97706', '#dc2626', '#059669',
  '#7e22ce', '#e11d48', '#0d9488', '#4338ca',
] as const;

/** Distinct solid color per stop index for **map pins only** (not list UI). */
export function pinColorForStopIndex(index: number): string {
  return PIN_SOLID_COLORS[index % PIN_SOLID_COLORS.length];
}

/** First stop = green, last = red, middle stops = distinct palette (map pins only). */
export const MAP_PIN_START = '#16A34A';
export const MAP_PIN_END = '#DC2626';

export function markerPinColorForIndex(index: number, stopCount: number): string {
  if (stopCount <= 0) return MAP_PIN_START;
  if (index === 0) return MAP_PIN_START;
  if (index === stopCount - 1) return MAP_PIN_END;
  return pinColorForStopIndex(index);
}

/**
 * Teardrop map pin (same geometry as MapQuestMap default) with label centered in the pin head.
 * Use with `iconSize: [28, 36]` and `iconAnchor: [14, 36]`.
 */
export function numberedPinIconDataUri(opts: { label: string; color: string }) {
  const raw = (opts.label || '').slice(0, 3);
  const label = escapeXmlText(raw);
  const n = raw.length;
  const fontSize = n >= 3 ? 8 : n === 2 ? 9 : 11;
  // Pin head bubble ends ~y=13; anchor label mid-bubble a bit low so digits sit visually centered (bold caps read high).
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" fill="none" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.25))">
      <path d="M14 1C7.373 1 2 6.373 2 13c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="${opts.color}" stroke="white" stroke-width="2.5"/>
      <g transform="translate(14, 13.25)">
        <text x="0" y="0" text-anchor="middle" dominant-baseline="middle"
              font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
              font-size="${fontSize}" font-weight="800" fill="white">${label}</text>
      </g>
    </svg>
  `.trim();
  return svgDataUri(svg);
}

/** Round marker with label centered inside (start/end style on Custom Route). */
export function waypointIconDataUri(opts: { label: string; color: string }) {
  const label = (opts.label || '').slice(0, 3);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15.5" fill="${opts.color}" stroke="white" stroke-width="3"/>
      <text x="18" y="19.5" text-anchor="middle" dominant-baseline="middle"
            font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
            font-size="14" font-weight="800" fill="white">${label}</text>
    </svg>
  `.trim();
  return svgDataUri(svg);
}

export function stopDotIconDataUri(opts: { color: string }) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" fill="${opts.color}" opacity="0.35" stroke="white" stroke-width="2" />
    </svg>
  `.trim();
  return svgDataUri(svg);
}
