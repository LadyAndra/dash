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
