// app.js — the entry point. Wires the Store + Sync + views + chrome.
// Kept explicit and boring on purpose (§13.1): a future AI session should be
// able to follow the whole control flow from here.

import { Store } from "./store.js";
import { Sync, supportsFolder } from "./sync.js";
import { query } from "./query.js";
import { loadSavedTheme, loadThemeFromFolder } from "./theme.js";
import { installGlobalErrorBanner, toast } from "./ui/toast.js";
import { readAloud } from "./ui/readaloud.js";
import { el } from "./views/shared.js";
import { openEditor } from "./editor.js";
import { openSettings } from "./settings.js";
import { createSelection } from "./selection.js";
import { openMergeNotes, mergeNoteCount } from "./merge-notes.js";
import { overdueCount } from "./entries.js";

// ---- the Home corner cluster is SHELVED (August 1, 2026) ----------------
// Andra's call: the ambient widgets were getting in the way and weren't
// earning their space, and Home is now the Today panel instead. Nothing was
// deleted — js/widgets/{motion,cluster,shapes,pet}.js are untouched on disk
// and still in the service worker's SHELL, so bringing the pet back is
// exactly this: uncomment the two imports and the two lines marked
// "cluster" below. Weather / tide / train were never built and are back to
// unscoped. See docs/dash-current-state.md.
// import { createCluster } from "./widgets/cluster.js";
// import { createPetWidget } from "./widgets/pet.js";

import { homeView, speakToday } from "./views/home.js";
import { listView } from "./views/list.js";
import { boardView } from "./views/board.js";
import { projectView } from "./views/project.js";

// ---- Kanban and Columns are UNREGISTERED (August 1, 2026) ---------------
// Andra doesn't use either one, so they've come out of the view switcher.
// Exactly the same treatment as the corner cluster above, for exactly the
// same reason: NOTHING WAS DELETED. js/views/kanban.js and js/views/finder.js
// are untouched on disk and still in the service worker's SHELL, so bringing
// either back is this and only this — uncomment its import and put it back in
// VIEWS — with no risk of the classic "forgot to add it to SHELL" broken
// deploy.
//
// The one thing Kanban did that nothing else could — change an entry's status
// without opening the editor — did NOT go away with it. It moved onto the
// rows and cards themselves; see statusControl() in js/views/shared.js.
// import { kanbanView } from "./views/kanban.js";
// import { finderView } from "./views/finder.js";

const VIEWS = [homeView, listView, boardView, projectView];

// ---------------- app state ----------------
const state = {
  // Dash always opens on the Home sheet (Update 2). Switching to a catalog
  // view during a session is one tap; the landing is intentionally fixed.
  viewName: "home",
  groupBy: localStorage.getItem("dash.groupBy") || "type",
  sortBy: "modified-desc",
  filter: {},          // { text, type, status, tag }
  collapsed: new Set(JSON.parse(localStorage.getItem("dash.collapsed") || "[]")),
  viewLocal: {},       // scratch space for the active view (e.g. project selection)
};

// Whether the user likes the filters + group panel open. Per device, and only
// a click changes it — separate from whether the CURRENT VIEW can use the panel
// at all. See applyPanelChrome() below for why those are two different things.
// Declared here rather than next to that function because boot() runs first.
let panelPref = localStorage.getItem("dash.sidebar") === "1";

const store = new Store();
const sync = new Sync(store);

// Select mode (§ multi-select). One controller for the whole session; every
// change re-renders, so the checkboxes, the count and the action bar can never
// drift out of step with each other.
const selection = createSelection(store, () => render());

// ---- cluster (shelved — see the note by the imports above) ----
// const cluster = createCluster({ widgets: [createPetWidget({ store })] });
// store.onAction((kind, detail) => cluster.action(kind, detail));

installGlobalErrorBanner();

