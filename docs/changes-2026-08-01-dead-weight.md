# Change note — the dead-weight sweep

**Date:** August 1, 2026. **Cleanups #9–#13 of the code-health review**
(`docs/review-2026-08-01-code-health.md`). **Live at `dash-v29`.**

**Files changed:** `js/app.js`, `js/theme.js`, `js/sync.js`, `js/views/shared.js`,
`js/views/home.js`, `js/views/project.js`, `css/app.css`, `css/tokens.css`, plus a
reshuffle inside `mockups/`.

**Behaviour changed: none.** Every single thing removed here had already been proven
to have zero readers. Nothing on screen should move. This is the one batch where
"looks identical" is the entire success criterion.

---

## What went

### #9 — dead JavaScript

| Removed | From | Why it was safe |
|---|---|---|
| `supportsFolder` import | `app.js` | imported, never called |
| `toast` import | `theme.js` | imported, never called |
| `typeChip` import | `views/project.js` | imported, never called |
| `tintToken` import | `views/shared.js` | imported, never called (it was hiding in a comment, which is why an earlier scan missed it) |
| `swatch()` | `views/shared.js` | exported, called by nothing — `project.js` builds its own swatch inline |
| `setDropboxToken()` | `sync.js` | defined, called by nothing — pasting a token by hand was the *old* way in, replaced by the PKCE connect flow |
| two `dash.view` writes | `app.js` | written on every view switch, **read by nothing** — Dash always opens on Home by design |
| a duplicated comment | `sync.js` | the same "content-addressed…" paragraph appeared twice in a row |

**`dash.view` is abandoned in place**, exactly like `dash.sidebar` before it: the key
may still be sitting in your devices' storage and nothing looks at it. Harmless.

**What was deliberately NOT touched:** the commented-out imports for the pet widgets
and for Kanban / Columns. An automated scan flags those as unused, because it can't
tell a comment from code — but they are the "unregister, don't delete" preservation,
and they're the reason bringing any of those back is a one-line change. Left exactly
as they are.

### #10 — dead CSS

Six rules with no element anywhere that could ever match them:
`.sidebar-footer` (and its phone variant), `.sheet-masthead-sub`, `.mount-head`
(+ `.mount-head .lbl`), `.rail-actions`, `.attach-name`, `.lbl-ember`.

All of them are fossils of things that moved: Settings and Read-aloud leaving the
sidebar, the masthead losing its sub-line, the neglect register losing its own header
when it moved into a panel.

`.on-ground` was on the original removal list and has come **off** it — the project
chip now uses it, which is what it was written for in the first place.

### #11 — eleven dead colour tokens

| Removed | Why |
|---|---|
| `--tint-green` … `--tint-gray` (7, in both themes) | their consumers were the Kanban wells and Finder selection (both unregistered) plus one hardcoded project chip that now wears its project's own colour |
| `--ember-soft` | the Delete hover, which now derives from `--ember` |
| `--accent-1`, `--accent-3`, `--accent-4` | labelled "quiet accents, demoted" — referenced by nothing, anywhere |

`tintToken()` went with them. Worth recording *why* it could never have done its job:
there is no tint variant of a colour you pick yourself, so it handed the colour
straight back — meaning a "tinted" background came out the same colour as the text on
it. `groundStyle()` is the thing that actually solves that, by choosing a readable ink.

**`--accent-2` deliberately stays.** Nothing reads it, but `setAccent()` still
*writes* it and it's named in the original proposal §10. Removing it means touching
the accent code path, which doesn't belong in a zero-behaviour-change sweep. Flagging
it rather than doing it.

### #12 — the mockups

`mockups/` had five files, only one of which was real. It now has one live file and
an `archive/` folder, plus a `README.md` explaining which is which.

- **live:** `home-panels-preview.html` — the one that links the real CSS and is how a
  layout gets looked at before upload. Still needs keeping current when CSS changes.
- **archived:** `home-hierarchy-explorations.html` (where Concept B came from — the
  record of what Home's layout chose and rejected), `home-preview.html`,
  `restyle-preview.html`, `specimen-archive-mockup.html`.

**Moved, not deleted**, and none of it is deployed anyway — `mockups/` isn't in
`SHELL` and isn't uploaded. This is local tidiness only.

### #13 — the orphaned roman numeral

Home's capture section was headed **"I · Accession"**. Home used to be a vertical run
of numbered plates — I, II, III — and when it became a panel board in August 2026,
only plate I survived. So the app was showing a numeral one belonging to a sequence
that no longer existed.

The number is gone; the mono voice and the "New entry" readout stay. `plate()` lost
its now-pointless first parameter, and `.plate-no` went with it.

---

## How it was checked

This is the batch with the widest blast radius — nine files — so it got the most
mechanical verification:

1. **Every JS file still parses** as an ES module.
2. **Every import resolves to a real export.** This is the check that matters when
   deleting functions: importing something that no longer exists is a blank screen at
   boot, not a helpful error. All clean.
3. **Every `var(--x)` in the CSS still resolves** — all 57. Deleting a token that
   something still reads doesn't error, it silently renders as nothing.
4. **CSS braces balanced**, in case a rule removal ate a bracket.
5. **`SHELL` vs disk** — unchanged and still correct (moving the mockups couldn't
   affect it, but it was worth confirming rather than assuming).
6. **All five behavioural test suites re-run** against the swept code: the editor
   (9), the Calendar entry sources (20), the accent (8), project chips (8), the
   Delete hover (3). **48 assertions, all passing.**
7. A fresh dead-code audit afterwards: **no unused imports and no dead CSS classes
   remain.**

---

## How to try it

1. Upload the **`js` folder** and the **`css` folder**. (`sw.js` is already at
   `dash-v29` — one upload covers everything from cleanup #1 onward.)
2. **Hard-reload once** — Cmd+Shift+R.

**The test is that nothing looks different.** Worth a quick pass over Home, List,
Board and a project page. The single visible change in this batch is on Home: the
capture heading now reads **"Accession"** instead of **"I · Accession"**.

---

## Where the review stands

All thirteen items are done, plus the `--ember-soft` contrast fix found along the
way. What remains from the original review is the three that were flagged
**"worth discussing before doing"** — and they still are:

- **#14** — the item editor saves on every keystroke, so a 300-character note appends
  300 operations to the sync log. Fixing it changes *when* your typing is saved, so
  it needs a deliberate choice about the commit rule.
- **#15** — the Dropbox sync re-downloads every device log on every 10-second poll
  once any log contains a non-ASCII character (an accent, a curly quote). Wasted
  traffic, no data risk. Small change, but it's in `sync.js`, where mistakes are
  expensive — wants a two-device test after.
- **#16** — `PROJECT_TYPE` / `PROJECT_LINK` are exported and used nowhere, while six
  files hardcode `"project"` and two hardcode `"in project"`, with project membership
  computed by hand in three places. Safe, but it touches four files at once.

None of them block the Calendar.
