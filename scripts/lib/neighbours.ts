import type { Bounds } from "../../shared/schema";
import { boundsGap } from "./geo";

export type NeighbourInput = {
  slug: string;
  bounds: Bounds;
  /** Cities without drawn data cannot contribute to the map. */
  hasData: boolean;
};

/**
 * Pick the networks that should be drawn alongside each city. This replaces
 * loading every city on every page: the index stores the slugs, and the app
 * fetches only those shards.
 */
export function computeNeighbours(
  cities: NeighbourInput[],
  { maxGapDegrees = 0.6, limit = 6 }: { maxGapDegrees?: number; limit?: number } = {},
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const usable = cities.filter((city) => city.hasData);

  for (const city of cities) {
    if (!city.hasData) {
      result.set(city.slug, []);
      continue;
    }
    const matches = usable
      .filter((other) => other.slug !== city.slug)
      .map((other) => ({ slug: other.slug, gap: boundsGap(city.bounds, other.bounds) }))
      .filter((match) => match.gap <= maxGapDegrees)
      .sort((a, b) => a.gap - b.gap || a.slug.localeCompare(b.slug))
      .slice(0, limit)
      .map((match) => match.slug);
    result.set(city.slug, matches);
  }
  return result;
}
