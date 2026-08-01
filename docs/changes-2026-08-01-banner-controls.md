# The project banner takes over — rail gone, panels full width

**Date:** 1 August 2026
**Cache version:** `dash-v24` → `dash-v25`
**Files:** `css/tokens.css`, `css/app.css`, `js/views/project.js`,
`js/views/shared.js`, `sw.js`

---

## What changed

Everything you can do to a project now lives in the coloured bar:

```
████████████████████████████████████████████████████
█ IN PROGRESS · 3 OF 5 · 5 ENTRIES  [← ALL] [EDIT] █
█ ──────────────────────────────────────────────── █
█                                                  █
█ Dash                                             █
█                                                  █
█ ──────────────────────────────────────────────── █
█ NEXT  Ship the panel layout   28 JUL             █
█                                                  █
█ ──────────────────────────────────────────────── █
█ [＋ NEW ENTRY]  [＋ ADD EXISTING ENTRY]           █
████████████████████████████████████████████████████
┌────────────────────────┬─────────────────────────┐
│ MILESTONES      00/01  │ ⚡ QUICK IDEA        03  │
│ ⠿ □ Duedate Test       │ № 0019 E-ink notebook   │
│   DUE 08/04 REMIND …   │ № 0025 Homepage widget  │
└────────────────────────┴─────────────────────────┘
        side by side — nothing to scroll for
```

**The left rail is gone from project pages.** It was holding two stat tiles
and two buttons and charging 340px for it — and as your scrolled screenshot
showed, once you move down the page it's just an empty column watching you go
past.

**One of those stats turned out to be redundant.** The moment "0/1 MILESTONES"
sat next to the banner's "0 OF 1", they were obviously the same fact. So the
state line is now one line: `IN PROGRESS · 0 OF 1 · 3 ENTRIES`.

**The real win isn't tidiness, it's width.** With the rail gone the panels get
the whole page, so Milestones and Quick Idea sit *side by side* instead of
stacking. On your screen that's **two columns at the full 660px** — the widest
a panel is allowed to be.

I also nudged `--panel-min` from 420 to 480. Without it the extra width would
have been spent on a *third* narrow column, which is the trap we just climbed
out of.

**Home keeps its rail**, and that's deliberate rather than an oversight:
capture lives there and has to be reachable without hunting. The project rail
wasn't carrying anything comparable.

---

## Buttons on a colour you haven't picked yet

The tricky part. Those four buttons have to land on *any* colour, including a
hex the stylesheet has never seen.

They're drawn entirely from the two values the block sets on itself:

- outline buttons are the block's ink, on the block
- the primary inverts — the ink becomes the fill, and the block's own colour
  becomes the lettering

So they're exactly as readable as the banner's own text, which was already
measured at 5.3:1 or better for every palette colour. Nothing in the CSS names
a colour. Change the project to bright yellow and the buttons flip to dark
lettering along with everything else.

That needed one addition: `groundStyle` now emits `--ground-bg` as well as
`--ground-ink`, because a button can't use the block's colour as its text
colour unless CSS has a name for it.

---

## Try it

**Preview → "One project"**, then hit **Colour pickers** and change the colour
to watch the buttons follow. Worth trying the mount theme toggle too.

Drag the window narrow: the banner's nav buttons wrap under the state line,
and the panels stack.

---

## To deploy

Same four as always — the `js`, `css`, `docs` folders and `sw.js`. No new
files this round.

**What to check:**

- A project page should be one colour bar and then panels side by side, with
  nothing left in a left column.
- All four buttons in the bar should work: back, edit, new entry, add existing.
- On the phone the bar should stack and every button should still be
  finger-sized.
- Home should be unchanged — rail, capture, stats, neglect register.

## Still queued

1. **The projects list rebuild** — progress and next date per row, not just
   the colour edge it has now.
2. **Rolling ground + scale into List / Board / Kanban / Finder.**
