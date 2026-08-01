// selection.js — "select several things, then do one thing to all of them".
// =========================================================================
// The Pinterest board-organising pattern: a visible Select button turns the
// current view into a picker, you tap the entries you want, then choose an
// action from a bar at the bottom.
//
// WHY a button and not a long-press (§ the ask, July 2026): long-press is
// invisible — you have to already know it exists — and it fights with text
// selection, dictation, and the drag-to-reorder gesture on kanban. A button
// that says "Select" is discoverable, works the same with a mouse, a finger
// and a keyboard, and can't be triggered by accident.
//
// WHY there is no new data here (§2.1, §4.1): a bulk edit is just the SAME
// field edit you could already do one item at a time, run in a loop. Applying
// a tag to eight entries is eight store.addToSet calls. So this module owns a
// Set of ids and some UI, and nothing else — no bulk records, no batch ops in
// the log, no second code path that could drift from the single-item one.
// Sync/merge therefore needs to know nothing about bulk editing at all.
//
// Everything it writes goes through the existing store methods:
//   tags     -> store.addToSet(id, "tags", tag)
//   status   -> store.setField(id, "status", key)
//   project  -> store.assignToProject(id, projectId)   (multi-project safe)

import { el } from "./views/shared.js";
import { toast } from "./ui/toast.js";

// ---------------------------------------------------------------------------
// The controller. app.js owns one of these for the whole session.
// `onChange` is called whenever anything visible changes, so app.js can
// re-render the current view and redraw the action bar.
// ---------------------------------------------------------------------------
export function createSelection(store, onChange) {
  let active = false;
  const ids = new Set();

  function notify() { onChange && onChange(); }

  const api = {
    // --- state readers (used by views to decide how to draw an item) ---
    get active() { return active; },
    get count() { return ids.size; },
    has(id) { return ids.has(id); },
    ids() { return [...ids]; },

    // --- mode ---
    // Turning select mode OFF always clears the selection, so the button is a
    // true toggle: what you see is the whole state, nothing lingers invisibly.
    enter() { active = true; notify(); },
    exit() { active = false; ids.clear(); notify(); },
    toggleMode() { active ? api.exit() : api.enter(); },

    // --- picking ---
    toggle(id) {
      if (!id) return;
      ids.has(id) ? ids.delete(id) : ids.add(id);
      notify();
    },
    clear() { ids.clear(); notify(); },

    // --- the action bar (rebuilt on every change; it's tiny) ---
    renderBar(container) { renderActionBar(api, store, container); },

    // --- the bulk edits themselves ---
    applyTags(tags) {
      const what = tags.length > 1 ? `${tags.length} tags` : `the tag "${tags[0]}"`;
      runBulk(api, store, "tags",
        (id) => { for (const t of tags) store.addToSet(id, "tags", t); },
        (n, noun) => `Added ${what} to ${n} ${noun}.`);
    },
    applyStatus(key) {
      const label = store.statusDef(key)?.label || key;
      runBulk(api, store, "status",
        (id) => { store.setField(id, "status", key); },
        (n, noun) => `Set ${n} ${noun} to "${label}".`);
    },
    applyProject(projectId) {
      const label = store.get(projectId)?.title || "the project";
      runBulk(api, store, "project",
        // assignToProject already refuses to put a project inside itself and
        // is idempotent, so re-adding something is harmless.
        (id) => { store.assignToProject(id, projectId); },
        (n, noun) => `Added ${n} ${noun} to "${label}".`);
    },
  };

  return api;
}

