// trash-actions.js — "move these to the trash, and let me take it back".
// =========================================================================
// October 2026, Round 1.1 (trash everywhere).
//
// Every way of throwing an entry or project away now ends here: the small
// trash button on a row or card, the desk card's right-click, and Select
// mode's bulk action. (The editor's own "Move to trash" button predates this
// and calls store.trash() directly; it is the same single op.)
//
// Nothing new is stored. Moving to trash is store.trash(id), ONE ordinary
// `set trashed <now>` op per item, exactly as Round 1 built it. Undo is
// store.restore(id) for the same ids. The only permanent delete in Dash is
// still the Trash drawer's "Empty trash" (store.emptyTrash()).
//
// No confirm, because it is reversible. Instead a short message says what
// went, with an Undo button that puts back EXACTLY that batch: the ids are
// captured here, so an Undo can never restore something trashed some other
// way, and anything already emptied out of the trash is simply skipped.

import { toast } from "./ui/toast.js";
import { deleteBlob } from "./blobs.js";
import { DESK_IMAGE_PREFIX } from "./store.js";

function nameOf(item) {
  if (!item) return "Untitled";
  if (item.title) return item.title;
  return (item.attachments || []).some((a) => a.role === "sketch") ? "Sketch" : "Untitled";
}

// Trash every id that is currently live. Returns the ids actually trashed.
// opts.quiet — skip the message (tests, or a caller with its own).
export function moveToTrash(store, ids, opts = {}) {
  const list = Array.isArray(ids) ? ids : [ids];
  const done = [];
  const failures = [];
  let firstName = "";
  for (const id of list) {
    try {
      const it = store.get(id);              // live only: not trashed, not deleted
      if (!it) continue;
      if (!firstName) firstName = nameOf(it);
      store.trash(id);
      done.push(id);
    } catch (err) {
      failures.push(`${id}: ${err.message}`);
    }
  }

  if (!opts.quiet && done.length) {
    const msg = done.length === 1
      ? `Moved to trash · ${firstName}.`
      : `Moved ${done.length} to trash.`;
    showUndo(msg, done.length, () => undoTrash(store, done));
  }
  if (failures.length) {
    toast(`${failures.length} couldn't be moved to trash. Nothing else was affected.`,
      "error", 10000, failures.join("\n"));
  }
  return done;
}

// Put a batch back. Only ids that are still sitting in the trash are touched.
export function undoTrash(store, ids) {
  let n = 0;
  for (const id of ids) {
    const it = store.getAny(id);
    if (it && it.trashed) { store.restore(id); n++; }
  }
  return n;
}

function showUndo(message, count, putBack) {
  const t = toast(message, "info", 8000);
  if (!t) return;
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "toast-undo";
  undo.textContent = "Undo";
  undo.setAttribute("aria-label",
    count === 1 ? "Undo: take it back out of the trash" : `Undo: take all ${count} back out of the trash`);
  undo.onclick = () => {
    putBack();
    t.remove();
  };
  // Before Dismiss, so the useful button comes first for the keyboard too.
  const dismiss = [...t.querySelectorAll("button")].find((b) => b.textContent === "Dismiss");
  t.insertBefore(undo, dismiss || null);
}

// ---- post-its and desk images (Round 1.1, second pass) ----
// They are not Items, so they have their own store methods, but they land in
// the SAME Trash, with the same message and the same Undo. thing is
//   { kind: "note",  projectId, id: nid }   or
//   { kind: "image", projectId, id: <deskimg key> }
export function moveDeskThingToTrash(store, thing, opts = {}) {
  if (thing.kind === "note") store.trashNote(thing.projectId, thing.id);
  else if (thing.kind === "image") store.trashDeskImage(thing.projectId, thing.id);
  else return false;
  if (!opts.quiet) {
    const what = thing.kind === "note" ? "post-it" : "image";
    showUndo(`Moved to trash · the ${what}.`, 1, () => restoreDeskThing(store, thing));
  }
  return true;
}

// Put one back, but only if it is still in the trash (an Undo that arrives
// after Empty trash does nothing).
export function restoreDeskThing(store, thing) {
  const still = store.trashedDesk().some(t => t.kind === thing.kind && t.projectId === thing.projectId && t.id === thing.id);
  if (!still) return false;
  if (thing.kind === "note") store.restoreNote(thing.projectId, thing.id);
  else store.restoreDeskImage(thing.projectId, thing.id);
  return true;
}

// The image FILES that the desk images in the trash point at. The Trash drawer
// asks for these BEFORE emptying, then hands them to cleanUpImageFiles after.
export function trashedImageHashes(store) {
  return store.trashedDesk()
    .filter(t => t.kind === "image" && t.meta && t.meta.hash)
    .map(t => t.meta.hash);
}

// Is any live thing still using this image file? An entry's attachment counts
// (trashed or not), and so does any desk image that isn't permanently removed,
// including one still in the trash on another desk. The same rule the desk
// images runtime used when its right-click deleted straight away.
export function imageFileStillUsed(store, hash) {
  for (const it of store.items.values()) {
    for (const a of it.attachments || []) if (a && a.hash === hash) return true;
    for (const [key, rec] of Object.entries(it.viewState || {})) {
      if (!key.startsWith(DESK_IMAGE_PREFIX) || !rec || rec.removed) continue;
      if (rec.clip && rec.clip.hash === hash) return true;
    }
  }
  return false;
}

