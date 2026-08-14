# Dash — the Desk, Phase D0 round 7

**Date:** August 11, 2026
**What this is:** hairline rules in the banner, borrowed from the drawer handles. Same file, `mockups/desk-preview.html`. **Nothing deployed, no `sw.js` change, no cache bump.** Recorded as decision 49 in `dash-desk-addendum.md` §14.19.

---

## What changed

You were right, and it's a better answer than weight alone.

**Vertical hairlines between the facts.** Each one now sits in its own cell — `№ 0004 | IN PROGRESS | 03 / 05 | 12 ENTRIES | NEXT — …` — which is exactly what the three drawer handles already do to each other, one level up. The middots are gone.

**Horizontal hairlines**, back from the tall banner: one under the project name, one between the facts line and the drawer handles. Inset to the banner's own padding, the way the old ones were.

Both are on by default and both toggle:

- **Vertical rules between the facts** — on / off (off gives you the middots back)
- **Horizontal rules** — under the name and above the drawers / under the name only / none

The weight hierarchy stays underneath it: stage and the next milestone's name at full strength, counts and labels back at 58%. The rules and the weight are doing different jobs and they don't fight.

Two small things worth knowing:

- The rule colour is mixed from whichever ink the banner is written in, so it works on the colour band and would work on paper if you ever switched to B or C.
- **Overdue opts out of the cells.** Giving it a border and cell padding just made the ember rectangle wider, which reads as a bigger alarm than it is. It keeps its own tight block and sits after a gap.

---

## Where this leaves D0

Nothing outstanding that I know of. If the rules read right, **D0 is done** — and D1 is the placement core: the `"vs"` op, the shared merge helper, the headless replay tests, `formatVersion` 3, and the desk replacing the real project page behind the platform gate.

Still parked, deliberately: the banner's overall height (now roughly a third of the original, so possibly already answered) and the wonder symbol glyph redesign.
