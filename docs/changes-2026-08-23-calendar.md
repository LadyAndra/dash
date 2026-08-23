# Dash — the Calendar view (Phase M3)

**Date:** August 23, 2026
**What this is:** Phase M3 of `dash-milestones-calendar-addendum.md`, built to the
approved design in `docs/calendar-design/dash-calendar-visual-architecture.md`.
Ready to upload.

---

## What to upload

Drag these to GitHub as **folders**, the way you always do:

- `assets` — **a brand new folder.** Two small SVGs. Dash has never had an
  `assets/` directory before, so make sure it lands at the top level, next to
  `js` and `css`, not inside one of them.
- `js` — two new files (`js/views/calendar.js`, `js/widgets/flipdate.js`) plus
  one small edit to `js/app.js`
- `css` — one new file (`css/calendar.css`) plus edits to `css/tokens.css`
- `docs` — this note and the updated current-state doc
- `tests` — two new test files, an updated README, and a look-at-it harness
  page. Not deployed, not served.
- `index.html` — a loose file at the repo root. One new stylesheet line.
- `sw.js` — **upload this one separately, on its own.** Also a loose root file.

`sw.js` is bumped to **`dash-v101`** and the five new files are in `SHELL`. If
you forget it, your devices keep serving the old code and the Calendar tab
never appears.

**No data format change.** `formatVersion` stays where it is. The Calendar is a
new *reader* of the milestone data you already have — nothing about how Dash
stores anything moved, and `js/entries.js` was not touched at all.

---

## How to try it

There is a new **Calendar** tab, after Project. It is desktop only — on a phone
it simply isn't in the tab strip, exactly like Project, and Home still carries
every date it would have shown you.

**Look at the top half first.** That's the approach. There's a heavy vertical
**NOW** line near the left, and everything you have a date for is drifting
toward it from the right. One horizontal lane per project, plus a lane at the
bottom for plain items.

Four months fit on one screen because the axis is **squashed**: tomorrow gets a
wide bay and, out at the far right, the gap between two lines is a whole month.
That's on purpose — near time is where you actually plan, so it gets the room.

Things to notice as you look:

- **Colour is only ever *which project*.** A mark's colour never means urgent.
- **How soon it is shows as how solid it is.** Anything in the next week is
  full-strength and hard-edged; further out the colour thins toward the paper
  and picks up a bit of grain, so a launch five weeks away is still recognisably
  the site project's blue — just not settled in yet.
- **Size is weight.** The biggest marks are a project's *final* milestone. The
  smallest are ordinary item due dates.
- **Ember still only means late.** Overdue things go solid ember, behind the NOW
  line, in a faint red field. That field is **sized by how much debt is in it** —
  with nothing overdue it shrinks to almost nothing, and it grows as things pile
  up. A widening red edge is itself the signal, before you read a word.
- **Reminders are hollow dashed rings** — a nudge, not a deadline.

**Hover any mark** (or Tab to it — every mark is keyboard-reachable) and a small
dark card appears *right at the mark* with the project, the thing, and how long
you've got. Click a mark to open the project. Marks more than a fortnight out
don't carry labels; that quiet is deliberate, and the hover card is what it's
for. On a crowded lane, labels that would collide are dropped rather than
overlapped — the marks are all still there and still hoverable.

**Approach / Month.** Top right. Month puts the same marks on an ordinary 1–31
day axis, with prev/next/Today. Approach is forward-facing, so finished things
don't appear there; **Month shows them as quiet hollow rings**, so a past month
reads as history. Whichever one you were last in is remembered on that device.

**The shelf, along the bottom.** Four slots:

1. **The month dial** — the month as a clock face, one faint orbit per project.
   Its best trick: anything **overdue falls out of orbit**, pulled into the
   middle in ember with a dashed tether back to where it should have been and a
   hollow ring left in its place. A month with debt in it looks structurally
   wrong before you've read anything.
