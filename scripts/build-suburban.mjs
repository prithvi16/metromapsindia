/**
 * Assemble the IRI suburban manifests into one JSON file per city and print a
 * summary. build-cities.mjs calls the same assembler directly, so this is a
 * preview/debug tool and a convenient way for the agent to inspect the result.
 *
 * Usage:
 *   node scripts/build-suburban.mjs                # every city with a manifest
 *   node scripts/build-suburban.mjs --city=mumbai
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES } from "./cities.mjs";
import { assembleSuburban } from "./lib/suburban.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const manifestDir = path.join(__dirname, "suburban");

const args = process.argv.slice(2);
const cityArg = args.find((a) => a.startsWith("--city="))?.slice("--city=".length);

const manifests = new Set(
  (await readdir(manifestDir).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, "")),
);

const cities = CITIES.filter(
  (c) => manifests.has(c.slug) && (!cityArg || c.slug === cityArg),
);

if (!cities.length) {
  console.log(cityArg ? `No manifest for ${cityArg}.` : "No suburban manifests found.");
  process.exit(cityArg ? 1 : 0);
}

for (const city of cities) {
  console.log(`\n${city.city} (${city.slug})`);
  const { lines } = await assembleSuburban(city);
  if (!lines.length) {
    console.log("  no suburban lines assembled");
    continue;
  }
  const outDir = path.join(root, "scripts", "out", "iri", city.slug);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "suburban-lines.json"), JSON.stringify(lines, null, 2) + "\n");
  const stations = new Set(lines.flatMap((line) => line.stations.map((s) => s.name)));
  console.log(`  ${lines.length} lines, ${stations.size} unique stations -> ${outDir}`);
}

console.log(`\nBuilt ${cities.length} cities.`);
