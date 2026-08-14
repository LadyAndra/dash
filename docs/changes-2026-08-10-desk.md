# Dash — The Desk: implementation prompt for Opus

**Date:** August 10, 2026
**What this is:** the implementation handoff for the per-project Desk — a freeform surface where a project's entries become cards you place, pile, clip, mark, and highlight, with a structured "Peek" drawer beside it. This chat starts with zero memory: everything you need is in this file plus the four documents listed below, all in `docs/` in this repo. Read them before writing anything.

**Build Phase D0 only in this round.** Phases D1–D4 each get their own round, after Andra has used the previous one. Do not build ahead.

---

## 0. Who you're building for, and the hard constraints

Andra is not a developer. She cannot read or debug code, deploys exclusively by dragging files into GitHub's web uploader, and describes what she sees to an AI when something breaks. Consequences, none negotiable:

- **No build step.** Vanilla JS, ES modules, no bundler, no framework, no CDN fetches. The repo contains exactly the files the browser runs.
- **Deliverables are complete uploadable files** — never diffs, never snippets — plus a short plain-English "what changed and how to try it" note (the existing `docs/changes-*.md` files show the register; `changes-2026-08-01-milestones.md` is a good model).
- **Theme tokens only.** No literal colors, sizes, or fonts in components. Audited by theme swap.
- **Accessibility floor:** 18px+ base text, AA contrast, 44px+ touch targets (`--tap-min` vs `--control-min` distinction — see the current-state doc), `prefers-reduced-motion` respected.
- **Never delete user data.** Tombstones, not erasure.
- Boring, explicit, well-commented code; comments reference doc sections (e.g. `// per-key viewState op: desk addendum §12.1`).

## 1. Required reading, in order

1. `docs/dash-desk-addendum.md` — **the spec for this work.** §1–§11 are the product decisions (all confirmed; do not relitigate); **§12 is the data model and merge architecture; §13 is the phase plan.** This prompt implements that document.
2. `docs/dash-current-state.md` — what's actually built, operational rules (service-worker `SHELL`, cache bumps, render coalescing, focus rules, one-archive-pass rule). **Note: this doc may lag the repo slightly** (e.g. it says `dash-v29`; the deployed cache version is later). **Trust `sw.js` on disk for the current `CACHE_VERSION`, and trust the code for current file structure** — a bookshelf-style projects picker and a dark picker band were added after the doc's last update.
3. `docs/dash-milestones-calendar-addendum.md` — the `"ms"` op pattern that §12's three new op kinds mirror, and the testing posture this work must repeat.
4. `docs/dash-architecture-proposal.md` — the original system (§2 data model, §3 logs, §6 merge, §13 maintainer constraints).

## 2. What the Desk is, in one paragraph (context, not spec)

Each project's page — under its existing colored banner, which does not change — becomes a bounded, scrollable, freeform surface. Entries render as cards with a slight per-card rotation ("tolerance, not texture" — no paper textures, no skeuomorphism). Cards are placed by dragging them out of a drawer that slides from under the banner; the drawer's shelves are Unplaced (project members with no desk position), Filed (the structured list view of the project), and Milestones (the existing milestone editor, moved intact). Piles are emergent proximity, stored nowhere. Clips make a few cards move as one rigid unit. Post-its are small text notes, free-floating or attached to a clip. Wonder symbols are placeable glyphs. Highlights mark phrases inside an entry's body, scoped to the project they were made in. Desk exists on Mac (pointer-fine + wide viewport); phone gets the Peek content full-screen; iPad is deferred by the gate, not by architecture.

---

## 3. Phase D0 — the mockup (this round)

**Deliverable: one file, `mockups/desk-preview.html`.** No app code changes, no `sw.js` change, no SHELL change — mockups are not part of the deployed shell (see `mockups/README.md` and how `home-panels-preview.html` is handled).

Like `home-panels-preview.html`, it must link the **real** `css/tokens.css` and `css/app.css` (relative paths, so it renders truthfully from the repo folder) with stand-in content, plus a `<style>` block for the desk-only CSS that would later move into `app.css`. It exists because Dash can't be run locally in Andra's setup — the mockup is how a design is seen before it's uploaded.

It must show, with static stand-in data:

