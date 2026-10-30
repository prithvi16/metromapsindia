/**
 * Generate sitemap.xml and robots.txt from the committed city index. The build
 * runs this before Vite copies public/ into dist/, so a data refresh keeps the
 * sitemap current without a second source of truth.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CityIndexSchema } from "../shared/schema";
import { readJson } from "./lib/fs";
import {
  buildRedirects,
  buildRobots,
  buildSitemap,
  DEFAULT_SITE_URL,
  normalizeSiteUrl,
} from "./lib/sitemap";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const indexUrl = path.join(root, "src", "data", "cities", "index.json");
const publicDir = path.join(root, "public");

async function main(): Promise<void> {
  const raw = await readJson<unknown>(indexUrl);
  if (raw == null) throw new Error(`Missing ${path.relative(root, indexUrl)}`);

  const parsed = CityIndexSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid ${path.relative(root, indexUrl)}`);

  const siteUrl = normalizeSiteUrl(process.env.SITE_URL ?? DEFAULT_SITE_URL);
  const index = parsed.data;
  const sitemap = buildSitemap(index.cities, index.generatedAt, siteUrl);
  const robots = buildRobots(siteUrl);
  const redirects = buildRedirects(index.cities);

  await writeFile(path.join(publicDir, "sitemap.xml"), sitemap, "utf8");
  await writeFile(path.join(publicDir, "robots.txt"), robots, "utf8");
  await writeFile(path.join(publicDir, "_redirects"), redirects, "utf8");

  console.log(
    `Wrote sitemap.xml (${index.cities.length + 2} URLs), robots.txt and _redirects for ${siteUrl}`,
  );
}

await main();
