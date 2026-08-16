// milestone-editor.js — the milestone list inside the Project view.
// ===================================================================
// Phase M1 of the milestones addendum. This remains the ONE place a project's
// pipeline is edited: add, rename, date, remind, reorder, tick off, remove,
// restore. Controls write through Store; this module owns no saved data.
//
// August 2026 form-language pass: dates still use native <input type="date">
// underneath, so iOS/macOS keep doing the hard work of picking a valid date.
// The browser field is no longer the permanent visual object, though. Dash
// presents a compact readout and lets the native input occupy the same generous
// hit target invisibly. That keeps YYYY-MM-DD storage exact while making the
// resting UI belong to Dash rather than to whichever browser happens to draw it.

import { el, typeChip } from "./shared.js";
import { openEditor } from "../editor.js";
import {
  visibleMilestones, removedMilestones, sortMilestones,
  orderBetween, needsRenumber, renumbered,
  isOverdue, todayISO, formatDay, milestoneProgress,
} from "../milestones.js";

function scratchOf(ctx) {
  if (!ctx.viewLocal.ms) {
    ctx.viewLocal.ms = { showRemoved: false, focusKey: null, focusSel: null, drafts: {}, expanded: {} };
  }
  if (!ctx.viewLocal.ms.expanded) ctx.viewLocal.ms.expanded = {};
  return ctx.viewLocal.ms;
}

export function renderMilestoneEditor(store, project, ctx) {
  const s = scratchOf(ctx);
  const today = todayISO();
  const ms = visibleMilestones(project);
  const removed = removedMilestones(project);
  const progress = milestoneProgress(project);
  const membership = store.milestoneMembership(project.id);

  const section = el("section", { class: "ms-section", "aria-label": "Milestones" });

  // A rebuild is not proof the person left a field. Remember the active field
  // and restore it after the store-triggered render, cursor included for text.
  section.addEventListener("focusin", (e) => {
    const k = e.target && e.target.getAttribute ? e.target.getAttribute("data-fkey") : null;
    s.focusKey = k || null;
    s.focusSel = null;
  });

  section.appendChild(el("div", { class: "ms-head" }, [
    el("span", { class: "mk", text: "Milestones" }),
    el("span", {
      class: "group-count",
      text: progress.total ? `${progress.done} of ${progress.total} done` : "none yet",
    }),
  ]));

  if (ms.length === 0) {
    section.appendChild(el("p", {
      class: "hint",
      text: "No milestones yet. Add the phases this project moves through — “Research”, “Draft”, " +
            "“Final” — and Dash will show which one you're in. Dates are optional; a phase with no " +
            "date yet is a perfectly normal thing to have.",
    }));
  } else {
    const list = el("div", { class: "ms-list", role: "list" });
    ms.forEach((m, i) => list.appendChild(
      milestoneBlock(store, project, ctx, s, ms, m, i, today, membership.get(m.mid) || [])
    ));
    section.appendChild(list);
  }

  section.appendChild(addRow(store, project, ctx, s));

  if (removed.length) {
    section.appendChild(el("button", {
      class: "btn ms-removed-toggle",
      "aria-expanded": String(s.showRemoved),
      text: `${s.showRemoved ? "▾" : "▸"} Removed milestones (${removed.length})`,
      onclick: () => { s.showRemoved = !s.showRemoved; ctx.rerender(); },
    }));

    if (s.showRemoved) {
      const drawer = el("div", { class: "ms-removed" });
      for (const m of removed) {
        drawer.appendChild(el("div", { class: "ms-removed-row" }, [
          el("span", { class: "ms-removed-label", text: m.label || "Untitled milestone" }),
          m.date ? el("span", { class: "num", text: formatDay(m.date) }) : null,
          el("button", {
            class: "btn",
            text: "Put it back",
            "aria-label": `Restore milestone ${m.label || "untitled"}`,
            onclick: () => store.restoreMilestone(project.id, m.mid),
          }),
        ]));
      }
      section.appendChild(drawer);
    }
  }

  restoreFocus(section, s);
  return section;
}

// ===================================================================
//  ONE MILESTONE
// ===================================================================
function milestoneBlock(store, project, ctx, s, list, m, index, today, entries) {
  const block = el("div", { class: "ms-item", role: "listitem" });
  const open = !!s.expanded[m.mid];
  block.appendChild(milestoneRow(store, project, ctx, s, list, m, index, today, entries, open));
  if (open) block.appendChild(entryPanel(store, project, ctx, s, m, entries));
  return block;
}

