/**
 * Privacy & Geolocation Spatial Indexing Helpers
 *
 * Ensures:
 * - Pre-acceptance employer map markers NEVER expose exact worker coordinates (~250m deterministic obfuscation).
 * - Logs NEVER contain raw latitude/longitude fields.
 * - Spatial grid buckets enable fast SQLite pre-filtering across 5,000+ online workers.
 */

export const BUCKET_SCALE = 100; // 0.01 deg ~ 1.11 km latitude / ~0.85 km longitude in Uzbekistan

export function quantizeCoordBucket(coord: number): number {
  return Math.floor(coord * BUCKET_SCALE);
}

/** Computes inclusive bucket window for a given center & search radius in km. */
export function getBucketWindow(lat: number, lng: number, radiusKm: number): {
  minLatBucket: number;
  maxLatBucket: number;
  minLngBucket: number;
  maxLngBucket: number;
} {
  const safeRadius = Math.max(1, Math.min(200, radiusKm));
  // 1 deg latitude ~ 111 km; 1 deg longitude at 40N ~ 85 km
  const latDegPad = safeRadius / 110 + 0.02;
  const lngDegPad = safeRadius / 80 + 0.02;
  return {
    minLatBucket: quantizeCoordBucket(lat - latDegPad),
    maxLatBucket: quantizeCoordBucket(lat + latDegPad),
    minLngBucket: quantizeCoordBucket(lng - lngDegPad),
    maxLngBucket: quantizeCoordBucket(lng + lngDegPad),
  };
}

/**
 * Deterministically obfuscates coordinates by ~220–280 meters for unaccepted views
 * (nearby workers preview before job acceptance) so exact home coordinates do not leak.
 */
export function obfuscatePreAcceptCoords(
  lat: number,
  lng: number,
  seed: string,
): { lat: number; lng: number; approxRadiusMeters: number } {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
  // 0.0022 deg lat ~ 245 meters
  const offsetDeg = 0.0022 + (((hash >>> 8) % 60) / 100000);
  const roundedLat = Math.round((lat + Math.sin(angle) * offsetDeg) * 1000) / 1000;
  const roundedLng = Math.round((lng + Math.cos(angle) * offsetDeg * 1.25) * 1000) / 1000;
  return {
    lat: roundedLat,
    lng: roundedLng,
    approxRadiusMeters: 250,
  };
}

const SENSITIVE_COORD_KEYS = new Set([
  'lat',
  'lng',
  'latitude',
  'longitude',
  'workerLat',
  'workerLng',
  'employerLat',
  'employerLng',
]);

/** Strips raw coordinate numbers before writing any operational/system log string. */
export function redactCoordinatesFromLogPayload(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((item) => redactCoordinatesFromLogPayload(item));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_COORD_KEYS.has(k)) {
        out[k] = '[REDACTED_COORD]';
      } else {
        out[k] = redactCoordinatesFromLogPayload(v);
      }
    }
    return out;
  }
  return input;
}
