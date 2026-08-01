# Home panels — what changed and how to try it

**Date:** 1 August 2026
**Files to upload:** `js/views/home.js`, `css/app.css`, `sw.js`
**Cache version:** `dash-v19` → `dash-v20`

---

## What changed, plainly

Home used to be one long vertical scroll: capture, then the dated list, then
the neglect register, all stacked in a single column. That's the thing that
"all blended together."

It's now a two-column board — Concept B from
`mockups/home-hierarchy-explorations.html`:

```
┌─────────────┬────────────────────────────────┐
│ I Accession │  ┌──────────────────────────┐  │
│ [capture]   │  │ DUE & COMING UP      06  │  │
│             │  │ Overdue / Today / 14d    │  │
│ ┌─────────┐ │  └──────────────────────────┘  │
│ │ 32      │ │  ┌──────────────────────────┐  │
│ │ In coll.│ │  │ FROM THE ARCHIVE         │  │
│ ├─────────┤ │  │ (the black mount panel)  │  │
│ │ 1  Due  │ │  └──────────────────────────┘  │
│ ├─────────┤ │                                │
│ │ 2  Over │ │                                │
│ ├─────────┤ │                                │
│ │ 3  14d  │ │                                │
│ └─────────┘ │                                │
└─────────────┴────────────────────────────────┘
```

Three visible differences:

1. **Capture moved into a narrow left rail** instead of running the full width
   at the top. It still comes first and still does exactly what it did.
2. **The counts became instruments.** The line that used to run under the date
   ("32 in collection · 1 due today · 2 overdue") is now four blocked readouts
   in the rail. Same numbers, read at a glance instead of as a sentence. The
   Overdue tile outlines itself in ember when it isn't zero.
3. **Today and the neglect register are now real panels** — each in its own
   bordered box with a header bar, sitting side by side with capture rather
   than stacked under it.

Nothing about the *contents* changed. Overdue / today / next-14-days, the
dismiss button, the milestone done-tick, tap-to-open, the read-aloud button,
the neglect register's ages and dot strip — all identical.

One small tidy: the neglect register no longer draws its own "Neglect register
/ Days since touched" bar, because the panel it now sits in already carries a
title and a right-hand label. Two headers stacked on each other was noise.

---

## The seam for adding panels later

This was the point of the exercise, so: `js/views/home.js` now has a `PANELS`
array near the top. A panel is a plain object, same idea as the view registry:

```js
{
  id: "weather",             // stable handle
  title: "Weather",          // shown in the header bar
  span: 1,                   // 1 = normal, 2 = full width
  right: "Portsmouth",       // optional right-hand readout
  render(container, ctx) { … },
}
```

Adding a panel is: write that object, put it in the array. You don't touch
`render()`, and you don't write any box markup — `renderPanel()` is the only
place panel chrome exists. If the shelved widgets (pet, weather, tide, train)
ever come back, this is where they'd live.

There's deliberately **no** `js/panels.js`. One view uses panels, so a separate
registry file would be a folder with nothing in it. That gets pulled out the
day a second view needs panels, not before.

**On growing to more columns.** The right-hand column is itself a grid that
lays out whatever the array hands it, so a third panel doesn't require
restructuring anything. It won't *spontaneously* rearrange, though: panels go
side by side only once the column is wide enough for two at 320px each, and
Home is currently capped at 900px wide, which isn't. So today you get one tidy
column of panels — which is right for two panels. When you want them two-up,
it's one number: `.sheet-page { max-width: … }` in `css/app.css`. No JS.

**On phones.** Below 820px — the same breakpoint the sidebar already uses —
everything collapses to a single column in this order: capture, stats, Due &
coming up, From the archive. The four stat tiles pair up two-by-two there so
they don't push the dated list off the bottom of the screen.

---

## How to try it before you deploy

There's a preview file you can open without uploading anything:

**`mockups/home-panels-preview.html`** — double-click it, it opens in your
browser. It's the real `tokens.css` and the real `app.css`, with stand-in rows
instead of your actual entries. Drag the window narrow and back to watch it
collapse at 820px. If it looks right there, it'll look right in the app.

(That file is a mockup, not app code. Don't upload it — nothing breaks if you
do, it's just not needed.)

## Then, to deploy

Upload these three, in any order:

- `js/views/home.js`
- `css/app.css`
- `sw.js`

Then hard-refresh Dash (or close and reopen the installed app). `sw.js` went
to `dash-v20`, which is what tells your devices to pick up the new files. No
new files were added, so the `SHELL` list in `sw.js` is unchanged.

**What to check once it's live:**

- Type something in capture and hit ⌘-Enter — it should file and the box
  should stay focused, exactly as before.
- The four rail numbers should match what the old masthead line said.
- Tap a row in Due & coming up — it should open the entry (or the project, for
  a milestone).
- Tick a milestone's done-circle — the row should vanish and the project's
  stage chip should advance.
- Turn your phone portrait — one column, capture at the top.

## Notes / judgment calls

- **Everything is tokens**, no literal colours, sizes or fonts. The two
  exceptions are layout track widths — the rail's `280px` (taken straight from
  the approved mockup) and the `320px` minimum a panel needs before it'll sit
  beside another one. Those are grid geometry rather than styling, and match
  how `.sheet-page`, `.kanban-col` and `.finder-col` already do it.
- Row hover inside a panel had to flip direction. Hover used to lighten a row
  to the raised cream — which is now the panel's own background, so it would
  have been invisible. Inside a panel, hover goes one step darker instead.
- `.mount-head` in `css/app.css` is now unused (see the tidy above). Left in
  place rather than deleted — it costs nothing and the class may come back.
- I couldn't render this in a browser from here, so the preview file above is
  doing that job. If anything looks off in it, say what and I'll fix it before
  you upload anything.
