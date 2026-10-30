import { describe, expect, it } from "vitest";
import { buildRedirects } from "../scripts/lib/sitemap";
import { ABOUT_META, cityRouteMeta, renderRouteHtml } from "../scripts/lib/static-routes";

const template = `<!doctype html>
<html lang="en-IN">
  <head>
    <title>MetroMaps India — India's urban rail atlas</title>
    <meta
      name="description"
      content="Default description."
    />
    <link rel="canonical" href="https://example.com/" />
    <meta property="og:title" content="Default title" />
    <meta property="og:description" content="Default description." />
    <meta property="og:url" content="https://example.com/" />
    <meta property="og:image:alt" content="Default alt" />
    <meta name="twitter:title" content="Default title" />
    <meta name="twitter:description" content="Default description." />
    <meta name="twitter:image:alt" content="Default alt" />
    <script type="module" src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("static route shells", () => {
  it("rewrites crawler-visible metadata without changing the app entry", () => {
    const html = renderRouteHtml(
      template,
      {
        title: "Delhi NCR — MetroMaps India",
        description: "Delhi NCR: 17 lines.",
        path: "/city/delhi",
      },
      "https://example.com/",
    );

    expect(html).toContain("<title>Delhi NCR — MetroMaps India</title>");
    expect(html).toContain('content="Delhi NCR: 17 lines."');
    expect(html).toContain('rel="canonical" href="https://example.com/city/delhi"');
    expect(html).toContain('property="og:url" content="https://example.com/city/delhi"');
    expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>');
    expect(html).not.toContain("Default description.");
  });

  it("describes mapped and coming-soon cities differently", () => {
    const mapped = cityRouteMeta({
      slug: "delhi",
      city: "Delhi NCR",
      coverage: "full",
      system: "Delhi Metro",
      stats: { opened: "2002" },
      counts: { lines: 17, stations: 302, km: 786.2 },
    });
    const soon = cityRouteMeta({
      slug: "surat",
      city: "Surat",
      coverage: "none",
      system: "Surat Metro",
      stats: { opened: "2028" },
      counts: { lines: 0, stations: 0, km: 0 },
    });

    expect(mapped.description).toContain("17 mapped lines");
    expect(soon.description).toContain("planned opening 2028");
    expect(ABOUT_META.path).toBe("/about");
  });

  it("puts explicit route rewrites before the SPA fallback", () => {
    const redirects = buildRedirects([{ slug: "delhi" }, { slug: "mumbai" }]);
    const lines = redirects.trim().split("\n");
    const catchAll = lines.findIndex((line) => line.startsWith("/*"));

    expect(lines).toContain("/city/delhi    /city/delhi.html   200");
    expect(lines).toContain("/about    /about.html   200");
    expect(catchAll).toBeGreaterThan(lines.indexOf("/city/delhi    /city/delhi.html   200"));
    expect(lines[catchAll]).toBe("/*    /index.html   200");
  });
});
