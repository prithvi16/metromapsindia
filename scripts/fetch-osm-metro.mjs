/**
 * Pulls Mumbai metro lines and stations from OpenStreetMap (via Overpass API)
 * and writes a normalised dataset to src/data/mumbai-metro.json.
 *
 * Usage: node scripts/fetch-osm-metro.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const BBOX = "18.80,72.70,19.40,73.15";

const QUERY = `[out:json][timeout:240];
(
  relation["route"="subway"](${BBOX});
  relation["route"="construction"]["construction"="subway"](${BBOX});
  relation["construction:route"="subway"](${BBOX});
  node["station"="subway"](${BBOX});
  node["railway"="station"]["subway"="yes"](${BBOX});
);
out body;
>;
out skel qt;`;

const ENDPOINTS = [
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let delay = 5000;
  for (let attempt = 1; attempt <= 12; attempt++) {
    const endpoint = ENDPOINTS[(attempt - 1) % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "metromapsindia/0.1 (development; contact: local)",
        },
        body: "data=" + encodeURIComponent(query),
      });
      const text = await res.text();
      if (res.ok && text.trim().startsWith("{")) {
        console.log(`  ok via ${endpoint}`);
        return JSON.parse(text);
      }
      console.log(`  attempt ${attempt}: ${res.status} from ${endpoint}`);
    } catch (err) {
      console.log(`  attempt ${attempt}: ${err.message}`);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 60000);
  }
  throw new Error("Overpass request failed after retries");
}

/** Distance in km between two {lat, lon} points. */
function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function centroid(coords) {
  const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lon = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return [lat, lon];
}

/** Join the ordered way members of a route relation into one polyline. */
function stitchGeometry(relation, ways, nodes) {
  const segments = [];
  for (const member of relation.members) {
    if (member.type !== "way") continue;
    const way = ways.get(member.ref);
    if (!way) continue;
    const coords = way.nodes
      .map((id) => nodes.get(id))
      .filter(Boolean)
      .map((n) => [n.lat, n.lon]);
    if (coords.length >= 2) segments.push(coords);
  }
  if (!segments.length) return [];

  // Walk the segments in order, flipping any that would otherwise backtrack.
  const line = [...segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const last = line[line.length - 1];
    const [headLat, headLon] = seg[0];
    const [tailLat, tailLon] = seg[seg.length - 1];
    const dHead = Math.hypot(headLat - last[0], headLon - last[1]);
    const dTail = Math.hypot(tailLat - last[0], tailLon - last[1]);
    if (dTail < dHead) seg.reverse();
    const [firstLat, firstLon] = seg[0];
    // Skip the duplicated joint point.
    if (Math.hypot(firstLat - last[0], firstLon - last[1]) < 1e-6) seg.shift();
    line.push(...seg);
  }
  return line.map(([lat, lon]) => [Number(lat.toFixed(6)), Number(lon.toFixed(6))]);
}

/**
 * OSM tagging for the Mumbai network is inconsistent: several under-construction
 * routes carry no construction tag, and the whole of Line 2 exists as one route
 * master on top of the operational 2A. These overrides keep the output honest.
 * Re-check them whenever the OSM data is refreshed.
 */
const DROP_OSM_IDS = new Map([
  [19233909, "Line 11 has no station data mapped yet"],
  [7898712, "route master for all of Line 2; overlaps operational 2A and 2B"],
  [7898769, "duplicate of operational Line 7, drawn as one long under-construction route"],
]);

const STATUS_OVERRIDES = new Map([
  ["2B", "under-construction"],
  ["9", "under-construction"],
]);

const REF_OVERRIDES = new Map([["2", "2A"]]);

const LABEL_OVERRIDES = new Map([
  ["N1", "Navi Mumbai Line 1"],
  ["4", "Line 4"],
  ["5", "Line 5"],
  ["6", "Line 6"],
]);

function curate(line) {
  const reason = DROP_OSM_IDS.get(line.osmId);
  if (reason) return null;
  const newRef = REF_OVERRIDES.get(line.ref ?? "");
  if (newRef) {
    line.name = line.name.replace(/^Line 2\b/, "Line 2A");
    line.ref = newRef;
  }
  const newStatus = STATUS_OVERRIDES.get(line.ref ?? "");
  if (newStatus) line.status = newStatus;
  line.label =
    LABEL_OVERRIDES.get(line.ref ?? "") ??
    (line.ref ? `Line ${line.ref}` : line.name);
  return line;
}

function statusOf(tags) {
  if (tags.state === "construction" || tags.construction || tags["construction:route"]) {
    return "under-construction";
  }
  if (tags.state === "proposed" || tags.proposed) return "planned";
  if (tags.opening_date && new Date(tags.opening_date) > new Date()) return "under-construction";
  return "operational";
}