// TEMPORARY: focus diagnostic for the capture-box bug. Off unless the URL says
// ?focusdebug=1, dynamically imported so a normal boot never loads it (and so
// it doesn't need to be in the service worker's SHELL). Delete this block and
// js/focus-debug.js once the bug is closed.
try {
  if (new URLSearchParams(location.search).has("focusdebug")) {
    import("./focus-debug.js").then((m) => m.start()).catch(() => {});
  }
} catch { /* diagnostics must never break boot */ }
loadSavedTheme();

// re-render whenever the store changes, and flush to disk (debounced)
//
// The render is COALESCED to one per animation frame. Why: every store edit
// emits a change, and a bulk action (tag 30 entries at once) emits dozens in a
// tight loop. Redrawing the whole screen dozens of times in a row would lock
// the app up for a second or two and feel broken. Waiting for the next frame
// collapses that burst into a single redraw, and for a single edit it's
// imperceptible. Views that need an immediate redraw still call ctx.rerender().
let flushTimer = null;
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
store.subscribe(() => {
  scheduleRender();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => sync.flush(), 600);
});

// ---------------- boot ----------------
(async function boot() {
  buildChrome();
  await sync.init();

  // The "sketch" type shipped after some registries were already created and
  // synced (§2.2: types are data, not code) — add it in-app, the same way
  // any type gets added, so existing devices pick it up as a normal registry
  // op rather than needing a one-time migration script.
  if (!store.typeDef("sketch")) {
    store.addType({ key: "sketch", label: "Sketch", icon: "✎", color: "plum" });
  }

  // If another device is already running a newer format than this one, say so
  // once, in plain English. Nothing is lost either way (logs are append-only
  // and unknown ops are ignored-and-preserved) — but it explains why a new
  // kind of information might not be showing up here yet.
  if (store.formatNotice) toast(store.formatNotice, "info", 12000);

  if (sync.dirHandle) loadThemeFromFolder(sync.dirHandle);
  // gentle first-run guidance
  if (store.all().length === 0 && sync.mode === "folder" && !sync.dirHandle) {
    toast("Tip: connect your Dash folder (top-right) so everything syncs across devices.", "info", 9000);
  }
  render();
  watchDayRollover();
  // periodic pull so other devices' changes appear automatically
  if (sync.mode === "dropbox") setInterval(() => sync.pull(), 10000);
  else if (sync.mode === "folder") setInterval(() => sync.dirHandle && sync.pull(), 8000);
})();

