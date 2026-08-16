# Dash — the Desk, D2 round 3: fixes and refinements

**Date:** August 16, 2026
**What this is:** the third pass on clips and post-its, plus one regression on
the Projects overview. Ready to upload.

---

## What to upload

Drag these to GitHub as **folders**:

- `js` — `desk.js`, `views/desk.js`, `views/project.js`
- `css` — `app.css`
- `docs` — this note
- `tests` — `desk-d2.test.mjs`, `README.md`, and one new file,
  `project-shelf.test.mjs`
- `sw.js` — **on its own**, as a loose file at the repo root

`sw.js` is bumped to **`dash-v43`**. Without it your devices keep serving v42.

No data format change. Nothing to update in any particular order.

---

## The four fixes

**1. The clip leans the other way.** Same angle, mirrored — so it hangs the way
a clip pinched from the right actually would, instead of leaning into the paper.
Every clip still gets its own slightly different lean, and the same one on every
device.

**2. The clip mark stays on the right when a clip opens.** Open a clip and the
paperclip stays where it was, on the right of the first card, above the row —
rather than hopping to the other side. It reads as the same object in both
states now.

**3. The banner clip icon, switched on, is a line drawing.** The silhouette
outlined in ink at the same hairline weight as the banner's own rules, with the
fill taken out — no block, no box. At rest it's unchanged: the quiet solid
glyph at 62%.

**4. The book spines don't shake any more.** Open the Projects overview and the
shelf just sits there.

---

## What the spine shake actually was

Worth reading, because it wasn't where any of us expected and the answer is a
bit more interesting than a stray line of CSS.

Nothing this round touched that page — not its markup, not its styling, not the
code that draws it. What it touched was how *often* the page gets thrown away
and rebuilt, and that turned out to be the whole story.

A spine's tilt is a CSS transition that fires when the pointer moves onto it.
The catch is that a browser works out "is the pointer on this?" **one step after
it puts the element on screen**. So a spine that is built underneath a pointer
that never moved starts flat, discovers a moment later that it's being hovered,
and then animates into the tilt — playing a gesture nobody performed. And
because every save anywhere in Dash redraws the whole screen, and the shelf
answered that by binning every spine and building new ones, that little
animation restarted on each redraw. Several redraws in a row is a shake; it
settles when they stop.

So there were two things wrong, and both are fixed at the cause rather than
smoothed over:

- **The shelf is no longer rebuilt.** It's built once when you arrive and
  updated in place after that, so a save that has nothing to do with projects
  now touches no spine at all, and adding or renaming one touches only that one.
- **A spine that appears under your pointer is simply born tilted**, instead of
  animating into a state your pointer was already in. Moving on and off a spine
  still animates exactly as it always did — that part is the point of it.

While I was in there: drawing the shelf used to re-read your entire archive once
per project, just to count entries. It now reads it once for all of them. That's
the same rule the desk already lives by, and the shelf had simply never been
included.

---

## What I'd check first

1. **Open Projects.** No shake, whatever your pointer is doing. Then hover a
   spine — the tilt should feel exactly as it always has.
2. **Search in the Projects band** and clear it again — spines should come and
   go correctly.
3. **Look at a closed clip.** The paperclip should hang off the right corner
   leaning the other way from before.
4. **Open the clip.** The paperclip should stay put, on the right of the first
   card.
5. **Press the clip icon in the banner** and watch it change from a solid glyph
   to an outline.

---

## For you to decide (nothing blocking)

- **Where the mark sits on an open clip.** I put it on the right of the *first
  card*, which is where the closed stack's right edge was — so it barely moves
  when you open a clip. The other reading of "on the right" would be the far
  right of the whole grid, which is unambiguous but throws the mark a long way
  sideways on a wide clip. Easy to switch if you'd rather have that.
- **The active icon's weight.** It's a true 1px outline, matched to the banner's
  rule lines as you asked. An outline is inherently lighter than a solid fill,
  so "on" now reads as *different* more than as *louder*. If you want it to
  shout a bit more, thickening the stroke is one number.

---

## Underneath

**366 checks**, all passing, including a new `tests/project-shelf.test.mjs` for
the shelf. jsdom can't see a pixel, but it *can* see whether a redraw kept an
element or replaced it — which is exactly the fact this bug was about, so the
test fails against the build that had it.

Three notes for whoever picks this up next:

**How the spine bug was found, since guessing failed twice.** Reading the diff
got nowhere, because the diff genuinely doesn't touch that page. It was found by
driving the real app in a browser and sampling the spines' computed transform
every frame — at which point the animation is plainly visible in the numbers.
The general lesson is the one this desk keeps relearning (§14.20, §14.24): a
rebuild is the setting, not usually the cause, and when something *is* visible
the question is what differs between the old paint and the new one. Here what
differed was a fresh element's hover state.

**A redraw is not free, and now there is a page that proves it.** Every view in
Dash rebuilds from scratch on every store write. That is fine for a list of
rows, and it is not fine for anything carrying live interaction state — a hover
transition, a text selection, a scroll position. The shelf is the second place
this has bitten (the desk was the first, §14.23). Anything built from here on
that has state the DOM is holding should reconcile rather than rebuild.

**Two clip constants remain untuned:** stack peek (7px/6px) and the lean's
magnitude (±7°, now mirrored). Still small named numbers in `js/desk.js`.
