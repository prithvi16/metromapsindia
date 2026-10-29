/**
 * Resolve station names to coordinates with Nominatim, biased to a city.
 * Results are cached and rate-limited to one request per second.
 *
 * Usage:
 *   npm run data:geocode -- --city=mumbai --names="DN Nagar,ESIC Nagar"
 *   npm run data:geocode -- --city=mumbai --file=names.txt
 *   npm run data:geocode -- --city=mumbai --names="..." --json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readIndex } from "./build/dataset";
import { fail, getArg, hasFlag, parseArgs, printHelp } from "./lib/args";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cachePath = path.join(__dirname, "out", "geocode.json");

const HELP = `
Geocode station names within a city's bounds (Nominatim).

Usage:
  npm run data:geocode -- --city=slug (--names="A,B" | --file=names.txt) [--json]

Options:
  --city=slug   City whose bounds bias the search (required)
  --names=A,B   Comma-separated station names
  --file=path   Newline-separated names
  --json        Print candidates as JSON
  --help        Show this message
`;

type Candidate = {
  name: string;
  lat: number;
  lon: number;
  type: string;
  display: string;
  osm: string | null;
};

type NominatimHit = {
  name?: string;
  display_name?: string;
  lat: string;
  lon: string;
  category: string;
  type: string;
  osm_type?: string;
  osm_id?: number;
};

async function main(): Promise<void> {
  const args = parseArgs(undefined, { booleans: ["json", "help"] });
  if (hasFlag(args, "help")) printHelp(HELP);

  const citySlug = getArg(args, "city");
  if (!citySlug) fail(HELP.trim());

  const index = await readIndex();
  if (!index) fail("Run `npm run data:build` first (index.json is missing).");
  const found = index.cities.find((candidate) => candidate.slug === citySlug);
  if (!found) fail(`Unknown city "${citySlug}"`);
  const city = found;

  let names: string[] = [];
  const namesArg = getArg(args, "names");
  if (namesArg) {
    names = namesArg
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  const fileArg = getArg(args, "file");
  if (fileArg) {
    const text = await readFile(path.resolve(fileArg), "utf8");
    names.push(
      ...text
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean),
    );
  }
  if (!names.length) fail('Provide --names="A,B" or --file=names.txt');

  const [west, south, east, north] = city.bounds;
  const pad = 0.12;
  const viewbox = `${west - pad},${north + pad},${east + pad},${south - pad}`;

  let cache: Record<string, Candidate[]> = {};
  try {
    cache = JSON.parse(await readFile(cachePath, "utf8")) as Record<string, Candidate[]>;
  } catch {
    // first run
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function geocode(name: string): Promise<Candidate[]> {
    const key = `${citySlug}|${name.toLowerCase()}`;
    if (cache[key]) return cache[key];

    const params = new URLSearchParams({
      q: `${name}, ${city.city}, India`,
      format: "jsonv2",
      limit: "5",
      viewbox,
      bounded: "1",
      addressdetails: "0",
    });

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "metromapsindia-curation/0.1 (data cleanup)" },
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const hits = (await res.json()) as NominatimHit[];

    const candidates = hits.map((hit) => ({
      name: hit.name || hit.display_name?.split(",")[0] || name,
      lat: Number(Number(hit.lat).toFixed(6)),
      lon: Number(Number(hit.lon).toFixed(6)),
      type: `${hit.category}/${hit.type}`,
      display: hit.display_name ?? "",
      osm: hit.osm_type ? `${hit.osm_type}/${hit.osm_id}` : null,
    }));

    cache[key] = candidates;
    return candidates;
  }

  const out: {
    query: string;
    candidates?: Candidate[];
    error?: string;
  }[] = [];
  for (const name of names) {
    try {
      const candidates = await geocode(name);
      out.push({ query: name, candidates });
    } catch (error) {
      out.push({
        query: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await sleep(1100);
  }

  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  for (const entry of out) {
    console.log(`\n${entry.query}`);
    if (entry.error) {
      console.log(`  ! ${entry.error}`);
      continue;
    }
    if (!entry.candidates?.length) {
      console.log("  (no match inside the city bounds)");
      continue;
    }
    for (const candidate of entry.candidates.slice(0, 3)) {
      console.log(
        `  ${candidate.lat.toFixed(5)}, ${candidate.lon.toFixed(5)}  ${candidate.type.padEnd(22)} ${candidate.name}`,
      );
    }
  }
  console.log(
    "\nCoordinates are WGS84. Verify each pick against the line geometry before patching.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