function milestoneRow(store, project, ctx, s, list, m, index, today, entries, open) {
  const done = !!m.done;
  const overdue = !done && isOverdue(m.date, today);

  const row = el("div", {
    class: "ms-row" + (done ? " is-done" : "") + (overdue ? " is-overdue" : ""),
    "data-mid": m.mid,
  });

  const toggle = el("button", {
    class: "ms-tick" + (done ? " on" : ""),
    type: "button",
    "aria-pressed": String(done),
    "aria-label": `${done ? "Mark not done" : "Mark done"}: ${m.label || "untitled milestone"}`,
    text: done ? "✓" : "",
    onclick: () => store.setMilestoneField(project.id, m.mid, "done", done ? null : new Date().toISOString()),
  });

  const handle = el("span", {
    class: "ms-grip",
    "aria-hidden": "true",
    title: "Drag to reorder",
    text: "⠿",
  });

  // Label commits on Enter/blur, not on each keystroke. The draft survives a
  // surprise render so sync cannot eat a half-typed milestone name.
  const draftKey = m.mid;
  const labelInput = el("input", {
    type: "text",
    class: "ms-label",
    value: s.drafts[draftKey] !== undefined ? s.drafts[draftKey] : (m.label || ""),
    placeholder: "Milestone name",
    "aria-label": "Milestone name",
    "data-fkey": `label:${m.mid}`,
  });
  labelInput.addEventListener("input", () => {
    s.drafts[draftKey] = labelInput.value;
    s.focusSel = [labelInput.selectionStart, labelInput.selectionEnd];
  });
  const commitLabel = () => {
    const v = labelInput.value;
    delete s.drafts[draftKey];
    if (v !== (m.label || "")) store.setMilestoneField(project.id, m.mid, "label", v);
  };
  labelInput.addEventListener("blur", commitLabel);
  labelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitLabel(); labelInput.blur(); }
  });

  // The visible part is Dash's readout; the real native date input is laid over
  // it at full tap-target size. No parsing or timezone conversion is introduced.
  const dueField = dateField({
    label: "Due",
    value: m.date || "",
    fkey: `date:${m.mid}`,
    ariaLabel: `Date for ${m.label || "this milestone"}`,
    onChange: (value) => store.setMilestoneField(project.id, m.mid, "date", value || null),
  });
  const remindField = dateField({
    label: "Remind",
    value: m.remind || "",
    fkey: `remind:${m.mid}`,
    ariaLabel: `Reminder for ${m.label || "this milestone"}`,
    onChange: (value) => store.setMilestoneField(project.id, m.mid, "remind", value || null),
  });

  const up = el("button", {
    class: "ms-move", type: "button", text: "↑",
    disabled: index === 0 ? "" : null,
    "aria-label": `Move ${m.label || "this milestone"} earlier`,
    onclick: () => move(store, project, list, index, -1),
  });
  const down = el("button", {
    class: "ms-move", type: "button", text: "↓",
    disabled: index === list.length - 1 ? "" : null,
    "aria-label": `Move ${m.label || "this milestone"} later`,
    onclick: () => move(store, project, list, index, +1),
  });
  const del = el("button", {
    class: "ms-move ms-del", type: "button", text: "✕",
    "aria-label": `Remove ${m.label || "this milestone"}`,
    onclick: () => store.removeMilestone(project.id, m.mid),
  });

  const count = entries.length;
  const disclose = el("button", {
    class: "ms-entries-toggle",
    type: "button",
    "aria-expanded": String(open),
    "aria-label": `${open ? "Hide" : "Show"} entries in ${m.label || "this milestone"}`,
    onclick: () => {
      if (open) delete s.expanded[m.mid];
      else s.expanded[m.mid] = true;
      ctx.rerender();
    },
  }, [
    el("span", { class: "caret", text: open ? "▾" : "▸" }),
    el("span", { text: count === 0 ? "No entries yet" : `${count} ${count === 1 ? "entry" : "entries"}` }),
  ]);

  row.append(
    handle,
    toggle,
    el("div", { class: "ms-main" }, [
      labelInput,
      el("div", { class: "ms-dates" }, [
        dueField,
        remindField,
        overdue ? el("span", { class: "mk mk-ember ms-overdue", text: `Overdue · ${formatDay(m.date)}` }) : null,
      ]),
      disclose,
    ]),
    el("div", { class: "ms-controls" }, [up, down, del]),
  );

  attachDrag(row, store, project, list, m, index);
  return row;
}