// ---------------------------------------------------------------------------
// Run one edit across every selected item.
// Each item is wrapped on its own so one bad record can't abandon the rest,
// and any failure is REPORTED — never swallowed into the console (§13.1).
// ---------------------------------------------------------------------------
function runBulk(sel, store, what, editOne, successMessage) {
  const targets = sel.ids();
  if (targets.length === 0) {
    toast("Nothing is selected yet — tap some entries first.", "info", 5000);
    return;
  }

  let ok = 0;
  const failures = [];
  for (const id of targets) {
    try {
      if (!store.get(id)) throw new Error("item no longer exists (it may have been deleted on another device)");
      editOne(id);
      ok++;
    } catch (err) {
      const title = store.get(id)?.title || id;
      failures.push(`${title}: ${err.message}`);
    }
  }

  const noun = ok === 1 ? "entry" : "entries";
  if (failures.length === 0) {
    toast(successMessage(ok, noun), "success", 4500);
  } else if (ok > 0) {
    toast(
      `${successMessage(ok, noun)} ${failures.length} couldn't be changed — nothing else was affected.`,
      "error", 10000, failures.join("\n")
    );
  } else {
    toast(
      `Couldn't change the ${what} on any of the selected entries. Nothing was altered.`,
      "error", 10000, failures.join("\n")
    );
  }
  // The selection deliberately SURVIVES an action, so you can tag a batch and
  // then set its status without picking everything again. "Done" clears it.
}

// ---------------------------------------------------------------------------
// The bottom bar: how many are picked, and what you can do to them.
// ---------------------------------------------------------------------------
function renderActionBar(sel, store, container) {
  container.innerHTML = "";
  if (!sel.active) return;

  const n = sel.count;
  const count = el("div", { class: "select-count", role: "status" },
    [n === 0 ? "None selected" : `${n} selected`]);

  // With nothing picked there is nothing to act on, so the action buttons are
  // disabled rather than hidden — the bar keeps its shape and doesn't jump
  // around under your thumb as you tap items.
  const act = (label, onclick) => el("button", {
    class: "btn", text: label, onclick,
    disabled: n === 0 ? "true" : null,
  });

  const bar = el("div", { class: "select-bar", role: "toolbar", "aria-label": "Actions for the selected entries" }, [
    count,
    act("＋ Tags", () => openTagSheet(sel, store)),
    act("Status", () => openStatusSheet(sel, store)),
    act("Project", () => openProjectSheet(sel, store)),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-primary", text: "Done", onclick: () => sel.exit() }),
  ]);

  container.appendChild(bar);
}

// ---------------------------------------------------------------------------
// Action sheets. All three use the app's existing .modal markup so they look
// and behave like every other dialog in Dash.
// ---------------------------------------------------------------------------
function sheet(ariaLabel, children) {
  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) closeSheet(); } });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": ariaLabel });
  function closeSheet() {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
  }
  function onKey(e) { if (e.key === "Escape") closeSheet(); }
  document.addEventListener("keydown", onKey);

  // .filter(Boolean) matters: a children list may contain null for a section
  // that doesn't apply (e.g. "pick an existing tag" when there are none), and
  // append() would happily render the literal text "null" on the screen.
  modal.append(...children(closeSheet).filter(Boolean));
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  return { scrim, modal, close: closeSheet };
}

