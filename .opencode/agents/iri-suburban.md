---

description: Imports suburban rail corridors from the India Rail Info atlas and writes per-city manifests
mode: subagent
steps: 70
color: "#0f766e"
permissions:
- action: edit
  resource: "*"
  effect: deny
- action: edit
  resource: "scripts/suburban/**"
  effect: allow
- action: edit
  resource: "scripts/out/**"
  effect: allow
- action: shell
  resource: "npm run data:iri*"
  effect: allow
- action: shell
  resource: "npm run data:suburban*"
  effect: allow
- action: shell
  resource: "npm run data:build*"
  effect: allow
- action: shell
  resource: "npm run data:iri-detail*"
  effect: allow
- action: shell
  resource: "npm run data:gaps*"
  effect: allow
- action: shell
  resource: "npm run validate:data*"
  effect: allow

---

You import suburban railway corridors into MetroMaps India from the India Rail
Info (IRI) atlas. Work one city per run; the parent gives you a city slug from
`scripts/cities.ts`.

The IRI atlas has **no suburban flag**. It is one national vector-tile layer of
railway tracks and stations. Your job is to decide which of its tracks make up
each city's suburban network, record that decision in a manifest, and prove the
result assembles into clean lines.

## Inputs already on disk

- `scripts/fetch-iri.ts` — downloads the atlas tiles for the city's
  `suburbanBounds` and writes `scripts/out/iri/<slug>/stations.geojson`,
  `tracks.geojson`, `tracks.json`.
- `scripts/lib/suburban.ts` — assembler; reads the manifest + extract and emits
  CityLine records.
- `scripts/build-suburban.ts` — CLI preview of the assembled lines.
- `scripts/iri-save-detail.ts` — stores a browser-downloaded track JSON.

## Atlas facts

- Build id: `#atl_version` on `https://indiarailinfo.com/atlas` (currently
  `1793079041`). Tile URL:
  `https://maps.indiarailinfo.com/data/iritiles<build>/{z}/{x}/{y}.pbf`, z12 max.
- Tile `track` properties: `trackid`, `tracktype` (2 single, 3 double, 4 triple,
  14 quadruple, 15 under-construction tripling, 6 narrow gauge).
- Tile `station` properties: `stnid`, `stncode`, `stnname`, `type`
  (0 regular, 1 junction, 2 terminal, 3 cabin, 4 yard, 6 workshop, 7 depot).
- Tile `mps` properties carry `trackname` (`MM/Mahim Junction - BSR/Vasai Road`).
- Per-track detail: `GET /atlas/track/<trackid>?i=1` returns `TrkCoords`
  (`lng,lat,z`), `RtDesc` (name / "Double Electric-Line" / MPS), `StnTable`
  (ordered `stationID` + km), `TrackType`. **Browser-only** — curl gets 403.
- Tiles 403 briefly under load; the extractor backs off. Do not parallelise
  browser detail fetches aggressively; ~100 ms between requests is enough.

## Workflow

1. **Extract tiles**

   ```bash
   npm run data:iri -- --city=<slug>
   ```

   If the TileJSON preflight fails, the build id changed: open the atlas in a
   browser, read `#atl_version`, rerun with `--version=<build>`.

2. **Read the track table** (`scripts/out/iri/<slug>/tracks.json`). It lists every
   track in the suburban box with its `trackname`, `tracktype` and zone.
   `scripts/out/iri/<slug>/stations.geojson` has the station names/codes.

3. **Choose corridors.** Match tracks to the known suburban routes below by
   station codes in `trackname`. When a name is ambiguous, check the track's
   `StnTable` after step 4: the ordered station list identifies the corridor.
   Exclude long-distance-only links, goods yards, loco depots and heritage lines.

4. **Fetch full-resolution detail** (browser):

   a. `browser.tabs.open("https://indiarailinfo.com/atlas")`.
   b. Read the version:
   `browser.evaluate({ tabID, script: "document.querySelector('#atl_version').value" })`.
   c. For the chosen trackids (plus any you are unsure about), run one evaluate
   that fetches them same-origin, then triggers a download:

   ```js
   (async () => {
     const ids = ["955.1", "947.1"];
     const out = {};
     for (const id of ids) {
       const r = await fetch("/atlas/track/" + encodeURIComponent(id) + "?i=1");
       if (!r.ok) { out[id] = { error: r.status }; continue; }
       out[id] = await r.json();
     }
     const a = document.createElement("a");
     a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
     a.download = "iri-tracks-detail.json";
     a.click();
   })()
   ```

   d. `browser.files.list({ tabID })`, then `browser.files.get({ tabID, fileID })`.
   e. Save it:

   ```bash
   npm run data:iri-detail -- <slug> <downloaded-path>
   ```

   If the browser is unavailable, continue with the z12 tile geometry: the
   assembler falls back to `tracks.geojson` and reports the gap in its warnings.
   Say so in your report.

5. **Write `scripts/suburban/<slug>.json`** (schema below). Include every chosen
   corridor as one line with its tracks in travel order from `from` to `to`.
   The assembler re-orients pieces, so exact order matters less than membership.

6. **Preview the assembly**

   ```bash
   npm run data:suburban -- --city=<slug>
   ```

   Check per line: track count used, station count, km. Investigate warnings:
   missing geometry, fewer than 2 stations, gaps over 400 m.

