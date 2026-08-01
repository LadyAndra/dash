// shared.js — small DOM helpers shared by views. Keeping these in one place
// means every view renders items consistently (§4.1 "views own layout").
// Views MUST NOT read raw colors; they call colorToken()/tintToken() (§10).

import { colorToken, tintToken } from "../theme.js";
import { blobObjectURL } from "../blobs.js";
import { stageOf } from "../milestones.js";

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

// ---- the mono metadata voice (§ specimen-archive design) ----
// Type and status are tiny letterspaced "marks": a colored dot + a label,
// not filled pills. Color stays data-driven (registry colors are arbitrary),
// so a re-theme restyles them for free. The dot is drawn in CSS from
// currentColor, so we only set the text color here.
export function typeChip(store, item) {
  const t = store.typeDef(item.type);
  return el("span", { class: "mk", style: `color:${colorToken(t?.color)}` },
    [t?.label || item.type]);
}

export function statusChip(store, item) {
  const s = store.statusDef(item.status);
  return el("span", { class: "mk", style: `color:${colorToken(s?.color)}` },
    [s?.label || item.status]);
}

export function tagChips(item) {
  return item.tags.map(t => el("span", { class: "tag", text: t }));
}

// ---- the stage chip (milestones addendum §3.3) ----
// Where a project is right now: its earliest unfinished milestone, or
// "Complete" when they're all ticked off, or nothing at all when the project
// has no milestones. COMPUTED HERE, AT RENDER TIME, FROM THE IN-MEMORY ITEM —
// there is no stage field, no stage registry, and nothing is ever written back
// to the store. That's the whole point: it can't go stale and can't conflict.
//
// Colour: --text-muted on --surface-raised normally, --ember when the current
// stage's date has passed. Overdue is an indicator, which is the one thing
// tokens.css reserves ember for — so this is its sanctioned use, and there is
// no ember anywhere else in this feature.
//
// Returns null for anything that isn't a project with milestones, so callers
// can drop it straight into a children array.
export function stageChip(item) {
  if (!item || item.type !== "project") return null;
  const stage = stageOf(item);
  if (!stage) return null;
  return el("span", {
    class: "stage-chip" + (stage.overdue ? " overdue" : "") + (stage.complete ? " complete" : ""),
    title: stage.overdue ? "This stage's date has passed" : "Current stage",
  }, [stage.label]);
}

export function swatch(store, item) {
  const t = store.typeDef(item.type);
  return el("div", { class: "item-swatch", style: `background:${colorToken(t?.color)}` });
}

// The catalog accession number: the item's position in creation order,
// 1-based and zero-padded. Delegated to the store, which keeps the register
// stable (deletions don't renumber; new items take the next number). See
// Store.accessionNo. Display-only — the ULID remains the real id, so no data
// migration and it stays consistent across devices.
export function catalogNo(store, item) {
  return store.accessionNo(item.id);
}

// Short uppercase date for the mono meta line, e.g. "16 JUL". Falls back to
// created if modified is missing.
export function shortDate(item) {
  const iso = item?.dates?.modified || item?.dates?.created;
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()];
  return `${d.getDate()} ${mon}`;
}

// The drawing attached to a sketch item, if any.
function sketchAtt(item) {
  return (item.attachments || []).find(a => a.role === "sketch") || null;
}

// A small preview of a sketch, on warm paper, that fills in asynchronously
// (blobs live in IndexedDB). Returns null if the item has no drawing, so
// callers can decide whether to fall back to text.
function sketchThumb(item, cls) {
  const att = sketchAtt(item);
  if (!att) return null;
  const box = el("div", { class: cls });
  blobObjectURL(att.hash).then((url) => {
    if (url) box.appendChild(el("img", { src: url, alt: item.title || "sketch", class: "sketch-thumb-img" }));
  });
  return box;
}

