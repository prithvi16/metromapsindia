/**
 * Extract railway stations and tracks from India Rail Info's atlas vector tiles.
 *
 * The atlas is a MapLibre map backed by one public vector-tile source:
 *   https://maps.indiarailinfo.com/data/iritiles<build>/{z}/{x}/{y}.pbf
 * There is no REST "line" API for bulk data: the linework lives in the tiles.
 *
 * Usage:
 *   npm run data:iri -- --city=mumbai
 *   npm run data:iri -- --bbox=72.75,18.88,73.30,19.38 --out=scripts/out/iri/mumbai
 *
 * Options:
 *   --city=slug        read bounds from scripts/cities.ts (preferred)
 *   --bbox=w,s,e,n     required if --city is omitted
 *   --zoom=12          tile zoom (the source has no tiles above z12)
 *   --version=...      tile build id, i.e. #atl_version on /atlas
 *   --out=dir          output directory (default scripts/out/iri/<slug>)
 *
 * Outputs (in --out):
 *   stations.geojson   station points with stnid/code/name/type/halting
 *   tracks.geojson     stitched z12 linework per trackid
 *   tracks.json        track table (id, name, type, zone, segment counts)
 *
 * Full-resolution linework per track comes from /atlas/track/<trackid> and is
 * fetched through a browser by the iri-suburban agent; this script only needs
 * the open tile host.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VectorTile } from "@mapbox/vector-tile";
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from "geojson";
import { PbfReader } from "pbf";
import { CITIES } from "./cities";
import { fail, getArg, hasFlag, parseArgs, printHelp } from "./lib/args";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const HELP = `
Extract stations and tracks from the India Rail Info atlas tiles.

Usage:
  npm run data:iri -- --city=slug [options]
  npm run data:iri -- --bbox=west,south,east,north [options]

Options:
  --city=slug       Read the suburban bounds from scripts/cities.ts
  --bbox=w,s,e,n    Explicit bounds when --city is omitted
  --zoom=12         Tile zoom (default 12, the source maximum)
  --version=...     Atlas tile build id
  --out=dir         Output directory (default scripts/out/iri/<slug>)
  --help            Show this message
`;

type Station = {
  stnid: number;
  code?: string;
  name?: string;
  type?: number;
  halting?: number;
  priority?: number;
  lon: number;
  lat: number;
};

type TrackMeta = {
  name?: string;
  tracktype?: number;
  zone?: string;
  zoneName?: string;
};

type TileProperties = Record<string, unknown>;

const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tile = (lat: number, z: number) => {
  const radians = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** z);
};

const same = (a: number[] | undefined, b: number[] | undefined) =>
  Boolean(a && b && Math.abs(a[0] - b[0]) < 5e-5 && Math.abs(a[1] - b[1]) < 5e-5);

/** Join tile-clipped segments of one track into a single ordered line. */
function stitch(segments: [number, number][][]): LineString | MultiLineString {
  const parts = segments.filter((part) => part.length > 1).map((part) => part.slice());
  if (!parts.length) return { type: "LineString", coordinates: [] };

  const used = new Set<number>();
  let longest = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > parts[longest].length) longest = i;
  }
  const line = parts[longest].slice();
  used.add(longest);

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < parts.length; i++) {
      if (used.has(i)) continue;
      const part = parts[i];
      if (same(line.at(-1), part[0])) line.push(...part.slice(1));
      else if (same(line.at(-1), part.at(-1))) line.push(...part.slice(0, -1).reverse());
      else if (same(line[0], part.at(-1))) line.unshift(...part.slice(0, -1));
      else if (same(line[0], part[0])) line.unshift(...part.slice(1).reverse());
      else continue;
      used.add(i);
      changed = true;
    }
  }

  const leftovers = parts.filter((_, index) => !used.has(index));
  if (!leftovers.length) return { type: "LineString", coordinates: line };
  return { type: "MultiLineString", coordinates: [line, ...leftovers] };
}

