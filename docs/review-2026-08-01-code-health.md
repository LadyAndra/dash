# Dash — structural code-health review

**Date:** August 1, 2026 (after the catalog-band pass, live at `dash-v27`).
**Purpose:** a read-only review before Phase M3 (the Calendar view). Nothing in the
repo was changed to produce this. Every item below is a *proposal*, to be approved
one at a time.

**Scope covered:** every file in `js/`, `css/`, plus `index.html`, `sw.js`,
`manifest.json`, cross-checked against `dash-architecture-proposal.md`,
`dash-milestones-calendar-addendum.md` and `dash-current-state.md`.

---

## 1. The headline

The architecture is in genuinely good shape, and unusually faithful to its own
documentation. The layering described in §4.1 is real, not aspirational: `store.js`
never touches the DOM, `query.js` is one query shape, views are registered modules
that *declare* their capabilities (`supportsSelect`, `supportsCatalogChrome`,
`ownFilter`, `forceGroupBy`) rather than being named in a hardcoded list in
`app.js`. Derived data really is never written back. `js/milestones.js` really does
import nothing. The entry/source layer in `js/entries.js` really is the contract the
Calendar needs.

What has accumulated is **not architectural rot — it's residue**: unused imports and
tokens left behind by features that were unregistered or shelved, three or four
values that now live in two or three places, and one performance habit in `app.js`
that breaks a rule the project already wrote down for itself. All of it is cheap to
fix and none of it requires re-litigating a decision.

There is **one small live bug** (item 4 below) and **one thing that will genuinely
get in M3's way** (item 2).

---

## 2. `sw.js` SHELL cross-check — clean

Cross-checked the `SHELL` array against every file on disk.

- **Nothing in `SHELL` is missing from disk.**
- **Nothing on disk is missing from `SHELL`**, except two files that are correctly
  excluded:
  - `js/focus-debug.js` — dynamically imported only under `?focusdebug=1`, and the
    file's own comment says it's deliberately out of `SHELL`. Correct.
  - `sw.js` itself — a service worker shouldn't cache itself. Correct.
- The shelved widgets (`js/widgets/*`) and unregistered views (`kanban.js`,
  `finder.js`) are still cached on purpose, with the reasoning written inline.
  That's the "unregister, don't delete" rule working exactly as designed.
- `CACHE_VERSION` is `dash-v27`, matching the current-state doc.

**No action needed.** This is the part of the codebase that has bitten deploys
before, and it is currently correct.

---

## 3. What's clean (worth not disturbing)

- **The theming layer is the strongest part of the codebase.** All the contrast
  maths lives once, in `theme.js`. The `--ground-ink` / `--ground-bg` mechanism is a
  genuinely good idea: it's what lets an arbitrary picked hex stay legible without
  the stylesheet ever knowing the colour. `color-mix()` from a token is used
  consistently for hairlines and washes. `tokens.css` is a real single source, and
  the dark-theme block is complete (including `--ember-ink` correctly following
  `--text-on-accent`, which I checked — it resolves per theme as intended).
- **Merge and format discipline.** Forward-compatible op handling, the per-run
  `header` line, the `DATE_SCALARS` fix that kept the wire shape identical,
  `mid`-keyed milestones, fractional `order`, the mid-sorted stored array for
  byte-identical snapshots. This is careful work and the comments explain *why*.
- **`js/entries.js` is the right shape for M3.** Range-queried, `end`-carrying,
  `fromItem` sources sharing one archive walk. The Calendar can consume it unchanged.
- **The panel registry** in `home.js` + `renderPanel` in `shared.js` is a clean
  extension point, and the reasoning for keeping the `PANELS` array local to each
  view holds up.
- **No dependencies, no build step, everything vendored** — the §13.1 constraint is
  fully respected.

---

## 4. Findings

Ordered roughly by how much they matter, not by size.

### 4.1 — The archive is scanned ~28 times per render, on every view

`render()` in `app.js` calls `renderSidebarFilters()` unconditionally. Inside it:

```
store.all().length                              // 1 scan
for (const t of store.types())   store.all()…   // 1 scan per type
for (const s of store.statuses()) store.all()…  // 1 scan per status
store.allTags()                                 // 1 scan
for (const tag of tags.slice(0,20)) store.all() // up to 20 scans
```

Then `updateHomeBadge()` → `overdueCount()` → another full scan, and on Home
`todayGroups()` → another, and `query()` → another. With 5 types, 3 statuses and 20
tags that's roughly **28 full walks of the archive per redraw**.

