import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ENDPOINTS = [
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function overpass(query, { label = "query", attempts = 10 } = {}) {
  let delay = 4000;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const endpoint = ENDPOINTS[(attempt - 1) % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "metromapsindia/0.2 (development)",
        },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(150_000),
      });
      const text = await res.text();
      if (res.ok && text.trim().startsWith("{")) {
        const json = JSON.parse(text);
        console.log(`  ${label}: ok via ${new URL(endpoint).host}`);
        return json;
      }
      console.log(`  ${label}: attempt ${attempt} got ${res.status}`);
    } catch (err) {
      console.log(`  ${label}: attempt ${attempt} failed (${err.message})`);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 45000);
  }
  throw new Error(`${label}: Overpass failed after ${attempts} attempts`);
}

/** Read a cached Overpass response, or fetch and cache it. */
export async function cachedQuery(cachePath, query, opts) {
  try {
    const text = await readFile(cachePath, "utf8");
    return JSON.parse(text);
  } catch {
    // not cached yet
  }
  const data = await overpass(query, opts);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data), "utf8");
  return data;
}

/** Merge `out body` (tagged) and `>` (skeleton) duplicates without losing tags. */
export function indexElements(elements) {
  const nodes = new Map();
  const ways = new Map();
  const relations = [];

  for (const el of elements) {
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
  return { nodes, ways, relations };
}

/** Distance in km between two {lat, lon} points. */
export function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
