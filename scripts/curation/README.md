# Curation patches

The schema, rules and examples live in [docs/curation.md](../../docs/curation.md).

The machine-readable contract is `CurationPatchSchema` in
`shared/schema.ts`; `npm run validate:data` enforces it. Build with:

```bash
npm run data:build -- --city=<slug>
npm run data:gaps -- --city=<slug>
```

The `transit-curator` subagent automates this loop and may only edit this folder.
Suburban manifests are separate: `scripts/suburban/<slug>.json`.
