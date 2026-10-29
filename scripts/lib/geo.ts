import type { Bounds, Geometry } from "../../shared/schema";

export type LatLon = { lat: number; lon: number };
/** [lat, lon], matching the project's data files (not GeoJSON order). */
export type Coord = [number, number];

const EARTH_RADIUS_KM = 6371;

export function haversine(a: LatLon, b: LatLon): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function point(coord: Coord): LatLon {
  return { lat: coord[0], lon: coord[1] };
}

/** Approximate distance in km from a point to a polyline (equirectangular). */
export function distanceToPolyline(p: LatLon, segment: Coord[]): number {
  let best = Infinity;
  const latScale = 111.32;
  const lonScale = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  for (let i = 1; i < segment.length; i++) {
    const ax = (segment[i - 1][1] - p.lon) * lonScale;
    const ay = (segment[i - 1][0] - p.lat) * latScale;
    const bx = (segment[i][1] - p.lon) * lonScale;
    const by = (segment[i][0] - p.lat) * latScale;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : -(ax * dx + ay * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}

export function lineLengthKm(geometry: Geometry): number {
  let km = 0;
  for (const segment of geometry) {
    for (let i = 1; i < segment.length; i++) {
      km += haversine(point(segment[i - 1]), point(segment[i]));
    }
  }
  return km;
}

export function totalPoints(geometry: Geometry): number {
  return geometry.reduce((sum, segment) => sum + segment.length, 0);
}

/** Douglas–Peucker, squared-distance variant, tolerance in degrees. */
export function simplify<T extends Coord>(points: T[], tolerance: number): T[] {
  if (points.length < 3) return points;
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDistSq(points[i], points[first], points[last]);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (maxSq > sq && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function segDistSq(p: Coord, a: Coord, b: Coord): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Tight bounds around the drawn network, padded, so the map opens on land. */
export function boundsFromLines(lines: { geometry: Geometry }[], fallback: Bounds): Bounds {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const line of lines) {
    for (const segment of line.geometry) {
      for (const [lat, lon] of segment) {
        minLat = Math.min(minLat, lat);
        minLon = Math.min(minLon, lon);
        maxLat = Math.max(maxLat, lat);
        maxLon = Math.max(maxLon, lon);
      }
    }
  }
  if (!Number.isFinite(minLat)) return fallback;
  const padLat = Math.max((maxLat - minLat) * 0.07, 0.012);
  const padLon = Math.max((maxLon - minLon) * 0.07, 0.012);
  return [
    Number((minLon - padLon).toFixed(4)),
    Number((minLat - padLat).toFixed(4)),
    Number((maxLon + padLon).toFixed(4)),
    Number((maxLat + padLat).toFixed(4)),
  ];
}

export function minZoomFor(bounds: Bounds, viewportWidth = 1200): number {
  const [west, south, east, north] = bounds;
  const lngSpan = Math.max(east - west, 0.02);
  const latSpan = Math.max(north - south, 0.02);
  const zLng = Math.log2((viewportWidth * 360) / (512 * lngSpan));
  const zLat = Math.log2(
    (viewportWidth * 360 * Math.cos((((south + north) / 2) * Math.PI) / 180)) / (512 * latSpan),
  );
  return Math.max(7.5, Math.round(Math.min(zLng, zLat) * 2) / 2 - 0.5);
}

/** Gap between two bounding boxes in degrees; 0 when they overlap. */
export function boundsGap(a: Bounds, b: Bounds): number {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.hypot(dx, dy);
}
