/**
 * Normalise the cached OSM responses into one dataset per city plus an index
 * with stats and SVG previews.
 *
 * Usage: node scripts/build-cities.mjs
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES, MODES, STATUSES } from "./cities.mjs";
import { haversine, indexElements } from "./lib/overpass.mjs";
import { assembleSuburban } from "./lib/suburban.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawDir = path.join(__dirname, "out", "raw");
const curationDir = path.join(__dirname, "curation");
const outDir = path.join(root, "src", "data", "cities");

const MODE_COLOURS = {
  metro: "#e11d48",
  suburban: "#0f766e",
  rrts: "#7c3aed",
  monorail: "#ea580c",
  light_rail: "#2563eb",
  tram: "#b45309",
  funicular: "#0e7490",
  water_metro: "#0284c7",
};

/** Per-city fixes for known OSM tagging problems. */
const CURATION = {
  mumbai: {
    dropOsmIds: new Map([
      [19233909, "Line 11 has no stations mapped"],
      [7898712, "route master for all of Line 2, overlaps 2A and 2B"],
      [7898769, "duplicate of operational Line 7"],
    ]),
    refOverrides: new Map([["2", "2A"]]),
    statusOverrides: new Map([
      ["2B", "under-construction"],
      ["9", "under-construction"],
    ]),
  },
};

const NAMED_COLOURS = {
  aqua: "#00a3a1",
  blue: "#1f6feb",
  green: "#2e9e4f",
  orange: "#ef7c1a",
  pink: "#ec4899",
  purple: "#7c5cff",
  red: "#e63946",
  yellow: "#f0b429",
  violet: "#7c5cff",
  magenta: "#c026d3",
  grey: "#64748b",
  gray: "#64748b",
};

