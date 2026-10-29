import type { CityLine, CityPreview, Mode } from "../../shared/schema";
import { simplify } from "./geo";

export function mercator(lat: number, lon: number): [number, number] {
  const x = (lon + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

/** Project operational lines into a small SVG and simplify to pixel tolerance. */
const PREVIEW_MODES = new Set<Mode>([
  "metro",
  "monorail",
  "light_rail",
  "tram",
  "funicular",
  "water_metro",
]);

export function buildPreview(
  lines: CityLine[],
  width = 132,
  height = 84,
  pad = 6,
): CityPreview | null {
  const drawable = lines.filter((line) => line.geometry.some((segment) => segment.length > 1));
  const operational = drawable.filter((line) => line.status === "operational");
  // A corridor that is entirely under construction still deserves a sketch.
  const base = operational.length ? operational : drawable;
  // City cards are titled after the metro system, so keep long-distance
  // suburban/RRTS corridors out of the sketch and let the metro shape read.
  const core = base.filter((line) => PREVIEW_MODES.has(line.mode));
  const usable = core.length ? core : base;
  if (!usable.length) return null;

  const projected = usable.flatMap((line) =>
    line.geometry.map((segment) => ({
      colour: line.colour,
      points: segment.map(([lat, lon]) => mercator(lat, lon)),
    })),
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of projected) {
    for (const [x, y] of line.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  const paths: CityPreview["paths"] = [];
  for (const line of projected) {
    const px = line.points.map(([x, y]) => [
      offsetX + (x - minX) * scale,
      offsetY + (y - minY) * scale,
    ]) as [number, number][];
    const simplified = simplify(px, 0.6);
    if (simplified.length < 2) continue;
    const d = simplified
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
    paths.push({ colour: line.colour, d });
  }
  return paths.length ? { width, height, paths } : null;
}
