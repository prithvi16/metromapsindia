/**
 * Assemble India Rail Info tracks into suburban "lines" for one city.
 *
 * IRI's atlas has no suburban flag: each `track` is a segment between two
 * stations/junctions. The per-city manifest at scripts/suburban/<slug>.json
 * groups those segments into named corridors. This module turns a manifest +
 * the cached IRI extract into CityLine-shaped records that build-cities.ts can
 * merge straight into the dataset.
 *
 * Inputs (produced by scripts/fetch-iri.ts and the iri-suburban agent):
 *   scripts/suburban/<slug>.json
 *   scripts/out/iri/<slug>/stations.geojson
 *   scripts/out/iri/<slug>/tracks-detail.json   (browser-fetched, preferred)
 *   scripts/out/iri/<slug>/tracks.geojson       (tile fallback)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from "geojson";
import {
  type CityLine,
  formatZodError,
  type StationRef,
  type SuburbanManifest,
  SuburbanManifestSchema,
} from "../../shared/schema";
import type { CityConfig } from "../cities";
import { type Coord, haversine, lineLengthKm, point } from "./geo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const manifestDir = path.join(root, "scripts", "suburban");
const iriDir = path.join(root, "scripts", "out", "iri");

/** Every suburban line is drawn in this one colour on the map. */
export const SUBURBAN_COLOUR = "#0f766e";

type IriStationProperties = {
  stnid: number;
  code?: string;
  name?: string;
  type?: number;
  halting?: number;
};

type IriTrackProperties = {
  trackid: string | number;
  name?: string | null;
  tracktype?: number | null;
  zone?: string | null;
  segments?: number;
  vertices?: number;
};

type TrackDetail = {
  TrkCoords?: string;
  StnTable?: string;
  error?: string;
};

type Station = {
  stnid: number;
  name: string;
  lat: number;
  lon: number;
};

/** Min distance (km) from a point to a [lat, lon] polyline, plus the nearest vertex. */
function distanceToLine(
  p: { lat: number; lon: number },
  line: Coord[],
): { km: number; at: number } {
  let best = Infinity;
  let at = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const latScale = 111.32;
    const lonScale = 111.32 * Math.cos((p.lat * Math.PI) / 180);
    const ax = (a[1] - p.lon) * lonScale;
    const ay = (a[0] - p.lat) * latScale;
    const bx = (b[1] - p.lon) * lonScale;
    const by = (b[0] - p.lat) * latScale;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : -(ax * dx + ay * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) {
      best = d;
      at = i - 1 + t;
    }
  }
  return { km: best, at };
}

function cleanStationName(name: string, aliases: Record<string, string>): string {
  if (aliases[name]) return aliases[name];
  let out = name;
  for (const suffix of [
    /\s+Jn$/i,
    /\s+Junction$/i,
    /\s+Trm$/i,
    /\s+Terminus$/i,
    /\s+EMU Carshed$/i,
    /\s+Cabin$/i,
    /\s+Yard$/i,
    /\s+Depot$/i,
    /\s+Workshop$/i,
    /\s+Halt$/i,
  ]) {
    out = out.replace(suffix, "");
  }
  return out.trim();
}

function coordsFromDetail(entry: TrackDetail | undefined): Coord[] | null {
  if (!entry?.TrkCoords) return null;
  return entry.TrkCoords.trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").slice(0, 2).map(Number))
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
    .map(([lon, lat]) => [lat, lon] as Coord);
}

