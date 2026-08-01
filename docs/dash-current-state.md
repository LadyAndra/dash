# Dash — Current State

**Purpose:** source of truth for what's actually built, as distinct from what the original architecture proposal planned. Update this after any meaningful change — especially ones made by Opus outside this project's chat.

**Last updated:** July 31, 2026

---

## Where sync diverges from the original proposal

The architecture proposal (`dash-architecture-proposal.md`) specified iCloud Drive as the canonical data store, with automatic sync on Mac and manual export/import on iOS. **This was superseded.** Once Android/e-ink entry was on the table, iCloud's lack of Android support made it a dead end.

**What's actually built:** Dropbox OAuth 2 PKCE sync, with auto-renewing refresh tokens. This works automatically on both Mac and iPhone — better coverage than the original iOS plan, and it's what makes a future Android/e-ink device straightforward to add. Manual token expiration (the ~4-hour problem with plain Dropbox tokens) was solved via the PKCE refresh flow.

Everything else in the proposal's data model (Items, registries, content-addressed assets, theme tokens, view-layer architecture) still holds as designed.

---

## Built and live

- Core item system: types, statuses, tags, connections/links, multiple views (list, board, kanban, finder)
- File uploads: images, PDFs, markdown, text
- **Project type** with multi-project assignment — not in the original data model, added afterward
- Dropbox sync (see above)
- App icon: cameo silhouette of a cocker spaniel
- PWA installable on Mac (Chrome/Edge) and iPhone
- **Sketch canvas on every item** (`js/sketch.js`) — always visible in the editor, not behind a reveal. Two inks, eraser, undo, clear. Apple Pencil pressure drives line weight; finger/mouse strokes fake a natural taper from stroke speed. Strokes autosave as a content-addressed PNG attachment (`role: "sketch"`), replacing the previous one on each save
- **Sketch view/draw modes** (July 31, 2026) — the canvas loads in a "view" state where `pointer-events: none` lets touches pass through and the page scrolls normally; a pencil toggle arms it for drawing. Enforced in two independent layers (CSS + a guard in `onDown`) so a bug in one can't leave a stray mark. State is shown by a dark outline on the paper plus a plain-English label
- **Home corner cluster — widget 1 of 4: the pet** (July 31, 2026) — `js/widgets/`. A floating, draggable character in the bottom-right of the Home sheet: **one** round near-black body on two legs with very large almond eyes, in the CDG/cut-paper register. Clean edge, no noise. Expression carries the mood — six blendable expressions (neutral / wide / happy crescents / squint / sleepy / sad) driven by neglect, hour of day and how busy you've been; plus clean low-frequency body deformation (taller and narrower when active, wider and sagging when neglected). **Only three transformations**, all earned: burst on completion, heart on a streak milestone, melted puddle after ~a week ignored. Reacts to specific actions (create / tag / link / attach / done / wake / streak) rather than general recency; neglect reads the existing `touched` field; date-seeded daily variation in build and stance; rare easter eggs (spin, wink, companion, small-hours yawn). Home only — hidden and paused on every other view. Four new files: `motion.js` (shared motion vocabulary for all four widgets), `shapes.js` (body + the three transformations), `cluster.js` (bounded corner stage, drag + per-device position persistence), `pet.js`. See `docs/changes-2026-07-31-pet.md`
  - **Two earlier designs were rejected, and the reasons should stick.** (1) A soft ink-drop with a gradient — wrong token (used `--ember`, which is indicator-only) and wrong register. (2) A six-form shapeshifter with a randomly jittered "hand-cut" edge — *more shapes made the states less distinct*, because at ~100px a heart, a blob and a puddle all read as "dark round thing", and per-point random jitter is high-frequency noise that reads as lumpy rather than handmade. **Identity comes from one silhouette; emotion comes from very large eyes.** Don't reintroduce edge noise or a shape rotation without re-testing at true rendered size
- **Multi-select / bulk edit** (July 31, 2026) — `js/selection.js`. A visible "☑ Select" toggle in the topbar (deliberately not long-press) on **five** views: list, board, kanban, finder, and project. Tapping an entry picks it instead of opening it; a bottom bar carries the count and the actions: apply tags, set status, assign to project. Selection survives an action so edits can be chained; "Done" or the toggle exits and clears

## In progress / just scoped (not yet built)

**Home corner cluster, widgets 2–4.** Scoped in the July 31 build brief, built iteratively. Widget 1 (pet) shipped. Remaining, in build order:

- **Weather comparison** (largest) — today vs. yesterday, paired numbers plus a visual delta, **as originally briefed**. Decided July 31: *no* dressing advice and *no* personal calibration — Andra's underlying question is "what do I need to wear to be comfortable," and the answer is to show the right numbers plainly and let her judge. Practical consequence: lead with **apparent ("feels-like") temperature**, wind and rain chance, since those are what actually decide clothing; raw air temperature, humidity and pressure are supporting. Needs a home location, to be added as a Settings field (defaults to Rye, NY). **Finding:** Open-Meteo's *archive* endpoint runs on ERA5 and lags 5–7 days, so it cannot supply yesterday. Use the **forecast** endpoint with `past_days=1`, which serves the model's analysis for elapsed hours (observation-assimilated, not a stale forecast) and returns both days in one request. Keyless, `Access-Control-Allow-Origin: *`, 10k calls/day free. Alternative if instrument readings are wanted over model analysis: NWS `api.weather.gov` observations from KHPN (Westchester County Airport). **Considered and rejected:** recording today's reading locally to serve as tomorrow's "yesterday" — works, but has a first-day gap, loses any day Dash isn't opened, and disagrees across devices unless pushed into the synced log, which `past_days` avoids entirely
- **Rye/Playland tide wave** — **Finding:** NOAA station 8518091 is **prediction-only**; it has no water-level sensor and `product=water_level` returns "no data was found." Tide *predictions* work and are real harmonic data for that exact spot at 6-minute resolution — a whole day in one call, so the wave runs offline. Nearest live-sensor station is Kings Point NY (8516945), ~12 mi away; staying at Rye is the current preference
- **Q train** — still CORS-blocked, confirmed. Needs the Cloudflare Worker relay per §1a of the brief. Save for last

