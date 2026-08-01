// milestone-editor.js — the milestone list inside the Project view.
// ===================================================================
// Phase M1 of the milestones addendum. This is the ONE place a project's
// pipeline is edited: add, rename, date, remind, reorder, tick off, remove,
// restore. It renders into the Project detail page (addendum §10) and owns no
// data of its own — every control calls a store method, which emits, which
// goes through app.js's coalesced scheduleRender like every other edit.
// There is deliberately no private redraw loop in here.
//
// Two rules from docs/dash-current-state.md are load-bearing and honoured
// explicitly below, because both have bitten this codebase before:
//
//   1. "Blur is not proof the user left the field." A re-render detaches the
//      focused input and Chrome fires blur on the way out. So the label boxes
//      commit on Enter/blur rather than on every keystroke (no store emit
//      while you type at all), AND whatever is typed is held in a draft so a
//      background sync landing mid-word can't swallow it.
//   2. Focus and cursor position are restored after a rebuild, the same way
//      the Home capture box does it, using preventScroll so the page never
//      jumps.
//
// Everything is drawn from theme tokens; there is not a literal colour, size
// or font anywhere in this file. Ember appears only on an overdue date, which
// is the indicator token doing exactly the job tokens.css reserves it for.

import { el, typeChip } from "./shared.js";
import { openEditor } from "../editor.js";
import {
  visibleMilestones, removedMilestones, sortMilestones,
  orderBetween, needsRenumber, renumbered,
  isOverdue, todayISO, formatDay, milestoneProgress,
} from "../milestones.js";

// Scratch state lives on ctx.viewLocal, which survives a re-render but is
// wiped when you leave the view — the right lifetime for "which box had the
// cursor" and "is the removed drawer open".
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

  // Which entries are on which phase — ONE scan of the archive for the whole
  // section, not one per milestone. (Standing rule in the current-state doc:
  // assume any new store scanner has the per-item-scan bug until checked.)
  const membership = store.milestoneMembership(project.id);

  const section = el("section", { class: "ms-section", "aria-label": "Milestones" });

  // Remember which box has the cursor so the next rebuild can hand it back.
  section.addEventListener("focusin", (e) => {
    const k = e.target && e.target.getAttribute ? e.target.getAttribute("data-fkey") : null;
    s.focusKey = k || null;
    s.focusSel = null;
  });

  // ---- header ----
  section.appendChild(el("div", { class: "ms-head" }, [
    el("span", { class: "mk", text: "Milestones" }),
    el("span", {
      class: "group-count",
      text: progress.total ? `${progress.done} of ${progress.total} done` : "none yet",
    }),
  ]));

  // ---- the list ----
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

  // ---- add ----
  section.appendChild(addRow(store, project, ctx, s));

  // ---- the removed drawer (nothing is ever hard-deleted — §13.2 #8) ----
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
//  ONE MILESTONE — the editing row, plus its (collapsed) entry list
// ===================================================================
// The row and the entry panel are siblings inside a wrapper rather than the
// panel living inside the row, because the ROW is the draggable thing. Nesting
// a list of buttons inside a draggable element makes both harder to use.
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

  // --- done toggle ---
  // A real button with a real pressed state, so it reads correctly aloud and
  // is a 44px target. Writes a timestamp rather than a boolean (addendum
  // §2.1): free history, and un-ticking is just clearing it back to null.
  const toggle = el("button", {
    class: "ms-tick" + (done ? " on" : ""),
    type: "button",
    "aria-pressed": String(done),
    "aria-label": `${done ? "Mark not done" : "Mark done"}: ${m.label || "untitled milestone"}`,
    text: done ? "✓" : "",
    onclick: () => store.setMilestoneField(project.id, m.mid, "done", done ? null : new Date().toISOString()),
  });

  // --- drag handle ---
  // Drag is the fast path on a trackpad. It is NOT the only path: the up/down
  // buttons below are the touch affordance, per the addendum's §3.2 note that
  // drag alone is a poor sole affordance.
  const handle = el("span", {
    class: "ms-grip",
    "aria-hidden": "true",
    title: "Drag to reorder",
    text: "⠿",
  });

  // --- label ---
  // Commits on Enter and on blur, never on keystroke, so typing a name never
  // emits a store change and therefore never triggers a re-render mid-word.
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
    s.drafts[draftKey] = labelInput.value;       // survives an unexpected rebuild
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

  // --- dates ---
  // Native date inputs: they hand back "YYYY-MM-DD" directly, which is exactly
  // the shape milestone dates are stored in (addendum §2.1), so there is no
  // parsing, no timezone conversion, and nothing that can drift by a day.
  const dateInput = el("input", {
    type: "date",
    class: "ms-date",
    value: m.date || "",
    "aria-label": `Date for ${m.label || "this milestone"}`,
    "data-fkey": `date:${m.mid}`,
    onchange: (e) => store.setMilestoneField(project.id, m.mid, "date", e.target.value || null),
  });

  const remindInput = el("input", {
    type: "date",
    class: "ms-date",
    value: m.remind || "",
    "aria-label": `Reminder for ${m.label || "this milestone"}`,
    "data-fkey": `remind:${m.mid}`,
    onchange: (e) => store.setMilestoneField(project.id, m.mid, "remind", e.target.value || null),
  });

  // --- move / remove ---
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

  // --- the entries disclosure ---
  // A separate button rather than "tap the row", because the row's biggest
  // target is the name box and tapping that has to keep meaning "edit the
  // name". This is always present, including when the phase is empty, so
  // there's an obvious way in to attach the first thing.
  const count = entries.length;
  const disclose = el("button", {
    class: "ms-entries-toggle",
    type: "button",
    "aria-expanded": String(open),
    "aria-label": `${open ? "Hide" : "Show"} entries in ${m.label || "this milestone"}`,
    onclick: () => {
      if (open) delete s.expanded[m.mid];
      else s.expanded[m.mid] = true;
      ctx.rerender();                      // UI-only: nothing is written to the store
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
        el("label", { class: "ms-date-field" }, [el("span", { class: "mk", text: "Due" }), dateInput]),
        el("label", { class: "ms-date-field" }, [el("span", { class: "mk", text: "Remind" }), remindInput]),
        overdue ? el("span", { class: "mk mk-ember ms-overdue", text: `Overdue · ${formatDay(m.date)}` }) : null,
      ]),
      disclose,
    ]),
    el("div", { class: "ms-controls" }, [up, down, del]),
  );

  attachDrag(row, store, project, list, m, index);
  return row;
}

