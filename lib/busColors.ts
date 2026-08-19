export type HslAccent = { h: number; s: number; l: number };

/** Parse #RGB or #RRGGBB to HSL (s/l as 0–100). */
export function hexToHsl(hex: string): HslAccent {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = ((max + min) / 2) * 100;
  if (max === min) return { h: 210, s: 70, l };
  const d = max - min;
  const s = (l > 50 ? d / (2 - max - min) : d / (max + min)) * 100;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s), l: Math.round(l) };
}

/** Derive bus route colors from the app accent token. */
export function busColor(index: number, accent: HslAccent): string {
  const hueStep = 14;
  const lightStep = 6;
  const offset = index - 2;
  const h = accent.h + offset * hueStep;
  const l = Math.min(92, Math.max(28, accent.l + offset * lightStep));
  return `hsl(${h} ${accent.s}% ${l}%)`;
}
