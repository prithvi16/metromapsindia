import type { FeatureCollection, LineString, Point } from "geojson";
import raw from "../data/mumbai-metro.json";

export type MetroStatus = "operational" | "under-construction" | "planned";

export type StationRef = {
  name: string;
  lat: number;
  lon: number;
};

export type MetroLine = {
  osmId: number;
  name: string;
  label?: string;
  ref: string | null;
  colour: string | null;
  from: string | null;
  to: string | null;
  operator: string | null;
  network: string | null;
  status: MetroStatus;
  openingDate: string | null;
  geometry: [number, number][];
  stations: StationRef[];
};

export type MetroStation = StationRef & {
  lines: string[];
};

export type MetroDataset = {
  generatedAt: string;
  source: string;
  bbox: string;
  lines: MetroLine[];
  stations: MetroStation[];
};

export const metro = raw as unknown as MetroDataset;

/**
 * Fallback palette, used when OSM has no `colour` tag on the route relation.
 * Keyed by line number so new OSM data still picks up the right brand colour.
 */
const LINE_COLOURS: Record<string, string> = {
  "1": "#1f6feb",
  "2A": "#f0b429",
  "2B": "#f0b429",
  "3": "#00a3a1",
  "4": "#2e9e4f",
  "4A": "#2e9e4f",
  "5": "#ef7c1a",
  "6": "#c026d3",
  "7": "#e63946",
  "9": "#7c5cff",
};

const NAMED_COLOURS: Record<string, string> = {
  aqua: "#00a3a1",
  blue: "#1f6feb",
  green: "#2e9e4f",
  orange: "#ef7c1a",
  pink: "#ec4899",
  purple: "#7c5cff",
  red: "#e63946",
  yellow: "#f0b429",
  violet: "#7c5cff",
  magenta: "#c026d3",
};

export function lineColour(line: MetroLine): string {
  const raw = (line.colour ?? "").trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(raw)) return raw;
  if (NAMED_COLOURS[raw]) return NAMED_COLOURS[raw];
  const key = (line.ref ?? "").toUpperCase();
  if (LINE_COLOURS[key]) return LINE_COLOURS[key];
  return "#64748b";
}

export function lineLabel(line: MetroLine): string {
  return line.label ?? (line.ref ? `Line ${line.ref}` : line.name);
}

export function lineEndpoints(line: MetroLine): string {
  if (line.from && line.to) return `${line.from} ↔ ${line.to}`;
  return line.name;
}

const STATUS_LABEL: Record<MetroStatus, string> = {
  operational: "Operational",
  "under-construction": "Under construction",
  planned: "Planned",
};

export function statusLabel(status: MetroStatus): string {
  return STATUS_LABEL[status];
}

export function linesGeoJson(lines: MetroLine[]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature",
      id: line.osmId,
      properties: {
        ref: line.ref,
        name: line.name,
        label: lineLabel(line),
        status: line.status,
        colour: lineColour(line),
      },
      geometry: {
        type: "LineString",
        // GeoJSON is [lon, lat]; OSM gives us [lat, lon].
        coordinates: line.geometry.map(([lat, lon]) => [lon, lat]),
      },
    })),
  };
}

export function stationsGeoJson(
  stations: MetroStation[],
  lines: MetroLine[],
): FeatureCollection<Point> {
  const byRef = new Map(lines.map((l) => [l.ref ?? l.name, l]));

  return {
    type: "FeatureCollection",
    features: stations.map((station) => {
      const serving = station.lines.map((ref) => byRef.get(ref)).filter(Boolean) as MetroLine[];
      const statuses = new Set(serving.map((l) => l.status));
      return {
        type: "Feature" as const,
        properties: {
          name: station.name,
          lines: station.lines.join(", "),
          interchange: station.lines.length > 1,
          colour: serving.length ? lineColour(serving[0]) : "#64748b",
          "is-operational": statuses.has("operational"),
          "is-under-construction": statuses.has("under-construction"),
          "is-planned": statuses.has("planned"),
        },
        geometry: {
          type: "Point" as const,
          coordinates: [station.lon, station.lat],
        },
      };
    }),
  };
}

export function groupLinesByStatus(lines: MetroLine[]) {
  const groups: Record<MetroStatus, MetroLine[]> = {
    operational: [],
    "under-construction": [],
    planned: [],
  };
  for (const line of lines) groups[line.status].push(line);
  return groups;
}
