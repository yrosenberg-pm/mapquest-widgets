import { resolveMapQuestVectorStyleUrl } from '@/lib/mapquestMaplibreStyle';
import type { StyleSpecification } from 'maplibre-gl';
import {
  MAP_STYLE_SHOWCASE,
  STYLE_BASE_URL,
  type MapStyleConfigEntry,
} from '@/lib/mapStyles/config';

const API_KEY_IN_JSON = /\bkey\s*=\s*['"]?[a-zA-Z0-9_-]{8,}/i;

function isDev() {
  return process.env.NODE_ENV === 'development';
}

function warnDev(message: string) {
  if (isDev()) console.warn(`[MapStyles] ${message}`);
}

function isNonPublicResourceUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith('file:')) return true;
  if (u.includes('localhost') || u.includes('127.0.0.1')) return true;
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  return false;
}

export function auditStyleJson(style: StyleSpecification, label: string) {
  const raw = JSON.stringify(style);
  if (API_KEY_IN_JSON.test(raw)) {
    warnDev(`Style "${label}" JSON may contain an API key — remove it; keys are injected at runtime.`);
  }
  const sprite = typeof style.sprite === 'string' ? style.sprite : '';
  const glyphs = typeof style.glyphs === 'string' ? style.glyphs : '';
  if (sprite && isNonPublicResourceUrl(sprite)) {
    warnDev(`Style "${label}" sprite URL looks local/non-public (${sprite}); icons may not render.`);
  }
  if (glyphs && isNonPublicResourceUrl(glyphs)) {
    warnDev(`Style "${label}" glyphs URL looks local/non-public (${glyphs}); labels may not render.`);
  }
}

/** Public style URL for snippets / copy panel (no real API key). */
export function publicStyleUrl(entry: MapStyleConfigEntry, origin: string): string {
  if (entry.styleRef.kind === 'hosted') {
    return resolveMapQuestVectorStyleUrl('YOUR_MAPQUEST_API_KEY', entry.styleRef.theme);
  }
  const path = `${STYLE_BASE_URL}${entry.styleRef.fileName}`.replace(/\/{2,}/g, '/');
  return `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveStyleLoadTarget(
  entry: MapStyleConfigEntry,
  apiKey: string,
): string {
  if (entry.styleRef.kind === 'hosted') {
    if (!apiKey) return resolveMapQuestVectorStyleUrl('YOUR_MAPQUEST_API_KEY', entry.styleRef.theme);
    return resolveMapQuestVectorStyleUrl(apiKey, entry.styleRef.theme);
  }
  const file = entry.styleRef.fileName.replace(/^\//, '');
  return `${STYLE_BASE_URL}${file}`.replace(/\/{2,}/g, '/');
}

/** Append MapQuest API key to MapQuest-hosted tile/style requests (never inject into unrelated URLs). */
export function createMapQuestTransformRequest(apiKey: string) {
  return (url: string): { url: string } => {
    if (!apiKey || apiKey === 'YOUR_MAPQUEST_API_KEY' || /\bkey=/.test(url)) {
      return { url };
    }
    if (
      url.includes('mapquestapi.com') ||
      url.includes('tiles.mapquest.com') ||
      url.includes('.aws.mapquest.com')
    ) {
      const sep = url.includes('?') ? '&' : '?';
      return { url: `${url}${sep}key=${encodeURIComponent(apiKey)}` };
    }
    return { url };
  };
}

export async function fetchFileStyleForAudit(
  styleUrl: string,
): Promise<StyleSpecification | null> {
  try {
    const res = await fetch(styleUrl);
    if (!res.ok) return null;
    return (await res.json()) as StyleSpecification;
  } catch {
    return null;
  }
}

export function maplibreSnippet(entry: MapStyleConfigEntry, styleUrl: string): string {
  const styleNote =
    entry.styleRef.kind === 'hosted'
      ? `// ${entry.name}: MapQuest hosted vector style (API key on style URL + tiles via transformRequest).`
      : `// ${entry.name}: MapLibre style JSON at ${STYLE_BASE_URL}${entry.styleRef.fileName}\n` +
        `// Change STYLE_BASE_URL in one place when you host styles on a CDN / Vector Maps API.`;

  return `${styleNote}
import maplibregl from 'maplibre-gl';

const STYLE_BASE_URL = '${STYLE_BASE_URL}';

const map = new maplibregl.Map({
  container: 'map',
  style: '${styleUrl}',
  center: [${MAP_STYLE_SHOWCASE.lng}, ${MAP_STYLE_SHOWCASE.lat}],
  zoom: ${MAP_STYLE_SHOWCASE.zoom},
  transformRequest: (url) => {
    if (
      url.includes('mapquestapi.com') ||
      url.includes('tiles.mapquest.com') ||
      url.includes('.aws.mapquest.com')
    ) {
      const sep = url.includes('?') ? '&' : '?';
      return { url: url + sep + 'key=YOUR_MAPQUEST_API_KEY' };
    }
    return { url };
  },
});`;
}