Two things make it worse than the raw number suggests:

1. It runs **even on Home and Project**, where the index rail is not on screen — the
   rail is built in full and then hidden by CSS.
2. It runs **on every keystroke in the item editor** (see 4.3), because each
   keystroke emits a store change.

This is exactly the standing rule in `dash-current-state.md` — *"anything that
repeatedly scans `store.all()` must be coalesced to one pass per frame"* — being
broken in `app.js` itself. The pet widget was fixed for precisely this; the app's own
chrome never was.

**Also wasted:** `query(store, …)` filters and sorts the entire archive on every
render even for views that set `ownFilter: true` (Home, Project, and soon Calendar),
which throw the result away.

### 4.2 — Undated milestones have no source, and M3 needs them

Addendum §6.3 requires a collapsed **"Unscheduled" tray** on the Calendar listing
undated, unfinished milestones grouped by project. But `entries.js`'s milestone
source only emits a milestone when `m.date` is set, and there is no exported helper
for the undated ones.

As things stand, `calendar.js` would have to walk `store.all()` itself — which breaks
§6.1's stated principle (*"the calendar never reads items directly"*) and adds yet
another archive scan on top of 4.1.

This is the single clearest thing that would make M3 harder to build cleanly.

**Related, smaller:** the month grid needs entries bucketed by day. `todayGroups()`
already does day-bucketing, but only for the Today window. Unless a small
`groupByDay(entries)` is factored out, M3 will end up with a second bucketing rule
that can drift from the first.

### 4.3 — One live bug: the editor's Escape listener is never removed

`editor.js` adds `document.addEventListener("keydown", escClose)` when the editor
opens, but only removes it inside the Escape branch. Closing with **Done**, the
scrim, or **Delete** leaves the listener attached.

Consequences:
- Pressing Escape any time after closing calls `close()` again, which calls
  `document.body.removeChild(scrim)` on a scrim that is no longer a child — that
  throws, and the global error banner shows *"Something went wrong inside Dash."*
- One orphaned listener accumulates per editor open, for the life of the session.

Three-line fix. Worth doing regardless of M3.

### 4.4 — Every keystroke in the editor is one op in the log

`editor.js` commits title and body with `oninput`:

```js
oninput: (e) => store.setField(id, "title", e.target.value),
```

So typing a 300-character note appends **300 ops** to the append-only log, and emits
300 store changes — each of which schedules a render of the whole app behind the
modal (coalesced to one per frame, but each of those frames does the 28 scans from
4.1).

The project already wrote down the rule for this — *"a field inside a re-rendered
view must not commit on every keystroke"* — for the milestone name boxes and the
capture box. The editor is a modal, so it isn't torn down by the re-render, which is
why nobody noticed. But the log bloat is real and permanent (logs are append-only),
and it compounds 4.1.

This one changes *when* things save, so it's a conversation rather than a silent fix.

### 4.5 — Dropbox re-downloads every log on every poll once you type a non-ASCII character

In `sync.pullDropbox()`:

```js
if (e.size <= seen) continue;         // e.size is BYTES (from Dropbox)
…
this.readOffsets[e.name] = text.length;  // text.length is CHARACTERS
```

The moment any log line contains a non-ASCII character (an accent, a curly quote, an
emoji, a “ from a pasted title — the milestone editor's own placeholder text uses
curly quotes), `e.size` permanently exceeds `text.length`, the short-circuit never
fires, and **every device log is re-downloaded every 10 seconds, forever**.

No data is corrupted — the slicing is self-consistent in characters, so the tail
replay is still correct, and ops are idempotent anyway. It's pure wasted traffic and
battery. The folder backend does this correctly (bytes against bytes).

### 4.6 — Project identity is a magic string in six files

`store.js` exports `PROJECT_TYPE` (`"project"`) and `PROJECT_LINK` (`"in project"`).
**Neither is imported anywhere.** Instead:

- `"project"` is hardcoded in `editor.js` (×2), `selection.js`, `entries.js`,
  `views/project.js` (×2), `views/shared.js`, `views/milestone-editor.js`.
- `"in project"` is hardcoded in `views/project.js` and `views/milestone-editor.js`.

