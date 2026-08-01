# Home panels — what changed and how to try it

**Date:** 1 August 2026
**Files to upload:** `js/views/home.js`, `css/app.css`, `sw.js`
**Cache version:** `dash-v19` → `dash-v21`

---

## What changed, plainly

Home used to be one long vertical scroll: capture, then the dated list, then
the neglect register, all stacked in a single column. That's the thing that
"all blended together."

It's now a two-column board — Concept B from
`mockups/home-hierarchy-explorations.html`, with the register moved into the
rail and the dated list colour-coded by urgency:

```
┌──────────────────┬─────────────────────────────┐
│ I ACCESSION      │  DUE & COMING UP        06  │
│ [capture]        │ ╔═══════════════════════════╗
│                  │ ║ OVERDUE               2  ║ ← solid ember
│ ┌───────┬──────┐ │ ║ № 0009  Ship the panel …  ║
│ │ 32    │ 1    │ │ ║ № 0022  Reply to the stu… ║
│ │ In c… │ Due… │ │ ╚═══════════════════════════╝
│ ├───────┼──────┤ │  ┌─────────────────────────┐
│ │ 2 ⚠   │ 3    │ │  │ TODAY               1   │ ← bordered well
│ │ Over… │ Next │ │  │ № 0014  Duedate Test    │
│ └───────┴──────┘ │  └─────────────────────────┘
│ ┌──────────────┐ │  NEXT 14 DAYS           3    ← plain
│ │FROM THE ARCH.│ │  4 AUG        in 3 days
│ │ № 0003 Freel…│ │  № 0014  Dash · Duedate Test
│ │        94d   │ │  5 AUG        in 4 days
│ │ № 0021 E-ink…│ │  № 0018  Follow up — sample
│ │        61d   │ │
│ └──────────────┘ │
└──────────────────┴─────────────────────────────┘
```

Four visible differences:

1. **Capture moved into a 340px left rail** instead of running the full width
   at the top. It still comes first and still does exactly what it did.
2. **The counts became instruments.** The line that used to run under the date
   ("32 in collection · 1 due today · 2 overdue") is now four blocked readouts,
   two-by-two, in the rail. Same numbers, read at a glance instead of as a
   sentence. The Overdue tile outlines itself in ember when it isn't zero.
3. **The neglect register sits at the bottom of the rail**, in its own bordered
   panel. Its rows use the compact catalogue-number column so titles get about
   200px — enough that "Freelance transition" stays on one line.
4. **Due & coming up reads as three registers, loud to quiet** — see below.

Nothing about what any of it *does* changed. Overdue / today / next-14-days,
the dismiss button, the milestone done-tick, tap-to-open, the read-aloud
button, the register's ages and dot strip — all identical.

One small tidy: the neglect register no longer draws its own "Neglect register
/ Days since touched" bar, because the panel it now sits in already carries a
title and a right-hand label. Two headers stacked on each other was noise.

---

## Urgency temperature

The three sections of Due & coming up are now three visual registers:

| | |
|---|---|
| **Overdue** | solid ember block, bled out to the panel's edges, cream ink |
| **Today** | a bordered well, one step darker than the panel ground |
| **Upcoming** | plain. No box, no fill. |

Worth saying why it's urgency and not entry type, since colour-coding could
have meant either: **ember already means "past its date"** everywhere else in
Dash. Coding by urgency turns up the volume on a signal that already exists
rather than introducing a second colour language on top of it. It also means a
day with nothing overdue has no ember anywhere on the page — the block simply
isn't drawn — which is the behaviour you want from an alarm.

Inside the ember block, the type and status marks give up their registry
colours and go cream. A registry green on an ember ground is unreadable, and
on that block the block owns the ink.

**Contrast, checked:** cream ink on ember is 5.45:1, and in the mount theme it
flips to near-black on orange at 6.57:1 — both comfortably past AA. The Today
well is 13.26:1. The hairlines inside the ember block are derived from the
theme's own "ink on accent" token via `color-mix()`, so they follow a re-theme
automatically instead of needing a second set of tokens kept in sync by hand.

