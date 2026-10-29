# MetroMaps India

A small web app that renders Indian cities on an interactive
[OpenStreetMap](https://www.openstreetmap.org). The home page currently shows Mumbai.

Built with **React + TypeScript + Vite**, mapped with **Leaflet** (`react-leaflet`),
and served in production by a tiny **Express** server.

## Requirements

- Node.js 20 or newer (developed on Node 24)
- npm 10+

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Script            | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Vite dev server with hot reload                          |
| `npm run build`   | Type-check, then bundle into `dist/`                     |
| `npm run preview` | Serve the production build locally (Vite, port 4173)     |
| `npm start`       | Serve `dist/` with the Express server (port `$PORT`)     |
| `npm run typecheck` | TypeScript only, no build                              |

## Project layout

```
index.html                 Vite entry point
src/
  main.tsx                 React bootstrap, imports Leaflet CSS
  App.tsx                  Page shell (header + map area)
  components/MumbaiMap.tsx Map container, tiles and landmark markers
  index.css                Global styles
server.js                  Express static server + SPA fallback
vite.config.ts             Vite config
```

## Changing the map

- **Centre / zoom:** `MUMBAI_CENTER` and `MUMBAI_ZOOM` in
  `src/components/MumbaiMap.tsx`.
- **Markers:** add to the `LANDMARKS` array in the same file.
- **Tiles:** swap the `<TileLayer url>` for another provider (MapTiler, Stadia,
  Thunderforest, …). The public `tile.openstreetmap.org` endpoint is fine for
  development, but its [usage policy](https://operations.osmfoundation.org/policies/tiles/)
  forbids heavy production traffic.

## Deploying

The build output in `dist/` is fully static, so any static host works:

- **Vercel / Netlify / Cloudflare Pages:** build command `npm run build`,
  output directory `dist`.
- **Render / Railway / Fly.io / a VPS:** run `npm run build` then `npm start`.
  The Express server reads `PORT` from the environment and serves `dist/`
  with an SPA fallback.
- **Docker:** a minimal image only needs `npm ci --omit=dev` plus a build stage;
  add one when a target platform is picked.

## Next steps

- Add routing (`react-router`) and a city switcher.
- Pull POIs from the Overpass API instead of hard-coded landmarks.
- Add search and geolocation.
