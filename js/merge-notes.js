// merge-notes.js — "nothing is ever silently unrecoverable" (§6.1).
// ===================================================================
// When the same field of the same thing is edited on two devices while both
// are offline, one value wins and one loses. The winner is decided by the
// hybrid clock and is not negotiable — but the loser must never just vanish.
// The store records it (Store._noteCollision); this file is the small window
// that shows those records and offers to put one back.
//
// Scope note: the original proposal parks a full merge-notes UI in Phase 4.
// This is deliberately the small version — a list, a restore, a dismiss —
// built now because Phase M1's two-device milestone test is unverifiable
// without a way to SEE a collision. The plumbing (the recorded note, the
// restore path) is what Phase 4 will build a richer surface on top of.
//
// Restoring is not a special merge path: it writes the losing value back as
// an ordinary edit with a fresh timestamp, so it wins cleanly on every device
// exactly like any other edit.

import { el } from "./views/shared.js";
import { formatDay } from "./milestones.js";

// Older Dash builds wrote Title and Notes once per keystroke. If that device's
// edit later lost to another device, every intermediate draft became its own
// collision record: "B", "Bo", "Bow"... all describing the same human edit.
//
// The store is append-only on purpose, so do NOT erase that history. Instead,
// collapse only records that are provably the same conflict episode:
//   - same item/sub-record + field
//   - same losing device
//   - same winning device AND exact winning timestamp
//
// In other words, one device made several sequential drafts and every one of
// them lost to the very same kept edit. The latest losing draft is the useful
// alternative; the earlier drafts are typing history, not separate decisions.
// A later real conflict has a different keptAt and therefore remains separate.
export function coalescedMergeNotes(notes) {
  const groups = new Map();

  for (const note of notes || []) {
    const address = [
      note.itemId || "",
      note.mid || "",
      note.vsKey || "",
      note.coll || "",
      note.dkId || "",
      note.field || "",
    ].join("\u001f");

    // Very old/partial records without a winning timestamp are kept one-for-one
    // rather than guessed at. Safety beats tidiness when we cannot prove the
    // records belong to the same collision episode.
    const episode = note.keptAt
      ? [address, note.lostDevice || "", note.keptDevice || "", note.keptAt].join("\u001e")
      : `single:${note.key}`;

    let group = groups.get(episode);
    if (!group) {
      group = { ...note, keys: [note.key] };
      groups.set(episode, group);
      continue;
    }

    group.keys.push(note.key);

    // Keep the final draft from the losing device. ISO timestamps sort in the
    // same order as time here, but Date parsing makes the intent explicit and
    // tolerates a missing/odd timestamp without throwing.
    const oldTime = Date.parse(group.lostAt || "") || 0;
    const newTime = Date.parse(note.lostAt || "") || 0;
    const oldSeen = Date.parse(group.seenAt || "") || 0;
    const newSeen = Date.parse(note.seenAt || "") || 0;
    const latestSeenAt = newSeen > oldSeen ? note.seenAt : group.seenAt;
    if (newTime > oldTime) {
      const keys = group.keys;
      Object.assign(group, note);
      group.keys = keys;
    }

    // seenAt is UI metadata. Keep the most recent time Dash noticed any member
    // of the group so the card still sorts where the underlying records did.
    group.seenAt = latestSeenAt;
  }

  return [...groups.values()].sort((a, b) =>
    (Date.parse(b.seenAt || "") || 0) - (Date.parse(a.seenAt || "") || 0)
  );
}

export function mergeNoteCount(store) {
  return coalescedMergeNotes(store.collisions()).length;
}

