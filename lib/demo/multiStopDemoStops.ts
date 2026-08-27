export type MultiStopDemoSeed = {
  address: string;
  lat: number;
  lng: number;
  duration?: number;
};

/** Small LA landmark set for the quick 5-stop shuffle demo. */
export const LA_MULTI_STOP_LANDMARKS: MultiStopDemoSeed[] = [
  { address: 'Santa Monica Pier, Santa Monica, CA', lat: 34.0094, lng: -118.4973, duration: 15 },
  { address: 'Griffith Observatory, Los Angeles, CA', lat: 34.1184, lng: -118.3004, duration: 20 },
  { address: 'Hollywood Sign Viewpoint, Los Angeles, CA', lat: 34.1341, lng: -118.3215, duration: 10 },
  { address: 'The Getty Center, Los Angeles, CA', lat: 34.078, lng: -118.4741, duration: 25 },
  { address: 'Venice Beach, Venice, CA', lat: 33.985, lng: -118.4695, duration: 15 },
  { address: 'Universal Studios Hollywood, Universal City, CA', lat: 34.1381, lng: -118.3534, duration: 20 },
];

/** Deterministic 0–1 value (stable across reloads for the same index). */
function demoRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** 50 geocoded stops scattered around the center (1 depot + 49 deliveries). */
export function buildFiftyStopDemo(center: { lat: number; lng: number }): MultiStopDemoSeed[] {
  const stops: MultiStopDemoSeed[] = [
    { address: 'Route Start', lat: center.lat, lng: center.lng, duration: 0 },
  ];

  const deliveryCount = 49;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const lngScale = 1 / Math.max(Math.cos((center.lat * Math.PI) / 180), 0.55);

  // Loose neighborhood clusters so density varies like a real metro area.
  const clusterCount = 6;
  const clusters = Array.from({ length: clusterCount }, (_, c) => {
    const angle = (c / clusterCount) * 2 * Math.PI + demoRand(c + 40) * 0.9;
    const dist = 0.025 + demoRand(c + 80) * 0.055;
    return {
      lat: center.lat + dist * Math.cos(angle),
      lng: center.lng + dist * Math.sin(angle) * lngScale,
    };
  });

  const placed: { lat: number; lng: number }[] = [{ lat: center.lat, lng: center.lng }];

  for (let i = 0; i < deliveryCount; i++) {
    const cluster = clusters[i % clusterCount];
    let lat = center.lat;
    let lng = center.lng;

    for (let attempt = 0; attempt < 12; attempt++) {
      const t = i + attempt * deliveryCount;
      const spiralR = 0.012 + Math.sqrt(demoRand(t + 1)) * 0.09;
      const spiralTheta = i * goldenAngle + demoRand(t + 2) * 1.4 - 0.7;
      const clusterR = demoRand(t + 3) * 0.038;
      const clusterTheta = demoRand(t + 4) * 2 * Math.PI;

      lat =
        cluster.lat +
        spiralR * Math.cos(spiralTheta) * 0.35 +
        clusterR * Math.cos(clusterTheta) +
        (demoRand(t + 5) - 0.5) * 0.014;
      lng =
        cluster.lng +
        (spiralR * Math.sin(spiralTheta) * 0.35 + clusterR * Math.sin(clusterTheta)) * lngScale +
        (demoRand(t + 6) - 0.5) * 0.018 * lngScale;

      const minDist = 0.0045;
      const tooClose = placed.some((p) => {
        const dLat = p.lat - lat;
        const dLng = (p.lng - lng) / lngScale;
        return dLat * dLat + dLng * dLng < minDist * minDist;
      });
      if (!tooClose) break;
    }

    placed.push({ lat, lng });
    stops.push({
      address: `Delivery Stop ${i + 1}`,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      duration: demoRand(i + 200) > 0.82 ? 20 : demoRand(i + 300) > 0.55 ? 15 : 10,
    });
  }

  return stops;
}
