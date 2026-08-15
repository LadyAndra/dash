// views/desk.js — the project's desk, and the Peek drawers beside it.
// ===================================================================
// Phase D1 of docs/dash-desk-addendum.md. This module owns the whole project
// page body: the banner, the three Peek drawers hanging off it, and the desk
// surface itself. views/project.js keeps the picker and delegates to here.
//
// What is NOT here, on purpose: clips (D2), post-its (D2), wonder symbols
// (D3), highlights (D4). The data model already has room for all of them
// (desk addendum §12.2–§12.4) and `deskData` already carries `clip` through;
// nothing in this file needs rewriting to add them.
//
// The rules this file must keep, all of which have bitten already:
//
//   - ONE archive pass per render. deskData() is the only thing that walks
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
export function renderProjectPage(store, project, ctx, actions) {
  // THE one archive pass. Everything below reads this result.
  const data = D.deskData(store.all(), project.id, PROJECT_LINK);
  const stage = stageOf(project);
  const prog = milestoneProgress(project);

  const page = el("div", {
    class: "desk-page",
    style: groundStyle(store, project),            // --ground-bg / --ground-ink for the whole page
  });

  page.appendChild(banner(store, project, stage, prog, data, actions));

  if (!supportsDesk()) {
    // Phone (and today's iPad): no desk, no unplaced shelf — there is nothing
    // to be unplaced FROM. Peek content directly, full width (§7).
    page.appendChild(peekPage(store, project, ctx, data));
    return page;
  }

  const state = deskState(ctx);
  const drawer = drawers(store, project, ctx, data, state);
  const glanceBtn = page.querySelector(".banner-glance");
  // NOTE: the drawer body is NOT appended here. It already lives inside
  // drawer.handles, which is `position: relative` and therefore the thing its
  // `top: 100%` resolves against. Appending it to the page as a sibling moved
  // it out of that containing block, so it opened a full viewport height down
  // — off screen, looking exactly like "the drawers don't open". A layout bug,
  // which is why the jsdom render test sailed past it: jsdom has no layout.
  page.appendChild(drawer.handles);
  page.appendChild(surface(store, project, ctx, data, state, drawer, glanceBtn));
  return page;
}

// Desk UI state lives in ctx.viewLocal so it survives the full re-render that
// every store write triggers. It is chrome, not content: which drawer is open
// and where you have scrolled are not facts about the project (§8.19 — the
// ARRANGEMENT syncs; the furniture around it does not).
function deskState(ctx) {
  const v = ctx.viewLocal;
  // scrollX/Y start as null meaning "never looked at this desk" — the first
  // render then centres the view on the middle of the surface, which is where
  // the mat's eye is. Zero would have meant the top-left corner of a
  // 4400 x 2900 sheet, which is a corner of an empty room.
  if (!v.desk) v.desk = { drawer: null, scrollX: null, scrollY: null, expanded: null };
  return v.desk;
}

