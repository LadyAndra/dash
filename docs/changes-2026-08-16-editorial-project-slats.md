# Editorial project slats — 16 Aug 2026

## Why this changed

The larger-book pass proved that the vertical colour rhythm and typographic
texture were useful, but it also made the core problem obvious on a real
screen: too many similarly-sized lines of type were filling each object.

The book/shelf metaphor was always ideation scaffolding, not a realism target.
This pass deliberately stops trying to make the objects read as books.

## The new visual rule

A project is an **editorial slat / typographic specimen**:

- one dominant serif project title;
- one tiny horizontal current-stage caption, only when there is one;
- one tiny footer containing entry count and catalogue number; and
- otherwise, colour and negative space.

That produces the scale contrast missing from the previous pass: the title
uses Dash's `--text-xl` step while annotation stays in `--text-label`.

## What was removed

- `No stage` is no longer printed. Absence is allowed to remain empty.
- The explicit `Late` badge is gone.
- The book-like rotate/tilt hover is gone.
- The second full-height vertical stage line is gone.

`Complete` remains because it is meaningful derived project state, not filler.

## Overdue

Overdue is now part of the slat's visual grammar: a thin ember rule along the
top edge. Every slat reserves the same rule thickness, so becoming overdue does
not move the layout.

The accessible project label still says overdue.

## Space and rhythm

Slats now:

- have a broader token-based minimum width;
- use a larger gap between neighbours;
- keep the existing member-count-driven width above that minimum; and
- use only a small vertical lift on hover.

The baseline remains stable and orderly. This is meant to feel curated, not
randomly art-directed.

## CSS organisation

The visual experiment lives in `css/projects.css`, loaded after `app.css` and
scoped to `.project-picker-page`.

That avoids replacing Dash's large shared stylesheet for a change that belongs
to one overview, and it keeps Home, List, Board and individual Project/Desk
pages out of the experiment.

## Data / compatibility

No data behavior changed:

- no data-model change;
- no saved-data migration;
- no sync change;
- `formatVersion` remains 3;
- stage is still derived with `stageOf()`;
- member count is still derived from the archive; and
- the shelf still reconciles project elements by id rather than rebuilding them.

`tests/project-spine-info.test.mjs` now guards the editorial hierarchy and the
absence/overdue rules. The existing shelf test continues to guard DOM identity.

Geometry and visual balance still need a real screen; jsdom cannot judge them.
