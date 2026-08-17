# Larger, more informative project books — 16 Aug 2026

## Why this changed

Once Next up moved into the Projects banner, the shelf had its vertical room
back. The remaining problem was the shelf itself: the books were visually
distinctive, but most of their surface was not telling the person anything.

The change keeps the shelf metaphor and makes the spines earn their space.

## What each book shows now

Each project spine carries:

- the project title, in the larger existing serif type step;
- the current milestone stage, derived at render time;
- `No stage` when the project has no milestones;
- `Complete` when every visible milestone is done;
- the project's entry count; and
- the existing catalogue number.

Overdue projects now say `Late` explicitly in ember. The tiny bookmark was
technically correct but too easy to miss at normal shelf scale.

## Scale

Books now have a broader readable minimum width using only existing layout
tokens: `--tap-min + --space-5`.

The real member count still drives `--n`, so larger projects continue to grow
thicker above that minimum. The shelf has not become a row of equal cards.

The books are not made dramatically taller; they already had strong vertical
presence. The additional width is what creates room for the second information
line without consuming more page height.

## What did not change

- Shelf order is unchanged.
- Search behavior is unchanged.
- Next up ordering is unchanged.
- Spine DOM nodes are still reconciled by project id instead of rebuilt.
- No new project field or saved priority was introduced.
- Stage is still derived from milestones with `stageOf()`.
- No data migration or sync change.
- `formatVersion` remains 3.

## Test

`tests/project-spine-info.test.mjs` checks the information-bearing structure,
derived stage states, explicit Late marker, count updates, and that the same
book DOM node survives ordinary redraws.

Geometry is still judged on a real screen; jsdom cannot tell whether a spine
looks comfortably wide.
