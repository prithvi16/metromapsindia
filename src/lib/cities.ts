import type { FeatureCollection, MultiLineString, Point } from "geojson";

export type Mode =
  | "metro"
  | "suburban"
  | "rrts"
  | "monorail"
  | "light_rail"
  | "tram"
  | "funicular"
  | "water_metro";

export type Status = "operational" | "under-construction" | "planned";

export type StationRef = { name: string; lat: number; lon: number };

export type CityLine = {
  osmId: number | string;
  /** Slug of the city this line belongs to (set in the combined dataset). */
  city?: string;
  system: string;
  mode: Mode;
  name: string;
  ref: string | null;
  colour: string;
  from: string | null;
  to: string | null;
  operator: string | null;
  status: Status;
  openingDate: string | null;
  /** One or more polylines; disconnected stretches stay separate. */
  geometry: [number, number][][];
  stations: StationRef[];
};

export type CityStation = StationRef & {
  city?: string;
  lines: string[];
  modes: Mode[];
};

export type CityCounts = {
  lines: number;
  stations: number;
  km: number;
  modes: Mode[];
};

export type CityStats = {
  lines: number;
  stations: number;
  km: number;
  opened: string;
  ridership: string | null;
};

export type AllData = {
  generatedAt: string;
  lines: CityLine[];
  stations: CityStation[];
};

export type CityData = {
  slug: string;
  city: string;
  system: string;
  operator: string;
  region: string;
  bounds: [number, number, number, number];
  minZoom: number;
  coverage: "full" | "partial" | "none";
  stats: CityStats;
  counts: CityCounts;
  lines: CityLine[];
  stations: CityStation[];
};

export type PreviewPath = { colour: string; d: string };

export type CitySummary = {
  slug: string;
  city: string;
  system: string;
  operator: string;
  region: string;
  bounds: [number, number, number, number];
  minZoom: number;
  stats: CityStats;
  coverage: "full" | "partial" | "none";
  counts: CityCounts;
  preview: { width: number; height: number; paths: PreviewPath[] } | null;
};

export type CityIndex = {
  generatedAt: string;
  source: string;
  cities: CitySummary[];
};

/** Mode metadata drives both the legend samples and the map stroke widths. */
export const MODE_META: Record<
  Mode,
  { label: string; short: string; width: number; overlay?: number[] }
> = {
  metro: { label: "Metro", short: "Metro", width: 5 },
  // Suburban is deliberately one solid stroke in one colour (no overlay, no
  // per-line colour): the whole commuter network reads as a single layer.
  suburban: { label: "Suburban rail", short: "Suburban", width: 4 },
  rrts: { label: "Regional rapid rail", short: "RRTS", width: 6.5 },
  monorail: { label: "Monorail", short: "Monorail", width: 4, overlay: [1.2, 2.2] },
  light_rail: { label: "Light rail", short: "Light rail", width: 4, overlay: [3, 3] },
  tram: { label: "Tram", short: "Tram", width: 3.2, overlay: [1.5, 1.5] },
  funicular: { label: "Funicular", short: "Funicular", width: 2.8, overlay: [0.8, 2.4] },
  water_metro: { label: "Water metro", short: "Water", width: 3, overlay: [1, 3] },
};

export const MODE_ORDER: Mode[] = [
  "metro",
  "suburban",
  "rrts",
  "monorail",
  "light_rail",
  "tram",
  "funicular",
  "water_metro",
];

export const STATUS_META: Record<Status, { label: string; short: string }> = {
  operational: { label: "Operational", short: "Operational" },
  "under-construction": { label: "Under construction", short: "Under constr." },
  planned: { label: "Planned", short: "Planned" },
};

export const STATUS_ORDER: Status[] = ["operational", "under-construction", "planned"];

export const REGIONS = ["North", "West", "South", "East"] as const;

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
        coordinates: line.geometry.map((segment) =>
          segment.map(([lat, lon]) => [lon, lat]),
        ),
      },
    })),
  };
}

export function stationsGeoJson(
  stations: CityStation[],
  lines: CityLine[],
): FeatureCollection<Point> {
  // Line refs repeat across cities ("Line 1" exists in Delhi, Mumbai, …), so key
  // the lookups by city as well.
  const key = (city: string | undefined, ref: string) => `${city ?? ""}|${ref}`;
  const statusByLine = new Map(
    lines.map((l) => [key(l.city, l.ref ?? l.name), l.status]),
  );
  const colourByLine = new Map(
    lines.map((l) => [key(l.city, l.ref ?? l.name), l.colour]),
  );

  return {
    type: "FeatureCollection",
    features: stations.map((station) => {
      const statuses = new Set<Status>();
      for (const lineRef of station.lines) {
        const status = statusByLine.get(key(station.city, lineRef));
        if (status) statuses.add(status);
      }
      return {
        type: "Feature",
        properties: {
          name: station.name,
          city: station.city ?? "",
          lines: station.lines.join(", "),
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
