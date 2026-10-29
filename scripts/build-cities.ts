/**
 * Normalise cached OSM/IRI data into one shard per city plus the index and the
 * compact search index.
 *
 * Usage:
 *   npm run data:build                     # rebuild from whatever raw cache exists
 *   npm run data:build -- --city=mumbai    # rebuild one city and its index entry
 *   npm run data:build -- --allow-warnings # keep going after curation warnings
 *   npm run data:build -- --allow-shrink   # permit a large drop in coverage
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CityData } from "../shared/schema";
import { assignRelations } from "./build/assign";
import { loadCuration } from "./build/curate";
import { dataDir, GENERATED_BY, writeDataset } from "./build/dataset";
import { finalizeCity } from "./build/finalize";
import { type MasterSystem, normalizeCity } from "./build/normalize";
import { CITIES, type CityConfig } from "./cities";
import { fail, getAllArgs, hasFlag, parseArgs, printHelp } from "./lib/args";
import { readJson } from "./lib/fs";
import type { OsmResponse } from "./lib/osm";
import { assembleSuburban } from "./lib/suburban";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawDir = path.join(__dirname, "out", "raw");
const masterPath = path.join(root, "data", "sources", "metro-master.json");

const HELP = `
Build the city dataset from cached OSM and India Rail Info data.

Usage:
  npm run data:build [options]

Options:
  --city=slug[,slug]  Rebuild only these cities (default: every city with a cache)
  --allow-warnings    Write the dataset even when curation/suburban warnings exist
  --allow-shrink      Allow the station total or mapped-city count to fall sharply
  --json              Print a machine-readable summary on stdout
  --help              Show this message

A fresh clone has no scripts/out cache. Run \`npm run data:fetch\` first, or build
one city with \`npm run data:fetch -- --only=<slug>\` followed by this command.
`;

type MasterFile = { systems: MasterSystem[] };

async function loadMaster(): Promise<MasterSystem[]> {
  const raw = await readJson<MasterFile>(masterPath);
  if (!raw?.systems || !Array.isArray(raw.systems)) {
    throw new Error(`Missing or invalid ${path.relative(root, masterPath)}`);
  }
  return raw.systems;
}

async function main(): Promise<void> {
  const args = parseArgs(undefined, {
    booleans: ["allow-warnings", "allow-shrink", "json", "help"],
  });
  if (hasFlag(args, "help")) printHelp(HELP);

  const json = hasFlag(args, "json");
  if (json) {
    // Keep stdout parseable: all progress logs go to stderr.
    console.log = (...items: unknown[]) => console.error(...items);
  }

  const requested = getAllArgs(args, "city")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  for (const slug of requested) {
    if (!CITIES.some((city) => city.slug === slug)) {
      fail(`Unknown city "${slug}". Known: ${CITIES.map((city) => city.slug).join(", ")}`);
    }
  }

  const rawFiles = new Set(
    (await readdir(rawDir).catch(() => [] as string[]))
      .filter((file) => file.endsWith(".json") && !file.endsWith(".meta.json"))
      .map((file) => file.replace(/\.json$/, "")),
  );

  const targets = requested.length
    ? CITIES.filter((city) => requested.includes(city.slug))
    : CITIES;

  const available: CityConfig[] = [];
  for (const city of targets) {
    if (rawFiles.has(city.slug)) {
      available.push(city);
    } else if (requested.includes(city.slug)) {
      fail(
        `No raw cache for "${city.slug}" (${path.relative(root, rawDir)}/${city.slug}.json).\n` +
          `Run: npm run data:fetch -- --only=${city.slug}`,
      );
    }
  }

  if (!available.length) {
    fail(
      `No raw cache found in ${path.relative(root, rawDir)}.\n` +
        `Run \`npm run data:fetch\` first. A fresh worktree does not have the cache.`,
    );
  }

  const master = await loadMaster();
  const raws = new Map<string, OsmResponse>();
  for (const city of available) {
    const raw = await readJson<OsmResponse>(path.join(rawDir, `${city.slug}.json`));
    if (raw?.elements) raws.set(city.slug, raw);
  }
  if (!raws.size) {
    fail("Raw cache files exist but none contain OSM elements.");
  }
  const unreadable = available.filter((city) => !raws.has(city.slug));
  if (unreadable.length) {
    fail(
      `Could not read raw cache for: ${unreadable.map((city) => city.slug).join(", ")}. ` +
        `Refetch with \`npm run data:fetch -- --only=${unreadable[0].slug}\`.`,
    );
  }

  const assigned = assignRelations(raws);
  const rebuilt = new Map<string, CityData>();
  const warningsByCity = new Map<string, string[]>();
  const generatedAt = new Date().toISOString();

  for (const city of available) {
    const raw = raws.get(city.slug);
    if (!raw) continue;
    try {
      const curation = await loadCuration(city.slug);
      const normalized = normalizeCity(city, raw, assigned, curation, master);
      let lines = normalized.lines;
      const warnings = [...normalized.warnings];

      // Cities with an IRI suburban manifest use that network instead of OSM's
      // route=train lines, so every corridor is drawn once in a single style.
      const suburban = await assembleSuburban(city);
      if (suburban.manifest && suburban.lines.length) {
        const before = lines.length;
        lines = lines.filter((line) => line.mode !== "suburban");
        lines.push(...suburban.lines);
        const replaced = before - lines.length + suburban.lines.length;
        console.log(
          `    · suburban: ${suburban.lines.length} IRI lines (replaced ${replaced} OSM)`,
        );
      }
      warnings.push(...suburban.warnings);

      const data = finalizeCity(city, lines, generatedAt, GENERATED_BY);
      rebuilt.set(city.slug, data);
      warningsByCity.set(city.slug, warnings);
      console.log(
        `  ${city.slug.padEnd(12)} ${String(data.lines.length).padStart(2)} lines ` +
          `${String(data.stations.length).padStart(3)} stations  ` +
          `${data.counts.modes.join(",") || "—"}  [${data.coverage}]` +
          `${normalized.dropped ? ` (dropped ${normalized.dropped})` : ""}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${city.slug}: ${message}`);
    }
  }

  const warnings = [...warningsByCity.entries()].flatMap(([slug, messages]) =>
    messages.map((message) => `${slug}: ${message}`),
  );
  if (warnings.length) {
    console.log(`\n${warnings.length} curation/suburban warning(s):`);
    for (const warning of warnings) console.log(`  ! ${warning}`);
    if (!hasFlag(args, "allow-warnings")) {
      fail(
        "\nRefusing to write the dataset with unresolved warnings. " +
          "Fix the patch/manifest, or pass --allow-warnings if they are expected.",
      );
    }
  }

  const result = await writeDataset(CITIES, rebuilt, generatedAt, {
    allowShrink: hasFlag(args, "allow-shrink"),
  });

  const ready = result.index.cities.filter((city) => city.coverage !== "none").length;
  console.log(
    `\nWrote ${result.written.length} shard(s), reused ${result.reused.length}, ` +
      `${ready}/${CITIES.length} cities mapped.`,
  );
  console.log(`  index: ${path.relative(root, path.join(dataDir, "index.json"))}`);
  console.log(`  search: ${path.relative(root, path.join(dataDir, "search.json"))}`);

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          generatedAt,
          built: [...rebuilt.keys()],
          written: result.written,
          reused: result.reused,
          ready,
          totalCities: CITIES.length,
          warnings,
        },
        null,
        2,
      )}\n`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
