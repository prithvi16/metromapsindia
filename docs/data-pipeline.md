# Data pipeline

The pipeline is TypeScript, run through `tsx`. It reads a local cache and writes
committed data; it never edits source by hand.

```bash
npm run data:fetch -- --only=mumbai   # Overpass -> scripts/out/raw/mumbai.json
npm run data:build -- --city=mumbai   # one shard + index + search
npm run data:build                    # every city with a raw cache
npm run validate:data                 # schemas, no network
```

## Stages

### 1. Fetch — `scripts/fetch-rail.ts`

One Overpass query per city region (or a direct relation for MAHSR), cached under
`scripts/out/raw/<slug>.json`. Each cache file has a sidecar
`<slug>.json.meta.json` with `queryHash`, `fetchedAt`, endpoint and element
count. If the query or city bounds change, the hash changes and the next fetch
automatically refetches instead of serving stale data.

Failures are collected: any failed city makes the process exit non-zero. A
partial `data:refresh` can no longer look successful.

### 2. Assign — `scripts/build/assign.ts`

Relations are matched to a city by `network`/`name`/`operator` patterns in
`scripts/cities.ts`, satellites first (Navi Mumbai before Mumbai). If no pattern
matches, the first stop's coordinates fall back to the containing city box.

### 3. Normalise — `scripts/build/normalize.ts`

- Ordered way members are stitched into polylines; disconnected stretches stay
  separate.
- Duplicate directions collapse to the longest geometry.
- Stop positions are canonicalised into stations: line-name suffixes and
  operator aliases removed, same name within 1–1.5 km clustered.
- Unnamed termini inherit the relation's `from`/`to`.
- `dropOsmIds`, `refOverrides` and `statusOverrides` from the city's curation
  patch are applied here.

### 4. Curate — `scripts/build/curate.ts`

`scripts/curation/<slug>.json` is parsed with `CurationPatchSchema`, then
applied: status/colour/termini overrides, station replacement or append, added
lines and drop rules. Unknown matches and out-of-bounds stations are warnings,
not silent skips. See `docs/curation.md`.

### 5. Suburban import — `scripts/lib/suburban.ts`

Cities with `scripts/suburban/<slug>.json` replace their OSM `route=train`
suburban lines with corridors assembled from India Rail Info tracks. The
manifest is validated with `SuburbanManifestSchema`; the assembler emits
`CityLine` records and warnings for missing geometry or too few stations.

### 6. Finalise — `scripts/build/finalize.ts`

Geometry is simplified to ~5 m, stations are clustered into one dot per
interchange, counts/coverage/bounds/minZoom/preview are computed, and the result
is parsed with `CityDataSchema` before it can reach disk.

### 7. Write — `scripts/build/dataset.ts`

- Each rebuilt city is written to `src/data/cities/shards/<slug>.json` through a
  temporary file + rename.
- `index.json` is rebuilt from every shard that exists. Cities not rebuilt keep
  their previous shard, so `--city=...` never blanks the rest of the dataset.
- `search.json` is rebuilt from the same data.
- `neighbours` are computed from bounding boxes.
- A shrink guard refuses to drop more than half the stations or any mapped city
  unless `--allow-shrink` is passed.

### 8. Validate — `scripts/validate-data.ts`

Parses the index, search file, every shard, every curation patch and every
suburban manifest. Checks that mapped cities have shards, neighbours exist, and
search entries point at real cities. Runs in CI via `npm run check`.

## Guards

| Guard                           | Protects against                            |
| ------------------------------- | ------------------------------------------- |
| No raw cache -> error           | A fresh worktree writing an empty dataset   |
| `--city` missing cache -> error | An agent "rebuilding" without fetching      |
| Missing city reuses its shard   | Partial fetches deleting other cities       |
| Shrink guard                    | A bad/partial build replacing healthy data  |
| Schema parse before write       | Shape drift between pipeline and app        |
| Warnings fail the build         | Unmatched patches and broken IRI corridors  |
| Cache query hash                | Stale Overpass results after a query change |

`--allow-warnings` and `--allow-shrink` are escape hatches for deliberate work,
not for making a bad build pass. Say why in the PR if you use one.

## Per-city builds

`npm run data:build -- --city=mumbai` loads that city's raw cache, assigns
relations with the global pattern list, normalises and finalises only Mumbai,
then rebuilds the index/search from all existing shards. Two agents can work on
two cities without touching the same shard.