Decided during the widget-1 build: cluster is **floating fixed** in the corner (not docked in the sheet flow), **Home only**, positions persisted **per device** in `localStorage` and deliberately not in the synced log.

## Closed — not actionable

**"Remove the floating toolbar menu above the keyboard."** Investigated July 31, 2026: there is no such toolbar in Dash's code. It's Safari's native **keyboard accessory bar** (the `‹ ›` field-navigation arrows and "Done"), drawn by iOS outside the web page. A PWA cannot remove or restyle it; only a native App Store app could.

If it becomes a problem again, the available mitigation is a keyboard-aware editor: use the `visualViewport` API to shrink the modal to the space the keyboard leaves and scroll the focused field above the bar, plus tap-anywhere-to-dismiss. **Deliberately deferred** — do not re-attempt removal.

## Not yet built (from the original Phase 2–4 plan)

- Markup **on an attachment** — the "napkin" tool for drawing over an attached photo or PDF. The standalone sketch canvas is built (above); annotating an existing file is not
- Highlighter ink (pen and eraser exist; highlighter does not)
- In-app voice recording → unprocessed queue
- Whisper transcription (Mac-only path)
- Reminders + Today panel
- Calendar/timeline view
- Heat/neglect view
- Gmail/Calendar live integration + pinned reference items
- Graph view (ego and global)
- Corkboard, roadmap, orbit views
- In-app theme editor

## On the horizon, not part of the Dash build process

- E-ink tablet (Boox Palma 2 Pro or similar) — monitored via a separate Claude Cowork scheduled task, kept deliberately outside this project's scope until a device is actually acquired
- Home Screen layout changes — noted as a future round, not yet scoped

## Key decisions still standing

- Dropbox over iCloud/Google Drive: Android compatibility + no recurring re-auth
- PWA + GitHub Pages: no native dev overhead, works across Mac/iPhone/iPad/Android
- All code delivered as uploadable zips or files with plain-English notes — no direct code access expected of Andra
- **Bulk edits introduce no new data.** A bulk action is the same single-item field edit run in a loop through the existing store methods (`addToSet`, `setField`, `assignToProject`). No batch records, no batch ops in the log, so sync and merge needed no changes at all. Any future "apply to many" feature should follow this rule
- **Views declare their own capabilities.** Select mode appears wherever a view module sets `supportsSelect: true`, rather than app.js hardcoding a list of view names — consistent with views-as-registered-modules
- **Select mode is a visible button, not a long-press.** Long-press is undiscoverable, fights text selection and dictation, and collides with kanban drag

## Operational notes for future sessions

- **`sw.js` must be updated with every upload.** Bump `CACHE_VERSION` (currently `dash-v12`) or devices serve stale cached code, and add any **new** JS file to the `SHELL` array or the app breaks offline. `selection.js` was added in v9; `js/widgets/{motion,cluster,shapes,pet}.js` in v10–v12. Fetch strategy is network-first, so online updates arrive once Pages redeploys
- **`js/views/home.js` was missing from `SHELL`** and was added in v10 — it had been absent since Home was built. Network-first fetching masked it, but a cold offline start was exposed. Worth spot-checking `SHELL` against the files on disk whenever a view is added
- **Ambient widgets get data through `store.onAction()`**, a listener channel that writes nothing — no op, no log line, no sync. It fires only on **local** edits, so a background sync landing never triggers a reaction. Listener exceptions are swallowed: a decorative widget must never be able to break an edit. Any future ambient/decorative feature should use this channel rather than inventing a new field
- **All four cluster widgets share one motion file.** Spring constants, breath period, ripple timing and the burst-coalescing window live in `js/widgets/motion.js`. Retuning the feel happens there, once, for all four — do not hardcode timings inside a widget
- **The pet is drawn in `--text-primary`, never `--ember`.** tokens.css reserves ember as an indicator only (overdue, stale, sync trouble) and explicitly not decoration. Near-black is a *material* in the specimen-archive system, which is what a cut-paper character is. This inverts correctly on the dark theme for free
- **`shapes.js` uses 48 outline points, and the number is load-bearing.** The six-lobed `burst` has features every 30°; 48 points divides the circle into 7.5° steps so every point and notch is sampled exactly. At 34 points the notches fell between samples and the shape rendered as a lumpy circle. Do not lower this without re-checking `burst`
- **Renders are coalesced to one per animation frame** (`scheduleRender` in `app.js`). Added July 31, 2026 because bulk actions emit one store change per item, and redrawing the whole screen dozens of times in a row locked the UI. Views needing an immediate redraw still call `ctx.rerender()`
- Deployment is drag-and-drop of **folders** (`js`, `css`, `docs`) plus `sw.js` via GitHub's web uploader — dragging loose files lands them in the repo root with wrong paths