// ===================================================================
//  THE BANNER — ledger band (§14.14, §14.17, locked candidate A)
// ===================================================================
// Same content the tall banner carried; a third of the height. The name owns
// the top line whatever its length, and the facts collapse into one thin
// ruled line beneath it, closer to texture than to data you read.
function banner(store, project, stage, prog, data, actions) {
  const facts = el("div", { class: "pb-line" });
  const fact = (text, cls) => el("span", { class: "lbl" + (cls ? " " + cls : ""), text });

  facts.appendChild(fact(`№ ${catalogNo(store, project)}`));
  // stage and its fraction are ONE fact, so they share a cell — no rule
  // between them (§14.19)
  const stageCell = el("span", { class: "lbl pb-f-stage" }, [
    document.createTextNode(stage ? (stage.complete ? "Complete" : stage.label) : "No milestones yet"),
  ]);
  if (prog.total) {
    stageCell.appendChild(document.createTextNode(" "));
    stageCell.appendChild(el("span", {
      class: "num pb-f-count",
      text: `${String(prog.done).padStart(2, "0")} / ${String(prog.total).padStart(2, "0")}`,
    }));
  }
  facts.appendChild(stageCell);
  facts.appendChild(fact(`${data.members.length} ${data.members.length === 1 ? "entry" : "entries"}`));

  const next = stage && !stage.complete ? stage : null;
  if (next) {
    const cell = el("span", { class: "lbl" }, [
      document.createTextNode("Next — "),
      el("span", { class: "pb-f-strong", text: next.label }),
    ]);
    if (next.date) {
      cell.appendChild(document.createTextNode(" "));
      cell.appendChild(el("span", { class: "num", text: formatDay(next.date) }));
    }
    facts.appendChild(cell);
  }
  // the one ember on the banner, unchanged from the block it replaces
  if (stage && stage.overdue) facts.appendChild(fact("Overdue", "banner-late"));

  return el("div", { class: "pb pb-a on-ground" }, [
    el("div", { class: "pb-head" }, [
      el("h2", { class: "pb-name", text: project.title || "Untitled" }),
      el("div", { class: "pb-acts" }, [
        el("button", { class: "btn btn-primary", text: "＋ Entry", onclick: actions.onNew }),
        el("button", { class: "btn", text: "＋ Existing", onclick: actions.onAdd }),
        el("button", { class: "btn", text: "Edit", onclick: actions.onEdit }),
        el("button", { class: "btn", text: "← All", onclick: actions.onBack }),
        // Held, not pressed — so it is a mark rather than a labelled button
        // (§14.8). It keeps a real accessible name and the full control height.
        el("button", {
          class: "btn banner-glance", text: "✧",
          title: "Hold to see the whole desk",
          "aria-label": "Hold to see the whole desk",
        }),
      ]),
    ]),
    facts,
  ]);
}

