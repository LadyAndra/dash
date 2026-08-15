# The first click on the desk highlighted the top of the page

**August 15, 2026 · `dash-v37` → `dash-v38`**
One CSS rule. No JavaScript changed, no data format change, no new files.

---

## What you saw

Open a project, click once anywhere on the desk, and the text at the top of the
page lit up as if you had swept across it with the mouse.

## Why

Pressing the mouse down on a page begins a text selection. That is the browser's
default and it is normally invisible, because you press down on the text you
meant to select.

The desk has almost no text of its own. So the browser did what it always does
with a selection that starts on nothing: it looked for the nearest text it could
anchor to, found it **above** the desk, and swept backwards to reach it. The
banner and the topbar are what sit up there, so those are what turned blue.

The "first click" part is the giveaway, and it is the detail that named the
cause. A freshly rendered page has its selection anchor at the very start of the
document. The first press on the desk therefore drew a selection running from
the top of the document down to your cursor, which is the entire top of the
screen. Once the anchor had been moved into the desk, there was nothing above it
left to sweep, so every click after the first looked fine.

## The fix

The desk viewport is now marked as not-text, so a press on it never begins a
selection at all.

**It had to be CSS, and that is worth writing down.** The obvious fix is
`preventDefault()` on pointerdown, which cancels the browser's default action.
The desk deliberately refuses to do that, and has a comment saying so:
`preventDefault` also suppresses the browser's compatibility mouse events, and
double-click-to-expand goes with them. Marking the surface non-selectable
removes the gesture at its source rather than cancelling it after the fact, so
nothing else has to be traded away.

Cards inherit the rule, which is right: dragging a card should not smear a
selection across it. **An expanded card puts selection back on itself**, because
its body is meant to be read, selected and copied, and its header stays
non-selectable so it can still be dragged. That two-surfaces arrangement was
already built in round 2 and is unchanged.

One extra: `.dcard` carried `user-select: none` without the `-webkit-` prefix,
while the expanded-card rules beside it carried both. Safari only dropped that
prefix recently, so on an older Safari the cards were selectable when they were
not meant to be. Both are now written the same way.

---

## Files changed

```
css/app.css   the desk viewport is non-selectable; .dcard gains the -webkit- prefix
sw.js         CACHE_VERSION → dash-v38
docs/dash-current-state.md
docs/dash-desk-addendum.md            (§14.25)
docs/changes-2026-08-15-desk-selection.md   (this file)
```

## Tests

**None added, on purpose.** This is a pure layout-behaviour fix, and the standing
rule on this desk is that jsdom has no layout and must never be trusted with
anything geometric. A test asserting "the stylesheet contains this line" would
pass whether or not the browser honoured it, which is worse than no test because
it reads as coverage. This one is verified by clicking on it.

The existing 108 checks still pass; nothing they cover was touched.