- A project banner (borrow the current banner's markup/classes) with the drawer **closed**, then openable — a working open/close so the slide is judgeable.
- The drawer's three shelves with stand-in rows: Unplaced, Filed, Milestones.
- A desk surface with ~10 stand-in cards: some loose, some overlapping into a "pile," one clip of 2–3 cards carrying a post-it, one free-floating post-it, a `?` symbol pinned to a card and a `!` sitting free.
- **Adjustable tuning controls** (the point of D0): sliders or steppers for rotation range, overlap/spacing looseness, card width, and a toggle for pile "weight" shading — so Andra can react and pick values instead of describing them in prose. Include a small readout of the chosen values so she can paste them back into chat.
- Card anatomy candidates: at least two variants toggleable (e.g. title-only vs. title + type mark + status hint) — §10 of the addendum leaves card anatomy to this pass.
- Tap behavior demonstrated: tap raises a card (z); show both candidate open gestures (double-click vs. an explicit affordance) as toggles if feasible, or as two labeled examples.
- Both themes: a light/dark toggle like the home-panels preview has.
- Wobble as **static rotation** only — no idle animation. Any drag/settle motion demoed must respect `prefers-reduced-motion`.

**Definition of done (D0):** the file opens standalone from the repo folder; every color/size/font in it comes from tokens or from a clearly-marked "CANDIDATE:" constant block at the top of its style section (these are the values D0 exists to choose — they graduate to tokens/constants in D1); both themes render legibly; Andra has something to react to for every §10 "visual tuning" item (rotation, overlap, pile weight, card anatomy, tap semantics). Deliver with a plain-English note listing exactly which decisions you need her reactions on.

**D0 output that gates D1:** rotation range, card anatomy, open gesture, pile-weight yes/no, drawer feel. Record her choices in the delivery note for the D1 round; the D1 implementer copies them into constants and updates `dash-current-state.md`.

---

## 4. Phases D1–D4 — summary (each is its own future round; do not build now)

The full data model is `dash-desk-addendum.md` §12 — treat it as authoritative. Abbreviated here so you can see the whole road:

- **D1 — placement core.** New op kind `"vs"` (per-key, per-field viewState — key `desk:<projectId>`, fields `pos`/`z`/`clip`/`removed`/`created`), a **shared generic sub-record merge helper** in `store.js` that `"ms"` could also use, `formatVersion` → 3, snapshot materialization, desk surface replacing the project page body behind the platform gate (`pointer: fine` + width), drag-from-drawer, move, raise, un-place (tombstone + restore), the three-shelf drawer, phone's Peek page. New pure-rules module (suggest `js/desk.js`: `deskData(store, projectId)` in **one archive pass** with a scan-count test, rotation hash, z assignment, clamping) that imports nothing, like `js/milestones.js`. The milestone editor moves into the drawer **intact** — it has focus bookkeeping; relocate its mount point, don't rewrite it, and hide any redundant chrome by CSS (there is precedent for exactly this).
- **D2 — clips + post-its.** Op kind `"dk"`, collections `clip` and `note`; clip/unclip via `vs set clip`; clip drag = one `pos` op per member on drop; post-its attached (render at clip's derived bounds) and free-floating.
- **D3 — symbols.** `"dk"` collection `sym`; drop location decides attached-vs-free; starter glyphs `?` `!` `→` `★`; drawn in ink, never `--ember`.
- **D4 — highlights.** Op kind `"hl"`; content-anchored (phrase + prefix/suffix, re-found at render; orphans keep data, stop painting); four new tokens `--hl-1`…`--hl-4` in both themes, AA-verified via the existing `js/theme.js` math; highlights render/create only when the editor is opened from a project context.

**Standing rules that apply to every phase** (details and rationale in `dash-current-state.md`):

- Every new JS file goes into `SHELL` in `sw.js` **and** `CACHE_VERSION` is bumped, in the same upload. Cross-check `SHELL` against disk.
- Drags commit on drop; no per-frame ops; no store emit mid-drag; a background sync landing mid-drag must not steal the card.
- One archive pass per render — `deskData` is the only scanner; nothing else touches `store.all()`.
- Any in-view text field (the post-it editor, D2) needs the full deferred-commit trio: commit on Enter/blur, a draft on `ctx.viewLocal`, focus + cursor restore.
- Escape closes the **topmost** surface only (drawer vs. editor layering — the editor-escape fix set this precedent).
- Ember is an indicator only. Overdue cards may carry it exactly as list rows do; nothing decorative may.
- Select mode: off on the desk surface, alive in Peek's Filed shelf (keep the existing `statusControl` on those rows).
- Merge rules get **headless replay tests in every permutation** with realistic wall-clock timestamps, asserting byte-identical converged snapshots (key order normalized), plus two live Stores swapping real log lines — the M1 posture, repeated. Desk geometry helpers get headless frame/NaN tests (the widget posture).
- **Format bump etiquette:** the upload note for D1 must say "update all devices before editing" — older code still throws on a newer snapshot; the forward-compatible notice only exists from v2 onward.
- Every phase ends with the two-device offline-edit sync test (now including desk ops) and a full theme swap.

---

## 5. Definition of done, per phase (D1–D4, for those future rounds)

- **D1:** place, move, raise, un-place, and restore cards on the Mac desk; the same entry sits placed on Project A and unplaced on Project B simultaneously; two devices arranging **different** cards of the same desk offline merge with zero loss; same-card `pos` collision surfaces in merge notes; the drawer's three shelves work; the phone shows the Peek page with no desk, no unplaced shelf, milestones as a section; theme swap clean; no new archive scans (test-enforced).
- **D2:** clip three cards, drag one member, all move; unclip; a clip with a post-it explains itself; a free post-it sits on open desk; concurrent "device 1 moves the card / device 2 clips it" merges with both facts intact; degenerate clips render quietly.
- **D3:** a symbol dropped on a card rides that card's moves; the same symbol never appears on the entry's card on a *different* project's desk; a free symbol stays put; removing tombstones, restore works.
- **D4:** highlight a phrase from Project A's context; it shows opening the entry from A (desk or Peek) and not from B, and not from List/Board/Home; edit the body so the phrase survives — highlight follows; edit it away — highlight orphans without error; all four highlighter tokens pass AA in both themes.

---

## 6. After every phase lands

**Update `docs/dash-current-state.md`** — what was built, what was deliberately not, any decisions made mid-build with their reasoning, new `SHELL` entries and cache version, new localStorage keys if any (there should be almost none — desk arrangement is synced data, not localStorage, per addendum §8.19). Ship the updated doc in the same upload as the code. This document is how every future session knows what exists; an unupdated one actively misleads.

If anything in the addendum turns out to be ambiguous or wrong in practice, **ask Andra in plain language — one batch of questions, multiple-choice where possible** — rather than guessing or silently deviating. Settled decisions (addendum §8, §12) are not up for relitigation.
