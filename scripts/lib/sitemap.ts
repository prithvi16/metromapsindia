import type { CitySummary } from "../../shared/schema";

export const DEFAULT_SITE_URL = "https://metromapsindia.netlify.app";

type SitemapCity = Pick<CitySummary, "slug" | "coverage">;

export function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build the sitemap from the same index the app uses, so a new city cannot be
 * published without appearing here.
 */
export function buildSitemap(
  cities: readonly SitemapCity[],
  generatedAt: string,
  siteUrl = DEFAULT_SITE_URL,
): string {
  const base = normalizeSiteUrl(siteUrl);
  const lastmod = generatedAt.slice(0, 10);
  const entries = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/about", changefreq: "monthly", priority: "0.5" },
    ...cities.map((city) => ({
      path: `/city/${city.slug}`,
      changefreq: "monthly",
      priority: city.coverage === "none" ? "0.4" : "0.8",
    })),
  ];

  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(`${base}${entry.path}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function buildRobots(siteUrl = DEFAULT_SITE_URL): string {
  return `User-agent: *
Allow: /

Sitemap: ${normalizeSiteUrl(siteUrl)}/sitemap.xml
`;
}

/**
 * Give known routes a static HTML shell so social crawlers (which do not run
 * JavaScript) still see the right title, description and canonical URL. The
 * catch-all stays last and keeps unknown routes inside the SPA.
 */
export function buildRedirects(cities: readonly Pick<CitySummary, "slug">[]): string {
  const cityRules = cities
    .map((city) => `/city/${city.slug}    /city/${city.slug}.html   200`)
    .join("\n");

  return `# Pre-rendered meta shells for crawlers.\n${cityRules}
/about    /about.html   200

# SPA fallback for everything else.
/*    /index.html   200
`;
}
