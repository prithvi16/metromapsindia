import type { AllData, CityData, CityIndex, CitySummary } from "./cities";
import indexJson from "../data/cities/index.json";

export const cityIndex = indexJson as unknown as CityIndex;

/**
 * Every city's lines and stations live in one dataset so the map can show
 * neighbouring networks when you zoom out. It is a single lazy chunk, fetched
 * once per session.
 */
let allPromise: Promise<AllData> | null = null;

export function loadAll(): Promise<AllData> {
  allPromise ??= import("../data/cities/all.json").then(
    (module) => module.default as unknown as AllData,
  );
  return allPromise;
}

export async function loadCityView(
  slug: string,
): Promise<{ city: CityData; all: AllData }> {
  const summary = findCity(slug);
  if (!summary) throw new Error(`Unknown city "${slug}"`);

  const all = await loadAll();
  return {
    city: {
      ...summary,
      lines: all.lines.filter((line) => line.city === slug),
      stations: all.stations.filter((station) => station.city === slug),
    },
    all,
  };
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
  systems: cityIndex.cities.reduce((sum, c) => sum + (c.counts.systems ?? 0), 0),
  cities: cityIndex.cities.filter((c) => c.coverage !== "none").length,
  listed: cityIndex.cities.length,
  lines: cityIndex.cities.reduce((sum, c) => sum + c.counts.lines, 0),
  /** Mapped totals: what the map actually draws. */
  stations: cityIndex.cities.reduce((sum, c) => sum + c.counts.stations, 0),
  km: Math.round(cityIndex.cities.reduce((sum, c) => sum + c.counts.km, 0)),
  /** Wikipedia's official system figures, kept for reference. */
  officialKm: Math.round(cityIndex.cities.reduce((sum, c) => sum + c.stats.km, 0)),
};
