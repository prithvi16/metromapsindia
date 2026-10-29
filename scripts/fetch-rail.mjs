/**
 * Fetch raw OSM rail data for each city region and cache it under scripts/out/raw.
 *
 * Usage:
 *   node scripts/fetch-rail.mjs                 # every city without a cache
 *   node scripts/fetch-rail.mjs --only=mumbai,delhi
 *   node scripts/fetch-rail.mjs --force         # refetch everything
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cachedQuery } from "./lib/overpass.mjs";
import { CITIES } from "./cities.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(__dirname, "out", "raw");

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
const force = args.includes("--force");

function queryFor(bounds) {
  const [west, south, east, north] = bounds;
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:240];
(
  relation["route"~"^(subway|light_rail|monorail|tram|funicular)$"](${bbox});
  relation["route"~"^(train|ferry)$"]["network"~"Suburban|MMTS|MRTS|RRTS|Namo Bharat|Monorail|Metro|Tram|Funicular|Water",i](${bbox});
  relation["route"="construction"](${bbox});
  relation["construction:route"~"^(subway|light_rail|monorail|tram)$"](${bbox});
  node["railway"~"^(station|halt|tram_stop|construction)$"](${bbox});
  node["public_transport"="station"](${bbox});
  node["construction:railway"~"^(station|halt)$"](${bbox});
);
out body;
>;
out skel qt;`;
}

async function main() {
  const cities = CITIES.filter((c) => !only || only.has(c.slug));
  console.log(`Fetching ${cities.length} cities`);

  for (const city of cities) {
    const cachePath = path.join(rawDir, `${city.slug}.json`);
    if (force) {
      const { rm } = await import("node:fs/promises");
      await rm(cachePath, { force: true });
    }
    console.log(`\n${city.city} (${city.slug})`);
    try {
      const data = await cachedQuery(cachePath, queryFor(city.bounds), {
        label: city.slug,
      });
      console.log(`  ${data.elements?.length ?? 0} elements`);
    } catch (err) {
      console.error(`  failed: ${err.message}`);
    }
  }
}

main();
