/**
 * Extract railway stations and tracks from India Rail Info's atlas vector tiles.
 *
 * The atlas is a MapLibre map backed by one public vector-tile source:
 *   https://maps.indiarailinfo.com/data/iritiles<build>/{z}/{x}/{y}.pbf
 * There is no REST "line" API for bulk data: the linework lives in the tiles.
 *
 * Usage:
 *   node scripts/fetch-iri.mjs --city=mumbai
 *   node scripts/fetch-iri.mjs --bbox=72.75,18.88,73.30,19.38 --out=scripts/out/iri/mumbai
 *
 * Options:
 *   --city=slug        read bounds from scripts/cities.mjs (preferred)
 *   --bbox=w,s,e,n     required if --city is omitted
 *   --zoom=12          tile zoom (the source has no tiles above z12)
 *   --version=...      tile build id, i.e. #atl_version on /atlas (default below)
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
import { PbfReader } from "pbf";
import { CITIES } from "./cities.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=")];
  }),
);

let w;
let s;
let e;
let n;

if (args.city) {
  const city = CITIES.find((c) => c.slug === args.city);
  if (!city) {
    console.error(`Unknown city "${args.city}". Known: ${CITIES.map((c) => c.slug).join(", ")}`);
    process.exit(1);
  }
  // Suburban imports need the commuter catchment, not the metro-region box.
  [w, s, e, n] = city.suburbanBounds ?? city.bounds;
} else {
  [w, s, e, n] = (args.bbox || "").split(",").map(Number);
}

if (![w, s, e, n].every(Number.isFinite)) {
  console.error("Pass --city=<slug> or --bbox=west,south,east,north");
  process.exit(1);
}

const Z = Number(args.zoom || 12);
// Read #atl_version from https://indiarailinfo.com/atlas when it changes.
const VERSION = args.version || "1793079041";
const OUT = path.resolve(root, args.out || path.join("scripts/out/iri", args.city || "bbox"));
const CACHE = path.resolve(root, "scripts/out/iri/cache", VERSION);
const TILE = `https://maps.indiarailinfo.com/data/iritiles${VERSION}`;

const lon2tile = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tile = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 2 ** z);
};

const x0 = lon2tile(w, Z);
const x1 = lon2tile(e, Z);
const y0 = lat2tile(n, Z);
const y1 = lat2tile(s, Z);

function cachePath(x, y) {
  return path.join(CACHE, String(Z), String(x), `${y}.pbf`);
}

async function readCache(x, y) {
  try {
    return new Uint8Array(await fs.readFile(cachePath(x, y)));
  } catch {
    return null;
  }
}

async function writeCache(x, y, buf) {
  const file = cachePath(x, y);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
}

async function getTile(x, y) {
  const cached = await readCache(x, y);
  if (cached) return cached;

  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(`${TILE}/${Z}/${x}/${y}.pbf`);
      if (res.status === 404) return null;
      // The tile host briefly 403s when hammered; back off and retry.
      if (res.status === 403 || res.status === 429) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || attempt * 2000;
        console.warn(`  ${res.status} on ${x}/${y}, waiting ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      await writeCache(x, y, buf);
      return buf;
    } catch (err) {
      if (attempt === 6) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

const stations = new Map();
const tracks = new Map();
const trackMeta = new Map();

let done = 0;
const total = (x1 - x0 + 1) * (y1 - y0 + 1);
const queue = [];
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) queue.push([x, y]);

async function worker() {
  for (;;) {
    const job = queue.shift();
    if (!job) return;
    const [x, y] = job;
    const buf = await getTile(x, y);
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${total} tiles`);
    if (!buf) continue;

    const tile = new VectorTile(new PbfReader(buf));

    const stationLayer = tile.layers.station;
    if (stationLayer) {
      for (let i = 0; i < stationLayer.length; i++) {
        const f = stationLayer.feature(i);
        const p = f.properties;
        if (!stations.has(p.stnid)) {
          const [lon, lat] = f.toGeoJSON(x, y, Z).geometry.coordinates;
          stations.set(p.stnid, {
            stnid: p.stnid,
            code: p.stncode,
            name: p.stnname,
            type: p.type,
            halting: p.halting,
            priority: p.priority,
            lon,
            lat,
          });
        }
      }
    }

    const trackLayer = tile.layers.track;
    if (trackLayer) {
      for (let i = 0; i < trackLayer.length; i++) {
        const f = trackLayer.feature(i);
        const p = f.properties;
        const geom = f.toGeoJSON(x, y, Z).geometry;
        if (!tracks.has(p.trackid)) tracks.set(p.trackid, []);
        // A track can be clipped into a MultiLineString inside one tile.
        if (geom.type === "LineString") tracks.get(p.trackid).push(geom.coordinates);
        else if (geom.type === "MultiLineString") tracks.get(p.trackid).push(...geom.coordinates);
      }
    }

    const mpsLayer = tile.layers.mps;
    if (mpsLayer) {
      for (let i = 0; i < mpsLayer.length; i++) {
        const p = mpsLayer.feature(i).properties;
        if (!trackMeta.has(p.trackid)) {
          trackMeta.set(p.trackid, {
            name: p.trackname,
            tracktype: p.tracktype,
            zone: p.zonecode,
            zoneName: p.zonename,
          });
        }
      }
    }
  }
}

const same = (a, b) => Math.abs(a[0] - b[0]) < 5e-5 && Math.abs(a[1] - b[1]) < 5e-5;

/** Join tile-clipped segments of one track into a single ordered line. */
function stitch(segs) {
  const parts = segs.filter((p) => p.length > 1).map((p) => p.slice());
  const used = new Set();
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
      const p = parts[i];
      if (same(line.at(-1), p[0])) line.push(...p.slice(1));
      else if (same(line.at(-1), p.at(-1))) line.push(...p.slice(0, -1).reverse());
      else if (same(line[0], p.at(-1))) line.unshift(...p.slice(0, -1));
      else if (same(line[0], p[0])) line.unshift(...p.slice(1).reverse());
      else continue;
      used.add(i);
      changed = true;
    }
  }

  const leftovers = parts.filter((_, i) => !used.has(i));
  if (!leftovers.length) return { type: "LineString", coordinates: line };
  return { type: "MultiLineString", coordinates: [line, ...leftovers] };
}