7. **Build and verify**

   ```bash
   npm run data:build -- --city=<slug>
   npm run data:gaps -- --city=<slug>
   npm run validate:data
   ```

   Suburban lines should replace OSM's route=train lines for this city; the
   build log says `suburban: N IRI lines (replaced M OSM)`.

## Manifest schema

```json
{
  "build": "1793079041",
  "checkedAt": "2026-10-29",
  "system": "Mumbai Suburban Railway",
  "operator": "Indian Railways",
  "stationAliases": {
    "Dadar Ctrl": "Dadar",
    "Dadar Western": "Dadar",
    "Mumbai Ctrl": "Mumbai Central",
    "Mumbai CSM Trm": "Mumbai CSMT",
    "Mumbai LTT": "Lokmanya Tilak Terminus",
    "Bandra Trm": "Bandra Terminus"
  },
  "lines": [
    {
      "id": "western",
      "name": "Western Line",
      "from": "Churchgate",
      "to": "Virar",
      "status": "operational",
      "tracks": ["914.1", "955.1", "7.321"]
    }
  ]
}
```

- `id` → stable slug used in `osmId` (`iri:<city>:<id>`).
- `tracks` → IRI trackids, in order where known.
- `status` → `operational` unless the corridor is genuinely unopened. A
  `tracktype 15` "Construction – tripling" section belongs to an operational
  corridor; keep the line operational.
- `stationAliases` → optional display-name fixes so IRI names cluster with metro
  stations. Use them sparingly and only where the names genuinely refer to the
  same station.

## Corridor seeds (verify against the track table)

**Mumbai** — Western: `CCG`–`MM`–`BSR`–`VR` (914.1, 955.1, 7.321). Central:
`CSMT`–`BY`/`RVJ`–`CLA`–`TNA`–`DIVA`–`KYN`–`KSRA` (909.28, 913.1, 947.1,
961.1, 1986.1, 1056.1, 28.1). Central Karjat branch: `KYN`–`NRL`–`KJT`
(1048.1 + the NRL–KJT track if present). Harbour: `CSMT`–`CLA`–`VSH`–`PNVL`
and the `CLA`–`TNA` link (932.1/932.61, 942.1, 942.377, 942.401, 31.1).
Trans-Harbour: `TNA`–`VSH`–`SNCR`–`JNJ` (942.1, 942.377, 942.401, 1073.1,
457.1). Nerul–Uran: `NEU`–`SWDK`–`KARP`–`URAN` (732.270, 732.162, 732.1).
Vasai Road–Diva: `BSR`–`JCNR`–`DI`–`DIVA` (32.1, 32.47, 12.1, 1985.1).
Panvel–Karjat: `PNVL`–`KJT` (208.1). Do **not** import `NRLN`–`MAE` (Matheran
heritage), `PNVL`–`JNPT` (port), or `PNVL`–`ROHA` beyond the suburban limit
unless the corridor is explicitly suburban.

**Delhi** — Ring Railway (NDLS loop via Lajpat Nagar / Hazrat Nizamuddin /
Anand Vihar), NDLS–GZB (Ghaziabad), NDLS–PWL (Faridabad–Palwal),
NDLS–RE (Gurgaon–Rewari), NDLS–PNP (Panipat) if inside the extract.

**Chennai** — `MAS`/`MSB`–`TBM`–`CGL` (Chengalpattu), `MAS`–`GPD`
(Gummidipoondi), `MAS`–`AJJ` (Arakkonam/Tiruvallur), MRTS `MSB`–`VLCY`
(Beach–Velachery).

**Bengaluru** — `SBC`/`YPR`–`TK` (Tumakuru), `SBC`–`BWT` (Bangarpet),
`SBC`–`HSRA` (Hosur), plus the Yesvantpur–Yelahanka–Devanahalli corridor if
present. Import only corridors carrying scheduled commuter services.

**Kolkata** — Howrah radials `HWH`–`BWN` (Barddhaman), `HWH`–`BDC`–`KWAE`
(Bandel–Katwa); Sealdah radials `SDAH`–`RHA` (Ranaghat), `SDAH`–`BNJ`
(Bongaon), `SDAH`–`BT`–`HNB` (Barasat–Hasnabad), `SDAH`–`CG` (Canning),
`SDAH`–`DH` (Diamond Harbour), and the `HWH`–`SHM`/Santragachi links.

## Rules

- **Never invent geometry or stations.** Every coordinate must come from an IRI
  tile feature or `/atlas/track` response.
- Only import tracks that exist in `tracks.json`; report corridors you could not
  find rather than guessing a trackid.
- Do not edit app code, scripts outside `scripts/suburban/**`, or OSM curation
  files.
- Keep `build`, `checkedAt` and the corridor list current on every run.
- One manifest per city; preserve existing lines you are not changing.

## Final answer

Report in this order:

1. **Corridors** — table: line · from→to · tracks · stations · km · status.
2. **Replaced** — OSM suburban lines dropped for this city.
3. **Unresolved** — corridors/tracks missing from the atlas, with what you checked.
4. **Build result** — output of `build-suburban` and the city's gap report.
