# Dash — the corner cluster, part 1: the pet

**Date:** July 31, 2026
**What this is:** the first of the four Home-screen corner widgets. The pet only. Weather, tide and train come in later rounds and drop into the same container with no changes to what's here.

---

## What to upload

Drag these to GitHub, as **folders** (not loose files), the way you always do:

- `js` — one new folder, `js/widgets/`, with four new files, plus edits to `app.js` and `store.js`
- `css` — `app.css` has a new section at the bottom
- `docs` — this note plus the updated current-state doc
- `sw.js` — **upload this one separately, on its own.** It's a loose file at the repo root.

`sw.js` is bumped to `dash-v12`. If you forget it, your devices keep serving the old code and none of this appears.

**New files:**

```
js/widgets/motion.js    the shared motion timing all four widgets use
js/widgets/shapes.js    the body and the three transformations
js/widgets/cluster.js   the floating corner container
js/widgets/pet.js       the character, its face and its moods
```

---

## What it is

**One creature**: a round near-black body on two legs, with two very large eyes. Always recognisably the same thing. It doesn't turn into different objects to tell you how it feels — it tells you with its eyes and with how its body holds itself.

Drawn in `--text-primary`, not `--ember`. Your own tokens file says ember is an indicator only — overdue, stale, sync trouble — never decoration, and I had it wrong the first time. Near-black is a *material* in the specimen-archive system, which is exactly right for a cut-paper character. On the dark theme that token becomes warm cream, so it inverts to a cream silhouette on the black ground with no code change.

### Why the six-shape version was worse

The first attempt rotated through six forms — square in the morning, blob by day, heart in the evening, flower, burst, puddle. You said it felt lumpy and that the states didn't feel different, and both were right for reasons worth writing down:

**More shapes made the states *less* distinct, not more.** At the size this actually renders — about 100px — a heart, a blob and a puddle all read as "dark round thing." The differences are obvious at 300px and gone at 100px. So the variety was theoretical while the identity was thrown away.

**The lumpiness was a specific mistake.** To make it look hand-made I jittered each of the 48 outline points randomly. That's high-frequency noise, and it reads as *bumpy*. A real scissor cut or brush stroke has long smooth runs with a few deliberate deviations. The edge is now perfectly clean, which has a second benefit: with no texture in the outline, anything you *do* notice in the silhouette is meaning.

### The three transformations

Everything else is carried by the face and the body. It transforms only when it's earned:

| When | Form | For |
|---|---|---|
| You mark something done | **Burst** — six sharp points | ~1.5 seconds |
| You hit a streak milestone | **Heart** | ~3 seconds |
| Ignored for about a week | **Puddle** — melted, spread wide, legs gone | until you come back |

It doesn't cut between forms, it morphs — every shape is stored as the same 48 numbers, so a body becoming a burst is interpolating 48 pairs. The eyes slide to their new places on the way and the legs retract rather than vanishing.

### The face

Six expressions, and they aren't separate drawings — each is four numbers describing how the eyelids curve. That means it can be *halfway* between sleepy and sad, which is where most real feeling sits.

| Expression | When |
|---|---|
| **Neutral** | Ordinary daytime |
| **Wide** | Something just happened — you filed an entry, attached a file |
| **Happy** — eyes become upward crescents | You completed something, or hit a streak; also when you've been busy for a while |
| **Squint** | Concentrating — tagging, linking |
| **Sleepy** | Late evening and small hours, or when it's given up waiting |
| **Sad** — outer corners drop, pupils shrink | A few days ignored |

The eyes are roughly **double** the size of the first version. That's the real fix for "the states don't feel different": in your reference images the eyes span most of the creature's width, and expression is the whole job at this size. Small eyes cannot do it.

The body deforms too, cleanly: a bit taller and narrower when you've been working in Dash, wider and lower with its weight sagging when it hasn't seen you.

### What it does when you do things

| Do this | It does this |
|---|---|
| **File it** in the capture box | Jumps, eyes go wide, three marks fly up off the top |
| Add a tag, assign to a project | Squints, glances left, a quick squash |
| Attach a file or save a sketch | A small hop, looks down at it |
| Set anything to **Done** | Bursts, eyes go to happy crescents, seven marks fly out |
| Select 30 entries and bulk-tag | **One** bigger reaction, not thirty |
| Keep working for a few minutes | Gradually looks pleased — it tracks how busy you've been and settles back over about twenty seconds |
| Open Dash tomorrow morning | Eyes shut, then a stretch and a blink awake |
| Leave it alone for a few days | Turns sad — outer corners drop, pupils shrink, weight sags |
| Leave it a week | Melts into the puddle |

**Drag it** anywhere in the bottom-right corner area; it stays put on that device across reloads. Or tab to it and use arrow keys.

Home sheet only. Switch to List or Kanban and it's gone — and stops animating, so it isn't costing battery behind a screen you can't see it on.

### The rare stuff

Roughly one interaction in thirty does something extra: a full spin, a wink with one eye, or a small companion that appears beside it and fades. Late at night there's an occasional yawn. You won't see these often — that's the point. The reactions in the table above stay dependable so you can learn them.

The **flower** and the **square** are gone, along with the every-hundredth-entry easter egg they belonged to. Both were casualties of going down to one signature form. Say the word and either can come back — the outline maths for them still works, it's about ten lines.

### What varies by day

