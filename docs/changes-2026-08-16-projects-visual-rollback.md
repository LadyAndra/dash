# Roll back Projects visual experiments — 16 Aug 2026

## Why

The “larger books” and then “editorial slats” passes were useful design probes,
but the real-screen result became more cluttered and less balanced.

The useful discoveries are kept:

- the vertical colour rhythm has value;
- strong type contrast is promising;
- negative space matters more than adding another metadata line;
- overdue should be integrated into a visual system, not pasted on as a badge;
- and the book metaphor is only ideation scaffolding, not a realism target.

But the live implementation did not earn its place.

## Restored baseline

This rollback restores the Projects overview to the state immediately after:

- the first-click navigation fix;
- the full-width Projects banner;
- and Next up moving into that banner.

The simpler original shelf returns underneath it.

## What stays

- Full-bleed Projects banner.
- Search in the banner.
- Compact Next up in the banner.
- First-click navigation fix.
- Stable shelf DOM reconciliation.
- Existing project colours and member-count-driven width.

## What comes out

- Larger information-heavy book spines.
- Editorial-slat markup.
- “No stage” shelf filler.
- The Late badge.
- Slat-specific hover behavior.
- The extra `css/projects.css` runtime stylesheet.

`css/projects.css` is left as an inert file only because Dash's normal GitHub-web
upload workflow does not delete files. `index.html` no longer loads it and
`sw.js` no longer caches it.

## Next design step

Do not redesign the live shelf directly.

Create and compare standalone visual compositions first, using the approved
Projects data and the visual references from this design round. Only after one
direction is chosen should the live overview be changed again.

## Data / sync impact

None. No data-model, migration, sync, or format-version change.