async function main(): Promise<void> {
  const args = parseArgs(undefined, { booleans: ["help"] });
  if (hasFlag(args, "help")) printHelp(HELP);

  const citySlug = getArg(args, "city");
  const bboxArg = getArg(args, "bbox");
  let bounds: number[];
  if (citySlug) {
    const city = CITIES.find((candidate) => candidate.slug === citySlug);
    if (!city) {
      fail(`Unknown city "${citySlug}". Known: ${CITIES.map((city) => city.slug).join(", ")}`);
    }
    // Suburban imports need the commuter catchment, not the metro-region box.
    bounds = city.suburbanBounds ?? city.bounds;
  } else {
    bounds = (bboxArg ?? "").split(",").map(Number);
  }

  const [w, s, e, n] = bounds;
  if (![w, s, e, n].every(Number.isFinite)) {
    fail("Pass --city=<slug> or --bbox=west,south,east,north");
  }

  const zoom = Number(getArg(args, "zoom") ?? 12);
  // Read #atl_version from https://indiarailinfo.com/atlas when it changes.
  const version = getArg(args, "version") ?? "1793079041";
  const outDir = path.resolve(
    root,
    getArg(args, "out") ?? path.join("scripts/out/iri", citySlug ?? "bbox"),
  );
  const cacheDir = path.resolve(root, "scripts/out/iri/cache", version);
  const tileUrl = `https://maps.indiarailinfo.com/data/iritiles${version}`;

  const x0 = lon2tile(w, zoom);
  const x1 = lon2tile(e, zoom);
  const y0 = lat2tile(n, zoom);
  const y1 = lat2tile(s, zoom);

  const cachePath = (x: number, y: number) =>
    path.join(cacheDir, String(zoom), String(x), `${y}.pbf`);

  async function readCache(x: number, y: number): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await fs.readFile(cachePath(x, y)));
    } catch {
      return null;
    }
  }

  async function writeCache(x: number, y: number, buffer: Uint8Array): Promise<void> {
    const file = cachePath(x, y);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
  }

  async function getTile(x: number, y: number): Promise<Uint8Array | null> {
    const cached = await readCache(x, y);
    if (cached) return cached;

    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const res = await fetch(`${tileUrl}/${zoom}/${x}/${y}.pbf`);
        if (res.status === 404) return null;
        // The tile host briefly 403s when hammered; back off and retry.
        if (res.status === 403 || res.status === 429) {
          const wait = Number(res.headers.get("retry-after")) * 1000 || attempt * 2000;
          console.warn(`  ${res.status} on ${x}/${y}, waiting ${wait / 1000}s`);
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = new Uint8Array(await res.arrayBuffer());
        await writeCache(x, y, buffer);
        return buffer;
      } catch (error) {
        if (attempt === 6) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    return null;
  }

  const stations = new Map<number, Station>();
  const tracks = new Map<string, [number, number][][]>();
  const trackMeta = new Map<string, TrackMeta>();

  let done = 0;
  const total = (x1 - x0 + 1) * (y1 - y0 + 1);
  const queue: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) queue.push([x, y]);

  async function worker(): Promise<void> {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const [x, y] = job;
      const buffer = await getTile(x, y);
      done++;
      if (done % 20 === 0) console.log(`  ${done}/${total} tiles`);
      if (!buffer) continue;

      const tile = new VectorTile(new PbfReader(buffer));

      const stationLayer = tile.layers.station;
      if (stationLayer) {
        for (let i = 0; i < stationLayer.length; i++) {
          const feature = stationLayer.feature(i);
          const properties = feature.properties as TileProperties;
          const stnid = Number(properties.stnid);
          if (!stations.has(stnid)) {
            const geometry = feature.toGeoJSON(x, y, zoom).geometry;
            if (geometry.type !== "Point") continue;
            const [lon, lat] = geometry.coordinates;
            stations.set(stnid, {
              stnid,
              code: properties.stncode as string | undefined,
              name: properties.stnname as string | undefined,
              type: properties.type as number | undefined,
              halting: properties.halting as number | undefined,
              priority: properties.priority as number | undefined,
              lon,
              lat,
            });
          }
        }
      }

      const trackLayer = tile.layers.track;
      if (trackLayer) {
        for (let i = 0; i < trackLayer.length; i++) {
          const feature = trackLayer.feature(i);
          const properties = feature.properties as TileProperties;
          const trackid = String(properties.trackid);
          const geometry = feature.toGeoJSON(x, y, zoom).geometry;
          if (!tracks.has(trackid)) tracks.set(trackid, []);
          // A track can be clipped into a MultiLineString inside one tile.
          if (geometry.type === "LineString") {
            tracks.get(trackid)?.push(geometry.coordinates as [number, number][]);
          } else if (geometry.type === "MultiLineString") {
            tracks.get(trackid)?.push(...(geometry.coordinates as [number, number][][]));
          }
        }
      }

      const mpsLayer = tile.layers.mps;
      if (mpsLayer) {
        for (let i = 0; i < mpsLayer.length; i++) {
          const properties = mpsLayer.feature(i).properties as TileProperties;
          const trackid = String(properties.trackid);
          if (!trackMeta.has(trackid)) {
            trackMeta.set(trackid, {
              name: properties.trackname as string | undefined,
              tracktype: properties.tracktype as number | undefined,
              zone: properties.zonecode as string | undefined,
              zoneName: properties.zonename as string | undefined,
            });
          }
        }
      }
    }
  }

  let metaRes: Response | undefined;
  for (let attempt = 1; attempt <= 6; attempt++) {
    metaRes = await fetch(`${tileUrl}.json`);
    if (metaRes.ok || metaRes.status === 404) break;
    // 403 here is the same transient rate limit as on the tiles.
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  if (!metaRes?.ok) {
    fail(
      metaRes?.status === 404
        ? `No TileJSON for build ${version}. Read #atl_version at https://indiarailinfo.com/atlas and pass --version=...`
        : `TileJSON request failed (HTTP ${metaRes?.status}). Retry later.`,
    );
  }

  await fs.mkdir(outDir, { recursive: true });
  console.log(
    `Fetching ${total} tiles z${zoom} for ${w},${s},${e},${n} (build ${version}${citySlug ? `, ${citySlug}` : ""})`,
  );
  await Promise.all(Array.from({ length: 5 }, worker));

  const stationFc: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [...stations.values()].map((station) => ({
      type: "Feature",
      properties: {
        stnid: station.stnid,
        code: station.code,
        name: station.name,
        type: station.type,
        halting: station.halting,
      },
      geometry: { type: "Point", coordinates: [station.lon, station.lat] },
    })),
  };

  const trackFc: FeatureCollection<LineString | MultiLineString> = {
    type: "FeatureCollection",
    features: [...tracks.entries()].map(([trackid, segments]) => {
      const meta = trackMeta.get(trackid) ?? {};
      return {
        type: "Feature",
        properties: {
          trackid,
          name: meta.name || null,
          tracktype: meta.tracktype ?? null,
          zone: meta.zone || null,
          segments: segments.length,
          vertices: segments.reduce((sum, segment) => sum + segment.length, 0),
        },
        geometry: stitch(segments),
      } as Feature<LineString | MultiLineString>;
    }),
  };

  const trackTable = trackFc.features
    .map((feature) => feature.properties)
    .sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? "")));

  await fs.writeFile(path.join(outDir, "stations.geojson"), JSON.stringify(stationFc));
  await fs.writeFile(path.join(outDir, "tracks.geojson"), JSON.stringify(trackFc));
  await fs.writeFile(path.join(outDir, "tracks.json"), `${JSON.stringify(trackTable, null, 2)}\n`);

  console.log(
    `\n${stationFc.features.length} stations, ${trackFc.features.length} tracks -> ${outDir}`,
  );
  console.log("\nTracks:");
  for (const track of trackTable) {
    console.log(
      `  ${String(track?.trackid).padEnd(10)} t${String(track?.tracktype).padEnd(3)} ${track?.name || "(unnamed)"}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