let metaRes;
for (let attempt = 1; attempt <= 6; attempt++) {
  metaRes = await fetch(`${TILE}.json`);
  if (metaRes.ok || metaRes.status === 404) break;
  // 403 here is the same transient rate limit as on the tiles.
  await new Promise((r) => setTimeout(r, attempt * 1500));
}
if (!metaRes?.ok) {
  console.error(
    metaRes?.status === 404
      ? `No TileJSON for build ${VERSION}. Read #atl_version at https://indiarailinfo.com/atlas and pass --version=...`
      : `TileJSON request failed (HTTP ${metaRes?.status}). Retry later.`,
  );
  process.exit(1);
}

await fs.mkdir(OUT, { recursive: true });
console.log(
  `Fetching ${total} tiles z${Z} for ${w},${s},${e},${n} (build ${VERSION}${args.city ? `, ${args.city}` : ""})`,
);
await Promise.all(Array.from({ length: 5 }, worker));

const stationFc = {
  type: "FeatureCollection",
  features: [...stations.values()].map((st) => ({
    type: "Feature",
    properties: {
      stnid: st.stnid,
      code: st.code,
      name: st.name,
      type: st.type,
      halting: st.halting,
    },
    geometry: { type: "Point", coordinates: [st.lon, st.lat] },
  })),
};

const trackFc = {
  type: "FeatureCollection",
  features: [...tracks.entries()].map(([trackid, segs]) => {
    const meta = trackMeta.get(trackid) || {};
    return {
      type: "Feature",
      properties: {
        trackid,
        name: meta.name || null,
        tracktype: meta.tracktype ?? null,
        zone: meta.zone || null,
        segments: segs.length,
        vertices: segs.reduce((a, p) => a + p.length, 0),
      },
      geometry: stitch(segs),
    };
  }),
};

const trackTable = trackFc.features
  .map((f) => f.properties)
  .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

await fs.writeFile(path.join(OUT, "stations.geojson"), JSON.stringify(stationFc));
await fs.writeFile(path.join(OUT, "tracks.geojson"), JSON.stringify(trackFc));
await fs.writeFile(path.join(OUT, "tracks.json"), JSON.stringify(trackTable, null, 2) + "\n");

console.log(`\n${stationFc.features.length} stations, ${trackFc.features.length} tracks -> ${OUT}`);
console.log("\nTracks:");
for (const f of trackTable) {
  console.log(
    `  ${String(f.trackid).padEnd(10)} t${String(f.tracktype).padEnd(3)} ${f.name || "(unnamed)"}`,
  );
}
