# Dash — the Desk: August 14 handoff (historical)

**Written:** August 14, 2026  
**Closed:** August 16, 2026  
**Status:** historical context only — **do not treat this file as an open-task list.**

This handoff was written after Desk D1, before D2 and before the in-place reconciliation work. Its original headline bug said Step 5 still needed to stop rebuilding the Desk on every store write. **That work is now complete.**

For the current Desk, read in this order:

1. the current code;
2. `docs/dash-current-state.md`;
3. `docs/dash-desk-addendum.md`, especially §14.27;
4. `docs/changes-2026-08-16-desk-reconciliation.md`;
5. this file only when you need the August 14 reasoning that led there.

---

## What the old Step 5 became

The Desk now has a persistent controller for the selected project. Ordinary store writes refresh it instead of replacing the whole project page. The page/banner/drawers/viewport/sizer/surface/mat survive, gestures are wired once against current mutable runtime data, and teardown is explicit when the Desk is actually left.

Cards, clip marks and post-its then gained keyed reconciliation by stable id. The remaining pile-weight O(n²) calculation is cached by loose-card geometry, so content-only writes do not rerun it.

The concrete bug that motivated the pass — an already-open Peek drawer sliding open again after an edit inside it — is closed. The close/reopen timeout race is covered too.

No Store/Sync/schema migration was part of the reconciliation work. `formatVersion` remains 3.

---

## What from the August 14 handoff still matters

- **The pointer owns the Desk until release.** Render holds still protect active drag/pan gestures.
- **The glance keeps a fixed-size `.desk-sizer`.** The surface transform never owns scrollable size and glance does not rewrite scroll position.
- **Piles stay derived.** They are never stored as objects or membership.
- **No gesture library was added.** `panzoom` still conflicts with the Desk's scroll-based pan + glance transform; `interact.js` only earns consideration if a future feature actually needs inertia, snapping, resize handles or multi-touch rotation.
- **jsdom checks structure/data, not geometry.** Anything that depends on real layout still belongs in `tests/visual-harness.html` and a human visual check.
- **Theme tokens, no build step, complete replacement files, and owner-safe deployment remain non-negotiable.** See `START-HERE.md`.

---

## Product work that is still genuinely open

- **D3 — wonder symbols**
- **D4 — highlights**

Those are feature phases, not unfinished reconciliation. If either starts, use the stable controller/reconciliation model that now exists rather than reopening the old Step 5 diagnosis.
