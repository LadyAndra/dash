// trash.js — the Trash drawer (October 2026, Round 1).
// ===================================================================
// Opened from the "Trash" button beside Settings in the topbar, so it is one
// tap from every view. Everything that has been moved to trash is listed here
// — entries, notes, projects and date marks alike — newest first, each with a
// Restore button. Nothing leaves on its own: there is no timer. Only "Empty
// trash" removes things for good, and it asks first, because that is the one
// permanent step.
//
// The data side is three store methods and nothing else (js/store.js):
//   store.trash(id)    one `set trashed <now>` op
//   store.restore(id)  one `set trashed null` op
//   store.emptyTrash() the existing permanent tombstone, once per item
//
// Restoring puts an item back exactly where it was — its project, its links,
// its place on a desk — because trashing never touched any of those.
//
// The confirmation is drawn INSIDE the drawer rather than with confirm():
// a native dialog can't be styled to the theme, reads poorly with a screen
// reader, and blocks the whole page.

import { el, catalogNo } from "./shared.js";
import { toast } from "../ui/toast.js";
import { DATEMARK_TYPE, PROJECT_TYPE } from "../store.js";
import { dayOfTimestamp } from "../entries.js";
import { formatDay } from "../milestones.js";

// The number the topbar button shows. One pass over the item map.
export function trashCount(store) {
  return typeof store.trashed === "function" ? store.trashed().length : 0;
}

export function openTrash(store, onChange = () => {}) {
  let confirming = false;

  const scrim = el("div", {
    class: "modal-scrim",
    onclick: (e) => { if (e.target === scrim) close(); },
  });
  const modal = el("div", {
    class: "modal trash-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "trash-title",
  });
  const status = el("p", { class: "trash-status", role: "status", "aria-live": "polite" });
  const list = el("div", { class: "trash-list" });
  const foot = el("div", { class: "modal-actions trash-actions" });

  function close() {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
    onChange();
  }

  function onKey(e) {
    if (e.key !== "Escape") return;
    const scrims = document.querySelectorAll(".modal-scrim");
    if (scrims[scrims.length - 1] !== scrim) return;   // only the topmost answers
    e.preventDefault();
    if (confirming) { confirming = false; draw(); return; }
    close();
  }

  function draw() {
    const items = store.trashed();
    list.replaceChildren();

    if (!items.length) {
      list.appendChild(el("p", { class: "trash-empty", text: "The trash is empty." }));
    } else {
      for (const it of items) list.appendChild(row(it));
    }

    foot.replaceChildren();
    if (confirming && items.length) {
      const n = items.length;
      foot.append(
        el("p", { class: "trash-confirm-text", id: "trash-confirm-text",
          text: `Delete ${n} ${n === 1 ? "item" : "items"} for good? This can't be undone.` }),
        el("div", { class: "spacer" }),
        el("button", { class: "btn", type: "button", text: "Keep them",
          onclick: () => { confirming = false; draw(); focusFirst(".trash-empty-btn"); } }),
        el("button", { class: "btn btn-danger trash-confirm-btn", type: "button",
          text: "Delete forever", "aria-describedby": "trash-confirm-text",
          onclick: () => {
            const gone = store.emptyTrash();
            confirming = false;
            draw();
            status.textContent = `${gone} ${gone === 1 ? "item" : "items"} deleted for good.`;
            focusFirst(".trash-close-btn");
          } }),
      );
      focusFirst(".trash-confirm-btn");
    } else {
      foot.append(
        items.length
          ? el("button", { class: "btn btn-danger trash-empty-btn", type: "button", text: "Empty trash…",
              onclick: () => { confirming = true; draw(); } })
          : null,
        el("div", { class: "spacer" }),
        el("button", { class: "btn btn-primary trash-close-btn", type: "button", text: "Done", onclick: close }),
      );
    }
  }

  function focusFirst(sel) {
    requestAnimationFrame(() => { modal.querySelector(sel)?.focus(); });
  }

  function row(it) {
    const name = nameOf(it);
    const restoreBtn = el("button", {
      class: "btn trash-restore", type: "button", text: "Restore",
      "aria-label": `Restore ${name}`,
      onclick: () => {
        store.restore(it.id);
        status.textContent = `${name} restored.`;
        toast(`Restored · ${name}`, "success", 2500);
        draw();
        focusFirst(".trash-restore, .trash-close-btn");
      },
    });
    return el("div", { class: "trash-row", "data-id": it.id }, [
      el("div", { class: "trash-row-main" }, [
        el("span", { class: "lbl trash-kind", text: kindOf(store, it) }),
        el("span", { class: "trash-title", text: name }),
        el("span", { class: "num trash-meta", text: metaOf(store, it) }),
      ]),
      restoreBtn,
    ]);
  }

  modal.append(
    el("div", { class: "trash-head" }, [
      el("h2", { id: "trash-title", text: "Trash" }),
    ]),
    el("p", { class: "hint trash-hint",
      text: "Things you move to trash stay here until you empty it. Restoring puts them back exactly where they were." }),
    status,
    list,
    foot,
  );
  draw();
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  document.addEventListener("keydown", onKey);
  focusFirst(".trash-restore, .trash-close-btn");

  return { close, el: modal };
}

function nameOf(it) {
  if (it.title) return it.title;
  if (it.type === DATEMARK_TYPE) return "Untitled date";
  if ((it.attachments || []).some(a => a.role === "sketch")) return "Sketch";
  return "Untitled";
}

function kindOf(store, it) {
  if (it.type === DATEMARK_TYPE) return "Date";
  if (it.type === PROJECT_TYPE) return "Project";
  return store.typeDef(it.type)?.label || it.type || "Entry";
}

// A date mark shows its date and project; everything else its catalog number.
function metaOf(store, it) {
  if (it.type === DATEMARK_TYPE) {
    const day = dayOfTimestamp(it.dates?.due);
    const p = store.dateMarkProject(it.id);
    return [day ? formatDay(day) : null, p ? (p.title || "Untitled project") : null].filter(Boolean).join(" · ");
  }
  return `№ ${catalogNo(store, it)}`;
}
