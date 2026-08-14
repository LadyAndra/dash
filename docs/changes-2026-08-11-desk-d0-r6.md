# Dash — the Desk, Phase D0 round 6

**Date:** August 11, 2026
**What this is:** the doubled banner fixed, hierarchy on the facts line, and drawers that close when you click away. Same file, `mockups/desk-preview.html`. **Still nothing deployed, no `sw.js` change, no cache bump.**

Recorded in `dash-desk-addendum.md` §14.19.

---

## The doubled banner

A real bug, and a boring one. Banner B's own rule said "lay yourself out as a grid", which quietly counted as "be visible" — and because it sat later in the stylesheet than the rule that hides all the candidates, it beat it. So B was always drawing, underneath whichever banner you'd actually chosen. That's why the cream one appeared under the plum one.

Now only the switch itself is allowed to turn a candidate on. Pick A and you get A.

---

## Hierarchy on the facts line

You were right that it was too flat. It now goes by **weight**: the two things worth a glance — **what stage it's in** and **the name of what's next** — come up to full strength and weight, and the counts and labels drop back to about 58%. Nothing new is drawn: no boxes, no second colour, no extra shape on the line.

I built your tinted-box idea too so you could see them side by side — there's a **Hierarchy on the facts line** control with Weight / Chip / Both / Flat. Weight is the default. The chip isn't convoluted, it just adds a shape to a line whose whole job is to be quiet, and next to each other that shows. But have a look; if the chip reads better in place than it does in my head, take it.

Overdue is untouched by all of this — it stays at full ember weight, because it's an indicator, not texture.

---

## Drawers close when you click away

Open a drawer, click anywhere on the desk, and it zips shut with the same 380ms slide.

Per your answer, **that click does nothing else**: the card you clicked doesn't raise, the desk doesn't start panning. A click meant as "get out of my way" shouldn't also move your work. Click again and the desk behaves normally. Escape still closes it too, and clicking a control in the preview panel closes the drawer while still doing its own job.

---

## Confirmed and closed

- **The symbols work** — thank you for retesting. Closed after three attempts.
- **The coloured drawer stays.**
- Everything from rounds 1–4 is locked; §14.7 in the addendum is the full constants table, banner A per §14.17.

---

## What's left

Honestly, not much. If the facts line reads right and the banner is single now, **D0 is done** and D1 can start — the placement core, the `"vs"` op, the merge tests, and the desk replacing the real project page.

The two things still explicitly parked, so they don't get lost:

- **The banner's height** was your deferred item from round 3. It's now about a third of what it was, so it may already be answered — but it's still recorded as "discuss before changing anything else."
- **The wonder symbol glyphs** get their own design pass later.

---

## Notes for D1

- §14.7 constants; banner **A** with the facts line by weight (§14.19).
- **Only the `[data-banner]`-style switch may set `display` on a variant.** The doubled banner came from a variant's own rule doing it. Same trap exists anywhere else this pattern gets used.
- Click-outside closes the drawer and is **swallowed** — implemented as a capture-phase listener so the desk's own handler never runs. Clicks outside the desk close the drawer but are not swallowed.
- Still standing from earlier rounds: keep `symbolDrop` and `glanceFrame` pure and tested; teach `.mk` / `.status-ctl` a `--mk-dot` variable; widen `.project-banner .btn` to `.on-ground .btn`; the desk viewport owns its stacking context.
- Nothing added to `SHELL`; `CACHE_VERSION` stays `dash-v30`. `dash-current-state.md` gets written when D1 ships.
