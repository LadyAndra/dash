// editor.js — the item detail/edit modal. Every text field is a plain
// <input>/<textarea>, which means the iOS/macOS keyboard dictation mic
// works in all of them for free — that's the "voice in everywhere" Tier 1
// story (§8). A read-aloud button covers voice out (§10).
//
// Most edits still write straight through to Store. Title and Notes are the
// exception: text input arrives once per keystroke, and writing every one of
// those drafts to the append-only log turns one human edit into a long stack
// of merge notes if another device later wins the field. Keep the live draft
// in the control, save after a short quiet spell, and always flush on blur or
// close. The final value is just as durable; the log is simply meaningful.

import { el, groundStyle } from "./views/shared.js";
import { resolveHex } from "./theme.js";
import { colorField } from "./ui/colorfield.js";
import { readAloud, itemToSpeech } from "./ui/readaloud.js";
import { toast } from "./ui/toast.js";
import { ingestFile, ingestSketchPNG, blobObjectURL } from "./blobs.js";
import { createSketchPad } from "./sketch.js";
import { midFromLinkLabel } from "./store.js";

const TEXT_SAVE_DELAY = 900;

// How a connection reads in the editor's list. Most links show as
// "label: Other thing". A milestone attachment stores the milestone's mid in
// the label — machine-readable, not human-readable — so it's translated back
// into the milestone's actual name here. The link is still shown and still
// removable, because it's real data and hiding it would make an attachment
// impossible to undo from the entry's own page.
function describeLink(store, link, target) {
  const name = target ? (target.title || "Untitled") : "(missing)";
  const mid = midFromLinkLabel(link.label);
  if (mid && target) {
    const ms = (target.milestones || []).find(x => x.mid === mid);
    return `phase: ${ms ? (ms.label || "untitled milestone") : "removed milestone"} · ${name}`;
  }
  return `${link.label ? link.label + ": " : ""}${name}`;
}