function coordsFromTile(
  feature: Feature<LineString | MultiLineString, IriTrackProperties> | undefined,
): Coord[][] {
  if (!feature) return [];
  const geom = feature.geometry;
  const pieces =
    geom.type === "LineString"
      ? [geom.coordinates]
      : geom.type === "MultiLineString"
        ? geom.coordinates
        : [];
  return pieces
    .map((piece) => piece.map(([lon, lat]) => [lat, lon] as Coord))
    .filter((piece) => piece.length > 1);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export type SuburbanResult = {
  manifest: SuburbanManifest | null;
  lines: CityLine[];
  warnings: string[];
};

export async function assembleSuburban(city: CityConfig): Promise<SuburbanResult> {
  const warnings: string[] = [];
  const rawManifest = await readJson<unknown>(path.join(manifestDir, `${city.slug}.json`));
  if (!rawManifest) return { manifest: null, lines: [], warnings };

  const parsed = SuburbanManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error, `scripts/suburban/${city.slug}.json`));
  }
  const manifest = parsed.data;

  const dir = path.join(iriDir, city.slug);
  const stationFc = await readJson<FeatureCollection<Point, IriStationProperties>>(
    path.join(dir, "stations.geojson"),
  );
  const detail = await readJson<Record<string, TrackDetail>>(path.join(dir, "tracks-detail.json"));
  const tileFc = await readJson<
    FeatureCollection<LineString | MultiLineString, IriTrackProperties>
  >(path.join(dir, "tracks.geojson"));

  if (!stationFc) {
    warnings.push(
      `${city.slug}: no IRI stations.geojson — run scripts/fetch-iri.ts --city=${city.slug}`,
    );
    return { manifest, lines: [], warnings };
  }

  const tileById = new Map(
    (tileFc?.features ?? []).map((feature) => [String(feature.properties.trackid), feature]),
  );
  const aliases = manifest.stationAliases ?? {};
  const NOT_A_STATION =
    /\b(loco shed|carshed|car shed|workshop|depot|yard|cabin|diesel shed|electric shed|goods trm|goods terminal|goods shed|block hut|panel)\b/i;
  const stations: Station[] = stationFc.features
    .filter((feature) => Number(feature.properties.type) <= 2)
    .filter((feature) => !NOT_A_STATION.test(String(feature.properties.name ?? "")))
    .map((feature) => ({
      stnid: feature.properties.stnid,
      name: cleanStationName(String(feature.properties.name ?? ""), aliases),
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
    }))
    .filter(
      (station) => station.name && Number.isFinite(station.lat) && Number.isFinite(station.lon),
    );

  const lines: CityLine[] = [];
  for (const spec of manifest.lines) {
    const stretches: Coord[][] = [];
    let usedTracks = 0;
    const anchor = stations.find(
      (station) => station.name.toLowerCase() === String(spec.from ?? "").toLowerCase(),
    );

    // Stations listed in the track detail's StnTable are the exact stops on
    // that track; use them to keep nearby-but-unrelated stations out.
    const allowed = new Set<number>();
    for (const trackid of spec.tracks ?? []) {
      const table = detail?.[String(trackid)]?.StnTable;
      if (!table) continue;
      for (const match of table.matchAll(/stationID="(\d+)"/g)) allowed.add(Number(match[1]));
    }

    // Collect every piece, then chain by nearest endpoint. This copes with
    // manifests written in either direction and mixed track orientations.
    const pieces: Coord[][] = [];
    for (const trackid of spec.tracks ?? []) {
      const id = String(trackid);
      const fromDetail = coordsFromDetail(detail?.[id]);
      const parts = fromDetail?.length ? [fromDetail] : coordsFromTile(tileById.get(id));
      if (!parts.length) {
        warnings.push(`${city.slug}/${spec.name}: no geometry for track ${id}`);
        continue;
      }
      for (const part of parts) if (part.length > 1) pieces.push(part);
      usedTracks++;
    }

    const remaining = pieces.map((piece) => piece.slice());
    let cursor = anchor ? { lat: anchor.lat, lon: anchor.lon } : null;
    let current: Coord[] | null = null;
    while (remaining.length) {
      let best: { i: number; reverse: boolean; dist: number } | null = null;
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (!cursor) {
          best = { i, reverse: false, dist: 0 };
          break;
        }
        const first = candidate[0];
        const last = candidate[candidate.length - 1];
        const d0 = haversine(cursor, point(first));
        const d1 = haversine(cursor, point(last));
        const dist = Math.min(d0, d1);
        if (!best || dist < best.dist) best = { i, reverse: d1 < d0, dist };
      }
      if (!best) break;
      const piece = remaining.splice(best.i, 1)[0];
      let coords = best.reverse ? piece.slice().reverse() : piece;
      if (current && best.dist <= 0.4) {
        if (best.dist < 0.03) coords = coords.slice(1);
        current.push(...coords);
      } else {
        if (current) stretches.push(current);
        current = coords.slice();
      }
      cursor = point(current[current.length - 1]);
    }
    if (current) stretches.push(current);

    if (!stretches.length) {
      warnings.push(`${city.slug}/${spec.name}: no usable geometry`);
      continue;
    }

    const geometry = stretches.filter((stretch) => stretch.length > 1);
    const found: (Station & { order: number })[] = [];
    const useAllowed = allowed.size > 0;
    const maxKm = useAllowed ? 0.6 : 0.3;
    for (const station of stations) {
      if (useAllowed && !allowed.has(station.stnid)) continue;
      let best: { km: number; at: number; stretch: number } | null = null;
      for (let i = 0; i < geometry.length; i++) {
        const hit = distanceToLine(station, geometry[i]);
        if (hit.km <= maxKm && (!best || hit.km < best.km)) {
          best = { ...hit, stretch: i };
        }
      }
      if (best) found.push({ ...station, order: best.stretch * 1e6 + best.at });
    }
    found.sort((a, b) => a.order - b.order);

    const seen = new Set<number>();
    const lineStations: StationRef[] = [];
    for (const station of found) {
      if (seen.has(station.stnid)) continue;
      // IRI sometimes lists the same physical station twice (e.g. MAS and MASS
      // after aliasing) — merge by name within 1 km.
      const duplicate = lineStations.some(
        (existing) =>
          existing.name.toLowerCase() === station.name.toLowerCase() &&
          haversine(existing, station) < 1,
      );
      if (duplicate) continue;
      seen.add(station.stnid);
      lineStations.push({ name: station.name, lat: station.lat, lon: station.lon });
    }

    // Orient the line so the manifest's `from` station is first. The track
    // detail does not guarantee a direction.
    const bare = (value: string | undefined) => String(value ?? "").toLowerCase();
    const iFrom = lineStations.findIndex((station) => bare(station.name) === bare(spec.from));
    const iTo = lineStations.findIndex((station) => bare(station.name) === bare(spec.to));
    const reverse =
      iFrom > -1 && iTo > -1
        ? iFrom > iTo
        : iFrom > -1
          ? iFrom > lineStations.length / 2
          : iTo > -1 && iTo < lineStations.length / 2;
    if (reverse) {
      geometry.reverse();
      for (const stretch of geometry) stretch.reverse();
      lineStations.reverse();
    }

    // StnTable sometimes references a station id that is absent from the point
    // layer (e.g. CSMT's secondary id), so re-add the manifest termini by name
    // when they sit at an end of the drawn line.
    for (const endpoint of [spec.from, spec.to]) {
      if (!endpoint) continue;
      const station = stations.find((candidate) => candidate.name.toLowerCase() === bare(endpoint));
      if (!station) continue;
      if (
        lineStations.some(
          (candidate) => candidate.name.toLowerCase() === station.name.toLowerCase(),
        )
      ) {
        continue;
      }
      const first = lineStations[0];
      const last = lineStations[lineStations.length - 1];
      if (!first || !last) continue;
      const dStart = haversine(station, first);
      const dEnd = haversine(station, last);
      if (Math.min(dStart, dEnd) <= 2) {
        if (dStart <= dEnd) lineStations.unshift(station);
        else lineStations.push(station);
      }
    }

    // Trim the drawn line at its declared termini. Some IRI tracks run past the
    // last suburban stop (e.g. Palwal to Rundhi); the manifest decides the end.
    if (spec.from && spec.to && bare(spec.from) !== bare(spec.to) && lineStations.length > 2) {
      const nameIndex = (name: string) =>
        lineStations.findIndex((station) => station.name.toLowerCase() === bare(name));
      const startIdx = nameIndex(spec.from);
      let endIdx = nameIndex(spec.to);
      const trimStart = startIdx > 0;
      if (trimStart) {
        lineStations.splice(0, startIdx);
        if (endIdx >= 0) endIdx -= startIdx;
      }
      const trimEnd = endIdx >= 0 && endIdx < lineStations.length - 1;
      if (trimEnd) lineStations.splice(endIdx + 1);

      const nearestVertex = (stretch: Coord[], station: StationRef) => {
        let index = 0;
        let best = Infinity;
        for (let i = 0; i < stretch.length; i++) {
          const distance = haversine(point(stretch[i]), station);
          if (distance < best) {
            best = distance;
            index = i;
          }
        }
        return { index, km: best };
      };

      if (trimStart) {
        const startCut = nearestVertex(geometry[0], lineStations[0]);
        if (startCut.index > 0 && startCut.index < geometry[0].length - 1 && startCut.km < 3) {
          geometry[0] = geometry[0].slice(startCut.index);
        }
      }
      if (trimEnd) {
        const last = geometry.length - 1;
        const endCut = nearestVertex(geometry[last], lineStations[lineStations.length - 1]);
        if (endCut.index > 0 && endCut.index < geometry[last].length - 1 && endCut.km < 3) {
          geometry[last] = geometry[last].slice(0, endCut.index + 1);
        }
      }
    }

    if (lineStations.length < 2) {
      warnings.push(
        `${city.slug}/${spec.name}: only ${lineStations.length} station(s) within 300 m`,
      );
    }

    lines.push({
      osmId: `iri:${city.slug}:${spec.id ?? spec.name}`,
      system: manifest.system || `${city.city} Suburban Railway`,
      mode: "suburban",
      name: spec.name,
      ref: spec.ref ?? null,
      colour: SUBURBAN_COLOUR,
      from: spec.from ?? lineStations[0]?.name ?? null,
      to: spec.to ?? lineStations[lineStations.length - 1]?.name ?? null,
      operator: manifest.operator ?? "Indian Railways",
      status: spec.status ?? "operational",
      openingDate: null,
      geometry,
      stations: lineStations,
      curated: true,
      source: `India Rail Info atlas ${manifest.build ?? ""}`.trim(),
      iriTracks: (spec.tracks ?? []).map(String),
    });

    console.log(
      `  ${spec.name}: ${usedTracks}/${(spec.tracks ?? []).length} tracks, ${lineStations.length} stations, ${lineLengthKm(geometry).toFixed(1)} km`,
    );
  }

  for (const warning of warnings) console.log(`    ! ${warning}`);
  return { manifest, lines, warnings };
}
