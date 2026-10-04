// datemark-editor.js — "Mark a date" (October 2026, Round 1).
// ===================================================================
// A small form for putting just a date on the calendar: a title, a date, and
// an optional project. Nothing else, on purpose — no type, status, tags, notes
// or "repeats every year" (that is out of scope this round).
//
// Opened three ways:
//   - the "Mark a date" button on Home (no project chosen),
//   - the same button on a project's desk banner (that project pre-chosen),
//   - tapping an existing mark on the Calendar or in Home's due panel
//     (editor.js routes any date mark here, so every caller gets this form).
//
// It is a FORM with Save, unlike the main editor's save-as-you-type, because
// a half-typed mark should not exist: nothing is written until Save, and
// Cancel / Escape / the backdrop leave no trace. An existing mark also gets
// "Move to trash" — the same trash everything else goes to.
//
// The data side is store.createDateMark / updateDateMark / trash (js/store.js).
// The date control is the app-wide flip-numeral input (js/widgets/flipdate.js).

import { el } from "./shared.js";
import { toast } from "../ui/toast.js";
import { DATEMARK_TYPE } from "../store.js";
import { dayOfTimestamp } from "../entries.js";
import { mount as mountDateInput } from "../widgets/flipdate.js";

let seq = 0;

// opts: { id } to edit an existing mark, or { projectId } to start a new one
// pre-linked to a project. onClose runs after any way out.
export function openDateMarkEditor(store, opts = {}) {
  const existing = opts.id ? store.get(opts.id) : null;
  if (opts.id && (!existing || existing.type !== DATEMARK_TYPE)) {
    toast("That date couldn't be found.", "error");
    return null;
  }
  const isNew = !existing;
  const uid = `dm-${++seq}`;

  const startProject = isNew
    ? (opts.projectId && store.get(opts.projectId) ? opts.projectId : "")
    : (store.dateMarkProject(existing.id)?.id || "");

  let downOnScrim = false;
  const scrim = el("div", {
    class: "modal-scrim",
    onpointerdown: (e) => { downOnScrim = e.target === scrim; },
    onclick: (e) => { if (e.target === scrim && downOnScrim) close(); },
  });
  const modal = el("div", {
    class: "modal datemark-sheet", role: "dialog", "aria-modal": "true",
    "aria-labelledby": `${uid}-h`,
  });

  const titleInput = el("input", {
    type: "text", id: `${uid}-title`,
    placeholder: "What's the date? (Launch, Mom's birthday…)",
    onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } },
  });
  titleInput.value = existing?.title || "";

  const dateHost = el("div", { class: "datemark-date" });
  const dateWidget = mountDateInput(dateHost, {
    value: existing ? dayOfTimestamp(existing.dates?.due) : null,
    allowEmpty: false,        // a date mark without a date is not a date mark
    label: "Date",
    onCommit: () => {},       // nothing is written until Save
  });

  // Projects in the same hand-sorted order as the Projects rail.
  const projectSel = el("select", { id: `${uid}-project`, class: "datemark-project" }, [
    el("option", { value: "", text: "No project" }),
    ...store.projects().map(p => el("option", { value: p.id, text: p.title || "Untitled project" })),
  ]);
  projectSel.value = startProject;

  const error = el("p", { class: "datemark-error", id: `${uid}-err`, role: "alert" });

  function save() {
    const title = titleInput.value.trim();
    if (!title) {
      error.textContent = "Give the date a name first.";
      titleInput.setAttribute("aria-invalid", "true");
      titleInput.setAttribute("aria-describedby", `${uid}-err`);
      titleInput.focus();
      return;
    }
    const date = dateWidget.value();
    if (!date) { error.textContent = "Pick a date first."; dateWidget.focus(); return; }
    const projectId = projectSel.value || null;
    if (isNew) {
      store.createDateMark({ title, date, projectId });
      toast(`Marked · ${title}`, "success", 2500);
    } else {
      store.updateDateMark(existing.id, { title, date, projectId });
    }
    close();
  }

  function trashIt() {
    const name = existing.title || "Untitled date";
    store.trash(existing.id);
    toast(`Moved to trash · ${name}. Restore it from Trash, beside Settings.`, "info", 5000);
    close();
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", escClose);
    dateWidget.destroy();
    scrim.remove();
    opts.onClose && opts.onClose();
  }

  function escClose(e) {
    if (e.key !== "Escape") return;
    const scrims = document.querySelectorAll(".modal-scrim");
    if (scrims[scrims.length - 1] !== scrim) return;   // only the topmost answers
    close();
  }

  modal.append(
    el("h2", { id: `${uid}-h`, text: isNew ? "Mark a date" : "Edit date" }),
    el("div", { class: "field" }, [el("label", { for: `${uid}-title`, text: "Title" }), titleInput]),
    el("div", { class: "field" }, [el("label", { text: "Date" }), dateHost]),
    el("div", { class: "field" }, [el("label", { for: `${uid}-project`, text: "Project (optional)" }), projectSel]),
    error,
    el("div", { class: "modal-actions" }, [
      isNew ? null : el("button", { class: "btn btn-danger", type: "button", text: "Move to trash", onclick: trashIt }),
      el("div", { class: "spacer" }),
      el("button", { class: "btn", type: "button", text: "Cancel", onclick: close }),
      el("button", { class: "btn btn-primary datemark-save", type: "button", text: isNew ? "Mark it" : "Save", onclick: save }),
    ]),
  );

  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  document.addEventListener("keydown", escClose);
  titleInput.focus();

  return { el: modal, close, save };
}
