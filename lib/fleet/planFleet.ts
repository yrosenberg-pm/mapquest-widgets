import { assignStops, balanceSpreadPct } from '@/lib/fleet/assign';
import { getFleetTravelMatrix } from '@/lib/fleet/matrix';
import { sequenceBusRoute } from '@/lib/fleet/sequencing';
import type { Bus, BusRoute, Depot, FleetPlanResult, School, Stop } from '@/lib/fleet/types';

export async function planFleet(params: {
  activeBuses: Bus[];
  activeDepots: Depot[];
  activeStops: Stop[];
  school: School;
  departure: Date;
  skipMatrixFetch?: boolean;
}): Promise<FleetPlanResult> {
  const { activeBuses, activeDepots, activeStops, school, departure, skipMatrixFetch } = params;
  const depotsById = new Map(activeDepots.map((d) => [d.depotId, d]));
  const stopsById = new Map(activeStops.map((s) => [s.stopId, s]));

  const { matrix, callCount: matrixCallCount } = await getFleetTravelMatrix(
    activeDepots,
    school,
    activeStops,
    skipMatrixFetch ? { cacheOnly: true } : undefined,
  );

  const assignments = assignStops(matrix, activeBuses, activeDepots, school, activeStops);

  const routes: BusRoute[] = [];
  for (const bus of activeBuses) {
    const depot = depotsById.get(bus.depotId);
    if (!depot) throw new Error(`Missing depot for ${bus.label}`);
    const route = await sequenceBusRoute({
      bus,
      stopIds: assignments[bus.busId] ?? [],
      depot,
      school,
      stopsById,
      departure,
    });
    routes.push(route);
  }

  const durations = routes.map((r) => r.durationSec);
  const longestSec = Math.max(...durations);
  const shortestSec = Math.min(...durations);

  return {
    assignments,
    routes,
    matrixCallCount,
    optimizedRouteCallCount: activeBuses.length,
    balanceSpreadPct: balanceSpreadPct(durations),
    longestSec,
    shortestSec,
  };
}

export async function replanFleet(params: {
  activeBuses: Bus[];
  activeDepots: Depot[];
  activeStops: Stop[];
  school: School;
  departure: Date;
}): Promise<FleetPlanResult> {
  return planFleet({ ...params, skipMatrixFetch: true });
}
