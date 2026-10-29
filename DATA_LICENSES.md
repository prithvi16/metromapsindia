# Data licences

The MIT licence in `LICENSE` covers the source code. Data and derived data have
separate terms.

| Source                     | Used for                                                                     | Terms                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenStreetMap contributors | metro, monorail, light rail, tram, funicular, MAHSR geometry, station points | [ODbL 1.0](https://www.openstreetmap.org/copyright) — attribution and share-alike for derived databases                                                                      |
| Wikipedia                  | official line/station/km/ridership figures; HSR station list leads           | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — attribution and share-alike                                                                                |
| India Rail Info atlas      | suburban corridor linework and station coordinates                           | **Not an open-data licence.** The atlas has no open licence; permission is required before redistributing derived data publicly. Included on the live site with attribution. |
| OpenFreeMap / OpenMapTiles | basemap tiles at runtime                                                     | See the provider's terms; tiles are not stored in this repository                                                                                                            |

## What this means for the repository

- `src/data/cities/shards/*.json` mixes OSM-derived and IRI-derived geometry.
  Treat the IRI-derived suburban lines as **all rights reserved by India Rail
  Info**, not as MIT or ODbL data.
- If you fork this repository for public redistribution and do not have IRI
  permission, remove or replace the suburban corridors whose `source` starts
  with `India Rail Info atlas` (the `suburban` mode lines for Mumbai, Delhi,
  Chennai, Bengaluru, Hyderabad and Kolkata).
- The `scripts/out/` cache and `scripts/out/iri/` extracts are gitignored and are
  not part of the published repository.
- Attribution in the app: "Suburban linework and station coordinates from the
  India Rail Info atlas" (City page, About page, footer).

This file is a practical summary, not legal advice. Confirm terms with the data
providers before redistributing derived datasets.
