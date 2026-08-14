# Dash — the Desk, Phase D0 round 4

**Date:** August 11, 2026
**What this is:** round-3 numbers locked, three fixes, and **three new banner candidates to choose between**. Same file, `mockups/desk-preview.html`. **Still nothing deployed, no `sw.js` change, no cache bump.**

Everything is recorded in `dash-desk-addendum.md` §14.12–§14.16.

---

## The banner — pick one

This is the main thing I need from this round. There's a **Which one** control at the top of the tuning panel with four options. All four carry exactly the same content — name, catalogue number, stage · progress · entries, what's next, the overdue mark, all four actions, the glance mark. What differs is how much of the project's colour gets spent and how tightly the facts pack.

- **A — ledger band.** The colour still runs the full width, but as a band rather than a block. Name on the left, the facts in ruled cells across the middle, actions on the right.
- **B — spine.** The colour becomes an edge down the left side, the same way a project already wears it on the shelf, and everything else sits on paper. The quietest, and the one that gives the desk the most room.
- **C — tab.** The colour is spent on one thing only: a tab carrying the project's name — the die-cut label from your references. Most graphic personality; colour reads as identity rather than as a surface.
- **D — as built**, so you can flip back and see the height difference.

All three new ones are roughly a third of D's height, and all three share one device I'd keep whichever wins: **a ruled specification grid** — small mono label above a full-size value, hairline dividers between. That's the ledger voice Dash already writes in, used to carry structure instead of decoration. It's what the Wiener Werkstätte invoice and the Dutch specification card are both doing, and it's why the facts can pack this tightly and still be readable.

The accessibility floor is intact and I checked it rather than assuming: values and content stay at 18px+, the 11px mono is used only for labels (exactly as `.lbl` already is on every row and panel in the app today), every button keeps its minimum size, and all the colour comes from the same two tokens the banner already sets — so contrast holds through a re-theme and for a custom hex.

Feel free to say "B's spine but C's tab for the name" or similar — these are three points on a range, not a menu of finished things.

---

## The three fixes

**The Collapse button is gone.** You're right, it was redundant. Double-click again or Escape.

**The glance now centres.** It was anchoring at the surface's top-left corner and dumping all the slack into one margin down and to the right. It now fits *and* centres, with a small even margin — zoomed out exactly far enough to see everything.

**The mat stopped growing with the desk.** That was a real error on my part: the graphic was sized from the desk's bounds, so making the desk bigger inflated the mat with it. It now has its own fixed footprint — 2000px wide at 3:2, centred on the desk, indifferent to how large the desk is. There's a **Footprint** slider since "modest" is a judgment call. It still shrinks with everything else during a glance, which was never the objection.

**And confirmed, in writing:** the mat is decorative and inert. It's not a container, a drop zone or a boundary — cards sit on it, half on it, or nowhere near it, and nothing about placement changes. That's now a numbered decision specifically so nothing later makes it accidentally magnetic.

---

## Your two future items

Both are written into the addendum, along with the answer to the question you actually asked — whether they change how anything gets structured now. **They don't.**

Coloured shapes to group things on, and desk widgets, are both project-side desk objects, which is exactly what the `"dk"` op already carries. Each becomes one more collection next to clips, symbols and post-its: no new op kind, no new merge code, no change to anything in D1–D4. That op was written addressed by collection precisely so this kind of thing is an addition rather than a migration.

The one thing I flagged for when you pick them up: a shape that *holds* entries is a different animal from the mat, and the membership would live on the card the way clip membership already does. A shape cards merely sit on top of stores nothing.

---

## What I need back

1. **Which banner** — A, B, C, or a combination.
2. **Mat footprint** — is 2000px about right?
3. Anything that broke against looseness 0.60, since everything got tighter.

That should be D0 done.

---

## Notes for D1

- §14.7 plus §14.12 are the constants; §14.14 is the banner brief.
- `app.css` scopes its on-a-colour-ground button rules to `.project-banner .btn`. Whichever banner wins, **widen that selector to `.on-ground .btn`** rather than duplicating it — the mockup's version is a stand-in for that change.
- The mat is generated, centred, fixed-size, and `pointer-events: none`. Do not let it acquire opinions about placement (§14.13).
- Glance = fit *and* centre: scale to fit, then translate the leftover space evenly. Still no persisted zoom state.
- Nothing added to `SHELL`; `CACHE_VERSION` stays `dash-v30`. `dash-current-state.md` untouched until D1 ships.
