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
import { createProjectPageController } from "./desk.js";
import { stageOf, formatDay } from "../milestones.js";

export const projectView = {
  name: "project",
  label: "Project",
  ownFilter: true,
  supportsSelect: true, // shows the Select button in the topbar (§ multi-select)

  render(result, ctx, container) {
    const store = ctx.store;
    const state = ctx.viewLocal;
    const projects = store.projects(); // only items of type "project"

    if (projects.length === 0) {
      destroyDetail(state);
      state.picker = null;
      container.innerHTML = "";
      container.appendChild(emptyState(
        "No projects yet",
        "Create your first project, then assign entries — tasks, notes, files — to it. An entry can belong to more than one project.",
        "＋ New project", () => createProject(store, ctx)));
      return;
    }

    if (!state.projectId || !store.get(state.projectId)) {
      destroyDetail(state);
      // THE PROJECT INDEX IS KEPT, NOT REBUILT (August 17, 2026).
      //
      // The earlier spine shelf taught us an important structural lesson:
      // every store write can redraw Dash, so the project controls themselves
      // must survive ordinary redraws. The visual metaphor has changed from a
      // shelf to an index rail, but that rule has not. The picker is built once
      // per visit and refresh() reconciles rail rows by project id.
      if (!state.picker) state.picker = buildPicker(store, state, ctx);
      state.picker.refresh();
      if (state.picker.el.parentNode !== container) {
        container.innerHTML = "";
        container.appendChild(state.picker.el);
      }
      return;
    }

    state.picker = null;
    const project = store.get(state.projectId);
    if (!state.detail || state.detail.projectId !== project.id) {
      destroyDetail(state);
      state.detail = buildDetail(store, state, ctx, project);
    } else {
      state.detail.refresh(project, ctx);
    }

    // Ordinary store writes stop here: the same wrapper and the same Desk
    // controller stay attached. Only a genuine picker/project boundary mounts
    // a different subtree.
    if (state.detail.el.parentNode !== container) {
      container.innerHTML = "";
      container.appendChild(state.detail.el);
      state.detail.mount();
    }
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

// ONE PASS over the archive for every project's member count.
//
// The overview needs counts for the focused specimen and for accessible rail
// labels. Doing this once keeps the "one archive pass per render" rule intact.
function memberCounts(store) {
  const counts = new Map();
  for (const it of store.all()) {
    for (const l of it.links || []) {
      if (l && l.label === "in project" && l.target !== it.id) {
        counts.set(l.target, (counts.get(l.target) || 0) + 1);
      }
    }
  }
  return counts;
}

// The overview answers TWO different questions, and keeping them separate is
// intentional:
//
//   index   = what projects do I have?
//   next up = which open project stage reaches me first?
//
// The index keeps Store.projects() order because it is a stable library. Next
// up is the dynamic register. Nothing here stores priority: the order is
// derived from the same milestone data stageOf() already uses everywhere.
//
// Ordering is intentionally boring and legible:
//   1. overdue current stages
//   2. dated current stages, nearest date first
//   3. undated current stages
// Complete projects and projects without milestones stay in the index but
// don't enter this register.
function nextUp(items) {
  const ranked = [];
  for (const item of items) {
    const stage = stageOf(item);
    if (!stage || stage.complete) continue;
    ranked.push({
      item,
      stage,
      group: stage.overdue ? 0 : (stage.date ? 1 : 2),
    });
  }
  ranked.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.stage.date && b.stage.date && a.stage.date !== b.stage.date) {
      return a.stage.date < b.stage.date ? -1 : 1;
    }
    const at = (a.item.title || "").toLocaleLowerCase();
    const bt = (b.item.title || "").toLocaleLowerCase();
    return at.localeCompare(bt);
  });
  return ranked;
}

