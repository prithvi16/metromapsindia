import type { CitySummary } from "../../shared/schema";
import { normalizeSiteUrl } from "./sitemap";

export type RouteMeta = {
  title: string;
  description: string;
  path: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceMeta(html: string, attribute: "name" | "property", key: string, content: string) {
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="[^"]*"\\s*/>`);
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `${tag}\n</head>`);
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
}

function replaceCanonical(html: string, canonical: string): string {
  return html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
  );
}

/** Rewrite the built index.html head for one route without touching the app shell. */
export function renderRouteHtml(template: string, meta: RouteMeta, siteUrl: string): string {
  const canonical = `${normalizeSiteUrl(siteUrl)}${meta.path}`;
  let html = replaceTitle(template, meta.title);
  html = replaceMeta(html, "name", "description", meta.description);
  html = replaceCanonical(html, canonical);
  html = replaceMeta(html, "property", "og:title", meta.title);
  html = replaceMeta(html, "property", "og:description", meta.description);
  html = replaceMeta(html, "property", "og:url", canonical);
  html = replaceMeta(html, "property", "og:image:alt", `${meta.title} — MetroMaps India`);
  html = replaceMeta(html, "name", "twitter:title", meta.title);
  html = replaceMeta(html, "name", "twitter:description", meta.description);
  html = replaceMeta(html, "name", "twitter:image:alt", `${meta.title} — MetroMaps India`);
  return html;
}

export type CityMetaInput = {
  slug: string;
  city: string;
  coverage: CitySummary["coverage"];
  system: string;
  stats: Pick<CitySummary["stats"], "opened">;
  counts: Pick<CitySummary["counts"], "lines" | "stations" | "km">;
};

export function cityRouteMeta(city: CityMetaInput): RouteMeta {
  const title = `${city.city} — MetroMaps India`;
  const description =
    city.coverage === "none"
      ? `${city.city}: ${city.system}, planned opening ${city.stats.opened.slice(0, 4)}.`
      : `${city.city}: ${city.counts.lines} mapped lines and ${city.counts.stations} stations across ${city.counts.km.toFixed(0)} line-km of metro, suburban and light rail.`;
  return { title, description, path: `/city/${city.slug}` };
}

export const ABOUT_META: RouteMeta = {
  title: "About — MetroMaps India",
  description:
    "How MetroMaps India combines OpenStreetMap and the India Rail Info atlas into one atlas of Indian urban rail.",
  path: "/about",
};
