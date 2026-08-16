// views/desk.js — the project's desk, and the Peek drawers beside it.
// ===================================================================
// Phase D1 of docs/dash-desk-addendum.md. This module owns the whole project
// page body: the banner, the three Peek drawers hanging off it, and the desk
// surface itself. views/project.js keeps the picker and delegates to here.
//
// AUGUST 2026, PHASE D2 — clips and post-its. What is still NOT here, on
// purpose: wonder symbols (D3) and highlights (D4). The data model already has
// room for both (desk addendum §12.3–§12.4).
//
// The two D2 objects are deliberately different shapes of thing, and the
// difference is worth holding on to while reading:
//
//   A CLIP is rigid and wordless. It owns no position and no member list — it
//   is a project-side record that says only "I exist", and everything about
//   where it sits is recomputed from its members every render (§12.2). That is
//   why dragging one is just an ordinary card drag run in a loop.
//
//   A POST-IT is soft and has words. It owns its own position when it is
//   free-floating, and gives that up (keeps it, ignores it) when attached to a
//   clip — one nullable field decides which, per §5.6.
//
// The rules this file must keep, all of which have bitten already:
//
//   - ONE archive pass per refresh. deskData() is the only thing that walks
//     store.all(); the drawers read the same result (§12.6).
//   - Drags commit ON DROP, never per frame (§8.34). Pointer-move is local
//     state. A background sync landing mid-drag must not steal the card, so
//     nothing re-renders until the pointer is released.
//   - Positions clamp in the MODEL, not just on screen (§14.2).
//   - Escape closes the topmost surface only (§ current-state).
//   - Ember is an indicator: an overdue card marks itself exactly as a list
//     row does, and nothing decorative may (§12.6).
//   - Desk arrangement is pointer-only, and that is honest ONLY because Peek
//     is the accessible face of the same data (§12.6). Nothing may exist as
//     an arrangement alone.

import { el, itemRow, typeChip, statusChip, catalogNo, shortDate,
         emptyState, groundStyle, tagChips } from "./shared.js";
import { openEditor } from "../editor.js";
import { renderMilestoneEditor } from "./milestone-editor.js";
import { PROJECT_LINK } from "../store.js";
import { stageOf, milestoneProgress, formatDay } from "../milestones.js";
import { toast } from "../ui/toast.js";
import { CLIP_BANNER_SVG, CLIP_MARK_SVG } from "../icons.js";
import * as D from "../desk.js";

// ===================================================================
//  THE PLATFORM GATE (§12.6, §8.29)
// ===================================================================
// A precise pointer AND a wide viewport. Phones and today's iPad report a
// coarse pointer and get the Peek page instead — the same `pointer: fine`
// precedent tokens.css already uses for --control-min, plus a width, because
// a desk needs room as well as a mouse.
//
// Enabling iPad later is LOOSENING THIS FUNCTION and nothing else. That was
// the whole point of writing the gate as one predicate.
const DESK_MIN_WIDTH = 900;
export function supportsDesk() {
  try {
    return window.matchMedia("(pointer: fine)").matches && window.innerWidth >= DESK_MIN_WIDTH;
  } catch {
    return false;                                  // no matchMedia: assume no desk
  }
}