// Build the picker once, and hand back a refresh() that reconciles it in
// place. Nothing in the project rail is rebuilt on a redraw unless it actually
// changed. The focus specimen is a VIEW of the selected project; its id lives
// only in viewLocal and is never written to project data or sync.
function buildPicker(store, state, ctx) {
  // Full-bleed only on the Projects OVERVIEW. #view-host normally carries
  // the page inset that Home wants. Rather than changing the global shell, this
  // one wrapper reaches through that inset so the dark band aligns with the
  // List / Board bands; the index/focus composition starts directly below it.
  const wrap = el("div", {
    class: "project-picker-page",
    style: "margin:calc(0px - var(--space-5)) calc(0px - var(--space-6)) 0",
  });
  const search = el("input", { type: "search", placeholder: "Search projects…", "aria-label": "Search projects" });
  const bandCount = el("span", { class: "band-count" });

  // NEXT UP belongs in the Projects banner, not in a second block that steals
  // the collection's vertical room. It stays exactly the compact derived
  // register introduced on August 16: a summary and up to three immediate
  // project controls in the unused horizontal space beside Search.
  const nextSummary = el("span", {
    class: "num",
    style: "color:var(--ink-on-mount-muted);white-space:nowrap",
  });
  const nextItems = el("div", {
    style: "display:flex;align-items:center;gap:var(--space-2);min-width:0;overflow-x:auto",
  });
  const nextBand = el("div", {
    "data-project-next": "1",
    "aria-label": "Next up",
    style: "display:flex;align-items:center;gap:var(--space-2);margin-left:auto;min-width:0;flex:1 1 auto;justify-content:flex-end",
  }, [
    el("span", {
      class: "lbl",
      text: "Next up",
      style: "color:var(--ink-on-mount);white-space:nowrap",
    }),
    nextSummary,
    nextItems,
  ]);

  const bandControls = el("div", { class: "band-controls" }, [
    el("div", { class: "search-wrap" }, [search]),
    nextBand,
  ]);
  const band = el("div", {
    class: "project-picker-band",
    // Match the shared catalog band's horizontal inset. The collection begins
    // at the seam immediately below; there is intentionally no floating panel.
    style: "padding:var(--space-4) var(--space-6);margin-bottom:0",
  }, [
    el("div", { class: "band-top" }, [
      el("h2", { class: "band-title", text: "Projects" }),
      bandCount,
      el("button", { class: "band-btn", text: "＋ New project", onclick: () => createProject(store, ctx) }),
    ]),
    bandControls,
  ]);
  wrap.appendChild(band);

  // ---- colour-forward project index rail ----
  const railLabel = el("span", { class: "lbl", text: "Project index" });
  const railList = el("div", { class: "project-index-list", "aria-label": "Project index" });
  const railEmpty = el("p", { class: "project-index-empty", text: "No matching projects." });
  const rail = el("section", { class: "project-index-rail" }, [
    el("div", { class: "project-index-head" }, [railLabel]),
    railList,
  ]);

  // ---- quiet focus specimen ----
  // The big type carries identity. Technical metadata stays in one small zone.
  // Clicking the title is the explicit transition into the project's Desk.
  const focusNo = el("span", { class: "num project-focus-no" });
  const focusTitle = el("span", { class: "project-focus-title" });
  const focusEnter = el("span", { class: "lbl project-focus-enter", text: "Open desk →" });
  const focusTitleButton = el("button", {
    class: "project-focus-title-button",
    type: "button",
  }, [focusTitle, focusEnter]);
  const focusColor = el("div", { class: "project-focus-color", "aria-hidden": "true" });
  const focusMeta = el("dl", { class: "project-focus-meta" });
  const focusEmpty = el("p", { class: "project-focus-empty", text: "No matching projects." });
  const focus = el("section", { class: "project-focus-specimen", "data-project-focus": "1" }, [
    el("div", { class: "project-focus-head" }, [
      el("span", { class: "lbl", text: "Focus specimen" }),
      focusNo,
    ]),
    el("div", { class: "project-focus-body" }, [
      focusTitleButton,
      focusColor,
      focusMeta,
      focusEmpty,
    ]),
  ]);

  const layout = el("div", { class: "project-index-layout" }, [rail, focus]);
  wrap.appendChild(layout);

  function openProject(id) {
    if (!id) return;
    state.projectId = id;
    ctx.rerender();
  }

  function focusProject(id) {
    if (!id || state.focusProjectId === id) return;
    state.focusProjectId = id;
    draw();
  }

  // One delegated click handler for the whole index. Reconciliation can keep a
  // row element for its entire visit without rebinding listeners on every draw.
  railList.addEventListener("click", (e) => {
    const button = e.target.closest("[data-project-index-item]");
    if (!button || !railList.contains(button)) return;
    focusProject(button.dataset.id);
  });

  focusTitleButton.addEventListener("click", () => openProject(state.focusProjectId));

  // Next-up controls are reconciled by project id too, for the same reason:
  // ordinary redraws should not throw away the control under the pointer.
  nextItems.addEventListener("click", (e) => {
    const button = e.target.closest("[data-project-next-item]");
    if (button && nextItems.contains(button)) openProject(button.dataset.id);
  });

  function makeIndexItem(it) {
    return el("button", {
      class: "project-index-item on-ground",
      type: "button",
      "data-project-index-item": "1",
      "data-id": it.id,
      "aria-pressed": "false",
    }, [
      el("span", { class: "project-index-no num", "aria-hidden": "true" }),
      el("span", { class: "project-index-title", "aria-hidden": "true" }),
      el("span", { class: "project-index-overdue", "aria-hidden": "true" }),
    ]);
  }

  function dressIndexItem(node, it, count, selected) {
    const stage = stageOf(it); // derived, never stored (§3.3)
    const overdue = !!(stage && stage.overdue);
    const titleText = it.title || "Untitled project";
    const labelParts = [titleText];
    if (stage) labelParts.push(stage.complete ? "complete" : `current stage ${stage.label}`);
    if (stage && stage.date) labelParts.push(overdue ? `overdue since ${formatDay(stage.date)}` : `due ${formatDay(stage.date)}`);
    labelParts.push(`${count} ${count === 1 ? "entry" : "entries"}`);
    const label = labelParts.join(", ");

    const style = groundStyle(store, it);
    if (node.getAttribute("style") !== style) node.setAttribute("style", style);
    if (node.getAttribute("aria-label") !== label) {
      node.setAttribute("aria-label", label);
      node.title = label;
    }
    const pressed = selected ? "true" : "false";
    if (node.getAttribute("aria-pressed") !== pressed) node.setAttribute("aria-pressed", pressed);

    const no = node.querySelector(".project-index-no");
    const noText = `№ ${catalogNo(store, it)}`;
    if (no.textContent !== noText) no.textContent = noText;

    const title = node.querySelector(".project-index-title");
    if (title.textContent !== titleText) title.textContent = titleText;

    const flag = node.querySelector(".project-index-overdue");
    flag.hidden = !overdue;
  }

  function makeNextButton(it) {
    return el("button", {
      class: "band-btn",
      "data-project-next-item": "1",
      "data-id": it.id,
      style: "text-align:left;white-space:nowrap;min-width:0",
    }, [
      el("span", {
        class: "project-next-title",
        style: "white-space:nowrap",
      }),
      el("span", {
        class: "num project-next-stage",
        style: "color:var(--ink-on-mount-muted);white-space:nowrap",
      }),
    ]);
  }

  function dressNext(node, it, stage) {
    const titleText = it.title || "Untitled project";
    const title = node.querySelector(".project-next-title");
    if (title.textContent !== titleText) title.textContent = titleText;

    const meta = node.querySelector(".project-next-stage");
    const dateText = stage.date ? formatDay(stage.date) : "No date";
    const metaText = `${stage.label} · ${dateText}`;
    if (meta.textContent !== metaText) meta.textContent = metaText;
    const metaStyle = stage.overdue
      ? "color:var(--ember-on-mount);white-space:nowrap"
      : "color:var(--ink-on-mount-muted);white-space:nowrap";
    if (meta.getAttribute("style") !== metaStyle) meta.setAttribute("style", metaStyle);

    const labelParts = [titleText, `current stage ${stage.label}`];
    if (stage.date) labelParts.push(stage.overdue ? `overdue since ${dateText}` : `due ${dateText}`);
    else labelParts.push("no stage date");
    const label = labelParts.join(", ");
    if (node.getAttribute("aria-label") !== label) {
      node.setAttribute("aria-label", label);
      node.title = label;
    }
  }

  function drawNext(items) {
    const ranked = nextUp(items);
    nextBand.hidden = ranked.length === 0;
    if (ranked.length === 0) {
      nextItems.replaceChildren();
      return;
    }

    const overdue = ranked.filter(x => x.stage.overdue).length;
    const summary = overdue
      ? `${overdue} overdue · ${ranked.length} active`
      : `${ranked.length} active`;
    if (nextSummary.textContent !== summary) nextSummary.textContent = summary;

    // This is an AT-A-GLANCE register, not a second project list. Three is
    // enough to show the immediate queue without letting the banner become the
    // thing that crowds the index.
    const shown = ranked.slice(0, 3);
    const have = new Map();
    for (const node of nextItems.querySelectorAll("[data-project-next-item]")) {
      have.set(node.dataset.id, node);
    }

    const wanted = [];
    for (const { item, stage } of shown) {
      let node = have.get(item.id);
      if (node) have.delete(item.id); else node = makeNextButton(item);
      dressNext(node, item, stage);
      wanted.push(node);
    }
    for (const [, node] of have) node.remove();

    wanted.forEach((node, i) => {
      if (nextItems.children[i] !== node) nextItems.insertBefore(node, nextItems.children[i] || null);
    });
  }

  function metaRow(label, value, { overdue = false } = {}) {
    return [
      el("dt", { class: "lbl", text: label }),
      el("dd", { class: overdue ? "num project-focus-overdue" : "num", text: value }),
    ];
  }

  function drawFocus(it, count) {
    const hasProject = !!it;
    focusEmpty.hidden = hasProject;
    focusTitleButton.hidden = !hasProject;
    focusColor.hidden = !hasProject;
    focusMeta.hidden = !hasProject;
    focusNo.hidden = !hasProject;
    if (!it) {
      focusMeta.replaceChildren();
      return;
    }

    const titleText = it.title || "Untitled project";
    if (focusTitle.textContent !== titleText) focusTitle.textContent = titleText;
    focusTitleButton.setAttribute("aria-label", `Open ${titleText} desk`);

    const noText = `№ ${catalogNo(store, it)}`;
    if (focusNo.textContent !== noText) focusNo.textContent = noText;

    const colorStyle = groundStyle(store, it);
    if (focusColor.getAttribute("style") !== colorStyle) focusColor.setAttribute("style", colorStyle);

    const stage = stageOf(it);
    const rows = [];
    // No milestone filler. If stage is absent these rows simply do not exist.
    if (stage) {
      rows.push(...metaRow("Stage", stage.label));
      if (stage.date) rows.push(...metaRow("Next due", formatDay(stage.date), { overdue: stage.overdue }));
    }
    rows.push(...metaRow("Entries", String(count)));
    focusMeta.replaceChildren(...rows);
  }

  function draw() {
    const q = search.value.toLowerCase();
    const items = store.projects().filter(i => (i.title || "").toLowerCase().includes(q));
    const counts = memberCounts(store); // ONE archive pass for all overview counts
    const n = items.length === 1 ? "1 project" : `${items.length} projects`;
    if (bandCount.textContent !== n) bandCount.textContent = n;

    drawNext(items);

    // The focus selection is view-local only. Keep it if it still exists in the
    // current search result; otherwise quietly fall to the first visible project.
    let focused = items.find(it => it.id === state.focusProjectId) || null;
    if (!focused && items.length) {
      focused = items[0];
      state.focusProjectId = focused.id;
    }
    if (!items.length) state.focusProjectId = null;

    // Reconcile by project id. A rail item that is still wanted is DRESSED,
    // never replaced — preserving the stable-DOM fix that removed hover shake.
    const have = new Map();
    for (const node of railList.querySelectorAll("[data-project-index-item]")) {
      have.set(node.dataset.id, node);
    }

    const wanted = [];
    for (const it of items) {
      let node = have.get(it.id);
      if (node) have.delete(it.id); else node = makeIndexItem(it);
      dressIndexItem(node, it, counts.get(it.id) || 0, it.id === state.focusProjectId);
      wanted.push(node);
    }
    for (const [, node] of have) node.remove();

    wanted.forEach((node, i) => {
      if (railList.children[i] !== node) railList.insertBefore(node, railList.children[i] || null);
    });

    if (items.length === 0) {
      if (!railEmpty.parentNode) railList.appendChild(railEmpty);
    } else if (railEmpty.parentNode) {
      railEmpty.remove();
    }

    drawFocus(focused, focused ? (counts.get(focused.id) || 0) : 0);
  }

  search.addEventListener("input", draw);
  draw();

  return { el: wrap, refresh: draw };
}

