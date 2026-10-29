/**
 * Fetch raw OSM rail data for each city region and cache it under scripts/out/raw.
 *
 * Usage:
 *   npm run data:fetch                            # every city without a cache
 *   npm run data:fetch -- --only=mumbai,delhi     # selected cities
 *   npm run data:fetch -- --force                 # refetch everything
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES } from "./cities";
import { fail, getArg, hasFlag, parseArgs, printHelp } from "./lib/args";
import { cachedQuery } from "./lib/overpass";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawDir = path.join(__dirname, "out", "raw");

const HELP = `
Fetch raw OSM data for city regions.

Usage:
  npm run data:fetch [options]

Options:
  --only=slug[,slug]  Fetch only these cities (alias: --city)
  --force             Ignore the cache and refetch
  --json              Print a machine-readable summary on stdout
  --help              Show this message
`;

function queryFor(city: (typeof CITIES)[number]): string {
  if (city.osmRelation) {
    return `[out:json][timeout:120];rel(${city.osmRelation});(._;>;);out body;`;
  }
  const [west, south, east, north] = city.bounds;
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

async function main(): Promise<void> {
  const args = parseArgs(undefined, { booleans: ["force", "json", "help"] });
  if (hasFlag(args, "help")) printHelp(HELP);

  const json = hasFlag(args, "json");
  if (json) console.log = (...items: unknown[]) => console.error(...items);

  const onlyArg = getArg(args, "only") ?? getArg(args, "city");
  const only = onlyArg
    ? new Set(
        onlyArg
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : null;
  for (const slug of only ?? []) {
    if (!CITIES.some((city) => city.slug === slug)) {
      fail(`Unknown city "${slug}". Known: ${CITIES.map((city) => city.slug).join(", ")}`);
    }
  }

  const force = hasFlag(args, "force");
  const cities = CITIES.filter((city) => !only || only.has(city.slug));
  console.log(`Fetching ${cities.length} cities`);

  const ok: { slug: string; elements: number }[] = [];
  const failures: { slug: string; error: string }[] = [];

  for (const city of cities) {
    const cachePath = path.join(rawDir, `${city.slug}.json`);
    console.log(`\n${city.city} (${city.slug})`);
    try {
      const data = await cachedQuery(cachePath, queryFor(city), {
        label: city.slug,
        force,
      });
      const elements = data.elements?.length ?? 0;
      ok.push({ slug: city.slug, elements });
      console.log(`  ${elements} elements`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ slug: city.slug, error: message });
      console.error(`  failed: ${message}`);
    }
  }

  console.log(
    `\nFetched ${ok.length}/${cities.length} cities` +
      (failures.length ? `, ${failures.length} failed` : ""),
  );
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ root: path.relative(root, rawDir), ok, failures }, null, 2)}\n`,
    );
  }
  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
