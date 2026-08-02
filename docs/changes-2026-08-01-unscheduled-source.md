# Change note — the Calendar's missing half of the contract

**Date:** August 1, 2026. **Cleanup #2 of the code-health review**
(`docs/review-2026-08-01-code-health.md`, §4.2). **Live at `dash-v28`.**

**Files changed:** `js/entries.js` only. (`sw.js` was already bumped to `dash-v28`
by cleanup #1 — no new files, so nothing to add to `SHELL`.)
**Behaviour changed:** none. Nothing on screen moves. This adds the query the
Calendar will need and doesn't yet build the Calendar.

---

## Why this had to happen before M3, not during

The milestones addendum (§6.3) requires the Calendar to carry a collapsed
**"Unscheduled"** tray: every milestone that has no date yet, grouped by project,
each with a way to give it a date. The reasoning there is the good kind — the moment
you're looking at a calendar is the moment you're thinking about time, so "this needs
a date" belongs one tap from the surface where the date will land. Leaving undated
phases out entirely would re-create the exact failure Dash exists to fight.

But `entries.js` only ever produced **dated** things. An undated milestone can't be an
"entry" — an entry has a `start`, and this has no date by definition. So there was
nothing for the tray to read.

Left as it was, `calendar.js` would have had to go rummaging through the archive
itself. That breaks the one structural rule §6.1 sets for this view — *"the calendar
never reads items directly"* — on the very first day, and it adds a second full scan
of everything you own on every redraw.

## What changed

- **Sources can now declare what they have that's real but unplaceable.** Alongside
  `fromItem` (dated things), a source may declare `unscheduledFromItem`. The
  milestone source now does. That keeps the pattern open: if a future source ever has
  its own notion of "no date yet", it says so the same way.
- **`calendarData(store, start, end)`** — one call that hands the Calendar everything
  it needs for one render: `entries` (the dated things), `days` (those bucketed into
  day cells for the month grid), `unscheduled` (the tray, grouped by project) and
  `unscheduledCount` (for the collapsed header).
- **All of it out of ONE walk of the archive.** Asking for the grid and the tray
  separately would be two. Verified: `calendarData` calls `store.all()` exactly once.
- **`groupByDay()` is now shared.** The Today panel was already bucketing entries into
  days privately; the month grid needs the same thing. Rather than let M3 write a
  second bucketing rule that could drift, the Today panel now uses the shared one.
  There is one definition, used twice.
- **`unscheduledFor(store)`** also exists standalone, if anything else ever wants the
  tray without a grid.

### The rules the tray follows

A milestone shows up in the tray when it has **no date**, is **not done**, and is
**not removed** — on a **project**. Two of those are judgement calls worth stating:

- **Done-and-undated is excluded.** A finished phase that never had a date isn't
  waiting to be scheduled; it's just finished.
- **Removed stays hidden**, like everywhere else. Tombstoned, not deleted — it's
  still in your data and still restorable from the project page.

Within a project, phases are listed in **pipeline order** (the order you dragged them
into), using the *same* comparison the project page uses — so the tray and the
milestone list can't disagree. Projects are listed alphabetically.

## How it was checked

Two things mattered: that nothing existing changed, and that the new thing is right.

- **Regression:** the old `entries.js` was kept and run side by side with the new one
  against 300 randomly generated archives — projects with and without milestones,
  undated / done / removed / order-less milestones, items with and without due dates
  and reminders, accented titles, empty archives. Across `entriesFor` (three
  different argument shapes), `todayGroups` and `overdueCount`: **1,500 out of 1,500
  comparisons byte-identical.** The Home panel and the tab badge cannot have moved.
- **The new tray:** 20 assertions covering every inclusion rule above, pipeline
  ordering, order-less milestones sorting last, two devices converging on the same
  order via `mid`, untitled projects and milestones, projects with no milestones
  array at all, done entries still appearing in past months (muted, per §6.2), and a
  hand-written ranged entry with `end` set bucketing without error — which is one of
  the addendum's stated definition-of-done items for M3. **All 20 pass.**
- **One archive pass** confirmed by counting `store.all()` calls.

One test of mine failed at first and was *my* mistake, worth writing down: I expected
two milestones of the same project falling on the same day to appear in pipeline
order in the grid. They appear **alphabetically**. That's the existing, documented
`compareEntries` rule ("date, then title") and it predates this change — but it's
worth knowing before you look at a month with two phases on one day and wonder.

---

## How to try it

1. Upload the **`js` folder**. (If you haven't yet uploaded cleanup #1, upload
   **`sw.js`** too — both changes share `dash-v28`.)
2. **Hard-reload once** — Cmd+Shift+R.

Then confirm **nothing changed**, which is the whole test here:

- **Home** — Overdue / Today / Next 14 days should be exactly as before, same
  entries, same day headings, same order.
- **The Home tab's overdue badge** — same number.
- **A project page** — milestones unchanged.

There is nothing new to *see* yet. This is the plumbing the Calendar plugs into.

---

## What M3 can now assume

When you're ready to build `js/views/calendar.js`, it needs one import:

```js
import { calendarData } from "../entries.js";
```

and one call per render, giving it the month grid, the agenda list and the
Unscheduled tray from a single pass. The "set a date" action on a tray row is the
ordinary milestone op that already exists — `store.setMilestoneField(projectId, mid,
"date", "YYYY-MM-DD")` — so the tray writes nothing new either.

Still to do before M3 proper: register the view in `app.js`, add the file to `SHELL`,
bump `CACHE_VERSION`. No model change, no query change, no merge change.