// ===================================================
//  CHROME (sidebar + topbar) — built once, updated in render()
// ===================================================
function buildChrome() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  // ---- the FILTERS + GROUP panel (the sidebar) ----
  // Closed by default since August 1, 2026: it was mostly taking width, and
  // Settings / Read-aloud moved to the topbar so it's never *required* for
  // anything. Open/closed is remembered per device (UI arrangement stays
  // local — see dash.sidebar).
  //
  // Later the same day, Group moved IN HERE from the topbar. Filters and Group
  // only ever did anything on List and Board, so a global topbar copy of each
  // was two permanent controls that did nothing on two of the four views. Now
  // they're one panel behind one button, and render() puts that button on
  // screen only where it can do something. The filtering logic underneath is
  // completely unchanged — this is placement, not a rebuild.
  const sidebar = el("aside", { class: "sidebar", id: "sidebar" });
  sidebar.appendChild(el("div", { class: "brand" }, [el("img", { class: "brand-mark", src: "logo-mark.png", alt: "" }), "Dash"]));

  const arrange = el("div", { class: "sidebar-section", id: "nav-arrange" });
  arrange.appendChild(el("h2", { text: "Arrange" }));
  sidebar.appendChild(arrange);

  const nav = el("div", { class: "sidebar-section", id: "nav-filters" });
  sidebar.appendChild(nav);

  // ---- main ----
  const main = el("main", { class: "main" });

  const viewTabs = el("div", { class: "view-tabs", id: "view-tabs" });
  for (const v of VIEWS) {
    const tab = el("button", {
      class: "view-tab", "data-view": v.name,
      onclick: () => { setView(v.name); },
    }, [el("span", { text: v.label })]);
    if (v.name === "home") tab.appendChild(el("span", { class: "tab-badge", id: "home-badge" }));
    viewTabs.appendChild(tab);
  }

  // Group lives inside the panel now, not in the topbar. Same control, same
  // dash.groupBy key, same behaviour — it just isn't on screen on Home and
  // Project any more, where it never did anything.
  const groupSel = el("select", { id: "group-sel", "aria-label": "Group by", onchange: (e) => {
    state.groupBy = e.target.value; localStorage.setItem("dash.groupBy", state.groupBy); render();
  }}, [
    el("option", { value: "type", text: "Group: Type" }),
    el("option", { value: "status", text: "Group: Status" }),
    el("option", { value: "tag", text: "Group: Tag" }),
    el("option", { value: "none", text: "Group: None" }),
  ]);
  arrange.appendChild(groupSel);

  const search = el("input", { type: "search", placeholder: "Search everything…", "aria-label": "Search",
    oninput: (e) => { state.filter.text = e.target.value.trim() || undefined; render(); } });

  const newBtn = el("button", { class: "btn btn-primary", text: "＋ New", onclick: () => openEditor(store, null, { onClose: render, sync }) });

  // The Select/Organise toggle. A plain visible button on purpose — not a
  // long-press — so the mode is discoverable and can't be entered by accident.
  // render() shows or hides it depending on whether the current view supports
  // selecting, and keeps its label in sync with the count.
  const selectBtn = el("button", { class: "btn", id: "select-btn", onclick: () => selection.toggleMode() });

  // Merge notes: only ever visible when there's actually something to say.
  // A collision means an edit you made on one device was replaced by a later
  // edit from another; the losing value is kept and can be put back (§6.1).
  const mergeBtn = el("button", {
    class: "btn", id: "merge-btn", style: "display:none",
    onclick: () => openMergeNotes(store, render),
  });

  const syncBtn = el("button", { class: "btn", id: "sync-btn", onclick: onSyncButton });
  const syncPill = el("div", { class: "sync-pill", id: "sync-pill" }, [el("span", { class: "dot" }), el("span", { id: "sync-label", text: "" })]);

  // The only way in and out of the panel. render() hides this button entirely
  // on views the panel doesn't apply to.
  const filtersBtn = el("button", {
    class: "btn", id: "filters-btn", "aria-controls": "sidebar",
    onclick: () => setSidebar(!panelPref),
  });

  // Settings and Read-aloud used to live at the bottom of the sidebar. With
  // the sidebar closed by default they'd have been unreachable, so they're
  // first-class topbar buttons now.
  const settingsBtn = el("button", {
    class: "btn", text: "⚙ Settings", "aria-label": "Settings",
    onclick: () => openSettings(store, sync),
  });
  const readBtn = el("button", {
    class: "btn", text: "🔊 Read", "aria-label": "Read this view aloud",
    onclick: readCurrentView,
  });

  const topbar = el("div", { class: "topbar" }, [
    filtersBtn, viewTabs,
    el("div", { class: "search-wrap" }, [search]),
    selectBtn, newBtn, mergeBtn, readBtn, settingsBtn, syncBtn, syncPill,
  ]);

  const viewport = el("div", { class: "viewport", id: "viewport", "aria-live": "polite" });

  // Where the bulk-action bar lives when select mode is on. Kept outside the
  // scrolling viewport so it stays put under your thumb while you scroll.
  const selectBarHost = el("div", { id: "select-bar-host" });

  main.append(topbar, viewport, selectBarHost);
  app.append(sidebar, main);

  sync.onStatus(updateSyncUI);
  updateSyncUI(sync.status);
  applyPanelChrome(activeView());   // closed unless asked for; absent where it doesn't apply
}