// ===================================================================
//  ENTRY POINT
// ===================================================================
export function createProjectPageController(store, project, ctx, actions) {
  const hasDesk = supportsDesk();
  const state = hasDesk ? deskState(ctx) : null;
  const runtime = {
    store, project, ctx, actions,
    data: null, stage: null, prog: null,
    placedById: new Map(), clipByCid: new Map(), noteByNid: new Map(), clipOfCard: new Map(),
  };

  const page = el("div", { class: "desk-page" });
  const clipMode = hasDesk ? clipModeControl(runtime, state) : null;
  const bannerCtl = banner(runtime, state, clipMode);
  page.appendChild(bannerCtl.el);

  let drawer = null;
  let surf = null;
  let peek = null;
  if (hasDesk) {
    drawer = drawers(runtime, state);
    page.appendChild(drawer.handles);
    surf = surface(runtime, state, drawer, bannerCtl.glanceBtn);
    page.appendChild(surf.el);
  } else {
    peek = el("div", {});
    page.appendChild(peek);
  }

  let destroyed = false;
  const controller = {
    el: page,
    projectId: project.id,
    _drawer: drawer,
    mount() {
      if (destroyed) return;
      if (drawer) drawer.mount();
      if (surf) surf.mount();
    },
    refresh(nextProject, nextCtx, nextActions = runtime.actions) {
      if (destroyed || !nextProject || nextProject.id !== controller.projectId) return false;
      runtime.project = nextProject;
      runtime.ctx = nextCtx;
      runtime.actions = nextActions;
      refreshRuntime(runtime);

      const style = groundStyle(runtime.store, runtime.project);
      if (page.getAttribute("style") !== style) page.setAttribute("style", style);
      bannerCtl.refresh();
      if (drawer) drawer.refresh();
      if (surf) surf.refresh();
      else {
        const next = peekPage(runtime.store, runtime.project, runtime.ctx, runtime.data);
        peek.replaceChildren(...next.childNodes);
        peek.className = next.className;
      }
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      if (drawer) drawer.destroy();
      if (surf) surf.destroy();
      closeDeskMenu();
    },
  };

  // Compatibility with the existing direct renderer tests/callers. Project view
  // owns the controller itself; older direct callers still receive the page.
  page._deskController = controller;
  page._deskMount = () => controller.mount();
  page._deskRefresh = (nextProject, nextCtx, nextActions) => controller.refresh(nextProject, nextCtx, nextActions);
  page._deskDestroy = () => controller.destroy();

  // A Project-tab switch drops viewLocal before projectView can call destroy().
  // Keep one observer for the CONTROLLER lifetime as the safety net for that
  // route only. Ordinary refreshes mutate descendants while page stays connected
  // and therefore do not tear anything down.
  const observer = new MutationObserver(() => {
    if (!page.isConnected) controller.destroy();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  controller.refresh(project, ctx, actions);
  return controller;
}

export function renderProjectPage(store, project, ctx, actions) {
  return createProjectPageController(store, project, ctx, actions).el;
}

function refreshRuntime(runtime) {
  // THE one archive pass per refresh. The shell survives; the derived model is
  // replaced wholesale so the one persistent gesture wiring always reads NOW.
  runtime.data = D.deskData(runtime.store.all(), runtime.project.id, PROJECT_LINK);
  runtime.stage = stageOf(runtime.project);
  runtime.prog = milestoneProgress(runtime.project);
  runtime.placedById = new Map(runtime.data.placed.map(p => [p.id, p]));
  runtime.clipByCid = new Map(runtime.data.clips.map(c => [c.cid, c]));
  runtime.noteByNid = new Map(runtime.data.notes.map(n => [n.nid, n]));
  runtime.clipOfCard = new Map();
  for (const c of runtime.data.clips) for (const m of c.members) runtime.clipOfCard.set(m.id, c);
}

// Desk UI state lives in ctx.viewLocal so it survives controller refreshes and
// genuine project remounts. It is chrome, not content: which drawer is open
// and where you have scrolled are not facts about the project (§8.19 — the
// ARRANGEMENT syncs; the furniture around it does not).
function deskState(ctx) {
  const v = ctx.viewLocal;
  // scrollX/Y start as null meaning "never looked at this desk" — the first
  // render then centres the view on the middle of the surface, which is where
  // the mat's eye is. Zero would have meant the top-left corner of a
  // 4400 x 2900 sheet, which is a corner of an empty room.
  if (!v.desk) v.desk = {
    drawer: null, scrollX: null, scrollY: null, expanded: null,
    // The double-click memory. It used to be a local in wireDesk's closure —
    // which dies with every rebuild, and the first click on a card that isn't
    // already on top CAUSES a rebuild (it commits a raise). So the second
    // click arrived at a desk with no memory of the first, and expanding by
    // double-click only ever worked on a card that happened to be on top.
    lastTapId: null, lastTapAt: 0,
    // ---- Phase D2 ----
    // Select-to-clip: null, or { picked: [entryId…] }. A MODE, not content —
    // it exists between pressing the clip button and pressing it again, and
    // writes nothing until it commits.
    clipping: null,
    // Which clip is open, as an id, or null. Transient, per-device, NOT
    // synced and NOT stored, exactly like `expanded` above (the brief is
    // explicit about this, and it is the right call: "which pile I have
    // fanned out while I read it" is furniture, not arrangement).
    clipOpen: null,
    // The post-it editor's deferred-commit bookkeeping — the same three
    // pieces the milestone editor and the Home capture box already use:
    // drafts survive a rebuild mid-word, and focus + cursor come back after.
    // `noteTyped` is the fourth: "this scrap has been written on at least
    // once", which is what tells being EMPTIED apart from never having been
    // filled. See the note by hadWords() in postIt().
    noteDrafts: {}, noteFocus: null, noteSel: null, noteTyped: {},
  };
  // Older sessions in the same view may have built the object above before D2
  // existed, so the new keys are filled in rather than assumed.
  if (!v.desk.noteDrafts) v.desk.noteDrafts = {};
  if (!v.desk.noteTyped) v.desk.noteTyped = {};
  if (v.desk.clipping === undefined) v.desk.clipping = null;
  if (v.desk.clipOpen === undefined) v.desk.clipOpen = null;
  return v.desk;
}

// ===================================================================
//  SELECT-TO-CLIP (§5.4)
// ===================================================================
// The whole mode, as one small object the banner button can both read and
// drive. Pressing the button the first time opens the mode; pressing it again
// closes it, committing if there is anything worth committing.
//
// TWO OR MORE, or nothing. One card is not a clip — it is a card — so a
// one-card selection cancels silently rather than writing a degenerate record.
// (Degenerate clips are legal data, per §12.2; this just declines to MAKE one
// on purpose.) Nothing at all is written on the cancel path.
//
// This is deliberately NOT the app's existing multi-select. That one is for
// list rows and stays off on the desk surface (§12.6); this one is desk-only,
// lives in view-local state, and has one outcome instead of a toolbar.
function clipModeControl(runtime, state) {
  return {
    get active() { return !!state.clipping; },
    get count() { return state.clipping ? state.clipping.picked.length : 0; },
    cancel() {
      if (!state.clipping) return false;
      state.clipping = null;
      runtime.ctx.rerender();
      return true;
    },
    toggle() {
      if (!state.clipping) { state.clipping = { picked: [] }; runtime.ctx.rerender(); return; }
      const picked = state.clipping.picked.slice();
      state.clipping = null;
      if (picked.length >= 2) {
        // ONE clip record, then one membership op per card — the split across
        // the two floors that §12.2 describes, written in the order it reads.
        const cid = runtime.store.addClip(runtime.project.id);
        for (const id of picked) runtime.store.setDeskField(id, runtime.project.id, "clip", cid);
      }
      runtime.ctx.rerender();
    },
  };
}

// ===================================================================
//  THE BANNER — ledger band (§14.14, §14.17, locked candidate A)
// ===================================================================
// Same content the tall banner carried; a third of the height. The name owns
// the top line whatever its length, and the facts collapse into one thin
// ruled line beneath it, closer to texture than to data you read.
function banner(runtime, state, clipMode) {
  const name = el("h2", { class: "pb-name" });
  const catalogFact = el("span", { class: "lbl" });
  const stageLabel = document.createTextNode("");
  const stageSpace = document.createTextNode("");
  const stageCount = el("span", { class: "num pb-f-count" });
  const stageCell = el("span", { class: "lbl pb-f-stage" }, [stageLabel, stageSpace, stageCount]);
  const memberFact = el("span", { class: "lbl" });
  const nextStrong = el("span", { class: "pb-f-strong" });
  const nextSpace = document.createTextNode("");
  const nextDate = el("span", { class: "num" });
  const nextFact = el("span", { class: "lbl" }, [
    document.createTextNode("Next — "), nextStrong, nextSpace, nextDate,
  ]);
  const overdueFact = el("span", { class: "lbl banner-late", text: "Overdue" });
  const facts = el("div", { class: "pb-line" }, [
    catalogFact, stageCell, memberFact, nextFact, overdueFact,
  ]);

  const clipBtn = clipMode ? el("button", {
    class: "btn banner-clip",
    html: CLIP_BANNER_SVG,
    onclick: () => clipMode.toggle(),
  }) : null;
  const glanceBtn = el("button", {
    class: "btn banner-glance", text: "✧",
    title: "Hold to see the whole desk",
    "aria-label": "Hold to see the whole desk",
  });
  const root = el("div", { class: "pb pb-a on-ground" }, [
    el("div", { class: "pb-head" }, [
      name,
      el("div", { class: "pb-acts" }, [
        el("button", { class: "btn btn-primary", text: "＋ Entry", onclick: () => runtime.actions.onNew() }),
        el("button", { class: "btn", text: "＋ Existing", onclick: () => runtime.actions.onAdd() }),
        el("button", { class: "btn", text: "Edit", onclick: () => runtime.actions.onEdit() }),
        el("button", { class: "btn", text: "← All", onclick: () => runtime.actions.onBack() }),
        clipBtn,
        glanceBtn,
      ]),
    ]),
    facts,
  ]);

  function refresh() {
    const { store, project, stage, prog, data } = runtime;
    name.textContent = project.title || "Untitled";
    catalogFact.textContent = `№ ${catalogNo(store, project)}`;
    stageLabel.data = stage ? (stage.complete ? "Complete" : stage.label) : "No milestones yet";
    if (prog.total) {
      stageSpace.data = " ";
      stageCount.hidden = false;
      stageCount.textContent = `${String(prog.done).padStart(2, "0")} / ${String(prog.total).padStart(2, "0")}`;
    } else {
      stageSpace.data = "";
      stageCount.hidden = true;
      stageCount.textContent = "";
    }
    memberFact.textContent = `${data.members.length} ${data.members.length === 1 ? "entry" : "entries"}`;

    const next = stage && !stage.complete ? stage : null;
    nextFact.hidden = !next;
    if (next) {
      nextStrong.textContent = next.label;
      nextSpace.data = next.date ? " " : "";
      nextDate.textContent = next.date ? formatDay(next.date) : "";
    } else {
      nextStrong.textContent = "";
      nextSpace.data = "";
      nextDate.textContent = "";
    }
    overdueFact.hidden = !(stage && stage.overdue);

    if (clipBtn) {
      clipBtn.className = "btn banner-clip" + (clipMode.active ? " is-on" : "");
      clipBtn.setAttribute("aria-pressed", String(clipMode.active));
      clipBtn.title = clipMode.active
        ? "Click the cards you want together, then press this again"
        : "Clip cards together";
      clipBtn.setAttribute("aria-label", clipMode.active ? "Finish clipping" : "Clip cards together");
    }
  }

  return { el: root, refresh, glanceBtn, clipBtn };
}

// ===================================================================
//  PEEK — three independent mini-drawers (§14.4)
// ===================================================================
// Each shelf gets its own handle in a row along the banner's bottom edge, and
// opens as a column under ITS OWN handle, only as tall as its contents need.
// The handles wear the project's colour; so does the drawer (§14.17).
function drawers(runtime, state) {
  const shelves = [
    { key: "unplaced",   label: "Unplaced" },
    { key: "filed",      label: "Filed" },
    { key: "milestones", label: "Milestones" },
  ];

  const body = el("div", { class: "desk-drawer", role: "region", "aria-label": "Peek" });
  const inner = el("div", { class: "desk-drawer-inner" });
  body.appendChild(inner);

  const handles = el("div", { class: "desk-handles", role: "group", "aria-label": "Peek drawers" });
  const handleEls = new Map();
  const countEls = new Map();
  let closeTimer = null;
  let mounted = false;
  let transitionCount = 0;

  for (const sh of shelves) {
    const count = el("span", { class: "desk-handle-count", text: "0" });
    const h = el("button", {
      class: "desk-handle",
      "data-shelf": sh.key,
      "aria-expanded": String(state.drawer === sh.key),
      onclick: () => setDrawer(sh.key === state.drawer ? null : sh.key),
    }, [document.createTextNode(sh.label + " "), count]);
    handles.appendChild(h);
    handleEls.set(sh.key, h);
    countEls.set(sh.key, count);
  }
  handles.appendChild(body);          // the drawer hangs off the handle row

  function shelfContent(name) {
    if (name === "unplaced") return unplacedShelf(runtime.store, runtime.project, runtime.ctx, runtime.data);
    if (name === "filed") return filedShelf(runtime.store, runtime.ctx, runtime.data);
    if (name === "milestones") return milestonesShelf(runtime.store, runtime.project, runtime.ctx);
    return null;
  }

  function cancelClose() {
    if (closeTimer == null) return;
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  function replaceShelf(name) {
    const content = shelfContent(name);
    inner.innerHTML = "";
    if (content) inner.appendChild(content);
  }

  function setDrawer(name) {
    cancelClose();
    const previous = state.drawer;
    state.drawer = name;
    for (const [k, h] of handleEls) h.setAttribute("aria-expanded", String(k === name));
    if (!name) {
      body.style.maxHeight = "0px";
      // Keep the contents mounted for exactly as long as the slide lasts. The
      // timer belongs to this controller and is cancelled by a fast reopen.
      closeTimer = window.setTimeout(() => {
        closeTimer = null;
        if (!state.drawer) inner.innerHTML = "";
      }, motionMs());
      return;
    }
    if (name !== previous) transitionCount++;
    replaceShelf(name);
    if (mounted) placeDrawer(name);
  }

  function placeDrawer(name) {
    const h = handleEls.get(name);
    if (!h) return;
    const row = handles.clientWidth;
    const min = Math.min(row, 360);                       // never narrower than readable
    const w = Math.min(row, Math.max(h.offsetWidth, min));
    body.style.width = w + "px";
    body.style.left = Math.max(0, Math.min(h.offsetLeft, row - w)) + "px";
    body.style.maxHeight = Math.min(inner.scrollHeight, Math.round(window.innerHeight * 0.56)) + "px";
  }

  function refresh() {
    countEls.get("unplaced").textContent = String(runtime.data.unplaced.length);
    countEls.get("filed").textContent = String(runtime.data.members.length);
    countEls.get("milestones").textContent = milestoneCount(runtime.project);
    for (const [k, h] of handleEls) h.setAttribute("aria-expanded", String(k === state.drawer));

    // A store write while a shelf is already open changes CONTENT, not drawer
    // state. Replace only the shelf body and leave the open/close transition
    // completely alone.
    if (state.drawer) {
      cancelClose();
      replaceShelf(state.drawer);
      if (mounted) placeDrawer(state.drawer);
    }
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    if (state.drawer) placeDrawer(state.drawer);
  }

  function destroy() {
    cancelClose();
  }

  return {
    handles, body, inner, setDrawer, handleEls, refresh, mount, destroy,
    get transitionCount() { return transitionCount; },
  };
}

function milestoneCount(project) {
  const p = milestoneProgress(project);
  return p.total ? `${String(p.done).padStart(2, "0")}/${String(p.total).padStart(2, "0")}` : "0";
}

// 1. UNPLACED — computed, never stored (§6). Drag one onto the desk.
function unplacedShelf(store, project, ctx, data) {
  const box = el("div", {});
  box.appendChild(el("div", { class: "desk-shelf-head" }, [
    el("span", { class: "plate-title", text: "Unplaced" }),
    el("span", { class: "group-count", text: String(data.unplaced.length) }),
  ]));
  if (data.unplaced.length === 0) {
    box.appendChild(el("p", { class: "hint", text: "Everything in this project is on the desk." }));
    return box;
  }
  box.appendChild(el("p", { class: "hint", text: "Nothing here has a spot on the desk yet. Drag one out onto the desk." }));
  const rail = el("div", { class: "desk-unplaced" });
  for (const it of data.unplaced) {
    rail.appendChild(el("div", {
      class: "desk-unplaced-row",
      "data-id": it.id,
      title: it.title || "Untitled",
    }, [
      el("span", { class: "item-no", text: `№ ${catalogNo(store, it)}` }),
      el("span", { class: "desk-unplaced-title", text: it.title || "Untitled" }),
    ]));
  }
  box.appendChild(rail);
  return box;
}

// 2. FILED — the structured view, List-style, using the shared row renderer.
// The quick status control stays live here, and select mode keeps working
// (§8.32) — this is the accessible face of everything on the desk.
function filedShelf(store, ctx, data) {
  const box = el("div", {});
  box.appendChild(el("div", { class: "desk-shelf-head" }, [
    el("span", { class: "plate-title", text: "Filed" }),
    el("span", { class: "group-count", text: String(data.members.length) }),
  ]));
  if (data.members.length === 0) {
    box.appendChild(emptyState(
      "Nothing in this project yet",
      "Add a task, note, or file — this drawer gathers everything assigned to this project.",
      null, null));
    return box;
  }
  for (const it of data.members) {
    box.appendChild(itemRow(store, it, ctx.onOpen, { selection: ctx.selection, statusControl: true }));
  }
  return box;
}

// 3. MILESTONES — the existing editor, moved intact. Only its MOUNT POINT
// moved; the editor's own focus bookkeeping is untouched.
function milestonesShelf(store, project, ctx) {
  const box = el("div", {});
  box.appendChild(el("div", { class: "desk-shelf-head" }, [
    el("span", { class: "plate-title", text: "Milestones" }),
    el("span", { class: "group-count num", text: milestoneCount(project) }),
  ]));
  box.appendChild(renderMilestoneEditor(store, project, ctx));
  return box;
}

// ===================================================================
//  THE DESK SURFACE
// ===================================================================
function surface(runtime, state, drawer, glanceBtn) {
  const view = el("div", { class: "desk-viewport" });
  // THE SIZER. It owns the fixed scrollable area and never gets transformed.
  const sizer = el("div", { class: "desk-sizer" });
  const deskEl = el("div", {
    class: "desk-surface",
    "aria-label": "Desk. Pointer only — the same entries are in the Peek drawers above, at full size.",
  });
  sizer.appendChild(deskEl);
  view.appendChild(sizer);

  // Decorative and invariant for the lifetime of this desk. Refresh removes
  // every OTHER child, never this node and never its ~50 paths.
  const matEl = mat();
  deskEl.appendChild(matEl);

  const guard = { hold: true };
  const dom = { view, deskEl, drawer, glanceBtn, guard, clipHint: null, anchors: new Map() };
  let openUnits = [];
  let mounted = false;
  let mountFrame = null;
  let guardFrame = null;
  let noteFocusFrame = null;
  let destroyed = false;

  function relayoutOpen() {
    if (openUnits.length === 0) return;
    for (const c of openUnits) {
      const nodes = c.members.map(m => deskEl.querySelector(`.dcard[data-id="${cssId(m.id)}"]`));
      const sizes = nodes.map(n => (n && !n.classList.contains("is-expanded"))
        ? { w: n.offsetWidth, h: n.offsetHeight } : null);
      const g = D.openGrid(c.anchor, sizes, { room: view.clientWidth || undefined });
      nodes.forEach((n, i) => { if (n) placeAt(n, g.at[i]); });
      dom.anchors.set(c.cid, g.origin);
      const mark = deskEl.querySelector(`.dclip-mark[data-cid="${cssId(c.cid)}"]`);
      if (mark) placeAt(mark, D.markSlotOpen(g.origin, g.pitchX - D.OPEN_GAP_X));
      for (const n of c.notes) {
        const nd = deskEl.querySelector(`.dnote[data-nid="${cssId(n.nid)}"]`);
        if (nd) placeAt(nd, D.noteAt(g.origin, n.offset));
      }
    }
  }

  function fit() {
    const top = view.getBoundingClientRect().top;
    const h = Math.max(320, Math.round(window.innerHeight - top)) + "px";
    if (view.style.height !== h) view.style.height = h;
    relayoutOpen();
  }

  function refresh() {
    if (destroyed) return;
    const { store, project, ctx, data } = runtime;

    // Round 1 deliberately keeps the existing card/clip/post-it renderer. The
    // objects below the mat are rebuilt; the viewport/sizer/surface/mat are not.
    for (const child of [...deskEl.children]) if (child !== matEl) child.remove();

    const w = D.weights(data.loose);
    const units = [];
    for (const p of data.loose) units.push({ z: p.z, id: p.id, kind: "card", p });
    for (const c of data.clips) {
      if (c.members.length === 0) continue;
      units.push({ z: c.z, id: c.cid, kind: "clip", c });
    }
    units.sort((a, b) => (a.z - b.z) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    dom.anchors = new Map();
    openUnits = [];
    for (const u of units) {
      if (u.kind === "card") {
        deskEl.appendChild(card(store, project, ctx, u.p, w.get(u.p.id) || 0, state, u.p.pos, null));
        continue;
      }
      const c = u.c;
      const open = state.clipOpen === c.cid;
      const grid = open
        ? D.openGrid(c.anchor, c.members.map(() => ({ w: D.CARD_MAX_W, h: 180 })))
        : null;
      c.members.forEach((p, i) => {
        const at = open ? grid.at[i] : D.stackSlot(c.anchor, i);
        deskEl.appendChild(card(store, project, ctx, p, 0, state, at, { clip: c, open, index: i }));
      });
      const anchor = open ? grid.origin : c.anchor;
      dom.anchors.set(c.cid, anchor);
      deskEl.appendChild(clipMark(c, open,
        open ? D.markSlotOpen(grid.origin, grid.pitchX - D.OPEN_GAP_X)
             : D.markSlot(c.anchor, c.members.length)));
      for (const n of c.notes) {
        deskEl.appendChild(postIt(store, project, ctx, state, n,
          D.noteAt(anchor, n.offset), c.cid, u.z));
      }
      if (open) openUnits.push(c);
    }

    for (const n of data.freeNotes) {
      deskEl.appendChild(postIt(store, project, ctx, state, n,
        n.pos || { x: D.ORIGIN, y: D.ORIGIN }, null, null));
    }

    if (data.placed.length === 0 && data.notes.length === 0) {
      deskEl.appendChild(el("p", { class: "desk-empty hint" }, [
        data.unplaced.length
          ? "Open the Unplaced drawer above and drag something out here."
          : "Nothing in this project yet. Use ＋ Entry to start.",
      ]));
    }

    if (dom.clipHint) { dom.clipHint.remove(); dom.clipHint = null; }
    if (state.clipping) {
      dom.clipHint = el("div", { class: "desk-clip-hint", role: "status" });
      view.appendChild(dom.clipHint);
    }
    interactions.paintClipHint();

    if (noteFocusFrame != null) cancelAnimationFrame(noteFocusFrame);
    noteFocusFrame = restoreNoteFocus(deskEl, state);
    if (mounted) fit();
  }

  // Remember which post-it had the cursor, so a card-only redraw can rebuild
  // that textarea without turning the redraw into a user-visible blur.
  const onFocusIn = (e) => {
    const k = e.target && e.target.getAttribute ? e.target.getAttribute("data-fkey") : null;
    state.noteFocus = k || null;
    state.noteSel = null;
  };
  deskEl.addEventListener("focusin", onFocusIn);

  const interactions = wireDesk(runtime, state, dom);

  function mount() {
    if (destroyed || mounted) return;
    mounted = true;
    if (mountFrame != null) { cancelAnimationFrame(mountFrame); mountFrame = null; }
    fit();
    if (state.scrollX == null) {
      state.scrollX = Math.max(0, Math.round((view.scrollWidth - view.clientWidth) / 2));
      state.scrollY = Math.max(0, Math.round((view.scrollHeight - view.clientHeight) / 2));
    }
    view.scrollLeft = state.scrollX;
    view.scrollTop = state.scrollY;
    if (guardFrame != null) cancelAnimationFrame(guardFrame);
    guardFrame = requestAnimationFrame(() => { guardFrame = null; guard.hold = false; });
  }

  // Safety net for direct callers. project.js calls mount synchronously.
  mountFrame = requestAnimationFrame(mount);
  window.addEventListener("resize", fit);

  const onScroll = () => {
    if (guard.hold) return;
    state.scrollX = view.scrollLeft;
    state.scrollY = view.scrollTop;
  };
  view.addEventListener("scroll", onScroll);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (mountFrame != null) cancelAnimationFrame(mountFrame);
    if (guardFrame != null) cancelAnimationFrame(guardFrame);
    if (noteFocusFrame != null) cancelAnimationFrame(noteFocusFrame);
    window.removeEventListener("resize", fit);
    interactions.destroy();
  }

  view._deskMount = mount;
  view._deskFit = fit;
  return { el: view, refresh, mount, destroy };
}

function mat() {
  const m = D.matPaths();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "desk-mat");
  svg.setAttribute("viewBox", m.viewBox);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-hidden", "true");
  for (const d of m.paths) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", "0"); c.setAttribute("cy", "0"); c.setAttribute("r", String(m.radius));
  svg.appendChild(c);
  return svg;
}

// ===================================================================
//  PLACING SOMETHING ON THE SURFACE
// ===================================================================
// Everything on the desk is absolutely positioned, and now in one of two
// conventions: `{ x, y }` pins the LEFT edge, `{ right, y }` pins the RIGHT
// one. The second exists because a clip's stack aligns on its right edge
// (the clip pins it from there) and a card's width is its own business — so
// the browser has to do the subtraction, not us, or the alignment would only
// be right for cards that happened to be CARD_MAX_W wide.
//
// `right` is an x coordinate of the right edge in the desk's own space; CSS
// wants a distance from the surface's right edge, hence DESK_W minus it.
function placeAt(node, at) {
  if (!at) return;
  if (typeof at.right === "number" && isFinite(at.right)) {
    node.style.left = "auto";
    node.style.right = Math.round(D.DESK_W - at.right) + "px";
  } else {
    node.style.right = "auto";
    node.style.left = Math.round(at.x) + "px";
  }
  node.style.top = Math.round(at.y) + "px";
}

// ULIDs are alphanumeric, so this only ever has work to do if an id from
// somewhere else ever isn't — cheap insurance on a selector built from data.
function cssId(v) { return String(v).replace(/["\\]/g, "\\$&"); }

// `at` is where this card DRAWS, which is not always where it is stored: a
// clipped card draws in its clip's stack or grid while keeping its own
// position untouched underneath. `inClip` is null for a loose card, or
// { clip, open, index } for a member.
function card(store, project, ctx, p, weight, state, at, inClip) {
  const it = p.item;
  const clipped = !!inClip;
  const open = clipped && inClip.open;
  // A clipped card can only be expanded while its clip is open — closed, the
  // stack is one object and there is no such thing as "this card" to expand.
  const expanded = state.expanded === it.id && (!clipped || open);
  const overdue = isOverdueEntry(it);
  const picked = !!(state.clipping && state.clipping.picked.indexOf(it.id) >= 0);
  // A card already in a clip can't be picked into a second one — the data
  // shape says at most one clip per desk, so the UI says so too (§12.2).
  const spoken = clipped ? ", in a clip" : "";

  const node = el("div", {
    class: "dcard"
      + (overdue ? " flag" : "")
      + (expanded ? " is-expanded" : "")
      + (clipped ? " is-clipped" : "")
      + (open ? " is-clip-open" : "")
      + (picked ? " is-clip-picked" : ""),
    "data-id": it.id,
    "data-w": String(clipped ? 0 : weight),
    "data-clip": clipped ? inClip.clip.cid : null,
    tabindex: "0",
    "aria-label": `${it.title || "Untitled"}${overdue ? ", overdue" : ""}${spoken}`,
    // A clipped card takes its CLIP's height, so the whole sheaf stays
    // together in the stacking order; DOM order then decides which sheet is
    // on top within it. An EXPANDED card leaves that argument entirely and
    // sits in its own band, so it can never be half-covered by a neighbour it
    // happens to share a z with — which is precisely what open-grid members do.
    style: `z-index:${expanded ? D.Z_EXPANDED : 10 + (clipped ? inClip.clip.z : p.z)};`,
  });
  placeAt(node, at);
  // the wobble: derived, static, never stored (§12.1). Off while expanded, and
  // off while the clip is open — an open clip is for reading, and reading is
  // the one time the handmade angle gets in the way (the same treatment an
  // individually expanded card already gets).
  node.style.setProperty("--rot", (expanded || open ? 0 : p.rot).toFixed(3) + "deg");

  // The header is the drag handle when the card is expanded, and simply the
  // top of the card when it isn't. Marking it rather than the whole card is
  // what lets an open card be both draggable and readable (§14.21).
  const head = el("div", { class: "dcard-drag" }, [
    el("div", { class: "dcard-meta" }, [
      expanded ? el("span", { class: "dcard-grip", "aria-hidden": "true", text: "⠿" }) : null,
      el("span", { class: "dcard-no", text: `№ ${catalogNo(store, it)}` }),
      typeChip(store, it),
    ]),
    el("h3", { class: "dcard-title", text: it.title || "Untitled" }),
  ]);
  node.appendChild(head);
  if (it.body) node.appendChild(el("p", { class: "dcard-body", text: it.body }));

  if (expanded) {
    // Expanded in place (§14.5): the whole entry, where it sits, not a modal.
    const full = el("div", { class: "dcard-full" });
    if (it.body) full.appendChild(el("p", {}, linkify(it.body)));
    if (it.tags.length) full.appendChild(el("div", { class: "item-foot" }, tagChips(it)));
    full.appendChild(el("div", { class: "dcard-acts" }, [
      el("button", {
        class: "btn", text: "Edit entry",
        onclick: (e) => { e.stopPropagation(); openEditor(store, it.id, { onClose: ctx.rerender, sync: ctx.sync }); },
      }),
      el("button", {
        class: "btn", text: "Return to tray",
        title: "Take this card off the desk. It keeps its spot, so putting it back puts it back here.",
        onclick: (e) => {
          e.stopPropagation();
          state.expanded = null;
          store.unplaceFromDesk(it.id, project.id);
          ctx.rerender();
        },
      }),
    ]));
    node.appendChild(full);
  }

  node.appendChild(el("div", { class: "dcard-foot" }, [
    overdue ? el("span", { class: "mk mk-ember", text: "Overdue" }) : statusChip(store, it),
    el("span", { class: "num", text: shortDate(it) }),
  ]));
  return node;
}

// ===================================================================
//  THE PAPERCLIP MARK (§5.4)
// ===================================================================
// The clip's only visible body. It is a bigger render of the same drawing the
// banner button wears, sitting on the corner of the top card, at an angle
// derived from the clip's own id.
//
// It carries no text and never will: "wordless" is enforced by the data shape
// (a clip record has nowhere to put a word), and the "why" behind a grouping
// belongs on a post-it, which is a different object (§5.6).
function clipMark(c, open, at) {
  const n = c.members.length;
  const node = el("div", {
    class: "dclip-mark" + (open ? " is-open" : ""),
    "data-cid": c.cid,
    role: "button",
    tabindex: "0",
    "aria-label": `Clip holding ${n} ${n === 1 ? "card" : "cards"}. `
      + `Double-click to ${open ? "close it" : "open it"}; right-click to unclip.`,
    title: open ? "Double-click to close · right-click to unclip"
                : "Drag to move the whole clip · double-click to open · right-click to unclip",
    style: `z-index:${10 + c.z + 1};`,
    html: CLIP_MARK_SVG,
  });
  placeAt(node, at);
  // The tilt is applied HERE, not in the artwork — see the note in js/icons.js.
  node.style.setProperty("--rot", (open ? 0 : c.rot).toFixed(3) + "deg");
  return node;
}

// ===================================================================
//  A POST-IT (§5.6)
// ===================================================================
// In-view editable text, no title, no status. The editing is the full
// deferred-commit trio the rest of the app already uses, and for the same
// reason it exists everywhere else: a background sync (or a keystroke
// somewhere else in the app) rebuilds this page, which detaches the textarea,
// which fires blur — so blur is NOT proof that the person left the field.
//
//   - nothing is written while you type; the words go to a draft
//   - the draft survives a rebuild, so a mid-word sync can't swallow it
//   - focus and cursor come back afterwards, with preventScroll
//
// `at` is where it draws: its own `pos` when free, or its clip's derived
// anchor when attached. `attachedTo` is the cid or null.
function postIt(store, project, ctx, state, rec, at, attachedTo, clipZ) {
  const drafts = state.noteDrafts;
  const typed = state.noteTyped;
  const nid = rec.nid;
  const fkey = `note:${nid}`;

  const node = el("div", {
    class: "dnote" + (attachedTo ? " is-attached" : ""),
    "data-nid": nid,
    "data-clip": attachedTo || null,
    style: clipZ != null ? `z-index:${10 + clipZ + 2};` : "",
  });
  placeAt(node, at);

  // The grip is the only draggable part, because the rest of the post-it is a
  // text field and both gestures want the same pixels — the same two-surfaces
  // arrangement an expanded card already uses for its header.
  node.appendChild(el("div", {
    class: "dnote-drag",
    "aria-hidden": "true",
    title: attachedTo
      ? "Drag onto open desk to take it off the clip"
      : "Drag onto a clip to attach it",
  }));

  const ta = el("textarea", {
    class: "dnote-text",
    rows: "3",
    placeholder: "A note to yourself",
    "aria-label": "Post-it",
    "data-fkey": fkey,
  });
  ta.value = drafts[nid] !== undefined ? drafts[nid] : (rec.text || "");

  ta.addEventListener("input", () => {
    drafts[nid] = ta.value;                       // survives an unexpected rebuild
    typed[nid] = true;                            // ...and so does "I started this"
    state.noteSel = [ta.selectionStart, ta.selectionEnd];
  });

  // HAD IT ANYTHING TO LOSE? — the fix for "my words vanished" (August 2026).
  //
  // "Emptying a post-it throws it away" was implemented as "it is empty when
  // it loses the cursor, so throw it away", and those are not the same
  // sentence: a post-it you have never typed into is empty BY DEFINITION, from
  // the instant it is made. So anything that took the cursor away before the
  // first keystroke — and on this desk the commonest is pressing on bare desk
  // to nudge the view, i.e. the pointer simply moving — quietly tombstoned it.
  // Renders are held for the life of that gesture, so the scrap stayed on
  // screen looking alive; the words then went into a record that was already
  // dead, and disappeared at the next repaint.
  //
  // The isConnected guard below is still right and stays: it tells a blur
  // caused by a REBUILD from a blur caused by the person leaving. What it
  // could never tell is a post-it that was emptied from one that was never
  // filled. You cannot empty something that was never filled — so that is now
  // the actual test, and `typed` (view-local, like the drafts beside it) is
  // how a rebuild mid-word doesn't forget the answer.
  const hadWords = () => (rec.text || "").trim() !== "" || !!typed[nid];
  const isLive = () => store.notes(project.id).some(n => n.nid === nid);

  const commit = () => {
    const v = ta.value;
    delete drafts[nid];
    if (v !== (rec.text || "")) {
      // BELT AND BRACES for the same class of loss. If this scrap has been
      // thrown away by any route while words were being typed into it, the
      // words win: never-delete means the record is still there to un-tombstone
      // (§12.3), and silently writing into a dead one would be exactly the bug
      // above wearing a different coat.
      if (v.trim() !== "" && !isLive()) store.setNoteField(project.id, nid, "removed", null);
      store.setNoteField(project.id, nid, "text", v);
    }
    if (v.trim() === "" && ta.isConnected && hadWords()) {
      delete typed[nid];
      store.removeNote(project.id, nid);
    }
  };

  // A blank scrap you never wrote on is thrown away by ESCAPE, which is what
  // clicking away used to do by accident. An accidental double-click still
  // costs exactly one keystroke to undo; it just no longer costs a real note
  // the same keystroke by mistake. (Right-click → "Throw this away" and
  // emptying one that had words both still work.)
  const discardIfBlank = () => {
    if (ta.value.trim() !== "" || hadWords()) return false;
    delete drafts[nid];
    delete typed[nid];
    store.removeNote(project.id, nid);
    ctx.rerender();
    return true;
  };

  ta.addEventListener("blur", commit);
  ta.addEventListener("keydown", (e) => {
    // Enter commits, Shift+Enter is a new line. A post-it is a sentence or
    // two, so committing is the common case and gets the plain key.
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); ta.blur(); }
    // Escape here would otherwise bubble to the desk's own handler and start
    // closing surfaces out from under a half-typed note.
    if (e.key === "Escape") { e.stopPropagation(); if (!discardIfBlank()) ta.blur(); }
  });

  node.appendChild(ta);
  return node;
}

// The mirror of the milestone editor's restoreFocus, and deliberately the same
// shape: a rebuild is not the user leaving the field, so whichever post-it had
// the cursor gets it back on the next frame, cursor position included.
function restoreNoteFocus(deskEl, state) {
  const key = state.noteFocus;
  if (!key) return null;
  const sel = state.noteSel;
  return requestAnimationFrame(() => {
    if (!deskEl.isConnected) return;                     // the render pass moved on
    const active = document.activeElement;
    if (active && active !== document.body && !deskEl.contains(active)) return;
    if (active && deskEl.contains(active) && active.getAttribute("data-fkey") === key) return;
    const node = deskEl.querySelector(`[data-fkey="${key.replace(/["\\]/g, "\\$&")}"]`);
    if (!node) { state.noteFocus = null; return; }
    node.focus({ preventScroll: true });
    if (sel && typeof node.setSelectionRange === "function") {
      try { node.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ }
    }
  });
}

// Turn bare URLs in a body into real links. Plain text in, nodes out — the
// body is stored as plain text and stays that way; this is a render-time
// courtesy, not a format. Anything that isn't a link is a text node, so
// selection and copy behave exactly as they would without this.
const URL_RE = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;
function linkify(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(URL_RE)) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    out.push(el("a", {
      href: m[0], target: "_blank", rel: "noopener noreferrer", class: "dcard-link", text: m[0],
    }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

// The same rule a list row uses, and the only ember on the desk.
function isOverdueEntry(it) {
  const due = it.dates && it.dates.due;
  if (!due) return false;
  return new Date(due).getTime() < Date.now();
}

// ===================================================================
//  INTERACTION
// ===================================================================
// Everything here is local until the pointer comes up. One op batch on
// release, and no store write — therefore no re-render — before then.
function wireDesk(runtime, state, dom) {
  const { view, deskEl, drawer } = dom;
  const TAP_SLOP = 5;                        // movement still counted as a click
  const DBL_MS = 420;                        // how long a second click has to arrive
  let drag = null;
  let release = null;                      // set while a gesture holds renders
  let drawerDrag = null;
  let glanceTimer = null;

  const nodeOf = (id) => deskEl.querySelector(`.dcard[data-id="${id}"]`);

  // Every element a clip drags as one: its member cards, its mark, and any
  // post-it attached to it. Collected by selector because the whole cluster is
  // moved with the same local --dx/--dy the single-card drag uses.
  const clipNodes = (cid) => [
    ...deskEl.querySelectorAll(`.dcard[data-clip="${cid}"]`),
    ...deskEl.querySelectorAll(`.dclip-mark[data-cid="${cid}"]`),
    ...deskEl.querySelectorAll(`.dnote[data-clip="${cid}"]`),
  ];

  paintClipHint();

  deskEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("button")) return;                 // real controls win
    const cardNode = e.target.closest(".dcard");
    const markNode = e.target.closest(".dclip-mark");
    const noteNode = e.target.closest(".dnote");

    // ---- SELECT-TO-CLIP: everything else pauses (§5.4) ----
    // The same treatment the list's multi-select gives Kanban drag: while the
    // mode is on, a card is a thing you pick, not a thing you move or open.
    // Panning still works, because otherwise you couldn't reach a card on the
    // far side of the desk without leaving the mode.
    if (state.clipping) {
      if (noteNode) return;                                  // a post-it isn't clippable
      if (cardNode) { togglePick(cardNode); return; }
      drag = { kind: "pan", x0: e.clientX, y0: e.clientY, sl: view.scrollLeft, st: view.scrollTop };
      deskEl.classList.add("is-panning");
      deskEl.setPointerCapture(e.pointerId);
      if (release) release();
      release = runtime.ctx.holdRenders ? runtime.ctx.holdRenders() : null;
      return;
    }

    // ---- A POST-IT ----
    // Two surfaces again: the grip drags, everything else is a text field and
    // is left entirely to the browser.
    if (noteNode) {
      if (!e.target.closest(".dnote-drag")) return;
      const rec = runtime.noteByNid.get(noteNode.dataset.nid);
      if (!rec) return;
      drag = {
        kind: "note", rec, node: noteNode, x0: e.clientX, y0: e.clientY,
        from: noteNode.dataset.clip || null,
      };
      noteNode.classList.add("is-dragging");
      deskEl.setPointerCapture(e.pointerId);
      if (release) release();
      release = runtime.ctx.holdRenders ? runtime.ctx.holdRenders() : null;
      return;
    }

    // ---- A CLIP, CLOSED: the stack is one object ----
    // Grabbing the mark or ANY member card drags the whole cluster. This is
    // the disambiguation the brief asks for, and it works because per-card
    // dragging simply does not exist in the closed state — so a stack drag can
    // never be mistaken for an unclip, and vice versa.
    const cid = markNode ? markNode.dataset.cid
      : (cardNode ? cardNode.dataset.clip : null);
    const clip = cid ? runtime.clipByCid.get(cid) : null;
    // The MARK always drives the whole clip — closed or open, it is the clip's
    // handle. A member CARD only does so while the clip is closed; once it is
    // open, that card is a card again and dragging it out is the unclip
    // gesture. That asymmetry is the disambiguation, stated in one line.
    if (clip && (markNode || state.clipOpen !== clip.cid)) {
      drag = {
        kind: "clip", clip, nodes: clipNodes(clip.cid),
        x0: e.clientX, y0: e.clientY,
        pendingZ: raiseClipLocally(clip),
        // WHERE THE GESTURE STARTED, recorded NOW rather than asked for later.
        // The line below captures the pointer to this surface, which means
        // every later event in the gesture — pointerup included — reports
        // `target` as the desk, not the thing under the cursor. Reading
        // `e.target.closest(".dclip-mark")` on release therefore always said
        // "no", and double-clicking the mark to open a clip silently did
        // nothing. Same class of bug as the D1 glance's pointerleave: the
        // question has to be asked at the moment it is still answerable.
        onMark: !!markNode,
      };
      for (const nd of drag.nodes) nd.classList.add("is-dragging");
      deskEl.setPointerCapture(e.pointerId);
      if (release) release();
      release = runtime.ctx.holdRenders ? runtime.ctx.holdRenders() : null;
      return;
    }

    if (cardNode && state.expanded === cardNode.dataset.id) {
      // An expanded card is TWO surfaces, because two gestures want the same
      // pixels: its header is a handle you can drag it by, and its body is
      // text you can select, copy and click links in. Anything outside the
      // header is left entirely to the browser — no capture, no preventDefault
      // — which is what makes selection and links work at all.
      if (!e.target.closest(".dcard-drag")) return;
      const p = runtime.placedById.get(cardNode.dataset.id);
      drag = p
        ? { kind: "card", p, node: cardNode, x0: e.clientX, y0: e.clientY, pendingZ: null,
            wasExpanded: true, base: basePosOf(cardNode, p), unclip: !!cardNode.dataset.clip }
        : { kind: "tap", id: cardNode.dataset.id, x0: e.clientX, y0: e.clientY };
      if (p) cardNode.classList.add("is-dragging");
    } else if (cardNode) {
      const p = runtime.placedById.get(cardNode.dataset.id);
      if (!p) return;
      // A member of an OPEN clip. Dragging one out of the grid is the only way
      // to unclip a single card, and it is deliberately the only way: the
      // gesture doesn't exist while the clip is closed, so there is nothing to
      // confuse it with (§5.4). A tap is still just a tap — TAP_SLOP is what
      // keeps a twitch from throwing a card out of its clip.
      const inOpenClip = !!cardNode.dataset.clip;
      const pendingZ = inOpenClip ? null : raiseLocally(p, cardNode);
      drag = {
        kind: "card", p, node: cardNode, x0: e.clientX, y0: e.clientY, pendingZ,
        base: basePosOf(cardNode, p), unclip: inOpenClip,
      };
      cardNode.classList.add("is-dragging");
    } else {
      // empty desk pans the view, so nothing can end up unreachable (§14.2)
      drag = { kind: "pan", x0: e.clientX, y0: e.clientY, sl: view.scrollLeft, st: view.scrollTop };
      deskEl.classList.add("is-panning");
    }
    deskEl.setPointerCapture(e.pointerId);
    // Nothing anywhere in the app may redraw until this gesture ends — not a
    // sync pull, not an editor keystroke, not a status change. A refresh still
    // rebuilds the card layer and would destroy the element the pointer captured.
    if (release) release();                // paranoia: never leak a hold
    release = runtime.ctx.holdRenders ? runtime.ctx.holdRenders() : null;
    // NOTE: deliberately no preventDefault — it suppresses the browser's
    // compatibility mouse events and takes double-click with them.
  });

  deskEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (drag.kind === "pan") { view.scrollLeft = drag.sl - dx; view.scrollTop = drag.st - dy; return; }

    // A CLIP moves as one: the same local offset on every piece of it. No
    // store write, exactly as for a single card — the loop of real position
    // ops happens once, on drop (§12.2).
    if (drag.kind === "clip") {
      for (const nd of drag.nodes) {
        nd.style.setProperty("--dx", dx + "px");
        nd.style.setProperty("--dy", dy + "px");
      }
      return;
    }

    if (drag.kind === "note") {
      drag.node.style.setProperty("--dx", dx + "px");
      drag.node.style.setProperty("--dy", dy + "px");
      // Light up the clip the post-it would land on, so "drop decides
      // attachment" (§5.5, applied to notes per §5.6) is visible before you
      // commit to it rather than only afterwards.
      const target = clipAtPoint(e, drag.node);
      for (const m of deskEl.querySelectorAll(".dclip-mark")) m.classList.remove("is-drop-target");
      if (target) {
        const m = deskEl.querySelector(`.dclip-mark[data-cid="${target}"]`);
        if (m) m.classList.add("is-drop-target");
      }
      return;
    }

    if (drag.kind !== "card") return;
    drag.node.style.setProperty("--dx", dx + "px");
    drag.node.style.setProperty("--dy", dy + "px");
    // dragging a card over the Unplaced handle takes it off the desk
    const over = overUnplacedHandle(e);
    for (const [, h] of drawer.handleEls) h.classList.remove("is-drop-target");
    if (over) drawer.handleEls.get("unplaced").classList.add("is-drop-target");
  });

  // Every exit from a gesture releases the hold, including the ones that
  // aren't a drop: the pointer being cancelled by the OS, or the window losing
  // focus mid-drag. A leaked hold would freeze the whole app's rendering.
  const endGesture = () => { if (release) { release(); release = null; } };
  deskEl.addEventListener("pointercancel", () => {
    if (drag && drag.node) drag.node.classList.remove("is-dragging");
    if (drag && drag.nodes) for (const nd of drag.nodes) {
      nd.classList.remove("is-dragging");
      nd.style.removeProperty("--dx"); nd.style.removeProperty("--dy");
    }
    drag = null;
    deskEl.classList.remove("is-panning");
    endGesture();
  });
  window.addEventListener("blur", endGesture);

  deskEl.addEventListener("pointerup", (e) => {
    if (!drag) { endGesture(); return; }
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    const moved = Math.hypot(dx, dy) > TAP_SLOP;
    const kind = drag.kind, d = drag;
    drag = null;
    // Released BEFORE the writes below, so the render they queue is the one
    // that draws the finished drop — rather than being swallowed and replayed.
    endGesture();

    if (kind === "pan") {
      deskEl.classList.remove("is-panning");
      // A DOUBLE-CLICK ON BARE DESK MAKES A POST-IT (§5.6). It reuses the same
      // tap memory the cards use, under a reserved id, so a click on a card
      // and a click on the desk can't be mistaken for one double-click.
      if (!moved && !state.clipping && isSecondTap("\0desk")) newPostIt(e);
      return;
    }

    if (kind === "clip") {
      for (const nd of d.nodes) nd.classList.remove("is-dragging");
      if (!moved) {
        // Double-click on the MARK opens or closes the clip; anywhere else on
        // the stack, a plain tap raises the whole thing. Open/closed is
        // transient per-device UI state — no op, no field, nothing synced.
        if (isSecondTap("clip:" + d.clip.cid) && d.onMark) {
          state.clipOpen = state.clipOpen === d.clip.cid ? null : d.clip.cid;
          state.expanded = null;                 // a card expanded inside it comes back down
          for (const nd of d.nodes) { nd.style.removeProperty("--dx"); nd.style.removeProperty("--dy"); }
          runtime.ctx.rerender();
          return;
        }
        for (const nd of d.nodes) { nd.style.removeProperty("--dx"); nd.style.removeProperty("--dy"); }
        // tap-to-raise, extended to every member (§8.9)
        if (d.pendingZ) { commitClipRaise(d.clip, d.pendingZ); runtime.ctx.rerender(); }
        return;
      }
      // A DROP. One ordinary position op per member — the bulk-edit rule, and
      // deliberately nothing else: relative offsets are preserved because
      // every member gets the SAME delta, and the clip's own geometry is
      // derived from them, so it has already moved too (§12.2).
      const cw = d.nodes[0] ? d.nodes[0].offsetWidth : D.CARD_MAX_W;
      const ch = d.nodes[0] ? d.nodes[0].offsetHeight : 160;
      // ONE delta for everybody, clamped to the tightest edge any member is
      // near. Clamping each member separately would let the card nearest the
      // edge stop while the rest kept going — the stack would fan out against
      // the boundary and never come back, which is precisely the arrangement a
      // clip exists to hold. The clip hits the edge as one object instead.
      const k = D.clampDelta(d.clip.members.map(m => m.pos), dx, dy, cw, ch);
      for (const m of d.clip.members) {
        runtime.store.setDeskField(m.id, runtime.project.id, "pos", { x: m.pos.x + k.dx, y: m.pos.y + k.dy });
      }
      if (d.pendingZ) commitClipRaise(d.clip, d.pendingZ);
      runtime.ctx.rerender();
      return;
    }

    if (kind === "note") {
      d.node.classList.remove("is-dragging");
      for (const m of deskEl.querySelectorAll(".dclip-mark")) m.classList.remove("is-drop-target");
      if (!moved) { d.node.style.removeProperty("--dx"); d.node.style.removeProperty("--dy"); return; }
      // THE DROP DECIDES (§5.5 language, §5.6 object). Landing on a clip
      // attaches; landing on open desk detaches and gives it a real position.
      //
      // WHERE it landed is now recorded either way — that is the August 2026
      // change. An attached post-it used to be drawn at a spot the code chose
      // (hanging off the mark, on top of it), which made it the one thing on
      // this desk where putting it somewhere wasn't the decision. It carries an
      // `offset` from its clip's anchor now, exactly as a wonder symbol carries
      // one from its host card, and `pos` goes back to meaning only "where it
      // sits while it is free".
      const base = basePosOf(d.node, { pos: d.rec.pos || { x: 0, y: 0 } });
      const pos = D.clampPos({ x: base.x + dx, y: base.y + dy }, D.NOTE_W, D.NOTE_H);
      // Staying inside the clip you are already on counts as staying on it,
      // even over bare desk between its cards — "drag it around within the
      // clip's bounds" has to mean the bounds, not just the paper.
      const onto = clipAtPoint(e, d.node)
        || (d.from && withinClipBounds(e, d.from) ? d.from : null);
      if (onto) {
        const anchor = anchorOf(onto);
        if (onto !== d.from) runtime.store.setNoteField(runtime.project.id, d.rec.nid, "clip", onto);
        runtime.store.setNoteField(runtime.project.id, d.rec.nid, "offset", D.noteOffset(anchor, pos));
        runtime.ctx.rerender();
        return;
      }
      if (d.from) {
        // Coming off a clip drops the offset and picks up a real position from
        // the drop point — the attach/detach mirror symbols already use.
        runtime.store.setNoteField(runtime.project.id, d.rec.nid, "clip", null);
        runtime.store.setNoteField(runtime.project.id, d.rec.nid, "offset", null);
      }
      runtime.store.setNoteField(runtime.project.id, d.rec.nid, "pos", pos);
      runtime.ctx.rerender();
      return;
    }

    if (kind === "tap" || (kind === "card" && !moved)) {
      const id = kind === "tap" ? d.id : d.p.id;
      if (kind === "card") d.node.classList.remove("is-dragging");
      const second = isSecondTap(id);
      if (second) {                                        // double-click expands / collapses
        state.expanded = state.expanded === id ? null : id;
        runtime.ctx.rerender();
      } else if (kind === "card") {
        d.node.style.removeProperty("--dx");
        d.node.style.removeProperty("--dy");
        // a plain tap: commit the raise, if it actually changed anything
        if (d.pendingZ != null) {
          runtime.store.setDeskField(d.p.id, runtime.project.id, "z", d.pendingZ);
          runtime.ctx.rerender();
        }
      }
      return;
    }

    // A DROP. One position write, now, for this one card (§8.34).
    for (const [, h] of drawer.handleEls) h.classList.remove("is-drop-target");
    if (overUnplacedHandle(e)) {
      runtime.store.unplaceFromDesk(d.p.id, runtime.project.id);
      runtime.ctx.rerender();
      return;
    }
    // The base is where the card was DRAWING, not where it was stored — the
    // two differ for a member of an open clip, which draws in the grid. Using
    // the stored position there would make the card jump the moment you
    // grabbed it.
    const pos = D.clampPos(
      { x: d.base.x + dx, y: d.base.y + dy },
      d.node.offsetWidth, d.node.offsetHeight);
    // all the writes for this card, together, on release — never before
    if (d.pendingZ != null) runtime.store.setDeskField(d.p.id, runtime.project.id, "z", d.pendingZ);
    // Dragging a card out of an open clip unclips it, in the same batch as the
    // position it lands at (§5.4). Nobody else has to be repositioned: the
    // remaining members are still wherever the last cluster drag left them.
    if (d.unclip) runtime.store.setDeskField(d.p.id, runtime.project.id, "clip", null);
    runtime.store.setDeskField(d.p.id, runtime.project.id, "pos", pos);
    runtime.ctx.rerender();
  });

  // ===================================================================
  //  D2 HELPERS
  // ===================================================================

  // The shared double-click memory. It lives on `state` rather than in this
  // closure because the first click often causes a rebuild (it commits a
  // raise) and the closure dies with it — the D1 bug, kept fixed.
  function isSecondTap(id) {
    const now = Date.now();
    const second = state.lastTapId === id && (now - state.lastTapAt) < DBL_MS;
    state.lastTapId = second ? null : id;      // a third click starts over
    state.lastTapAt = now;
    return second;
  }

  // Where a node is currently DRAWING, in desk coordinates. Read off the
  // element because that is the one place the answer is true for every case —
  // a loose card (its stored pos), a member of an open clip (a measured grid
  // slot), an attached post-it (its own offset from the clip).
  //
  // `style.left` is "auto" for anything pinned by its RIGHT edge (a member of
  // a closed stack), so offsetLeft/offsetTop is the second question: it is the
  // browser's own answer and is true whichever way the element was positioned.
  function basePosOf(node, fallback) {
    const x = parseFloat(node.style.left), y = parseFloat(node.style.top);
    if (isFinite(x) && isFinite(y)) return { x, y };
    if (isFinite(node.offsetLeft) && isFinite(node.offsetTop)) {
      return { x: node.offsetLeft, y: node.offsetTop };
    }
    return { x: (fallback.pos || fallback).x || 0, y: (fallback.pos || fallback).y || 0 };
  }

  // The point a clip's post-it offsets are measured from. surface() keeps this
  // map and the measured relayout rewrites it, so there is exactly one answer
  // and the drop logic never has to recompute a layout it can just read.
  function anchorOf(cid) {
    const a = dom.anchors && dom.anchors.get(cid);
    if (a) return a;
    const c = runtime.clipByCid.get(cid);
    return (c && c.anchor) || { x: 0, y: 0 };
  }

  // The whole clip's box on screen — every member, plus the mark. Used for one
  // question only: is a post-it still on the clip it was already on?
  function withinClipBounds(e, cid, pad = 24) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    const nodes = [
      ...deskEl.querySelectorAll(`.dcard[data-clip="${cssId(cid)}"]`),
      ...deskEl.querySelectorAll(`.dclip-mark[data-cid="${cssId(cid)}"]`),
    ];
    for (const n of nodes) {
      const q = n.getBoundingClientRect();
      if (!q || (!q.width && !q.height)) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top);
      r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    if (!isFinite(l)) return false;
    return e.clientX >= l - pad && e.clientX <= r + pad
        && e.clientY >= t - pad && e.clientY <= b + pad;
  }

  // Which clip, if any, is under the pointer. Rect maths rather than
  // elementFromPoint, matching overUnplacedHandle above: the dragged node is
  // itself under the cursor, and this way there is nothing to hide first.
  //
  // The mark and the stack's cards both count as the clip. A closed stack is
  // the natural target (it is one object and it is what you can see); an open
  // clip accepts a drop too, because refusing it would be a rule to remember
  // rather than a thing that just works.
  function clipAtPoint(e, exclude) {
    const hit = (n) => {
      if (!n || n === exclude || (exclude && exclude.contains(n))) return false;
      const r = n.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) return false;
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    for (const m of deskEl.querySelectorAll(".dclip-mark")) if (hit(m)) return m.dataset.cid;
    for (const c of deskEl.querySelectorAll(".dcard[data-clip]")) if (hit(c)) return c.dataset.clip;
    return null;
  }

  // Raise the whole sheaf, VISUALLY, with no store write — the single-card
  // rule (§8.34) applied to a cluster. The commit happens on release.
  function raiseClipLocally(clip) {
    if (clip.z >= runtime.data.maxZ) return null;                   // already on top
    let z = runtime.data.maxZ;
    const out = [];
    for (const m of clip.members) out.push({ id: m.id, z: ++z });
    // An expanded member keeps its own band — raising the sheaf must not pull
    // the card being read back down among its neighbours.
    for (const nd of clipNodes(clip.cid)) {
      if (nd.classList.contains("is-expanded")) continue;
      nd.style.zIndex = String(10 + z + 1);
    }
    return out;
  }
  // One z op per member, in member order, so their relative arrangement inside
  // the stack survives being raised.
  function commitClipRaise(clip, pending) {
    for (const { id, z } of pending) runtime.store.setDeskField(id, runtime.project.id, "z", z);
  }

  // ---- select-to-clip ----
  function togglePick(node) {
    const id = node.dataset.id;
    const p = runtime.placedById.get(id);
    if (!p) return;
    if (runtime.clipOfCard.has(id)) { toast("That card is already in a clip.", "info", 2600); return; }
    const picked = state.clipping.picked;
    const i = picked.indexOf(id);
    if (i >= 0) { picked.splice(i, 1); node.classList.remove("is-clip-picked"); }
    else { picked.push(id); node.classList.add("is-clip-picked"); }
    paintClipHint();
  }

  function paintClipHint() {
    const hint = dom.clipHint;
    if (!hint || !state.clipping) return;
    const n = state.clipping.picked.length;
    hint.textContent = n === 0
      ? "Click the cards you want held together, then press the clip again."
      : n === 1
        ? "One picked — a clip needs at least two. Press the clip again to stop."
        : `${n} picked. Press the clip again to hold them together.`;
  }

  // ---- a new post-it on bare desk ----
  function newPostIt(e) {
    const r = view.getBoundingClientRect();
    // surface coordinates, so the current pan is added back in — the same sum
    // the drawer's drag-out already does
    const pos = D.clampPos({
      x: e.clientX - r.left + view.scrollLeft - D.NOTE_W / 2,
      y: e.clientY - r.top + view.scrollTop - 20,
    }, D.NOTE_W, D.NOTE_H);
    const nid = runtime.store.addNote(runtime.project.id, { pos });
    state.noteFocus = `note:${nid}`;             // land with the cursor in it
    state.noteSel = null;
    runtime.ctx.rerender();
  }

  // ---- right-click: unclip, or throw a post-it away (§5.4) ----
  // Desktop only, and honestly so: the desk itself is behind a `pointer: fine`
  // gate, so there is no device that can reach a clip and cannot right-click.
  deskEl.addEventListener("contextmenu", (e) => {
    const mark = e.target.closest(".dclip-mark");
    const note = e.target.closest(".dnote");
    if (!mark && !note) return;
    e.preventDefault();
    if (mark) {
      const clip = runtime.clipByCid.get(mark.dataset.cid);
      if (!clip) return;
      deskMenu(e, [{
        label: "Unclip",
        run: () => {
          // Both floors, in one batch: the clip record is tombstoned and every
          // member's membership is cleared. No CARD is repositioned — they are
          // already sitting wherever the last cluster drag left them (§12.2).
          for (const m of clip.members) runtime.store.setDeskField(m.id, runtime.project.id, "clip", null);
          // A post-it is the one thing that does need a position handed to it,
          // because its offset was only ever meaningful against the clip that
          // is now gone. This is the same detach it would get by being dragged
          // off — offset out, a real pos in, taken from where it is sitting at
          // this moment, so nothing appears to move when the clip does.
          const anchor = anchorOf(clip.cid);
          // `clip` is cleared here for the same reason it is on every member
          // card: this one action ends the relationship, and a note left
          // pointing at a tombstoned clip is exactly the drift the "membership
          // lives on the thing that belongs" rule exists to prevent. (A note
          // whose clip vanished some OTHER way — a device that hasn't received
          // the clip yet — is still just quietly treated as free by deskData,
          // and still never repaired by a write. That rule is unchanged.)
          for (const nt of clip.notes) {
            runtime.store.setNoteField(runtime.project.id, nt.nid, "pos",
              D.clampPos(D.noteAt(anchor, nt.offset), D.NOTE_W, D.NOTE_H));
            runtime.store.setNoteField(runtime.project.id, nt.nid, "offset", null);
            runtime.store.setNoteField(runtime.project.id, nt.nid, "clip", null);
          }
          runtime.store.removeClip(runtime.project.id, clip.cid);
          if (state.clipOpen === clip.cid) state.clipOpen = null;
          runtime.ctx.rerender();
        },
      }]);
      return;
    }
    const rec = runtime.noteByNid.get(note.dataset.nid);
    if (!rec) return;
    deskMenu(e, [{
      label: "Throw this away",
      run: () => {
        delete state.noteDrafts[rec.nid];
        delete state.noteTyped[rec.nid];
        runtime.store.removeNote(runtime.project.id, rec.nid);
        runtime.ctx.rerender();
      },
    }]);
  });

  // Touching a card brings it to the top (§8.9) — VISUALLY, right now, with no
  // store write. The write happens on release, batched with the position.
  //
  // This was the whole family of drag bugs on the first deploy. Writing the
  // raise on pointerdown emitted a store change, which re-rendered the desk,
  // which destroyed the very card element the pointer had just captured. So:
  // the first click on a card did nothing but rebuild it (and had to be
  // repeated), drags didn't register, drops landed on a stale node and snapped
  // back, and the whole thing felt laggy and flickered. One rule, broken in
  // one place: NOTHING may write to the store between pointerdown and
  // pointerup (§8.34).
  function raiseLocally(p, node) {
    if (p.z >= runtime.data.maxZ) return null;             // already on top: nothing to do
    const z = runtime.data.maxZ + 1;
    node.style.zIndex = String(10 + z);
    return z;                                      // caller commits this on drop
  }

  function overUnplacedHandle(e) {
    const h = drawer.handleEls.get("unplaced");
    if (!h) return false;
    const r = h.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  // ---- drag a row out of the Unplaced drawer onto the desk ----
  const cancelDrawerDrag = () => {
    if (!drawerDrag) return;
    const d = drawerDrag;
    drawerDrag = null;
    window.removeEventListener("pointermove", d.move);
    window.removeEventListener("pointerup", d.up);
    window.removeEventListener("pointercancel", d.up);
    d.ghost.remove();
    if (d.release) d.release();
  };
  drawer.body.addEventListener("pointerdown", (e) => {
    const row = e.target.closest(".desk-unplaced-row");
    if (!row) return;
    cancelDrawerDrag();
    const ghost = row.cloneNode(true);
    ghost.classList.add("desk-ghost");
    document.body.appendChild(ghost);
    const releaseGhost = runtime.ctx.holdRenders ? runtime.ctx.holdRenders() : null;
    const move = (ev) => { ghost.style.left = (ev.clientX - 40) + "px"; ghost.style.top = (ev.clientY - 18) + "px"; };
    const up = (ev) => {
      const rowId = row.dataset.id;
      cancelDrawerDrag();
      const r = view.getBoundingClientRect();
      const inside = ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom;
      if (!inside) return;
      const pos = D.clampPos({
        x: ev.clientX - r.left + view.scrollLeft - D.ORIGIN - D.CARD_MIN_W / 2,
        y: ev.clientY - r.top + view.scrollTop - D.ORIGIN - 24,
      });
      runtime.store.placeOnDesk(rowId, runtime.project.id, pos, runtime.data.maxZ + 1);
      drawer.setDrawer(null);
      runtime.ctx.rerender();
    };
    drawerDrag = { ghost, release: releaseGhost, move, up };
    move(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    e.preventDefault();
  });

  // ---- click away closes an open drawer, and that click does nothing else ----
  const onDocDown = (e) => {
    if (!state.drawer) return;
    if (e.target.closest(".desk-drawer") || e.target.closest(".desk-handle")) return;
    drawer.setDrawer(null);
    if (view.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
  };
  document.addEventListener("pointerdown", onDocDown, true);

  // ---- glance: hold, and the whole desk fits (§14.3) ----
  let glance = null;
  const guard = dom.guard;
  const glanceOn = () => {
    if (glance) return;
    const boxes = [...deskEl.querySelectorAll(".dcard")].map(n => ({
      x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight,
    }));
    const f = D.glanceFrame(D.contentBounds(boxes), view.clientWidth, view.clientHeight);
    // The scroll offset is folded INTO the transform rather than reset: the
    // viewport is looking at surface coordinate (scrollLeft, scrollTop), so
    // adding it back is what puts the content in the middle of what you can
    // actually see. Nothing about the scroll position changes.
    const tx = f.tx + view.scrollLeft;
    const ty = f.ty + view.scrollTop;
    glance = true;
    view.classList.add("is-glancing");
    deskEl.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${f.k.toFixed(4)})`;
  };

  // Letting go is now just: take the transform off. The scroll position was
  // never moved, so there is nothing to put back. `is-glancing` (which turns
  // off pointer events, so you can't grab a card that is still flying) comes
  // off once the transform has finished animating — and if that timer is late
  // or early it costs nothing but a few milliseconds of not being able to
  // grab something.
  const glanceOff = () => {
    if (!glance) return;
    glance = null;
    deskEl.style.transform = "";
    const ms = motionMs(GLANCE_MS);
    if (glanceTimer != null) { window.clearTimeout(glanceTimer); glanceTimer = null; }
    if (ms <= 0) { view.classList.remove("is-glancing"); return; }
    glanceTimer = window.setTimeout(() => {
      glanceTimer = null;
      if (!glance) view.classList.remove("is-glancing");
    }, ms);
  };
  // Passed in, not looked up: wireDesk runs while the surface is still
  // detached from the page, so closest(".desk-page") was null and the banner's
  // ✧ silently got no listener — only the Z key worked.
  //
  // A hold is "the button is still down", NOT "the cursor is still over the
  // icon". `pointerleave` answers the second question: it fires the instant the
  // cursor's coordinates cross the edge of the box, with the mouse button's
  // state playing no part in it. On a mouse the ✧ is only --control-min wide
  // (28px, not the 44px touch floor), so an ordinary amount of hand drift while
  // still holding was enough to fire it — the desk zoomed out and snapped
  // straight back mid-gesture. Confirmed in a real browser: `pointerleave`
  // arrives with `buttons: 1`.
  //
  // So the release signals are now the ones that actually mean "let go": a real
  // `pointerup`, the OS taking the gesture away (`pointercancel`), or the
  // window losing focus. Capturing the pointer on the way down routes the rest
  // of the gesture to this element wherever the cursor wanders, so the real
  // `pointerup` lands here even if the release happens far off the icon — the
  // same shape as the drag/pan code above, which never depended on the cursor
  // staying over one element either.
  const glanceBtn = dom.glanceBtn;
  // Belt and braces for the release, because a hold that never ends is a worse
  // bug than the one being fixed: pointer capture is feature-detected (a
  // pointerId can be gone by the time we ask, and headless test doubles have no
  // capture API at all), so the window also listens for the duration of one
  // hold. Whichever arrives first ends it; the second is a no-op.
  const endGlanceHold = () => {
    window.removeEventListener("pointerup", endGlanceHold);
    window.removeEventListener("pointercancel", endGlanceHold);
    glanceOff();
  };
  if (glanceBtn) {
    glanceBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { glanceBtn.setPointerCapture?.(e.pointerId); } catch { /* no capture: the window listeners still end it */ }
      window.addEventListener("pointerup", endGlanceHold);
      window.addEventListener("pointercancel", endGlanceHold);
      glanceOn();
    });
    for (const ev of ["pointerup", "pointercancel", "blur"]) glanceBtn.addEventListener(ev, endGlanceHold);
  }
  // ---- a selection that starts in an expanded card stays in it ----
  //
  // The desk is not text (§14.25): `user-select: none` on the viewport is what
  // stops a press on bare desk sweeping a selection backwards into the banner.
  // An expanded card puts `user-select: text` back on itself, because its body
  // is meant to be read and copied — and that reopened the same door by the
  // side entrance. Drag upward out of the card and the browser, finding no
  // selectable text between there and the top of the page, extends the
  // selection to the nearest text it CAN reach, which is the banner above.
  //
  // There is no CSS for this that Chrome and Safari both honour today
  // (`user-select: contain` is Firefox-only), so the range is clamped as it
  // moves. Setting the selection fires this again; the second pass sees both
  // ends inside the card and does nothing, so it cannot loop.
  const onSelectionChange = () => {
    if (!state.expanded) return;
    const card2 = deskEl.querySelector(".dcard.is-expanded");
    if (!card2 || !card2.isConnected) return;
    let sel;
    try { sel = document.getSelection(); } catch { return; }
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const aIn = !!(sel.anchorNode && card2.contains(sel.anchorNode));
    const fIn = !!(sel.focusNode && card2.contains(sel.focusNode));
    // Wholly inside, or nothing to do with us. This one line is also what
    // keeps a post-it's own text selection out of here: a post-it is never
    // inside a card, so neither end is ever in one.
    if (aIn === fIn) return;
    try {
      const inside = document.createRange();
      inside.selectNodeContents(card2);
      const r = sel.getRangeAt(0).cloneRange();
      const R = window.Range;
      if (r.compareBoundaryPoints(R.START_TO_START, inside) < 0) r.setStart(inside.startContainer, inside.startOffset);
      if (r.compareBoundaryPoints(R.END_TO_END, inside) > 0) r.setEnd(inside.endContainer, inside.endOffset);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch { /* a range the browser won't let us rebuild: leave it alone */ }
  };
  document.addEventListener("selectionchange", onSelectionChange);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      // TOPMOST SURFACE ONLY, ONE PER PRESS. The D2 additions slot into the
      // existing ladder rather than beside it — read top to bottom, this is
      // "the thing most recently put in front of you comes off first":
      //   a little menu → a mode → an expanded card → an open clip → a drawer.
      if (closeDeskMenu()) return;
      if (state.clipping) { state.clipping = null; runtime.ctx.rerender(); return; }
      if (state.expanded) { state.expanded = null; runtime.ctx.rerender(); return; }
      if (state.clipOpen) { state.clipOpen = null; runtime.ctx.rerender(); return; }
      if (state.drawer) { drawer.setDrawer(null); return; }
      return;
    }
    if ((e.key === "z" || e.key === "Z") && !e.repeat && !isTyping(e.target)) glanceOn();
  };
  const onKeyUp = (e) => { if (e.key === "z" || e.key === "Z") glanceOff(); };
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", glanceOff);

  // Global listeners live for exactly one Desk controller lifetime. The Desk
  // shell no longer dies on a store write, so cleanup is explicit rather than
  // inferred from every redraw.
  return {
    paintClipHint,
    destroy() {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("blur", glanceOff);
      window.removeEventListener("pointerup", endGlanceHold);
      window.removeEventListener("pointercancel", endGlanceHold);
      window.removeEventListener("blur", endGesture);
      cancelDrawerDrag();
      if (drag && drag.node) drag.node.classList.remove("is-dragging");
      if (drag && drag.nodes) for (const nd of drag.nodes) {
        nd.classList.remove("is-dragging");
        nd.style.removeProperty("--dx"); nd.style.removeProperty("--dy");
      }
      drag = null;
      deskEl.classList.remove("is-panning");
      endGesture();
      endGlanceHold();
      if (glanceTimer != null) window.clearTimeout(glanceTimer);
      glanceTimer = null;
      view.classList.remove("is-glancing");
      closeDeskMenu();
    },
  };
}

function isTyping(el2) {
  return el2 && /^(INPUT|TEXTAREA|SELECT)$/.test(el2.tagName);
}

// ===================================================================
//  THE LITTLE MENU (§5.4 — unclip; and throwing a post-it away)
// ===================================================================
// Deliberately not a modal, not a dialog, and not a new pattern: a few real
// buttons in a box at the pointer, at full control height, that close on the
// next click anywhere, on Escape, or when the desk under them is rebuilt.
//
// Exactly one can exist at a time. It is parked on document.body rather than
// inside the desk so it isn't clipped by the viewport's overflow or dragged
// away by a pan mid-decision.
let openMenu = null;
let openMenuAway = null;
let openMenuTimer = null;

function closeDeskMenu() {
  if (openMenuTimer != null) { window.clearTimeout(openMenuTimer); openMenuTimer = null; }
  if (openMenuAway) {
    document.removeEventListener("pointerdown", openMenuAway, true);
    openMenuAway = null;
  }
  if (!openMenu) return false;
  openMenu.remove();
  openMenu = null;
  return true;
}

function deskMenu(e, entries) {
  closeDeskMenu();
  const box = el("div", { class: "desk-menu", role: "menu" });
  for (const entry of entries) {
    box.appendChild(el("button", {
      class: "desk-menu-item", role: "menuitem", text: entry.label,
      onclick: (ev) => { ev.stopPropagation(); closeDeskMenu(); entry.run(); },
    }));
  }
  box.style.left = "0px"; box.style.top = "0px";
  document.body.appendChild(box);
  const w = box.offsetWidth || 180, h = box.offsetHeight || 48;
  box.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - w - 4)) + "px";
  box.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - h - 4)) + "px";
  openMenu = box;

  openMenuTimer = window.setTimeout(() => {
    openMenuTimer = null;
    openMenuAway = (ev) => {
      if (openMenu && openMenu.contains(ev.target)) return;
      closeDeskMenu();
    };
    document.addEventListener("pointerdown", openMenuAway, true);
  }, 0);
  const first = box.querySelector("button");
  if (first) first.focus({ preventScroll: true });
  return box;
}
// Locked in D0 round 2/3, and the same numbers as --desk-drawer-ms and
// --desk-glance-ms in app.css. Zero when the system asks for reduced motion —
// the JS has to agree with the CSS about that, or a timer waits for an
// animation that was never going to run.
const DRAWER_MS = 380;
const GLANCE_MS = 380;
function motionMs(ms = DRAWER_MS) {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  } catch { /* no matchMedia: assume motion is fine */ }
  return ms;
}

// ===================================================================
//  THE PHONE'S PEEK PAGE (§7)
// ===================================================================
// No desk, and therefore no Unplaced shelf — there is nothing to be unplaced
// FROM. Milestones stay a section rather than a drawer. Everything a card
// carries on the desk is reachable here at full text size, which is what
// makes the desk's pointer-only arrangement an honest trade (§12.6).
function peekPage(store, project, ctx, data) {
  const wrap = el("div", { class: "peek-page" });

  wrap.appendChild(el("div", { class: "desk-shelf-head" }, [
    el("span", { class: "plate-title", text: "Milestones" }),
    el("span", { class: "group-count num", text: milestoneCount(project) }),
  ]));
  wrap.appendChild(renderMilestoneEditor(store, project, ctx));

  wrap.appendChild(el("div", { class: "desk-shelf-head" }, [
    el("span", { class: "plate-title", text: "Filed" }),
    el("span", { class: "group-count", text: String(data.members.length) }),
  ]));
  if (data.members.length === 0) {
    wrap.appendChild(emptyState(
      "Nothing in this project yet",
      "Add a task, note, or file — this page gathers everything assigned to this project.",
      null, null));
  } else {
    for (const it of data.members) {
      wrap.appendChild(itemRow(store, it, ctx.onOpen, { selection: ctx.selection, statusControl: true }));
    }
  }
  return wrap;
}
