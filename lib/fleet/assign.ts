import type { Bus, Depot, School, Stop } from '@/lib/fleet/types';

export const BALANCE_WEIGHT = 0.7;
export const MAX_STOPS_PER_BUS = 23;

export type FleetMatrixContext = {
  matrix: number[][];
  depotIndexById: Map<string, number>;
  schoolIndex: number;
  stopIndexById: Map<string, number>;
  stopsById: Map<string, Stop>;
};

export function buildMatrixContext(
  matrix: number[][],
  activeDepots: Depot[],
  school: School,
  activeStops: Stop[],
): FleetMatrixContext {
  const depotIndexById = new Map(activeDepots.map((d, i) => [d.depotId, i]));
  const schoolIndex = activeDepots.length;
  const stopIndexById = new Map(activeStops.map((s, i) => [s.stopId, schoolIndex + 1 + i]));
  const stopsById = new Map(activeStops.map((s) => [s.stopId, s]));
  return { matrix, depotIndexById, schoolIndex, stopIndexById, stopsById };
}

function legTime(matrix: number[][], from: number, to: number): number {
  const v = matrix[from]?.[to];
  return Number.isFinite(v) && v >= 0 ? v : Number.POSITIVE_INFINITY;
}

export function routeDuration(
  bus: Bus,
  stopIds: string[],
  ctx: FleetMatrixContext,
): number {
  const depotIdx = ctx.depotIndexById.get(bus.depotId);
  if (depotIdx === undefined) return Number.POSITIVE_INFINITY;
  const { schoolIndex, stopIndexById, stopsById } = ctx;

  if (stopIds.length === 0) {
    return legTime(ctx.matrix, depotIdx, schoolIndex);
  }

  let total = 0;
  const firstIdx = stopIndexById.get(stopIds[0]);
  if (firstIdx === undefined) return Number.POSITIVE_INFINITY;
  total += legTime(ctx.matrix, depotIdx, firstIdx);

  for (let i = 0; i < stopIds.length; i++) {
    const stop = stopsById.get(stopIds[i]);
    if (!stop) return Number.POSITIVE_INFINITY;
    total += stop.dwellSec;
    if (i < stopIds.length - 1) {
      const fromIdx = stopIndexById.get(stopIds[i]);
      const toIdx = stopIndexById.get(stopIds[i + 1]);
      if (fromIdx === undefined || toIdx === undefined) return Number.POSITIVE_INFINITY;
      total += legTime(ctx.matrix, fromIdx, toIdx);
    }
  }

  const lastIdx = stopIndexById.get(stopIds[stopIds.length - 1]);
  if (lastIdx === undefined) return Number.POSITIVE_INFINITY;
  total += legTime(ctx.matrix, lastIdx, schoolIndex);
  return total;
}

function ridersOnBoard(stopIds: string[], stopsById: Map<string, Stop>): number {
  return stopIds.reduce((sum, id) => sum + (stopsById.get(id)?.riders ?? 0), 0);
}

function isFeasible(bus: Bus, stopIds: string[], ctx: FleetMatrixContext): boolean {
  if (stopIds.length > MAX_STOPS_PER_BUS) return false;
  return ridersOnBoard(stopIds, ctx.stopsById) <= bus.capacity;
}

function fleetCost(durations: number[]): number {
  if (durations.length === 0) return 0;
  const max = Math.max(...durations);
  const sum = durations.reduce((a, b) => a + b, 0);
  return BALANCE_WEIGHT * max + (1 - BALANCE_WEIGHT) * sum;
}

function cloneAssignments(assignments: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(assignments)) out[k] = [...v];
  return out;
}

function durationsFor(
  buses: Bus[],
  assignments: Record<string, string[]>,
  ctx: FleetMatrixContext,
): number[] {
  return buses.map((b) => routeDuration(b, assignments[b.busId] ?? [], ctx));
}

