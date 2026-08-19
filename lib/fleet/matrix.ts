import { postRouteMatrixAllToAll } from '@/lib/mapquest';
import type { Depot, School, Stop } from '@/lib/fleet/types';

const MATRIX_BLOCK = 12;
const MATRIX_CONCURRENCY = 6;
const MATRIX_NODE_CAP = 25;

type MatrixCacheEntry = {
  key: string;
  matrix: number[][];
  callCount: number;
};

let sessionCache: MatrixCacheEntry | null = null;

function cacheKey(depots: Depot[], school: School, stops: Stop[]): string {
  const parts = [
    ...depots.map((d) => `${d.depotId}:${d.lat},${d.lng}`),
    `school:${school.lat},${school.lng}`,
    ...stops.map((s) => `${s.stopId}:${s.lat},${s.lng}`),
  ];
  return parts.join('|');
}

export function buildFleetNodes(activeDepots: Depot[], school: School, activeStops: Stop[]) {
  return [
    ...activeDepots.map((d) => ({ lat: d.lat, lng: d.lng, kind: 'depot' as const, id: d.depotId })),
    { lat: school.lat, lng: school.lng, kind: 'school' as const, id: 'school' },
    ...activeStops.map((s) => ({ lat: s.lat, lng: s.lng, kind: 'stop' as const, id: s.stopId })),
  ];
}

function parseAllToAllMatrix(data: unknown, n: number): number[][] | null {
  const time = (data as { time?: unknown })?.time;
  if (Array.isArray(time) && time.length > 0 && Array.isArray(time[0])) {
    return time as number[][];
  }
  if (Array.isArray(time) && time.length === n * n) {
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) matrix.push((time as number[]).slice(i * n, (i + 1) * n));
    return matrix;
  }
  return null;
}

async function fetchBlockMatrix(
  nodes: { lat: number; lng: number }[],
  globalIndices: number[],
  n: number,
  acc: number[][],
): Promise<void> {
  const locations = globalIndices.map((i) => nodes[i]);
  const data = await postRouteMatrixAllToAll(locations);
  const block = parseAllToAllMatrix(data, locations.length);
  if (!block) throw new Error('Route matrix response was invalid.');

  for (let i = 0; i < globalIndices.length; i++) {
    for (let j = 0; j < globalIndices.length; j++) {
      acc[globalIndices[i]][globalIndices[j]] = block[i][j];
    }
  }
}

function blockRanges(n: number, blockSize: number): number[][] {
  const ranges: number[][] = [];
  for (let i = 0; i < n; i += blockSize) {
    ranges.push(Array.from({ length: Math.min(blockSize, n - i) }, (_, k) => i + k));
  }
  return ranges;
}

async function runPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function getFleetTravelMatrix(
  activeDepots: Depot[],
  school: School,
  activeStops: Stop[],
  options?: { forceRefresh?: boolean; cacheOnly?: boolean },
): Promise<{ matrix: number[][]; callCount: number }> {
  const key = cacheKey(activeDepots, school, activeStops);
  if (options?.cacheOnly) {
    if (sessionCache?.key === key) {
      return { matrix: sessionCache.matrix, callCount: 0 };
    }
    throw new Error('Travel matrix not loaded. Run Plan fleet first.');
  }

  if (!options?.forceRefresh && sessionCache?.key === key) {
    return { matrix: sessionCache.matrix, callCount: 0 };
  }

  const nodes = buildFleetNodes(activeDepots, school, activeStops);
  const n = nodes.length;

  if (n <= MATRIX_NODE_CAP) {
    const data = await postRouteMatrixAllToAll(nodes);
    const parsed = parseAllToAllMatrix(data, n);
    if (!parsed) throw new Error('Route matrix response was invalid.');
    sessionCache = { key, matrix: parsed, callCount: 1 };
    return { matrix: parsed, callCount: 1 };
  }

  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const ranges = blockRanges(n, MATRIX_BLOCK);
  const tasks: (() => Promise<void>)[] = [];
  for (const a of ranges) {
    for (const b of ranges) {
      const union = [...new Set([...a, ...b])].sort((x, y) => x - y);
      if (union.length > MATRIX_NODE_CAP - 1) {
        throw new Error(`Matrix tile exceeds ${MATRIX_NODE_CAP} node cap (${union.length}).`);
      }
      tasks.push(async () => {
        await fetchBlockMatrix(nodes, union, n, matrix);
      });
    }
  }

  await runPool(tasks, MATRIX_CONCURRENCY);
  const callCount = tasks.length;
  sessionCache = { key, matrix, callCount };
  return { matrix, callCount };
}

export function clearFleetMatrixCache(): void {
  sessionCache = null;
}
