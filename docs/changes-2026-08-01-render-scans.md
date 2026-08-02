# Change note — the app stops re-reading the whole archive 30 times a redraw

**Date:** August 1, 2026. **Cleanup #1 of the code-health review**
(`docs/review-2026-08-01-code-health.md`, §4.1). **Live at `dash-v28`.**

**Files changed:** `js/app.js`, `sw.js`. Nothing else.
**Behaviour changed:** none intended. Same numbers, same order, same everything —
just less work to produce it.

---

## What was wrong

Every time Dash redrew the screen, it rebuilt the tag / type / status index in the
left rail. To do that it read your entire archive **once for the total, once for
every type, once for every status, and once for every tag on screen** — plus one
more pass to collect the tag names. With your five types, three statuses and twenty
tags, that's about **thirty complete reads of everything you own, per redraw**.

Two things made it worse than it sounds:

1. It did this **on Home and on a project page too**, where the rail isn't even on
   screen — built in full, then hidden by CSS. The most expensive thing on the page,
   drawn for nobody.
2. A redraw happens on **every change to the store**, which includes every single
   keystroke while you're typing in the item editor.

The project already had a written rule about exactly this — *"anything that
repeatedly scans `store.all()` must be coalesced to one pass per frame"* — from when
the pet widget had the same bug during bulk edits. The rule was never applied to the
app's own chrome.

## What changed

Three things, all in `app.js`:

- **One pass instead of thirty.** A new `railCounts()` walks the archive once and
  tallies types, statuses and tags as it goes. The rail then reads the tallies.
- **The rail is only built when the view actually has one.** Home and Project skip
  it entirely now instead of building it and hiding it.
- **The query is skipped for views that don't use it.** Home and Project read the
  store directly and threw the query result away; now one isn't made for them.
  (`query()` filters *and* sorts the whole archive, so this was real work done for
  nobody.)

Net effect per redraw: **about 32 passes → 3** on List and Board, and **→ 2** on Home.

## One small correctness fix that came out of testing

The old code counted a tag by asking "does this entry have this tag?", so an entry
could only ever count once. My first version counted per entry in the tag array — so
if an entry ever carried the same tag twice, the rail would have said "2" where the
list showed one entry. Dash already prevents duplicate tags when you add one, so this
should be impossible, but an old snapshot file could carry one. The final version
counts per entry, exactly like before.

Verified against 2,000 randomly generated archives (including deliberately corrupt
ones with duplicate tags, accented tag names, empty archives, unused types, and more
than twenty tags): **the old and new code produce identical output every time.**

---

## How to try it

1. Upload the **`js` folder** and **`sw.js`** (per `deploy-runbook.md` — drag the
   folder, not loose files).
2. **Hard-reload once** — Cmd+Shift+R. GitHub Pages' own cache sits in front of the
   service worker for ten minutes, so a normal reload can still hand you the old
   code and make a working change look broken.

Then check that nothing moved:

- **List view** — the left index rail should look exactly as it did: Everything with
  its count, then your types, then statuses, then up to twenty tags alphabetically,
  each with the same number beside it as before.
- **Click a type, a status and a tag** in the rail — each should filter the list and
  show the ✕ chip in the band, as before.
- **☰ Index** should still collapse and expand the rail, and still be remembered when
  you come back.
- **Home and Project** — should be unchanged. (The rail isn't shown on either, which
  is the point.)
- **The thing you might actually notice:** typing in an item's Notes field, and doing
  a bulk edit across a lot of entries, should feel smoother. That's the whole reason
  for the change.

If anything in the rail shows a different number than you expect, that's the one
thing worth reporting — it's the only part of this change that touches what you see.

---

## Still outstanding (not in this upload)

- The Home tab's overdue badge and Home's own "Overdue" stat tile are counted
  **differently** — the badge counts only overdue *due dates*, the tile also counts
  overdue *reminders*. So they can legitimately disagree. Found while doing this;
  deliberately not touched here, because fixing it is a decision about which number
  is right, not a cleanup.
- Home still does one date-scan of its own on top of the badge's. Merging those two
  is a small follow-up that touches `home.js`, kept out of this upload to keep it to
  one file.
