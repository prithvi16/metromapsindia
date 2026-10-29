import { describe, expect, it } from "vitest";
import { applyCuration } from "../scripts/build/curate";
import type { CityConfig } from "../scripts/cities";
import type { CityLine, CurationPatch } from "../shared/schema";

const city: CityConfig = {
  slug: "test",
  city: "Test City",
  system: "Test Metro",
  operator: "TM",
  region: "West",
  bounds: [72, 18, 74, 20],
  patterns: ["test metro"],
  stats: { lines: 1, stations: 2, km: 10, opened: "2020", ridership: null },
};

function line(overrides: Partial<CityLine> = {}): CityLine {
  return {
    osmId: 1,
    system: "Test Metro",
    mode: "metro",
    name: "Line 1",
    ref: "1",
    colour: "#e11d48",
    from: null,
    to: null,
    operator: "TM",
    status: "operational",
    openingDate: null,
    geometry: [
      [
        [18.1, 72.1],
        [18.2, 72.2],
      ],
    ],
    stations: [{ name: "One", lat: 18.1, lon: 72.1 }],
    ...overrides,
  };
}

const basePatch: CurationPatch = {
  checkedAt: "2026-10-29",
  sources: ["https://example.org/route-map"],
};

describe("curation patches", () => {
  it("overrides status and replaces stations", () => {
    const patch: CurationPatch = {
      ...basePatch,
      lines: [
        {
          match: { ref: "1" },
          status: "under-construction",
          stations: [
            { name: "One", lat: 18.1, lon: 72.1 },
            { name: "Two", lat: 18.2, lon: 72.2 },
          ],
        },
      ],
    };
    const result = applyCuration([line()], patch, city);
    expect(result.warnings).toEqual([]);
    expect(result.lines[0].status).toBe("under-construction");
    expect(result.lines[0].stations).toHaveLength(2);
    expect(result.lines[0].curated).toBe(true);
  });

  it("appends without dropping existing stations", () => {
    const patch: CurationPatch = {
      ...basePatch,
      lines: [
        {
          match: { nameIncludes: "Line" },
          stationsMode: "append",
          stations: [{ name: "Two", lat: 18.2, lon: 72.2 }],
        },
      ],
    };
    const result = applyCuration([line()], patch, city);
    expect(result.lines[0].stations.map((station) => station.name)).toEqual(["One", "Two"]);
  });

  it("adds and drops lines", () => {
    const patch: CurationPatch = {
      ...basePatch,
      addLines: [
        {
          name: "Line 2",
          ref: "2",
          geometry: [
            [18.1, 72.1],
            [18.3, 72.3],
          ],
          stations: [{ name: "Three", lat: 18.3, lon: 72.3 }],
        },
      ],
      dropLines: [{ match: { ref: "1" } }],
    };
    const result = applyCuration([line()], patch, city);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].ref).toBe("2");
    expect(result.lines[0].curated).toBe(true);
  });

  it("reports a patch that matches nothing", () => {
    const patch: CurationPatch = {
      ...basePatch,
      lines: [{ match: { ref: "99" }, status: "planned" }],
    };
    const result = applyCuration([line()], patch, city);
    expect(result.warnings[0]).toContain("no line matched");
  });

  it("rejects stations outside the city bounds", () => {
    const patch: CurationPatch = {
      ...basePatch,
      lines: [
        {
          match: { ref: "1" },
          stations: [{ name: "Far away", lat: 30, lon: 80 }],
        },
      ],
    };
    const result = applyCuration([line()], patch, city);
    expect(result.warnings[0]).toContain("falls outside");
  });
});