---

## The seam for adding panels later

`js/views/home.js` has a `PANELS` array near the top. A panel is a plain
object, same idea as the view registry:

```js
{
  id: "weather",             // stable handle
  title: "Weather",          // shown in the header bar
  column: "rail",            // "rail" = left column; omit for the right
  span: 1,                   // 1 = normal, 2 = full width
  right: "Portsmouth",       // optional right-hand readout
  render(container, ctx) { … },
}
```

Adding a panel is: write that object, put it in the array. You don't touch
`render()`, and you don't write any box markup — `renderPanel()` is the only
place panel chrome exists. Moving a panel between columns is one word. If the
shelved widgets (pet, weather, tide, train) ever come back, this is where.

There's deliberately **no** `js/panels.js`. One view uses panels, so a separate
registry file would be a folder with nothing in it. That gets pulled out the
day a second view needs panels, not before.

**On growing to more columns.** The right-hand column is itself a grid that
lays out whatever the array hands it, so a third panel needs no restructuring.
It won't *spontaneously* rearrange, though: panels sit side by side only once
that column is wide enough for two at 320px each, and Home is capped at 900px,
which isn't. When you want them two-up, it's one number: `.sheet-page {
max-width: … }` in `css/app.css`. No JS.

**On phones.** Below 820px — the same breakpoint the sidebar already uses —
everything collapses to a single column in this order: capture, stats, From
the archive, Due & coming up.

---

## How to try it before you deploy

**Open `mockups/home-panels-preview.html`** — double-click it, it opens in your
browser. It's the real `tokens.css` and the real `app.css`, with stand-in rows
instead of your actual entries. There's a button at the top to flip between
the cream and mount themes (worth doing — the ember block inverts its ink), and
you can drag the window narrow to watch it stack at 820px.

That file is a mockup, not app code. Don't upload it — nothing breaks if you
do, it's just not needed.

## Then, to deploy

Upload these three, in any order:

- `js/views/home.js`
- `css/app.css`
- `sw.js`

Then hard-refresh Dash (or close and reopen the installed app). `sw.js` went to
`dash-v21`, which is what tells your devices to pick up the new files. No new
files were added, so the `SHELL` list in `sw.js` is unchanged.

**What to check once it's live:**

- Type something in capture and hit ⌘-Enter — it should file and the box
  should stay focused, exactly as before.
- The four rail numbers should match what the old masthead line said.
- Tap a row in Due & coming up — it should open the entry (or the project, for
  a milestone). Rows inside the ember block should still open normally.
- Tick a milestone's done-circle — the row should vanish and the project's
  stage chip should advance.
- Turn your phone portrait — one column, capture at the top.

## Notes / judgment calls

- **Everything is tokens**, no literal colours, sizes or fonts. Two exceptions,
  both layout geometry rather than styling: the rail's `340px` and the `320px`
  minimum a panel needs before it'll sit beside another one. That matches how
  `.sheet-page`, `.kanban-col` and `.finder-col` already do it.
- `color-mix()` is used for the hairlines and hover wash inside the ember
  block. It isn't a hardcoded value — it's computed from `--text-on-accent`, so
  it re-themes for free. It's been supported in Safari and Chrome since 2023.
- There's one `!important` in the new CSS, on the marks inside the ember block.
  It's load-bearing: type and status marks carry an *inline* colour from your
  registry, and inline styles can't be overridden any other way. It's commented
  in place.
- Row hover had to flip direction twice. Hover used to lighten a row to the
  raised cream — which is now the panel's own background. Inside a panel it
  goes one step darker; inside the Today well it goes back to lighter; inside
  the ember block it's a faint cream wash.
- `.mount-head` in `css/app.css` is now unused (see the tidy above). Left in
  place rather than deleted — it costs nothing and the class may come back.
- I still can't render this in a browser from here, so the preview file is
  doing that job. If anything looks off in it, say what and I'll fix it before
  you upload anything.
