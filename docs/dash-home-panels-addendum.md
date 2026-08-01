# Dash — Home dashboard panels (build brief for Opus)

**Status:** approved direction, not yet built. Paste this whole document to Opus as the prompt.
**Date:** August 1, 2026.
**Companion docs:** `dash-current-state.md` (read first — full picture of what's built), `dash-architecture-proposal.md` (§4.1 view layer, §10 theming), `mockups/home-hierarchy-explorations.html` (the approved visual reference — open it in a browser; Concept B is the one to build).

---

## 0. What this is and why

Andra reviewed three Home layout directions and picked **Concept B** from `mockups/home-hierarchy-explorations.html`: a two-column dashboard grid — a narrower left rail (capture + stat readouts) and a right column of bordered panels (Today, the neglect register) — instead of Home's current single vertical scroll. Her words: "the today portion just all blends together... I feel like I'm missing true dashboard components... everything reads together like a list."

She also asked for two things beyond the visual layout, and both shape the implementation, not just the styling:

1. **Room to grow to more columns later**, as more widgets get added (the shelved pet/weather/tide/train widgets from `dash-current-state.md`'s "Home corner cluster" section are candidates — not in scope now, but the layout shouldn't have to be rebuilt to fit them later).
2. **A modular panel system** — adding a future panel should be "write one panel module," not "re-touch home.js's render function."

This is a **layout and structure change only.** No new data, no new views, no new functionality — Today's contents, the neglect register's contents, and capture all work exactly as they do now. This is purely: how are they arranged, and what's the seam for adding more of them.

---

## 1. The panel contract

Introduce a small registry, the same shape as the existing view registry (`dash-architecture-proposal.md` §4.1: "each view is a module implementing a tiny interface... adding a future view = adding one module; zero changes to data or other views"). Panels get the same treatment, one level down, inside Home:

```js
// a panel is a plain object:
{
  id: "today",              // stable string, used for future per-device ordering/hiding
  title: "Due & coming up", // used in the panel header bar
  span: 1,                  // how many grid columns wide (1 for now; 2 = full width)
  render(container, ctx),   // same render(container, ctx) shape views already use
}
```

`js/views/home.js` keeps a local array of panel objects (do **not** create a separate `js/panels.js` file yet — there is exactly one place panels are used, so a standalone registry module would be a layer with nothing to abstract. Pull it into its own file the day a *second* view needs panels, not before. This mirrors the existing rule in `dash-current-state.md`: "Bulk edits introduce no new data... any future 'apply to many' feature should follow this rule" — same instinct, don't build the general version until something real needs it).

Each of Home's existing sections becomes a panel:

- **Capture** — stays where it is conceptually (first, always visible), but now rendered as the fixed content of the left rail, not a numbered plate in a vertical flow. It is not part of the panel array — it's structurally pinned, the way the sidebar's Settings/Read-aloud are pinned rather than registry-driven.
- **Stats** — new. A small stat strip (in collection / due today / overdue / upcoming count) as blocked readouts, in the left rail under capture. Pull the numbers from the same `groups` object `todayGroups(store)` already returns — no new computation.
- **Today** (`todayPanel()`) — becomes a panel, `span: 1`, in the right column.
- **Neglect register** (`neglectRegister()`) — becomes a panel, `span: 1`, in the right column, below Today.

## 2. Layout mechanics

- CSS grid, left rail fixed width, right side flexible: `grid-template-columns: 280px 1fr;` — reuse the exact values from the mockup's `.hxB-grid` (already tuned against the real tokens).
- **Build the grid so a third (or fourth) column is a data change, not a markup rewrite.** Concretely: the right side should be its own inner grid that lays out the *panel array*, not hand-placed divs — so going from one column of stacked panels to two side-by-side columns later is changing how that inner grid wraps panels (e.g. `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))` with panels giving their own `span`), not rewriting `home.js`. Don't build the multi-column-of-panels version now (there are only two panels — one column is correct today) — just don't paint the layout into a corner where adding a third panel requires restructuring the grid.
- Collapse to a single stacked column at the existing 820px breakpoint — same convention the sidebar already uses (`dash-current-state.md`: "the 820px media query collapses it into a horizontal strip"). Order on mobile: capture, stats, then panels in registry order.
- Panel chrome: bordered box (`--border-strong`), a header bar on `--surface-sunken` with the panel title in the mono label voice, body on `--surface-raised`. Copy `.hxB-panel` / `.hxB-panel-head` / `.hxB-panel-body` from the mockup verbatim as the real classes (rename off the `hx-` prefix — that prefix was scoped to the comparison document only, not meant to ship).
- Stat tiles: copy `.hx-stat` / `.hx-stats` from the mockup as `.stat` / `.stat-strip`, same rule.

## 3. Non-negotiables (unchanged from the rest of the app — restating because it's easy to drift on a "just styling" task)

1. **Theme tokens only.** Every value in the new CSS references an existing token in `tokens.css`. No literal colors/sizes/fonts. If a needed value doesn't have a token yet (it shouldn't — the mockup only used existing ones), stop and ask rather than hardcoding.
2. **18px+ base text, AA contrast, 44px+ tap targets** — inherited automatically by using the existing token set and existing component classes (`.btn`, `.mk`, `.lbl`, `.num`), so nothing new needs auditing here as long as new markup reuses those classes rather than inventing parallel ones.
3. **No build step.** Plain ES modules, plain CSS. No new dependencies.
4. **`sw.js` must be bumped.** `CACHE_VERSION` increments, and if this work adds no new JS *files* (it shouldn't — this restructures `home.js` and `app.css`, both already in `SHELL`), no `SHELL` array change is needed — but double check against the file list before calling it done, per the standing rule in `dash-current-state.md` §"Operational notes."
5. **Derived data stays derived.** Stat counts are read from `todayGroups(store)` and `store.all()` at render time, same as today — nothing new gets written back to the store or cached.

## 4. Explicitly out of scope for this pass

- Per-device panel reordering or show/hide. Land the fixed two-panel layout first; if she wants panels reorderable/hideable later, that's `localStorage` state the same way `dash.sidebar` and `dash.collapsed` already work — a clean follow-up, not part of this change.
- Any of the shelved corner-cluster widgets (pet, weather, tide, train). Not being un-shelved here. Worth noting only because this grid is a plausible future home for them — `dash-current-state.md` left that as an open question ("If they return, the open question to settle first is where they now live, since Home is the Today panel"). This layout is a reasonable answer to that question when the time comes, but don't build toward it now beyond not actively blocking it.
- Applying this panel treatment to List/Board/Kanban/Project. Home only, for now.

## 5. Definition of done

- Home renders as the two-column layout in `mockups/home-hierarchy-explorations.html` Concept B, using real data instead of the mockup's placeholder rows.
- Capture, Today (overdue/today/upcoming, dismiss, milestone done-tick, all existing behavior), and the neglect register all function exactly as before — this is a re-layout, not a rewrite of their logic. `todayPanel()` and `neglectRegister()` keep their internals; they just get wrapped as panel `render` functions instead of being called in sequence.
- Below 820px, layout stacks to one column, same order as today (capture, stats, Today, neglect register).
- `sw.js` `CACHE_VERSION` bumped.
- Deliver as complete uploadable files (`js/views/home.js`, `css/app.css`, `sw.js`) plus a short plain-English "what changed and how to try it" note — same as every prior handoff.
