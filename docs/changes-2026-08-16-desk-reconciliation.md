# Change note — Desk reconciliation + CI closeout

**Date:** 16 August 2026  
**Scope:** behavior-preserving Desk architecture/performance closeout, plus maintenance of the GitHub test workflow.

## What changed

The deferred Desk reconciliation work is complete. It landed in three deliberately separated layers:

1. **Persistent shell/controller** — the selected project's Desk is mounted once and refreshed in place. The banner, Peek drawer shell, viewport, sizer, surface and mat keep their DOM identity across ordinary store writes. Listener/timer/observer ownership is explicit and released on real teardown.
2. **Keyed Desk objects** — cards are retained by entry id, clip marks by `cid`, and post-its by `nid`. Existing nodes are updated/moved instead of destroying every Desk object on every refresh. Post-it textarea focus/cursor survives unrelated writes naturally.
3. **Pile-weight invalidation** — the O(n²) pile-weight calculation is cached by the ids and x/y coordinates of loose cards. It reruns for loose geometry/membership changes, not for title/status/z-only/content changes. This is a renderer cache only; piles remain derived and unstored.

The Peek regression that exposed the structural problem is closed: editing something inside an open drawer updates its contents without replacing the drawer and replaying its opening slide. A pending delayed clear from a close is cancelled if the drawer is reopened quickly.

Two visual-state cleanups landed alongside the component they belonged to:

- an active post-it no longer reads as an ember/error double outline;
- attaching a post-it to a clip no longer draws the square drop-target box around the clip icon. Keyboard focus visibility remains.

## Tests and CI

The Desk regression suite now covers the persistent shell, drawers, keyed objects, runtime/listener lifecycle and pile-weight invalidation. While making CI authoritative, two jsdom compatibility regressions were fixed (`window.cancelAnimationFrame` and the phone Peek mount-hook contract). The final GitHub run is green.

The `Check Dash` workflow is also moved off the action versions that emitted GitHub's Node 20 deprecation warning: `actions/checkout@v6` and `actions/setup-node@v7`. **The Node version used to execute Dash's tests stays at 22**, so this maintenance change updates the action wrappers without changing the test runtime.

## Data / compatibility impact

- No Store or Sync semantics changed.
- No saved-data migration.
- `formatVersion` remains 3.
- No external runtime dependency, framework or build step.
- No new runtime file.
- This new file is documentation only and does **not** belong in the service worker's cached shell.

## What remains

The reconciliation work is closed. The next planned Desk feature phase is D3 wonder symbols; D4 highlights remains after that.