// ---- apply one or more tags -------------------------------------------------
function openTagSheet(sel, store) {
  const pending = [];          // tags queued for this apply
  const chipWrap = el("div", { class: "chip-input" });

  const input = el("input", {
    type: "text", placeholder: "Type a tag, press Enter (or tap the mic and say it)",
    "aria-label": "Add a tag to the selected entries",
    onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); addPending(input.value); } },
  });

  function addPending(raw) {
    const val = (raw || "").trim();
    if (!val) return;
    if (!pending.includes(val)) pending.push(val);
    input.value = "";
    drawPending();
  }
  function drawPending() {
    chipWrap.querySelectorAll(".chip").forEach(c => c.remove());
    for (const t of pending) {
      chipWrap.insertBefore(el("span", { class: "chip tag" }, [
        t,
        el("button", {
          type: "button", "aria-label": `Don't add ${t}`, text: "✕",
          onclick: () => { pending.splice(pending.indexOf(t), 1); drawPending(); },
        }),
      ]), input);
    }
  }
  chipWrap.appendChild(input);

  // Existing tags, one tap each — faster and safer than retyping, and it stops
  // near-duplicates ("recipe" vs "recipes") creeping in.
  const existing = store.allTags();
  const existingWrap = el("div", { class: "tag-pick" },
    existing.slice(0, 40).map(t =>
      el("button", { type: "button", class: "btn", text: `#${t}`, onclick: () => addPending(t) })));

  sheet("Add tags to the selected entries", (close) => [
    el("h2", { text: `Add tags to ${sel.count} selected` }),
    el("div", { class: "field" }, [el("label", { text: "New tag" }), chipWrap]),
    existing.length
      ? el("div", { class: "field" }, [
          el("label", { text: "Or pick one you already use" }),
          existingWrap,
        ])
      : null,
    el("p", { class: "hint", text: "Tags are added — nothing already on those entries is removed." }),
    el("div", { class: "modal-actions" }, [
      el("div", { class: "spacer" }),
      el("button", { class: "btn", text: "Cancel", onclick: close }),
      el("button", {
        class: "btn btn-primary", text: "Add tags",
        onclick: () => {
          addPending(input.value); // don't lose a tag typed but not Entered
          if (pending.length === 0) {
            toast("Type or pick at least one tag first.", "info", 4000);
            return;
          }
          sel.applyTags(pending);
          close();
        },
      }),
    ]),
  ]);
  input.focus();
}

// ---- set status -------------------------------------------------------------
function openStatusSheet(sel, store) {
  sheet("Set the status of the selected entries", (close) => [
    el("h2", { text: `Set status on ${sel.count} selected` }),
    el("div", { class: "pick-list" },
      store.statuses().map(s =>
        el("button", {
          class: "btn pick-row", text: s.label,
          onclick: () => { sel.applyStatus(s.key); close(); },
        }))),
    el("p", { class: "hint", text: "This replaces the status on every selected entry." }),
    el("div", { class: "modal-actions" }, [
      el("div", { class: "spacer" }),
      el("button", { class: "btn", text: "Cancel", onclick: close }),
    ]),
  ]);
}

// ---- assign to a project ----------------------------------------------------
function openProjectSheet(sel, store) {
  const projects = store.projects();

  sheet("Add the selected entries to a project", (close) => [
    el("h2", { text: `Add ${sel.count} selected to a project` }),
    projects.length
      ? el("div", { class: "pick-list" },
          projects.map(p =>
            el("button", {
              class: "btn pick-row", text: `◆ ${p.title || "Untitled project"}`,
              onclick: () => { sel.applyProject(p.id); close(); },
            })))
      : el("p", { class: "hint", text: "You don't have any projects yet — make one below." }),
    el("div", { class: "modal-actions" }, [
      el("button", {
        class: "btn", text: "＋ New project…",
        onclick: () => {
          close();
          newProjectThenAssign(sel, store);
        },
      }),
      el("div", { class: "spacer" }),
      el("button", { class: "btn", text: "Cancel", onclick: close }),
    ]),
    el("p", { class: "hint", text: "An entry can belong to several projects at once, so this adds to whatever it's already in." }),
  ]);
}

function newProjectThenAssign(sel, store) {
  const nameInput = el("input", {
    type: "text", placeholder: "Project name", "aria-label": "New project name",
  });

  const s = sheet("New project", (close) => {
    const create = () => {
      const title = nameInput.value.trim();
      if (!title) { nameInput.focus(); return; }
      let pid;
      try {
        pid = store.createItem({ title, type: "project" });
      } catch (err) {
        toast("Couldn't create that project, so nothing was assigned.", "error", 9000, err.message);
        return;
      }
      close();
      sel.applyProject(pid);
    };
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); create(); } });
    return [
      el("h2", { text: "New project" }),
      el("div", { class: "field" }, [el("label", { text: "Name" }), nameInput]),
      el("div", { class: "modal-actions" }, [
        el("div", { class: "spacer" }),
        el("button", { class: "btn", text: "Cancel", onclick: close }),
        el("button", { class: "btn btn-primary", text: "Create and add", onclick: create }),
      ]),
    ];
  });
  nameInput.focus();
  return s;
}
