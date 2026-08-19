export type Depot = { depotId: string; name: string; lat: number; lng: number };

export type Bus = {
  busId: string;
  label: string;
  depotId: string;
  capacity: number;
  colorIndex: number;
};

export type Stop = {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  riders: number;
  dwellSec: number;
};

export type School = { name: string; lat: number; lng: number };

export type BusRoute = {
  busId: string;
  stopIds: string[];
  durationSec: number;
  distanceMi: number;
  riders: number;
  shape: number[];
  arrivalAtSchoolSec: number;
};

export type FleetPlanResult = {
  assignments: Record<string, string[]>;
  routes: BusRoute[];
  matrixCallCount: number;
  optimizedRouteCallCount: number;
  balanceSpreadPct: number;
  longestSec: number;
  shortestSec: number;
};
