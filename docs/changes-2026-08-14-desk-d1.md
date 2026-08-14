# Dash — the Desk, Phase D1: a project page becomes a desk

**Date:** August 14, 2026
**What this is:** Phase D1 of `dash-desk-addendum.md`. Ready to upload.

---

## Before you upload: one thing to do differently

**Update every device before you edit anything on any of them.**

This round changes the data format (2 → 3, additively — nothing breaks). A device still running the old code will refuse to load a file written by the new one until it updates. It isn't damage — the old device just sits there saying it can't load — but it's an easy hour of confusion to avoid.

Upload, then open Dash on the Mac and hard-reload (**Cmd+Shift+R**), then open it on the iPhone and pull down to refresh, and only then start arranging.

## What to upload

Drag these to GitHub as **folders**, the way you always do:

- `js` — two new files (`js/desk.js`, `js/views/desk.js`) plus edits to `store.js` and `views/project.js`
- `css` — `app.css` has a new section at the bottom
- `docs` — this note and the updated current-state doc
- `tests` — new folder. Not deployed, not served; it's there so the next session can run the checks.
- `sw.js` — **upload this one separately, on its own.** It's a loose file at the repo root.

`sw.js` is bumped to **`dash-v31`** and both new JS files are in `SHELL`. If you forget it, your devices keep serving the old code and none of this appears.

---

## What it is

Open a project. The page is now a desk.

**The banner** is a compact ledger band — the name on its own top line, then one thin ruled line of facts, then the three drawer handles. About a third of the height it was.

**The three drawers** hang off the banner's bottom edge, in the project's own colour. Open one and it drops down as a column under its own handle, only as tall as its contents need; the other two stay shut. Click anywhere else and it zips back up.

- **Unplaced** — everything in this project with no spot on the desk yet. Drag a row out onto the desk to place it.
- **Filed** — the structured list of everything in the project, with the quick status control live, exactly as on List.
- **Milestones** — your existing milestone editor, moved in whole.

**The desk itself** is a big bounded surface — 4400 × 2900, sized so around a hundred cards fit with about as much bare desk again around them.

- **Drag a card** to move it. It lands where you drop it.
- **Tap a card** to bring it to the top of whatever it's under.
- **Double-click a card** and it grows in place into the whole entry — body, tags, and two buttons: *Edit entry* (opens the normal editor) and *Return to tray*. Double-click again, or press Escape, to collapse it.
- **Drag empty desk** to pan around.
- **Hold `Z`**, or hold the **✧** in the banner, and the whole desk scales down so you can see all of it at once. Let go and you're exactly back where you were. Nothing is remembered, and you can't move anything while you're holding.
- **To take a card off the desk**, drag it onto the **Unplaced** handle, or use *Return to tray* on an expanded card. It keeps its spot, so putting it back puts it back in the same place.

**On the phone** there's no desk — that was always the plan. You get the Peek content as the page: milestones, then the filed list. No Unplaced shelf, because there's nothing to be unplaced from.

The overdue mark is the only ember on the desk, and it looks exactly like an overdue list row.

---

## What I'd check first

1. **Arrange one project on the Mac, then open it on the phone.** The phone should show the same entries as a list, no desk.
2. **Drag a card off the right-hand edge.** It should stop at the edge and still be draggable back — not stick.
3. **Open a drawer, then click a card.** The drawer should close and the card should *not* move.
4. **Fill a desk, then hold Z.** Everything should fit on screen, centred.
5. **Arrange something on the Mac and something else on the phone with wifi off**, then let both sync. Nothing should be lost.

If Reduce Motion is on in macOS, the drawer and the glance will snap instead of slide. That's correct and deliberate.

---

## What's underneath

Desk position lives on the entry, keyed by project — `viewState["desk:<projectId>"]` — carried by a new `"vs"` op with per-field last-writer-wins. Because the key names the project, the same entry can be placed on one project's desk and sitting unplaced in another's tray at the same time, and the two never argue.

Milestones and desk placements turned out to be the same problem, so they're now the same code: one shared merge engine both op kinds call, keyed exactly as milestones were already keyed, so existing data merges byte-identically to before.

### The tests found two real bugs before any of this shipped

**A create op could wipe a desk placement.** Log files are read independently and arrive in any order, so an op for an entry can land *before* the op that created it — normal. When the create finally arrived, it was assigning a blank `viewState` over the real one, permanently. This is the same bug Phase M1 hit with milestones; `viewState` had never been added to that exclusion because nothing had ever written to it. **This would have quietly lost arrangements on any device whose logs arrived out of order.**

**A position could get stuck off the edge.** The mockup clamped cards when drawing them but not when storing them, so a card shoved past the edge kept an off-desk position and ignored the first part of any drag back.

63 checks in total now — 36 on merge and geometry, 27 on rendering. Run them any time with `node tests/desk-d1.test.mjs` from the repo folder. The render ones need `npm install jsdom` first; the merge ones need nothing at all.

---

## Deliberately not in this round

- **Typing inside an expanded card.** Expanding shows the entry and offers *Edit entry*. Inline editing needs the full deferred-commit handling (draft, focus and cursor restore) and belongs with the post-it editor in D2.
- **Clips, post-its, wonder symbols, highlights** — D2, D3, D4. The data model already has room for all of them; none of this needs rewriting to add them.
- **The banner's overall height** and **the wonder symbol glyphs** are still your two parked items.

Use it for a bit before D2.
