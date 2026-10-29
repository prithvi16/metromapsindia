import { describe, expect, it } from "vitest";
import { buildPreview } from "../scripts/lib/preview";
import type { CityLine } from "../shared/schema";

const line: CityLine = {
  osmId: 1,
  system: "Test Metro",
  mode: "metro",
  name: "Line 1",
  ref: "1",
  colour: "#e11d48",
  from: "A",
  to: "B",
  operator: "TM",
  status: "operational",
  openingDate: null,
  geometry: [
    [
      [19.0, 72.8],
      [19.1, 72.9],
      [19.2, 73.0],
    ],
  ],
  stations: [],
};

describe("city preview", () => {
  it("projects a line into SVG paths", () => {
    const preview = buildPreview([line]);
    expect(preview).not.toBeNull();
    expect(preview?.paths).toHaveLength(1);
    expect(preview?.paths[0].d.startsWith("M")).toBe(true);
    expect(preview?.paths[0].colour).toBe("#e11d48");
  });

  it("returns null when there is nothing drawable", () => {
    expect(buildPreview([{ ...line, geometry: [] }])).toBeNull();
  });
});
