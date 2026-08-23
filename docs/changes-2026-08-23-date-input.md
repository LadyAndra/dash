# Dash — the flip clock becomes the date input

**Date:** August 23, 2026 (right after the Calendar build)
**What this is:** the setting mechanism from `calendar.js` promoted out of the
Calendar and onto every date field in Dash. Ready to upload.

---

## Why this happened

Two things came up as soon as the Calendar landed.

**"I don't see it in the Calendar at all."** Fair — and my fault. I scoped the
mechanism to "the tray's Set date and any set-date affordance inside Calendar",
and then there turned out to be no *other* set-date affordance inside Calendar.
The tray only holds **undated phases**. If none of your projects has a phase
waiting for a date, the tray is empty, the line is dead, and the flip clock has
nowhere to appear. It was reachable in principle and invisible in practice.

**"It should always be the style of date input across Dash."** So now it is,
which also makes the first problem go away: click any mark on the Calendar, the
item opens, and the mechanism is right there on Due.

---

## What to upload

Drag these to GitHub as **folders**:

- `js` — `widgets/flipdate.js` (rewritten), plus edits to `editor.js`,
  `views/milestone-editor.js` and `views/calendar.js`
- `css` — one new file (`css/dateinput.css`) and a trimmed `css/calendar.css`
- `docs` — this note, the updated current-state doc, and a one-line addition to
  yesterday's calendar note
- `tests` — one new file, one updated, and an updated README
- `index.html` — loose root file. One new stylesheet line.
- `sw.js` — **on its own.** Bumped to **`dash-v102`**.

No new folders this time, and no data format change.

---

## How to try it

Open any entry. **Due** and **Remind me** are flip clocks now, sized down to fit
the column they were already in.

**Rest the pointer on a card and scroll.** That's it — no clicking it open
first. That was the whole ask, and it's the difference between an instrument
sitting on the form and a field you have to go and operate. Everything else
still works too: Tab to a card and use ↑/↓, type the digits ("2" then "7" lands
on 27), drag it on a touchscreen, or press **TYPE** for an ordinary date field.

Roll the day past the end of the month and the month card carries with it.

**Phases work the same way** — open a project's milestones and the two date
fields there are the same mechanism, same size.

**The Calendar's tray keeps the big one.** Same machine, full size, because
there it's the only thing happening on the screen.

### Three things that are new, and deliberate

**An empty field looks empty.** Remind me usually has no date, so it shows three
blank drums with dots rather than pretending it's set to today. Scroll it once
and it lands on **today** — not tomorrow — so "put a date on this" is one notch,
not a separate step. **CLEAR** takes it back to empty.

**You can see when something isn't saved yet.** Every other field in that editor
saves itself as you go. This one deliberately doesn't write per tick — that's
what stops thirty scrolls becoming thirty saves. So while the cards show
something that hasn't been saved, the housing takes a dark edge and **SET**
lights up. When they match, SET goes quiet.

**But you can't lose one.** In the editors, one save lands about a second and a
half after you stop scrolling, whether or not you press SET — and closing the
editor commits anything still pending, the same way a half-typed tag already
does. Press SET if you want it now; ignore it entirely and nothing is lost.

The **Calendar tray is the exception**: there, SET is the only way. Putting a
date on an unscheduled phase is a decision with a consequence — the phase leaves
the tray and lands on the strip — so nothing should make it on your behalf.

### One side effect worth knowing

Scrolling with the pointer over a date card ticks the date instead of scrolling
the page. That is exactly what you asked for, and it's the right trade — but if
you're scrolling a long editor and the cursor happens to be sitting on a date,
that's what will happen. Move the pointer off the card and the page scrolls
normally.

---

## What was verified

`tests/dateinput.test.mjs` is new — 65 checks covering the compact size (every
card still clears the 44px touch floor, every numeral still 18px or larger), the
empty state and its seeding, clearing, the saved-vs-unsaved signal, both safety
nets, and hover-and-scroll working with nothing focused and nothing clicked.
`tests/calendar.test.mjs` picked up two more. The whole suite — 19 files — is
green, run against a real commit.

The date arithmetic itself (carry across month ends, leap years, clamping on a
month change) is still tested in `tests/calendar.test.mjs`, where it was
written, because that's §4 of the Calendar design and it hasn't changed.

I also opened the real item editor and the real phase drawer in a browser at
both themes and checked the geometry by eye and by measurement — the widget is
194px in a 194px cell in the editor and 240px in its 240px cell in the phase
drawer, with no overflow in either, and hovering-and-scrolling with zero clicks
moved 31 MAR 2027 to 03 APR 2027 and saved itself a beat later.

### One small piece of dead CSS left behind

`.ms-date` and `.field input[type="date"]` in `app.css` styled the native
pickers that are gone now. They're harmless, and removing them means
re-uploading a 165KB file for nothing, so they can go the next time `app.css`
is being touched anyway.
