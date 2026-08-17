// project.js — the "project home base" view.
// ===================================================================
// This is a picker + detail page, not a query/groupBy view like the others
// (§4.1 still applies underneath: it reads the same store, adds nothing
// new to the data model). Picking a project shows every item connected to
// it — either direction of a link — grouped by type, so tasks/notes/files
// all surface together without needing folders (§0's core requirement).
// "Add existing" and "quick create" both just create/edit a `links` entry.

import { el, emptyState, groundStyle, catalogNo, stageChip } from "./shared.js";
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
      // THE SHELF IS KEPT, NOT REBUILT (August 16, 2026 — the spine shake).
      //
      // Every store write anywhere in Dash redraws the whole screen, and this
      // function used to answer that by throwing the shelf away and building a
      // brand new one. Nothing about that is visible — until you notice that a
      // spine's tilt is a CSS transition on :hover, and that the browser
      // resolves :hover one style pass AFTER an element is inserted. So a
      // freshly built spine that happens to land under the pointer starts flat
      // and animates into the tilt, all by itself; the next redraw replaces it
      // and it starts over. That is the "spines shake, then settle" — settle
      // being simply the moment the redraws stop.
      //
      // The fix is not to soften the animation, which would hide the rebuild
      // rather than remove it. It is to stop rebuilding: the picker is built
      // once per visit and refreshed in place, so a redraw that changes nothing
      // about the shelf touches no spine at all, and one that adds or removes a
      // project touches only that one. viewLocal is emptied when the view
      // changes, so leaving Projects still discards it.
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
// This used to be membersOf() called once per spine, and membersOf walks the
// whole archive — so drawing twelve projects walked everything twelve times,
// on every redraw. Same rule the desk already lives by (§12.6, "one archive
// pass per render") and the same one the August code-health pass applied to
// the rest of the app; the shelf had simply never been included.
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
//   shelf   = what projects do I have?
//   next up = which open project stage reaches me first?
//
// The shelf keeps Store.projects() order because it is a stable library. Next
// up is the dynamic register. Nothing here stores priority: the order is
// derived from the same milestone data stageOf() already uses everywhere.
//
// Ordering is intentionally boring and legible:
//   1. overdue current stages
//   2. dated current stages, nearest date first
//   3. undated current stages
// Complete projects and projects without milestones stay on the shelf but
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
// place. Nothing here is rebuilt on a redraw unless it actually changed.
function buildPicker(store, state, ctx) {
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

  // NEXT UP uses the existing panel + specimen-row language rather than a new
  // card type. The single tokenised margin is the only local layout nudge;
  // everything else is already part of Dash's visual system.
  const nextCount = el("span", { class: "panel-right num" });
  const nextBody = el("div", { class: "panel-body panel-body-flush" });
  const nextPanel = el("section", {
    class: "panel",
    "data-project-next": "1",
    "aria-label": "Next up",
    style: "margin-bottom:var(--space-5)",
  }, [
    el("div", { class: "panel-head" }, [
      el("span", { class: "plate-title", text: "Next up" }),
      nextCount,
    ]),
    nextBody,
  ]);
  wrap.appendChild(nextPanel);

  const shelf = el("div", { class: "project-shelf" });
  const shelfWrap = el("div", { class: "project-shelf-wrap" }, [shelf]);

  function openProject(id) {
    if (!id) return;
    state.projectId = id;
    ctx.rerender();
  }

  // ONE click handler for the whole shelf, rather than a closure per spine —
  // which is what lets a spine be kept across a redraw without rebinding it.
  shelf.addEventListener("click", (e) => {
    const s = e.target.closest(".spine");
    if (!s || !s.dataset.id) return;
    openProject(s.dataset.id);
  });

  // Same delegated idea for Next up. Rows are reconciled by id, so a background
  // write that changes some other project doesn't throw away the row under the
  // keyboard/pointer.
  nextBody.addEventListener("click", (e) => {
    const row = e.target.closest(".item-row[data-id]");
    if (row && nextBody.contains(row)) openProject(row.dataset.id);
  });
  nextBody.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest(".item-row[data-id]");
    if (!row || !nextBody.contains(row)) return;
    e.preventDefault();
    openProject(row.dataset.id);
  });

  const empty = el("p", { class: "item-body-preview", text: "No matching projects." });

  // Everything about ONE spine that can change without the project changing.
  // Written only when it differs: assigning an identical value to .style or
  // .title is a needless style invalidation, and this runs on every redraw.
  function dress(node, it, count) {
    const stage = stageOf(it);                    // derived, never stored (§3.3)
    const overdue = !!(stage && stage.overdue);
    const nameParts = [it.title || "Untitled project"];
    if (stage) nameParts.push(stage.complete ? "complete" : stage.label);
    nameParts.push(`${count} ${count === 1 ? "entry" : "entries"}`);
    if (overdue) nameParts.push("overdue");
    const label = nameParts.join(", ");

    // The project's OWN colour, via the same groundStyle() the banner uses —
    // so a picked colour (or a custom hex) is legible here too. Width stands
    // for how much is IN the project (css/app.css clamps it, so it never
    // drops below --tap-min).
    const style = `${groundStyle(store, it)};--n:${count}`;
    if (node.getAttribute("style") !== style) node.setAttribute("style", style);
    if (node.getAttribute("aria-label") !== label) {
      node.setAttribute("aria-label", label);
      node.title = label;
    }
    // Sighted only — the accessible name above already says "overdue".
    let flag = node.querySelector(".spine-flag");
    if (overdue && !flag) node.prepend(el("span", { class: "spine-flag", "aria-hidden": "true" }));
    else if (!overdue && flag) flag.remove();

    const title = node.querySelector(".spine-title");
    const wanted = it.title || "Untitled project";
    if (title.textContent !== wanted) title.textContent = wanted;
    // The catalogue number every item already carries — same № convention
    // used elsewhere in Dash, not a numbering scheme just for the shelf.
    const no = node.querySelector(".spine-no");
    const noText = `№ ${catalogNo(store, it)}`;
    if (no.textContent !== noText) no.textContent = noText;
  }

  function makeNextRow(it) {
    return el("div", {
      class: "item-row",
      role: "button",
      tabindex: "0",
      "data-id": it.id,
    }, [
      el("span", { class: "item-no project-next-no" }),
      el("div", { class: "item-main" }, [
        el("div", { class: "item-meta project-next-meta" }, [
          el("span", { class: "project-next-stage" }),
          el("span", { class: "num project-next-date" }),
          el("span", { class: "num project-next-members" }),
        ]),
        el("h3", { class: "item-title project-next-title" }),
      ]),
    ]);
  }

  function dressNext(node, it, stage, count) {
    const no = node.querySelector(".project-next-no");
    const noText = `№ ${catalogNo(store, it)}`;
    if (no.textContent !== noText) no.textContent = noText;

    const title = node.querySelector(".project-next-title");
    const titleText = it.title || "Untitled project";
    if (title.textContent !== titleText) title.textContent = titleText;

    const stageSlot = node.querySelector(".project-next-stage");
    const chip = stageChip(it);
    const oldChip = stageSlot.firstElementChild;
    const oldSig = oldChip ? `${oldChip.textContent}|${oldChip.className}` : "";
    const newSig = chip ? `${chip.textContent}|${chip.className}` : "";
    if (oldSig !== newSig) {
      stageSlot.replaceChildren();
      if (chip) stageSlot.appendChild(chip);
    }

    const date = node.querySelector(".project-next-date");
    const dateText = stage.date ? formatDay(stage.date) : "No date";
    if (date.textContent !== dateText) date.textContent = dateText;

    const members = node.querySelector(".project-next-members");
    const memberText = `${count} ${count === 1 ? "entry" : "entries"}`;
    if (members.textContent !== memberText) members.textContent = memberText;

    const labelParts = [titleText, `current stage ${stage.label}`];
    if (stage.date) labelParts.push(stage.overdue ? `overdue since ${formatDay(stage.date)}` : `due ${formatDay(stage.date)}`);
    else labelParts.push("no stage date");
    labelParts.push(memberText);
    const label = labelParts.join(", ");
    if (node.getAttribute("aria-label") !== label) {
      node.setAttribute("aria-label", label);
      node.title = label;
    }
  }

  // A BRAND NEW SPINE IS BORN IN WHATEVER STATE THE POINTER IS ALREADY IN.
  //
  // The tilt is meant to describe a gesture: you move onto a spine and it
  // leans out. But the browser resolves :hover one style pass AFTER an element
  // is inserted, so a spine created under a pointer that never moved starts
  // flat, discovers it is hovered, and animates — playing a gesture nobody
  // performed. `is-fresh` turns the transition off for exactly that one frame,
  // so the spine simply IS tilted if the pointer is on it, and is not if it
  // isn't. Moving on and off still animates exactly as before; this removes
  // the animation that had no gesture behind it, rather than hiding it.
  const fresh = [];
  function makeSpine(it) {
    const node = el("button", { class: "spine on-ground is-fresh", "data-id": it.id }, [
      el("span", { class: "spine-title", "aria-hidden": "true" }),
      el("span", { class: "spine-no num", "aria-hidden": "true" }),
    ]);
    fresh.push(node);
    return node;
  }
  function settleFresh() {
    if (fresh.length === 0) return;
    const batch = fresh.splice(0, fresh.length);
    // Two frames: the first is the one in which the browser lays the spine out
    // and works out whether the pointer is on it. Only after that has happened
    // is it safe to hand the transition back.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const node of batch) node.classList.remove("is-fresh");
    }));
  }

  function drawNext(items, counts) {
    const ranked = nextUp(items);
    nextPanel.hidden = ranked.length === 0;
    if (ranked.length === 0) return;

    const overdue = ranked.filter(x => x.stage.overdue).length;
    const summary = overdue
      ? `${overdue} overdue · ${ranked.length} active`
      : `${ranked.length} active`;
    if (nextCount.textContent !== summary) nextCount.textContent = summary;

    const have = new Map();
    for (const node of nextBody.querySelectorAll(".item-row[data-id]")) {
      have.set(node.dataset.id, node);
    }

    const wanted = [];
    for (const { item, stage } of ranked) {
      let node = have.get(item.id);
      if (node) have.delete(item.id); else node = makeNextRow(item);
      dressNext(node, item, stage, counts.get(item.id) || 0);
      wanted.push(node);
    }
    for (const [, node] of have) node.remove();

    wanted.forEach((node, i) => {
      if (nextBody.children[i] !== node) nextBody.insertBefore(node, nextBody.children[i] || null);
    });
  }

  function draw() {
    const q = search.value.toLowerCase();
    const items = store.projects().filter(i => (i.title || "").toLowerCase().includes(q));
    const counts = memberCounts(store);           // ONE archive pass, shared by shelf + Next up
    const n = items.length === 1 ? "1 project" : `${items.length} projects`;
    if (bandCount.textContent !== n) bandCount.textContent = n;

    drawNext(items, counts);

    // Reconcile by project id. A spine that is still wanted is DRESSED, never
    // replaced — which is the whole point: an element that survives a redraw
    // keeps whatever the pointer was already doing to it.
    const have = new Map();
    for (const node of shelf.querySelectorAll(".spine")) have.set(node.dataset.id, node);

    const wanted = [];
    for (const it of items) {
      let node = have.get(it.id);
      if (node) have.delete(it.id); else node = makeSpine(it);
      dress(node, it, counts.get(it.id) || 0);
      wanted.push(node);
    }
    for (const [, node] of have) node.remove();   // projects that are gone or filtered out

    // Put them in order, moving only the ones that are actually out of place.
    wanted.forEach((node, i) => {
      if (shelf.children[i] !== node) shelf.insertBefore(node, shelf.children[i] || null);
    });

    if (items.length === 0) { if (!empty.parentNode) shelf.appendChild(empty); }
    else if (empty.parentNode) empty.remove();
    settleFresh();
  }
  search.addEventListener("input", draw);
  draw();

  wrap.append(shelfWrap);
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
