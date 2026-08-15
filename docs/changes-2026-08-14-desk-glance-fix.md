# Dash — the glance, second attempt

**Date:** August 14, 2026
**Upload:** `js`, `css`, `docs`, `tests`, and **`sw.js` on its own** — `dash-v35`. No format change.

---

## Your bisect was right

Editing and pressing Done now holds its place, which means the saved position has stopped being corrupted — that half worked. Glance-release still landing in the corner points at exactly the half I told you was untested: putting the position back *after* the zoom-out finishes.

So I stopped trying to get that timing right, because the timing isn't fixable — it's a race, and moving a race around doesn't win it.

## What was actually wrong

A scaled-down element doesn't just *look* smaller; the browser also treats it as taking up less room, so while the desk was zoomed out there was almost nothing left to scroll. Any attempt to write your position back during that window got clamped to nearly zero. The first fix tried to wait until the desk had grown back before writing — but "has it finished growing?" is a question with an unreliable answer, and it lost.

## What it does now

The desk surface is wrapped in a **sizer**: a plain box that is 4400 × 2900, never scales, never moves. That's the thing the window scrolls over now, so the scrollable area is a constant no matter what the glance is doing.

Which means the glance can stop touching the scroll position altogether. It's now purely a visual transform, with your current scroll position folded into it — and letting go just removes it. **Nothing to restore, no timing to get right, nothing to race.**

The test changed shape with it, and is stronger for it. Instead of "does it restore correctly" — which needs a real layout engine to answer, so it couldn't be tested — it now asserts that **the whole gesture writes to the scroll position zero times**. That's decidable, and it passes.

## What to check

Scroll somewhere specific, hold `Z`, let go. You should be exactly where you were — and this time not because something put you back, but because nothing moved you.

Then hold the ✧ and do the same. Then edit an entry and click Done, to confirm that one still holds.

If it *still* lands in the corner after this, stop testing it and tell me — that would mean the scroll position is being written by something I haven't found, and I'd want to instrument it rather than guess a third time.

---

Still outstanding, unchanged: steps 3 and 4 (hold renders during a drag; move the double-click memory somewhere a rebuild can't destroy), and step 5 in its own session. Typing flicker is Cause 1 and is step 5's to fix — expected to be unchanged until then. The editor's click-and-drag-to-select closing the modal is a separate pre-existing bug, still on the list and not touched here.
