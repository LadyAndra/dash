// project.js — the "project home base" view.
// ===================================================================
// This is a picker + detail page, not a query/groupBy view like the others
// (§4.1 still applies underneath: it reads the same store, adds nothing
// new to the data model). Picking a project shows every item connected to
// it — either direction of a link — grouped by type, so tasks/notes/files
// all surface together without needing folders (§0's core requirement).
// "Add existing" and "quick create" both just create/edit a `links` entry.

import { el, emptyState, groundStyle, catalogNo } from "./shared.js";
import { openEditor } from "../editor.js";
import { renderProjectPage } from "./desk.js";
import { stageOf } from "../milestones.js";

export const projectView = {
  name: "project",
  label: "Project",
  ownFilter: true,
  supportsSelect: true, // shows the Select button in the topbar (§ multi-select)

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
  const search = el("input", { type: "search", placeholder: "Search projects…", "aria-label": "Search projects" });
  const bandCount = el("span", { class: "band-count" });
  const band = el("div", { class: "project-picker-band" }, [
    el("div", { class: "band-top" }, [
      el("h2", { class: "band-title", text: "Projects" }),
      bandCount,
      el("button", { class: "band-btn", text: "＋ New project", onclick: () => createProject(store, ctx) }),
    ]),
    el("div", { class: "band-controls" }, [
      el("div", { class: "search-wrap" }, [search]),
    ]),
  ]);
  wrap.appendChild(band);
  const shelf = el("div", { class: "project-shelf" });
  const shelfWrap = el("div", { class: "project-shelf-wrap" }, [shelf]);

  function draw() {
    shelf.innerHTML = "";
    const q = search.value.toLowerCase();
    const items = store.projects()
      .filter(i => (i.title || "").toLowerCase().includes(q));
    bandCount.textContent = items.length === 1 ? "1 project" : `${items.length} projects`;
    for (const it of items) {
      // Width stands for how much is IN the project — an entry-heavy
      // project reads as a fatter spine (css/app.css clamps it, so it
      // never drops below the --tap-min tap target).
      const count = membersOf(store, it.id).length;
      // Where the project is right now — derived, never stored (§3.3).
      const stage = stageOf(it);
      const overdue = !!(stage && stage.overdue);

      const nameParts = [it.title || "Untitled project"];
      if (stage) nameParts.push(stage.complete ? "complete" : stage.label);
      nameParts.push(`${count} ${count === 1 ? "entry" : "entries"}`);
      if (overdue) nameParts.push("overdue");
      const accessibleName = nameParts.join(", ");

      shelf.appendChild(el("button", {
        // The project's OWN colour, via the same groundStyle() the project
        // banner uses — so a picked colour (or a custom hex) is legible here
        // too, not only on the project's own page.
        class: "spine on-ground",
        style: `${groundStyle(store, it)};--n:${count}`,
        "aria-label": accessibleName,
        title: accessibleName,
        onclick: () => { state.projectId = it.id; ctx.rerender(); },
      }, [
        // Sighted only — the accessible name above already says "overdue"
        // for anyone using a screen reader.
        overdue ? el("span", { class: "spine-flag", "aria-hidden": "true" }) : null,
        el("span", { class: "spine-title", "aria-hidden": "true", text: it.title || "Untitled project" }),
        // The catalogue number every item already carries (catalogNo, from
        // shared.js) — same № convention used elsewhere in Dash, not a new
        // numbering scheme just for the shelf.
        el("span", { class: "spine-no num", "aria-hidden": "true", text: `№ ${catalogNo(store, it)}` }),
      ]));
    }
    if (items.length === 0) shelf.appendChild(el("p", { class: "item-body-preview", text: "No matching projects." }));
  }
  search.addEventListener("input", draw);
  draw();

  wrap.append(shelfWrap);
  return wrap;
}

// ===================================================================
//  ONE PROJECT — now the DESK (desk addendum §5.1, decision 15)
// ===================================================================
// August 2026, Phase D1: the desk REPLACES this page's body. There is no
// toggle and no second face. Everything that used to be in panels here has a
// home in the Peek drawers instead — the entry groups became the Filed shelf,
// and the milestone editor moved into its own drawer, mount point only.
//
// This function is now four lines because views/desk.js owns the whole body,
// banner included: the Peek drawer handles hang off the banner's bottom edge,
// so drawing them apart would mean two files agreeing about one seam.
function renderDetail(store, state, ctx) {
  const project = store.get(state.projectId);
  const wrap = el("div", { class: "sheet-page sheet-page-desk" });
  const reload = () => ctx.rerender();

  wrap.appendChild(renderProjectPage(store, project, ctx, {
    onBack: () => { state.projectId = null; ctx.rerender(); },
    onEdit: () => openEditor(store, project.id, { onClose: reload, sync: ctx.sync }),
    onNew:  () => {
      const newId = store.createItem({ title: "" });
      store.assignToProject(newId, project.id);
      openEditor(store, newId, { onClose: reload, sync: ctx.sync });
    },
    onAdd:  () => openAssignPicker(store, project.id, reload),
  }));
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
