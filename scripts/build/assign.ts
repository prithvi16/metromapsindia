import { CITIES } from "../cities";
import type { OsmNode, OsmRelation, OsmResponse } from "../lib/osm";
import { indexElements } from "../lib/osm";

export type PatternMatcher = { slug: string; re: RegExp };

/** Satellites first: "Mumbai Metro" is a substring of "Navi Mumbai Metro". */
const SATELLITES = ["navi-mumbai", "gurugram", "noida", "meerut"];

export function patternMatchers(): PatternMatcher[] {
  const order = [
    ...SATELLITES,
    ...CITIES.map((city) => city.slug).filter((slug) => !SATELLITES.includes(slug)),
  ];
  const list: PatternMatcher[] = [];
  for (const slug of order) {
    const city = CITIES.find((candidate) => candidate.slug === slug);
    if (!city) continue;
    for (const pattern of city.patterns) {
      list.push({ slug, re: new RegExp(pattern, "i") });
    }
  }
  return list;
}

export function cityForRelation(
  relation: OsmRelation,
  matchers: PatternMatcher[],
  nodes: Map<number, OsmNode>,
): string | null {
  const text = `${relation.tags?.network ?? ""} ${relation.tags?.name ?? ""} ${relation.tags?.operator ?? ""}`;
  const hit = matchers.find(({ re }) => re.test(text));
  if (hit) return hit.slug;

  // Fall back to whichever region contains the relation's first stop.
  const stop = relation.members.find(
    (member) => member.type === "node" && (member.role ?? "").startsWith("stop"),
  );
  if (!stop) return null;
  const node = nodes.get(stop.ref);
  if (!node) return null;
  for (const city of CITIES) {
    const [west, south, east, north] = city.bounds;
    if (node.lon >= west && node.lon <= east && node.lat >= south && node.lat <= north) {
      return city.slug;
    }
  }
  return null;
}

/** Decide which city owns each OSM relation. */
export function assignRelations(raws: Map<string, OsmResponse>): Map<number, string> {
  const assigned = new Map<number, string>();
  const matchers = patternMatchers();

  for (const [slug, raw] of raws) {
    if (!CITIES.some((candidate) => candidate.slug === slug)) continue;
    const { nodes } = indexElements(raw.elements);
    for (const element of raw.elements) {
      if (element.type !== "relation") continue;
      if (assigned.has(element.id)) continue;
      const owner = cityForRelation(element, matchers, nodes);
      if (owner) assigned.set(element.id, owner);
    }
  }
  return assigned;
}