// ===================================================================
//  ONE PROJECT — now the DESK (desk addendum §5.1, decision 15)
// ===================================================================
// August 2026, Phase D1: the desk REPLACES this page's body. There is no
// toggle and no second face. Everything that used to be in panels here has a
// home in the Peek drawers instead — the entry groups became the Filed shelf,
// and the milestone editor moved into its own drawer, mount point only.
//
// views/desk.js owns the whole body, banner included: the Peek drawer handles
// hang off the banner's bottom edge, so drawing them apart would mean two files
// agreeing about one seam. This wrapper owns one Desk controller per project.
function destroyDetail(state) {
  if (!state.detail) return;
  state.detail.destroy();
  state.detail = null;
}

function buildDetail(store, state, ctx, project) {
  const wrap = el("div", { class: "sheet-page sheet-page-desk" });
  let currentProject = project;
  let currentCtx = ctx;
  const reload = () => currentCtx.rerender();

  const actions = {
    onBack: () => { state.projectId = null; currentCtx.rerender(); },
    onEdit: () => openEditor(store, currentProject.id, { onClose: reload, sync: currentCtx.sync }),
    onNew: () => {
      const newId = store.createItem({ title: "" });
      store.assignToProject(newId, currentProject.id);
      openEditor(store, newId, { onClose: reload, sync: currentCtx.sync });
    },
    onAdd: () => openAssignPicker(store, currentProject.id, reload),
  };

  const desk = createProjectPageController(store, currentProject, currentCtx, actions);
  wrap.appendChild(desk.el);

  return {
    el: wrap,
    projectId: project.id,
    mount: () => desk.mount(),
    refresh(nextProject, nextCtx) {
      currentProject = nextProject;
      currentCtx = nextCtx;
      desk.refresh(currentProject, currentCtx, actions);
    },
    destroy: () => desk.destroy(),
  };
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
