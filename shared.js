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

export function typeChip(store, item) {
  const t = store.typeDef(item.type);
  return el("span", { class: "chip", style: `color:${colorToken(t?.color)}` },
    [`${t?.icon || "•"} ${t?.label || item.type}`]);
}

export function statusChip(store, item) {
  const s = store.statusDef(item.status);
  return el("span", {
    class: "chip",
    style: `background:${tintToken(s?.color)}; color:${colorToken(s?.color)}`,
  }, [s?.label || item.status]);
}

export function tagChips(item) {
  return item.tags.map(t => el("span", { class: "chip tag", text: t }));
}

export function swatch(store, item) {
  const t = store.typeDef(item.type);
  return el("div", { class: "item-swatch", style: `background:${colorToken(t?.color)}` });
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

// A full item row for the list view.
export function itemRow(store, item, onOpen) {
  const thumb = sketchThumb(item, "item-sketch-thumb");
  const main = el("div", { class: "item-main" }, [
    el("h3", { class: "item-title", text: item.title || (thumb ? "Sketch" : "Untitled") }),
    item.body ? el("p", { class: "item-body-preview", text: item.body }) : null,
    el("div", { class: "item-meta" }, [
      typeChip(store, item),
      statusChip(store, item),
      ...tagChips(item),
    ]),
  ]);
  return el("div", {
    class: "item-row",
    role: "button",
    tabindex: "0",
    onclick: () => onOpen(item.id),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } },
  }, [thumb || swatch(store, item), main]);
}

// A compact card for board / kanban.
export function itemCard(store, item, onOpen, opts = {}) {
  const card = el("div", {
    class: "card",
    role: "button",
    tabindex: "0",
    "data-id": item.id,
    onclick: () => onOpen(item.id),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } },
  }, [
    sketchThumb(item, "card-sketch-thumb"),
    el("h3", { class: "item-title", text: item.title || (sketchAtt(item) ? "Sketch" : "Untitled") }),
    item.body ? el("p", { class: "item-body-preview", text: item.body }) : null,
    el("div", { class: "item-meta" }, [
      opts.hideType ? null : typeChip(store, item),
      opts.hideStatus ? null : statusChip(store, item),
      ...tagChips(item),
    ]),
  ]);
  return card;
}

export function emptyState(title, body, actionLabel, onAction) {
  return el("div", { class: "empty" }, [
    el("h2", { text: title }),
    el("p", { text: body }),
    actionLabel ? el("button", { class: "btn btn-primary", text: actionLabel, onclick: onAction }) : null,
  ]);
}
