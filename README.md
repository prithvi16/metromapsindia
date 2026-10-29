# MetroMaps India

An interactive atlas of urban rail in India — metro, suburban rail, monorail, light
rail, regional rapid rail, trams and funiculars. Metro and light-rail lines come
from OpenStreetMap; suburban networks are imported from the India Rail Info atlas
and drawn as one uniform teal line.

- **Home page:** every city in the index, with a generated SVG sketch of its network and
  headline stats. Mapped totals and official Wikipedia figures are labelled separately.
- **City pages:** the full network on an OpenFreeMap Positron basemap, with layer filters
  for mode and construction status. Neighbouring cities stay on the map, so zooming out
  of Delhi reveals Noida and Gurugram; pan onto another network to see its stations.
  Filters, map position and selected lines are shareable through the URL.
- **Search (⌘K):** jump to any city, line or station; a station link flies to the
  platform, a line link fits the corridor and reveals its mode.
- **About page:** history, mode glossary and data provenance.

## Stack

| Piece | Choice |
| --- | --- |
| Basemap | [OpenFreeMap](https://openfreemap.org) Positron — vector tiles, no API key |
| Renderer | MapLibre GL JS 5 |
| App | React 19 + TypeScript + Vite 8, `react-router-dom` |
| Data | OpenStreetMap via Overpass + India Rail Info atlas for suburban, pre-built into per-city JSON |
| Server | Express static server with SPA fallback |

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then bundle into `dist/` |
| `npm run preview` | Serve the production build locally (port 4173) |
| `npm start` | Serve `dist/` with Express (port `$PORT`) |
| `npm run typecheck` | TypeScript only |
| `npm run data:fetch` | Fetch raw OSM data for every city (cached) |
| `npm run data:iri` | Fetch India Rail Info atlas tiles for a city (`-- --city=mumbai`) |
| `npm run data:suburban` | Assemble suburban manifests into preview GeoJSON |
| `npm run data:build` | Rebuild `src/data/cities/` from the cache |
| `npm run data:refresh` | Fetch + build in one go |

## Project layout

```
index.html
src/
  main.tsx                    React bootstrap + MapLibre CSS
  App.tsx                     Router: /, /city/:slug, /about
  pages/
    HomePage.tsx              Hero, region tabs, city cards with SVG previews
    CityPage.tsx              Map, legend, stats, coverage notes
    AboutPage.tsx             History, modes, sources
  components/
    CityMap.tsx               MapLibre map, rail layers, filters, popups
    Legend.tsx                Mode / status / per-line toggles
    SearchDialog.tsx          ⌘K search across cities, lines and stations
    SiteHeader.tsx            Brand + breadcrumbs + search + nav
    SiteFooter.tsx            All cities, about, attribution
  lib/
    cities.ts                 Types, mode metadata, GeoJSON builders
    cityData.ts               Index + lazy per-city loading
    meta.ts                   Per-route title / description / OG tags
  data/cities/
    index.json                Registry, stats and previews (small, eager)
    all.json                  Every city's lines + stations (one lazy chunk)
scripts/
  cities.mjs                  Hand-maintained city registry (bounds, stats, patterns)
  fetch-rail.mjs              Overpass fetch with per-city cache
  fetch-iri.mjs               India Rail Info atlas tile extractor
  build-suburban.mjs          Suburban manifest assembler (preview)
  build-cities.mjs            Normalisation, curation, previews, index
  suburban/<slug>.json        Which IRI tracks form each suburban corridor
  lib/overpass.mjs            Overpass client + geometry helpers
  lib/suburban.mjs            Manifest + IRI tracks → CityLine records
```

## How the map is built

Each city's lines are a GeoJSON source on top of the basemap — never baked into tiles —
so stations stay at exact coordinates and every line can be styled and filtered
independently.

Two visual channels keep eight modes readable at once:

- **Dash pattern = status** — solid operational, dashed under construction, dotted planned.
- **Width, casing and overlay = mode** — RRTS is widest with a white centre stripe,
  metro next, monorail and light rail get segmented white overlays, tram and funicular
  are thin and dotted.

The legend exposes all three axes: mode chips, status chips, and a per-line eye toggle
grouped by system. Filters compose, and station dots follow the mode and status filters.

### One map, many cities

Every city's lines live in a single GeoJSON source, tagged with a `city` slug. The city
page opens framed on its own network and renders it at full strength; other cities are
drawn faintly behind it. Zoom out and they become legible, pan across and their stations
appear from zoom 11. Clicking another city's line or station opens that city's page, and
a "Nearby network" chip appears when the viewport drifts into a neighbour.

Each city has generated `bounds` (a tight box around its drawn network, not the
municipal boundary) and a `minZoom`. The map itself allows zooming out to a national
level — `minZoom: 4.6`, `maxBounds` set to India — so you can travel between networks
without leaving the map.

### Defaults

Suburban rail and water metro start hidden — Mumbai's suburban network alone is 450 km
and would bury the metro at city zoom. Every other mode is on by default, and one click
brings the rest back.

## The data pipeline

```bash
npm run data:refresh
```

1. **Fetch** (`fetch-rail.mjs`) — one Overpass query per city region, cached under
   `scripts/out/raw/<slug>.json`. Queries cover subway, light rail, monorail, tram,
   funicular, `route=construction` relations and construction-tagged station nodes, plus
   the `route=train` / `route=ferry` relations whose `network` looks like suburban rail,
   RRTS or water metro.
2. **Assign** (`build-cities.mjs`) — relations are matched to a city by `network` tag,
   with a proximity fallback. Satellite systems are matched first so "Navi Mumbai Metro"
   never lands in Mumbai.
3. **Normalise** — ordered ways are stitched into polylines, duplicate directions are
   collapsed, stop positions are canonicalised into stations (line-name suffixes and
   operator aliases removed, same name within 1–1.5 km), and
   unnamed termini inherit the relation's `from` / `to` names.
4. **Curate** — `CURATION` in `build-cities.mjs` holds per-city fixes for OSM tagging
   gaps (dropped duplicate route masters, status overrides, line renumbering).
5. **Build** — geometry is simplified (~5 m), per-city JSON is written, and the index
   gets stats, `minZoom` and an SVG preview projected with Web Mercator.
6. **Suburban import** — for cities with a `scripts/suburban/<slug>.json` manifest,
   India Rail Info atlas tiles supply the tracks and stations. The manifest groups
   track segments into named corridors; `build-cities.mjs` drops that city's OSM
   suburban relations and appends the IRI network. Every suburban line is forced to
   one colour (`#0f766e`) and one solid stroke, so the commuter network reads as a
   single layer.

### Cleaning up the data

OSM gaps are found and fixed with three tools:

```bash
npm run data:gaps                       # prioritised list of gaps, all cities
npm run data:gaps -- --city=mumbai      # one city
npm run data:geocode -- --city=mumbai --names="DN Nagar,ESIC Nagar"
```

`scripts/report-gaps.mjs` flags under-construction lines with no stations, stations
more than 2 km from their own line, broken geometry and coverage shortfalls.

Fixes live in `scripts/curation/<slug>.json` — hand-checked patches with a `sources`
array, merged over the OSM data by `npm run data:build`. See
`scripts/curation/README.md` for the schema.

The **transit-curator** subagent (`.opencode/agents/transit-curator.md`) automates the
research loop: read the gap report, open operator documents, geocode station names,
write the patch, rebuild, and re-check the gap. It can only edit `scripts/curation/`,
so it cannot change the app. Ask for it with:

```text
Use the transit-curator subagent on Mumbai — the under-construction lines are missing stations.
```

The **iri-suburban** subagent (`.opencode/agents/iri-suburban.md`) imports a city's
suburban network from the India Rail Info atlas. It downloads the atlas tiles, picks
the suburban corridors out of the national track layer, fetches full-resolution track
geometry through the atlas page, writes `scripts/suburban/<slug>.json`, and rebuilds.

```text
Use the iri-suburban subagent on Kolkata.
```

### Suburban manifests

`scripts/suburban/<slug>.json` records which IRI trackids form each corridor:

```json
{
  "build": "1793079041",
  "checkedAt": "2026-10-29",
  "lines": [
    { "id": "western", "name": "Western Line", "from": "Churchgate", "to": "Virar",
      "status": "operational", "tracks": ["914.1", "955.1", "7.321"] }
  ]
}
```

Run `npm run data:iri -- --city=<slug>` to refresh the tiles, then
`npm run data:suburban -- --city=<slug>` to preview the assembled network.

### Coverage

OSM completeness varies a lot. Cities with no usable relations are marked
`coverage: "none"` and appear as "Coming soon" cards; cities with fewer mapped stations
than ~60% of the official count are marked `partial` and say so on the page.

`counts.*` in the index describe what is actually drawn (including IRI suburban);
`stats.*` stay the official Wikipedia figures for lines, stations, length, opening
date and ridership. The km figure is **line-km**: a corridor shared by two services
(for example Howrah–Barddhaman and Howrah–Katwa) counts once per route. The index also lists four announced systems — Surat (2027),
Bhubaneswar (2028), Visakhapatnam (2029) and Coimbatore (TBD) — as coming-soon
cards, so the "every operational line" claim is explicit rather than overstated.

Figures for lines, stations, length, opening date and ridership come from Wikipedia's
["Urban rail transit in India"](https://en.wikipedia.org/wiki/Urban_rail_transit_in_India)
(CC BY-SA 4.0), as of October 2026.

## Deploying

`dist/` is fully static:

- **Vercel / Netlify / Cloudflare Pages:** build `npm run build`, output `dist`.
- **Render / Railway / Fly.io / a VPS:** `npm run build && npm start` — Express reads
  `PORT` and serves `dist/` with an SPA fallback.

No tile keys or environment variables are required.

## Attribution

- Map data © OpenStreetMap contributors, ODbL.
- Suburban linework and station coordinates © India Rail Info (atlas), used here with
  attribution. The atlas has no open-data licence; permission is required before
  redistributing derived data publicly.
- Basemap © OpenFreeMap, built on OpenMapTiles.
- Network figures and history from Wikipedia, CC BY-SA 4.0.
