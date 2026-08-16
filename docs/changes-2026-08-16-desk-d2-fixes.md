# Dash — the Desk, D2 round 2: fixes and refinements

**Date:** August 16, 2026
**What this is:** the second pass on clips and post-its. Ready to upload.

*(The brief asked for this to be filed as `changes-2026-08-15-…`. It's dated
the 16th instead, so it sits after `changes-2026-08-16-desk-d2-clips-postits.md`
in the folder rather than before the thing it fixes.)*

---

## What to upload

Same as always — drag these to GitHub as **folders**:

- `js` — `desk.js`, `views/desk.js`, `store.js`, `merge-notes.js`
- `css` — `app.css`
- `docs` — this note
- `tests` — the two D2 test files, the README, and one new file,
  `visual-harness.html`
- `sw.js` — **on its own**, as a loose file at the repo root

`sw.js` is bumped to **`dash-v42`**. Without it your devices keep serving v41
and none of this appears.

**No data format change to worry about.** `formatVersion` stays 3. There is one
new field on a post-it (below), and a device running the old code simply
ignores it — nothing is lost either way, and there's no "update everything
first" step.

---

## The four bugs

**1. A post-it's words no longer disappear.**
Make a post-it, move the mouse, then type. The words stay.

What was happening: "emptying a post-it throws it away" had been built as "it's
empty when it loses the cursor, so throw it away" — and a post-it you have
never typed into is empty from the moment it's made. So anything that took the
cursor away before your first keystroke quietly binned it, and the commonest
thing that does that is pressing on bare desk to nudge the view. The desk holds
still during a gesture, so the scrap sat there looking perfectly alive while you
typed into something that was already gone; the words vanished at the next
redraw. Now a post-it is only thrown away by *emptying* it, and you can't empty
something you never filled.

Two things follow from that, both worth knowing:

- **A blank post-it now stays put when you click away.** Press **Escape** while
  it's still blank and it's gone — so an accidental double-click still costs one
  keystroke, it just no longer costs a real note the same keystroke by mistake.
  Right-click → *Throw this away* still works, and so does clearing the words out
  of one that had them.
- **If a post-it does get thrown away while you're typing into it, the words
  win** — it comes back with them in it, rather than swallowing them.

**2. Open-grid cards no longer overlap, and show their full width.**
Open a clip and every card is completely visible, however wide it is and however
many there are. The grid used to space columns 300px apart while cards size
themselves up to 410px, so anything wide sat under its neighbour. Columns are now
spaced by the widest card actually there, and the number of columns is whatever
fits — still three when there's room, fewer on a narrow window, wrapping into
rows for a big clip instead of walking off the desk.

**3. An expanded card sits on top.** Double-click a card inside an open clip and
it's fully in front of everything around it, including the ones it overlaps.

**4. Cursor and text selection inside an expanded card.** Over the body you now
get a text cursor, and selecting text stays inside the card instead of sweeping
up into the banner. The header still shows the grab cursor, because that's still
the part you drag it by.

---

## The confirmed changes

- **The clip moved to the right.** The stack's cards line up on their **right**
  edges and the paperclip pins them from there. Because a card sizes itself to
  its title, lining the *left* edges up left the right edges ragged by up to
  150px — so this isn't only about which hand you use, it's the only edge that's
  the same for every sheet.
- **The banner's top row has no button chrome.** No outlines, no boxes — just the
  words, with a soft wash on hover. Every button keeps its full size, its tap
  target and its focus ring; only the resting outline is gone.
- **The clip icon**: quiet at rest, a plain glyph in the softest ink the banner
  uses, no box at all. Switched on, it flips to a solid block of the banner's ink
  with the clip knocked out of it in your project's colour.
- **Post-it tint** is untouched at 18%, as confirmed.
- **Stack peek (7px/6px) and paperclip lean (~7°)** are untouched. Grid column
  count is now worked out rather than fixed, which is bug 2 — three across is
  still what you'll usually see.