Worse, **project membership is computed by hand in three places**:
`store.projectsOf()` (the store's own, correct one), a private `membersOf()` in
`views/project.js`, and an inline `.filter().some()` in
`views/milestone-editor.js:350`. Three copies of the same rule, each its own full
archive scan.

M3 will want "is this a project?" too (for the unscheduled tray), so this is a good
moment to consolidate.

### 4.7 — Dead code and dead tokens

All zero-behaviour-change removals:

| Thing | Where | Note |
|---|---|---|
| `supportsFolder` import | `app.js` | never used |
| `colorToken` import | `editor.js` | never used |
| `toast` import | `theme.js` | never used |
| `typeChip` import | `views/project.js` | never used |
| `tintToken` import | `views/shared.js` | never used (only named in a comment) |
| `swatch()` | `views/shared.js` | exported, never called — `project.js` inlines its own |
| `setDropboxToken()` | `sync.js` | defined, never called |
| `dash.view` writes | `app.js` ×2 | written, read by nothing (Dash always opens on Home) |
| duplicated comment block | `sync.js` ~line 377–381 | the "content-addressed…" paragraph appears twice |
| `.sidebar-footer` `.mount-head` `.sheet-masthead-sub` `.lbl-ember` `.on-ground` `.rail-actions` `.attach-name` | `app.css` | no JS or HTML references any of them |
| `--tint-green … --tint-gray` (7 tokens) + `tintToken()` | `tokens.css`, `theme.js` | their stated consumers were the Kanban wells and Finder selection, both unregistered. One hardcoded `var(--tint-green)` in `editor.js` is the only remaining use |

---

## 5. The visual / theming layer specifically

This is the layer that gets iterated on most, so it gets its own section.

### 5.1 — The default ember lives in three places

| File | Value |
|---|---|
| `css/tokens.css` | `--ember: #b23a14` |
| `js/theme.js` | `defaultAccentHex()` returns `"#b23a14"` |
| `js/ui/colorfield.js` | `fallback = "#b23a14"` (and the placeholder `"#B23A14"`) |

`defaultAccentHex()`'s comment says it reads the value "off a fresh element" — it
doesn't; it returns a literal. So if `--ember` is ever re-valued (or replaced by a
loaded theme JSON), **"Reset to ember" in Settings resets to the old colour**, and the
picker's fallback is wrong too. `tokenHex("--ember")` already exists and does exactly
the right thing.

### 5.2 — A project's chip in the editor is always green

`editor.js:148`:

```js
el("span", { class: "chip", style: `background:var(--tint-green); color:var(--color-green)` }, …)
```

Every project chip is green regardless of the colour picked for that project. It's
the one surface where a project doesn't wear its own colour, and it's inconsistent
with `itemColor()` / `groundStyle()` used everywhere else. (It's also the last
consumer of the `--tint-*` family.)

### 5.3 — Six literal colours in `app.css`

The file's own header says *"If you find a raw color/size/font below, it's a bug."*
There are six:

| Line | Value | Where |
|---|---|---|
| 27–28 | `rgba(120,108,84,.05/.04)` | the body's dot grain |
| 609 | `rgba(23,21,15,0.42)` | the modal scrim |
| 766 | `rgba(0,0,0,0.08)` | the sketch pen swatch inset |
| 784 | `rgba(23,21,15,0.10/0.05)` | the sketch paper's inset shadow |
| 939 | `rgba(240,232,215,0.05)` | the mount's dot texture |

The body grain is the one that actually shows: it's a warm-brown dot that does **not**
invert on the dark theme. `color-mix()` over a token is already the established,
documented pattern for exactly this — these predate it.

### 5.4 — Layout literals that should be tokens

- The **index rail is `248px` hardcoded** (`#app.with-sidebar`), while Home's rail is
  the token `--rail-w`. Two rails, two mechanisms.
- `44px` is written literally five times, including twice as a `.mount-row` grid
  column — so if `--tap-min` ever moves, that layout won't follow.
- `column-width: 260px` (board), `max-width: 320px` (search), `min-height: 34px`
  (`.nav-btn`) are all one-off numbers rather than density tokens.

None of these are breakages; they're places where "make it roomier" isn't the
one-number edit the spacing pass established elsewhere.

### 5.5 — Stale copy and stale mockups

- Settings still says **"Each status becomes a Kanban column."** Kanban was
  unregistered on August 1.
