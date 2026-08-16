# Dash — the Desk: handoff for a fresh chat

**Date:** August 14, 2026
**Live at:** `dash-v36`
**Purpose:** everything a new session needs to pick this up cold. Read this, then `dash-desk-addendum.md` §14 for the decision history.

---

## Where the Desk stands

**Phases D0 and D1 are built and deployed.** A project page is now a desk: entries are cards you place, move, raise, expand in place and take back to the tray, with the structured view beside it in three drawers hanging off the banner.

Phases **D2 (clips + post-its), D3 (wonder symbols) and D4 (highlights)** are not started. The data model already has room for all of them (`dash-desk-addendum.md` §12.2–§12.4) and `deskData()` already carries the `clip` field through; none of them requires rewriting what exists.

### Files

```
js/desk.js                    pure rules — the desk key, locked constants, wobble,
                              clamping, z-order, pile weight, glance framing, the mat
                              geometry, deskData(). Imports nothing.
js/views/desk.js              the surface, the drawers, the banner, the phone's Peek
js/store.js                   the "vs" op + the shared sub-record merge engine
js/sync.js                    two data-integrity guards (see below)
js/app.js                     scheduleRender() + holdRenders()
css/app.css                   the "THE DESK" section at the bottom
tests/*.mjs                   95 checks across four files
```

### The constants are locked

`dash-desk-addendum.md` §14.7 is the table (rotation ±2.3°, cards 260–410, desk 4400×2900, mat 12% at scale 6 with a 2000px footprint, drawer/settle/glance 380/200/380ms, banner candidate A). They live once in `js/desk.js` and once in `css/app.css`, each marked with the round that locked them. **Don't re-derive them from the mockup.**

---

## THE OPEN BUG — start here

**Typing in the entry editor makes the whole screen flicker, and it is still happening at v36.**

This is Cause 1 of Fable's root-cause review, and it is the *only* one of the five causes not yet addressed. It was expected to survive steps 1–4; it is step 5's to fix.

### Why it happens

Every store change rebuilds the entire page from scratch. The editor saves on every keystroke (`oninput → store.setField`, which is correct for the op-log design), so every keystroke triggers a full rebuild of the desk behind the modal: `views/project.js` clears its container, and the banner, drawers, mat and every card are destroyed and recreated. The new desk viewport starts at scroll (0,0) and the code that restores the scroll position runs one animation frame later — so each rebuild paints at least one frame of the desk's top-left corner before snapping back. That corner-flash, once per keystroke, is the flicker.

### The fix — step 5, its own session

**Update the desk in place instead of rebuilding it.** Keep the viewport, sizer and surface elements alive across renders and reconcile cards by id: move, update, add and remove only what changed.

This removes the corner-flash entirely, because the scroll position is never destroyed and therefore never needs restoring. It makes typing flicker-free without touching the editor. It is a medium-sized refactor confined to `js/views/desk.js`, and steps 1–4 have deliberately calmed the environment first so it can be attempted safely.

**Scope note:** `views/project.js` currently does `container.innerHTML = ""` on every render. Reconciling means the desk needs to survive that — either project.js keeps the desk node and re-uses it, or the desk mounts once and updates itself on a store subscription.

---

## Also open

**The editor closes when you click-and-drag to select text.** Pre-existing, not desk-specific, never in scope for any of these rounds. Likely the scrim's click handler firing when a drag that *started* inside the modal *ends* on the scrim — a mouseup outside the modal reads as "clicked the backdrop". Worth checking `openEditor`'s scrim `onclick` in `js/editor.js`.

**Two parked design items**, both Andra's, neither to be actioned without discussing first:
- The banner's overall height (now about a third of its original size, so possibly already answered).
- The wonder symbol glyphs (`?` `!` `→` `★`) get a design pass eventually.

**Four "for later" ideas**, recorded in `dash-desk-addendum.md` §14.22:
- Show attached drawings/images on the card itself (`sketchThumb()` in `views/shared.js` already does this for list rows).
- Dragging a card toward the drawer should open it, so it can be dropped back in.
- Rename "Unplaced" to something more on-brand.
- Double-click empty desk to create a post-it there — belongs with D2.

---

## What was fixed, and the rules that came out of it

Every one of these was a real bug that shipped. The rules are what stop them coming back.

### Data integrity (both silent, both closed)

1. **A create op could wipe a desk placement.** Logs arrive in any order, so an op for an entry can land before the op that created it. The create's blank `viewState` was being assigned over the real one. Fixed by excluding `viewState` from create-skeleton filling in `fillCreateBlanks` — exactly as `milestones` already was. **Rule: sub-record collections are never skeleton-supplied.**

