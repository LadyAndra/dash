# tests/

Headless tests. **Nothing in here is deployed** — not in the service worker's
`SHELL`, not uploaded to GitHub Pages. They exist to be run on a machine with
Node, by whoever is building a phase.

    cd <repo root>
    node tests/desk-d1.test.mjs

No test framework, no install, no build step — the same constraint as the app
itself. `node` and the repo's own `js/` folder are the whole toolchain.

| File | What it covers |
|---|---|
| `desk-d1.render.test.mjs` | Phase D1 rendering: the desk and the phone's Peek page both build, the drawers open one at a time, and place / clamp / un-place write what they claim. Needs jsdom (`npm install jsdom` in this folder) — the only thing in the repo that wants an install, and nothing ships depends on it. |
| `desk-d1.gesture.test.mjs` | Steps 3–4: that no render happens while a pointer gesture is in progress, that a hold is never leaked (cancel, blur, doubled pointerdown, teardown), and that double-click survives the rebuild the first click causes. Needs jsdom. |
| `desk-d1.viewstate.test.mjs` | The post-deploy pass: that a snapshot survives a JSON round-trip unchanged (which is what makes the self-sync marker work), and that a glance never overwrites the saved scroll position. Needs jsdom. |
| `desk-d1.test.mjs` | Phase D1 of the Desk: the `"vs"` op's merge rules in every arrival order, two-device convergence, un-place/restore, collision reporting, the one-archive-pass rule, and the pure geometry (wobble, clamping, z-order, pile weight, glance framing). |
| `desk-d2.test.mjs` | Phase D2: the `"dk"` op (clips and post-its) through the same shared merge helper — every arrival order, two devices clipping different cards offline, add-idempotence, remove-vs-edit, a late `create` that must not wipe a project's clips, and an unknown collection (D3's `sym`) landing safely. Also the derived clip geometry, and the post-it tint measured against `js/theme.js`'s own `contrast()` across every possible project colour in both themes. Needs nothing installed. |
| `desk-d2.render.test.mjs` | Phase D2 interaction: select-to-clip writes one clip and one membership op each and nothing before that; a closed clip drags as one object with relative offsets preserved; open/close writes nothing at all; both unclip gestures; the post-it's deferred commit, its draft surviving a rebuild, and drop-decides-attachment. Then the August 16 round: that a post-it you have not typed into yet survives the pointer moving away, that words typed into one that was already thrown away bring it back, the right-pinned stack, an expanded card outranking its grid siblings, the measured open grid, and a selection that cannot escape an expanded card. Needs jsdom. |

`visual-harness.html` is not a test. It is a page that draws a real desk — a
clip, a post-it, cards at every width — from the real `js/` and `css/`, so that
the things a headless test can never see can be LOOKED at (§14.20: "headless
tests can check structure and data, never geometry"). Serve the repo folder
(`python3 -m http.server`) and open it; module imports need http, not `file:`.

Why these exist: merge bugs are invisible until they've quietly eaten
something, and the desk's whole promise is that two devices arranging the same
project offline lose nothing. The D1 run found two real bugs before any of it
was drawn — see `docs/changes-2026-08-14-desk-d1.md` — and the D2 run found a
third, in the double-click that opens a clip: see
`docs/changes-2026-08-16-desk-d2-clips-postits.md`.
