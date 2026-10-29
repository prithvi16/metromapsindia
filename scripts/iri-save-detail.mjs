/**
 * Copy a browser-downloaded IRI track-detail JSON into the extract cache.
 * The /atlas/track/<id> endpoint only answers same-origin browser requests, so
 * the iri-suburban agent downloads the JSON from an open atlas tab and hands the
 * file to this helper.
 *
 * Usage:
 *   node scripts/iri-save-detail.mjs <slug> <downloaded.json>
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES } from "./cities.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const [slug, source] = process.argv.slice(2);
if (!slug || !source) {
  console.error("Usage: node scripts/iri-save-detail.mjs <slug> <downloaded.json>");
  process.exit(1);
}

const city = CITIES.find((c) => c.slug === slug);
if (!city) {
  console.error(`Unknown city "${slug}".`);
  process.exit(1);
}

const raw = JSON.parse(await readFile(source, "utf8"));
const ids = Object.keys(raw);
const withCoords = ids.filter((id) => raw[id]?.TrkCoords);
if (!withCoords.length) {
  console.error("No TrkCoords found — is this the /atlas/track/<id> response?");
  process.exit(1);
}

const destDir = path.join(root, "scripts", "out", "iri", slug);
await mkdir(destDir, { recursive: true });
const dest = path.join(destDir, "tracks-detail.json");
await copyFile(source, dest);

console.log(`${withCoords.length}/${ids.length} tracks with coordinates -> ${dest}`);
for (const id of ids.filter((id) => raw[id]?.error)) {
  console.log(`  ! ${id}: ${raw[id].error}`);
}
