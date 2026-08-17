# Projects entry + full-bleed banner — 16 Aug 2026

## What was wrong

Two real-device issues remained on the Projects overview.

### First click could bounce back to Home

The existing service-worker takeover guard still had a narrow timing race.

If `controllerchange` arrived just before the first pointerdown, `index.html`
treated the page as untouched and started a reload. The click could still
switch Dash to Projects before that already-started reload completed, which
made Projects appear briefly and then disappear when the cold-start reload
landed on Home.

The new rule removes that timing question entirely:

**a visible Dash tab never force-reloads itself for a service-worker update.**

A takeover marks an update as waiting. Dash reloads only after the document is
hidden. If it is already hidden when takeover happens, it can reload
immediately because there is no visible interaction to lose.

### Projects banner was inset while sibling page bands are full-bleed

The Projects banner lived inside `#view-host`, whose ordinary page padding is
right for Home but left paper showing around the Projects band.

The Projects overview now uses one scoped full-bleed wrapper. It reaches through
that host inset for the banner only, then gives the normal page inset straight
back to the project shelf below it.

This keeps the change local to the overview:

- Home keeps its normal inset.
- Individual project / Desk pages are unchanged.
- List and Board are unchanged.
- The dark Projects banner now aligns visually with their page bands.

## Tests

`tests/project-next-up.test.mjs` now also enforces the full-bleed/banner/shelf
structure.

`tests/update-reload.test.mjs` records the service-worker takeover contract:
there is no touched/not-touched branch anymore, and a reload is deferred until
the document is hidden.

## Data / sync impact

None.

- No data-model change.
- No saved-data migration.
- `formatVersion` remains 3.
- No Dropbox behavior change.
- No new runtime module.
- `index.html` and `js/views/project.js` are cached app files, so `sw.js`
  accompanies them with the normal cache-version bump.