export function openEditor(store, itemId, opts = {}) {
  const isNew = !itemId;
  const id = itemId || store.createItem({});
  const item = store.get(id);
  if (!item) { toast("That item couldn't be found.", "error"); return; }

  store.touch(id);

  // Title and Notes keep their draft in the DOM while the person is typing.
  // One timer per field means ten keystrokes inside the quiet window become
  // one Store.setField operation. Blur and close flush immediately, so moving
  // on never leaves a draft waiting for the timer.
  const pendingText = new Map();

  function savedText(field) {
    const current = store.get(id);
    return field === "title" ? (current?.title || "") : (current?.body || "");
  }

  function commitText(field, value) {
    if (value === savedText(field)) return;
    store.setField(id, field, value);
  }

  function scheduleText(field, value) {
    const pending = pendingText.get(field);
    if (pending) clearTimeout(pending.timer);

    if (value === savedText(field)) {
      pendingText.delete(field);
      return;
    }

    const rec = { value, timer: null };
    rec.timer = setTimeout(() => {
      if (pendingText.get(field) !== rec) return;
      pendingText.delete(field);
      commitText(field, rec.value);
    }, TEXT_SAVE_DELAY);
    pendingText.set(field, rec);
  }

  function flushText(field) {
    const pending = pendingText.get(field);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingText.delete(field);
    commitText(field, pending.value);
  }

  function flushTextDrafts() {
    flushText("title");
    flushText("body");
  }

  function cancelTextDrafts() {
    for (const pending of pendingText.values()) clearTimeout(pending.timer);
    pendingText.clear();
  }

  // Clicking the backdrop closes the editor. Dragging to SELECT TEXT must not.
  //
  // A `click` fires on the nearest common ancestor of where the pointer went
  // down and where it came up. Start a selection drag inside the modal, let go
  // a few pixels past its edge, and that ancestor is the scrim — so the browser
  // reports "you clicked the backdrop" and the editor closed on you mid-select.
  //
  // The fix is to require BOTH ends of the gesture to be the scrim itself. A
  // real backdrop click always is; a selection drag out of the modal never is.
  let downOnScrim = false;
  const scrim = el("div", {
    class: "modal-scrim",
    onpointerdown: (e) => { downOnScrim = e.target === scrim; },
    onclick: (e) => { if (e.target === scrim && downOnScrim) close(); },
  });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Edit item" });

  // --- title ---
  const title = el("input", {
    type: "text", value: item.title, placeholder: "Title (or tap the mic on your keyboard and talk)",
    "aria-label": "Title",
    oninput: (e) => scheduleText("title", e.target.value),
    onblur: () => flushText("title"),
  });

  // --- type + status selects (from the editable registry §2.2) ---
  const typeSel = selectFromRegistry(store.types(), item.type, (v) => store.setField(id, "type", v), "Type");
  const statusSel = selectFromRegistry(store.statuses(), item.status, (v) => store.setField(id, "status", v), "Status");

  // --- body (dictation-friendly textarea) ---
  const body = el("textarea", {
    placeholder: "Write, or dictate with the keyboard mic…",
    "aria-label": "Notes",
    oninput: (e) => scheduleText("body", e.target.value),
    onblur: () => flushText("body"),
  });
  body.value = item.body;

  // --- due date + reminder (August 2026) ---
  // These existed in the data model from day one and had NO user interface,
  // which is why nothing ever appeared on the Home panel: there was no way to
  // put a date on an entry in the first place. Added here so the Today panel
  // has ordinary entries to show, not only project milestones.
  //
  // Stored as a timestamp, because that's the documented shape of dates.due
  // (the addendum keeps it deliberately different from a milestone's date-only
  // string). The picker is a plain day picker and the time is fixed at midday
  // local — midday rather than midnight so that no timezone conversion
  // anywhere can nudge the date onto the day before or after.
  const dayValue = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const atMidday = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0).toISOString() : null;
  };

  const dueInput = el("input", {
    type: "date", value: dayValue(item.dates?.due), "aria-label": "Due date",
    onchange: (e) => store.setField(id, "due", atMidday(e.target.value)),
  });
  const remindInput = el("input", {
    type: "date", value: dayValue(item.dates?.remind), "aria-label": "Reminder date",
    onchange: (e) => store.setField(id, "remind", atMidday(e.target.value)),
  });

  const datesRow = el("div", { class: "row" }, [
    el("div", { class: "field" }, [el("label", { text: "Due" }), dueInput]),
    el("div", { class: "field" }, [
      el("label", { text: "Remind me" }), remindInput,
      el("div", { class: "hint", text: "Both show up on your Home sheet." }),
    ]),
  ]);

  // --- tags (freeform, add/remove as set ops) ---
  const tagWrap = el("div", { class: "chip-input" });
  function renderTags() {
    tagWrap.querySelectorAll(".chip").forEach(n => n.remove());
    const current = store.get(id);
    for (const t of current.tags) {
      const chip = el("span", { class: "chip tag" }, [
        t,
        el("button", { type: "button", "aria-label": `Remove tag ${t}`, text: "✕",
          onclick: () => { store.removeFromSet(id, "tags", t); renderTags(); } }),
      ]);
      tagWrap.insertBefore(chip, tagInput);
    }
  }
  const tagInput = el("input", {
    type: "text", placeholder: "Add a tag, press Enter", "aria-label": "Add tag",
    onkeydown: (e) => {
      if (e.key === "Enter") { e.preventDefault(); commitPendingTag(); }
    },
    // Commit on blur too, so a tag typed then tapped-away-from still saves.
    onblur: () => commitPendingTag(),
  });

  // Save whatever is currently typed in the tag box as a tag. Called from
  // Enter, from blur, and from close() — so a tag can never be silently lost
  // just because the user didn't press Enter before moving on.
  function commitPendingTag() {
    const val = tagInput.value.trim();
    if (!val) return;
    store.addToSet(id, "tags", val);
    tagInput.value = "";
    renderTags();
  }
  tagWrap.appendChild(tagInput);

  // --- projects: dedicated assignment field (multi-select) ---
  // Shown only for non-project items (a project isn't assigned to itself).
  // An entry can be in several projects at once, so this is a set of chips
  // plus an "add" dropdown — mirroring how tags work, but constrained to
  // existing projects (with a quick "New project…" escape hatch).
  const projectWrap = el("div", { class: "chip-input" });
  function renderProjects() {
    projectWrap.querySelectorAll(".chip, .project-adder").forEach(n => n.remove());
    const assigned = store.projectsOf(id);
    for (const p of assigned) {
      // The project wears its OWN colour here, like it does on its page and in
      // the projects list. This used to be hardcoded to the green tint, which
      // made every project chip green no matter what colour you'd picked —
      // the one surface in Dash where a project didn't carry its own colour.
      //
      // groundStyle() also sets --ground-ink (the more readable of Dash's two
      // inks on that particular colour), and the `on-ground` class is what
      // makes the label and the ✕ read it. That pairing is what lets an
      // arbitrary picked hex land here and stay legible — a tint background
      // couldn't, because there is no tint variant of a custom colour, so the
      // text and the background would have come out the same colour.
      //
      // A project with no colour of its own still inherits its type's green,
      // so untouched projects look as they did.
      const chip = el("span", { class: "chip on-ground", style: groundStyle(store, p) }, [
        `◆ ${p.title || "Untitled project"}`,
        el("button", { type: "button", "aria-label": `Remove from ${p.title}`, text: "✕",
          onclick: () => { store.unassignFromProject(id, p.id); renderProjects(); } }),
      ]);
      projectWrap.appendChild(chip);
    }
    // adder: a select of projects this item isn't already in, + New project
    const assignedIds = new Set(assigned.map(p => p.id));
    const available = store.projects().filter(p => p.id !== id && !assignedIds.has(p.id));
    const adder = el("select", { class: "project-adder", "aria-label": "Assign to a project",
      onchange: (e) => {
        const v = e.target.value;
        if (v === "__new") { createProjectInline(store, (newId) => { store.assignToProject(id, newId); renderProjects(); }); }
        else if (v) { store.assignToProject(id, v); renderProjects(); }
        e.target.value = "";
      },
    }, [
      el("option", { value: "", text: assigned.length ? "＋ Add to another project…" : "＋ Assign to a project…" }),
      ...available.map(p => el("option", { value: p.id, text: p.title || "Untitled project" })),
      el("option", { value: "__new", text: "＋ New project…" }),
    ]);
    projectWrap.appendChild(adder);
  }
  const isProjectItem = store.get(id)?.type === "project";

  // --- links (connect to another item §2.1) ---
  const linkWrap = el("div", { class: "chip-input" });
  function renderLinks() {
    linkWrap.querySelectorAll(".chip").forEach(n => n.remove());
    const current = store.get(id);
    for (const l of current.links) {
      const target = store.get(l.target);
      const label = describeLink(store, l, target);
      const chip = el("span", { class: "chip" }, [
        label,
        el("button", { type: "button", "aria-label": "Remove link", text: "✕",
          onclick: () => { store.removeFromSet(id, "links", l); renderLinks(); } }),
      ]);
      linkWrap.insertBefore(chip, linkBtn);
    }
  }
  const linkBtn = el("button", { type: "button", class: "btn", text: "＋ Link to…",
    onclick: () => pickLink(store, id, () => renderLinks()) });
  linkWrap.appendChild(linkBtn);

  // --- attachments: images, PDFs, markdown, text — anything (§9 generalized) ---
  const attachWrap = el("div", { class: "attach-list" });
  const fileInput = el("input", {
    type: "file", multiple: "true", accept: "image/*,.pdf,.md,.txt,.markdown",
    style: "display:none",
    onchange: async (e) => {
      for (const file of e.target.files) {
        try {
          const rec = await ingestFile(file);
          store.addToSet(id, "attachments", rec);
          opts.sync?.queueBlob(rec.hash, rec.ext);
        } catch (err) {
          toast(`Couldn't attach "${file.name}".`, "error", 7000, err.message);
        }
      }
      fileInput.value = "";
      renderAttachments();
    },
  });
  const attachBtn = el("button", { type: "button", class: "btn", text: "＋ Attach files",
    onclick: () => fileInput.click() });

  async function renderAttachments() {
    attachWrap.innerHTML = "";
    const current = store.get(id);
    for (const a of current.attachments) {
      if (a.role === "sketch") continue; // the drawing has its own Sketch field
      attachWrap.appendChild(await attachmentChip(a, () => { store.removeFromSet(id, "attachments", a); renderAttachments(); }));
    }
  }

  // --- sketch page (§9): the warm-paper drawing canvas, only for sketches ---
  // Lazily created so non-sketch items pay nothing for it. Strokes autosave to
  // a PNG attachment (role:"sketch"); each save replaces the previous drawing
  // with a new content-addressed file (§2.1 immutability).
  let sketchPad = null;
  let sketchSaveTimer = null;
  let sketchBgUrl = null; // object URL for the loaded existing drawing (revoke on close)
  const sketchHolder = el("div", {});
  const sketchField = field("Sketch", sketchHolder,
    "The paper starts in view mode, so you can scroll straight past it. Tap Draw to sketch with your finger or Apple Pencil — it saves itself as you go.");

  function currentSketchAtt() {
    return (store.get(id)?.attachments || []).find(a => a.role === "sketch") || null;
  }

  async function ensureSketchPad() {
    if (sketchPad) return sketchPad;
    sketchPad = createSketchPad({ onDirty: scheduleSketchSave });
    sketchHolder.appendChild(sketchPad.root);
    sketchPad.mount();
    // continue an existing drawing, if there is one
    const att = currentSketchAtt();
    if (att) {
      sketchBgUrl = await blobObjectURL(att.hash);
      await sketchPad.loadBackground(sketchBgUrl);
    }
    return sketchPad;
  }

  function scheduleSketchSave() {
    clearTimeout(sketchSaveTimer);
    sketchSaveTimer = setTimeout(saveSketch, 900);
  }

  async function saveSketch() {
    if (!sketchPad || !sketchPad.hasChanges()) return;
    try {
      const blob = await sketchPad.toBlob();
      if (!blob) return;
      const buf = await blob.arrayBuffer();
      const rec = await ingestSketchPNG(buf);
      const prev = currentSketchAtt();
      // Add the new drawing, then drop the old one (order matters so an item
      // is never momentarily without its sketch).
      store.addToSet(id, "attachments", rec);
      if (prev && prev.hash !== rec.hash) store.removeFromSet(id, "attachments", prev);
      opts.sync?.queueBlob(rec.hash, rec.ext);
    } catch (err) {
      toast("Couldn't save the sketch just now — it's still on the page.", "error", 6000, err.message);
    }
  }

  // --- read aloud (voice out §10) ---
  const readBtn = el("button", { class: "icon-btn", "aria-label": "Read this item aloud", title: "Read aloud", text: "🔊",
    onclick: () => { flushTextDrafts(); readAloud(itemToSpeech(store.get(id), store)); } });

  // --- actions ---
  const del = el("button", { class: "btn btn-danger", text: "Delete",
    onclick: () => {
      if (confirm("Delete this item? It's kept in your history and can be recovered, but it will disappear from all views.")) {
        cancelTextDrafts();
        store.deleteItem(id); close();
      }
    } });
  const done = el("button", { class: "btn btn-primary", text: "Done", onclick: close });

  // --- colour (projects only) ---
  // A project wears its colour as a filled block on its own page, so this is
  // where the colour gets chosen — next to the name, in the same place you
  // came to change the name. Ordinary entries don't get this: they take their
  // colour from their type, which is what keeps a list of thirty notes from
  // turning into confetti. The `color` field exists on every item though, so
  // opening it up later is one condition, not a data change.
  const colourField = !isProjectItem ? null : field("Colour",
    colorField({
      value: item.color,
      fallback: resolveHex(item.color || store.typeDef(item.type)?.color || "green"),
      onChange: (hexValue) => store.setField(id, "color", hexValue),
      onReset: () => { store.setField(id, "color", null); toast("Back to the type's colour.", "success"); },
      resetLabel: "Use type colour",
      note: "Shown wherever this project appears. Pick anything — the readings below tell you how it will hold up.",
    }));

  modal.append(
    el("div", { style: "display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-3)" }, [
      el("h2", { text: isNew ? "New item" : "Edit item", style: "margin:0; flex:1" }),
      readBtn,
    ]),
    field("Title", title),
    colourField,
    el("div", { class: "row" }, [field("Type", typeSel), field("Status", statusSel)]),
    datesRow,
    field("Notes", body),
    sketchField,
    field("Files & images", el("div", {}, [attachWrap, fileInput, attachBtn]),
      "Attach photos, PDFs, or text/markdown files. Duplicates are detected automatically."),
    isProjectItem ? null : field("Projects", projectWrap, "Assign this to one or more projects. An entry can live in several projects at once."),
    field("Tags", tagWrap, "One item can carry many tags — that's how things relate without folders."),
    field("Connections", linkWrap, "Link this to related items — ideas to projects, projects to goals."),
    el("div", { class: "modal-actions" }, [del, el("div", { class: "spacer" }), done]),
  );

  renderTags();
  renderLinks();
  renderAttachments();
  if (!isProjectItem) renderProjects();
  // The drawing page is part of every item now, so set it up unconditionally.
  ensureSketchPad();

  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  title.focus();

  // Closing has to be safe to ask for twice, and has to clean up after itself
  // on EVERY path out — not just the one that happened to be written first.
  //
  // What was wrong before (found in the August 2026 code-health review): the
  // Escape listener below was only removed inside the Escape branch. Closing
  // with Done, with Delete, or by tapping the backdrop left it attached to the
  // document forever. Pressing Escape any time afterwards then ran close() a
  // second time on an editor that was already gone, and
  // `document.body.removeChild(scrim)` threw because the scrim was no longer a
  // child — which surfaced as the red "Something went wrong inside Dash"
  // banner, apparently out of nowhere. One orphaned listener also piled up per
  // editor you opened, for the life of the session.
  //
  // Three things fix it, and all three are worth keeping:
  //   1. `closed` makes close() idempotent, so a second call is a no-op rather
  //      than a half-run teardown (it would also have re-saved the sketch).
  //   2. The listener comes off at the TOP of close(), so every exit path
  //      cleans up, including ones added later.
  //   3. scrim.remove() instead of document.body.removeChild(scrim) — same
  //      result, but it can't throw if the node has already gone.
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", escClose);

    flushTextDrafts(); // final title/notes value must never wait behind close
    commitPendingTag(); // don't lose a tag the user typed but didn't Enter
    clearTimeout(sketchSaveTimer);
    if (sketchPad) { await saveSketch(); sketchPad.destroy(); }
    if (sketchBgUrl) URL.revokeObjectURL(sketchBgUrl);
    scrim.remove();
    opts.onClose && opts.onClose();
  }

  function escClose(e) {
    if (e.key !== "Escape") return;
    // Only the TOPMOST dialog answers Escape. The link picker, the inline
    // project creator and the bulk-action sheets all open their own scrim on
    // top of this one; without this check, Escape would close the editor
    // underneath them and leave the picker floating on its own with nothing
    // behind it.
    const scrims = document.querySelectorAll(".modal-scrim");
    if (scrims[scrims.length - 1] !== scrim) return;
    close();
  }
  document.addEventListener("keydown", escClose);
}