export function assignStops(
  matrix: number[][],
  buses: Bus[],
  depots: Depot[],
  school: School,
  stops: Stop[],
): Record<string, string[]> {
  const ctx = buildMatrixContext(matrix, depots, school, stops);
  const assignments: Record<string, string[]> = {};
  for (const bus of buses) assignments[bus.busId] = [];

  const unassigned = new Set(stops.map((s) => s.stopId));

  while (unassigned.size > 0) {
    let bestCost = Number.POSITIVE_INFINITY;
    let best: { busId: string; stopId: string; pos: number } | null = null;

    for (const stopId of unassigned) {
      for (const bus of buses) {
        const route = assignments[bus.busId];
        for (let pos = 0; pos <= route.length; pos++) {
          const candidate = [...route.slice(0, pos), stopId, ...route.slice(pos)];
          if (!isFeasible(bus, candidate, ctx)) continue;
          const trial = cloneAssignments(assignments);
          trial[bus.busId] = candidate;
          const cost = fleetCost(durationsFor(buses, trial, ctx));
          if (cost < bestCost) {
            bestCost = cost;
            best = { busId: bus.busId, stopId, pos };
          }
        }
      }
    }

    if (!best) {
      throw new Error('Unable to assign all stops within capacity and stop-count limits.');
    }

    const route = assignments[best.busId];
    assignments[best.busId] = [...route.slice(0, best.pos), best.stopId, ...route.slice(best.pos)];
    unassigned.delete(best.stopId);
  }

  improveAssignments(buses, assignments, ctx);
  return assignments;
}

function improveAssignments(
  buses: Bus[],
  assignments: Record<string, string[]>,
  ctx: FleetMatrixContext,
): void {
  const deadline = Date.now() + 5000;
  let improved = true;

  while (improved && Date.now() < deadline) {
    improved = false;
    const currentCost = fleetCost(durationsFor(buses, assignments, ctx));

    for (const fromBus of buses) {
      const fromRoute = assignments[fromBus.busId];
      for (let fromPos = 0; fromPos < fromRoute.length; fromPos++) {
        const stopId = fromRoute[fromPos];

        for (const toBus of buses) {
          const toRoute = assignments[toBus.busId];
          for (let toPos = 0; toPos <= toRoute.length; toPos++) {
            if (fromBus.busId === toBus.busId && (toPos === fromPos || toPos === fromPos + 1)) continue;

            const trial = cloneAssignments(assignments);
            const src = [...trial[fromBus.busId]];
            src.splice(fromPos, 1);
            trial[fromBus.busId] = src;
            const dst = [...trial[toBus.busId]];
            dst.splice(toPos, 0, stopId);
            trial[toBus.busId] = dst;

            if (!isFeasible(fromBus, trial[fromBus.busId], ctx)) continue;
            if (!isFeasible(toBus, trial[toBus.busId], ctx)) continue;

            const cost = fleetCost(durationsFor(buses, trial, ctx));
            if (cost < currentCost - 0.5) {
              assignments[fromBus.busId] = trial[fromBus.busId];
              assignments[toBus.busId] = trial[toBus.busId];
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
        if (improved) break;
      }
      if (improved) break;
    }

    if (improved) continue;

    for (let bi = 0; bi < buses.length && !improved; bi++) {
      for (let bj = bi + 1; bj < buses.length && !improved; bj++) {
        const busA = buses[bi];
        const busB = buses[bj];
        const routeA = assignments[busA.busId];
        const routeB = assignments[busB.busId];

        for (let i = 0; i < routeA.length; i++) {
          for (let j = 0; j < routeB.length; j++) {
            const trial = cloneAssignments(assignments);
            const a = [...trial[busA.busId]];
            const b = [...trial[busB.busId]];
            const tmp = a[i];
            a[i] = b[j];
            b[j] = tmp;
            trial[busA.busId] = a;
            trial[busB.busId] = b;

            if (!isFeasible(busA, a, ctx) || !isFeasible(busB, b, ctx)) continue;
            const cost = fleetCost(durationsFor(buses, trial, ctx));
            if (cost < currentCost - 0.5) {
              assignments[busA.busId] = a;
              assignments[busB.busId] = b;
              improved = true;
              break;
            }
          }
        }
      }
    }
  }
}

export function balanceSpreadPct(durations: number[]): number {
  if (durations.length === 0) return 0;
  const longest = Math.max(...durations);
  const shortest = Math.min(...durations);
  if (longest <= 0) return 0;
  return ((longest - shortest) / longest) * 100;
}