2. **The load gauge** — a window over hills. Clear and warm when the next
   fortnight is quiet; a dark fog rises out of the valley as it fills, and the
   far hills disappear into it first. It never whites out completely — even at
   maximum about a fifth of the view stays. There's a number under it if you
   want one.
3. **The year radar** — deliberately tiny and dense. Every dated thing in the
   year as a speck; finished ones quiet, overdue ones ember, a hand for today.
   No labels, no hovering — it's texture that happens to be true.
4. **Nothing.** The fourth slot is empty on purpose.

Narrow the window and the shelf sheds in the order you picked: the radar goes
first, then the empty space; the dial and the gauge hold on longest.

**The bottom edge** is one line: `UNSCHEDULED · n`. Click it and it opens the
phases that have no date yet, grouped by project. Press **Set date →** and the
flip mechanism appears in place.

**The flip mechanism.** Three split-flap cards — day, month, year. Scroll on
one, or Tab to it and use ↑/↓, or just type the digits ("2" then "7" lands on
27), or press TYPE for an ordinary date field. Drag works too on a touchscreen,
one tick per short drag, no flick-and-spin. Every change is one flip; a jump of
five is five flips. Roll the day past the end of the month and the month card
carries with it, like a real flip clock at midnight. **Nothing is written until
you press SET** — you can scrub through three months and close it again and
Dash will have recorded nothing. SET writes one ordinary edit, and the phase
appears on the strip, the dial and the radar in the same instant.

**Motion.** The dial has a slow sweep arm, 75 seconds a turn. The MOTION button
turns it off and remembers that per device; if your Mac is set to reduce motion
it's off already, and so are the flip animations (the dates still change, just
instantly).

---

## Things worth knowing

**Dark mode needs no button here.** The prototypes each had their own Dark
toggle because they were standalone pages. In the real app the theme belongs to
Settings, and Calendar simply follows it — every colour on the screen is a theme
token, so flipping to dark re-paints the whole instrument without redrawing
anything. Adding a second place to change the theme would have been a small
lie about where that setting lives.

**The landscape in the window is still the placeholder art**, as agreed. When
you draw the real one, it replaces `assets/window-scene.svg` and nothing else
changes — bump `sw.js`'s cache version in the same upload and you're done. The
file itself explains the one rule the new art has to keep (each hill tagged
`class="ridge"` with a `data-depth`, farthest first) so the fog can still make
the distant hills vanish before the near ones.

**One thing I fixed on the way past.** `css/tokens.css` had a line where two
line breaks had been saved as the literal characters `\n`, which made the
`--focus-ring` token unreadable to the browser — it was being silently dropped
app-wide. Nothing looked broken because most focus styles are written out
longhand, but the Calendar's flip widget wanted it. It's one line, repaired.

---

## What was verified

`tests/calendar.test.mjs` (122 checks) and `tests/calendar.render.test.mjs`
(90 checks) are new. Between them they walk every boundary in the ramp, the
flip clock's carry across month ends and leap years, both axis functions, the
tooltip's edge clamping, the load score and the fog's continuity, the shelf's
shedding order, and the reduced-motion paths. The whole suite — 16 existing
files plus these two — is green.

Two of those checks are unusual and worth keeping:

- **The theme-swap audit** fails the build if a literal colour ever appears in
  `calendar.js`, `flipdate.js` or `calendar.css`. That is not tidiness: a baked
  colour is exactly what would force the instrument to redraw itself on a theme
  change, which the design forbids. (`assets/window-scene.svg` is exempt and
  says so — it's a picture, not a component.)
- **The ramp's percentages are checked against the tokens they claim to be**, so
  the numbers in the code and the numbers in `tokens.css` cannot quietly drift
  apart while the screen still looks fine.

`tests/calendar-harness.html` is not a test. It's a page that draws a real
Calendar from real code with sample data, so the things a headless test can
never see can be *looked at*. Serve the repo folder (`python3 -m http.server`)
and open `/tests/calendar-harness.html`. `?dark=1` for the mount theme,
`?heavy=1` to see the fog at its ceiling, `?quiet=1` to see the landscape clear,
`?w=1100` to watch the shelf shed.
