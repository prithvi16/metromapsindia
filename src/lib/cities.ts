import type { FeatureCollection, MultiLineString, Point } from "geojson";
import {
  type AllData,
  type CityCounts,
  type CityData,
  type CityIndex,
  type CityLine,
  type CityPreview,
  type CityStation,
  type CityStats,
  type CitySummary,
  MODE_IDS,
  MODE_LABELS,
  MODE_SHORT_LABELS,
  type Mode,
  type PreviewPath,
  REGION_IDS,
  STATUS_IDS,
  STATUS_LABELS,
  type StationRef,
  type Status,
} from "../../shared/schema";

export type {
  AllData,
  CityCounts,
  CityData,
  CityIndex,
  CityLine,
  CityPreview,
  CityStation,
  CityStats,
  CitySummary,
  Mode,
  PreviewPath,
  StationRef,
  Status,
};

/** Mode metadata drives both the legend samples and the map stroke widths. */
export const MODE_META: Record<
  Mode,
  { label: string; short: string; width: number; overlay?: number[] }
> = {
  metro: { label: MODE_LABELS.metro, short: MODE_SHORT_LABELS.metro, width: 5 },
  // Suburban is deliberately one solid stroke in one colour (no overlay, no
  // per-line colour): the whole commuter network reads as a single layer.
  suburban: { label: MODE_LABELS.suburban, short: MODE_SHORT_LABELS.suburban, width: 4 },
  rrts: { label: MODE_LABELS.rrts, short: MODE_SHORT_LABELS.rrts, width: 6.5 },
  bullet_train: {
    label: MODE_LABELS.bullet_train,
    short: MODE_SHORT_LABELS.bullet_train,
    width: 6,
  },
  monorail: {
    label: MODE_LABELS.monorail,
    short: MODE_SHORT_LABELS.monorail,
    width: 4,
    overlay: [1.2, 2.2],
  },
  light_rail: {
    label: MODE_LABELS.light_rail,
    short: MODE_SHORT_LABELS.light_rail,
    width: 4,
    overlay: [3, 3],
  },
  tram: { label: MODE_LABELS.tram, short: MODE_SHORT_LABELS.tram, width: 3.2, overlay: [1.5, 1.5] },
  funicular: {
    label: MODE_LABELS.funicular,
    short: MODE_SHORT_LABELS.funicular,
    width: 2.8,
    overlay: [0.8, 2.4],
  },
  water_metro: {
    label: MODE_LABELS.water_metro,
    short: MODE_SHORT_LABELS.water_metro,
    width: 3,
    overlay: [1, 3],
  },
};

export const MODE_ORDER: Mode[] = [...MODE_IDS];

export const STATUS_META: Record<Status, { label: string; short: string }> = {
  operational: { label: STATUS_LABELS.operational, short: "Operational" },
  "under-construction": { label: STATUS_LABELS["under-construction"], short: "Under constr." },
  planned: { label: STATUS_LABELS.planned, short: "Planned" },
};

export const STATUS_ORDER: Status[] = [...STATUS_IDS];

export const REGIONS = REGION_IDS;

/** Modes shown by default: suburban and water metro are too dense for a first look. */
export const DEFAULT_HIDDEN_MODES: Mode[] = ["suburban", "water_metro"];

export function lineLabel(line: CityLine): string {
  if (line.ref) return `Line ${line.ref}`;
  return line.name.replace(/\s*\(.*$/, "");
}

export function lineEndpoints(line: CityLine): string {
  if (line.from && line.to) return `${line.from} ↔ ${line.to}`;
  return line.name;
}

/** Length of a line's drawn geometry in kilometres. */
export function lineLengthKm(line: CityLine): number {
  const R = 6371;
  let km = 0;
  for (const segment of line.geometry) {
    for (let i = 1; i < segment.length; i++) {
      const [lat1, lon1] = segment[i - 1];
      const [lat2, lon2] = segment[i];
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      km += 2 * R * Math.asin(Math.sqrt(a));
    }
  }
  return km;
}

export function linesGeoJson(lines: CityLine[]): FeatureCollection<MultiLineString> {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature",
      id: line.osmId,
      properties: {
        id: String(line.osmId),
        city: line.city ?? "",
        mode: line.mode,
        status: line.status,
        colour: line.colour,
        name: line.name,
        ref: line.ref,
        system: line.system,
        w: MODE_META[line.mode]?.width ?? 4,
      },
      geometry: {
        type: "MultiLineString",
        // GeoJSON is [lon, lat]; OSM gives [lat, lon].
        coordinates: line.geometry.map((segment) => segment.map(([lat, lon]) => [lon, lat])),
      },
    })),
  };
}

export function stationsGeoJson(
  stations: CityStation[],
  lines: CityLine[],
  hiddenLineIds: string[] = [],
): FeatureCollection<Point> {
  // Line refs repeat across cities ("Line 1" exists in Delhi, Mumbai, …), so key
  // the lookups by city as well.
  const key = (city: string | undefined, ref: string) => `${city ?? ""}|${ref}`;
  const statusByLine = new Map(lines.map((l) => [key(l.city, l.ref ?? l.name), l.status]));
  const colourByLine = new Map(lines.map((l) => [key(l.city, l.ref ?? l.name), l.colour]));
  const idByLine = new Map(lines.map((l) => [key(l.city, l.ref ?? l.name), String(l.osmId)]));
  const hidden = new Set(hiddenLineIds);

  return {
    type: "FeatureCollection",
    features: stations.map((station) => {
      const statuses = new Set<Status>();
      for (const lineRef of station.lines) {
        const status = statusByLine.get(key(station.city, lineRef));
        if (status) statuses.add(status);
      }
      const lineIds = station.lines
        .map((lineRef) => idByLine.get(key(station.city, lineRef)))
        .filter((id): id is string => Boolean(id));
      // Hide a station only when every line serving it is hidden; interchanges
      // stay visible while any of their lines is on.
      const visible = lineIds.length === 0 || lineIds.some((id) => !hidden.has(id));
      return {
        type: "Feature",
        properties: {
          name: station.name,
          city: station.city ?? "",
          lines: station.lines.join(", "),
          lineIds: lineIds.join("|"),
          visible,
          modes: station.modes.join("|"),
          interchange: station.lines.length > 1,
          colour: colourByLine.get(key(station.city, station.lines[0])) ?? "#64748b",
          "is-operational": statuses.has("operational"),
          "is-under-construction": statuses.has("under-construction"),
          "is-planned": statuses.has("planned"),
        },
        geometry: {
          type: "Point",
          coordinates: [station.lon, station.lat],
        },
      };
    }),
  };
}

export function groupBySystem(lines: CityLine[]) {
  const groups = new Map<string, CityLine[]>();
  for (const line of lines) {
    const key = line.system || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(line);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}