// ---- the filters + group panel: open/closed, and whether it exists at all ----
// Two ideas that used to be one, deliberately pulled apart (August 1, 2026):
//
//   PREFERENCE  — "I like this panel open." Per device, remembered in
//                 dash.sidebar exactly as before. Only a click changes it.
//   AVAILABILITY — "this view can use the panel at all." Decided by the view
//                 itself (list and board declare supportsFilterPanel).
//
// On Home and Project the panel and its button are ABSENT — not disabled, not
// empty — and the preference is left untouched, so the panel is still open the
// way you left it when you come back to List.
//
// panelPref itself is declared up with `state`, NOT here: buildChrome() reads
// it, boot() calls buildChrome() near the top of this file, and a `let` down
// here would still be in its temporal dead zone at that point — a blank app
// and a ReferenceError in the console. Declaration order is load-bearing.
function setSidebar(open) {
  panelPref = !!open;
  localStorage.setItem("dash.sidebar", panelPref ? "1" : "0");
  applyPanelChrome(activeView());
}

function applyPanelChrome(view) {
  const app = document.getElementById("app");
  const btn = document.getElementById("filters-btn");
  if (!app || !btn) return;
  const available = !!view.supportsFilterPanel;
  const open = available && panelPref;
  app.classList.toggle("with-sidebar", open);
  btn.style.display = available ? "" : "none";
  btn.textContent = open ? "✕ Filters & Group" : "☰ Filters & Group";
  btn.setAttribute("aria-expanded", String(open));
}

// ===================================================
//  RENDER
// ===================================================
function activeView() { return VIEWS.find(v => v.name === state.viewName) || listView; }

function setView(name) {
  state.viewName = name;
  state.viewLocal = {};
  // Changing view drops any selection: the entries you'd picked probably
  // aren't even on screen any more, and acting on invisible items is exactly
  // the kind of surprise bulk editing must never cause.
  if (selection.active) selection.exit();
  localStorage.setItem("dash.view", name);
  render();
}

function render() {
  const view = activeView();

  // Select mode only exists on views that list items. If we've landed on one
  // that doesn't (Home), leave the mode rather than stranding the user in an
  // invisible state. exit() re-renders, so bail out and let that pass finish.
  if (selection.active && !view.supportsSelect) { selection.exit(); return; }
  updateSelectUI(view);
  updateMergeUI();

  // The corner cluster belongs to the Home sheet. Hiding it elsewhere keeps it
  // off the catalog views' bottom-right corner, where the bulk-action bar and
  // the kanban columns already live — and pauses its animation, so nothing is
  // burning a frame budget behind a screen that can't see it.
  // (cluster.setVisible(view.name === "home") lived here — shelved.)

  // view tabs current state
  document.querySelectorAll(".view-tab").forEach(t =>
    t.setAttribute("aria-current", String(t.dataset.view === view.name)));

  // The overdue count on the Home tab. Home IS the Today panel now, so the
  // badge is both the signal ("something's late") and the way there — one
  // number, shown only when it's not zero, in the indicator colour. This is
  // what replaces the idea of a persistent dates rail: the same nudge from
  // any view, and it works identically on a phone.
  updateHomeBadge();

  // The filters + group panel, and its topbar button: on screen only for the
  // views that can actually use them (List and Board).
  applyPanelChrome(view);
  const groupSel = document.getElementById("group-sel");
  if (groupSel) groupSel.value = state.groupBy;

  // build the panel's filter index (tags + types + statuses as quick filters)
  renderSidebarFilters();

  const groupBy = view.forceGroupBy || (view.ownFilter ? "none" : (view.defaultGroupBy && !localStorage.getItem("dash.groupBy") ? view.defaultGroupBy : state.groupBy));
  const result = query(store, { filter: state.filter, groupBy, sortBy: state.sortBy });

  const viewport = document.getElementById("viewport");
  const ctx = {
    store,
    // ONE click path per item: while select mode is on, tapping an entry picks
    // it instead of opening it. Deciding that here — rather than in each view —
    // means every view behaves identically and none of them need to know the
    // rule. Views only use `selection` to draw the checkbox.
    onOpen: (id) => {
      if (selection.active) { selection.toggle(id); return; }
      openEditor(store, id, { onClose: render, sync });
    },
    onNew: () => openEditor(store, null, { onClose: render, sync }),
    selection,
    isCollapsed: (k) => state.collapsed.has(k),
    toggleCollapse: (k) => {
      state.collapsed.has(k) ? state.collapsed.delete(k) : state.collapsed.add(k);
      localStorage.setItem("dash.collapsed", JSON.stringify([...state.collapsed]));
      render();
    },
    viewLocal: state.viewLocal,
    rerender: render,
    sync,
  };
  view.render(result, ctx, viewport);
}

