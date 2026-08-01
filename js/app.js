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

import { homeView } from "./views/home.js";
import { listView } from "./views/list.js";
import { boardView } from "./views/board.js";
import { kanbanView } from "./views/kanban.js";
import { finderView } from "./views/finder.js";
import { projectView } from "./views/project.js";

const VIEWS = [homeView, listView, boardView, kanbanView, finderView, projectView];

// ---------------- app state ----------------
const state = {
  // Dash always opens on the Home sheet (Update 2). Switching to a catalog
  // view during a session is one tap; the landing is intentionally fixed.
  viewName: "home",
  groupBy: localStorage.getItem("dash.groupBy") || "type",
  sortBy: "modified-desc",
  filter: {},          // { text, type, status, tag }
  collapsed: new Set(JSON.parse(localStorage.getItem("dash.collapsed") || "[]")),
  viewLocal: {},       // scratch space for the active view (e.g. finder selection)
};

const store = new Store();
const sync = new Sync(store);

// Select mode (§ multi-select). One controller for the whole session; every
// change re-renders, so the checkboxes, the count and the action bar can never
// drift out of step with each other.
const selection = createSelection(store, () => render());

installGlobalErrorBanner();
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

  if (sync.dirHandle) loadThemeFromFolder(sync.dirHandle);
  // gentle first-run guidance
  if (store.all().length === 0 && sync.mode === "folder" && !sync.dirHandle) {
    toast("Tip: connect your Dash folder (top-right) so everything syncs across devices.", "info", 9000);
  }
  render();
  // periodic pull on the Mac so other devices' changes appear
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

  // ---- sidebar ----
  const sidebar = el("aside", { class: "sidebar" });
  sidebar.appendChild(el("div", { class: "brand" }, [el("img", { class: "brand-mark", src: "logo-mark.png", alt: "" }), "Dash"]));

  const nav = el("div", { class: "sidebar-section", id: "nav-filters" });
  sidebar.appendChild(nav);

  const footer = el("div", { class: "sidebar-footer" }, [
    el("button", { class: "btn", text: "⚙ Settings", onclick: () => openSettings(store, sync) }),
    el("button", { class: "btn", text: "🔊 Read this view", onclick: readCurrentView }),
  ]);
  sidebar.appendChild(footer);

  // ---- main ----
  const main = el("main", { class: "main" });

  const viewTabs = el("div", { class: "view-tabs", id: "view-tabs" });
  for (const v of VIEWS) {
    viewTabs.appendChild(el("button", {
      class: "view-tab", "data-view": v.name, text: v.label,
      onclick: () => { setView(v.name); },
    }));
  }

  const groupSel = el("select", { id: "group-sel", "aria-label": "Group by", onchange: (e) => {
    state.groupBy = e.target.value; localStorage.setItem("dash.groupBy", state.groupBy); render();
  }}, [
    el("option", { value: "type", text: "Group: Type" }),
    el("option", { value: "status", text: "Group: Status" }),
    el("option", { value: "tag", text: "Group: Tag" }),
    el("option", { value: "none", text: "Group: None" }),
  ]);

  const search = el("input", { type: "search", placeholder: "Search everything…", "aria-label": "Search",
    oninput: (e) => { state.filter.text = e.target.value.trim() || undefined; render(); } });

  const newBtn = el("button", { class: "btn btn-primary", text: "＋ New", onclick: () => openEditor(store, null, { onClose: render, sync }) });

  // The Select/Organise toggle. A plain visible button on purpose — not a
  // long-press — so the mode is discoverable and can't be entered by accident.
  // render() shows or hides it depending on whether the current view supports
  // selecting, and keeps its label in sync with the count.
  const selectBtn = el("button", { class: "btn", id: "select-btn", onclick: () => selection.toggleMode() });

  const syncBtn = el("button", { class: "btn", id: "sync-btn", onclick: onSyncButton });
  const syncPill = el("div", { class: "sync-pill", id: "sync-pill" }, [el("span", { class: "dot" }), el("span", { id: "sync-label", text: "" })]);

  const topbar = el("div", { class: "topbar" }, [
    viewTabs, groupSel,
    el("div", { class: "search-wrap" }, [search]),
    selectBtn, newBtn, syncBtn, syncPill,
  ]);

  const viewport = el("div", { class: "viewport", id: "viewport", "aria-live": "polite" });

  // Where the bulk-action bar lives when select mode is on. Kept outside the
  // scrolling viewport so it stays put under your thumb while you scroll.
  const selectBarHost = el("div", { id: "select-bar-host" });

  main.append(topbar, viewport, selectBarHost);
  app.append(sidebar, main);

  sync.onStatus(updateSyncUI);
  updateSyncUI(sync.status);
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

  // view tabs current state
  document.querySelectorAll(".view-tab").forEach(t =>
    t.setAttribute("aria-current", String(t.dataset.view === view.name)));

  // group selector: some views force their own grouping
  const groupSel = document.getElementById("group-sel");
  if (groupSel) {
    const forced = view.forceGroupBy;
    groupSel.disabled = !!forced || view.ownFilter;
    if (!forced && !view.ownFilter) groupSel.value = state.groupBy;
  }

  // build sidebar filters (tags + types + statuses as quick filters)
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
  const groupBy = view.forceGroupBy || state.groupBy;
  const result = query(store, { filter: state.filter, groupBy, sortBy: state.sortBy });
  if (result.total === 0) { readAloud("This view is empty."); return; }
  const titles = [];
  for (const g of result.groups) {
    for (const it of g.items) titles.push(it.title || "Untitled");
  }
  readAloud(`${result.total} items. ` + titles.slice(0, 40).join(". "));
}
