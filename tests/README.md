# tests/ — automated checks and test support

This is Dash's **authoritative test area**. GitHub's **Check Dash** workflow runs
every `*.test.mjs` file in this folder after a push to `main`.

The singular `test/` folder is different: it contains only two manual item-editor
preview pages. Do not put automated tests there, and do not copy app source there.

**Nothing in this folder is loaded by Dash or included in the service worker's
`SHELL`.** Because GitHub Pages publishes this public repository from its root,
these files can still be reached as ordinary public files; they are test/support
material, not part of the app runtime.

    cd <repo root>
    node tests/desk-d1.test.mjs

There is no test framework and no build step. Most tests need only `node` and
the repo's own `js/` folder. The rendering/interaction tests use `jsdom`, which
GitHub installs only for the test run; nothing Dash ships depends on it.
**Check Dash pins jsdom to 30.0.1** so an unrelated upstream release cannot
change the test environment between Dash uploads.

| File | What it covers |
|---|---|
| `release-safety.test.mjs` | Publishing guardrail. Checks that every file named in `sw.js` exists, every required offline asset reached from `index.html`, `manifest.json`, CSS, and ES-module imports is covered by `SHELL` (with explicit online-only diagnostics documented as exceptions), and — when git history is available — a commit that changes a cached app file also changes `sw.js`, while every `sw.js` change bumps `CACHE_VERSION`. Needs no package. |
| `desk-d1.render.test.mjs` | Phase D1 rendering: the desk and the phone's Peek page both build, the drawers open one at a time, and place / clamp / un-place write what they claim. Needs jsdom — GitHub installs the pinned CI version; nothing ships depends on it. |
| `desk-d1.gesture.test.mjs` | Steps 3–4: that no render happens while a pointer gesture is in progress, that a hold is never leaked (cancel, blur, doubled pointerdown, teardown), and that double-click survives the rebuild the first click causes. Needs jsdom. |
| `desk-d1.viewstate.test.mjs` | The post-deploy pass: that a snapshot survives a JSON round-trip unchanged (which is what makes the self-sync marker work), and that a glance never overwrites the saved scroll position. Needs jsdom. |
| `desk-d1.test.mjs` | Phase D1 of the Desk: the `"vs"` op's merge rules in every arrival order, two-device convergence, un-place/restore, collision reporting, the one-archive-pass rule, and the pure geometry (wobble, clamping, z-order, pile weight, glance framing). |
| `desk-d2.test.mjs` | Phase D2: the `"dk"` op (clips and post-its) through the same shared merge helper — every arrival order, two devices clipping different cards offline, add-idempotence, remove-vs-edit, a late `create` that must not wipe a project's clips, and an unknown collection (D3's `sym`) landing safely. Also the derived clip geometry, and the post-it tint measured against `js/theme.js`'s own `contrast()` across every possible project colour in both themes. Needs nothing installed. |
| `desk-d2.render.test.mjs` | Phase D2 interaction: select-to-clip writes one clip and one membership op each and nothing before that; a closed clip drags as one object with relative offsets preserved; open/close writes nothing at all; both unclip gestures; the post-it's deferred commit, its draft surviving a rebuild, and drop-decides-attachment. Then the August 16 round: that a post-it you have not typed into yet survives the pointer moving away, that words typed into one that was already thrown away bring it back, the right-pinned stack, an expanded card outranking its grid siblings, the measured open grid, and a selection that cannot escape an expanded card. Needs jsdom. |
| `calendar.test.mjs` | The Calendar's pure logic (M3): the dye ramp at every boundary and against the tokens it claims to be, weight, both strip axis functions at `CAL_HORIZON_DAYS = 120`, the tooltip's edge clamps, the load score and the fog's continuity, the shelf's shedding order, and the flip clock's carry across month ends and leap years. It also audits the source: a literal colour anywhere in `calendar.js`, `flipdate.js` or `calendar.css` fails the build, because a baked colour is what would force a redraw on a theme swap. Needs nothing installed. |
| `calendar.render.test.mjs` | The Calendar under jsdom: that the shell is KEPT across redraws rather than rebuilt (which would destroy an open flip widget mid-edit), that each mark carries the ramp class and the ARIA its band and distance imply, that the tooltip follows focus and not only hover, that the overdue field breathes while the NOW line stays put, that Month mode shows finished entries as history, that the tray's SET writes one op and the phase leaves the tray, that reduced motion is a different code path rather than a slower one, and that flipping the theme changes nothing in the drawn markup. Needs jsdom. |
| `dateinput.test.mjs` | The flip-numeral date input, app-wide (August 23, 2026): the compact size and its accessibility floors, the empty state and the fact that one notch on an empty field lands on TODAY rather than tomorrow, clearing, the saved-vs-unsaved signal (this is the one field in Dash that does not autosave per tick, so that has to be visible AND announced), both safety nets that stop that honesty becoming a trap, and hover-and-scroll working with nothing focused and nothing clicked. Also checks that no hand-rolled native date input is left in either editor. Needs jsdom. The widget's date ARITHMETIC is in `calendar.test.mjs`, where it was written. |
| `round1-trash.test.mjs` | Round 1 (October 2026), the Trash: moving to trash and restoring are one ordinary `set` op each; a trashed item vanishes from List/Board, search, tags, Home's counts and due panel, the Calendar, the desk, link lists, the project index and member counts, and comes back on restore with its links, tags and exact desk position; a trashed project; Empty trash as the only permanent step; the snapshot keeping trashed items; two devices; the editor's Move to trash; the drawer's Restore and its in-drawer confirmation. Needs jsdom. |
| `round1-1-trash-everywhere.test.mjs` | Round 1.1, trash everywhere: the per-item trash button on List (and a List search), Board, Home's Unfiled box and due panel, and desk cards — one ordinary op, no confirm, never opens the entry under it, an Undo that puts it back, and absent in Select mode, on milestone rows and on cards in a closed clip. The desk card's right-click Move to trash. Select mode's bulk Move to trash, one op per item, and an Undo that restores exactly that batch. A project trashed from a button keeps its members' links. Post-its and desk images: the right-click scribble moves them to the same Trash (one op each), the drawer lists and restores them, a post-it on a clip comes back on it, two devices agree, Empty trash removes them for good and erases an image file only when nothing else uses it, and a blank post-it is still just discarded. Then **the audit**: it scans every file in `js/` and fails if anything other than Empty trash can permanently delete an item, a post-it (blank ones aside) or a desk image. Needs jsdom. |
| `round1-project-order.test.mjs` | Round 1, hand-sorted projects: alphabetical start with zero writes, the one-time rank materialisation then one op per move, new projects at the bottom, float-precision re-spacing, two devices converging (both moves survive), the ▲ ▼ buttons, and the keyboard pattern (Space picks up, arrows move, Space/Enter drops, Escape cancels, plain arrows untouched, nothing written until the drop). Needs jsdom. |
| `round1-datemark.test.mjs` | Round 1, Mark a date: one create op (plus one link op with a project), shows on the Calendar and Home and nowhere else, never a project member and never moves a stage, a past mark is history not overdue, trash/restore/snapshot, two devices, the form (nothing written until Save, Cancel and Escape leave no trace), Home's and the desk banner's buttons, and the Calendar drawing and opening it. Needs jsdom. |
| `round1-desktop-only.test.mjs` | Round 1, step zero: boots the real `app.js` phone-shaped and checks the phone gets the plain "desktop only" screen with nothing to tap, and that the capture screen was unregistered, not deleted. Needs jsdom. |
| `round1-app-desktop.test.mjs` | Round 1: boots the real `app.js` desktop-shaped and checks the wiring end to end — the Trash button beside Settings with its count, Home's Mark a date button, and a capture → Move to trash → Restore round trip. Needs jsdom. |
| `project-shelf.test.mjs` | The Projects overview's shelf: that a redraw KEEPS its spines rather than rebuilding them (which is what stopped the tilt animation restarting on every unrelated store write), that it still reflects renames, additions and removals, that entry counts come from one archive pass rather than one per spine, and that a brand new spine does not animate into a hover nobody performed. Needs jsdom. |

`calendar-harness.html` and `visual-harness.html` are not tests. They are pages that draw a real desk
— a clip, a post-it, cards at every width — and a real Calendar from the real
`js/` and `css/`, so that the things a headless test can never see can be
LOOKED at (§14.20: "headless tests can check structure and data, never
geometry"). Serve the repo folder (`python3 -m http.server`) and open them;
module imports need http, not `file:`. The Calendar one takes query flags:
`?dark=1`, `?heavy=1` (the fog at its ceiling), `?quiet=1` (the landscape
clear), `?w=1100` (watch the shelf shed).

Why these exist: merge bugs are invisible until they've quietly eaten
something, and the desk's whole promise is that two devices arranging the same
project offline lose nothing. The D1 run found two real bugs before any of it
was drawn — see `docs/changes-2026-08-14-desk-d1.md` — and the D2 run found a
third, in the double-click that opens a clip: see
`docs/changes-2026-08-16-desk-d2-clips-postits.md`.
