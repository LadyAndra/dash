// shared.js — small DOM helpers shared by views. Keeping these in one place
// means every view renders items consistently (§4.1 "views own layout").
// Views MUST NOT read raw colors; they call colorToken()/tintToken() (§10).

import { colorToken, tintToken } from "../theme.js";
import { blobObjectURL } from "../blobs.js";

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

export function swatch(store, item) {
  const t = store.typeDef(item.type);
  return el("div", { class: "item-swatch", style: `background:${colorToken(t?.color)}` });
}

// A stable, deterministic 4-digit accession number for an item, derived from
// its immutable id. Same id → same number on every device, forever, with no
// data migration (the number is display-only, never stored). Not guaranteed
// unique across thousands of items — it's a catalog affordance, like a
// specimen tag, not an identifier (the ULID remains the real id).
export function catalogNo(item) {
  const id = item.id || "";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return String(h % 10000).padStart(4, "0");
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
export function itemRow(store, item, onOpen) {
  const thumb = sketchThumb(item, "item-sketch-thumb");
  const left = thumb || el("span", { class: "item-no", text: `№ ${catalogNo(item)}` });

  const meta = el("div", { class: "item-meta" }, [
    typeChip(store, item),
    statusChip(store, item),
    el("span", { class: "num", text: shortDate(item) }),
  ]);
  const main = el("div", { class: "item-main" }, [
    meta,
    el("h3", { class: "item-title", text: item.title || (thumb ? "Sketch" : "Untitled") }),
    item.body ? el("p", { class: "item-body-preview", text: item.body }) : null,
    item.tags.length ? el("div", { class: "item-foot" }, tagChips(item)) : null,
  ]);

  return el("div", {
    class: "item-row",
    role: "button",
    tabindex: "0",
    onclick: () => onOpen(item.id),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } },
  }, [left, main]);
}

// A compact specimen card for board / kanban. Same voice as the row: a mono
// header line (catalog no. + marks), serif title, preview, tags.
export function itemCard(store, item, onOpen, opts = {}) {
  const thumb = sketchThumb(item, "card-sketch-thumb");
  const header = el("div", { class: "card-head" }, [
    el("span", { class: "item-no", text: `№ ${catalogNo(item)}` }),
    el("span", { class: "num", text: shortDate(item) }),
  ]);
  const marks = el("div", { class: "item-meta" }, [
    opts.hideType ? null : typeChip(store, item),
    opts.hideStatus ? null : statusChip(store, item),
  ]);

  return el("div", {
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
}

export function emptyState(title, body, actionLabel, onAction) {
  return el("div", { class: "empty" }, [
    el("h2", { text: title }),
    el("p", { text: body }),
    actionLabel ? el("button", { class: "btn btn-primary", text: actionLabel, onclick: onAction }) : null,
  ]);
}
