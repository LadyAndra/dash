# Dash — Desk D1, round 2 fixes

**Date:** August 14, 2026
**Upload:** `js`, `css`, `docs`, and **`sw.js` on its own** — bumped to `dash-v33`. No format change; a hard reload on the Mac is enough.

---

## The title bug — and it wasn't the editor

Titles were being saved correctly on every keystroke. They were being eaten afterwards, by **sync**.

When Dash polls Dropbox and finds the shared snapshot has changed, it was loading that snapshot straight over everything in memory — including the bookkeeping that says *when* each field was last edited. Anything you'd typed since that snapshot was written just disappeared. Intermittent, because it depends on the poll landing in the gap between your edit and the next push. A new entry is the worst case: the snapshot's version of it has an empty title, so you get "Untitled" back.

The hazard was actually already written down in a comment right above the offending line — it just wasn't guarded.

A snapshot is now treated as a *base*, not as the truth, and your local work goes back on top of it two ways: your own device's log is replayed in full over it (replaying an append-only log twice is harmless by design), and anything you've typed that hasn't reached a log yet is re-applied with its original timestamps. Both Dropbox and folder sync.

There's a test now that reproduces the loss on the old code and proves it doesn't happen on the new code — including for a desk placement made in the same window.

**This was not desk-specific and it could have bitten any edit.** Worth knowing it's closed.

## The four drag problems were one bug

Cards needing a click before they'd drag, drags not registering, drops snapping back, and general lag — all the same cause.

Touching a card raised it to the top, and raising *wrote to the store immediately*. Writing to the store redraws the screen. Redrawing the screen destroys and rebuilds every card — including the one your pointer had just grabbed. So the first click rebuilt the card instead of dragging it, the drag had nothing left to hold, and the drop landed on a card that no longer existed.

The rule was already written down — drags commit on drop, never before — and the raise was the one place breaking it. The raise is now purely visual while you hold the card, and gets saved on release together with the new position. One write per drop, and nothing at all in between.

That should also fix the intermittent flicker, which was the same redraw storm. If you still see it, tell me.

## Expanded cards

Now two surfaces, because dragging and selecting text want the same pixels:

- **The header** — number, type, title, with a small grip mark — is what you drag the card by.
- **Everything below it** is ordinary text. Select it, copy it, and any web address in the body is a real clickable link.

Double-click on the header collapses the card; double-click in the body selects a word, as it should everywhere else.

## Three smaller ones

- **The ✧ in the banner works now.** It was being looked for before the desk existed on the page, so it never got wired up — only the `Z` key did.
- **Editing an entry no longer throws you back to the top-left corner.** Restoring a scroll position is itself a scroll, and the code was recording the half-restored position as the new one.
- **Opening a project now centres you on the mat's circle**, instead of the corner of a 4400 × 2900 sheet.

---

## Your "for later" list — recorded, not built

Written into the addendum so they survive this chat:

- Show attached drawings and images on the card itself. (The list rows already do this, so the card can borrow it.)
- Dragging a card toward the drawer should *open* it, so you can drop the card back inside.
- Rename "Unplaced" to something more on-brand.
- Double-click empty desk to make a post-it there — this one belongs with D2, where post-its are built.

---

40 merge and geometry checks, 28 render checks, all passing.
