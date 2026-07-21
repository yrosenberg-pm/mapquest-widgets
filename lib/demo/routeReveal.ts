import { easeInOutCubic, jitter } from '@/lib/gallery/jitter';

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Trim a polyline to a fraction of its path length (0–1). */
export function trimPolylineByFraction(latLngs: [number, number][], fraction: number): [number, number][] {
  if (latLngs.length === 0) return [];
  if (fraction <= 0) return [latLngs[0]];
  if (fraction >= 1) return latLngs;
  if (latLngs.length < 2) return latLngs;

  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < latLngs.length; i++) {
    const d = haversineMi(latLngs[i - 1][0], latLngs[i - 1][1], latLngs[i][0], latLngs[i][1]);
    segLens.push(d);
    total += d;
  }
  if (total <= 0) return latLngs.slice(0, 2);

  const target = total * fraction;
  let acc = 0;
  const out: [number, number][] = [latLngs[0]];
  for (let i = 0; i < segLens.length; i++) {
    const seg = segLens[i];
    if (acc + seg >= target) {
      const t = (target - acc) / seg;
      const [lat0, lng0] = latLngs[i];
      const [lat1, lng1] = latLngs[i + 1];
      out.push([lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t]);
      return out;
    }
    acc += seg;
    out.push(latLngs[i + 1]);
  }
  return latLngs;
}

export function computeLinearProgressWithPause(
  elapsedMs: number,
  durationMs: number,
  pauseAtLinear: number,
  pauseMs: number,
): number {
  const pauseStart = durationMs * pauseAtLinear;
  let effective = elapsedMs;
  if (elapsedMs > pauseStart) {
    effective = pauseStart + Math.max(0, elapsedMs - pauseStart - pauseMs);
  }
  return Math.min(1, effective / durationMs);
}

export type DemoRouteRevealTiming = {
  durationMs: number;
  pauseLinearAt: number;
  pauseMs: number;
};

export function createDemoRouteRevealTiming(): DemoRouteRevealTiming {
  return {
    durationMs: jitter(1500, 0.12),
    pauseLinearAt: 0.38 + Math.random() * 0.12,
    pauseMs: jitter(280, 0.3),
  };
}

export function fractionAtElapsed(elapsedMs: number, timing: DemoRouteRevealTiming): number {
  const linear = computeLinearProgressWithPause(
    elapsedMs,
    timing.durationMs,
    timing.pauseLinearAt,
    timing.pauseMs,
  );
  return easeInOutCubic(linear);
}
