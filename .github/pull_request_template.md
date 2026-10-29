## Summary

<!-- What changed, and why. Link an issue if there is one. -->

## Checks

- [ ] `npm run check` passes
- [ ] `npm run build` passes (UI changes)
- [ ] Generated data was rebuilt, not hand-edited
- [ ] New data has source URLs in a curation patch or suburban manifest
- [ ] Affected page checked in a browser

## Data changes

<!-- City, lines, station count before/after, and the source URLs. Delete if
     this PR has no data changes. -->

```bash
npm run data:build -- --city=<slug>
npm run data:gaps -- --city=<slug>
```

## Notes

<!-- Escape hatches used (--allow-warnings / --allow-shrink), known gaps, or
     follow-ups. -->
