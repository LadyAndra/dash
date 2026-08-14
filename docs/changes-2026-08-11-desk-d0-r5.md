# Dash — the Desk, Phase D0 round 5

**Date:** August 11, 2026
**What this is:** banner A refined, the drawer painted in the project's colour, and the three outstanding bugs fixed — the symbol one properly this time. Same file, `mockups/desk-preview.html`. **Still nothing deployed, no `sw.js` change, no cache bump.**

Recorded in `dash-desk-addendum.md` §14.17–§14.18; §14.7 is now the full constants table with your round-4 numbers in it.

---

## Banner A, refined

The name now owns the top line on its own, whatever its length — it never shares that row with the facts and can't be crowded by them. Everything else (stage, progress, entries, next) collapses into **one thin quiet line** underneath, in the small mono voice at reduced strength. It's there to be glanced at, not read.

The one thing that deliberately keeps full weight on that line is **Overdue**. It's an indicator, not texture, and it stops meaning anything if it fades into the row.

B and C got the same two-row structure so the comparison stays honest if you want to flip back, but A is the default now.

---

## The drawer wears the project's colour

Painted ground *and* elevation, as you asked — the shadow and the layering fix are separate from the colour and both are in.

This had one consequence worth knowing about, because it changes something small in the real app. Everything in that drawer — the rows, the status control, the milestone editor, the unplaced chips — was built for paper. Each is now drawn from the same `--ground-ink` value the banner's buttons already use, so it holds up on any project colour including a custom one.

**The type and status marks were the real problem.** Their colour comes from the registry — green for a note, ochre for waiting — and a registry colour isn't guaranteed to be readable *as text* on top of an arbitrary project colour. So inside the drawer the identity moves from the letters to the dot: the words draw in the drawer's ink, and the little 5px mark keeps its registry colour. A dot doesn't have to pass a contrast test; words do.

That's a small change to `app.css` in D1 (teach the mark to take its dot colour from a variable), and then one row renderer works on both paper and colour. It's written up.

---

## The three bugs

**Layering — found the actual cause.** The desk's scroll container was `position: relative` with no z-index, and that does *not* create a stacking context, so every card's z-index was competing directly with the banner and drawer at the top level of the page. Whichever card you'd touched most recently could win and paint over the drawer. One line fixes it properly. The drawer has always been absolutely positioned, so it never pushed the desk around — placements don't move when a drawer opens, and now can't be covered by them either.

**The glance now fits what's actually there.** It was fitting the desk's own 4400 × 2900 bounds, so ten cards shrank to nothing to show a lot of empty surface. It now fits the bounding box of the placed content plus padding, centred — and never scales *up*, so a nearly empty desk shows at its own size rather than being magnified. Works the same at ten cards or a hundred.

**The symbols — rewritten, not patched.** You were right to keep restating it, and the reason it failed twice is worth one paragraph.

Round 3 drew a pinned symbol *inside* its card. That looks like what "attached" means, but it isn't: a nested element lives in its card's stacking context, so it can't be lifted above other cards while you drag it, and it inherits the card's rotation on top of its own. Symbols are now always children of the desk, with their position **derived** — free means "from my own coordinates", pinned means "from my host card's current position plus my offset", which is literally what the data model says. One drag path, no nesting, no special cases.

I also pulled the drop decision out into a standalone rule and **tested it headlessly** — free→pinned, pinned→free, pinned→a different card, and the invariant that a symbol is only ever one kind at a time. Fourteen checks, all passing. That's the thing I should have done the first time; the reason the earlier fixes kept failing is that the rule was tangled up in the page structure instead of standing on its own.

Both symbols are near the cards. Drag either onto a card to pin it — it lands at the exact spot you drop it and rides that card afterwards — and drag it off onto open desk to un-pin it. The card you're about to attach to darkens its edge.

---

## What I need back

1. **The banner** — is the thin facts line quiet enough, and is the name line right?
2. **The coloured drawer** — does it read as standing above the desk now, and is the colour too much at full drawer height? (If it is, the fallback is colour on the drawer's edge and header with the contents on paper — say the word.)
3. **The symbols** — please try them again and tell me plainly if they're still wrong.

Everything else is locked. If those three land, D0 is done.

---

## Notes for D1

- **§14.7** is the constants table (all of rounds 2–4). **Banner A** per §14.17.
- **Keep `symbolDrop` a pure function and keep its tests.** Three attempts failed because the rule lived inside DOM structure. The same applies to `glanceFrame`.
- **Teach `.mk` and `.status-ctl` a `--mk-dot` variable** in `app.css` so one row renderer serves paper and colour grounds.
- **Widen `.project-banner .btn` to `.on-ground .btn`** rather than duplicating those rules for the banner and drawer.
- The desk viewport must own its stacking context (`z-index: 0; isolation: isolate`) or cards will fight the drawer. The drawer stays absolutely positioned: opening it must never reflow placements.
- Nothing added to `SHELL`; `CACHE_VERSION` stays `dash-v30`. `dash-current-state.md` untouched until D1 ships.
