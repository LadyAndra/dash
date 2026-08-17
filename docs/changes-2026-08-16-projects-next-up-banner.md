# Move Projects Next up into the banner — 16 Aug 2026

## Why this changed

The first Next up implementation had the right information but the wrong
physical footprint. It rendered as a full bordered panel between the Projects
banner and the project shelf.

On a real desktop screen that consumed a large amount of the exact vertical
space the shelf needs. The banner itself still had substantial unused
horizontal room beside Search.

## What changed

Next up now lives inside the dark Projects banner.

- Search stays on the left.
- Next up occupies the remaining horizontal space on the right.
- It shows at most the first three immediate projects so the banner cannot turn
  into a second project list.
- The summary still reports the full active count and overdue count.
- Ordering remains derived: overdue → nearest dated → undated active.
- Search still scopes Next up and the shelf together.
- Clicking a compact Next up control still opens that project.

The standalone Next up panel is gone, so the shelf begins immediately below
the banner again.

## Why the shelf is still separate

The shelf is the stable library: every project, in its ordinary order.

Next up is the immediate queue: only what reaches the person first.

Keeping those jobs separate means urgency can change without making the books
jump around.

## Next visual pass

With the vertical space returned, the next Projects pass can enlarge the books
and use the additional spine area for more project information. That is being
kept as a separate visual change so its scale can be judged cleanly.

## Documentation correction included

The previous Projects bundle accidentally used an older local copy of
`dash-current-state.md` and reintroduced the already-closed Desk Step 5 wording.

This upload restores the corrected current-state file first, then adds this
Projects update. No app behavior was affected by that documentation regression.

## Data / compatibility impact

- No data-model change.
- No saved-data migration.
- `formatVersion` remains 3.
- No sync behavior change.
- No new runtime file.
- `js/views/project.js` remains in the offline shell.