function field(label, control, hint) {
  return el("div", { class: "field" }, [
    el("label", { text: label }),
    control,
    hint ? el("div", { class: "hint", text: hint }) : null,
  ]);
}

// Create a new project inline (from the item editor's Projects field) without
// leaving the current item. Just needs a name; type is forced to "project".
function createProjectInline(store, onCreated) {
  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
  const nameInput = el("input", { type: "text", placeholder: "Project name", "aria-label": "New project name" });
  const create = () => {
    const title = nameInput.value.trim();
    if (!title) { nameInput.focus(); return; }
    const pid = store.createItem({ title, type: "project" });
    scrim.remove();
    onCreated(pid);
  };
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); create(); } });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "New project" }, [
    el("h2", { text: "New project" }),
    field("Name", nameInput),
    el("div", { class: "modal-actions" }, [
      el("div", { class: "spacer" }),
      el("button", { class: "btn", text: "Cancel", onclick: () => scrim.remove() }),
      el("button", { class: "btn btn-primary", text: "Create", onclick: create }),
    ]),
  ]);
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  nameInput.focus();
}

// Renders one attached file: an image gets a small thumbnail preview;
// a document (PDF/MD/TXT/etc.) gets an icon + name. Both open the real
// file in a new tab on click (browsers render PDFs/images/text natively —
// no viewer needs to be built). §9's "napkin" markup tool is a later phase;
// this is just safe, reliable storage + access.
async function attachmentChip(att, onRemove) {
  const url = await blobObjectURL(att.hash);
  const isImage = att.role === "image";
  const inner = isImage
    ? el("img", { src: url, alt: att.name || "attached image", class: "attach-thumb" })
    : el("div", { class: "attach-doc" }, [
        el("span", { class: "attach-doc-ext", text: (att.ext || "file").toUpperCase() }),
        el("span", { class: "attach-doc-name", text: att.name || `${att.hash.slice(0, 8)}.${att.ext}` }),
      ]);
  const link = el("a", { href: url || "#", target: "_blank", rel: "noopener", class: "attach-link" }, [inner]);
  const remove = el("button", { type: "button", class: "attach-remove", "aria-label": `Remove ${att.name || "attachment"}`, text: "✕", onclick: onRemove });
  return el("div", { class: "attach-chip" }, [link, remove]);
}

