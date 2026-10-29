import { describe, expect, it } from "vitest";
import { computeNeighbours } from "../scripts/lib/neighbours";

describe("neighbours", () => {
  it("keeps nearby cities and drops far ones", () => {
    const result = computeNeighbours([
      { slug: "delhi", bounds: [76.8, 28.25, 77.6, 28.95], hasData: true },
      { slug: "noida", bounds: [77.25, 28.38, 77.65, 28.65], hasData: true },
      { slug: "mumbai", bounds: [72.7, 18.82, 73.15, 19.4], hasData: true },
      { slug: "surat", bounds: [72.65, 21.05, 73, 21.35], hasData: false },
    ]);
    expect(result.get("delhi")).toEqual(["noida"]);
    expect(result.get("mumbai")).toEqual([]);
    expect(result.get("surat")).toEqual([]);
  });

  it("respects the limit", () => {
    const cities = Array.from({ length: 8 }, (_, index) => ({
      slug: `city-${index}`,
      bounds: [index * 0.05, 0, index * 0.05 + 0.02, 0.02] as [number, number, number, number],
      hasData: true,
    }));
    const result = computeNeighbours(cities, { limit: 2 });
    expect(result.get("city-0")).toHaveLength(2);
  });
});