/** Light colours disappear on a pale basemap; darken anything above 82% luminance. */
function ensureContrast(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance <= 0.82) return hex;
  const scale = 0.72;
  const to = (value) =>
    Math.round(value * scale).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function colourFor(tags, mode) {
  const raw = (tags.colour ?? tags.color ?? "").trim().toLowerCase();
  if (/^#([0-9a-f]{6})$/.test(raw)) return ensureContrast(raw);
  if (/^#([0-9a-f]{3})$/.test(raw)) {
    const [r, g, b] = raw.slice(1).split("");
    return ensureContrast(`#${r}${r}${g}${g}${b}${b}`);
  }
  if (NAMED_COLOURS[raw]) return NAMED_COLOURS[raw];
  return MODE_COLOURS[mode] ?? "#64748b";
}

function modeFor(tags) {
  const net = `${tags.network ?? ""} ${tags.name ?? ""}`;
  if (/\b(rrts|rapidx|namo bharat|rapid rail)\b/i.test(net)) return "rrts";
  const route =
    tags.route === "construction"
      ? (tags.construction ?? tags["construction:route"] ?? "")
      : (tags["construction:route"] ?? tags.route);
  if (route === "subway") return "metro";
  if (route === "train") return /\b(rrts|namo bharat|rapid rail)\b/i.test(net) ? "rrts" : "suburban";
  if (route === "ferry") return "water_metro";
  if (route === "light_rail") return "light_rail";
  if (route === "monorail") return "monorail";
  if (route === "tram") return "tram";
  if (route === "funicular") return "funicular";
  return "metro";
}

function statusFor(tags) {
  if (tags.route === "construction") return "under-construction";
  if (tags.state === "construction" || tags.construction || tags["construction:route"]) {
    return "under-construction";
  }
  if (tags.state === "proposed" || tags.proposed) return "planned";
  if (tags.opening_date && new Date(tags.opening_date) > new Date()) return "under-construction";
  return "operational";
}

/** Join the ordered way members of a route relation into one polyline. */
function stitchGeometry(relation, ways, nodes) {
  const segments = [];
  for (const member of relation.members) {
    if (member.type !== "way") continue;
    const way = ways.get(member.ref);
    if (!way?.nodes) continue;
    const coords = way.nodes
      .map((id) => nodes.get(id))
      .filter(Boolean)
      .map((n) => [n.lat, n.lon]);
    if (coords.length >= 2) segments.push(coords);
  }
  if (!segments.length) return [];

  // Keep disconnected stretches as separate polylines instead of joining them
  // with a straight line across the map.
  const lines = [];
  let current = [...segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const last = current[current.length - 1];
    const head = seg[0];
    const tail = seg[seg.length - 1];
    const dHead = haversine({ lat: head[0], lon: head[1] }, { lat: last[0], lon: last[1] });
    const dTail = haversine({ lat: tail[0], lon: tail[1] }, { lat: last[0], lon: last[1] });
    if (dTail < dHead) seg.reverse();

    if (Math.min(dHead, dTail) > 0.25) {
      lines.push(current);
      current = [...seg];
      continue;
    }

    const [firstLat, firstLon] = seg[0];
    if (Math.abs(firstLat - last[0]) < 1e-7 && Math.abs(firstLon - last[1]) < 1e-7) seg.shift();
    current.push(...seg);
  }
  lines.push(current);
  return lines.filter((line) => line.length >= 2);
}

/** Douglas–Peucker, squared-distance variant, tolerance in degrees. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDistSq(points[i], points[first], points[last]);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (maxSq > sq && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function segDistSq(p, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/**
 * Station names arrive from different operators: "Anand Vihar (Blue Line)",
 * "Dahisar (East) [Line 2]", "Andheri L1", "Vikhroli Station". Canonicalise
 * them before clustering so one physical interchange becomes one dot.
 */
const STATION_ALIASES = new Map([
  ["chitpur", "kolkata"],
  ["new garia", "kavi subhash"],
  ["yeshwantpur", "yesvantpur"],
  ["belgatchia", "belgachia"],
  ["poonamalle bypass", "poonamallee bypass"],
  ["dum dum cantt", "dum dum cantonment"],
  ["central metro", "mgr central"],
  ["chennai central", "mgr central"],
  ["mgr chennai ctrl", "mgr central"],
  ["csm terminus", "mumbai csmt"],
  ["chhatrapati shivaji maharaj terminus", "mumbai csmt"],
  ["csmt", "mumbai csmt"],
]);

const STATION_DISPLAY = new Map([
  ["chitpur", "Kolkata"],
  ["new garia", "Kavi Subhash"],
  ["yeshwantpur", "Yesvantpur"],
  ["belgatchia", "Belgachia"],
  ["poonamalle bypass", "Poonamallee Bypass"],
  ["dum dum cantt", "Dum Dum Cantonment"],
  ["central metro", "MGR Central"],
  ["chennai central", "MGR Central"],
  ["mgr chennai ctrl", "MGR Central"],
  ["csm terminus", "Mumbai CSMT"],
  ["chhatrapati shivaji maharaj terminus", "Mumbai CSMT"],
  ["csmt", "Mumbai CSMT"],
]);

const LINE_SUFFIX =
  /\s*\((?:[^)]*\b(line|blue|pink|magenta|yellow|red|green|violet|orange|grey|gray|aqua|west|east|north|south)\b[^)]*)\)\s*$/i;

