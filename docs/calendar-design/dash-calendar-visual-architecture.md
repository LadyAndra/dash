# Dash Calendar — Visual & Interaction Architecture v3: "The Approach"

**Date:** August 22, 2026 (v3 — revised twice with Andra in the loop)
**Status:** Fable design output, for Andra's final read. Once approved, Claude turns this into an Opus build handoff. Nothing here changes the data layer — everything renders from `js/entries.js` (`calendarData()` / `entriesFor()`), per `dash-milestones-calendar-addendum.md`.
**v2 → v3 (Andra's second round):** Calendar is now **one screen** — strip, register, dial, year radar, and tray all visible at once, no page scrolling in any direction, re-laid-out live as the window resizes. The strip's axis is **logarithmically compressed** so six months fit on screen (a gap between gridlines is a day near NOW and a whole month at the far end). The **NOW line stays anchored**, but the ember overdue zone behind it **breathes** — sized by how much debt is actually in it, near-zero when nothing is overdue. All explanatory prose is gone from the page; it was planning scaffolding, not layout.
**v1 → v2 (first round):** the approach strip was promoted from study to main surface, the dial demoted to an accent, the year radar added, and hover info moved to a tooltip **at the mark**.

**Companion files (open these first — they are the design):**

- `dash-calendar-instrument.html` — the committed design v2, working: approach + month windows, tooltips, accent shelf, tray + flip mechanism
- `flip-numeral-component.html` — the flip-numeral date input, isolated, all input paths live
- `studies/exploration-a-ledger.html`, `-b-meridian.html`, `-c-weave.html` — the studies that led here (§8)

Prototypes are pinned to Aug 22, 2026, with Dark and Motion toggles.

---

## 0. The thesis

**An instrument, not a spreadsheet.** The Calendar is a piece of equipment on the specimen-archive desk. Its main surface is **the approach**: a fixed NOW line with everything drifting toward it — time as distance, not as boxes. Beside it, an **accent shelf** of smaller instruments (a month dial, a year radar), and beneath it, the **register** (the same window as plain readable rows) and the **unscheduled tray**, where the flip mechanism lives. It sits inside Dash's existing visual system — warm paper, mono labels, serif content, hairlines, mount-as-material.

---

## 1. The mark grammar — one system, everywhere

Every entry, on every surface of Calendar, is drawn by three rules:

**Rule 1 — hue is identity, and only identity.** A mark's hue is its project's colour (existing `itemColor()`/`groundStyle()` path; plain items use `--text-faint`). Hue never encodes urgency. Ember stays exactly what tokens.css says: *past its date*, nothing else.

**Rule 2 — material is time-distance ("the dye ramp").** How soon something is reads as how much dye the mark holds, whether grain has arrived, and how hard its edge is:

| Distance from today | Dye (mix of project colour into `--surface`) | Grain | Edge | Ink on filled blocks |
|---|---|---|---|---|
| overdue | — (solid `--ember`) | no | none | `--ember-ink` |
| 0–2 days | 100% | no | hard 1.5–2px `--text-primary` | `--text-on-accent` |
| 3–7 days | 100% | no | none | `--text-on-accent` |
| 8–14 days | 55% | yes | hairline in 55% dye | `--text-primary` |
| 15+ days | 24% | yes | hairline in 55% dye | `--text-primary` |
| done | `--surface`/`--surface-sunken`, hollow or struck | no | `--border-strong` | `--text-faint` |
| reminder | none — hollow outline + dashed ring / ◌ prefix | no | 1px project colour, dashed | `--text-muted` |

**Verdict on Andra's near/far ↔ solid/textured hypothesis: it holds, amended.** Texture alone was too quiet; the carrier is **dye first, grain second, edge third** — colour visibly thins toward the paper with distance and solidifies as a date approaches. This also resolves the colour conflict: urgency only controls the *amount* of the project's own hue, never its identity, so the two meanings share one channel without fighting. A five-week-out launch is still recognisably the site project's blue — just barely settled into the paper yet.

**Rule 3 — weight is size, and only size.** Mark radius / block thickness from weight 1–3, derived at render time: **3** = a project's *final* milestone (last in pipeline `order`), **2** = other milestones, **1** = plain item dues. Reminders carry no weight (hollow by rule 2).

**Implementation:** dye = `color-mix(in srgb, <project colour> N%, var(--surface))` — mixing into the theme's own surface token means the ramp re-themes for free, dark mode included. Grain = one vendored tile, `assets/grain.svg` (SVG `feTurbulence`, ~500 bytes), as an overlay with `mix-blend-mode: overlay`. New tokens: `--cal-dye-near/soon/mid/far` (100/100/55/24%) and `--cal-grain-opacity: 0.45`; the day boundaries (2/7/14) are JS constants beside the one pure ramp classifier `rampOf(entry, today)`, which every renderer shares and which is unit-testable at its boundaries.

---

## 2. The page — one screen, one instrument panel

Calendar is a **single-viewport layout with no page scroll**: a slim header bar (title + mode/motion/dark controls), the approach strip filling the upper ~55%, and a shelf across the bottom holding the register panel, the month dial, the year radar, and the unscheduled tray — everything visible at once. The layout is a CSS grid on `100vh`; the strip re-renders from its container's measured size on window resize (debounced ~120ms), so the whole instrument adapts as the window does. On narrower windows the shelf sheds gracefully: below ~1250px the year radar retires, below ~950px the dial too, leaving register + tray. Long lists (register, tray) scroll *inside their panels* — the page itself never scrolls. No explanatory copy anywhere; the instruments are the interface.

## 2a. The main surface — the approach strip

**Geometry.** A heavy `NOW` line stands anchored near the left edge — it does not wander. Behind it, the **overdue zone**: an ember-tinted field (9% `--ember`) that is *sized by its contents* — with nothing overdue it collapses to a sliver, and it widens (`√` of the oldest debt's age, capped at ~28% of the strip) as debt accumulates, so a growing red field at the left edge is itself the signal. Overdue marks sit in it, solid ember, labels beneath.

To the right, the future on a **logarithmically compressed axis**: `x = nowX + span · ln(1+days)/ln(1+HORIZON)`, with `HORIZON = 180 days` (a `CAL_HORIZON_DAYS` constant). Six months fit on screen with no horizontal scrolling: tomorrow gets a wide bay, and by the far end the gap between two gridlines is a whole month. Gridlines follow the compression — daily to +14, weekly to +56, then actual month boundaries (heavier line, month name) out to the horizon. The compression *is* the theory of attention: near time is spacious, far time is dense, and things physically decompress as they approach the line.

**Lanes.** One horizontal swimlane per project (label in the mono voice at the lane's left), plus an Items lane — in the build, lanes come from the projects that actually have entries in the window, not a fixed list. Lane order stable (alphabetical).

**Marks.** A circle at (its distance's x, its lane's y), radius by weight, painted by the ramp — solid and hard-edged at the line, dye thinning and grain arriving as x grows. Reminders are dashed hollow rings. Done entries don't appear in the approach window (it is forward-facing; history lives in Month mode and the year radar).

**Labels.** Entries within 14 days carry their label beside the mark in the mono voice (overdue: beneath the mark, in ember). Beyond 14 days marks are unlabelled — that's what the tooltip is for, and the quiet far field is part of the reading.

**The tooltip — information at the mark (Andra's correction to v1).** Hovering *or keyboard-focusing* any mark shows a small card *at the mark*: a mount-material card (`--mount` ground, `--ink-on-mount` text — the flip clock's material, so the two mechanisms rhyme) carrying the project in the mono voice, the label in serif, and the date + relative time ("25 SEP · in 34 days"; overdue line in ember). Positioned above the mark with a pointer arrow, flipping below near the top edge, clamped to the container. The mark itself gets a `--text-primary` "hot" ring while spoken. Every mark is `tabindex="0"` with a full `aria-label`, so the tooltip follows focus and the information is never hover-only.

**The two settled modes are two windows of this same strip:**
- **Approach** (the default; maps to the addendum's "agenda" window): rolling today → +180, log-compressed, NOW at left.
- **Month** (the addendum's "month" window): the cursor month on a **linear** day axis 1…31, prev/next navigation, NOW line standing mid-field when the month is current. Overdue marks sit ember on their actual days; done entries render as quiet hollow rings, so a past month reads as history. Labels beside all live marks (a month holds few enough).

One renderer, two axis functions — the modes cannot drift apart. Last-used mode + cursor persist per device (`dash.calendar.mode`, `dash.calendar.cursor`), as settled.

**The register panel.** On the shelf, always visible: the strip's window as plain rows — date, ramp-painted chit, project + label — scrolling inside its own panel. This is the readable, screen-reader-native, eye-strain-fallback listing of exactly what the strip shows; it renders from the same entries array in the same pass. (In the compressed far field, marks that land within ~15px on the same lane nudge alternately off the lane line; the register and tooltips are the guarantee that compression never hides anything.)

---

## 3. The accent shelf — dial and year radar

Below the strip, two smaller instruments. They are glances, not workspaces — nothing is *only* reachable through them.

**The month dial (v1's face, shrunk to an accent, ~340–420px).** The cursor month as a clock face: day ticks (numerals only at 1, 7, 14, 21, 28 and today, which gets the heavy tick and a faint dashed hand), one hairline orbit per project with entries this month, marks painted by the same ramp, and **overdue falling out of orbit** — pulled to the centre in ember, dash-tethered to where it belongs, a hollow ring left in its place. Centre: month in the display serif + a mono count line (ember when anything is overdue). The slow sweep arm (75s rotation) lives here; it disappears under `prefers-reduced-motion` and the Motion toggle (`dash.calendar.motion`, per-device). Dial marks get the same at-the-mark tooltips (coordinates scaled from viewBox to screen). Prev/next month navigation drives both the dial and Month mode's window.

**The year radar (new in v2, from Andra's idea, ~220–260px).** Deliberately tiny and dense — the year as one face: twelve faint month spokes with single-letter labels, the same project orbits, and *every dated entry of the calendar year* as a small grain — done ones in quiet `--border-strong`, future ones in their project hue (full inside two weeks, faded beyond), overdue in ember. A thin today-hand crosses the face. No labels, no tooltips — it is texture that happens to be true, the "beautiful dense instrument" register of the reference images. (Build note: it's one `entriesFor(Jan 1, Dec 31)` call — the source layer already supports it. A later step can make clicking it jump the month cursor; not required this pass.)

---

## 4. The flip-numeral date input — "The Setting Mechanism"

One self-contained module, **`js/widgets/flipdate.js`**, no dependencies. API:

```js
mount(container, { value /* "YYYY-MM-DD" | null */, onCommit(dateStr), onCancel? }) → { destroy() }
```

Scoped to Calendar this pass (the tray's "Set date" and any set-date affordance inside Calendar). One widget, one entry point — the entry/milestone editors can adopt it later by swapping their date fields' mount, no rewrite.

**Anatomy:** three split-flap units — DAY, MONTH (JAN–DEC), YEAR — in the **mount material**: `--mount` top half, `--mount-soft` bottom, `--rule-mount` seam, `--ink-on-mount` digits, mono face; hint labels in the mk voice; housing on `--surface-raised` (propose `--radius-housing: 6px` — the one place the 2px sharpness relaxes, because this is deliberately an *object*). SET commits; TYPE reveals a native `<input type="date">`.

**The tick.** Every change is discrete — a jump of five is five flips. Per tick (~150ms): top flap folds down (75ms ease-in), bottom flap falls in (75ms ease-out); more than ~3 queued ticks switches to a 60ms flutter. Under `prefers-reduced-motion` (CSS *and* JS guard): instant swap, everything else identical.

**Carry:** day overflow rolls the month (Aug 31 → Sep 1), month overflow rolls the year, month changes clamp the day — midnight on a real flip clock; each changed unit flips exactly once.

**Four ways in, one mechanism:** (1) pointer — rest and scroll, one tick per notch, throttled ~80ms; (2) keyboard — focusable `role="spinbutton"` units, ↑/↓ tick, typed digits jump exactly ("2","7" → 27); (3) touch — pointer-captured hold-and-drag, one tick per 28px, movement only while the finger moves, **no momentum ever**; (4) exact — TYPE → native date input. Nothing is gesture-only.

**Commit model:** ticking mutates only component state; `onCommit` fires once on SET → the caller writes one ordinary `set` op (`ms`/date or `dates.due`). No op spam while scrubbing; collapsing writes nothing.

**Accessibility contract:** `aria-valuemin/max/now/valuetext` per unit; units 64–96px (over `--tap-min`); standard token focus ring; the typed path always present.

---

## 5. The unscheduled tray

As the addendum settled: collapsed band at the bottom, "UNSCHEDULED · n", rows grouped by project (colour dot + label + project in mk voice). **"Set date" opens the mechanism inline**; SET writes the op and the milestone materialises on the strip/dial/radar in the same render pass. The prototype demonstrates the full loop.

---

## 6. Device scope

- **Desktop:** the real target; everything above.
- **Phone:** Calendar is not offered on phone-class screens — gated at view registration via the existing `js/mobile-chrome.js` detection pattern. Home/Today remains the phone surface.
- **Tablet:** strip scrolls horizontally; the shelf wraps beneath; tooltips fire on tap-focus; hold-and-drag is the flip input.

---

## 7. Rendering & build notes (for the Opus handoff)

- **Files expected:** new `js/views/calendar.js`, `js/widgets/flipdate.js`, `assets/grain.svg`; token additions (§1, §4); calendar CSS in the standard locations. Every new file into the service-worker `SHELL` with a `CACHE_VERSION` bump **in the same upload**.
- **One pass per frame:** strip + register + dial from one `calendarData()` window call; the year radar from one wider `entriesFor()` call, recomputed on the same coalesced render (or cached per day — it changes at day granularity).
- **SVG colours via CSS:** use `style="fill: var(--…)"` / `color-mix()` so theme swaps don't redraw (the prototype bakes computed colours and re-renders on toggle — the build should not).
- **Day rollover:** visibility-change + lazy once-a-minute check, per the addendum.
- **Registration:** through the view registry, `supportsSelect: false`, phone-gated.
- **Tests:** ramp classifier at every boundary (2/3, 7/8, 14/15, overdue, done, remind); flip carry fixtures (Aug 31 +1, Mar 1 −1, leap Feb, clamp on month change); strip x-mapping fixtures for both axis functions; tooltip positioning edge clamps; reduced-motion paths (sweep, flip); theme-swap audit.
- Sample weights in the prototypes are hand-set; the build derives them per §1 rule 3.

---

## 8. How this design got here (kept as evidence)

- **v1 committed to the dial as the month view with a vertical feed as agenda.** Andra's reaction promoted the **approach strip** — originally study B's agenda — to the main surface: the fixed NOW line with everything drifting toward it was the most immediately readable form for her. The vertical feed is gone; the register fold inherits its readable-list duty.
- **The dial** survived as the month-at-a-glance accent (her call: "a small accent piece"), keeping its best moment — overdue falling out of orbit — and the sweep.
- **The year radar** is her addition: "an even smaller radar… really dense… the year at a glance."
- **The caption-line readout** (v1) is replaced by tooltips at the mark — she couldn't make the connection across the distance, which is exactly the kind of thing the register/tooltip pairing must never rely on.
- From the earlier studies: the **dye ramp** was born in study A (texture alone too quiet — amended to dye-first); **urgency-owns-colour** (study B's first pass) was rejected for losing identity at distance; the **full textile month** (study C) read beautifully at arm's length but fought its own labels. The studies stay in `studies/` as the record.

## 9. What's left for Andra before the build handoff

1. **The far end of the ramp:** at 24% dye + grain, is months-out pleasingly faint or too faint on your screen? The stops are tokens; say the word and they move.
2. **The horizon:** is six months the right reach for the strip, or should the constant be a year? (The axis handles either; only the constant changes.)
3. **Shelf priorities when the window narrows:** currently the year radar retires first, then the dial, and register + tray survive to the end. Right order?