export function openMergeNotes(store, onDone = () => {}) {
  const scrim = el("div", {
    class: "modal-scrim",
    onclick: (e) => { if (e.target === scrim) close(); },
  });

  function close() { scrim.remove(); onDone(); }

  const list = el("div", { class: "merge-list" });

  function dismissWholeEpisode(n) {
    for (const key of n.keys || [n.key]) store.dismissCollision(key);
  }

  function restoreWholeEpisode(n) {
    const keys = n.keys || [n.key];
    if (!store.restoreCollision(n.key)) return false;
    // restoreCollision dismisses the representative itself. Resolve the hidden
    // per-keystroke drafts too, otherwise the next one would simply appear as
    // soon as the card redraws.
    for (const key of keys) {
      if (key !== n.key) store.dismissCollision(key);
    }
    return true;
  }

  function draw() {
    list.innerHTML = "";
    const notes = coalescedMergeNotes(store.collisions());

    if (notes.length === 0) {
      list.appendChild(el("p", {
        class: "hint",
        text: "Nothing to look at — no edit has been overwritten by another device.",
      }));
      return;
    }

    for (const n of notes) {
      const row = el("div", { class: "merge-note" }, [
        el("div", { class: "merge-note-head" }, [
          el("span", { class: "mk mk-ember", text: "Overwritten" }),
          el("span", { class: "num", text: whenText(n.seenAt) }),
        ]),
        el("h3", { class: "item-title", text: n.itemTitle }),
        el("p", { class: "merge-note-what", text: describe(n) }),
        el("div", { class: "merge-note-values" }, [
          valueBlock("Kept", n.keptValue, n.keptDevice, n.keptAt),
          valueBlock("Replaced", n.lostValue, n.lostDevice, n.lostAt),
        ]),
        el("div", { class: "merge-note-actions" }, [
          el("button", {
            class: "btn",
            text: "Put the replaced one back",
            onclick: () => {
              if (restoreWholeEpisode(n)) draw();
            },
          }),
          el("div", { class: "spacer" }),
          el("button", {
            class: "btn",
            text: "That's fine",
            "aria-label": `Dismiss the note about ${n.itemTitle}`,
            onclick: () => { dismissWholeEpisode(n); draw(); },
          }),
        ]),
      ]);
      list.appendChild(row);
    }
  }

  draw();

  const modal = el("div", {
    class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Merge notes",
  }, [
    el("h2", { text: "Merge notes" }),
    el("p", {
      class: "hint",
      text: "When you edit the same thing on two devices while they're apart, Dash keeps the later edit. " +
            "The earlier one is listed here so you can put it back if it was the one you wanted. " +
            "Both versions stay in your data files either way.",
    }),
    list,
    el("div", { class: "modal-actions" }, [
      el("button", {
        class: "btn", text: "Clear the list",
        onclick: () => { store.clearCollisions(); draw(); },
      }),
      el("div", { class: "spacer" }),
      el("button", { class: "btn btn-primary", text: "Close", onclick: close }),
    ]),
  ]);

  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  return scrim;
}

// ---------- plain-English rendering ----------

const FIELD_NAMES = {
  title: "the title", body: "the notes", status: "the status", type: "the type",
  due: "the due date", remind: "the reminder",
  label: "name", date: "date", done: "done", order: "position", removed: "removed",
  // the desk (Phase D1/D2). `pos` and `clip` are shared by cards and post-its,
  // and read the same way for both.
  pos: "where it sits", z: "which is on top",
  clip: "which clip it's in", text: "the words on it",
  offset: "where it sits on the clip",
};

function describe(n) {
  if (n.mid) {
    const parts = String(n.what || "").split(" · ");
    const msName = (parts[0] || "a milestone").trim();
    const field = FIELD_NAMES[n.field] || n.field;
    return `Milestone “${msName || "untitled"}” — its ${field} was edited on two devices.`;
  }
  return `${capitalize(FIELD_NAMES[n.field] || n.field)} was edited on two devices.`;
}

function valueBlock(heading, value, device, at) {
  return el("div", { class: "merge-value" }, [
    el("span", { class: "mk", text: heading }),
    el("div", { class: "merge-value-text", text: showValue(value) }),
    el("span", { class: "num", text: `${device || "another device"} · ${whenText(at)}` }),
  ]);
}

// Values here are whatever the field holds: text, a date-only string, a
// timestamp (a done mark), a number (a position), or null.
function showValue(v) {
  if (v === null || v === undefined || v === "") return "— empty —";
  if (typeof v === "number") return String(Math.round(v));
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDay(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return whenText(v);
    return v.length > 240 ? v.slice(0, 240) + "…" : v;
  }
  try { return JSON.stringify(v); } catch { return String(v); }
}

function whenText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