// After Empty trash: erase each image file nothing uses any more. Best effort;
// the images have already left the trash, so a failure here only leaves an
// unused file behind.
export async function cleanUpImageFiles(store, hashes, erase = deleteBlob) {
  let erased = 0;
  for (const hash of new Set(hashes)) {
    if (imageFileStillUsed(store, hash)) continue;
    try { await erase(hash); erased++; } catch { /* best effort */ }
  }
  return erased;
}

// The small per-item button. One click, always visible, no confirm.
// Callers decide WHETHER to draw it (never in Select mode, where a tap means
// "pick this"); this only builds it. Every event is stopped from bubbling,
// because it sits inside a row or card that opens the entry on click/Enter.
export function trashButton(store, item, extraClass = "") {
  const label = `Move to trash: ${nameOf(item)}`;
  const stop = (e) => e.stopPropagation();
  return el("button", {
    type: "button",
    class: "item-trash" + (extraClass ? " " + extraClass : ""),
    "aria-label": label,
    title: "Move to trash",
    onpointerdown: stop,
    onmousedown: stop,
    onkeydown: stop,
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); moveToTrash(store, [item.id]); },
  });
}

// ---- THE ONE WAY TO TRASH SOMETHING YOU CAN SEE: right-click, then the scribble ----
// (October 2026, Rounds 1.3 and 1.4.) The small button above was drawn on every
// row and card, and the repetition was noise. Nothing draws it any more
// (trashButton stays here, unused: retired, not deleted). Right-click a row or
// card ANYWHERE and Andra's delete scribble appears at the pointer; clicking
// the scribble is the single store.trash() op, with the same message and Undo.
// It is the same floating scribble the desk uses on a post-it or an image
// (.desk-menu-delete-only in css/ui-cleanup.css), so there is no new styling.
//
// Why this stays reachable without a mouse: a row or card is focusable, and the
// keyboard's Menu key (or Shift+F10) fires the same `contextmenu` event on the
// focused one, so it opens here too, placed at the row because a keyboard
// press has no pointer position. On a phone, a long-press does the same where
// the browser supports it; Select mode and the editor's own "Move to trash"
// are the other ways in.
//
// Exactly one menu exists at a time. It is parked on <body> (not inside the
// row, so a scrolling list can't clip it) and closes on the next press
// anywhere, on Escape, on scroll or resize, or when it is used.
let rowMenu = null;
let rowMenuCleanup = null;

export function closeRowMenu() {
  if (rowMenuCleanup) { rowMenuCleanup(); rowMenuCleanup = null; }
  if (!rowMenu) return false;
  rowMenu.remove();
  rowMenu = null;
  return true;
}

export function openTrashMenu(e, store, item, anchor) {
  closeRowMenu();
  const opener = document.activeElement;
  // The row may have been redrawn since it was wired: name it from the store.
  const live = store.get(item.id) || item;
  const label = `Move to trash: ${nameOf(live)}`;
  const box = el("div", { class: "desk-menu desk-menu-delete-only row-menu", role: "menu" });
  const choice = el("button", {
    type: "button",
    class: "desk-menu-item desk-menu-delete",
    role: "menuitem",
    "aria-label": label,
    title: "Move to trash",
    onclick: (ev) => { ev.stopPropagation(); closeRowMenu(); moveToTrash(store, [item.id]); },
  });
  box.appendChild(choice);

  box.style.left = "0px"; box.style.top = "0px";
  document.body.appendChild(box);

  // A keyboard-opened menu reports 0,0: put it at the row's top-left instead.
  let x = e.clientX, y = e.clientY;
  if (!x && !y && anchor && anchor.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    x = r.left + 8; y = r.top + 8;
  }
  const w = box.offsetWidth || 44, h = box.offsetHeight || 44;   // the scribble is one 44px target
  box.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + "px";
  box.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + "px";
  rowMenu = box;

  const away = (ev) => { if (rowMenu && !rowMenu.contains(ev.target)) closeRowMenu(); };
  const onKey = (ev) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    closeRowMenu();
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  };
  const onMove = () => closeRowMenu();
  // Listening starts on the next tick, so the press that opened the menu
  // (on some platforms the same gesture) can't also close it.
  const timer = window.setTimeout(() => {
    document.addEventListener("pointerdown", away, true);
  }, 0);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onMove, true);
  window.addEventListener("resize", onMove);
  rowMenuCleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener("pointerdown", away, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onMove, true);
    window.removeEventListener("resize", onMove);
  };
  choice.focus({ preventScroll: true });
  return box;
}

// Wire right-click on one row/card. isPicking() is asked at the moment of the
// click, because Select mode can be switched on after the row was drawn: while
// picking, a right-click does nothing special (the browser's own menu shows).
// A text field inside the row would keep the browser's own menu (copy/paste);
// there are none today. The status dropdown is NOT exempt: it has no useful
// menu of its own, and a right-click on it should do what one anywhere else
// on the row does.
export function trashOnRightClick(store, node, item, isPicking = () => false) {
  node.addEventListener("contextmenu", (e) => {
    if (isPicking()) return;
    if (e.target && e.target.closest && e.target.closest("input, textarea")) return;
    e.preventDefault();
    openTrashMenu(e, store, item, node);
  });
  return node;
}

// A tiny local element helper, so this module doesn't import views/shared.js
// (which imports this one).
function el(tag, attrs) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  return node;
}
