import { getDemoRegion, type DemoRegion } from './demoRegions';

const NYC_CENTER = { lat: 40.758, lng: -73.9855 };

export function getWidgetLocationProps(
  widgetId: string,
  regionId: string,
): Record<string, unknown> {
  const region = getDemoRegion(regionId);

  switch (widgetId) {
    case 'directions':
    case 'truck':
      return {
        defaultFrom: region.routeFrom,
        defaultTo: region.routeTo,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'starbucks':
    case 'coffee-shop':
      return {
        defaultLocation: region.center,
        autoDetectLocation: false,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'citibike':
      return {
        defaultLocation: NYC_CENTER,
        autoDetectLocation: false,
        defaultMapCenter: NYC_CENTER,
        defaultMapZoom: 14,
      };
    case 'neighborhood':
      return {
        address: region.sampleAddress,
        lat: region.center.lat,
        lng: region.center.lng,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'isoline':
      return {
        address: region.sampleAddress,
        lat: region.center.lat,
        lng: region.center.lng,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'delivery':
    case 'instacart':
      return {
        destinationAddress: region.deliveryDestination,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'traffic':
      return {
        center: region.center,
        title: region.trafficTitle,
        zoom: region.zoom,
      };
    case 'streetview-showcase':
      return { defaultCenter: region.center, defaultZoom: region.zoom };
    case 'route-weather':
      return {
        defaultPlace: region.sampleAddress,
        defaultDestination: region.routeTo,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'ev-charging':
      return { defaultCenter: region.center, defaultMapCenter: region.center, defaultMapZoom: region.zoom };
    case 'transit':
      return {
        defaultLocation: region.center,
        defaultAddress: region.sampleAddress,
        autoDetectLocation: false,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'parking':
      return {
        defaultDestination: region.sampleAddress,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'construction':
      return {
        defaultLocation: region.sampleAddress,
        defaultCoords: region.center,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'contractor-finder':
      return {
        defaultLocationInput: region.areaQuery,
        defaultSearchCenter: region.center,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'property-intel':
      return {
        defaultQuery: region.areaQuery,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'neighborhood-profile':
    case 'comp-sales':
      return {
        defaultQuery: region.sampleAddress,
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'multistop':
    case 'listing-tour':
    case 'isoline-overlap':
    case 'checkout':
    case 'zone-coverage':
    case 'custom-route':
      return {
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    case 'truck-route-planner':
    case 'nhl':
      return {
        defaultMapCenter: region.center,
        defaultMapZoom: region.zoom,
      };
    default:
      return {};
  }
}

export type { DemoRegion };
