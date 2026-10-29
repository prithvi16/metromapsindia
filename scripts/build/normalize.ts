import {
  type CityLine,
  type CityStation,
  type CurationPatch,
  MODE_IDS,
  type StationRef,
  type Status,
} from "../../shared/schema";
import type { CityConfig } from "../cities";
import { haversine, totalPoints } from "../lib/geo";
import {
  colourFor,
  indexElements,
  modeFor,
  nearestName,
  type OsmNode,
  type OsmResponse,
  statusFor,
  stitchGeometry,
  stopNodes,
} from "../lib/osm";
import { cleanerName, stationDisplay, stationKey } from "../lib/stations";
import { applyCuration, relationOverrides } from "./curate";

export type MasterStation = { name: string; lat: number; lon: number };
export type MasterSystem = {
  city: string;
  active_lines: { stations: MasterStation[] }[];
};

export type NormalizedCity = {
  lines: CityLine[];
  warnings: string[];
  dropped: number;
};

export function masterStationsFor(city: CityConfig, master: MasterSystem[]): MasterStation[] {
  const system = master.find((candidate) => candidate.city === city.city);
  if (!system) return [];
  return system.active_lines.flatMap((line) =>
    line.stations.map((station) => ({
      name: station.name,
      lat: station.lat,
      lon: station.lon,
    })),
  );
}

export function normalizeCity(
  city: CityConfig,
  raw: OsmResponse,
  assigned: Map<number, string>,
  curation: CurationPatch | null,
  master: MasterSystem[],
): NormalizedCity {
  const warnings: string[] = [];
  const { nodes, ways, relations } = indexElements(raw.elements);
  const own = relations.filter((relation) => assigned.get(relation.id) === city.slug);
  const overrides = relationOverrides(curation);

  const namedStations = [...nodes.values()].filter(
    (node) =>
      node.tags?.name &&
      (node.tags.railway === "station" || node.tags.public_transport === "station"),
  );

  function stopName(node: OsmNode): string | null {
    if (node.tags?.name) return node.tags.name;
    return nearestName(
      node,
      namedStations.map((station) => ({
        name: station.tags?.name ?? "",
        lat: station.lat,
        lon: station.lon,
      })),
      0.35,
    );
  }

  const masterNames = masterStationsFor(city, master);
  const byLine = new Map<string, CityLine>();
  let dropped = 0;

  for (const relation of own) {
    if (overrides.dropOsmIds.has(relation.id)) {
      dropped++;
      continue;
    }
    const tags = relation.tags ?? {};
    const mode = modeFor(tags);
    const geometry = stitchGeometry(relation, ways, nodes, city.alignmentWays);
    if (geometry.length === 0) continue;

    const stops = stopNodes(relation, nodes)
      .map((node): StationRef | null => {
        let name = stopName(node);
        if (!name) {
          // Fall back to the curated master list within 500 m.
          name = nearestName(node, masterNames, 0.5);
        }
        return name
          ? { name, lat: Number(node.lat.toFixed(6)), lon: Number(node.lon.toFixed(6)) }
          : null;
      })
      .filter((stop): stop is StationRef => Boolean(stop));

    // Termini are often unnamed stop_positions; take the names from from/to.
    if (geometry.length > 0) {
      const first = geometry[0][0];
      const lastSegment = geometry[geometry.length - 1];
      const last = lastSegment[lastSegment.length - 1];
      if (tags.from && (!stops.length || stops[0].name !== tags.from)) {
        stops.unshift({
          name: tags.from,
          lat: Number(first[0].toFixed(6)),
          lon: Number(first[1].toFixed(6)),
        });
      }
      if (tags.to && (!stops.length || stops[stops.length - 1].name !== tags.to)) {
        stops.push({
          name: tags.to,
          lat: Number(last[0].toFixed(6)),
          lon: Number(last[1].toFixed(6)),
        });
      }
    }

    let ref = tags.ref ?? null;
    if (ref != null && overrides.refOverrides.has(ref)) {
      ref = overrides.refOverrides.get(ref) ?? ref;
    }
    let status: Status = statusFor(tags);
    if (ref != null && overrides.statusOverrides.has(ref)) {
      status = overrides.statusOverrides.get(ref) ?? status;
    }

    const rawName = tags.name ?? ref ?? `relation ${relation.id}`;
    const name = rawName
      .replace(/\s*=>\s*/g, " → ")
      .replace(/\s*\(u\/c\)\s*/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const key = `${mode}|${ref ?? ""}|${name.replace(/\s*[:(].*$/, "")}`;

    const candidate: CityLine = {
      osmId: relation.id,
      system: tags.network ?? city.system,
      mode,
      name,
      ref,
      colour: colourFor(tags, mode),
      from: tags.from ?? null,
      to: tags.to ?? null,
      operator: tags.operator ?? city.operator,
      status,
      openingDate: tags.opening_date ?? null,
      geometry,
      stations: stops,
    };

    const existing = byLine.get(key);
    if (!existing || totalPoints(candidate.geometry) > totalPoints(existing.geometry)) {
      byLine.set(key, candidate);
    }
  }

  // Some lines are mapped twice, once with a ref and once without. Drop the
  // ref-less duplicate when a named line already exists.
  const named = new Map<string, CityLine>();
  const deduped: CityLine[] = [];
  for (const line of byLine.values()) {
    const key = `${line.mode}|${line.name.replace(/\s*[:(].*$/, "")}`;
    const existing = named.get(key);
    if (existing) {
      if (!line.ref && existing.ref) continue;
      if (line.ref && !existing.ref) {
        named.set(key, line);
        const index = deduped.indexOf(existing);
        if (index !== -1) deduped[index] = line;
        continue;
      }
    }
    named.set(key, line);
    deduped.push(line);
  }

  let lines = deduped.sort((a, b) => MODE_IDS.indexOf(a.mode) - MODE_IDS.indexOf(b.mode));

  if (curation) {
    const applied = applyCuration(lines, curation, city);
    lines = applied.lines;
    warnings.push(...applied.warnings);
    if (applied.lines.some((line) => line.curated)) {
      console.log(`    · curation applied (${curation.sources.length} sources)`);
    }
  }

  return { lines, warnings, dropped };
}

/** Cluster stop records into one station per physical interchange. */
export function clusterStations(lines: CityLine[]): CityStation[] {
  const stationIndex = new Map<string, CityStation[]>();
  for (const line of lines) {
    for (const stop of line.stations) {
      const key = stationKey(stop.name);
      if (!key) continue;
      const display = stationDisplay(stop.name);
      const bucket = stationIndex.get(key) ?? [];
      // Same-mode duplicates need to be close to be the same station; a
      // metro/suburban pair can sit at opposite ends of a large interchange.
      const hit = bucket.find(
        (station) => haversine(station, stop) < (station.modes.includes(line.mode) ? 1.0 : 1.5),
      );
      if (hit) {
        if (!hit.lines.includes(line.ref ?? line.name)) hit.lines.push(line.ref ?? line.name);
        if (!hit.modes.includes(line.mode)) hit.modes.push(line.mode);
        if (cleanerName(display, hit.name)) hit.name = display;
        continue;
      }
      bucket.push({
        ...stop,
        name: display,
        lines: [line.ref ?? line.name],
        modes: [line.mode],
      });
      stationIndex.set(key, bucket);
    }
  }
  return [...stationIndex.values()].flat().sort((a, b) => a.name.localeCompare(b.name));
}