// A small instrument readout over a native date input. The native control stays
// focusable, keyboard-accessible and responsible for the picker on every OS.
function dateField({ label, value, fkey, ariaLabel, onChange }) {
  const readout = el("span", {
    class: "ms-date-readout" + (value ? "" : " is-empty"),
    "aria-hidden": "true",
    text: instrumentDate(value),
  });
  const input = el("input", {
    type: "date",
    class: "ms-date",
    value: value || "",
    "aria-label": ariaLabel,
    "data-fkey": fkey,
  });

  const refreshReadout = () => {
    const v = input.value || "";
    readout.textContent = instrumentDate(v);
    readout.classList.toggle("is-empty", !v);
  };
  input.addEventListener("input", refreshReadout);
  input.addEventListener("change", () => {
    refreshReadout();
    onChange(input.value || "");
  });

  return el("label", { class: "ms-date-field" }, [
    el("span", { class: "mk", text: label }),
    el("span", { class: "ms-date-shell" }, [readout, input]),
  ]);
}

function instrumentDate(value) {
  if (!value) return "—";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return value;
  const [year, month, day] = parts;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const mon = months[Number(month) - 1];
  if (!mon || !day || !year) return value;
  return `${String(Number(day)).padStart(2, "0")} ${mon} ${year}`;
}

// ===================================================================
//  ENTRIES ON A PHASE
// ===================================================================
function entryPanel(store, project, ctx, s, m, entries) {
  const panel = el("div", { class: "ms-entries" });
  if (entries.length === 0) {
    panel.appendChild(el("p", {
      class: "hint",
      text: "Nothing on this phase yet. Attach entries that already belong to this project, or start a new one here.",
    }));
  } else {
    for (const it of entries) panel.appendChild(entryRow(store, project, ctx, m, it));
  }

  panel.appendChild(el("div", { class: "ms-entry-actions" }, [
    el("button", {
      class: "btn", type: "button", text: "＋ Add entry",
      onclick: () => openPhasePicker(store, project, m, ctx),
    }),
    el("button", {
      class: "btn", type: "button", text: "＋ New entry in this phase",
      onclick: () => {
        const newId = store.createItem({ title: "" });
        store.attachToMilestone(newId, project.id, m.mid);
        openEditor(store, newId, { onClose: ctx.rerender, sync: ctx.sync });
      },
    }),
  ]));
  return panel;
}

function entryRow(store, project, ctx, m, it) {
  const open = () => ctx.onOpen(it.id);
  return el("div", { class: "ms-entry" }, [
    el("button", {
      class: "ms-entry-open", type: "button",
      "aria-label": `Open ${it.title || "Untitled"}`,
      onclick: open,
    }, [
      typeChip(store, it),
      el("span", { class: "ms-entry-title", text: it.title || "Untitled" }),
    ]),
    el("button", {
      class: "ms-move ms-del", type: "button", text: "✕",
      "aria-label": `Take ${it.title || "this entry"} off ${m.label || "this milestone"} (it stays in the project)`,
      onclick: () => store.detachFromMilestone(it.id, project.id, m.mid),
    }),
  ]);
}

function openPhasePicker(store, project, m, ctx) {
  const onPhase = new Set(
    (store.milestoneMembership(project.id).get(m.mid) || []).map(i => i.id)
  );
  const inProject = new Set(
    store.all().filter(i => i.id !== project.id &&
      i.links.some(l => l.target === project.id && l.label === "in project")).map(i => i.id)
  );
  const candidates = store.all().filter(i =>
    i.id !== project.id && i.type !== "project" && !onPhase.has(i.id));

  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
  const search = el("input", {
    type: "text", placeholder: "Search entries…",
    "aria-label": "Search entries to attach to this milestone",
  });
  const list = el("div", { class: "pick-list" });

  function draw() {
    list.innerHTML = "";
    const q = search.value.trim().toLowerCase();
    const matches = candidates.filter(i => (i.title || "").toLowerCase().includes(q));
    const mine = matches.filter(i => inProject.has(i.id)).slice(0, 40);
    const others = matches.filter(i => !inProject.has(i.id)).slice(0, 20);
    const add = (it, alsoJoins) => el("button", {
      class: "btn pick-row", type: "button",
      onclick: () => { store.attachToMilestone(it.id, project.id, m.mid); scrim.remove(); },
    }, [
      el("span", { text: it.title || "Untitled" }),
      alsoJoins ? el("span", { class: "mk", text: "joins project" }) : null,
    ]);

    if (mine.length) {
      list.appendChild(el("div", { class: "mk", text: "In this project" }));
      for (const it of mine) list.appendChild(add(it, false));
    }
    if (others.length) {
      list.appendChild(el("div", { class: "mk", text: "Elsewhere in Dash" }));
      for (const it of others) list.appendChild(add(it, true));
    }
    if (!mine.length && !others.length) {
      list.appendChild(el("p", { class: "hint", text: "Nothing left to attach." }));
    }
  }

  search.addEventListener("input", draw);
  draw();
  const modal = el("div", {
    class: "modal", role: "dialog", "aria-modal": "true",
    "aria-label": `Add an entry to ${m.label || "this milestone"}`,
  }, [
    el("h2", { text: `Add to “${m.label || "this milestone"}”` }),
    search,
    list,
    el("div", { class: "modal-actions" }, [
      el("div", { class: "spacer" }),
      el("button", { class: "btn", text: "Close", onclick: () => scrim.remove() }),
    ]),
  ]);
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  search.focus();
}

