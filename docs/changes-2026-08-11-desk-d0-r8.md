# Dash — the Desk, Phase D0 round 8

**Date:** August 11, 2026
**What this is:** two small changes to the banner's facts line. Same file, `mockups/desk-preview.html`. **Nothing deployed, no `sw.js` change, no cache bump.** Folded into decision 49 in `dash-desk-addendum.md` §14.19.

---

## What changed

**The rule between "In progress" and "03 / 05" is gone.** You were right — they're two halves of one fact, and a rule there claimed they were two. They now share a cell.

**The fraction is bigger.** 22px against the line's 11px, and it grows *in place*: the number is set with no line-height of its own, so it contributes nothing to the height of the line box and its glyphs sit in padding that was already there. The band's height, both hairlines, and every other item on the line are exactly where they were. Nothing else moved, nothing gained a gap.

There's a **Progress fraction size** slider (12–34px) next to the hierarchy control, so you can land it exactly. 22 is a safe default — past about 30 it starts crowding the hairlines above and below.

It wasn't complicated and it disrupted nothing. Worth asking, though.

---

## Your locked set, as pasted back

```
banner:          A, facts line: weight
rules:           vertical on, horizontal both
mat footprint:   2000px
mat presence:    12%
mat scale:       6
rotation range:  +/-2.3
looseness:       0.40
card width:      260px - 410px
expanded width:  460px
pile weight:     edges
card anatomy:    C - plus a two-line snippet
expand gesture:  double-click (locked, no corner button)
drawer speed:    380ms
settle:          200ms
glance speed:    380ms
glance trigger:  both - hold Z and hold the star mark
progress size:   22px
```

That is the complete D0 output. It lives in `dash-desk-addendum.md` §14.7 and §14.19, which is what the D1 session reads.

---

## D0 is done unless you say otherwise

D1 is the placement core: the `"vs"` op and the shared sub-record merge helper in `store.js`, headless replay tests in every permutation, `formatVersion` 3, `js/desk.js` with its one-archive-pass rule, and the desk replacing the real project page behind the platform gate — plus the Peek drawers and the phone's Peek page.

That round changes the data format, so its upload note will say **update every device before editing anything**.

Still parked: the banner's overall height, and the wonder symbol glyph redesign.