async function main() {
  console.log("Querying Overpass for Mumbai metro data…");
  const data = await overpass(QUERY);

  const nodes = new Map();
  const ways = new Map();
  const relations = [];

  // `out body` returns tagged elements, the `>` recursion returns skeletons of
  // the same ids, so merge instead of overwriting or tags get lost.
  for (const el of data.elements) {
    if (el.type === "node") {
      const prev = nodes.get(el.id);
      nodes.set(el.id, prev ? { ...prev, ...el, tags: el.tags ?? prev.tags } : el);
    } else if (el.type === "way") {
      const prev = ways.get(el.id);
      ways.set(el.id, prev ? { ...prev, ...el, tags: el.tags ?? prev.tags } : el);
    } else if (el.type === "relation") {
      relations.push(el);
    }
  }

  console.log(`  ${relations.length} relations, ${ways.size} ways, ${nodes.size} nodes`);

  // Platform/stop nodes are often untagged; borrow the name of the station
  // node sitting next to them.
  const namedStations = [...nodes.values()].filter(
    (n) => n.tags?.name && (n.tags.railway === "station" || n.tags.public_transport === "station"),
  );

  function stopName(node) {
    if (node.tags?.name) return node.tags.name;
    let best = null;
    let bestDistance = 0.3; // km
    for (const station of namedStations) {
      const d = haversine(node, station);
      if (d < bestDistance) {
        best = station;
        bestDistance = d;
      }
    }
    return best?.tags.name ?? "Unnamed";
  }

  // Group the two directions of a line together, keep the longest geometry.
  const byLine = new Map();
  for (const rel of relations) {
    const tags = rel.tags ?? {};
    const name = tags.name ?? tags.ref ?? `relation ${rel.id}`;
    const key = `${tags.ref ?? ""}|${name.replace(/\s*[:(].*$/, "")}`;
    const geometry = stitchGeometry(rel, ways, nodes);
    const stops = rel.members
      .filter((m) => m.type === "node" && (m.role ?? "").startsWith("stop"))
      .map((m) => nodes.get(m.ref))
      .filter(Boolean)
      .map((n) => ({
        name: stopName(n),
        lat: Number(n.lat.toFixed(6)),
        lon: Number(n.lon.toFixed(6)),
      }));

    const candidate = {
      osmId: rel.id,
      name,
      ref: tags.ref ?? null,
      colour: tags.colour ?? tags.color ?? null,
      from: tags.from ?? null,
      to: tags.to ?? null,
      operator: tags.operator ?? null,
      network: tags.network ?? null,
      status: statusOf(tags),
      openingDate: tags.opening_date ?? null,
      length: geometry.length,
      geometry,
      stations: stops,
    };

    const existing = byLine.get(key);
    if (!existing || candidate.geometry.length > existing.geometry.length) byLine.set(key, candidate);
  }

  const lines = [...byLine.values()]
    .map(curate)
    .filter((l) => l !== null)
    .filter((l) => l.geometry.length >= 2)
    .sort((a, b) => (a.ref ?? "").localeCompare(b.ref ?? "", undefined, { numeric: true }));

  // Cluster stops into stations: same normalised name and within 2 km counts as
  // one station, which is what makes interchange detection work across lines.
  const norm = (value) =>
    value
      .toLowerCase()
      .replace(/\b(metro|station|halt)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const stationIndex = new Map();
  for (const line of lines) {
    const ref = line.ref ?? line.name;
    for (const stop of line.stations) {
      if (!stop.name || stop.name === "Unnamed") continue;
      const key = norm(stop.name);
      const hit = stationIndex.get(key);
      if (hit && haversine(hit, stop) < 2) {
        if (!hit.lines.includes(ref)) hit.lines.push(ref);
        continue;
      }
      stationIndex.set(key, { ...stop, lines: [ref] });
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap contributors, ODbL 1.0 (via Overpass API)",
    bbox: BBOX,
    lines: lines.map(({ length, ...rest }) => rest),
    stations: [...stationIndex.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };

  await mkdir(path.join(root, "src/data"), { recursive: true });
  await writeFile(
    path.join(root, "src/data/mumbai-metro.json"),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
  await mkdir(path.join(root, "scripts/out"), { recursive: true });
  await writeFile(
    path.join(root, "scripts/out/osm-raw.json"),
    JSON.stringify(data),
    "utf8",
  );

  console.log(`Wrote ${out.lines.length} lines and ${out.stations.length} stations.`);
  for (const l of out.lines) {
    console.log(
      `  ${(l.ref ?? "?").padEnd(4)} ${l.status.padEnd(18)} ${String(l.stations.length).padStart(3)} stops  ${l.name}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
