/**
 * Copy a browser-downloaded IRI track-detail JSON into the extract cache.
 * The /atlas/track/<id> endpoint only answers same-origin browser requests, so
 * the iri-suburban agent downloads the JSON from an open atlas tab and hands the
 * file to this helper.
 *
 * Usage:
 *   npm run data:iri-detail -- <slug> <downloaded.json>
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES } from "./cities";
import { fail, printHelp } from "./lib/args";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const HELP = `
Save a browser-downloaded IRI track-detail file.

Usage:
  npm run data:iri-detail -- <slug> <downloaded.json>
`;

type TrackDetail = { TrkCoords?: string; error?: string };

async function main(): Promise<void> {
  const [slug, source] = process.argv.slice(2);
  if (slug === "--help" || slug === "-h") printHelp(HELP);
  if (!slug || !source) fail(HELP.trim());

  if (!CITIES.some((city) => city.slug === slug)) {
    fail(`Unknown city "${slug}".`);
  }

  const raw = JSON.parse(await readFile(source, "utf8")) as Record<string, TrackDetail>;
  const ids = Object.keys(raw);
  const withCoords = ids.filter((id) => raw[id]?.TrkCoords);
  if (!withCoords.length) {
    fail("No TrkCoords found — is this the /atlas/track/<id> response?");
  }

  const destDir = path.join(root, "scripts", "out", "iri", slug);
  await mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, "tracks-detail.json");
  await copyFile(source, dest);

  console.log(`${withCoords.length}/${ids.length} tracks with coordinates -> ${dest}`);
  for (const id of ids.filter((id) => raw[id]?.error)) {
    console.log(`  ! ${id}: ${raw[id].error}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
