// editor.js — the item detail/edit modal. Every text field is a plain
// <input>/<textarea>, which means the iOS/macOS keyboard dictation mic
// works in all of them for free — that's the "voice in everywhere" Tier 1
// story (§8). A read-aloud button covers voice out (§10).
//
// Edits call store methods directly (setField / addToSet / removeFromSet),
// so each keystroke-save is one operation and sync/merge just works (§6).

import { el } from "./views/shared.js";
import { colorToken } from "./theme.js";
import { readAloud, itemToSpeech } from "./ui/readaloud.js";
import { toast } from "./ui/toast.js";

export function openEditor(store, itemId, opts = {}) {
  const isNew = !itemId;
  const id = itemId || store.createItem({});
  const item = store.get(id);
  if (!item) { toast("That item couldn't be found.", "error"); return; }

  store.touch(id);

  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) close(); } });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Edit item" });

  // --- title ---
  const title = el("input", {
    type: "text", value: item.title, placeholder: "Title (or tap the mic on your keyboard and talk)",
    "aria-label": "Title",
    oninput: (e) => store.setField(id, "title", e.target.value),
  });

  // --- type + status selects (from the editable registry §2.2) ---
  const typeSel = selectFromRegistry(store.types(), item.type, (v) => store.setField(id, "type", v), "Type");
  const statusSel = selectFromRegistry(store.statuses(), item.status, (v) => store.setField(id, "status", v), "Status");

  // --- body (dictation-friendly textarea) ---
  const body = el("textarea", {
    placeholder: "Write, or dictate with the keyboard mic…",
    "aria-label": "Notes",
    oninput: (e) => store.setField(id, "body", e.target.value),
  });
  body.value = item.body;

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
      if (e.key === "Enter" && e.target.value.trim()) {
        e.preventDefault();
        store.addToSet(id, "tags", e.target.value.trim());
        e.target.value = "";
        renderTags();
      }
    },
  });
  tagWrap.appendChild(tagInput);

  // --- links (connect to another item §2.1) ---
  const linkWrap = el("div", { class: "chip-input" });
  function renderLinks() {
    linkWrap.querySelectorAll(".chip").forEach(n => n.remove());
    const current = store.get(id);
    for (const l of current.links) {
      const target = store.get(l.target);
      const label = `${l.label ? l.label + ": " : ""}${target ? (target.title || "Untitled") : "(missing)"}`;
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

  // --- read aloud (voice out §10) ---
  const readBtn = el("button", { class: "icon-btn", "aria-label": "Read this item aloud", title: "Read aloud", text: "🔊",
    onclick: () => readAloud(itemToSpeech(store.get(id), store)) });

  // --- actions ---
  const del = el("button", { class: "btn btn-danger", text: "Delete",
    onclick: () => {
      if (confirm("Delete this item? It's kept in your history and can be recovered, but it will disappear from all views.")) {
        store.deleteItem(id); close();
      }
    } });
  const done = el("button", { class: "btn btn-primary", text: "Done", onclick: close });

  modal.append(
    el("div", { style: "display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-3)" }, [
      el("h2", { text: isNew ? "New item" : "Edit item", style: "margin:0; flex:1" }),
      readBtn,
    ]),
    field("Title", title),
    el("div", { class: "row" }, [field("Type", typeSel), field("Status", statusSel)]),
    field("Notes", body),
    field("Tags", tagWrap, "One item can carry many tags — that's how things relate without folders."),
    field("Connections", linkWrap, "Link this to related items — ideas to projects, projects to goals."),
    el("div", { class: "modal-actions" }, [del, el("div", { class: "spacer" }), done]),
  );

  renderTags();
  renderLinks();

  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  title.focus();

  function close() {
    document.body.removeChild(scrim);
    opts.onClose && opts.onClose();
  }
  document.addEventListener("keydown", escClose);
  function escClose(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", escClose); } }
}

function field(label, control, hint) {
  return el("div", { class: "field" }, [
    el("label", { text: label }),
    control,
    hint ? el("div", { class: "hint", text: hint }) : null,
  ]);
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
