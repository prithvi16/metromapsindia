import { describe, expect, it } from "vitest";
import { loadAllShardsForValidation } from "../scripts/build/dataset";
import { CurationPatchSchema, SearchIndexSchema } from "../shared/schema";

describe("committed data", () => {
  it("matches the index, shard and search schemas", async () => {
    const { index, search, shards } = await loadAllShardsForValidation();
    expect(index.cities.length).toBeGreaterThan(20);
    expect(shards.size).toBeGreaterThan(0);
    expect(search.entries.length).toBeGreaterThan(100);

    for (const city of index.cities) {
      if (city.coverage !== "none") {
        const shard = shards.get(city.slug);
        expect(shard, `${city.slug} shard`).toBeDefined();
        expect(shard?.counts.stations).toBe(city.counts.stations);
      }
    }
  });

  it("points every neighbour at a real city", async () => {
    const { index } = await loadAllShardsForValidation();
    const slugs = new Set(index.cities.map((city) => city.slug));
    for (const city of index.cities) {
      for (const neighbour of city.neighbours) {
        expect(slugs.has(neighbour), `${city.slug} -> ${neighbour}`).toBe(true);
      }
    }
  });

  it("validates a curation patch and rejects an unsourced one", () => {
    expect(
      CurationPatchSchema.safeParse({
        checkedAt: "2026-10-29",
        sources: ["https://example.org/route-map"],
        lines: [{ match: { ref: "1" }, status: "planned" }],
      }).success,
    ).toBe(true);

    expect(
      CurationPatchSchema.safeParse({
        checkedAt: "2026-10-29",
        sources: [],
        lines: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a search entry with an unknown kind", () => {
    expect(
      SearchIndexSchema.safeParse({
        generatedBy: "test",
        generatedAt: "2026-10-29",
        entries: [{ kind: "planet", city: "mumbai" }],
      }).success,
    ).toBe(false);
  });
});
