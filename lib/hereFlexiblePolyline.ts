// lib/hereFlexiblePolyline.ts
// Minimal HERE Flexible Polyline decoder (supports optional 3rd dimension, e.g. elevation)
// Spec: https://github.com/heremaps/flexible-polyline

export type HerePolylinePoint = {
  lat: number;
  lng: number;
  /**
   * 3rd dimension when present (commonly elevation/altitude depending on encoding).
   * Units depend on HERE encoding; typically meters for elevation/altitude.
   */
  z?: number;
};

export type DecodeHereFlexiblePolylineResult = {
  points: HerePolylinePoint[];
  hasThirdDimension: boolean;
  thirdDimType: number;
};

const ENCODING_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DECODING_TABLE: Record<string, number> = (() => {
  const t: Record<string, number> = {};
  for (let i = 0; i < ENCODING_CHARS.length; i++) t[ENCODING_CHARS[i]] = i;
  return t;
})();

function decodeUnsignedVarint(encoded: string, startIndex: number): { value: number; newIndex: number } {
  let result = 0;
  let shift = 0;
  let index = startIndex;

  while (index < encoded.length) {
    const char = encoded[index];
    const value = DECODING_TABLE[char];
    if (value === undefined) throw new Error(`Invalid character: ${char}`);

    result |= (value & 0x1f) << shift;
    if ((value & 0x20) === 0) return { value: result, newIndex: index + 1 };

    shift += 5;
    index++;
  }

  throw new Error('Incomplete varint');
}

function decodeSignedVarint(encoded: string, startIndex: number): { value: number; newIndex: number } {
  const unsigned = decodeUnsignedVarint(encoded, startIndex);
  const v = unsigned.value;
  const decoded = (v >> 1) ^ (-(v & 1));
  return { value: decoded, newIndex: unsigned.newIndex };
}

/**
 * Decode HERE Flexible Polyline.
 * If the polyline has a 3rd dimension, we expose it as `z`.
 */
export function decodeHereFlexiblePolyline(encoded: string): DecodeHereFlexiblePolylineResult {
  let index = 0;

  // Version (currently 1); unused, but we need to consume it.
  const version = decodeUnsignedVarint(encoded, index);
  index = version.newIndex;

  const header = decodeUnsignedVarint(encoded, index);
  index = header.newIndex;

  const precision = header.value & 0x0f;
  const thirdDimPrecision = (header.value >> 4) & 0x0f;
  const thirdDimType = (header.value >> 8) & 0x07;

  const multiplier = Math.pow(10, precision);
  const thirdMultiplier = Math.pow(10, thirdDimPrecision);
  const hasThirdDimension = thirdDimType !== 0;

  let lat = 0;
  let lng = 0;
  let z = 0;

  const points: HerePolylinePoint[] = [];

  while (index < encoded.length) {
    const latRes = decodeSignedVarint(encoded, index);
    lat += latRes.value;
    index = latRes.newIndex;
    if (index >= encoded.length) break;

    const lngRes = decodeSignedVarint(encoded, index);
    lng += lngRes.value;
    index = lngRes.newIndex;

    let outZ: number | undefined = undefined;
    if (hasThirdDimension && index < encoded.length) {
      const zRes = decodeSignedVarint(encoded, index);
      z += zRes.value;
      index = zRes.newIndex;
      outZ = z / thirdMultiplier;
    }

    points.push({
      lat: lat / multiplier,
      lng: lng / multiplier,
      ...(outZ != null ? { z: outZ } : null),
    });
  }

  return { points, hasThirdDimension, thirdDimType };
}

