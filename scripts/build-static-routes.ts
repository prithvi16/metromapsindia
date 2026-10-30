/**
 * Write a meta-only HTML shell for /about and every city page. The shell keeps
 * the real Vite entry script, so visitors still get the SPA; crawlers that do
 * not execute JavaScript get the correct title, description and canonical URL.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CityIndexSchema } from "../shared/schema";
import { readJson } from "./lib/fs";
import { DEFAULT_SITE_URL, normalizeSiteUrl } from "./lib/sitemap";
import { ABOUT_META, cityRouteMeta, renderRouteHtml } from "./lib/static-routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const indexPath = path.join(root, "src", "data", "cities", "index.json");

async function main(): Promise<void> {
  const template = await readFile(path.join(distDir, "index.html"), "utf8").catch(() => null);
  if (!template) throw new Error("dist/index.html is missing — run the Vite build first");

  const raw = await readJson<unknown>(indexPath);
  const parsed = CityIndexSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid ${path.relative(root, indexPath)}`);

  const siteUrl = normalizeSiteUrl(process.env.SITE_URL ?? DEFAULT_SITE_URL);
  const cityDir = path.join(distDir, "city");
  await mkdir(cityDir, { recursive: true });

  for (const city of parsed.data.cities) {
    await writeFile(
      path.join(cityDir, `${city.slug}.html`),
      renderRouteHtml(template, cityRouteMeta(city), siteUrl),
      "utf8",
    );
  }

  await writeFile(
    path.join(distDir, "about.html"),
    renderRouteHtml(template, ABOUT_META, siteUrl),
    "utf8",
  );

  console.log(`Wrote ${parsed.data.cities.length} city shells and about.html`);
}

await main();
