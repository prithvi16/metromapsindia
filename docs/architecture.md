# Architecture

## App

React 19 + TypeScript + Vite, `react-router-dom`, MapLibre GL 5, and
OpenFreeMap Positron for the basemap. There is no server-side rendering: the
Express server only serves the static build with an SPA fallback.

Routes:

- `/` — city cards, region filter, generated SVG network sketches.
- `/city/:slug` — MapLibre map, layer filters, stats, coverage notes.
- `/about` — history, mode glossary, provenance.

## Data loading

The committed data lives under `src/data/cities/`:

```text
index.json         26 summaries, stats, neighbours, SVG previews (eager)
search.json        compact names/modes/coords for the ⌘K dialog (lazy)
shards/<slug>.json full geometry + stations for one city (lazy)
```

`src/lib/cityData.ts` validates `index.json` with `CityIndexSchema`, then uses
`import.meta.glob` to map each slug to its own Vite chunk. A city page loads its
own shard plus the `neighbours` listed in the index. Neighbours are precomputed
at build time from bounding-box proximity (0.6° gap, max 6), so Delhi loads
Gurugram/Noida/Meerut and Mumbai loads Navi Mumbai plus the HSR corridor — not
the whole country.

`search.json` is loaded only when the search dialog opens. It contains a
precomputed lowercase `haystack` per line/station, so searching does not require
geometry.

Every generated file is parsed with Zod at its boundary (`shared/schema.ts`).
`npm run validate:data` does the same offline in CI.

## Map

Each city's lines are a GeoJSON source over the basemap, never baked into tiles.
All city lines are tagged with a `city` slug. The current city draws at full
strength; loaded neighbours draw faintly and become interactive when zoomed.

Two visual channels keep nine modes readable:

- **Dash pattern = status** — solid operational, dashed under construction,
  dotted planned.
- **Width, casing and overlay = mode** — RRTS is widest with a white centre
  stripe, metro next, monorail/light rail get segmented overlays, tram/funicular
  are thin and dotted.

The legend exposes mode, status and per-line toggles. Filters, map position and
a selected line are shareable through the URL.

## Type contract

`shared/schema.ts` is the only definition of the data shape. It exports:

- generated-data schemas: `CityIndex`, `CityData`, `CityLine`, `CityStation`,
  `SearchIndex`, `CitySummary`
- input schemas: `CurationPatch`, `SuburbanManifest`
- mode/status/region literals and labels

The app imports the inferred types; the pipeline imports the types and parses
output with the schemas. A field added on one side fails the other side's type
check or data validation.

## Why shards

A single all-cities file is ~0.6 MB today and grows linearly with the number of
cities. Sharding keeps a city page to its own network plus a few neighbours,
lets Vite cache each city independently, and makes per-city builds possible
without rewriting every other city's data.