// ===================================================================
//  PEEK — three independent mini-drawers (§14.4)
// ===================================================================
// Each shelf gets its own handle in a row along the banner's bottom edge, and
// opens as a column under ITS OWN handle, only as tall as its contents need.
// The handles wear the project's colour; so does the drawer (§14.17).
function drawers(store, project, ctx, data, state) {
  const shelves = [
    { key: "unplaced",   label: "Unplaced",   count: String(data.unplaced.length) },
    { key: "filed",      label: "Filed",      count: String(data.members.length) },
    { key: "milestones", label: "Milestones", count: milestoneCount(project) },
  ];

  const body = el("div", { class: "desk-drawer", role: "region", "aria-label": "Peek" });
  const inner = el("div", { class: "desk-drawer-inner" });
  body.appendChild(inner);

  const handles = el("div", { class: "desk-handles", role: "group", "aria-label": "Peek drawers" });
  const handleEls = new Map();

  for (const sh of shelves) {
    const h = el("button", {
      class: "desk-handle",
      "data-shelf": sh.key,
      "aria-expanded": String(state.drawer === sh.key),
      onclick: () => setDrawer(sh.key === state.drawer ? null : sh.key),
    }, [
      document.createTextNode(sh.label + " "),
      el("span", { class: "desk-handle-count", text: sh.count }),
    ]);
    handles.appendChild(h);
    handleEls.set(sh.key, h);
  }
  handles.appendChild(body);          // the drawer hangs off the handle row

  function shelfContent(name) {
    if (name === "unplaced") return unplacedShelf(store, project, ctx, data);
    if (name === "filed")    return filedShelf(store, ctx, data);
    if (name === "milestones") return milestonesShelf(store, project, ctx);
    return null;
  }

  function setDrawer(name) {
    state.drawer = name;
    for (const [k, h] of handleEls) h.setAttribute("aria-expanded", String(k === name));
    if (!name) {
      body.style.maxHeight = "0px";
      // keep the contents mounted for exactly as long as the slide lasts,
      // then unmount — unmounting in the same tick was the round-2 "blink"
      window.setTimeout(() => { if (!state.drawer) inner.innerHTML = ""; }, motionMs());
      return;
    }
    inner.innerHTML = "";
    inner.appendChild(shelfContent(name));
    placeDrawer(name);
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

  // restore whatever was open before the re-render
  if (state.drawer) {
    inner.appendChild(shelfContent(state.drawer));
    requestAnimationFrame(() => placeDrawer(state.drawer));
  }

  return { handles, body, setDrawer, handleEls };
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
function surface(store, project, ctx, data, state, drawer, glanceBtn) {
  const view = el("div", { class: "desk-viewport" });
  // THE SIZER. It is the thing that is 4400 x 2900, and it is never
  // transformed — so the scrollable area is a constant, whatever the glance is
  // doing to the surface inside it.
  //
  // This is the second attempt at the glance, and it is a different KIND of
  // fix. The first tried to put the scroll position back after the zoom-out
  // finished, which meant getting a piece of timing right against a CSS
  // transition — and it still landed in the corner. A scaled element
  // contributes its SCALED box to the scrollable overflow, so while the desk
  // was small there was almost nothing to scroll and any write got clamped;
  // every attempt to restore was a race against that.
  //
  // With a sizer, the glance never touches the scroll position at all. It is
  // purely a transform, the current scroll offset is folded into that
  // transform, and letting go just removes it. There is nothing to restore, so
  // there is no timing to get right and nothing left to race.
  const sizer = el("div", { class: "desk-sizer" });
  const deskEl = el("div", {
    class: "desk-surface",
    "aria-label": "Desk. Pointer only — the same entries are in the Peek drawers above, at full size.",
  });
  sizer.appendChild(deskEl);
  view.appendChild(sizer);

  // the mat: decorative, inert, fixed footprint, centred (§14.12, §14.13)
  deskEl.appendChild(mat());

  const w = D.weights(data.placed);
  for (const p of data.placed) deskEl.appendChild(card(store, project, ctx, p, w.get(p.id) || 0, state));

  if (data.placed.length === 0) {
    deskEl.appendChild(el("p", { class: "desk-empty hint" }, [
      data.unplaced.length
        ? "Open the Unplaced drawer above and drag something out here."
        : "Nothing in this project yet. Use ＋ Entry to start.",
    ]));
  }

  // Restoring is a WRITE to scrollLeft/Top, which fires a scroll event — and
  // the listener below would happily record the half-restored value as the new
  // truth. The guard is what keeps a restore from overwriting what it is
  // restoring, which is how the view kept jumping to the corner after an edit.
  //
  // It is an object rather than a local so the glance can hold it too: while
  // the desk is scaled down, its scrollable area is a few hundred pixels and
  // the browser clamps any scroll to about zero. Recording THAT was how the
  // glance silently corrupted the saved position (§14.23).
  const guard = { hold: true };

  wireDesk(store, project, ctx, data, state, { view, deskEl, drawer, glanceBtn, guard });

  // The window IS the viewport: the desk takes whatever height is left under
  // the banner and the handles, rather than a guessed vh. Measured, because
  // the chrome above it is not a fixed height (a long project name wraps).
  const fit = () => {
    const top = view.getBoundingClientRect().top;
    const h = Math.max(320, Math.round(window.innerHeight - top)) + "px";
    if (view.style.height !== h) view.style.height = h;   // idempotent: no needless reflow
  };

  const restore = () => {
    fit();
    if (state.scrollX == null) {
      state.scrollX = Math.max(0, Math.round((view.scrollWidth - view.clientWidth) / 2));
      state.scrollY = Math.max(0, Math.round((view.scrollHeight - view.clientHeight) / 2));
    }
    view.scrollLeft = state.scrollX;
    view.scrollTop = state.scrollY;
    requestAnimationFrame(() => { guard.hold = false; });
  };
  requestAnimationFrame(restore);
  window.addEventListener("resize", fit);
  view._deskFit = fit;                     // so teardown can take it off again

  view.addEventListener("scroll", () => {
    if (guard.hold) return;
    state.scrollX = view.scrollLeft;
    state.scrollY = view.scrollTop;
  });
  return view;
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

function card(store, project, ctx, p, weight, state) {
  const it = p.item;
  const expanded = state.expanded === it.id;
  const overdue = isOverdueEntry(it);

  const node = el("div", {
    class: "dcard" + (overdue ? " flag" : "") + (expanded ? " is-expanded" : ""),
    "data-id": it.id,
    "data-w": String(weight),
    tabindex: "0",
    "aria-label": `${it.title || "Untitled"}${overdue ? ", overdue" : ""}`,
    style: `left:${p.pos.x}px; top:${p.pos.y}px; z-index:${10 + p.z};`,
  });
  // the wobble: derived, static, never stored (§12.1)
  node.style.setProperty("--rot", (expanded ? 0 : p.rot).toFixed(3) + "deg");

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
function wireDesk(store, project, ctx, data, state, dom) {
  const { view, deskEl, drawer } = dom;
  const TAP_SLOP = 5;                        // movement still counted as a click
  const DBL_MS = 420;                        // how long a second click has to arrive
  let drag = null;
  let lastTap = { id: null, t: 0 };

  const nodeOf = (id) => deskEl.querySelector(`.dcard[data-id="${id}"]`);
  const placedById = new Map(data.placed.map(p => [p.id, p]));

  deskEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("button")) return;                 // real controls win
    const cardNode = e.target.closest(".dcard");

    if (cardNode && state.expanded === cardNode.dataset.id) {
      // An expanded card is TWO surfaces, because two gestures want the same
      // pixels: its header is a handle you can drag it by, and its body is
      // text you can select, copy and click links in. Anything outside the
      // header is left entirely to the browser — no capture, no preventDefault
      // — which is what makes selection and links work at all.
      if (!e.target.closest(".dcard-drag")) return;
      const p = placedById.get(cardNode.dataset.id);
      drag = p
        ? { kind: "card", p, node: cardNode, x0: e.clientX, y0: e.clientY, pendingZ: null, wasExpanded: true }
        : { kind: "tap", id: cardNode.dataset.id, x0: e.clientX, y0: e.clientY };
      if (p) cardNode.classList.add("is-dragging");
    } else if (cardNode) {
      const p = placedById.get(cardNode.dataset.id);
      if (!p) return;
      const pendingZ = raiseLocally(p, cardNode);
      drag = { kind: "card", p, node: cardNode, x0: e.clientX, y0: e.clientY, pendingZ };
      cardNode.classList.add("is-dragging");
    } else {
      // empty desk pans the view, so nothing can end up unreachable (§14.2)
      drag = { kind: "pan", x0: e.clientX, y0: e.clientY, sl: view.scrollLeft, st: view.scrollTop };
      deskEl.classList.add("is-panning");
    }
    deskEl.setPointerCapture(e.pointerId);
    // NOTE: deliberately no preventDefault — it suppresses the browser's
    // compatibility mouse events and takes double-click with them.
  });

  deskEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (drag.kind === "pan") { view.scrollLeft = drag.sl - dx; view.scrollTop = drag.st - dy; return; }
    if (drag.kind !== "card") return;
    drag.node.style.setProperty("--dx", dx + "px");
    drag.node.style.setProperty("--dy", dy + "px");
    // dragging a card over the Unplaced handle takes it off the desk
    const over = overUnplacedHandle(e);
    for (const [, h] of drawer.handleEls) h.classList.remove("is-drop-target");
    if (over) drawer.handleEls.get("unplaced").classList.add("is-drop-target");
  });

  deskEl.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    const moved = Math.hypot(dx, dy) > TAP_SLOP;
    const kind = drag.kind, d = drag;
    drag = null;

    if (kind === "pan") { deskEl.classList.remove("is-panning"); return; }

    if (kind === "tap" || (kind === "card" && !moved)) {
      const id = kind === "tap" ? d.id : d.p.id;
      if (kind === "card") d.node.classList.remove("is-dragging");
      const now = Date.now();
      const second = lastTap.id === id && (now - lastTap.t) < DBL_MS;
      lastTap = { id: second ? null : id, t: now };
      if (second) {                                        // double-click expands / collapses
        state.expanded = state.expanded === id ? null : id;
        ctx.rerender();
      } else if (kind === "card") {
        d.node.style.removeProperty("--dx");
        d.node.style.removeProperty("--dy");
        // a plain tap: commit the raise, if it actually changed anything
        if (d.pendingZ != null) {
          store.setDeskField(d.p.id, project.id, "z", d.pendingZ);
          ctx.rerender();
        }
      }
      return;
    }

    // A DROP. One position write, now, for this one card (§8.34).
    for (const [, h] of drawer.handleEls) h.classList.remove("is-drop-target");
    if (overUnplacedHandle(e)) {
      store.unplaceFromDesk(d.p.id, project.id);
      ctx.rerender();
      return;
    }
    const pos = D.clampPos(
      { x: d.p.pos.x + dx, y: d.p.pos.y + dy },
      d.node.offsetWidth, d.node.offsetHeight);
    // both writes for this card, together, on release — never before
    if (d.pendingZ != null) store.setDeskField(d.p.id, project.id, "z", d.pendingZ);
    store.setDeskField(d.p.id, project.id, "pos", pos);
    ctx.rerender();
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
    if (p.z >= data.maxZ) return null;             // already on top: nothing to do
    const z = data.maxZ + 1;
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
  drawer.body.addEventListener("pointerdown", (e) => {
    const row = e.target.closest(".desk-unplaced-row");
    if (!row) return;
    const ghost = row.cloneNode(true);
    ghost.classList.add("desk-ghost");
    document.body.appendChild(ghost);
    const move = (ev) => { ghost.style.left = (ev.clientX - 40) + "px"; ghost.style.top = (ev.clientY - 18) + "px"; };
    move(e);
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      ghost.remove();
      const r = view.getBoundingClientRect();
      const inside = ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom;
      if (!inside) return;
      // surface coordinates, so the current pan is added back in
      const pos = D.clampPos({
        x: ev.clientX - r.left + view.scrollLeft - D.ORIGIN - D.CARD_MIN_W / 2,
        y: ev.clientY - r.top + view.scrollTop - D.ORIGIN - 24,
      });
      store.placeOnDesk(row.dataset.id, project.id, pos, data.maxZ + 1);
      drawer.setDrawer(null);
      ctx.rerender();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
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
    if (ms <= 0) { view.classList.remove("is-glancing"); return; }
    setTimeout(() => { if (!glance) view.classList.remove("is-glancing"); }, ms);
  };
  // Passed in, not looked up: wireDesk runs while the surface is still
  // detached from the page, so closest(".desk-page") was null and the banner's
  // ✧ silently got no listener — only the Z key worked.
  const glanceBtn = dom.glanceBtn;
  if (glanceBtn) {
    glanceBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); glanceOn(); });
    for (const ev of ["pointerup", "pointerleave", "blur"]) glanceBtn.addEventListener(ev, glanceOff);
  }
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      // topmost surface only, one per press
      if (state.expanded) { state.expanded = null; ctx.rerender(); return; }
      if (state.drawer) { drawer.setDrawer(null); return; }
      return;
    }
    if ((e.key === "z" || e.key === "Z") && !e.repeat && !isTyping(e.target)) glanceOn();
  };
  const onKeyUp = (e) => { if (e.key === "z" || e.key === "Z") glanceOff(); };
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", glanceOff);

  // The view is torn down and rebuilt on every store write, so the listeners
  // this function hung on `document` and `window` must come off with it or
  // they accumulate one set per render. MutationObserver is the only honest
  // signal available: the desk itself leaving the page.
  const obs = new MutationObserver(() => {
    if (deskEl.isConnected) return;
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", glanceOff);
    if (view._deskFit) window.removeEventListener("resize", view._deskFit);
    obs.disconnect();
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function isTyping(el2) {
  return el2 && /^(INPUT|TEXTAREA|SELECT)$/.test(el2.tagName);
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