- `mockups/home-panels-preview.html` is current (it has the catalog band, the panel
  grid, the status control). The other four — `home-preview.html`,
  `restyle-preview.html`, `specimen-archive-mockup.html`, and
  `home-hierarchy-explorations.html` — are older one-offs. `home-hierarchy-explorations`
  has archival value (it's where Concept B came from); the other three are
  superseded. The current-state doc's warning that "a stale preview is worse than
  none" only guarantees the one file.
- `home.js` still draws `plate("I", "Accession", …)` — a roman numeral I with no
  plate II or III anywhere, left over from the old numbered-plate Home.

---

## 6. Proposed cleanups, prioritised

Nothing below has been done. Each is meant to be approved and delivered on its own.

### Before starting M3

| # | What | Files | Risk |
|---|---|---|---|
| **1** | Coalesce the per-render archive scans: build the rail's counts in one pass, skip building the rail at all when the view has no catalog chrome, and skip `query()` for `ownFilter` views. (§4.1) | `app.js` | Low — pure internal change, no visible difference except speed |
| **2** | Add an "unscheduled milestones" helper alongside the existing sources, so the Calendar's tray never reads `store.all()` directly. Optionally factor `groupByDay(entries)` out of `todayGroups()` at the same time. (§4.2) | `entries.js` | Low — new function, nothing existing changes |
| **3** | Remove the editor's Escape listener on every close path. (§4.3) | `editor.js` | Very low — 3 lines, fixes a real error banner |

### Cheap and tidy, any time

| # | What | Files | Risk |
|---|---|---|---|
| **4** | Make `defaultAccentHex()` read `--ember` via `tokenHex()`; delete the two literal copies. (§5.1) | `theme.js`, `ui/colorfield.js` | Very low |
| **5** | Make the project chip in the editor use the project's own colour. (§5.2) | `editor.js` | Low — visible change, in a good way |
| **6** | Replace the six literal `rgba()` values with `color-mix()` over tokens, so the body grain inverts on the dark theme. (§5.3) | `app.css` | Low — worth eyeballing in the preview first |
| **7** | Tokenise the index-rail width and the literal `44px`s. (§5.4) | `tokens.css`, `app.css` | Low |
| **8** | Fix the "Kanban column" line in Settings. (§5.5) | `settings.js` | None |

### Dead weight — zero behaviour change

| # | What | Files |
|---|---|---|
| **9** | Remove the five unused imports, `swatch()`, `setDropboxToken()`, the two `dash.view` writes, and the duplicated `sync.js` comment. (§4.7) | 7 files, all one-liners |
| **10** | Remove the seven dead CSS classes. (§4.7) | `app.css` |
| **11** | Decide on `--tint-*` + `tintToken()`: delete both (after #5 removes the last use), or keep and write down why. (§4.7) | `tokens.css`, `theme.js` |
| **12** | Decide what happens to the three superseded mockups: keep as archive, move to a `mockups/archive/` folder, or delete. (§5.5) | `mockups/` |
| **13** | Drop the orphaned roman numeral on Home's capture plate. (§5.5) | `views/home.js` |

### Worth discussing before doing

| # | What | Why it's not a quiet fix |
|---|---|---|
| **14** | Debounce the editor's title/body commits instead of saving per keystroke. (§4.4) | Changes *when* your typing is saved. Needs a deliberate choice (commit on pause? on blur? both?) and the same three-part treatment — deferred commit, draft, focus restore — the milestone boxes got |
| **15** | Fix the Dropbox byte-vs-character offset. (§4.5) | Small change, but it's in `sync.js`, which is the file where a mistake is most expensive. Wants a deliberate two-device test after |
| **16** | Use `PROJECT_TYPE` / `PROJECT_LINK` everywhere and give the store a single `membersOf()`. (§4.6) | Safe, but it touches four files at once, which is exactly the "one giant diff" you asked to avoid. Could be split: store helper first, then one view per upload |

---

## 7. What I did *not* find

Worth stating, since absence of these is the actual health signal:

- No architectural violations. No view writing derived data back, no taxonomy value
  hardcoded such that adding one needs a code change, no view bypassing the query
  layer to reach into the store's internals in a way it shouldn't.
- No stale or missing `SHELL` entries.
- No literal colours in the *view* modules — every one goes through `colorToken()` /
  `groundStyle()` / `inkFor()`. The literals that exist are documented fallbacks in
  `theme.js` and `sketch.js`, plus the six in `app.css` listed above.
- No accessibility regressions: `--tap-min` is still unconditional, `--control-min` is
  the only thing that shrinks under `@media (pointer: fine)`, the 18px floor holds,
  and every interactive control I checked carries a real `aria-label` and a visible
  focus ring.
- The one `!important` in `app.css` is still the documented, load-bearing one.