## Post-its stay where you drop them on a clip

The approved change. A post-it dropped onto a clip now sits **exactly where you
dropped it**, and dragging it around the clip moves it, the same way a wonder
symbol works. Drag it back onto open desk and it comes off and stays where it
lands, as before. Post-its already on a clip from the first round get put in one
sensible spot below the stack, once, until the first time you move them — and
none of them will be sitting on top of the paperclip any more.

Under the hood this is one new field on a post-it (`offset`) rather than
overloading the one it already had, so `pos` goes back to meaning only "where it
sits while it's loose". One small extra: unclipping now hands any attached
post-it a real position at the spot it's already sitting, instead of leaving it
to fall back to the corner of the desk.

---

## What I'd check first

1. **Double-click bare desk, move the mouse, then type, then click away.** The
   words should be there. Then try Escape on a fresh blank one — it should go.
2. **Clip three cards with very different title lengths.** The right-hand edges
   should line up under the paperclip.
3. **Open that clip.** All three fully visible, nothing overlapping. Now make the
   window narrower and open it again — it should drop to two columns rather than
   squashing.
4. **Double-click a card inside the open clip.** It should come fully to the
   front. Try selecting a sentence in its body and dragging up past the top of
   the card — the selection should stop at the card's edge.
5. **Drag a post-it onto a clip, somewhere deliberate.** It should stay there,
   travel with the stack when you drag it, and not cover the paperclip.
6. **Look at the banner** in light and dark, and on a very pale project colour —
   the clip icon should read as present but quiet, and obvious when it's on.

---

## For you to decide (nothing blocking)

- **The clip icon's resting tone.** It's currently at 62% of the banner's ink —
  quiet, but still solid enough to be a control. If it wants to be fainter or
  stronger, that's one number in `css/app.css` (`--desk-clip-quiet`).
- **The "mode is on" treatment.** I read "a bold fill in the project's banner
  colour" as the glyph knocked out of a solid block of ink, since a glyph filled
  with the banner's own colour directly on the banner would be invisible. It
  reads clearly, but say the word if you meant something else.
- **A blank post-it now sticks around** until you press Escape or throw it away.
  If blank scraps start piling up and you'd rather clicking away binned them
  again, that's a small change — but it can't go back to exactly how it was,
  because that's what was eating your words.

---

## Underneath

Nothing about the architecture moved. Clips still store no position and no
member list; a stack's geometry is still derived from its members every render,
so dragging one is still one ordinary position op per member.

Two notes for whoever picks this up next:

**The open grid is now measured, not calculated.** A card's width is the
browser's answer, not ours, so the grid is laid out from the real boxes the
instant the page lands in the document — the same mount hook the typing flicker
fix uses, which runs before anything paints, so nothing is ever seen moving.
`js/desk.js` still does all the arithmetic and stays DOM-free; the view hands it
the measurements. This is the general shape for anything on this desk that
depends on how big something turned out to be.

**Two bugs this round were the same shape as ones already recorded, and both
were CSS specificity.** The expanded card's cursor was being overridden by
`.dcard.is-clipped`, written later in the sheet at equal specificity; and the
clip icon's quiet colour was being overridden by `.on-ground .btn`, written
earlier at *higher* specificity. §14.19's round-5 bug was the same lesson. Worth
stating as a rule for this stylesheet: **a rule that is meant to be an exception
has to out-specify what it's excepting, not merely follow it.**

**333 → 337 checks**, and every one of this round's bugs has one that fails
against the build that had it. Run them with `node tests/desk-d2.test.mjs` and
`node tests/desk-d2.render.test.mjs`; the second needs `npm install jsdom`.

There's also a new `tests/visual-harness.html` — not a test and not deployed. It
draws a real desk from the real code so the things a headless test can't see can
be looked at, which is the standing rule for anything geometric here. Serve the
repo folder and open it in a browser.