// ===================================================================
//  THE ENTRIES ON A PHASE
// ===================================================================
// Attaching is a link on the ENTRY (store.attachToMilestone), so it merges
// with the same set semantics tags and project membership already use — no new
// op kind, no format change. Detaching takes the entry off the phase but
// leaves it in the project: those are two different things, and guessing
// otherwise would silently lose a project assignment.
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

// One attached entry: enough to recognise it, a way in, and a way off.
// Deliberately NOT the full specimen row from the list view — this is a
// sub-list inside an editor, and a full row here would swamp the milestone
// it belongs to.
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

// Pick something to attach. Entries already in the project come first, because
// that's nearly always what's wanted; anything else in the archive is still
// reachable underneath, and attaching one of those adds it to the project too
// (being on a phase implies being in the project).
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
    search, list,
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
    s.focusKey = "add";            // keep the cursor here so you can add several
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
// A move is ONE `set` op on ONE milestone's order field (addendum §3.2). The
// neighbours are never renumbered — which is precisely what lets a reorder on
// one device and a label edit on another merge without touching each other.
function move(store, project, list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const m = list[index];

  // Where the milestone lands: between the two entries it will sit between
  // once it has moved. Walking the array rather than doing arithmetic on
  // orders keeps this readable and correct at both ends of the list.
  const without = list.filter((_, i) => i !== index);
  const before = without[target - 1] || null;
  const after = without[target] || null;

  store.setMilestoneField(project.id, m.mid, "order", orderBetween(before, after));
  repairIfNeeded(store, project);
}

// Fractional ordering has a real (if distant) floor: about fifty consecutive
// midpoint splits into the same gap and the halves stop being distinguishable.
// When that happens the whole list is re-spaced once, emitting one set per
// milestone. Rare, legal, self-healing (addendum §3.2) — and deliberately not
// what an ordinary move does.
function repairIfNeeded(store, project) {
  const fresh = store.get(project.id);
  if (!fresh) return;
  const all = sortMilestones(fresh.milestones || []);
  if (!needsRenumber(all)) return;
  console.warn("milestone order precision exhausted — re-spacing this project's list once");
  store.renumberMilestones(project.id, renumbered(all));
}

// ---- drag to reorder (pointer devices) ----
// HTML5 drag-and-drop, the same mechanism the kanban view uses, so there is
// one drag idiom in the app. It does nothing on touch, which is exactly why
// the up/down buttons exist.
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
// Same rule as the Home capture box: a rebuild is not the user leaving the
// field. If a box in this section had the cursor before the rebuild, it gets
// it back on the next frame, cursor position included, with preventScroll so
// the page never jumps under her.
function restoreFocus(section, s) {
  if (!s.focusKey) return;
  const key = s.focusKey;
  const sel = s.focusSel;
  requestAnimationFrame(() => {
    if (!document.contains(section)) return;             // the render pass moved on
    const active = document.activeElement;
    // Don't steal focus from somewhere the person deliberately went.
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

// The key goes inside a QUOTED attribute selector, so only a quote or a
// backslash could break it. (Our keys are "label:<ULID>" and friends, which
// contain neither — this is belt and braces so a future key shape can't
// silently produce a selector that throws.)
function escapeAttr(v) {
  return String(v).replace(/["\\]/g, "\\$&");
}
