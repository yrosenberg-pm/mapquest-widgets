import type { TruckRoutingProvider } from '@/lib/truckRouting/directions';

export type DemoTruckRouteResult = {
  polyline: { lat: number; lng: number }[];
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  boundingBox: {
    ul: { lat: number; lng: number };
    lr: { lat: number; lng: number };
  };
  isTruckRoute: boolean;
  routeWarnings: string[];
  provider?: TruckRoutingProvider;
};
