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
    const projects = store.projects(); // only items of type "project"

    if (projects.length === 0) {
      container.appendChild(emptyState(
        "No projects yet",
        "Create your first project, then assign entries — tasks, notes, files — to it. An entry can belong to more than one project.",
        "＋ New project", () => createProject(store, ctx)));
      return;
    }

    if (!state.projectId || !store.get(state.projectId)) {
      container.appendChild(renderPicker(store, state, ctx));
      return;
    }

    container.appendChild(renderDetail(store, state, ctx));
  },
};

function createProject(store, ctx) {
  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
  const nameInput = el("input", { type: "text", placeholder: "Project name", "aria-label": "New project name" });
  const go = () => {
    const title = nameInput.value.trim();
    if (!title) { nameInput.focus(); return; }
    const pid = store.createItem({ title, type: "project" });
    scrim.remove();
    ctx.viewLocal.projectId = pid; // jump straight into the new project
    ctx.rerender();
  };
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "New project" }, [
    el("h2", { text: "New project" }),
    el("div", { class: "field" }, [el("label", { text: "Name" }), nameInput]),
    el("div", { class: "modal-actions" }, [
      el("div", { class: "spacer" }),
      el("button", { class: "btn", text: "Cancel", onclick: () => scrim.remove() }),
      el("button", { class: "btn btn-primary", text: "Create", onclick: go }),
    ]),
  ]);
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  nameInput.focus();
}

function renderPicker(store, state, ctx) {
  const wrap = el("div", {});
  const head = el("div", { style: "display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-3)" }, [
    el("h2", { text: "Projects", style: "font-family:var(--font-ui); font-size:var(--text-lg); margin:0; flex:1" }),
    el("button", { class: "btn btn-primary", text: "＋ New project", onclick: () => createProject(store, ctx) }),
  ]);
  wrap.appendChild(head);
  const search = el("input", { type: "search", placeholder: "Search projects…", "aria-label": "Search projects",
    style: "width:100%; max-width:28rem; margin-bottom:var(--space-3)" });
  const list = el("div", {});

  function draw() {
    list.innerHTML = "";
    const q = search.value.toLowerCase();
    const items = store.projects()
      .filter(i => (i.title || "").toLowerCase().includes(q));
    for (const it of items) {
      const count = membersOf(store, it.id).length;
      list.appendChild(el("div", {
        class: "item-row", role: "button", tabindex: "0",
        onclick: () => { state.projectId = it.id; ctx.rerender(); },
      }, [
        el("div", { class: "item-swatch", style: "background:var(--color-green)" }),
        el("div", { class: "item-main" }, [
          el("h3", { class: "item-title", text: it.title || "Untitled project" }),
          el("div", { class: "item-meta" }, [
            el("span", { class: "chip", text: `${count} ${count === 1 ? "entry" : "entries"}` }),
            store.statusChip ? null : null,
          ]),
        ]),
      ]));
    }
    if (items.length === 0) list.appendChild(el("p", { class: "item-body-preview", text: "No matching projects." }));
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

  const linked = membersOf(store, project.id);

  const addBar = el("div", { style: "display:flex; gap:var(--space-2); margin-bottom:var(--space-4); flex-wrap:wrap" }, [
    el("button", { class: "btn btn-primary", text: "＋ New entry in this project", onclick: () => {
      const newId = store.createItem({ title: "" });
      store.assignToProject(newId, project.id);
      openEditor(store, newId, { onClose: ctx.rerender, sync: ctx.sync });
    } }),
    el("button", { class: "btn", text: "＋ Add existing entry", onclick: () => openAssignPicker(store, project.id, ctx.rerender) }),
  ]);
  wrap.appendChild(addBar);

  if (linked.length === 0) {
    wrap.appendChild(emptyState(
      "Nothing in this project yet",
      "Add a task, note, or file — this page gathers everything assigned to this project automatically.",
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

// Entries that are members of this project — i.e. they link to it with the
// project-membership relationship. (A plain "see also" connection does NOT
// make something a project member; membership is explicit.) The project
// itself is never a member of itself.
function membersOf(store, projectId) {
  const out = [];
  for (const it of store.all()) {
    if (it.id === projectId) continue;
    if (it.links.some(l => l.target === projectId && l.label === "in project")) out.push(it);
  }
  return out;
}

function openAssignPicker(store, projectId, onDone) {
  // Only non-project entries that aren't already members.
  const members = new Set(membersOf(store, projectId).map(i => i.id));
  const candidates = store.all().filter(i => i.id !== projectId && i.type !== "project" && !members.has(i.id));
  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
  const search = el("input", { type: "text", placeholder: "Search entries…", "aria-label": "Search entries to add" });
  const list = el("div", {});
  function draw() {
    list.innerHTML = "";
    const q = search.value.toLowerCase();
    const matches = candidates.filter(i => (i.title || "").toLowerCase().includes(q)).slice(0, 40);
    for (const it of matches) {
      list.appendChild(el("div", {
        class: "finder-entry",
        onclick: () => { store.assignToProject(it.id, projectId); scrim.remove(); onDone(); },
      }, [it.title || "Untitled"]));
    }
    if (matches.length === 0) list.appendChild(el("p", { class: "item-body-preview", text: "No entries to add." }));
  }
  search.addEventListener("input", draw);
  draw();
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Add entry to project" }, [
    el("h2", { text: "Add an existing entry" }),
    search, list,
    el("div", { class: "modal-actions" }, [el("div", { class: "spacer" }), el("button", { class: "btn", text: "Close", onclick: () => scrim.remove() })]),
  ]);
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  search.focus();
}