function selectFromRegistry(list, value, onChange, aria) {
  const sel = el("select", { "aria-label": aria, onchange: (e) => onChange(e.target.value) });
  for (const entry of list) {
    const opt = el("option", { value: entry.key, text: `${entry.icon ? entry.icon + " " : ""}${entry.label}` });
    if (entry.key === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

// Minimal link picker: choose another item to connect to, with an optional label.
function pickLink(store, fromId, done) {
  const others = store.all().filter(i => i.id !== fromId);
  if (others.length === 0) { toast("Create another item first, then you can link them.", "info"); return; }

  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Link to an item" });

  const search = el("input", { type: "text", placeholder: "Search items…", "aria-label": "Search items to link" });
  const labelInput = el("input", { type: "text", placeholder: "Relationship (optional): part of, blocks, inspired by…", "aria-label": "Relationship label" });
  const listWrap = el("div", {});

  function draw() {
    listWrap.innerHTML = "";
    const q = search.value.toLowerCase();
    const matches = others.filter(i => (i.title || "").toLowerCase().includes(q)).slice(0, 40);
    for (const it of matches) {
      listWrap.appendChild(el("div", {
        class: "finder-entry",
        onclick: () => {
          store.addToSet(fromId, "links", { target: it.id, label: labelInput.value.trim() });
          scrim.remove(); done();
        },
      }, [it.title || "Untitled"]));
    }
  }
  search.addEventListener("input", draw);
  draw();

  modal.append(
    el("h2", { text: "Link to…" }),
    field("Relationship", labelInput),
    field("Item", search),
    listWrap,
    el("div", { class: "modal-actions" }, [el("div", { class: "spacer" }), el("button", { class: "btn", text: "Cancel", onclick: () => scrim.remove() })]),
  );
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  search.focus();
}
