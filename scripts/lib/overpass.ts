import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OsmResponse } from "./osm";

const ENDPOINTS = [
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type OverpassResult = { data: OsmResponse; endpoint: string };

export async function overpass(
  query: string,
  { label = "query", attempts = 10 }: { label?: string; attempts?: number } = {},
): Promise<OverpassResult> {
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
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(150_000),
      });
      const text = await res.text();
      if (res.ok && text.trim().startsWith("{")) {
        const json = JSON.parse(text) as OsmResponse;
        console.log(`  ${label}: ok via ${new URL(endpoint).host}`);
        return { data: json, endpoint };
      }
      console.log(`  ${label}: attempt ${attempt} got ${res.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ${label}: attempt ${attempt} failed (${message})`);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 45_000);
  }
  throw new Error(`${label}: Overpass failed after ${attempts} attempts`);
}

type CacheMeta = {
  schemaVersion: 1;
  queryHash: string;
  fetchedAt: string;
  endpoint: string;
  label: string;
  elements: number;
};

function queryHash(query: string): string {
  return createHash("sha256").update(query).digest("hex").slice(0, 16);
}

/**
 * Read a cached Overpass response, or fetch and cache it.
 *
 * The cache carries a hash of the query that produced it. Change a city's
 * bounds or the query text and the next fetch automatically invalidates the old
 * cache instead of silently serving stale data.
 */
export async function cachedQuery(
  cachePath: string,
  query: string,
  { label = "query", force = false }: { label?: string; force?: boolean } = {},
): Promise<OsmResponse> {
  const metaPath = `${cachePath}.meta.json`;
  const hash = queryHash(query);

  if (!force) {
    try {
      const [text, metaText] = await Promise.all([
        readFile(cachePath, "utf8"),
        readFile(metaPath, "utf8"),
      ]);
      const meta = JSON.parse(metaText) as CacheMeta;
      if (meta.queryHash === hash) {
        console.log(`  ${label}: cache hit (${meta.fetchedAt})`);
        return JSON.parse(text) as OsmResponse;
      }
      console.log(`  ${label}: cache is stale (query changed), refetching`);
    } catch {
      // Not cached yet, or an old cache without metadata.
    }
  }

  const { data, endpoint } = await overpass(query, { label });
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data), "utf8");
  const meta: CacheMeta = {
    schemaVersion: 1,
    queryHash: hash,
    fetchedAt: new Date().toISOString(),
    endpoint,
    label,
    elements: data.elements?.length ?? 0,
  };
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return data;
}
