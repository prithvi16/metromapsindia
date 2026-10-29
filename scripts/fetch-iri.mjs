/**
 * Extract railway stations and tracks from India Rail Info's atlas vector tiles.
 *
 * The atlas is a MapLibre map backed by one public vector-tile source:
 *   https://maps.indiarailinfo.com/data/iritiles<build>/{z}/{x}/{y}.pbf
 * There is no REST "line" API for bulk data: the linework lives in the tiles.
 *
 * Usage:
 *   node scripts/fetch-iri.mjs --bbox=72.75,18.88,73.30,19.38 --out=scripts/out/iri-mumbai
 *
 * Options:
 *   --bbox=w,s,e,n     required
 *   --zoom=12          tile zoom (the source has no tiles above z12)
 *   --version=...      tile build id, i.e. #atl_version on /atlas (default below)
 *   --out=dir          output directory
 */
import fs from "node:fs/promises";
import path from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=")];
  }),
);

const [w, s, e, n] = (args.bbox || "").split(",").map(Number);
if (![w, s, e, n].every(Number.isFinite)) {
  console.error("Pass --bbox=west,south,east,north");
  process.exit(1);
}

const Z = Number(args.zoom || 12);
// Read #atl_version from https://indiarailinfo.com/atlas when it changes.
const VERSION = args.version || "1793079041";
const OUT = args.out || "scripts/out/iri";
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

async function getTile(x, y) {
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
      return new Uint8Array(await res.arrayBuffer());
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
        if (geom.type !== "LineString") continue;
        if (!tracks.has(p.trackid)) tracks.set(p.trackid, []);
        tracks.get(p.trackid).push(geom.coordinates);
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

const same = (a, b) => Math.abs(a[0] - b[0]) < 2e-5 && Math.abs(a[1] - b[1]) < 2e-5;

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

const metaRes = await fetch(`${TILE}.json`);
if (!metaRes.ok) {
  console.error(`No TileJSON for build ${VERSION}. Read #atl_version at https://indiarailinfo.com/atlas and pass --version=...`);
  process.exit(1);
}

await fs.mkdir(OUT, { recursive: true });
console.log(`Fetching ${total} tiles z${Z} for ${w},${s},${e},${n} (build ${VERSION})`);
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

await fs.writeFile(path.join(OUT, "stations.geojson"), JSON.stringify(stationFc));
await fs.writeFile(path.join(OUT, "tracks.geojson"), JSON.stringify(trackFc));

console.log(`\n${stationFc.features.length} stations, ${trackFc.features.length} tracks -> ${OUT}`);
console.log("\nTracks:");
for (const f of trackFc.features.sort((a, b) => (a.properties.name || "").localeCompare(b.properties.name || ""))) {
  console.log(`  ${f.properties.trackid.padEnd(10)} t${String(f.properties.tracktype).padEnd(3)} ${f.properties.name || "(unnamed)"}`);
}