// Keep the Select button and the bulk-action bar in step with the current view
// and the current count. Called at the top of every render().
function updateSelectUI(view) {
  const btn = document.getElementById("select-btn");
  const host = document.getElementById("select-bar-host");
  if (!btn || !host) return;

  // Home has no item list to select from, so the button simply isn't there.
  btn.style.display = view.supportsSelect ? "" : "none";
  btn.textContent = selection.active
    ? (selection.count ? `Done (${selection.count})` : "Done")
    : "☑ Select";
  btn.setAttribute("aria-pressed", String(selection.active));
  btn.className = selection.active ? "btn btn-primary" : "btn";

  selection.renderBar(host);
}

// The overdue count on the Home tab. Shown only when it isn't zero, so it
// costs nothing on a clear week.
function updateHomeBadge() {
  const badge = document.getElementById("home-badge");
  if (!badge) return;
  const n = overdueCount(store);
  badge.textContent = n ? String(n) : "";
  badge.style.display = n ? "" : "none";
  badge.setAttribute("aria-label", n ? `${n} overdue` : "");
}

// "Today" changes at midnight while the app may well still be open, and every
// date grouping on the Home sheet is computed against it. Rather than trusting
// a long-lived constant, re-render when the app comes back to the foreground
// and on a lazy once-a-minute check that only fires when the date has actually
// rolled over (addendum §12). A no-op minute costs one string comparison and
// redraws nothing.
function watchDayRollover() {
  let known = new Date().toDateString();
  const check = () => {
    const now = new Date().toDateString();
    if (now !== known) { known = now; render(); }
  };
  setInterval(check, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.addEventListener("focus", check);
}

// The merge-notes button is hidden unless there is genuinely something that
// got overwritten. One number, no layout pressure when there's nothing to say.
function updateMergeUI() {
  const btn = document.getElementById("merge-btn");
  if (!btn) return;
  const n = mergeNoteCount(store);
  btn.style.display = n ? "" : "none";
  btn.textContent = `⚠ Merge notes (${n})`;
  btn.title = "An edit made on one device was replaced by a later edit from another. Nothing was lost.";
}

// Applying a sidebar filter always lands you in the catalog: filtering makes
// no sense on the Home sheet, so a filter click there switches to the list.
function applyFilter(next) {
  state.filter = next;
  if (state.viewName === "home") { state.viewName = "list"; localStorage.setItem("dash.view", "list"); }
  render();
}

function renderSidebarFilters() {
  const nav = document.getElementById("nav-filters");
  if (!nav) return;
  nav.innerHTML = "";

  const mk = (label, active, onClick, count) => el("button", {
    class: "nav-btn", "aria-current": String(active), onclick: onClick,
  }, [el("span", { text: label }), count != null ? el("span", { class: "count", text: `${count}` }) : null]);

  nav.appendChild(el("h2", { text: "All" }));
  nav.appendChild(mk("Everything", !state.filter.type && !state.filter.status && !state.filter.tag,
    () => applyFilter({ text: state.filter.text }), store.all().length));

  // types
  nav.appendChild(el("h2", { text: "Types" }));
  for (const t of store.types()) {
    const count = store.all().filter(i => i.type === t.key).length;
    if (count === 0) continue;
    nav.appendChild(mk(`${t.icon || "•"} ${t.label}`, state.filter.type === t.key,
      () => applyFilter({ text: state.filter.text, type: t.key }), count));
  }

  // statuses
  nav.appendChild(el("h2", { text: "Status" }));
  for (const s of store.statuses()) {
    const count = store.all().filter(i => i.status === s.key).length;
    if (count === 0) continue;
    nav.appendChild(mk(s.label, state.filter.status === s.key,
      () => applyFilter({ text: state.filter.text, status: s.key }), count));
  }

  // top tags (cap to keep sidebar calm)
  const tags = store.allTags();
  if (tags.length) {
    nav.appendChild(el("h2", { text: "Tags" }));
    for (const tag of tags.slice(0, 20)) {
      const count = store.all().filter(i => i.tags.includes(tag)).length;
      nav.appendChild(mk(`#${tag}`, state.filter.tag === tag,
        () => applyFilter({ text: state.filter.text, tag }), count));
    }
  }
}

// ===================================================
//  SYNC UI
// ===================================================
function onSyncButton() {
  if (sync.mode === "dropbox") {
    sync.pull().then(() => sync.flush());
    toast("Syncing with Dropbox…", "info", 2500);
  } else if (sync.mode === "folder") {
    if (!sync.dirHandle) sync.connectFolder();
    else { sync.pull().then(() => sync.flush()); toast("Synced with your Dash folder.", "success"); }
  } else {
    openPortableSync();
  }
}

function updateSyncUI() {
  const btn = document.getElementById("sync-btn");
  const pill = document.getElementById("sync-pill");
  const label = document.getElementById("sync-label");
  if (!btn || !pill || !label) return;

  if (sync.mode === "dropbox") {
    btn.textContent = "⟳ Sync now";
  } else if (sync.mode === "folder") {
    btn.textContent = sync.dirHandle ? "⟳ Sync now" : "Connect Dash folder";
  } else {
    btn.textContent = "⇅ Sync (export / import)";
  }

  const map = {
    ok: ["ok", sync.mode === "dropbox" ? "Synced via Dropbox" : "Up to date"],
    dirty: ["dirty", "Unsynced changes"],
    "needs-folder": ["", "Not connected"],
    auth: ["", "Dropbox: reconnect needed"],
    error: ["", "Sync problem"],
    idle: ["", ""],
  };
  const [cls, text] = map[sync.status] || ["", ""];
  pill.className = "sync-pill " + cls;
  label.textContent = text;
}

// portable (iPhone/iPad) sync sheet
function openPortableSync() {
  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
  const fileInput = el("input", { type: "file", accept: "application/json", style: "display:none",
    onchange: (e) => { if (e.target.files[0]) { sync.importSyncFile(e.target.files[0]).then(() => { render(); scrim.remove(); }); } } });

  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Sync" }, [
    el("h2", { text: "Sync this device" }),
    el("p", { class: "hint", text: "On iPhone and iPad, syncing is two taps. Export a file into your Dash folder; on your Mac it merges automatically. To pull in changes made elsewhere, Import the latest file." }),
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-primary", text: "Export my changes", onclick: () => { sync.exportForSync().then(() => sync.markSynced()); } }),
      el("button", { class: "btn", text: "Import a sync file", onclick: () => fileInput.click() }),
      el("div", { class: "spacer" }),
      el("button", { class: "btn", text: "Close", onclick: () => scrim.remove() }),
    ]),
    fileInput,
  ]);
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
}

// ===================================================
//  READ-ALOUD the current view (voice out §10)
// ===================================================
function readCurrentView() {
  const view = activeView();

  // On Home, "read this view" means read the day: what's late, what's today,
  // what's coming. That's the daily brief made audible (proposal §10), and it
  // serves the eye-strain constraint directly — you can hear where you stand
  // without reading anything.
  if (view.name === "home") { readAloud(speakToday(store)); return; }

  const groupBy = view.forceGroupBy || state.groupBy;
  const result = query(store, { filter: state.filter, groupBy, sortBy: state.sortBy });
  if (result.total === 0) { readAloud("This view is empty."); return; }
  const titles = [];
  for (const g of result.groups) {
    for (const it of g.items) titles.push(it.title || "Untitled");
  }
  readAloud(`${result.total} items. ` + titles.slice(0, 40).join(". "));
}