// A full specimen entry for the list view: a catalog number in the left
// column, a mono meta line, the title in serif, a short preview, then tags.
// Hairline-separated rather than boxed (§ specimen-archive design).
// opts.selection — the selection controller (see js/selection.js). When select
// mode is on the row grows a checkbox and a picked state; the click handler is
// unchanged, because onOpen is what app.js re-points at "toggle selection".
export function itemRow(store, item, onOpen, opts = {}) {
  const thumb = sketchThumb(item, "item-sketch-thumb");
  const left = thumb || el("span", { class: "item-no", text: `№ ${catalogNo(store, item)}` });

  const meta = el("div", { class: "item-meta" }, [
    typeChip(store, item),
    statusChip(store, item),
    stageChip(item),                 // projects only; null for everything else
    el("span", { class: "num", text: shortDate(item) }),
  ]);
  const main = el("div", { class: "item-main" }, [
    meta,
    el("h3", { class: "item-title", text: item.title || (thumb ? "Sketch" : "Untitled") }),
    item.body ? el("p", { class: "item-body-preview", text: item.body }) : null,
    item.tags.length ? el("div", { class: "item-foot" }, tagChips(item)) : null,
  ]);

  const row = el("div", {
    class: "item-row",
    role: "button",
    tabindex: "0",
    "data-id": item.id,
    onclick: () => onOpen(item.id),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } },
  }, [left, main]);

  return applySelectable(row, item, opts.selection);
}

// A compact specimen card for board / kanban. Same voice as the row: a mono
// header line (catalog no. + marks), serif title, preview, tags.
export function itemCard(store, item, onOpen, opts = {}) {
  const thumb = sketchThumb(item, "card-sketch-thumb");
  const header = el("div", { class: "card-head" }, [
    el("span", { class: "item-no", text: `№ ${catalogNo(store, item)}` }),
    el("span", { class: "num", text: shortDate(item) }),
  ]);
  const marks = el("div", { class: "item-meta" }, [
    opts.hideType ? null : typeChip(store, item),
    opts.hideStatus ? null : statusChip(store, item),
    stageChip(item),                 // projects only; null for everything else
  ]);

  const card = el("div", {
    class: "card",
    role: "button",
    tabindex: "0",
    "data-id": item.id,
    onclick: () => onOpen(item.id),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } },
  }, [
    header,
    thumb,
    el("h3", { class: "item-title", text: item.title || (sketchAtt(item) ? "Sketch" : "Untitled") }),
    item.body ? el("p", { class: "item-body-preview", text: item.body }) : null,
    marks,
    item.tags.length ? el("div", { class: "item-foot" }, tagChips(item)) : null,
  ]);

  return applySelectable(card, item, opts.selection);
}

// ---- select mode (the Pinterest-style "organise" toggle) ----
// A small square that shows whether an entry is picked. It's decoration only:
// the tap is handled by the row/card itself (app.js decides whether a tap
// means "open" or "select"), so there is exactly ONE click path per item and
// no chance of the box and the row disagreeing.
function selectBox(selected) {
  return el("span", {
    class: "select-box" + (selected ? " on" : ""),
    "aria-hidden": "true",       // the row already carries aria-pressed
    text: selected ? "✓" : "",
  });
}

// Apply the shared select-mode treatment to a row or card: the checkbox, the
// pressed state for screen readers, and the classes the CSS uses to highlight.
// `sel` is the selection controller from app.js, or null/undefined when the
// view isn't in select mode — in which case this does nothing at all.
function applySelectable(node, item, sel) {
  if (!sel || !sel.active) return node;
  const on = sel.has(item.id);
  node.classList.add("selecting");
  if (on) node.classList.add("is-selected");
  node.setAttribute("aria-pressed", String(on));
  node.insertBefore(selectBox(on), node.firstChild);
  return node;
}

export function emptyState(title, body, actionLabel, onAction) {
  return el("div", { class: "empty" }, [
    el("h2", { text: title }),
    el("p", { text: body }),
    actionLabel ? el("button", { class: "btn btn-primary", text: actionLabel, onclick: onAction }) : null,
  ]);
}
