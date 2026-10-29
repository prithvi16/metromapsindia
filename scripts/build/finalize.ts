import {
  type CityData,
  CityDataSchema,
  type CityLine,
  type CityStation,
} from "../../shared/schema";
import type { CityConfig } from "../cities";
import { boundsFromLines, lineLengthKm, minZoomFor, simplify } from "../lib/geo";
import { clusterStations } from "./normalize";

const CORE_MODES = new Set(["metro", "monorail", "light_rail", "tram", "funicular"]);

function simplifyGeometry(lines: CityLine[]): CityLine[] {
  return lines.map((line) => ({
    ...line,
    geometry: line.geometry
      .map((segment) => simplify(segment, 0.00005))
      .filter((segment) => segment.length >= 2)
      .map((segment) =>
        segment.map(
          ([lat, lon]) => [Number(lat.toFixed(6)), Number(lon.toFixed(6))] as [number, number],
        ),
      ),
  }));
}

export function finalizeCity(
  city: CityConfig,
  inputLines: CityLine[],
  generatedAt: string,
  generatedBy: string,
): CityData {
  const lines = simplifyGeometry(inputLines).map((line) => ({
    ...line,
    city: city.slug,
  }));

  const stations: CityStation[] = clusterStations(lines).map((station) => ({
    ...station,
    city: city.slug,
  }));

  const coverage =
    lines.length === 0 ? "none" : stations.length < city.stats.stations * 0.6 ? "partial" : "full";

  const modes = [...new Set(lines.map((line) => line.mode))];
  const systemNames = [...new Set(lines.map((line) => line.system))].sort();
  // Frame the urban core, not the longest commuter corridor: an RRTS or
  // suburban line to a satellite town would zoom the page out too far.
  const core = lines.filter((line) => CORE_MODES.has(line.mode));
  const viewBounds = boundsFromLines(core.length ? core : lines, city.bounds);
  const operational = lines.filter((line) => line.status === "operational");
  const kmLines = operational.length ? operational : lines;

  const data: CityData = {
    generatedBy,
    generatedAt,
    slug: city.slug,
    city: city.city,
    system: city.system,
    operator: city.operator,
    region: city.region,
    bounds: viewBounds,
    minZoom: minZoomFor(viewBounds),
    coverage,
    stats: city.stats,
    counts: {
      lines: lines.length,
      stations: stations.length,
      km: Number(kmLines.reduce((sum, line) => sum + lineLengthKm(line.geometry), 0).toFixed(1)),
      modes,
      systems: systemNames.length,
      systemNames,
    },
    lines,
    stations,
  };

  return CityDataSchema.parse(data);
}
