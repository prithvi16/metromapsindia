# MetroMaps India

An interactive atlas of urban rail in India — metro, suburban rail, monorail, light
rail, regional rapid rail, trams and funiculars — drawn from OpenStreetMap.

- **Home page:** every city in the index, with a generated SVG sketch of its network and
  headline stats.
- **City pages:** the full network on an OpenFreeMap Positron basemap, with layer filters
  for mode and construction status. Neighbouring cities stay on the map, so zooming out
  of Delhi reveals Noida and Gurugram; pan onto another network to see its stations.
- **About page:** history, mode glossary and data provenance.

## Stack

| Piece | Choice |
| --- | --- |
| Basemap | [OpenFreeMap](https://openfreemap.org) Positron — vector tiles, no API key |
| Renderer | MapLibre GL JS 5 |
| App | React 19 + TypeScript + Vite 8, `react-router-dom` |
| Data | OpenStreetMap via Overpass, pre-built into per-city JSON |
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
    SiteHeader.tsx            Brand + breadcrumbs + nav
    SiteFooter.tsx            All cities, about, attribution
  lib/
    cities.ts                 Types, mode metadata, GeoJSON builders
    cityData.ts               Index + lazy per-city loading
  data/cities/
    index.json                Registry, stats and previews (small, eager)
    all.json                  Every city's lines + stations (one lazy chunk)
scripts/
  cities.mjs                  Hand-maintained city registry (bounds, stats, patterns)
  fetch-rail.mjs              Overpass fetch with per-city cache
  build-cities.mjs            Normalisation, curation, previews, index
  lib/overpass.mjs            Overpass client + geometry helpers
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
   funicular, and the `route=train` / `route=ferry` relations whose `network` looks like
   suburban rail, RRTS or water metro.
2. **Assign** (`build-cities.mjs`) — relations are matched to a city by `network` tag,
   with a proximity fallback. Satellite systems are matched first so "Navi Mumbai Metro"
   never lands in Mumbai.
3. **Normalise** — ordered ways are stitched into polylines, duplicate directions are
   collapsed, stop positions are clustered into stations (same name, within 2 km), and
   unnamed termini inherit the relation's `from` / `to` names.
4. **Curate** — `CURATION` in `build-cities.mjs` holds per-city fixes for OSM tagging
   gaps (dropped duplicate route masters, status overrides, line renumbering).
5. **Build** — geometry is simplified (~5 m), per-city JSON is written, and the index
   gets stats, `minZoom` and an SVG preview projected with Web Mercator.

### Coverage

OSM completeness varies a lot. Cities with no usable relations are marked
`coverage: "none"` and appear as "Coming soon" cards; cities with fewer mapped stations
than ~60% of the official count are marked `partial` and say so on the page.

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
- Basemap © OpenFreeMap, built on OpenMapTiles.
- Network figures and history from Wikipedia, CC BY-SA 4.0.
