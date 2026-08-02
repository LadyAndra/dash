# Changes — August 1, 2026: navigation streamlining

**Ships as `dash-v26`.** Topbar and view layer only. **No data model change:** no new op kind, no new field, no `formatVersion` bump, nothing added to or removed from the synced log. A device still on v25 and a device on v26 read and write exactly the same file.

## What changed

### 1. Kanban and Columns are out of the view switcher

The switcher is now **Home · List · Board · Project**.

Neither view was being used, and both were taking a permanent slot. They are **unregistered, not deleted** — the same treatment the corner-cluster widgets got earlier the same day, for the same reason:

- `js/views/kanban.js` and `js/views/finder.js` are **untouched on disk**.
- Both are **still in the service worker's `SHELL`**. That's deliberate. Caching two files nobody fetches costs nothing on a static site, and it means restoring either one is *one uncommented import in `app.js` plus one entry in `VIEWS`* — with no chance of the classic "forgot to add it to SHELL" deploy that works online and breaks offline.

The imports in `app.js` are commented out with a note saying exactly this, so a future session doesn't have to reconstruct the reasoning.

### 2. Filters and Group are one panel, and only on List and Board

Before: a "☰ Filters" button opened a sidebar of tag/type/status filters, and a separate "Group: ___" dropdown sat in the topbar. Both were present on every view — but neither one did anything on Home or Project.

Now:

- Group moved **into the panel**, under an "Arrange" heading above the filter index. Same `<select>`, same `dash.groupBy` key, same behaviour.
- One button — **"☰ Filters & Group"** — opens both.
- On **Home and Project the button and the panel are absent.** Not greyed out, not empty: gone from the topbar.
- A view opts in by declaring `supportsFilterPanel: true` (list.js, board.js), the same way it already declares `supportsSelect`.

**The filtering logic itself was not touched.** This is placement and visibility.

One detail worth knowing about: "is the panel open?" and "can this view use the panel?" are now two separate things in `app.js`. The open/closed **preference** still lives in `dash.sidebar`, per device, and only a click changes it. Availability is decided per render by the view. So opening the panel on List, wandering over to Home, and coming back leaves it open — Home doesn't quietly reset your preference on the way through.

### 3. A quick status control on List rows and Board cards

The one genuinely useful thing Kanban did was let you change a status without opening the editor. That moved onto the rows themselves rather than leaving with the view.

Next to the type mark there's now a small dropdown showing the entry's status. Choosing a different one changes it immediately.

Underneath it is deliberately boring:

- Options come from **the same status registry** Kanban's columns were derived from. Add a status in Settings and it shows up on every row, with no code change.
- Choosing one calls **the same `store.setField()` the editor calls**. Same op, same sync, same merge behaviour, same undo story.
- It's **opt-in per view** (`{ statusControl: true }`), so Project's connected-item lists stay a quiet read-only index rather than turning into a control panel.
- It **stands down during select mode.** While you're picking entries a tap anywhere on a row means "pick this" — a dropdown that opened instead, or worse quietly changed a status mid-selection, would be exactly the surprise bulk editing must never cause. The read-only mark takes its place, so nothing jumps around.
- Sizing follows `--control-min` (28px on a mouse, 44px on a finger), like every other control since the spacing pass. Styling is tokens only — the status colour comes from the registry inline, exactly as the read-only mark did, so a re-theme and a brand-new status both work with no stylesheet edit.

## How to try it

1. Upload and hard-reload (**Cmd+Shift+R**) — see the deploy note below.
2. The view tabs should read **Home · List · Board · Project**.
3. On **Home**: no "Filters & Group" button in the topbar at all.
4. Switch to **List**: the button appears. Open it — Group sits at the top of the panel, the tag/type/status index below it, both working as before.
5. Leave it open, tap **Home**, tap **List** again: still open.
6. On a List row, use the small dropdown next to the type mark to change a status. The row should update and the item should **not** open.
7. Tap **☑ Select**: the dropdowns turn back into plain marks, and tapping a row picks it.
8. Tap **Project**: no Filters & Group button.

## Verification done before delivery

A headless boot test (jsdom, driving the real `app.js` against a real `Store`) — 27 assertions, all passing:

- the switcher renders exactly `home, list, board, project`;
- the group select exists and is inside the panel, not the topbar;
- the panel button is hidden on Home and Project, shown on List and Board;
- the open/closed preference survives a round trip through a panel-less view;
- the status control's options match the registry, writes go through `setField`, a click on it does **not** open the editor, a click on the row still does, and it disappears in select mode.

It also caught a real bug before delivery: `panelPref` was originally declared below `boot()`, which put it in its temporal dead zone when `buildChrome()` read it — a blank app on load. The declaration now sits with `state`, with a comment saying why it can't move back.

## Deploy note

Upload via GitHub's web uploader **as whole folders, not loose files** (`js/`, `js/views/`, `css/`, plus `sw.js` at the root), then **hard-reload with Cmd+Shift+R** before judging anything. GitHub Pages serves assets with a ten-minute browser cache that sits in front of the service worker, so without the hard reload a correct upload can still look like nothing happened.

Files changed: `js/app.js`, `js/views/shared.js`, `js/views/list.js`, `js/views/board.js`, `css/app.css`, `sw.js`, and this doc + `dash-current-state.md`.

`CACHE_VERSION` is `dash-v26`. **No new JS files**, so `SHELL` needed no additions — only the comment explaining why kanban and finder are still listed.
