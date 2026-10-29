import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CityLine,
  type CurationPatch,
  CurationPatchSchema,
  formatZodError,
  type PatchMatch,
  type StationRef,
  type Status,
} from "../../shared/schema";
import type { CityConfig } from "../cities";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const curationDir = path.join(__dirname, "..", "curation");

export async function loadCuration(slug: string): Promise<CurationPatch | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(curationDir, `${slug}.json`), "utf8");
  } catch {
    return null;
  }
  const parsed = CurationPatchSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error, `scripts/curation/${slug}.json`));
  }
  return parsed.data;
}

export function matchesPatch(
  line: Pick<CityLine, "ref" | "mode" | "name">,
  match: PatchMatch = {},
): boolean {
  if (match.ref != null && String(line.ref ?? "") !== String(match.ref)) return false;
  if (match.mode && line.mode !== match.mode) return false;
  if (
    match.nameIncludes &&
    !line.name.toLowerCase().includes(String(match.nameIncludes).toLowerCase())
  ) {
    return false;
  }
  return true;
}

function validStation(
  station: StationRef | undefined,
  city: CityConfig,
  warnings: string[],
  label: string,
): StationRef | null {
  const [west, south, east, north] = city.bounds;
  const pad = 0.6;
  if (!station?.name || !Number.isFinite(station.lat) || !Number.isFinite(station.lon)) {
    warnings.push(`${label}: station needs name, lat and lon`);
    return null;
  }
  if (
    station.lat < south - pad ||
    station.lat > north + pad ||
    station.lon < west - pad ||
    station.lon > east + pad
  ) {
    warnings.push(`${label}: "${station.name}" falls outside ${city.city}`);
    return null;
  }
  return {
    name: station.name,
    lat: Number(station.lat.toFixed(6)),
    lon: Number(station.lon.toFixed(6)),
  };
}

/**
 * Apply a hand-checked patch from scripts/curation/<slug>.json. Every entry is
 * expected to carry a source URL in the file's `sources` array.
 */
export function applyCuration(
  lines: CityLine[],
  curation: CurationPatch,
  city: CityConfig,
): { lines: CityLine[]; warnings: string[] } {
  const warnings: string[] = [];

  for (const patch of curation.lines ?? []) {
    const targets = lines.filter((line) => matchesPatch(line, patch.match));
    if (!targets.length) {
      warnings.push(`no line matched ${JSON.stringify(patch.match)}`);
      continue;
    }
    for (const line of targets) {
      if (patch.status) line.status = patch.status;
      if (patch.colour) line.colour = patch.colour;
      if (patch.from) line.from = patch.from;
      if (patch.to) line.to = patch.to;
      if (Array.isArray(patch.stations)) {
        const stations = patch.stations
          .map((station) => validStation(station, city, warnings, line.ref ?? line.name))
          .filter((station): station is StationRef => Boolean(station));
        if (patch.stationsMode === "append") {
          const seen = new Set(line.stations.map((station) => station.name.toLowerCase()));
          for (const station of stations) {
            if (!seen.has(station.name.toLowerCase())) line.stations.push(station);
          }
        } else {
          line.stations = stations;
        }
      }
      line.curated = true;
    }
  }

  for (const add of curation.addLines ?? []) {
    const stations = (add.stations ?? [])
      .map((station) => validStation(station, city, warnings, add.name))
      .filter((station): station is StationRef => Boolean(station));

    let geometry = add.geometry ?? [];
    if (geometry.length && typeof geometry[0][0] === "number") {
      geometry = [geometry as [number, number][]];
    }
    if (!geometry.length) warnings.push(`addLines "${add.name}" has no geometry`);

    lines.push({
      osmId: add.osmId ?? `curated:${city.slug}:${add.ref ?? add.name}`,
      system: add.system ?? city.system,
      mode: add.mode ?? "metro",
      name: add.name,
      ref: add.ref ?? null,
      colour: add.colour ?? "#64748b",
      from: add.from ?? null,
      to: add.to ?? null,
      operator: add.operator ?? city.operator,
      status: add.status ?? "under-construction",
      openingDate: add.openingDate ?? null,
      geometry: (geometry as [number, number][][]).map((segment) =>
        segment.map(([lat, lon]) => [Number(lat), Number(lon)] as [number, number]),
      ),
      stations,
      curated: true,
    });
  }

  for (const drop of curation.dropLines ?? []) {
    const before = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (matchesPatch(lines[i], drop.match)) lines.splice(i, 1);
    }
    if (lines.length === before) {
      warnings.push(`drop matched nothing: ${JSON.stringify(drop.match)}`);
    }
  }

  return { lines, warnings };
}

export type RelationOverrides = {
  dropOsmIds: Set<number>;
  refOverrides: Map<string, string>;
  statusOverrides: Map<string, Status>;
};

export function relationOverrides(curation: CurationPatch | null): RelationOverrides {
  return {
    dropOsmIds: new Set(curation?.dropOsmIds ?? []),
    refOverrides: new Map(Object.entries(curation?.refOverrides ?? {})),
    statusOverrides: new Map(Object.entries(curation?.statusOverrides ?? {}) as [string, Status][]),
  };
}
