import type { Bus, Depot, School, Stop } from '@/lib/fleet/types';

export const school: School = {
  name: 'Somerset Elementary School',
  lat: 47.5633298,
  lng: -122.1517677,
};

export const depots: Depot[] = [
  { depotId: 'd-south', name: 'South Bellevue Yard', lat: 47.5864581, lng: -122.1897782 },
  { depotId: 'd-east', name: 'Eastgate Yard', lat: 47.5812401, lng: -122.1529256 },
  { depotId: 'd-north', name: 'North Bellevue Yard', lat: 47.6474550, lng: -122.1448245 },
];

export const buses: Bus[] = [
  { busId: 'bus-1', label: 'Bus 1', depotId: 'd-south', capacity: 72, colorIndex: 0 },
  { busId: 'bus-2', label: 'Bus 2', depotId: 'd-south', capacity: 72, colorIndex: 1 },
  { busId: 'bus-3', label: 'Bus 3', depotId: 'd-east', capacity: 72, colorIndex: 2 },
  { busId: 'bus-4', label: 'Bus 4', depotId: 'd-east', capacity: 72, colorIndex: 3 },
  { busId: 'bus-5', label: 'Bus 5', depotId: 'd-north', capacity: 72, colorIndex: 4 },
];

export const stops: Stop[] = [
  { stopId: 's01', name: 'Bellevue Downtown Park', lat: 47.6126836, lng: -122.2041686, riders: 6, dwellSec: 30 },
  { stopId: 's02', name: 'Meydenbauer Bay Park', lat: 47.6124346, lng: -122.2111070, riders: 4, dwellSec: 30 },
  { stopId: 's03', name: 'Inspiration Playground', lat: 47.6117742, lng: -122.2063032, riders: 5, dwellSec: 30 },
  { stopId: 's04', name: 'Bellevue Transit Center', lat: 47.6155029, lng: -122.1949280, riders: 7, dwellSec: 40 },
  { stopId: 's05', name: 'Wilburton Hill Park', lat: 47.6072757, lng: -122.1760734, riders: 5, dwellSec: 30 },
  { stopId: 's06', name: 'Bellevue Botanical Garden', lat: 47.6091944, lng: -122.1787564, riders: 3, dwellSec: 25 },
  { stopId: 's07', name: 'Kelsey Creek Park', lat: 47.6040116, lng: -122.1637991, riders: 6, dwellSec: 30 },
  { stopId: 's08', name: 'Mercer Slough', lat: 47.5935342, lng: -122.1840327, riders: 4, dwellSec: 25 },
  { stopId: 's09', name: 'Enatai Elementary', lat: 47.5891224, lng: -122.1983202, riders: 8, dwellSec: 40 },
  { stopId: 's10', name: 'South Bellevue Comm Center', lat: 47.5688782, lng: -122.1460177, riders: 5, dwellSec: 30 },
  { stopId: 's11', name: 'Crossroads Park', lat: 47.6175803, lng: -122.1235667, riders: 7, dwellSec: 35 },
  { stopId: 's12', name: 'Crossroads Comm Center', lat: 47.6192454, lng: -122.1276600, riders: 5, dwellSec: 30 },
  { stopId: 's13', name: 'Highland Comm Center', lat: 47.6257190, lng: -122.1508471, riders: 6, dwellSec: 30 },
  { stopId: 's14', name: 'Bennett Elementary', lat: 47.6250866, lng: -122.1014190, riders: 6, dwellSec: 35 },
  { stopId: 's15', name: 'NW Bellevue A', lat: 47.6320, lng: -122.2040, riders: 4, dwellSec: 25 },
  { stopId: 's16', name: 'NW Bellevue B', lat: 47.6385, lng: -122.1990, riders: 5, dwellSec: 25 },
  { stopId: 's17', name: 'Clyde Hill Edge', lat: 47.6280, lng: -122.2170, riders: 3, dwellSec: 25 },
  { stopId: 's18', name: 'Downtown East', lat: 47.6180, lng: -122.1880, riders: 6, dwellSec: 30 },
  { stopId: 's19', name: 'Enatai North', lat: 47.5850, lng: -122.2020, riders: 4, dwellSec: 25 },
  { stopId: 's20', name: 'Beaux Arts', lat: 47.5800, lng: -122.1950, riders: 3, dwellSec: 25 },
  { stopId: 's21', name: 'Newport Hills A', lat: 47.5660, lng: -122.1780, riders: 6, dwellSec: 30 },
  { stopId: 's22', name: 'Newport Hills B', lat: 47.5590, lng: -122.1720, riders: 5, dwellSec: 30 },
  { stopId: 's23', name: 'Newport Shores', lat: 47.5710, lng: -122.1810, riders: 4, dwellSec: 25 },
  { stopId: 's24', name: 'Factoria North', lat: 47.5800, lng: -122.1700, riders: 5, dwellSec: 30 },
  { stopId: 's25', name: 'Factoria South', lat: 47.5750, lng: -122.1650, riders: 4, dwellSec: 25 },
  { stopId: 's26', name: 'Somerset West', lat: 47.5680, lng: -122.1560, riders: 6, dwellSec: 30 },
  { stopId: 's27', name: 'Somerset South', lat: 47.5600, lng: -122.1470, riders: 5, dwellSec: 30 },
  { stopId: 's28', name: 'Somerset North', lat: 47.5720, lng: -122.1500, riders: 4, dwellSec: 25 },
  { stopId: 's29', name: 'Eastgate West', lat: 47.5780, lng: -122.1400, riders: 5, dwellSec: 30 },
  { stopId: 's30', name: 'Eastgate East', lat: 47.5820, lng: -122.1330, riders: 4, dwellSec: 25 },
  { stopId: 's31', name: 'Lake Hills West', lat: 47.5960, lng: -122.1420, riders: 6, dwellSec: 30 },
  { stopId: 's32', name: 'Lake Hills North', lat: 47.6020, lng: -122.1330, riders: 5, dwellSec: 30 },
  { stopId: 's33', name: 'Lake Hills South', lat: 47.5900, lng: -122.1480, riders: 4, dwellSec: 25 },
  { stopId: 's34', name: 'Crossroads North', lat: 47.6220, lng: -122.1180, riders: 5, dwellSec: 30 },
  { stopId: 's35', name: 'Crossroads South', lat: 47.6130, lng: -122.1290, riders: 4, dwellSec: 25 },
  { stopId: 's36', name: 'Woodridge West', lat: 47.6000, lng: -122.1800, riders: 5, dwellSec: 30 },
  { stopId: 's37', name: 'Woodridge South', lat: 47.5940, lng: -122.1720, riders: 4, dwellSec: 25 },
  { stopId: 's38', name: 'Bel-Red North', lat: 47.6300, lng: -122.1450, riders: 5, dwellSec: 30 },
  { stopId: 's39', name: 'Bel-Red West', lat: 47.6220, lng: -122.1600, riders: 4, dwellSec: 25 },
  { stopId: 's40', name: 'Bridle Trails North', lat: 47.6420, lng: -122.1750, riders: 5, dwellSec: 30 },
  { stopId: 's41', name: 'Bridle Trails South', lat: 47.6360, lng: -122.1660, riders: 4, dwellSec: 25 },
  { stopId: 's42', name: 'North Bellevue A', lat: 47.6510, lng: -122.1520, riders: 5, dwellSec: 30 },
  { stopId: 's43', name: 'North Bellevue B', lat: 47.6440, lng: -122.1380, riders: 4, dwellSec: 25 },
  { stopId: 's44', name: 'Northeast Bellevue', lat: 47.6320, lng: -122.1120, riders: 5, dwellSec: 30 },
  { stopId: 's45', name: 'Sammamish Edge', lat: 47.6280, lng: -122.1290, riders: 4, dwellSec: 25 },
];

export type PresetName = 'two' | 'three' | 'five';

export const fleetPresets: Record<PresetName, { busIds: string[]; stopCount: number }> = {
  two: { busIds: ['bus-1', 'bus-3'], stopCount: 18 },
  three: { busIds: ['bus-1', 'bus-3', 'bus-5'], stopCount: 28 },
  five: { busIds: ['bus-1', 'bus-2', 'bus-3', 'bus-4', 'bus-5'], stopCount: 45 },
};

export const DEFAULT_PRESET: PresetName = 'two';

export function getActiveFleet(preset: PresetName) {
  const presetDef = fleetPresets[preset];
  const activeBuses = buses.filter((b) => presetDef.busIds.includes(b.busId));
  const activeStops = stops.slice(0, presetDef.stopCount);
  const depotIds = new Set(activeBuses.map((b) => b.depotId));
  const activeDepots = depots.filter((d) => depotIds.has(d.depotId));
  return { activeBuses, activeStops, activeDepots, presetDef };
}