With a clean edge, the daily variation moved from the outline into the creature's build: today it's a fraction rounder or smaller and stands with its feet a little differently, tomorrow it doesn't. Seeded from the date, so it's the same all day and identical on your Mac and your phone.

**It never goes fully still.** Even idle it breathes, shifts its weight, blinks and looks around. The one exception is if you have Reduce Motion on in your system settings — then it holds a still pose and doesn't run an animation loop at all. I tested that it genuinely stops.

---

## What I changed in the existing code

**`js/store.js`** — a small "action channel". When you create, tag, or complete something, the store announces it to anyone listening. It writes nothing: no op in the log, no field, no sync change. It fires only for edits made **on this device**, so a background sync landing doesn't make the pet react to something you didn't do. A widget that crashes can't break an edit — tested specifically.

It also learned to recognise a "done"-ish status by name, since statuses are yours to invent. **Done, Completed, Finished, Resolved, Shipped, Closed, Archived** all count. Something like "Wrapped up" won't — harmless, you just get the smaller reaction. Say the word and I'll add any status of yours.

**`js/app.js`** — builds the cluster at startup, shows it on Home, hides it elsewhere, passes actions through.

**`css/app.css`** — a new section for the cluster. No literal colours; the character resolves its two tokens live, so a re-theme or a dark-mode flip re-inks it with no code change.

**`sw.js`** — bumped to v12, four new files added.

### One pre-existing bug fixed on the way through

`js/views/home.js` was never in the service worker's file list — missed back when Home was built. Network-first fetching mostly hid it, but a genuinely cold offline start was exposed. It's in the list now.

---

## What I checked before handing this over

The pet runs a physics simulation and draws procedurally generated shapes. Those fail as a blank square rather than an error message, so I ran the real code headlessly through 25 seconds of frames per scenario and asserted nothing invalid ever reached the canvas:

- every hour band: morning, afternoon, winding-down, small hours
- every mood: content, sad at 3 days, sagging at 6, fully melted at 45
- every transformation, and the return trip back
- empty collection, and a 5,000-item one
- every reaction kind fired at once
- 200 tags in a single frame
- **a completion landing mid-morph**, twice in a row — the case most likely to tear
- **expression whiplash** — seven contradictory reactions in half a second
- a reaction every single frame for 25 seconds
- a throttled background tab at 4 frames a second
- Reduce Motion on — confirmed the loop never starts

Plus all 16 shape-to-shape morphs at every step of the blend, and a check that the enlarged eyes still fit inside every form — they reach 0.85 of the body radius against a 1.00 edge on the round body, and stay inside on all three transformations.

On the store: action kinds fire in the right order, custom statuses classify correctly, a throwing listener can't break an edit, nothing new appears in the op log, snapshot round-trip unchanged.

**Two real bugs the tests caught:**

**A lobed shape lost its notches.** At 34 outline points, the narrow notches between lobes fell between samples and got skipped, so the shape rendered as a lumpy circle. Fixed by moving to 48 points, which is not arbitrary: the six-lobed burst has features every 30°, and 48 divides the circle into 7.5° steps, so every point and every notch gets landed on exactly. The burst's notches now measure 0.420, dead on the formula. **Don't lower that number** without re-checking the burst.

The neglect calculation was **re-scanning your whole archive on every store change** — a 30-item bulk edit meant 30 full scans. Now coalesced to one per frame, the same trick `app.js` already uses for renders.

---

## Findings on the other three widgets

**The tide station has no live sensor.** NOAA station 8518091, Rye Beach Amusement Park, is prediction-only — asking for observed water level returns "no data was found." Its published products are Tide Predictions, Benchmarks, Datums and Harmonic Constituents, nothing else.

Less of a problem than it sounds. Tide *predictions* for that station work, are real harmonic data computed for that exact spot at six-minute resolution, and a whole day arrives in one call — so the wave keeps moving with no network. The trade-off: it shows the tide as predicted rather than measured. On a calm day those are nearly identical; in a storm surge the real water sits higher.

Nearest live sensor is Kings Point, NY (8516945), twelve miles west. Same sound, wrong beach. My instinct is to stay at Rye — the honest label is "the tide at Rye Beach," not "a measurement from somewhere else."

**Open-Meteo's archive can't reach yesterday.** Its historical endpoint runs on ERA5 reanalysis, which lags five to seven days. The right endpoint is the *forecast* one with a `past_days` parameter, which serves the model's analysis for hours that have already happened — built from assimilated observations, not a leftover forecast. Keyless, correct CORS header, free to 10,000 calls a day. One request returns both days and every variable.

**The Q train is still CORS-blocked**, as expected. The Cloudflare Worker is the real answer; I'll write that guide in the same style as the Phase 0 one when we get there.

---

## On your "record today for tomorrow's yesterday" idea

It makes sense and it would work — but you don't need to, and the reason is good news: `past_days=1` hands you yesterday directly, from the same single request that fetches today. No storage, no waiting, no first-day gap.

Your version has three snags worth naming, because they're the reason I'd skip it:

1. **Day one shows nothing.** You'd have to use Dash for a day before the comparison exists.
2. **Skip a day, lose a day.** If you don't open Dash on Tuesday, Wednesday has no yesterday.
3. **It's per-device.** Open Dash on your phone but not your Mac and the two disagree — unless it goes into the synced log, which means putting weather readings into your item data, and that's exactly the sort of thing the architecture keeps out of there.

So: same result, none of the snags, and no new stored data. Your instinct was right that we shouldn't depend on a lagging archive — we just get to solve it more cheaply.