2. **A stale remote snapshot ate local edits.** `loadSnapshot()` assigned over live items including their `_fieldTs` bookkeeping, so anything typed since that snapshot was written vanished — this is why new entry titles reverted to "Untitled". Fixed: a snapshot is a *base*; the device's own log replays over it and pending ops are re-applied. **Rule: a snapshot is never the truth, only a starting point.**

### The render/sync environment (Fable's review, steps 1–4 of 5)

3. **The app was syncing with itself.** `flush()` wrote `snapshot.json` but never updated `_lastSnapText`, the "already seen this" marker that only the pull path set. Every poll re-downloaded the device's own file and did a full reload + rebuild, 8–10 seconds after every edit. **This was the single highest-value fix** — those random rebuilds were killing drags mid-gesture and dropping scroll input.

4. **The raise was writing on pointerdown.** Touching a card wrote to the store, which re-rendered, which destroyed the card the pointer had just captured. One violation, four reported symptoms (extra click needed, drags not registering, drops snapping back, lag). The raise is now local and commits on release. **Rule (decision 52): the pointer owns the desk until it lets go — nothing writes between pointerdown and pointerup.**

5. **Renders from anywhere else could still kill a gesture.** Rule 4 only governed the desk's own writes. `scheduleRender()` in `app.js` now respects a hold, exposed as `ctx.holdRenders()`; the desk takes one on pointerdown and releases it on pointerup, pointercancel, window blur and teardown. It's a counter, not a flag, and a missed render runs once on release. **A leaked hold would freeze all rendering** — that's the failure mode to watch for.

6. **The glance corrupted the saved scroll position.** Took two attempts. A scaled element contributes its *scaled* box to scrollable overflow, so while the desk was zoomed out there was almost nothing to scroll and any restore was clamped to ~0 — then recorded as the new truth, so every later rebuild went to the corner. The first attempt (wait for the transition, then restore) still lost the race. The second removed the race: the surface now sits inside a **`.desk-sizer`** that holds 4400×2900 and never transforms, so the scrollable area is constant, the glance is purely a transform with the scroll offset folded in, and **the scroll position is never written at all**.

7. **The double-click memory died with every rebuild.** `lastTap` lived in `wireDesk`'s closure; the first click on a card that isn't on top *causes* a rebuild (it raises). Moved into `viewLocal`. Expanding now works on any card, not just the top one.

8. **Layout bugs the tests couldn't see:** the drawer was appended outside its positioned ancestor and opened a viewport-height below the fold; the desk shipped as a framed scroll box with scrollbars instead of an edge-to-edge pannable surface; the banner's buttons fell back to paper styling because `app.css` scoped the on-a-colour-ground rules to `.project-banner` and the new banner is `.on-ground`; the banner's ✧ was looked up before the surface was attached, so only the `Z` key worked.

### The standing rule about tests

**jsdom has no layout.** The render tests check structure and data and are worth having, but they cannot see position, size, overflow or visibility — and must never be trusted to. Anything geometric is verified by looking at it. Two shipped bugs (the off-screen drawer, the glance clamp) passed a green test suite.

Corollary that paid off twice: **extract the rule as a pure function and test that.** `symbolDrop()` and `glanceFrame()` are pure and tested; the symbol attach/detach bug failed twice while the logic was tangled in DOM structure and was fixed on the third attempt once it wasn't.

---

## How to work on this

- **No build step.** Vanilla ES modules, no bundler, no framework, nothing fetched from a CDN.
- **Deliverables are complete uploadable files**, plus a short plain-English "what changed and how to try it" note. Andra deploys by dragging folders into GitHub's web uploader and cannot debug code.
- **Theme tokens only** — no literal colours, sizes or fonts in components.
- **Every new JS file goes into `SHELL` in `sw.js` and `CACHE_VERSION` gets bumped, in the same upload.** Currently `dash-v36`.
- **Any format change** means the upload note must lead with "update every device before editing anything".
- Run the tests: `node tests/desk-d1.test.mjs` needs nothing; the other three need `npm install jsdom`.
- Update `docs/dash-current-state.md` when anything lands. It is how the next session knows what exists.

**Read `dash-desk-addendum.md` §14 before changing any visual decision** — §14.7 is the locked constants table and §14.20–§14.23 are the deploy-fix history. Settled decisions in §8 and §12 are not up for relitigation.
