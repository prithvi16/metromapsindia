import type { CityData, CityIndex, CitySummary } from "./cities";
import indexJson from "../data/cities/index.json";

export const cityIndex = indexJson as unknown as CityIndex;

/** Every city file, kept out of the initial bundle and loaded on demand. */
const cityModules = import.meta.glob<{ default: CityData }>([
  "../data/cities/*.json",
  "!../data/cities/index.json",
]);

export function findCity(slug: string | undefined): CitySummary | undefined {
  return cityIndex.cities.find((city) => city.slug === slug);
}

export async function loadCity(slug: string): Promise<CityData> {
  const key = `../data/cities/${slug}.json`;
  const loader = cityModules[key];
  if (!loader) throw new Error(`No dataset for "${slug}"`);
  const module = await loader();
  return module.default;
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
  systems: cityIndex.cities.filter((c) => c.coverage !== "none").length,
  planned: cityIndex.cities.length,
  stations: cityIndex.cities.reduce((sum, c) => sum + c.stats.stations, 0),
  km: Math.round(cityIndex.cities.reduce((sum, c) => sum + c.stats.km, 0)),
};
