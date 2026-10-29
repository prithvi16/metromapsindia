import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CityData,
  CityDataSchema,
  type CityIndex,
  CityIndexSchema,
  type CitySummary,
  type SearchIndex,
  SearchIndexSchema,
} from "../../shared/schema";
import type { CityConfig } from "../cities";
import { readJson, writeJsonAtomic } from "../lib/fs";
import { minZoomFor } from "../lib/geo";
import { computeNeighbours } from "../lib/neighbours";
import { buildPreview } from "../lib/preview";
import { buildSearchIndex } from "../lib/search";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

export const GENERATED_BY = "scripts/build-cities.ts";
export const SOURCE =
  "OpenStreetMap contributors, ODbL 1.0 (via Overpass API); suburban linework from India Rail Info";
export const dataDir = path.join(root, "src", "data", "cities");
export const shardDir = path.join(dataDir, "shards");
export const indexPath = path.join(dataDir, "index.json");
export const searchPath = path.join(dataDir, "search.json");

const EMPTY_COUNTS = {
  lines: 0,
  stations: 0,
  km: 0,
  modes: [],
  systems: 0,
  systemNames: [],
} satisfies CitySummary["counts"];

export async function readIndex(): Promise<CityIndex | null> {
  const raw = await readJson<unknown>(indexPath);
  if (!raw) return null;
  return CityIndexSchema.parse(raw);
}

export async function readAllShards(): Promise<Map<string, CityData>> {
  const files = await readdir(shardDir).catch(() => [] as string[]);
  const shards = new Map<string, CityData>();
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const raw = await readJson<unknown>(path.join(shardDir, file));
    if (!raw) continue;
    const data = CityDataSchema.parse(raw);
    shards.set(data.slug, data);
  }
  return shards;
}

export function buildIndex(
  configs: CityConfig[],
  dataBySlug: Map<string, CityData>,
  generatedAt: string,
): CityIndex {
  const neighbours = computeNeighbours(
    configs.map((city) => {
      const data = dataBySlug.get(city.slug);
      return {
        slug: city.slug,
        bounds: data?.bounds ?? city.bounds,
        hasData: Boolean(data && data.coverage !== "none"),
      };
    }),
  );

  const cities: CitySummary[] = configs.map((config) => {
    const data = dataBySlug.get(config.slug);
    return {
      slug: config.slug,
      city: config.city,
      system: config.system,
      operator: config.operator,
      region: config.region,
      bounds: data?.bounds ?? config.bounds,
      minZoom: data?.minZoom ?? minZoomFor(config.bounds),
      stats: config.stats,
      coverage: data?.coverage ?? "none",
      counts: data?.counts ?? EMPTY_COUNTS,
      neighbours: neighbours.get(config.slug) ?? [],
      preview: data ? buildPreview(data.lines) : null,
    };
  });

  return CityIndexSchema.parse({
    generatedBy: GENERATED_BY,
    generatedAt,
    source: SOURCE,
    cities,
  });
}

export function buildSearch(dataBySlug: Map<string, CityData>, generatedAt: string): SearchIndex {
  const cities = [...dataBySlug.values()].filter((city) => city.coverage !== "none");
  return SearchIndexSchema.parse(buildSearchIndex(cities, generatedAt, GENERATED_BY));
}

export function validateShard(data: CityData): void {
  CityDataSchema.parse(data);
}

export type WriteResult = {
  index: CityIndex;
  search: SearchIndex;
  written: string[];
  reused: string[];
};

/**
 * Write rebuilt city shards, then rebuild the index and search files from every
 * shard that exists. Cities that were not rebuilt keep their previous shard, so
 * a single-city build never blanks the rest of the dataset.
 */
export async function writeDataset(
  configs: CityConfig[],
  rebuilt: Map<string, CityData>,
  generatedAt: string,
  { allowShrink = false }: { allowShrink?: boolean } = {},
): Promise<WriteResult> {
  const allData = await readAllShards();
  const configured = new Set(configs.map((city) => city.slug));
  for (const slug of [...allData.keys()]) {
    if (!configured.has(slug)) allData.delete(slug);
  }
  for (const [slug, data] of rebuilt) {
    if (data.coverage === "none") allData.delete(slug);
    else allData.set(slug, data);
  }

  const index = buildIndex(configs, allData, generatedAt);
  const search = buildSearch(allData, generatedAt);

  // Refuse to replace a healthy dataset with a badly partial one. This is the
  // guard that stops a fresh worktree (no raw cache) from wiping src/data.
  const previous = await readIndex();
  if (previous && !allowShrink) {
    const before = previous.cities.reduce((sum, city) => sum + city.counts.stations, 0);
    const after = index.cities.reduce((sum, city) => sum + city.counts.stations, 0);
    if (before > 0 && after < before * 0.5) {
      throw new Error(
        `Refusing to write ${after} stations (previous index had ${before}). ` +
          `Run \`npm run data:fetch\` first, or pass --allow-shrink if this is intentional.`,
      );
    }
    const beforeReady = previous.cities.filter((city) => city.coverage !== "none").length;
    const afterReady = index.cities.filter((city) => city.coverage !== "none").length;
    if (afterReady < beforeReady) {
      throw new Error(
        `Refusing to drop from ${beforeReady} to ${afterReady} mapped cities. ` +
          `Run \`npm run data:fetch\` first, or pass --allow-shrink if this is intentional.`,
      );
    }
  }

  const written: string[] = [];
  for (const [slug, data] of rebuilt) {
    if (data.coverage === "none") {
      await rm(path.join(shardDir, `${slug}.json`), { force: true });
      continue;
    }
    validateShard(data);
    await writeJsonAtomic(path.join(shardDir, `${slug}.json`), data);
    written.push(slug);
  }
  await writeJsonAtomic(indexPath, index, { pretty: true });
  await writeJsonAtomic(searchPath, search);

  const rebuiltSlugs = new Set(rebuilt.keys());
  const reused = [...allData.keys()].filter((slug) => !rebuiltSlugs.has(slug));
  return { index, search, written, reused };
}

export async function loadAllShardsForValidation(): Promise<{
  index: CityIndex;
  search: SearchIndex;
  shards: Map<string, CityData>;
}> {
  const index = await readIndex();
  const searchRaw = await readJson<unknown>(searchPath);
  if (!index) throw new Error("src/data/cities/index.json is missing");
  if (!searchRaw) throw new Error("src/data/cities/search.json is missing");
  const search = SearchIndexSchema.parse(searchRaw);
  const shards = await readAllShards();
  return { index, search, shards };
}
