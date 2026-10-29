import {
  type CityData,
  MODE_LABELS,
  MODE_SHORT_LABELS,
  type SearchEntry,
  type SearchIndex,
} from "../../shared/schema";

/** Compact search index: names, modes and coordinates, no geometry. */
export function buildSearchIndex(
  cities: CityData[],
  generatedAt: string,
  generatedBy: string,
): SearchIndex {
  const entries: SearchEntry[] = [];

  for (const city of cities) {
    for (const line of city.lines) {
      const label = line.name;
      const haystack = [
        line.name,
        line.ref ?? "",
        line.system,
        line.from ?? "",
        line.to ?? "",
        MODE_LABELS[line.mode],
        MODE_SHORT_LABELS[line.mode],
      ]
        .join(" ")
        .toLowerCase();
      entries.push({
        kind: "line",
        city: city.slug,
        id: String(line.osmId),
        label,
        system: line.system,
        from: line.from,
        to: line.to,
        mode: line.mode,
        haystack,
      });
    }

    for (const station of city.stations) {
      const haystack = [
        station.name,
        ...station.modes.map((mode) => `${MODE_LABELS[mode]} ${MODE_SHORT_LABELS[mode]}`),
        ...station.lines,
      ]
        .join(" ")
        .toLowerCase();
      entries.push({
        kind: "station",
        city: city.slug,
        name: station.name,
        lat: station.lat,
        lon: station.lon,
        modes: station.modes,
        lines: station.lines,
        haystack,
      });
    }
  }

  return { generatedBy, generatedAt, entries };
}
