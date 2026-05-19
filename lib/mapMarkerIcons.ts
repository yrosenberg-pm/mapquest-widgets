/** SVG markers as data URIs for Leaflet `iconUrl` (same pattern as Custom Route). */

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Muted slate ramp — readable white digits, restrained enterprise look (map + inline badges). */
const ENTERPRISE_PIN_MIDDLE = [
  '#475569',
  '#526273',
  '#5d7080',
  '#657588',
  '#6d7c90',
  '#758397',
  '#7d8a9f',
] as const;

/** Distinct solid color per middle-stop index (map pins / list badges). */
export function pinColorForStopIndex(index: number): string {
  return ENTERPRISE_PIN_MIDDLE[index % ENTERPRISE_PIN_MIDDLE.length];
}

/** First / last stops slightly darker than middles — neutral, not traffic-light green/red. */
export const MAP_PIN_START = '#334155';
export const MAP_PIN_END = '#1e293b';

export function markerPinColorForIndex(index: number, stopCount: number): string {
  if (stopCount <= 0) return MAP_PIN_START;
  if (index === 0) return MAP_PIN_START;
  if (index === stopCount - 1) return MAP_PIN_END;
  return pinColorForStopIndex(index - 1);
}

function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, '');
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    if ([r, g, b].some((x) => Number.isNaN(x))) return null;
    return { r, g, b };
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    if ([r, g, b].some((x) => Number.isNaN(x))) return null;
    return { r, g, b };
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      default:
        h = ((rn - gn) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, sat: number, light: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = light - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Per-day colors for overview map pins: same brand family but clearly distinguishable
 * (lightness ramp + bounded hue shift + saturation sweep). One hex per day.
 */
export function accentShadesForDays(baseHex: string, dayCount: number): string[] {
  const rgb = parseHexToRgb(baseHex);
  if (!rgb || dayCount <= 0) return [];
  if (dayCount === 1) return [rgbToHex(rgb.r, rgb.g, rgb.b)];
  let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  // Near-grayscale brands: give enough saturation so hue differences register on the map.
  if (s < 0.14) s = 0.48;

  const out: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    const t = i / (dayCount - 1);
    // Lightness: wide end-to-end ramp (strongest separator)
    const lSpread = Math.min(0.46, 0.2 + (dayCount - 1) * 0.05);
    const l2 = Math.max(0.2, Math.min(0.6, l + (t - 0.5) * lSpread * 2));

    // Hue: analogous swing around the enterprise color (reads as same family, not rainbow)
    const hueHalfSpan = Math.min(46, 11 + (dayCount - 1) * 5.5);
    const h2 = (h + (t - 0.5) * hueHalfSpan * 2 + 360 * 3) % 360;

    // Saturation: blend monotonic sweep + phase so adjacent days don’t track each other
    const sFactor =
      0.7 +
      0.26 * t +
      0.22 * Math.sin((i + 0.35) * (Math.PI * 2.3) / Math.max(1, dayCount - 1 || 1));
    const s2 = Math.max(0.18, Math.min(1, s * sFactor));

    const { r, g, b } = hslToRgb(h2, s2, l2);
    out.push(rgbToHex(r, g, b));
  }
  return out;
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