// ===================================================================
//  ADD
// ===================================================================
function addRow(store, project, ctx, s) {
  const input = el("input", {
    type: "text",
    class: "ms-label",
    placeholder: "Add a milestone — e.g. Research",
    "aria-label": "New milestone name",
    "data-fkey": "add",
    value: s.drafts.__add !== undefined ? s.drafts.__add : "",
  });
  input.addEventListener("input", () => {
    s.drafts.__add = input.value;
    s.focusSel = [input.selectionStart, input.selectionEnd];
  });

  const go = () => {
    const label = input.value.trim();
    if (!label) { input.focus({ preventScroll: true }); return; }
    input.value = "";
    delete s.drafts.__add;
    s.focusKey = "add";
    s.focusSel = null;
    store.addMilestone(project.id, { label });
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); go(); }
  });
  return el("div", { class: "ms-add" }, [
    input,
    el("button", { class: "btn btn-primary", type: "button", text: "＋ Add", onclick: go }),
  ]);
}

// ===================================================================
//  REORDER
// ===================================================================
function move(store, project, list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const m = list[index];
  const without = list.filter((_, i) => i !== index);
  const before = without[target - 1] || null;
  const after = without[target] || null;

  store.setMilestoneField(project.id, m.mid, "order", orderBetween(before, after));
  repairIfNeeded(store, project);
}

function repairIfNeeded(store, project) {
  const fresh = store.get(project.id);
  if (!fresh) return;
  const all = sortMilestones(fresh.milestones || []);
  if (!needsRenumber(all)) return;
  console.warn("milestone order precision exhausted — re-spacing this project's list once");
  store.renumberMilestones(project.id, renumbered(all));
}

function attachDrag(row, store, project, list, m, index) {
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    row.classList.add("dragging");
    e.dataTransfer.setData("text/plain", m.mid);
    e.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    row.classList.remove("drop-before", "drop-after");
  });
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    row.classList.toggle("drop-after", after);
    row.classList.toggle("drop-before", !after);
  });
  row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    const droppedAfter = row.classList.contains("drop-after");
    row.classList.remove("drop-before", "drop-after");
    const draggedMid = e.dataTransfer.getData("text/plain");
    if (!draggedMid || draggedMid === m.mid) return;

    const from = list.findIndex(x => x.mid === draggedMid);
    if (from < 0) return;
    const without = list.filter(x => x.mid !== draggedMid);
    let at = without.findIndex(x => x.mid === m.mid);
    if (droppedAfter) at += 1;

    const before = without[at - 1] || null;
    const after = without[at] || null;
    store.setMilestoneField(project.id, draggedMid, "order", orderBetween(before, after));
    repairIfNeeded(store, project);
  });
}

// ===================================================================
//  FOCUS RESTORE
// ===================================================================
function restoreFocus(section, s) {
  if (!s.focusKey) return;
  const key = s.focusKey;
  const sel = s.focusSel;
  requestAnimationFrame(() => {
    if (!document.contains(section)) return;
    const active = document.activeElement;
    if (active && active !== document.body && !section.contains(active)) return;
    if (active && section.contains(active) && active.getAttribute("data-fkey") === key) return;
    const node = section.querySelector(`[data-fkey="${escapeAttr(key)}"]`);
    if (!node) return;
    node.focus({ preventScroll: true });
    if (sel && typeof node.setSelectionRange === "function") {
      try { node.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ }
    }
  });
}

function escapeAttr(v) {
  return String(v).replace(/["\\]/g, "\\$&");
}