function stationKey(value) {
  const key = value
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .replace(LINE_SUFFIX, "")
    .replace(/\s+\bL\d+\b$/i, "")
    .replace(/\b(metro|station|halt|railway)\b/gi, " ")
    .replace(/\b(jn|junction)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return STATION_ALIASES.get(key) ?? key;
}

function stationDisplay(value) {
  const cleaned = value
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .replace(LINE_SUFFIX, "")
    .replace(/\s+\bL\d+\b$/i, "")
    .replace(/\s+(station|metro)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const key = cleaned
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return STATION_DISPLAY.get(key) ?? STATION_ALIASES.get(key)?.replace(/\b\w/g, (c) => c.toUpperCase()) ?? cleaned;
}

/** Prefer a shorter, unqualified name when two records merge. */
function cleanerName(candidate, current) {
  const score = (name) => (name.includes("(") ? 2 : 0) + (name.length > 28 ? 1 : 0) + name.length / 100;
  return score(candidate) < score(current);
}

function mercator(lat, lon) {
  const x = (lon + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

/** Project operational lines into a small SVG and simplify to pixel tolerance. */
const PREVIEW_MODES = new Set(["metro", "monorail", "light_rail", "tram", "funicular", "water_metro"]);

function buildPreview(lines, width = 132, height = 84, pad = 6) {
  const operational = lines.filter(
    (l) => l.status === "operational" && l.geometry.some((segment) => segment.length > 1),
  );
  // City cards are titled after the metro system, so keep long-distance
  // suburban/RRTS corridors out of the sketch and let the metro shape read.
  const core = operational.filter((line) => PREVIEW_MODES.has(line.mode));
  const usable = core.length ? core : operational;
  if (!usable.length) return null;

  const projected = usable.flatMap((line) =>
    line.geometry.map((segment) => ({
      colour: line.colour,
      points: segment.map(([lat, lon]) => mercator(lat, lon)),
    })),
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of projected) {
    for (const [x, y] of line.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  const paths = [];
  for (const line of projected) {
    const px = line.points.map(([x, y]) => [
      offsetX + (x - minX) * scale,
      offsetY + (y - minY) * scale,
    ]);
    const simplified = simplify(px, 0.6);
    if (simplified.length < 2) continue;
    const d = simplified
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
    paths.push({ colour: line.colour, d });
  }
  return paths.length ? { width, height, paths } : null;
}

/** Tight bounds around the drawn network, padded, so the map does not open on open sea. */
function boundsFromLines(lines, fallback) {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const line of lines) {
    for (const segment of line.geometry) {
      for (const [lat, lon] of segment) {
        minLat = Math.min(minLat, lat);
        minLon = Math.min(minLon, lon);
        maxLat = Math.max(maxLat, lat);
        maxLon = Math.max(maxLon, lon);
      }
    }
  }
  if (!Number.isFinite(minLat)) return fallback;
  const padLat = Math.max((maxLat - minLat) * 0.07, 0.012);
  const padLon = Math.max((maxLon - minLon) * 0.07, 0.012);
  return [
    Number((minLon - padLon).toFixed(4)),
    Number((minLat - padLat).toFixed(4)),
    Number((maxLon + padLon).toFixed(4)),
    Number((maxLat + padLat).toFixed(4)),
  ];
}

function minZoomFor(bounds, viewportWidth = 1200) {
  const [west, south, east, north] = bounds;
  const lngSpan = Math.max(east - west, 0.02);
  const latSpan = Math.max(north - south, 0.02);
  const zLng = Math.log2((viewportWidth * 360) / (512 * lngSpan));
  const zLat = Math.log2((viewportWidth * 360 * Math.cos((((south + north) / 2) * Math.PI) / 180)) / (512 * latSpan));
  return Math.max(7.5, Math.round(Math.min(zLng, zLat) * 2) / 2 - 0.5);
}

const master = JSON.parse(
  await readFile(path.join(root, "metro-master.json"), "utf8"),
).systems;

/** Curated station names from metro-master.json, used when OSM has no name. */
function masterStations(slug) {
  const city = CITIES.find((c) => c.slug === slug);
  if (!city) return [];
  const system = master.find((s) => s.city === city.city);
  if (!system) return [];
  return system.active_lines.flatMap((line) =>
    line.stations.map((station) => ({ name: station.name, lat: station.lat, lon: station.lon })),
  );
}

async function loadCuration(slug) {
  try {
    const raw = await readFile(path.join(curationDir, `${slug}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function matchesPatch(line, match = {}) {
  if (match.ref != null && String(line.ref ?? "") !== String(match.ref)) return false;
  if (match.mode && line.mode !== match.mode) return false;
  if (
    match.nameIncludes &&
    !line.name.toLowerCase().includes(String(match.nameIncludes).toLowerCase())
  ) {
    return false;
  }
  return true;
}

function validStation(station, city, warnings, label) {
  const [west, south, east, north] = city.bounds;
  const pad = 0.6;
  if (
    !station?.name ||
    !Number.isFinite(station.lat) ||
    !Number.isFinite(station.lon)
  ) {
    warnings.push(`${label}: station needs name, lat and lon`);
    return null;
  }
  if (
    station.lat < south - pad ||
    station.lat > north + pad ||
    station.lon < west - pad ||
    station.lon > east + pad
  ) {
    warnings.push(`${label}: "${station.name}" falls outside ${city.city}`);
    return null;
  }
  return {
    name: station.name,
    lat: Number(station.lat.toFixed(6)),
    lon: Number(station.lon.toFixed(6)),
  };
}

/**
 * Apply a hand-checked patch from scripts/curation/<slug>.json. Every entry is
 * expected to carry a source URL in the file's `sources` array.
 */
function applyCuration(lines, curation, city) {
  const warnings = [];

  for (const patch of curation.lines ?? []) {
    const targets = lines.filter((line) => matchesPatch(line, patch.match));
    if (!targets.length) {
      warnings.push(`no line matched ${JSON.stringify(patch.match)}`);
      continue;
    }
    for (const line of targets) {
      if (patch.status) line.status = patch.status;
      if (patch.colour) line.colour = patch.colour;
      if (patch.from) line.from = patch.from;
      if (patch.to) line.to = patch.to;
      if (Array.isArray(patch.stations)) {
        const stations = patch.stations
          .map((station) => validStation(station, city, warnings, line.ref ?? line.name))
          .filter(Boolean);
        if (patch.stationsMode === "append") {
          const seen = new Set(line.stations.map((s) => s.name.toLowerCase()));
          for (const station of stations) {
            if (!seen.has(station.name.toLowerCase())) line.stations.push(station);
          }
        } else {
          line.stations = stations;
        }
      }
      line.curated = true;
    }
  }

  for (const add of curation.addLines ?? []) {
    const stations = (add.stations ?? [])
      .map((station) => validStation(station, city, warnings, add.name))
      .filter(Boolean);

    let geometry = add.geometry ?? [];
    if (geometry.length && typeof geometry[0][0] === "number") geometry = [geometry];
    if (!geometry.length) warnings.push(`addLines "${add.name}" has no geometry`);

    lines.push({
      osmId: add.osmId ?? `curated:${city.slug}:${add.ref ?? add.name}`,
      system: add.system ?? city.system,
      mode: add.mode ?? "metro",
      name: add.name,
      ref: add.ref ?? null,
      colour: add.colour ?? "#64748b",
      from: add.from ?? null,
      to: add.to ?? null,
      operator: add.operator ?? city.operator,
      status: add.status ?? "under-construction",
      openingDate: add.openingDate ?? null,
      geometry: geometry.map((segment) =>
        segment.map(([lat, lon]) => [Number(lat), Number(lon)]),
      ),
      stations,
      curated: true,
    });
  }

  for (const drop of curation.dropLines ?? []) {
    const before = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (matchesPatch(lines[i], drop.match)) lines.splice(i, 1);
    }
    if (lines.length === before) {
      warnings.push(`drop matched nothing: ${JSON.stringify(drop.match)}`);
    }
  }

  return { lines, warnings };
}

async function loadRaw(slug) {
  try {
    return JSON.parse(await readFile(path.join(rawDir, `${slug}.json`), "utf8"));
  } catch {
    return null;
  }
}

function patternMatchers() {
  // Satellites first: "Mumbai Metro" is a substring of "Navi Mumbai Metro".
  const order = [
    "navi-mumbai",
    "gurugram",
    "noida",
    "meerut",
    ...CITIES.map((c) => c.slug).filter(
      (s) => !["navi-mumbai", "gurugram", "noida", "meerut"].includes(s),
    ),
  ];
  const list = [];
  for (const slug of order) {
    const city = CITIES.find((c) => c.slug === slug);
    for (const pattern of city.patterns) list.push({ slug, re: new RegExp(pattern, "i") });
  }
  return list;
}

function cityForRelation(rel, matchers, citiesBySlug) {
  const text = `${rel.tags?.network ?? ""} ${rel.tags?.name ?? ""} ${rel.tags?.operator ?? ""}`;
  const hit = matchers.find(({ re }) => re.test(text));
  if (hit) return hit.slug;

  // Fall back to whichever region contains the relation's first stop.
  const stop = rel.members.find((m) => m.type === "node" && (m.role ?? "").startsWith("stop"));
  if (!stop) return null;
  const node = citiesBySlug.__nodes?.get(stop.ref);
  if (!node) return null;
  for (const city of CITIES) {
    const [west, south, east, north] = city.bounds;
    if (node.lon >= west && node.lon <= east && node.lat >= south && node.lat <= north) {
      return city.slug;
    }
  }
  return null;
}

async function main() {
  const files = new Set((await readdir(rawDir).catch(() => [])).map((f) => f.replace(/\.json$/, "")));
  const available = CITIES.filter((c) => files.has(c.slug));
  console.log(`Building ${available.length}/${CITIES.length} cities`);

  const matchers = patternMatchers();
  const assigned = new Map(); // osmId -> slug
  const results = new Map();

  // Pass 1: decide which city owns each relation.
  const raws = new Map();
  for (const city of available) {
    const raw = await loadRaw(city.slug);
    if (!raw) continue;
    raws.set(city.slug, raw);
    const { nodes } = indexElements(raw.elements);
    for (const el of raw.elements) {
      if (el.type !== "relation") continue;
      if (assigned.has(el.id)) continue;
      const slug = cityForRelation(el, matchers, { __nodes: nodes });
      if (slug) assigned.set(el.id, slug);
    }
  }

  // Pass 2: normalise each city.
  for (const city of available) {
    const raw = raws.get(city.slug);
    if (!raw) continue;
    const { nodes, ways, relations } = indexElements(raw.elements);
    const own = relations.filter((rel) => assigned.get(rel.id) === city.slug);
    const curation = CURATION[city.slug];

    const namedStations = [...nodes.values()].filter(
      (n) => n.tags?.name && (n.tags.railway === "station" || n.tags.public_transport === "station"),
    );

    function stopName(node) {
      if (node.tags?.name) return node.tags.name;
      let best = null;
      let bestDistance = 0.35;
      for (const station of namedStations) {
        const d = haversine(node, station);
        if (d < bestDistance) {
          best = station;
          bestDistance = d;
        }
      }
      return best?.tags.name ?? null;
    }

    const masterNames = masterStations(city.slug);
    const byLine = new Map();
    let dropped = 0;

    for (const rel of own) {
      if (curation?.dropOsmIds?.has(rel.id)) {
        dropped++;
        continue;
      }
      const tags = rel.tags ?? {};
      const mode = modeFor(tags);
      const geometry = stitchGeometry(rel, ways, nodes);
      if (geometry.length === 0) continue;

      const rawStops = rel.members
        .filter((m) => m.type === "node" && (m.role ?? "").startsWith("stop"))
        .map((m) => nodes.get(m.ref))
        .filter(Boolean);

      const stops = rawStops
        .map((n) => {
          let name = stopName(n);
          if (!name) {
            // Fall back to the curated master list within 500 m.
            let best = null;
            let bestDistance = 0.5;
            for (const station of masterNames) {
              const d = haversine(n, station);
              if (d < bestDistance) {
                best = station;
                bestDistance = d;
              }
            }
            name = best?.name ?? null;
          }
          return name ? { name, lat: Number(n.lat.toFixed(6)), lon: Number(n.lon.toFixed(6)) } : null;
        })
        .filter(Boolean);

      // Termini are often unnamed stop_positions; take the names from from/to.
      if (geometry.length > 0) {
        const first = geometry[0][0];
        const lastSegment = geometry[geometry.length - 1];
        const last = lastSegment[lastSegment.length - 1];
        if (tags.from && (!stops.length || stops[0].name !== tags.from)) {
          stops.unshift({
            name: tags.from,
            lat: Number(first[0].toFixed(6)),
            lon: Number(first[1].toFixed(6)),
          });
        }
        if (tags.to && (!stops.length || stops[stops.length - 1].name !== tags.to)) {
          stops.push({
            name: tags.to,
            lat: Number(last[0].toFixed(6)),
            lon: Number(last[1].toFixed(6)),
          });
        }
      }

      let ref = tags.ref ?? null;
      if (curation?.refOverrides?.has(ref)) ref = curation.refOverrides.get(ref);
      let status = statusFor(tags);
      if (curation?.statusOverrides?.has(ref)) status = curation.statusOverrides.get(ref);

      const rawName = tags.name ?? ref ?? `relation ${rel.id}`;
      const name = rawName
        .replace(/\s*=>\s*/g, " → ")
        .replace(/\s*\(u\/c\)\s*/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      const key = `${mode}|${ref ?? ""}|${name.replace(/\s*[:(].*$/, "")}`;

      const candidate = {
        osmId: rel.id,
        system: tags.network ?? city.system,
        mode,
        name,
        ref,
        colour: colourFor(tags, mode),
        from: tags.from ?? null,
        to: tags.to ?? null,
        operator: tags.operator ?? city.operator,
        status,
        openingDate: tags.opening_date ?? null,
        geometry,
        stations: stops,
      };

      const existing = byLine.get(key);
      if (!existing || totalPoints(candidate.geometry) > totalPoints(existing.geometry)) {
        byLine.set(key, candidate);
      }
    }

    // Some lines are mapped twice, once with a ref and once without. Drop the
    // ref-less duplicate when a named line already exists.
    const named = new Map();
    const deduped = [];
    for (const line of byLine.values()) {
      const key = `${line.mode}|${line.name.replace(/\s*[:(].*$/, "")}`;
      const existing = named.get(key);
      if (existing) {
        if (!line.ref && existing.ref) continue;
        if (line.ref && !existing.ref) {
          named.set(key, line);
          const index = deduped.indexOf(existing);
          if (index !== -1) deduped[index] = line;
          continue;
        }
      }
      named.set(key, line);
      deduped.push(line);
    }

    let lines = deduped.sort(
      (a, b) => MODES.findIndex((m) => m.id === a.mode) - MODES.findIndex((m) => m.id === b.mode),
    );

    const curationPatch = await loadCuration(city.slug);
    if (curationPatch) {
      const applied = applyCuration(lines, curationPatch, city);
      lines = applied.lines;
      for (const warning of applied.warnings) console.log(`    ! ${warning}`);
      if (applied.lines.some((line) => line.curated)) {
        console.log(`    · curation applied (${(curationPatch.sources ?? []).length} sources)`);
      }
    }

    // Cities with an IRI suburban manifest use that network instead of OSM's
    // route=train lines, so every corridor is drawn once in a single style.
    const suburban = await assembleSuburban(city);
    if (suburban.manifest && suburban.lines.length) {
      const before = lines.length;
      lines = lines.filter((line) => line.mode !== "suburban");
      lines.push(...suburban.lines);
      const replaced = before - lines.length + suburban.lines.length;
      console.log(
        `    · suburban: ${suburban.lines.length} IRI lines (replaced ${replaced} OSM)`,
      );
    }

    // Simplify map geometry (~5 m) to keep the files small.
    for (const line of lines) {
      line.geometry = line.geometry
        .map((segment) => simplify(segment, 0.00005))
        .filter((segment) => segment.length >= 2)
        .map((segment) =>
          segment.map(([lat, lon]) => [Number(lat.toFixed(6)), Number(lon.toFixed(6))]),
        );
    }

    // Cluster stops into stations.
    const stationIndex = new Map();
    for (const line of lines) {
      for (const stop of line.stations) {
        const key = stationKey(stop.name);
        if (!key) continue;
        const display = stationDisplay(stop.name);
        const bucket = stationIndex.get(key) ?? [];
        // Same-mode duplicates need to be close to be the same station; a
        // metro/suburban pair can sit at opposite ends of a large interchange.
        const hit = bucket.find(
          (station) => haversine(station, stop) < (station.modes.includes(line.mode) ? 1.0 : 1.5),
        );
        if (hit) {
          if (!hit.lines.includes(line.ref ?? line.name)) hit.lines.push(line.ref ?? line.name);
          if (!hit.modes.includes(line.mode)) hit.modes.push(line.mode);
          if (cleanerName(display, hit.name)) hit.name = display;
          continue;
        }
        bucket.push({
          ...stop,
          name: display,
          lines: [line.ref ?? line.name],
          modes: [line.mode],
        });
        stationIndex.set(key, bucket);
      }
    }

    const stations = [...stationIndex.values()]
      .flat()
      .sort((a, b) => a.name.localeCompare(b.name));
    const stats = city.stats;
    const coverage =
      lines.length === 0 ? "none" : stations.length < stats.stations * 0.6 ? "partial" : "full";

    const modes = [...new Set(lines.map((l) => l.mode))];
    const systemNames = [...new Set(lines.map((l) => l.system))].sort();
    // Frame the urban core, not the longest commuter corridor: an RRTS or
    // suburban line to a satellite town would zoom the page out too far.
    const coreModes = new Set(["metro", "monorail", "light_rail", "tram", "funicular"]);
    const core = lines.filter((line) => coreModes.has(line.mode));
    const viewBounds = boundsFromLines(core.length ? core : lines, city.bounds);
    const cityData = {
      slug: city.slug,
      city: city.city,
      system: city.system,
      operator: city.operator,
      region: city.region,
      bounds: viewBounds,
      minZoom: minZoomFor(viewBounds),
      coverage,
      stats,
      counts: {
        lines: lines.length,
        stations: stations.length,
        km: Number(
          lines
            .filter((l) => l.status === "operational")
            .reduce((sum, l) => sum + lineLength(l.geometry), 0)
            .toFixed(1),
        ),
        modes,
        systems: systemNames.length,
        systemNames,
      },
      lines,
      stations,
    };

    results.set(city.slug, cityData);
    console.log(
      `  ${city.slug.padEnd(12)} ${String(lines.length).padStart(2)} lines ${String(stations.length).padStart(3)} stations  ${modes.join(",") || "—"}  [${coverage}]${dropped ? ` (dropped ${dropped})` : ""}`,
    );
  }

  // Write one combined dataset (the map shows neighbouring networks when you
  // zoom out, so every city's lines live in the same source) plus the index.
  await mkdir(outDir, { recursive: true });

  const all = {
    generatedAt: new Date().toISOString(),
    lines: [...results.values()].flatMap((data) =>
      data.lines.map((line) => ({ ...line, city: data.slug })),
    ),
    stations: [...results.values()].flatMap((data) =>
      data.stations.map((station) => ({ ...station, city: data.slug })),
    ),
  };
  await writeFile(path.join(outDir, "all.json"), JSON.stringify(all) + "\n", "utf8");

  const index = {
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap contributors, ODbL 1.0 (via Overpass API)",
    cities: CITIES.map((city) => {
      const data = results.get(city.slug);
      return {
        slug: city.slug,
        city: city.city,
        system: city.system,
        operator: city.operator,
        region: city.region,
        bounds: data?.bounds ?? city.bounds,
        minZoom: data?.minZoom ?? minZoomFor(city.bounds),
        stats: city.stats,
        coverage: data?.coverage ?? "none",
        counts: data?.counts ?? {
          lines: 0,
          stations: 0,
          km: 0,
          modes: [],
          systems: 0,
          systemNames: [],
        },
        preview: data ? buildPreview(data.lines) : null,
      };
    }),
  };
  await writeFile(path.join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");

  const ready = index.cities.filter((c) => c.coverage !== "none").length;
  console.log(`\nWrote ${results.size} city files, ${ready}/${CITIES.length} with data.`);
}

function lineLength(geometry) {
  let km = 0;
  for (const segment of geometry) {
    for (let i = 1; i < segment.length; i++) {
      km += haversine(
        { lat: segment[i - 1][0], lon: segment[i - 1][1] },
        { lat: segment[i][0], lon: segment[i][1] },
      );
    }
  }
  return km;
}

function totalPoints(geometry) {
  return geometry.reduce((sum, segment) => sum + segment.length, 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
