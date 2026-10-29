/**
 * Assemble the IRI suburban manifests into one JSON file per city and print a
 * summary. build-cities.ts calls the same assembler directly, so this is a
 * preview/debug tool and a convenient way for the agent to inspect the result.
 *
 * Usage:
 *   npm run data:suburban                # every city with a manifest
 *   npm run data:suburban -- --city=mumbai
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES } from "./cities";
import { fail, getArg, hasFlag, parseArgs, printHelp } from "./lib/args";
import { assembleSuburban } from "./lib/suburban";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const manifestDir = path.join(__dirname, "suburban");

const HELP = `
Assemble IRI suburban manifests into preview GeoJSON-style JSON.

Usage:
  npm run data:suburban [options]

Options:
  --city=slug  Only build one city
  --help       Show this message
`;

async function main(): Promise<void> {
  const args = parseArgs(undefined, { booleans: ["help"] });
  if (hasFlag(args, "help")) printHelp(HELP);

  const cityArg = getArg(args, "city");
  if (cityArg && !CITIES.some((city) => city.slug === cityArg)) {
    fail(`Unknown city "${cityArg}".`);
  }

  const manifests = new Set(
    (await readdir(manifestDir).catch(() => [] as string[]))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, "")),
  );

  const cities = CITIES.filter(
    (city) => manifests.has(city.slug) && (!cityArg || city.slug === cityArg),
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
    await writeFile(
      path.join(outDir, "suburban-lines.json"),
      `${JSON.stringify(lines, null, 2)}\n`,
    );
    const stations = new Set(lines.flatMap((line) => line.stations.map((station) => station.name)));
    console.log(`  ${lines.length} lines, ${stations.size} unique stations -> ${outDir}`);
  }

  console.log(`\nBuilt ${cities.length} cities.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
