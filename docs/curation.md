# Curation patches

OSM is the base layer, but it is incomplete — especially for lines under
construction. `scripts/curation/<slug>.json` holds hand-checked corrections
merged over OSM at build time.

The schema is enforced by `CurationPatchSchema` in `shared/schema.ts`; this page
documents intent, not a second copy of the schema. Run:

```bash
npm run validate:data
npm run data:build -- --city=mumbai
npm run data:gaps -- --city=mumbai
```

## Shape

```json
{
  "checkedAt": "2026-10-29",
  "sources": ["https://operator.example/route-map.pdf"],
  "lines": [
    {
      "match": { "ref": "2B" },
      "status": "under-construction",
      "colour": "#f0b429",
      "stationsMode": "replace",
      "stations": [{ "name": "DN Nagar", "lat": 19.1286, "lon": 72.8295 }],
      "confidence": "high",
      "notes": "Station list from the operator alignment drawing, page 3."
    }
  ],
  "addLines": [
    {
      "name": "Line 5 (Thane – Taloja)",
      "ref": "5",
      "mode": "metro",
      "status": "under-construction",
      "geometry": [[19.186, 72.975], [19.15, 73.02]],
      "stations": [{ "name": "Thane", "lat": 19.186, "lon": 72.975 }]
    }
  ],
  "dropLines": [{ "match": { "nameIncludes": "duplicate" } }]
}
```

Relation-level fixes use the same file:

```json
{
  "checkedAt": "2026-10-29",
  "sources": ["https://www.openstreetmap.org/relation/19233909"],
  "dropOsmIds": [19233909, 7898712, 7898769],
  "refOverrides": { "2": "2A" },
  "statusOverrides": { "2B": "under-construction", "9": "under-construction" }
}
```

- `sources` — at least one URL, actually read. Required.
- `lines[].match` — `ref`, `mode` and/or `nameIncludes`; all given fields must
  match.
- `stationsMode` — `replace` (default) or `append`.
- `addLines[].geometry` — one `[[lat, lon], …]` polyline, or an array of
  polylines for disconnected stretches.
- `dropOsmIds` — relation ids to drop before normalisation.
- `refOverrides` / `statusOverrides` — per-ref values applied during
  normalisation.
- Curated records are marked `curated: true` in the dataset.

Suburban manifests are separate: `scripts/suburban/<slug>.json`, validated by
`SuburbanManifestSchema`. See `docs/data-pipeline.md` and the `iri-suburban`
agent.

## Validation

The build rejects a station when it has no name, non-numeric coordinates, or
falls outside the city's bounds by more than 0.6°. An unmatched `lines`/`addLines`
entry, an empty `addLines` geometry, or a `dropLines` rule that matches nothing is
a **warning**, and warnings fail the build unless `--allow-warnings` is passed.

## Rules

- Coordinates are WGS84, six decimals.
- Every coordinate needs a source. Do not estimate from a schematic map.
- A station should be within 3 km of its line geometry; otherwise one of the two
  is wrong.
- Prefer the operator over OSM. Record conflicts in `notes`.
- Keep `sources` at file level and `confidence` per patch entry.
- A whole new line needs real geometry, not just two station points.

## Automation

The `transit-curator` subagent (`.opencode/agents/transit-curator.md`) runs the
research loop: read the gap report, open operator sources, geocode names, write
the patch, rebuild and re-check. It can only edit `scripts/curation/`.
