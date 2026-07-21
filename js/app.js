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

import { listView } from "./views/list.js";
import { boardView } from "./views/board.js";
import { kanbanView } from "./views/kanban.js";
import { finderView } from "./views/finder.js";
import { projectView } from "./views/project.js";

const VIEWS = [listView, boardView, kanbanView, finderView, projectView];

// ---------------- app state ----------------
const state = {
  viewName: localStorage.getItem("dash.view") || "list",
  groupBy: localStorage.getItem("dash.groupBy") || "type",
  sortBy: "modified-desc",
  filter: {},          // { text, type, status, tag }
  collapsed: new Set(JSON.parse(localStorage.getItem("dash.collapsed") || "[]")),
  viewLocal: {},       // scratch space for the active view (e.g. finder selection)
};

const store = new Store();
const sync = new Sync(store);

installGlobalErrorBanner();
loadSavedTheme();

// re-render whenever the store changes, and flush to disk (debounced)
let flushTimer = null;
store.subscribe(() => {
  render();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => sync.flush(), 600);
});

// ---------------- boot ----------------
(async function boot() {
  buildChrome();
  await sync.init();
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
  sidebar.appendChild(el("div", { class: "brand" }, [el("span", { class: "dot" }), "Dash"]));

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

  const syncBtn = el("button", { class: "btn", id: "sync-btn", onclick: onSyncButton });
  const syncPill = el("div", { class: "sync-pill", id: "sync-pill" }, [el("span", { class: "dot" }), el("span", { id: "sync-label", text: "" })]);

  const topbar = el("div", { class: "topbar" }, [
    viewTabs, groupSel,
    el("div", { class: "search-wrap" }, [search]),
    newBtn, syncBtn, syncPill,
  ]);

  const viewport = el("div", { class: "viewport", id: "viewport", "aria-live": "polite" });

  main.append(topbar, viewport);
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
  localStorage.setItem("dash.view", name);
  render();
}

function render() {
  const view = activeView();

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
    onOpen: (id) => openEditor(store, id, { onClose: render, sync }),
    onNew: () => openEditor(store, null, { onClose: render, sync }),
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

function renderSidebarFilters() {
  const nav = document.getElementById("nav-filters");
  if (!nav) return;
  nav.innerHTML = "";

  const mk = (label, active, onClick, count) => el("button", {
    class: "nav-btn", "aria-current": String(active), onclick: onClick,
  }, [el("span", { text: label }), count != null ? el("span", { class: "count", text: `${count}` }) : null]);

  nav.appendChild(el("h2", { text: "All" }));
  nav.appendChild(mk("Everything", !state.filter.type && !state.filter.status && !state.filter.tag,
    () => { state.filter = { text: state.filter.text }; render(); }, store.all().length));

  // types
  nav.appendChild(el("h2", { text: "Types" }));
  for (const t of store.types()) {
    const count = store.all().filter(i => i.type === t.key).length;
    if (count === 0) continue;
    nav.appendChild(mk(`${t.icon || "•"} ${t.label}`, state.filter.type === t.key,
      () => { state.filter = { text: state.filter.text, type: t.key }; render(); }, count));
  }

  // statuses
  nav.appendChild(el("h2", { text: "Status" }));
  for (const s of store.statuses()) {
    const count = store.all().filter(i => i.status === s.key).length;
    if (count === 0) continue;
    nav.appendChild(mk(s.label, state.filter.status === s.key,
      () => { state.filter = { text: state.filter.text, status: s.key }; render(); }, count));
  }

  // top tags (cap to keep sidebar calm)
  const tags = store.allTags();
  if (tags.length) {
    nav.appendChild(el("h2", { text: "Tags" }));
    for (const tag of tags.slice(0, 20)) {
      const count = store.all().filter(i => i.tags.includes(tag)).length;
      nav.appendChild(mk(`#${tag}`, state.filter.tag === tag,
        () => { state.filter = { text: state.filter.text, tag }; render(); }, count));
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
