# Projects detail page + colour as ground — what changed

**Date:** 1 August 2026
**Files to upload:** `css/tokens.css`, `css/app.css`, `js/store.js`,
`js/views/shared.js`, `js/views/home.js`, `js/views/project.js`, `sw.js`
**Cache version:** `dash-v21` → `dash-v22`

This supersedes the earlier Home-panels handoff — it's the same work plus this
round, so upload the list above and you're current on both.

---

## The system change first, because it's the part that spreads

You asked to apply this across Dash, so this round is mostly **one system
change plus one page that demonstrates it.** The rest of the views can then
adopt it a page at a time without any new plumbing.

### Colour is now allowed to be a ground

Your tokens file said the accent is an indicator only, never decoration. That
rule now reads more precisely:

- **Ember** is still an indicator and *only* an indicator. Overdue, stale, sync
  trouble. Nothing else, anywhere.
- **The seven palette colours** (green, clay, blue, ochre, plum, slate, gray)
  may now be filled blocks with ink on top, not just thin marks.

They don't collide, because ember isn't in the palette. A plum project block
and an ember overdue block can sit on the same page and still say two
different things.

**The good news I wasn't expecting:** I measured all seven as backgrounds
before writing anything, and every one already passes AA with your existing
"ink on accent" token — worst pair 5.32:1, best 7.62:1, in *both* themes. So
colour-as-ground needed **no new colour tokens at all.** And because that ink
token flips per theme (cream on paper, near-black on the mount), a colour block
stays legible through a re-theme with nothing extra to maintain.

### Scale is now a real step

Added one token: `--text-3xl` (56px). All four of your references get their
hierarchy from a big size jump rather than from more colour, and Dash didn't
have a step above 40px. That's what makes a dense page have an obvious top.
It drops to 40px on phones, where 56px would eat the screen before you read a
word.

### Any item can carry its own colour

New field on the data: `color`. Null means "use my type's colour", which is
what everything did before and still does until you pick something — so
there's no migration, and an older device that receives a colour change applies
it harmlessly and just doesn't draw it. The value is a palette *name*, never a
hex code, so it re-themes with everything else.

It's on **every item**, not just projects — so "let me pick a colour for this"
can be offered anywhere later without touching the data again.

---

## The project page

```
┌────────────────────────────────────────────────┐
│  IN PROGRESS · 3 OF 5          [OVERDUE]       │  ← the project's own
│                                                │    colour, filled
│  Dash                                          │  ← 56px
│  ────────────────────────────────────────────  │
│  NEXT   Ship the panel layout        28 JUL    │
└────────────────────────────────────────────────┘
┌──────────────┬─────────────────────────────────┐
│ 3/5    5     │  MILESTONES            03 / 05  │
│ Miles. Entr. │  01 ● Overdue  28 JUL           │
│              │     Ship the panel layout       │
│ COLOUR  plum │  02  4 AUG                      │
│ ●●●●●●● ⃠     │     Duedate Test                │
│              │  ─────────────────────────────  │
│ [← All]      │  ◆ QUICK IDEA              03   │
│ [Edit]       │  № 0022 Reply to the studio…    │
└──────────────┴─────────────────────────────────┘
```

What's different from before:

1. **It opens with the answer.** Stage, progress, and what's next are in the
   block at the top. You used to have to read the milestone list to work out
   where the project stood.
2. **The colour block is the project's identity.** Pick from seven swatches in
   the rail; there's a reset swatch for "just use the type default."
3. **Everything's in panels now** — milestones, and each entry type gets its
   own. Same panel component Home uses.
4. **Ember still gets through the colour block.** If the current stage's date
   has passed, an "Overdue" flag appears on the block regardless of what colour
   the project is. A project running late has to be able to say so.

The milestone editor itself is untouched — same drag-reorder, same dates, same
focus handling. It just sits inside a panel now, and its own "Milestones · 3 of
5 done" bar hides because the panel header already says that.

---

## Where panels moved

`renderPanel` moved from `js/views/home.js` to `js/views/shared.js`. That was
the exact trigger I wrote into the code last round: the box-drawing stays local
until a *second* view needs it, and Projects is that second view.

There's still no `js/panels.js` registry module — each view keeps its own
`PANELS` array, because what belongs on Home and what belongs on a project page
have nothing to say to each other.

---

## How to try it before you deploy

**Open `mockups/home-panels-preview.html`.** It now has buttons at the top:

- **Home** / **One project** — switch between the two pages
- **Toggle mount / cream** — worth doing on the project page especially, to see
  the colour block flip its ink
- **Cycle project colour** — steps through all seven so you can see which ones
  you actually like as a big block

Drag the window narrow to watch both pages stack at 820px.

That file is a mockup. Don't upload it.

---

## Then, to deploy

Seven files this time:

- `css/tokens.css` — the display size + the amended colour rule
- `css/app.css`
- `js/store.js` — the `color` field
- `js/views/shared.js` — colour helpers, colour picker, panels
- `js/views/home.js` — now imports panels instead of defining them
- `js/views/project.js`
- `sw.js` — `dash-v22`

`js/views/home.js` and `js/views/shared.js` **must go up together** — home now
imports `renderPanel` from shared, so uploading only one of them would break
Home. Everything else is independent.

No new files, so the `SHELL` list in `sw.js` is unchanged.

**What to check once it's live:**

- Open a project — the colour block should be at the top, and picking a swatch
  should change it immediately and stick after a refresh.
- Pick a colour on your phone too, and check it syncs across.
- Tick a milestone — the "3 of 5" and the "Next" line should both update.
- A project with an overdue milestone should show the ember Overdue flag on the
  block whatever colour the project is.
- Home should look exactly as it did last round. If Home breaks, it's the
  shared.js/home.js pairing above.

---

## Notes / judgment calls

- **Two new tokens total:** `--text-3xl`, and nothing else. Colour-as-ground
  reuses what you had.
- **One new data field:** `color`, nullable, no migration. This is the first
  time I've added to the data model — the Home work was explicitly layout-only.
  Worth knowing, because it's the kind of thing that's cheap now and annoying
  to undo later. If you'd rather projects took their colour from something
  existing instead, say so before you upload and I'll pull the field.
- `color-mix()` again, for the hairlines and the dot texture on the colour
  block. Computed from your ink token, not hardcoded.
- The milestone editor's own header is hidden by CSS rather than by editing
  `milestone-editor.js`. That file has focus bookkeeping in it and wasn't worth
  disturbing for something cosmetic.
- I still can't run a browser here, so the preview file is doing the seeing.

## What's next, when you want it

1. **The projects list** — you picked "detail first," so this is the other
   half: colour blocks per row, progress, next date, so you can tell at a
   glance which project needs you.
2. **Rolling the ground + scale treatment into List / Board / Kanban / Finder.**
   The plumbing is now all in `shared.js`, so each of those is a small pass
   rather than a rebuild.
