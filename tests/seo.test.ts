import { describe, expect, it } from "vitest";
import { buildRobots, buildSitemap, normalizeSiteUrl } from "../scripts/lib/sitemap";

const cities = [
  { slug: "delhi", coverage: "full" as const },
  { slug: "meerut", coverage: "none" as const },
];

describe("sitemap", () => {
  it("lists the home page, about page and every city", () => {
    const xml = buildSitemap(cities, "2026-10-29T17:08:15.110Z", "https://example.com/");

    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).toContain("<loc>https://example.com/city/delhi</loc>");
    expect(xml).toContain("<loc>https://example.com/city/meerut</loc>");
    expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml).toContain("<lastmod>2026-10-29</lastmod>");
    expect(xml).toContain("<priority>0.4</priority>");
  });

  it("trims trailing slashes and writes a sitemap reference in robots.txt", () => {
    expect(normalizeSiteUrl("https://example.com///")).toBe("https://example.com");
    expect(buildRobots("https://example.com/")).toContain(
      "Sitemap: https://example.com/sitemap.xml",
    );
  });
});
