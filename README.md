# MetroMaps India

An interactive map of Indian metro networks. The home page shows Mumbai — every
line, every station, coloured and status-tagged — on a quiet basemap that lets the
network do the talking.

- **Basemap:** [OpenFreeMap](https://openfreemap.org) Positron (vector tiles, no API
  key, no request limits)
- **Renderer:** [MapLibre GL JS](https://maplibre.org)
- **Network data:** OpenStreetMap, fetched via Overpass into a versioned JSON file
- **App:** React + TypeScript + Vite, served by a small Express server

## Requirements

- Node.js 20 or newer (developed on Node 24)
- npm 10+

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Script              | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload                       |
| `npm run build`     | Type-check, then bundle into `dist/`                  |
| `npm run preview`   | Serve the production build locally (port 4173)        |
| `npm start`         | Serve `dist/` with the Express server (port `$PORT`)  |
| `npm run typecheck` | TypeScript only, no build                             |
| `npm run data:fetch`| Rebuild `src/data/mumbai-metro.json` from OSM         |

## Project layout

```
index.html                     Vite entry point
src/
  main.tsx                     React bootstrap + MapLibre CSS
  App.tsx                      Page shell (header, map, legend)
  components/MumbaiMap.tsx     MapLibre map, metro line/station layers, popups
  components/Legend.tsx        Status filters and per-line legend
  lib/metro.ts                 Types, GeoJSON builders, colour resolution
  data/mumbai-metro.json       Generated network dataset (committed)
  index.css                    Global styles
scripts/fetch-osm-metro.mjs    Overpass fetch + normalisation
server.js                      Express static server + SPA fallback
vite.config.ts, tsconfig.json
```

## How the map is built

The metro network is **not** baked into tiles. It is a GeoJSON source layered on
top of the basemap, which keeps station coordinates exact and lets each line be
styled, filtered and updated independently.

Layer stack, bottom to top:

1. `metro-lines-casing` — white 5–14 px halo so lines stay readable over any basemap
2. `metro-lines-operational` — solid, line colour
3. `metro-lines-construction` — dashed
4. `metro-lines-planned` — dotted, 60% opacity
5. `metro-stations` — white dot with a coloured ring, ringed again at interchanges
6. `metro-station-labels` — shown from zoom 13, so the map stays clean at city scale

The legend's status chips toggle layer visibility, and station dots are filtered to
match, so hiding "under construction" hides its stations too.

### Changing the map

- **Centre / zoom:** `CENTER` and `ZOOM` in `src/components/MumbaiMap.tsx`
- **Basemap:** `STYLE_URL` — swap `positron` for `liberty`, `bright` or `dark` from
  `https://tiles.openfreemap.org/styles/<name>`
- **Line colours:** OSM `colour` tags win; `LINE_COLOURS` in `src/lib/metro.ts` is
  the fallback palette keyed by line number

## The data pipeline

```bash
npm run data:fetch
```

`scripts/fetch-osm-metro.mjs` queries Overpass for:

- `route=subway` relations, including `route=construction` and `construction:route=subway`
- subway station nodes

It stitches the ordered way members of each route into a single polyline, keeps the
longer of the two directions, clusters stops into stations (same name, within 2 km)
so interchanges are detected across lines, and writes `src/data/mumbai-metro.json`.
The raw Overpass response is kept in `scripts/out/osm-raw.json` for debugging.

### Known gaps in the OSM data

OSM tagging for Mumbai is uneven. `scripts/fetch-osm-metro.mjs` carries an explicit
curation table (`DROP_OSM_IDS`, `STATUS_OVERRIDES`, `REF_OVERRIDES`,
`LABEL_OVERRIDES`) that:

- drops Line 11 (no stations mapped yet) and two duplicate route masters
- relabels OSM's `ref=2` as **2A** (Dahisar East ↔ Andheri West)
- forces 2B and 9 to **under construction**, which OSM does not tag
- names the unnamed route relations (Line 4, 5, 6, Navi Mumbai Line 1)

Still missing: Line 5 has no station nodes, and Line 2B is only mapped between
Chembur and Mandale — the DN Nagar–Chembur section is not a separate route
relation. Both are worth sourcing from MMRDA/MMRCL alignment drawings.

**Statuses and station coordinates are only as good as OSM.** Before publishing,
cross-check against the operator's own maps.

## Deploying

The build output in `dist/` is fully static:

- **Vercel / Netlify / Cloudflare Pages:** build command `npm run build`,
  output directory `dist`.
- **Render / Railway / Fly.io / a VPS:** run `npm run build` then `npm start`.
  The Express server reads `PORT` and serves `dist/` with an SPA fallback.

No tile API keys are needed, so there is nothing to configure in the environment.

## Next steps

- Add routing and a city switcher (Delhi, Bengaluru, Chennai…)
- Per-line detail panel: opening date, operator, station list
- Search a station and fly to it
- Replace straight segments between stops with true alignments once verified
  geometry is available
