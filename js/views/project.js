// project.js — the "project home base" view.
// ===================================================================
// This is a picker + detail page, not a query/groupBy view like the others
// (§4.1 still applies underneath: it reads the same store, adds nothing
// new to the data model). Picking a project shows every item connected to
// it — either direction of a link — grouped by type, so tasks/notes/files
// all surface together without needing folders (§0's core requirement).
// "Add existing" and "quick create" both just create/edit a `links` entry.

import { el, itemRow, emptyState, typeChip, stageChip,
         renderPanel, groundStyle, itemColor } from "./shared.js";
import { colorToken } from "../theme.js";
import { openEditor } from "../editor.js";
import { renderMilestoneEditor } from "./milestone-editor.js";
import { visibleMilestones, stageOf, milestoneProgress, formatDay } from "../milestones.js";

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
      const msCount = visibleMilestones(it).length;
      list.appendChild(el("div", {
        class: "item-row", role: "button", tabindex: "0",
        onclick: () => { state.projectId = it.id; ctx.rerender(); },
      }, [
        // The project's OWN colour, not a hardcoded green — so the colour you
        // picked identifies it here too, not only on its own page. The full
        // list rebuild (progress, next date) is still to come; this is just
        // the colour carrying through.
        el("div", { class: "item-swatch is-project", style: `background:${colorToken(itemColor(store, it))}` }),
        el("div", { class: "item-main" }, [
          el("h3", { class: "item-title", text: it.title || "Untitled project" }),
          el("div", { class: "item-meta" }, [
            // Where the project is right now — derived, never stored (§3.3).
            stageChip(it),
            el("span", { class: "chip", text: `${count} ${count === 1 ? "entry" : "entries"}` }),
            msCount ? el("span", { class: "chip", text: `${msCount} ${msCount === 1 ? "milestone" : "milestones"}` }) : null,
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

// ===================================================================
//  ONE PROJECT  (rebuilt August 2026)
// ===================================================================
// The old detail page opened with a small title, a stage chip and then three
// lists, and you had to READ it to find out where the project stood. It now
// opens with the answer:
//
//   ┌──────────────────────────────────────┐
//   │ IN PROGRESS · 3 OF 5   ← mono caps   │  the project's own colour,
//   │ Dash                   ← display     │  filled. Cream ink on it.
//   │ NEXT  Duedate Test   4 AUG           │
//   └──────────────────────────────────────┘
//   [ rail: readouts + colour ]  [ MILESTONES panel ]
//                                [ ENTRIES panels   ]
//
// Two ideas are doing the work, and both are meant to spread to the rest of
// Dash rather than stop here:
//
//   SCALE. The title is display-sized. Hierarchy comes from a 3× size jump
//   rather than from more colours or heavier rules — which is what lets a
//   dense page still have an obvious top.
//
//   COLOUR AS GROUND. A project picks its own colour and wears it as a filled
//   block (see itemColor / groundStyle in views/shared.js). Ember is untouched
//   by this and still means "overdue" and nothing else.
function renderDetail(store, state, ctx) {
  const project = store.get(state.projectId);
  // .sheet-page, same as Home — so a project page obeys the same width rule
  // as every other page instead of running the full width of the window.
  const wrap = el("div", { class: "sheet-page" });
  const reload = () => ctx.rerender();

  const linked = membersOf(store, project.id);
  const stage = stageOf(project);
  const prog = milestoneProgress(project);

  // ---------------- the colour block ----------------
  wrap.appendChild(projectBanner(store, project, stage, prog));

  const grid = el("div", { class: "dash-grid" });

  // ---------------- rail: readouts, colour, actions ----------------
  const rail = el("div", { class: "dash-rail" });
  rail.appendChild(el("div", { class: "stat-strip" }, [
    stat(prog.total ? `${prog.done}/${prog.total}` : "—", "Milestones"),
    stat(String(linked.length), "Entries"),
  ]));
  // The colour lives in the Edit popup, next to the name — it's a property of
  // the project, not a control you need on the page every time you open it.
  rail.appendChild(el("div", { class: "rail-actions" }, [
    el("button", { class: "btn", text: "← All projects",
      onclick: () => { state.projectId = null; ctx.rerender(); } }),
    el("button", { class: "btn", text: "Edit project",
      onclick: () => openEditor(store, project.id, { onClose: reload, sync: ctx.sync }) }),
  ]));
  grid.appendChild(rail);

  // ---------------- main column: milestones, then entries ----------------
  const col = el("div", { class: "panel-col" });

  // The milestone editor (addendum §10, Phase M1) still lives on the project's
  // own page rather than in the Edit modal — this is the page you're on when
  // you're thinking about the project as a whole, and drag-reordering inside a
  // scrolling modal on a phone is miserable. It's only in a panel now.
  col.appendChild(renderPanel({
    id: "milestones",
    title: "Milestones",
    right: prog.total ? `${String(prog.done).padStart(2, "0")} / ${String(prog.total).padStart(2, "0")}` : null,
    render(container) {
      container.appendChild(renderMilestoneEditor(store, project, ctx));
    },
  }, ctx));

  // Entries, grouped by type — each type its own panel, so tasks/notes/files
  // read as separate instruments instead of one run of headed lists
  // (§0: "one system, many views over it").
  const byType = new Map();
  for (const it of linked) {
    if (!byType.has(it.type)) byType.set(it.type, []);
    byType.get(it.type).push(it);
  }

  if (linked.length === 0) {
    col.appendChild(renderPanel({
      id: "entries-empty",
      title: "Entries",
      render(container) {
        container.appendChild(emptyState(
          "Nothing in this project yet",
          "Add a task, note, or file — this page gathers everything assigned to this project automatically.",
          null, null));
      },
    }, ctx));
  } else {
    for (const t of store.types()) {
      const items = byType.get(t.key);
      if (!items || items.length === 0) continue;
      col.appendChild(renderPanel({
        id: `entries-${t.key}`,
        title: `${t.icon || "•"} ${t.label}`,
        right: String(items.length).padStart(2, "0"),
        render(container) {
          for (const it of items) {
            container.appendChild(itemRow(store, it, ctx.onOpen, { selection: ctx.selection }));
          }
        },
      }, ctx));
    }
  }

  col.appendChild(el("div", { class: "rail-actions" }, [
    el("button", { class: "btn btn-primary", text: "＋ New entry in this project", onclick: () => {
      const newId = store.createItem({ title: "" });
      store.assignToProject(newId, project.id);
      openEditor(store, newId, { onClose: reload, sync: ctx.sync });
    } }),
    el("button", { class: "btn", text: "＋ Add existing entry",
      onclick: () => openAssignPicker(store, project.id, reload) }),
  ]));

  grid.appendChild(col);
  wrap.appendChild(grid);
  return wrap;
}

// The block at the top. Everything on it is derived at render time, so it
// updates the instant a milestone is ticked (§3.3) — nothing is stored.
//
// The one place ember is allowed through the colour block: if the current
// stage's date has passed, the stage line gets the overdue mark. A project
// running late has to be able to say so even while wearing its own colour.
function projectBanner(store, project, stage, prog) {
  const line = [];
  if (stage) line.push(stage.complete ? "Complete" : stage.label);
  if (prog.total) line.push(`${prog.done} of ${prog.total}`);

  const next = stage && !stage.complete ? stage : null;

  return el("div", { class: "project-banner", style: groundStyle(store, project) }, [
    el("div", { class: "project-banner-top" }, [
      line.length ? el("span", { class: "lbl", text: line.join(" · ") }) : null,
      stage && stage.overdue ? el("span", { class: "lbl banner-late", text: "Overdue" }) : null,
    ]),
    el("h2", { class: "project-banner-title", text: project.title || "Untitled" }),
    next
      ? el("div", { class: "project-banner-next" }, [
          el("span", { class: "lbl", text: "Next" }),
          el("span", { class: "project-banner-next-label", text: next.label }),
          next.date ? el("span", { class: "num", text: formatDay(next.date) }) : null,
        ])
      : null,
    project.body ? el("p", { class: "project-banner-body", text: project.body }) : null,
  ]);
}

function stat(value, label) {
  return el("div", { class: "stat" }, [
    el("span", { class: "stat-num", text: value }),
    el("span", { class: "lbl", text: label }),
  ]);
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
