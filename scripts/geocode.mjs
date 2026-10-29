/**
 * Resolve station names to coordinates with Nominatim, biased to a city.
 * Results are cached and rate-limited to one request per second.
 *
 * Usage:
 *   node scripts/geocode.mjs --city=mumbai --names="DN Nagar,ESIC Nagar,Prem Nagar"
 *   node scripts/geocode.mjs --city=mumbai --file=names.txt
 *   node scripts/geocode.mjs --city=mumbai --names="..." --json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cachePath = path.join(__dirname, "out", "geocode.json");
const index = JSON.parse(
  await readFile(path.join(root, "src", "data", "cities", "index.json"), "utf8"),
);

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const citySlug = arg("city");
const asJson = args.includes("--json");

if (!citySlug) {
  console.error("--city=<slug> is required");
  process.exit(1);
}

const city = index.cities.find((c) => c.slug === citySlug);
if (!city) {
  console.error(`Unknown city "${citySlug}"`);
  process.exit(1);
}

let names = [];
if (arg("names")) names = arg("names").split(",").map((n) => n.trim()).filter(Boolean);
if (arg("file")) {
  const text = await readFile(path.resolve(arg("file")), "utf8");
  names.push(...text.split("\n").map((n) => n.trim()).filter(Boolean));
}
if (!names.length) {
  console.error('Provide --names="A,B" or --file=names.txt');
  process.exit(1);
}

const [west, south, east, north] = city.bounds;
const pad = 0.12;
const viewbox = `${west - pad},${north + pad},${east + pad},${south - pad}`;

let cache = {};
try {
  cache = JSON.parse(await readFile(cachePath, "utf8"));
} catch {
  // first run
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocode(name) {
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
  const hits = await res.json();

  const candidates = hits.map((hit) => ({
    name: hit.name || hit.display_name?.split(",")[0] || name,
    lat: Number(Number(hit.lat).toFixed(6)),
    lon: Number(Number(hit.lon).toFixed(6)),
    type: `${hit.category}/${hit.type}`,
    display: hit.display_name,
    osm: hit.osm_type ? `${hit.osm_type}/${hit.osm_id}` : null,
  }));

  cache[key] = candidates;
  return candidates;
}

const out = [];
for (const name of names) {
  try {
    const candidates = await geocode(name);
    out.push({ query: name, candidates });
  } catch (err) {
    out.push({ query: name, error: String(err.message ?? err) });
  }
  await sleep(1100);
}

await mkdir(path.dirname(cachePath), { recursive: true });
await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  for (const entry of out) {
    console.log(`\n${entry.query}`);
    if (entry.error) {
      console.log(`  ! ${entry.error}`);
      continue;
    }
    if (!entry.candidates.length) {
      console.log("  (no match inside the city bounds)");
      continue;
    }
    for (const candidate of entry.candidates.slice(0, 3)) {
      console.log(
        `  ${candidate.lat.toFixed(5)}, ${candidate.lon.toFixed(5)}  ${candidate.type.padEnd(22)} ${candidate.name}`,
      );
    }
  }
  console.log("\nCoordinates are WGS84. Verify each pick against the line geometry before patching.");
}
