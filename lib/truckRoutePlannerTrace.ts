import type { TruckRouteCallResult, TruckRouteLocation } from '@/lib/mapquest';

function locationDisplay(loc?: TruckRouteLocation, fallback?: string) {
  if (!loc) return fallback || '—';
  const parts = [loc.street, loc.adminArea5, loc.adminArea3].filter(Boolean);
  return parts.join(', ') || fallback || loc.unknownInput || '—';
}

export function buildTruckRouteApiLog(result: TruckRouteCallResult): string {
  const { meta, data } = result;
  const lines: string[] = [];
  lines.push(`${meta.method} ${meta.endpointPath}  ${meta.elapsedMs} ms`);
  lines.push('');
  lines.push('options');
  lines.push(JSON.stringify(meta.options, null, 2));
  lines.push('');
  lines.push('geocode');
  lines.push(['input', 'street', 'quality', 'code', 'side', 'lat', 'lng'].join('\t'));

  const locs = data.route?.locations ?? [];
  meta.locations.forEach((input, i) => {
    const loc = locs[i];
    const lat = loc?.latLng?.lat ?? '';
    const lng = loc?.latLng?.lng ?? '';
    lines.push(
      [
        input,
        locationDisplay(loc, input),
        loc?.geocodeQuality ?? '',
        loc?.geocodeQualityCode ?? '',
        loc?.sideOfStreet ?? '',
        lat,
        lng,
      ].join('\t'),
    );
  });

  lines.push('');
  if (meta.optimized) {
    lines.push('optimize  true');
    const seq = data.route?.locationSequence;
    lines.push(`locationSequence  ${Array.isArray(seq) ? seq.join(', ') : '—'}`);
  } else {
    lines.push('optimize  false');
  }
  lines.push('');
  lines.push(`info.statuscode  ${data.info?.statuscode ?? '—'}`);
  if (data.info?.messages?.length) {
    data.info.messages.forEach((m) => lines.push(`  ${m}`));
  }

  return lines.join('\n');
}

export type TruckRouteTraceState = {
  loading: boolean;
  result: TruckRouteCallResult | null;
  error: string | null;
};

export const ZONAR_BRAND = {
  companyName: '',
  companyLogo: '/brand/zonar-logo.png?v=5',
  accentColor: '#0054A6',
  /** Outer widget shell only — inner panels use tighter corners in CSS. */
  borderRadius: '1rem',
} as const;
