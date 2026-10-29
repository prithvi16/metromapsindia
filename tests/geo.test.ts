import { describe, expect, it } from "vitest";
import { boundsFromLines, boundsGap, haversine, minZoomFor, simplify } from "../scripts/lib/geo";

describe("geo helpers", () => {
  it("computes a plausible Mumbai–Pune distance", () => {
    const mumbai = { lat: 19.076, lon: 72.8777 };
    const pune = { lat: 18.5204, lon: 73.8567 };
    const distance = haversine(mumbai, pune);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(160);
  });

  it("keeps endpoints and removes a collinear midpoint", () => {
    const points: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    expect(simplify(points, 0.01)).toEqual([
      [0, 0],
      [0, 2],
    ]);
  });

  it("keeps a meaningful bend", () => {
    const points: [number, number][] = [
      [0, 0],
      [1, 1],
      [0, 2],
    ];
    expect(simplify(points, 0.01)).toHaveLength(3);
  });

  it("computes bounds with padding", () => {
    const bounds = boundsFromLines(
      [
        {
          geometry: [
            [
              [19, 72],
              [19.1, 72.1],
            ],
          ],
        },
      ],
      [0, 0, 1, 1],
    );
    expect(bounds[0]).toBeLessThan(72);
    expect(bounds[1]).toBeLessThan(19);
    expect(bounds[2]).toBeGreaterThan(72.1);
    expect(bounds[3]).toBeGreaterThan(19.1);
  });

  it("measures gaps between boxes and treats overlaps as zero", () => {
    expect(boundsGap([0, 0, 1, 1], [0.5, 0.5, 2, 2])).toBe(0);
    expect(boundsGap([0, 0, 1, 1], [2, 0, 3, 1])).toBe(1);
  });

  it("returns a sane minimum zoom for a city-sized box", () => {
    const zoom = minZoomFor([72.7, 18.8, 73.2, 19.4]);
    expect(zoom).toBeGreaterThan(8);
    expect(zoom).toBeLessThan(13);
  });
});
