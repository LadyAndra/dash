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
    showUndo(store, done, msg);
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

function showUndo(store, ids, message) {
  const t = toast(message, "info", 8000);
  if (!t) return;
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "toast-undo";
  undo.textContent = "Undo";
  undo.setAttribute("aria-label",
    ids.length === 1 ? "Undo: take it back out of the trash" : `Undo: take all ${ids.length} back out of the trash`);
  undo.onclick = () => {
    undoTrash(store, ids);
    t.remove();
  };
  // Before Dismiss, so the useful button comes first for the keyboard too.
  const dismiss = [...t.querySelectorAll("button")].find((b) => b.textContent === "Dismiss");
  t.insertBefore(undo, dismiss || null);
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
