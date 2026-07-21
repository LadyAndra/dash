// project.js — the "project home base" view.
// ===================================================================
// This is a picker + detail page, not a query/groupBy view like the others
// (§4.1 still applies underneath: it reads the same store, adds nothing
// new to the data model). Picking a project shows every item connected to
// it — either direction of a link — grouped by type, so tasks/notes/files
// all surface together without needing folders (§0's core requirement).
// "Add existing" and "quick create" both just create/edit a `links` entry.

import { el, itemRow, emptyState, typeChip } from "./shared.js";
import { openEditor } from "../editor.js";

export const projectView = {
  name: "project",
  label: "Project",
  ownFilter: true,

  render(result, ctx, container) {
    container.innerHTML = "";
    const store = ctx.store;
    const state = ctx.viewLocal;
    const projectLike = store.all(); // any item can be a "project home" — no special type required

    if (projectLike.length === 0) {
      container.appendChild(emptyState(
        "No projects yet",
        "Create an item — a project, a goal, anything — then open it here to gather its tasks, notes, and files in one place.",
        "New item", ctx.onNew));
      return;
    }

    if (!state.projectId || !store.get(state.projectId)) {
      container.appendChild(renderPicker(store, state, ctx));
      return;
    }

    container.appendChild(renderDetail(store, state, ctx));
  },
};

function renderPicker(store, state, ctx) {
  const wrap = el("div", {});
  wrap.appendChild(el("h2", { text: "Open a project", style: "font-family:var(--font-ui); font-size:var(--text-lg); margin-bottom:var(--space-3)" }));
  const search = el("input", { type: "search", placeholder: "Search your items…", "aria-label": "Search projects",
    style: "width:100%; max-width:28rem; margin-bottom:var(--space-3)" });
  const list = el("div", {});

  function draw() {
    list.innerHTML = "";
    const q = search.value.toLowerCase();
    const items = store.all()
      .filter(i => (i.title || "").toLowerCase().includes(q))
      .sort((a, b) => (b.dates.modified || "").localeCompare(a.dates.modified || ""))
      .slice(0, 60);
    for (const it of items) {
      const count = linkedItems(store, it.id).length;
      list.appendChild(el("div", {
        class: "item-row", role: "button", tabindex: "0",
        onclick: () => { state.projectId = it.id; ctx.rerender(); },
      }, [
        el("div", { class: "item-swatch", style: "background:var(--accent-1)" }),
        el("div", { class: "item-main" }, [
          el("h3", { class: "item-title", text: it.title || "Untitled" }),
          el("div", { class: "item-meta" }, [
            typeChip(store, it),
            el("span", { class: "chip", text: `${count} connected` }),
          ]),
        ]),
      ]));
    }
    if (items.length === 0) list.appendChild(el("p", { class: "item-body-preview", text: "No matches." }));
  }
  search.addEventListener("input", draw);
  draw();

  wrap.append(search, list);
  return wrap;
}

function renderDetail(store, state, ctx) {
  const project = store.get(state.projectId);
  const wrap = el("div", {});

  const header = el("div", { style: "display:flex; align-items:flex-start; gap:var(--space-3); margin-bottom:var(--space-4)" }, [
    el("button", { class: "btn", text: "← All projects", onclick: () => { state.projectId = null; ctx.rerender(); } }),
    el("div", { style: "flex:1" }, [
      el("h2", { text: project.title || "Untitled", style: "font-family:var(--font-body); font-size:var(--text-xl); margin:0 0 var(--space-1)" }),
      project.body ? el("p", { class: "item-body-preview", text: project.body, style: "-webkit-line-clamp:3" }) : null,
    ]),
    el("button", { class: "btn", text: "Edit", onclick: () => openEditor(store, project.id, { onClose: ctx.rerender, sync: ctx.sync }) }),
  ]);
  wrap.appendChild(header);

  const linked = linkedItems(store, project.id);

  const addBar = el("div", { style: "display:flex; gap:var(--space-2); margin-bottom:var(--space-4)" }, [
    el("button", { class: "btn btn-primary", text: "＋ New linked item", onclick: () => {
      const newId = store.createItem({ title: "" });
      store.addToSet(newId, "links", { target: project.id, label: "part of" });
      openEditor(store, newId, { onClose: ctx.rerender, sync: ctx.sync });
    } }),
    el("button", { class: "btn", text: "＋ Link an existing item", onclick: () => openLinkPicker(store, project.id, ctx.rerender) }),
  ]);
  wrap.appendChild(addBar);

  if (linked.length === 0) {
    wrap.appendChild(emptyState(
      "Nothing linked yet",
      "Add a task, note, or file and link it here — this page will gather everything connected to this project automatically.",
      null, null));
    return wrap;
  }

  // group the linked items by type, so tasks/notes/files each get their own
  // section on this one page (§0: "one system, many views over it")
  const byType = new Map();
  for (const it of linked) {
    const key = it.type;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(it);
  }
  for (const t of store.types()) {
    const items = byType.get(t.key);
    if (!items || items.length === 0) continue;
    wrap.appendChild(el("div", { class: "group-head", style: "cursor:default" }, [
      el("span", { text: `${t.icon || "•"} ${t.label}` }),
      el("span", { class: "group-count", text: `${items.length}` }),
    ]));
    const groupWrap = el("div", { class: "group" });
    for (const it of items) groupWrap.appendChild(itemRow(store, it, ctx.onOpen));
    wrap.appendChild(groupWrap);
  }
  return wrap;
}

// Items connected to `projectId` in EITHER link direction — this item links
// to it, or it links to this item. A project page shouldn't care which way
// the arrow points; either means "this belongs here."
function linkedItems(store, projectId) {
  const project = store.get(projectId);
  if (!project) return [];
  const out = new Map();
  for (const l of project.links) {
    const it = store.get(l.target);
    if (it) out.set(it.id, it);
  }
  for (const it of store.all()) {
    if (it.id === projectId) continue;
    if (it.links.some(l => l.target === projectId)) out.set(it.id, it);
  }
  return [...out.values()];
}

function openLinkPicker(store, projectId, onDone) {
  const others = store.all().filter(i => i.id !== projectId);
  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
  const search = el("input", { type: "text", placeholder: "Search items…", "aria-label": "Search items to link" });
  const list = el("div", {});
  function draw() {
    list.innerHTML = "";
    const q = search.value.toLowerCase();
    for (const it of others.filter(i => (i.title || "").toLowerCase().includes(q)).slice(0, 40)) {
      list.appendChild(el("div", {
        class: "finder-entry",
        onclick: () => {
          store.addToSet(it.id, "links", { target: projectId, label: "part of" });
          scrim.remove(); onDone();
        },
      }, [it.title || "Untitled"]));
    }
  }
  search.addEventListener("input", draw);
  draw();
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Link an item" }, [
    el("h2", { text: "Link an existing item" }),
    search, list,
    el("div", { class: "modal-actions" }, [el("div", { class: "spacer" }), el("button", { class: "btn", text: "Close", onclick: () => scrim.remove() })]),
  ]);
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  search.focus();
}
