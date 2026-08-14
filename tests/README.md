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
| `desk-d1.test.mjs` | Phase D1 of the Desk: the `"vs"` op's merge rules in every arrival order, two-device convergence, un-place/restore, collision reporting, the one-archive-pass rule, and the pure geometry (wobble, clamping, z-order, pile weight, glance framing). |

Why these exist: merge bugs are invisible until they've quietly eaten
something, and the desk's whole promise is that two devices arranging the same
project offline lose nothing. The D1 run found two real bugs before any of it
was drawn — see `docs/changes-2026-08-14-desk-d1.md`.
