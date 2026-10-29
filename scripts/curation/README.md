# Curation patches

OSM is the base layer for every city, but it is incomplete — especially for lines
that are under construction. This folder holds hand-checked corrections that are
merged over the OSM data at build time.

One file per city: `scripts/curation/<slug>.json`, where `<slug>` matches the city
in `src/data/cities/index.json` (for example `mumbai`, `navi-mumbai`, `chennai`).

Build with:

```bash
npm run data:build          # applies every patch
node scripts/report-gaps.mjs --city=mumbai   # shows what is still missing
```

## Format

```json
{
  "checkedAt": "2026-10-29",
  "sources": ["https://example.org/official-route-map.pdf"],
  "lines": [
    {
      "match": { "ref": "2B" },
      "status": "under-construction",
      "colour": "#f0b429",
      "stationsMode": "replace",
      "stations": [{ "name": "DN Nagar", "lat": 19.1286, "lon": 72.8295 }],
      "confidence": "high",
      "notes": "Station list from the operator alignment drawing."
    }
  ],
  "addLines": [
    {
      "name": "Line 5 (Thane – Taloja)",
      "ref": "5",
      "mode": "metro",
      "status": "under-construction",
      "colour": "#ef7c1a",
      "from": "Thane",
      "to": "Taloja",
      "geometry": [[19.186, 72.975], [19.15, 73.02]],
      "stations": [{ "name": "Thane", "lat": 19.186, "lon": 72.975 }]
    }
  ],
  "dropLines": [{ "match": { "nameIncludes": "duplicate" } }]
}
```

### Fields

| Field | Meaning |
| --- | --- |
| `sources` | URLs actually used. Required for a patch to be credible. |
| `checkedAt` | ISO date the sources were read. |
| `lines[].match` | `ref`, `mode` and/or `nameIncludes`. All provided fields must match. |
| `lines[].stationsMode` | `replace` (default) or `append`. |
| `lines[].confidence` | `high`, `medium` or `low`. |
| `addLines[]` | A line OSM does not have at all. Needs real geometry. |
| `dropLines[]` | Remove an OSM line that is a duplicate or wrong. |

### Validation

The build rejects a station when it has no name, non-numeric coordinates, or falls
outside the city's bounds by more than 0.6°. Warnings are printed during
`npm run data:build`; they do not fail the build, so read the output.

Patched lines are marked `curated: true` in `all.json`, which keeps them
distinguishable from raw OSM data.

## Rules

- Coordinates are WGS84, six decimals.
- Every coordinate needs a source. No estimating from schematic maps.
- A station should be within 3 km of its line geometry — otherwise one of the two is wrong.
- Prefer the operator's own documents over Wikipedia. Use Wikipedia to find the operator source.
- When a source disagrees with OSM, record the conflict in `notes`.

The `transit-curator` subagent automates this workflow; see
`.opencode/agents/transit-curator.md`.
