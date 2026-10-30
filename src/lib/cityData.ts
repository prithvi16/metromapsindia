import {
  type AllData,
  type CityData,
  CityDataSchema,
  type CityIndex,
  CityIndexSchema,
  type CitySummary,
  type SearchIndex,
  SearchIndexSchema,
} from "../../shared/schema";
import indexJson from "../data/cities/index.json";
import { recoverFromChunkLoadError } from "./chunkRecovery";

export const cityIndex: CityIndex = CityIndexSchema.parse(indexJson);

const shardLoaders = import.meta.glob<{ default: unknown }>("../data/cities/shards/*.json");
const shardCache = new Map<string, Promise<CityData>>();

/**
 * A lazy chunk can 404 after a deploy replaces the hashed assets. Reload once
 * to pick up the new bundle instead of surfacing a "failed to fetch" error.
 */
async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (recoverFromChunkLoadError(error)) {
      // Stay pending while the browser navigates away, so the page does not
      // flash an error from the deployment it is leaving.
      return new Promise<T>(() => undefined);
    }
    throw error;
  }
}

function loadCityShard(slug: string): Promise<CityData> {
  const cached = shardCache.get(slug);
  if (cached) return cached;

  const loader = shardLoaders[`../data/cities/shards/${slug}.json`];
  if (!loader) return Promise.reject(new Error(`No data shard for "${slug}"`));

  const promise = loadChunk(loader).then((module) => CityDataSchema.parse(module.default));
  shardCache.set(slug, promise);
  return promise;
}

/**
 * Load the city plus its precomputed neighbours. Neighbours are listed in the
 * index, so a city page never downloads the whole country's geometry.
 */
export async function loadCityView(slug: string): Promise<{
  city: CityData;
  all: AllData;
}> {
  const summary = findCity(slug);
  if (!summary) throw new Error(`Unknown city "${slug}"`);

  const slugs = [slug, ...summary.neighbours];
  const results = await Promise.allSettled(slugs.map((candidate) => loadCityShard(candidate)));

  // The requested city is first in `slugs`; its failure is the one worth
  // surfacing. Neighbours are optional and may be dropped silently.
  const ownResult = results[0];
  if (ownResult.status === "rejected") throw ownResult.reason;

  const shards = results
    .filter((result): result is PromiseFulfilledResult<CityData> => result.status === "fulfilled")
    .map((result) => result.value);

  return {
    city: ownResult.value,
    all: {
      lines: shards.flatMap((data) => data.lines),
      stations: shards.flatMap((data) => data.stations),
    },
  };
}

let searchPromise: Promise<SearchIndex> | null = null;

/** The compact search index loads only when the ⌘K dialog is opened. */
export function loadSearchIndex(): Promise<SearchIndex> {
  searchPromise ??= loadChunk(() => import("../data/cities/search.json")).then((module) =>
    SearchIndexSchema.parse(module.default),
  );
  return searchPromise;
}

export function findCity(slug: string | undefined): CitySummary | undefined {
  return cityIndex.cities.find((city) => city.slug === slug);
}

export function citiesByRegion() {
  const groups = new Map<string, CitySummary[]>();
  for (const city of cityIndex.cities) {
    if (!groups.has(city.region)) groups.set(city.region, []);
    groups.get(city.region)!.push(city);
  }
  return [...groups.entries()].sort(
    (a, b) =>
      ["North", "West", "South", "East"].indexOf(a[0]) -
      ["North", "West", "South", "East"].indexOf(b[0]),
  );
}

export const countryStats = {
  /** Distinct line systems drawn on the map (metro + suburban + tram …). */
  systems: cityIndex.cities.reduce((sum, city) => sum + (city.counts.systems ?? 0), 0),
  cities: cityIndex.cities.filter((city) => city.coverage !== "none").length,
  listed: cityIndex.cities.length,
  lines: cityIndex.cities.reduce((sum, city) => sum + city.counts.lines, 0),
  /** Mapped totals: what the map actually draws. */
  stations: cityIndex.cities.reduce((sum, city) => sum + city.counts.stations, 0),
  km: Math.round(cityIndex.cities.reduce((sum, city) => sum + city.counts.km, 0)),
  /** Wikipedia's official system figures, kept for reference. */
  officialKm: Math.round(cityIndex.cities.reduce((sum, city) => sum + city.stats.km, 0)),
};
