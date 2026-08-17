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
  // Full-bleed only on the Projects OVERVIEW. #view-host normally carries
  // the page inset that Home wants. Rather than changing the global shell, this
  // one wrapper reaches through that inset so the dark band aligns with the
  // List / Board bands; the shelf gets the normal inset back below it.
  const wrap = el("div", {
    class: "project-picker-page",
    style: "margin:calc(0px - var(--space-5)) calc(0px - var(--space-6)) 0",
  });
  const search = el("input", { type: "search", placeholder: "Search projects…", "aria-label": "Search projects" });
  const bandCount = el("span", { class: "band-count" });

  // NEXT UP belongs in the Projects banner, not in a second block that steals
  // the shelf's vertical room. It is deliberately compact: a label/summary and
  // up to three one-line project controls in the unused horizontal space beside
  // Search. If there are more than three active projects the summary still says
  // how many exist; the register itself answers "what reaches me first?"
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
    // Match the shared catalog band's horizontal inset and remove the old
    // below-band margin; the shelf owns its own breathing room now.
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

  const shelf = el("div", { class: "project-shelf" });
  const shelfWrap = el("div", {
    class: "project-shelf-wrap",
    // Restore the ordinary page inset immediately after the full-bleed band.
    style: "padding:var(--space-5) var(--space-6) 0",
  }, [shelf]);

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

  // Next-up controls are reconciled by project id too, for the same reason:
  // ordinary redraws should not throw away the control under the pointer.
  nextItems.addEventListener("click", (e) => {
    const button = e.target.closest("[data-project-next-item]");
    if (button && nextItems.contains(button)) openProject(button.dataset.id);
  });

  const empty = el("p", { class: "item-body-preview", text: "No matching projects." });

  // Everything about ONE spine that can change without the project changing.
  // Written only when it differs: assigning an identical value to .style or
  // .title is a needless style invalidation, and this runs on every redraw.
  function dress(node, it, count) {
    const stage = stageOf(it);                    // derived, never stored (§3.3)
    const overdue = !!(stage && stage.overdue);
    const stageText = stage ? stage.label : "No stage";
    const countText = `${count} ${count === 1 ? "entry" : "entries"}`;
    const nameParts = [it.title || "Untitled project", stageText, countText];
    if (overdue) nameParts.push("overdue");
    const label = nameParts.join(", ");

    // The project's OWN colour, via the same groundStyle() the banner uses.
    //
    // Width still grows from the real entry count through --n, but the books
    // now have a readable FLOOR as well: --tap-min + --space-5. That is enough
    // room for a title line and a quieter stage line without inventing a new
    // raw size outside the token system. Projects above that floor continue to
    // thicken with their member count exactly as before.
    const style = `${groundStyle(store, it)};--n:${count};min-width:calc(var(--tap-min) + var(--space-5));padding:var(--space-4) var(--space-2) var(--space-3)`;
    if (node.getAttribute("style") !== style) node.setAttribute("style", style);
    if (node.getAttribute("aria-label") !== label) {
      node.setAttribute("aria-label", label);
      node.title = label;
    }

    // The old bookmark was technically correct but easy to miss at shelf
    // scale. "Late" is still the same ember indicator — just explicit now.
    let late = node.querySelector(".spine-late");
    if (overdue && !late) {
      late = el("span", {
        class: "spine-late lbl",
        "aria-hidden": "true",
        text: "Late",
        style: "position:absolute;top:var(--space-2);left:var(--space-2);padding:var(--space-1) var(--space-2);background:var(--ember);color:var(--ember-ink);z-index:1",
      });
      node.prepend(late);
    } else if (!overdue && late) {
      late.remove();
    }

    const title = node.querySelector(".spine-title");
    const wanted = it.title || "Untitled project";
    if (title.textContent !== wanted) title.textContent = wanted;

    const stageLabel = node.querySelector(".spine-stage");
    if (stageLabel.textContent !== stageText) stageLabel.textContent = stageText;

    const countLabel = node.querySelector(".spine-count");
    if (countLabel.textContent !== countText) countLabel.textContent = countText;

    // The catalogue number every item already carries — same № convention
    // used elsewhere in Dash, not a numbering scheme just for the shelf.
    const no = node.querySelector(".spine-no");
    const noText = `№ ${catalogNo(store, it)}`;
    if (no.textContent !== noText) no.textContent = noText;
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
    // One BOOK, not a card: information still runs along the spine.
    // The large serif line is identity; the smaller mono line is the current
    // stage; count + catalogue number sit at the foot like library metadata.
    const copy = el("span", {
      class: "spine-copy",
      "aria-hidden": "true",
      style: "display:flex;align-items:flex-end;justify-content:center;gap:var(--space-2);width:100%;min-height:0;flex:1",
    }, [
      el("span", {
        class: "spine-title",
        style: "font-size:var(--text-lg);max-height:100%;margin-bottom:0",
      }),
      el("span", {
        class: "spine-stage lbl",
        style: "writing-mode:vertical-rl;transform:rotate(180deg);max-height:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ground-ink);opacity:0.72",
      }),
    ]);

    const meta = el("span", {
      class: "spine-meta",
      "aria-hidden": "true",
      style: "display:flex;flex-direction:column;align-items:center;gap:var(--space-1);width:100%;padding-top:var(--space-2)",
    }, [
      el("span", {
        class: "spine-count num",
        style: "color:var(--ground-ink);opacity:0.82",
      }),
      el("span", {
        class: "spine-no num",
        style: "color:var(--ground-ink);opacity:0.72",
      }),
    ]);

    const node = el("button", { class: "spine on-ground is-fresh", "data-id": it.id }, [copy, meta]);
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
    // thing that crowds the shelf.
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

  function draw() {
    const q = search.value.toLowerCase();
    const items = store.projects().filter(i => (i.title || "").toLowerCase().includes(q));
    const counts = memberCounts(store);           // ONE archive pass for shelf counts
    const n = items.length === 1 ? "1 project" : `${items.length} projects`;
    if (bandCount.textContent !== n) bandCount.textContent = n;

    drawNext(items);

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
