// store.js — the in-memory item index + the operation/merge engine.
// =================================================================
// This is the heart of Dash. It knows nothing about rendering (§4.1).
// Design contract it implements:
//   - Everything is an Item (§2.1).
//   - Every change is an append-only operation line (§3, §6.1):
//       { op, itemId, field?, value?, ts }
//     Ops are kept per-device in memory and flushed to that device's
//     OWN log file only (sync.js owns the file I/O). One writer per
//     file  ->  iCloud never has to merge a file  ->  no "Conflicted
//     Copy" surprises.
//   - Merge is deterministic (§6.1):
//       scalars  -> last-writer-wins per field (hybrid clock)
//       sets     -> add/remove ops (tags, links, attachments)
//       deletes  -> tombstone, never erased (§13.2 #8)
//   - formatVersion stamped from day one (§13.2 #1).
//
// The store is intentionally boring and explicit (§13.1). Comments say
// WHY and cite the proposal so a future AI session can follow along.
//
// AUGUST 2026 — Phase M1 of the milestones addendum added the "ms" op kind
// (project milestones) and the merge-notes record. Both are pure extensions:
// nothing existing is reinterpreted, so old logs and old snapshots stay valid
// byte for byte (addendum §4.3, §9).

import { ulid } from "./ulid.js";
import { now as clockNow, compare as clockCompare } from "./clock.js";
import { nextOrder } from "./milestones.js";

// 1 -> 2 in August 2026: adds the "ms" op kind and the optional milestones
// array on project items (addendum §4.3). This marks CAPABILITY, not
// incompatibility — see loadSnapshot() for how a version mismatch is handled.
export const FORMAT_VERSION = 2;

// The dedicated "Project" type. An entry assigned to a project links to it
// with the PROJECT_LINK relationship label, which lets us tell project
// membership apart from generic "see also" connections.
export const PROJECT_TYPE = "project";
export const PROJECT_LINK = "in project";

// ---- entries attached to a milestone (August 2026) ----
// An entry joins a PHASE of a project the same way it joins the project: with
// a link. The label carries the milestone's mid, so the link is
// { target: <projectId>, label: "phase:<mid>" }.
//
// Why a link and not a list on the milestone: `links` is already a set field
// with add/remove op semantics (§6.1), so attaching on one device while
// attaching something else on another merges with no new op kind, no new merge
// rule, and no format bump. It also keeps the relationship in exactly ONE
// place — the entry's own links — so there is nothing that can drift out of
// step with anything else.
//
// A consequence worth knowing rather than fighting: an entry can end up on
// more than one phase. Set-merge means two devices assigning the same entry to
// different phases while offline BOTH survive; "only one phase" could not be
// enforced without inventing a conflict where the model says there isn't one.
export const MILESTONE_LINK_PREFIX = "phase:";
export function milestoneLinkLabel(mid) { return MILESTONE_LINK_PREFIX + mid; }
export function midFromLinkLabel(label) {
  return (typeof label === "string" && label.startsWith(MILESTONE_LINK_PREFIX))
    ? label.slice(MILESTONE_LINK_PREFIX.length)
    : null;
}

// ---- op kinds (extend, never repurpose — §13.2 #1) ----
export const OP = {
  CREATE: "create",   // value = full skeleton item
  SET:    "set",      // field + value  (scalar LWW)
  ADD:    "add",      // field (a set) + value (element)
  REMOVE: "remove",   // field (a set) + value (element)
  DELETE: "delete",   // tombstone the item
  MS:     "ms",       // milestone sub-record: action add | set | remove
};

// `color` (August 2026) is a per-item override of the colour an item is drawn
// in. Null means "use my type's colour", which is what every item did before
// this field existed and what every item still does until you pick something —
// so there is no migration, and an older device that receives a `set color`
// op applies it harmlessly and simply doesn't draw it. The value is a NAME
// from the palette ("clay", "plum"…), never a hex code, so it re-themes with
// everything else (see colorToken in js/theme.js).
const SCALAR_FIELDS = new Set(["type", "status", "title", "body", "due", "remind", "color"]);
const SET_FIELDS = new Set(["tags", "links", "attachments"]);

// `due` and `remind` live INSIDE item.dates, not at the top level.
//
// This is a bug fix, August 2026. They were listed as ordinary scalar fields,
// so a `set` op wrote item.due — while every reader in the app (the Home
// panel, the query layer, this file's own emptyItem) looked at
// item.dates.due. The two never met. Nothing had ever noticed because the
// editor had no due-date field at all, so no set op for them was ever
// written; the moment the Today panel needed them, it surfaced immediately.
// Routing them here keeps the op shape identical — `{ field: "due" }` on the
// wire, exactly as before — so old logs, LWW bookkeeping and merge are all
// unaffected.
const DATE_SCALARS = new Set(["due", "remind"]);

// The only fields a milestone `set` op may touch (addendum §2.1). `mid` and
// `created` are write-once at add time and deliberately not settable.
const MS_FIELDS = new Set(["label", "date", "remind", "done", "order", "removed"]);

// Where this device's merge notes are kept between reloads. Per-device on
// purpose, like every other localStorage key in Dash: a merge note is an
// inbox for the person sitting at THIS device, not content to be synced.
const MERGE_NOTES_KEY = "dash.mergeNotes";
const MERGE_NOTES_MAX = 60;

function emptyItem(id) {
  return {
    id,
    type: "note",
    status: "active",
    title: "",
    body: "",
    color: null,        // null = inherit the type's colour (see SCALAR_FIELDS)
    tags: [],
    links: [],
    attachments: [],
    dates: { created: null, modified: null, touched: null, due: null, remind: null },
    source: null,
    viewState: {},
    _deleted: false,
    // per-field winning timestamps, so LWW is decided without re-reading logs
    _fieldTs: {},
    // NOTE: there is deliberately NO `milestones: []` here. Missing means
    // empty (addendum §9), so the field only ever appears on an item once a
    // real `ms add` op materialises it. That is what makes "no migration"
    // true rather than aspirational.
  };
}

export class Store {
  constructor() {
    this.items = new Map();       // id -> item
    this.registry = defaultRegistry();
    this.pendingOps = [];         // ops made on THIS device, not yet flushed
    this._listeners = new Set();
    this._actionListeners = new Set();
    this._registryTs = {};        // LWW bookkeeping for registry edits
    this._collisions = loadMergeNotes();
    this._collisionKeys = new Set(this._collisions.map(c => c.key));
    this.formatNotice = null;     // set if a newer snapshot turns up (see loadSnapshot)
  }

  // ---- subscription: views re-render on change ----
  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(); }

  // ---- ambient action channel (the Home cluster's pet listens here) ----
  // Deliberately separate from subscribe(). subscribe() answers "something
  // changed, redraw"; this answers "*this specific thing* just happened", which
  // is what a reaction needs — a new entry should feel different from a tag.
  //
  // It writes NOTHING. No op, no log line, no field, no sync. It fires only on
  // local edits made on this device (replaying another device's log doesn't
  // trigger it), so the pet reacts to what YOU just did, not to a background
  // sync landing. A listener that throws is swallowed: a decorative widget
  // must never be able to break an edit.
  onAction(fn) { this._actionListeners.add(fn); return () => this._actionListeners.delete(fn); }
  _action(kind, detail) {
    for (const fn of this._actionListeners) { try { fn(kind, detail); } catch {} }
  }

  // Does this status mean "finished"? Statuses are user-editable data (§2.2),
  // so there's no fixed key to match — we look at the key and label instead.
  // Getting it wrong is harmless: the pet plays a smaller animation.
  isDoneStatus(key) {
    const def = this.statusDef(key);
    const text = `${key || ""} ${def?.label || ""}`.toLowerCase();
    return /\b(done|complete|completed|finished|resolved|shipped|closed|archived)\b/.test(text);
  }

  // =====================================================
  //  READING
  // =====================================================
  get(id) { const it = this.items.get(id); return it && !it._deleted ? it : null; }

  all() {
    const out = [];
    for (const it of this.items.values()) if (!it._deleted) out.push(it);
    return out;
  }

  allTags() {
    const set = new Set();
    for (const it of this.all()) for (const t of it.tags) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  // ---- Accession numbers (the catalog № on every entry) ----
  // A permanent register: each item's number is its position in creation
  // order, 1-based. ULIDs sort lexicographically by creation time, so the
  // order is just the sorted ids. Tombstoned (deleted) items are KEPT in the
  // ranking on purpose — that's what keeps numbers stable: removing an item
  // never renumbers the ones after it, and a new capture always takes the
  // next number up. Same item set → same numbers on every device (§ eventual
  // consistency). Cheap: the index is cached and only rebuilt when the number
  // of known items changes.
  accessionNo(id) {
    if (!this._accession || this._accession.size !== this.items.size) {
      const ids = [...this.items.keys()].sort();   // ULID order = creation order
      const map = new Map();
      ids.forEach((k, i) => map.set(k, i + 1));
      this._accession = { size: this.items.size, map };
    }
    const n = this._accession.map.get(id);
    return n ? String(n).padStart(4, "0") : "----";
  }

  types() { return this.registry.types; }
  statuses() { return this.registry.statuses; }
  typeDef(key) { return this.registry.types.find(t => t.key === key) || null; }
  statusDef(key) { return this.registry.statuses.find(s => s.key === key) || null; }

  // ---- Projects (§ dedicated Project type) ----
  // A "project" is simply any item whose type is PROJECT_TYPE. Assignment is a
  // link from the entry to the project, so one entry can belong to many
  // projects at once (links is a set). These helpers keep that rule in ONE
  // place so the editor, the Project view, and counts all agree.
  projects() {
    return this.all()
      .filter(it => it.type === PROJECT_TYPE)
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }
  isProject(id) { const it = this.get(id); return !!it && it.type === PROJECT_TYPE; }

  // the projects an entry is assigned to (only membership links count, and
  // each project appears once even if linked more than once)
  projectsOf(id) {
    const it = this.get(id);
    if (!it) return [];
    const seen = new Set();
    const out = [];
    for (const l of it.links) {
      if (l.label !== PROJECT_LINK) continue;      // ignore generic "see also" links
      if (seen.has(l.target)) continue;            // dedupe
      const p = this.get(l.target);
      if (p && p.type === PROJECT_TYPE) { seen.add(l.target); out.push(p); }
    }
    return out;
  }

  // assign / unassign an entry to a project (idempotent; safe to call twice)
  assignToProject(entryId, projectId) {
    if (entryId === projectId) return; // a project can't be its own member
    const already = this.get(entryId)?.links.some(l => l.target === projectId && l.label === PROJECT_LINK);
    if (!already) this.addToSet(entryId, "links", { target: projectId, label: PROJECT_LINK });
  }
  unassignFromProject(entryId, projectId) {
    const it = this.get(entryId);
    if (!it) return;
    for (const l of it.links.filter(l => l.target === projectId)) {
      this.removeFromSet(entryId, "links", l);
    }
  }

  // =====================================================
  //  WRITING  (each produces one or more ops)
  // =====================================================
  createItem(partial = {}) {
    const id = ulid();
    const ts = clockNow();
    const iso = new Date(ts.wall).toISOString();
    const skeleton = emptyItem(id);
    skeleton.type = partial.type || this.registry.types[0]?.key || "note";
    skeleton.status = partial.status || this.registry.statuses[0]?.key || "active";
    skeleton.title = partial.title || "";
    skeleton.body = partial.body || "";
    skeleton.dates.created = iso;
    skeleton.dates.modified = iso;
    skeleton.dates.touched = iso;

    this._applyOp({ op: OP.CREATE, itemId: id, value: skeleton, ts }, true);

    // optional initial sets
    for (const tag of partial.tags || []) this.addToSet(id, "tags", tag);
    this._action("create", { id });
    return id;
  }

  setField(id, field, value) {
    if (!SCALAR_FIELDS.has(field)) throw new Error(`setField: '${field}' is not a scalar field`);
    this._applyOp({ op: OP.SET, itemId: id, field, value, ts: clockNow() }, true);
    if (field === "status") this._action(this.isDoneStatus(value) ? "done" : "status", { id, value });
    else this._action("edit", { id, field });
  }

  addToSet(id, field, value) {
    if (!SET_FIELDS.has(field)) throw new Error(`addToSet: '${field}' is not a set field`);
    this._applyOp({ op: OP.ADD, itemId: id, field, value, ts: clockNow() }, true);
    this._action({ tags: "tag", links: "link", attachments: "attach" }[field] || "edit", { id, field, value });
  }

  removeFromSet(id, field, value) {
    if (!SET_FIELDS.has(field)) throw new Error(`removeFromSet: '${field}' is not a set field`);
    this._applyOp({ op: OP.REMOVE, itemId: id, field, value, ts: clockNow() }, true);
    this._action("edit", { id, field });
  }

  deleteItem(id) {
    // tombstone only — never erase (§13.2 #8)
    this._applyOp({ op: OP.DELETE, itemId: id, ts: clockNow() }, true);
    this._action("delete", { id });
  }

  // "touched" feeds the future Heat view (§2.1). Cheap, silent, not synced
  // as a conflict-worthy field — recorded as a normal set op with LWW.
  touch(id) {
    const it = this.items.get(id);
    if (!it || it._deleted) return;
    const ts = clockNow();
    it.dates.touched = new Date(ts.wall).toISOString();
    // touch is intentionally NOT logged every open to avoid log bloat;
    // it is persisted with the next snapshot. (Kept local + best-effort.)
  }

  // ---- entries attached to a phase of a project ----
  // Being on a phase implies being in the project, so this adds both links.
  // Idempotent: safe to call twice.
  attachToMilestone(entryId, projectId, mid) {
    if (!entryId || !projectId || !mid) return;
    if (entryId === projectId) return;              // a project can't be its own member
    this.assignToProject(entryId, projectId);
    const label = milestoneLinkLabel(mid);
    const already = this.get(entryId)?.links.some(l => l.target === projectId && l.label === label);
    if (!already) this.addToSet(entryId, "links", { target: projectId, label });
  }

  // Removes the entry from the phase only. It stays in the project — taking
  // something out of a phase is not the same as taking it out of the project,
  // and guessing otherwise would silently lose an assignment.
  detachFromMilestone(entryId, projectId, mid) {
    const it = this.get(entryId);
    if (!it) return;
    const label = milestoneLinkLabel(mid);
    for (const l of it.links.filter(l => l.target === projectId && l.label === label)) {
      this.removeFromSet(entryId, "links", l);
    }
  }

  // Which entries sit on which phase of this project, as mid -> [items].
  //
  // ONE pass over the archive, on purpose. Asking "what's on this phase?" per
  // milestone would scan every item once per milestone — the exact bug the pet
  // widget had with bulk edits, and the standing rule in the current-state doc
  // says to assume any new store scanner has it until proven otherwise. The
  // milestone editor calls this once per render and reads the map.
  milestoneMembership(projectId) {
    const map = new Map();
    for (const it of this.all()) {
      if (it.id === projectId) continue;
      for (const l of it.links) {
        if (l.target !== projectId) continue;
        const mid = midFromLinkLabel(l.label);
        if (!mid) continue;
        if (!map.has(mid)) map.set(mid, []);
        const bucket = map.get(mid);
        if (!bucket.includes(it)) bucket.push(it);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    return map;
  }

  // The phases of a given project that this entry is on (mids).
  milestonesOfEntry(entryId, projectId) {
    const it = this.get(entryId);
    if (!it) return [];
    const out = [];
    for (const l of it.links) {
      if (l.target !== projectId) continue;
      const mid = midFromLinkLabel(l.label);
      if (mid && !out.includes(mid)) out.push(mid);
    }
    return out;
  }

  // =====================================================
  //  MILESTONES (addendum §2, §3, §4)
  // =====================================================
  // Three actions cover everything, on purpose (addendum §4.1): there is no
  // separate "mark done" op (done is a `set` on the done field), and no
  // "reorder" op (a reorder is a `set` on ONE milestone's order field). Every
  // new op kind is future merge-code surface, so the set is kept minimal.

  // Missing array means empty array, everywhere, always (§9). Callers get a
  // real array back so nothing downstream has to null-check.
  milestonesOf(id) {
    const it = this.get(id);
    return it && it.milestones ? it.milestones : [];
  }

  milestone(id, mid) {
    return this.milestonesOf(id).find(m => m.mid === mid) || null;
  }

  // Append a milestone. Returns its mid so the caller can focus the new row.
  addMilestone(id, partial = {}) {
    const mid = ulid();
    const ts = clockNow();
    const value = {
      label:   partial.label || "",
      date:    partial.date || null,
      remind:  partial.remind || null,
      order:   typeof partial.order === "number" ? partial.order : nextOrder(this.milestonesOf(id)),
      created: new Date(ts.wall).toISOString(),
    };
    this._applyOp({ op: OP.MS, action: "add", itemId: id, mid, value, ts }, true);
    this._action("edit", { id, field: "milestones" });
    return mid;
  }

  setMilestoneField(id, mid, field, value) {
    if (!MS_FIELDS.has(field)) throw new Error(`setMilestoneField: '${field}' is not a milestone field`);
    this._applyOp({ op: OP.MS, action: "set", itemId: id, mid, field, value, ts: clockNow() }, true);
    // Ticking a milestone off IS a specific thing you just did, so the pet
    // gets the same signal as finishing an item. Every other milestone edit is
    // an ordinary edit. Overdue-ness deliberately never reaches the pet
    // (addendum §8) — that is the indicator channel's job, not the pet's.
    if (field === "done" && value) this._action("done", { id, mid });
    else this._action("edit", { id, field: "milestones", mid });
  }

  // Tombstone, never erase (§13.2 #8 / addendum §2.1). The editor's "removed
  // milestones" drawer restores one by clearing the field again.
  removeMilestone(id, mid) {
    this._applyOp({ op: OP.MS, action: "remove", itemId: id, mid, ts: clockNow() }, true);
    this._action("edit", { id, field: "milestones", mid });
  }

  restoreMilestone(id, mid) {
    this.setMilestoneField(id, mid, "removed", null);
  }

  // The rare precision-exhaustion repair (addendum §3.2): one `set` per
  // milestone, re-spacing the whole list to fresh 1000s. Legal, rare,
  // self-healing — and NOT what an ordinary reorder does.
  renumberMilestones(id, pairs) {
    for (const { mid, order } of pairs) this.setMilestoneField(id, mid, "order", order);
  }

  // =====================================================
  //  OP APPLICATION  (used by both local edits and log replay)
  //  local=true  -> also queue to pendingOps for flushing
  // =====================================================
  _applyOp(op, local = false) {
    switch (op.op) {
      case OP.CREATE: {
        const existing = this.items.get(op.itemId);
        if (!existing) {
          const it = emptyItem(op.itemId);
          Object.assign(it, structuredCloneSafe(op.value));
          it._fieldTs = {};
          it._fieldTs.__create = op.ts;
          this.items.set(op.itemId, it);
          break;
        }
        // The item is already here. Two ways that happens:
        //   - This exact create is being replayed again. Nothing to do.
        //   - An EDIT for this item arrived before its create did, and
        //     _ensure() conjured a blank to hold it. Log files are read
        //     independently and can arrive in any sequence, so this is normal,
        //     not corruption — but the old code skipped the create outright
        //     and the item silently kept the blank's title and type forever.
        //     (Found August 2026 by the Phase M1 out-of-order replay tests.)
        // Same blank-filling rule as a milestone `add` (addendum §4.2): the
        // skeleton only supplies fields nothing later has already claimed.
        if (existing._fieldTs.__create) break;
        existing._fieldTs.__create = op.ts;
        fillCreateBlanks(existing, structuredCloneSafe(op.value || {}));
        break;
      }
      case OP.SET: {
        const it = this._ensure(op.itemId);
        if (this._winsLWW(it, op.field, op.ts)) {
          if (DATE_SCALARS.has(op.field)) it.dates[op.field] = op.value;
          else it[op.field] = op.value;
          it._fieldTs[op.field] = op.ts;
          this._bumpModified(it, op.ts);
        } else {
          this._noteCollision(it, op.field, op, { label: op.field });
        }
        break;
      }
      case OP.ADD: {
        const it = this._ensure(op.itemId);
        applySetAdd(it, op.field, op.value);
        this._bumpModified(it, op.ts);
        break;
      }
      case OP.REMOVE: {
        const it = this._ensure(op.itemId);
        applySetRemove(it, op.field, op.value);
        this._bumpModified(it, op.ts);
        break;
      }
      case OP.DELETE: {
        const it = this._ensure(op.itemId);
        it._deleted = true;
        break;
      }
      case OP.MS: {
        const it = this._ensure(op.itemId);
        this._applyMilestoneOp(it, op);
        this._bumpModified(it, op.ts);
        break;
      }
      default:
        // Forward compatibility (§13.2 #1, addendum §4.3): an op kind this
        // build doesn't know is IGNORED AND PRESERVED, never an error. The op
        // stays in the append-only log, so it materialises the moment this
        // device updates. Nothing is lost by being behind.
        console.warn("unknown op kind (ignored, forward-compat):", op.op);
    }
    if (local) { this.pendingOps.push(op); this._emit(); }
    return op;
  }

  // ---- the milestone merge rules (addendum §4.2) ----
  // The milestones COLLECTION merges like a set; each milestone's FIELDS merge
  // like an item's scalar fields. Every op addresses a milestone by mid, so
  // two devices editing different milestones of the same project can't collide
  // at all — their ops touch different keys.
  //
  // LWW bookkeeping reuses the item's own _fieldTs map under namespaced keys
  // ("ms:<mid>:date"), which means milestone merge needs no new machinery and
  // survives a reload for free, because _fieldTs is already in the snapshot.
  _applyMilestoneOp(it, op) {
    if (!op.mid) return;                         // malformed; ignore rather than crash
    if (!Array.isArray(it.milestones)) it.milestones = [];
    const ms = this._ensureMilestone(it, op.mid);

    if (op.action === "add") {
      // Idempotent by mid. The value snapshot applies ON FIRST SIGHT ONLY;
      // later state comes from `set` ops. If a `set` got here first (log tails
      // can arrive in any order, §4.2), that field already has a winning
      // timestamp and the add just fills the remaining blanks.
      const addKey = `ms:${op.mid}:__add`;
      if (it._fieldTs[addKey]) return;           // already added — no-op
      it._fieldTs[addKey] = op.ts;
      const v = op.value || {};
      for (const f of ["label", "date", "remind", "order"]) {
        if (v[f] === undefined) continue;
        if (it._fieldTs[`ms:${op.mid}:${f}`]) continue;  // a set already won this field
        ms[f] = v[f];
      }
      if (!ms.created) ms.created = v.created || new Date(op.ts.wall).toISOString();
      return;
    }

    if (op.action === "set") {
      if (!MS_FIELDS.has(op.field)) return;      // unknown milestone field: ignore + preserve
      const key = `ms:${op.mid}:${op.field}`;
      if (this._winsLWW(it, key, op.ts)) {
        ms[op.field] = op.value;
        it._fieldTs[key] = op.ts;
      } else {
        this._noteCollision(it, key, op, { mid: op.mid, label: `${ms.label || "milestone"} · ${op.field}` });
      }
      return;
    }

    if (op.action === "remove") {
      // A remove is just an LWW set of the tombstone, which is why
      // remove-vs-edit needs no special case: the edit still applies to the
      // tombstoned record underneath, and restoring is a later set to null.
      const key = `ms:${op.mid}:removed`;
      const stamp = new Date(op.ts.wall).toISOString();
      if (this._winsLWW(it, key, op.ts)) {
        ms.removed = stamp;
        it._fieldTs[key] = op.ts;
      }
      return;
    }

    console.warn("unknown milestone action (ignored, forward-compat):", op.action);
  }

  // A milestone we haven't seen yet gets a skeleton, so a `set` arriving
  // before its `add` has somewhere to land (§4.2). The `add` fills the blanks
  // when it turns up.
  //
  // The stored array is kept sorted BY MID, not by order. Two reasons, and
  // neither is about display (display sorting is milestones.js's job, by the
  // `order` field):
  //   - mid never changes, so the array has one canonical arrangement. Two
  //     devices that received the same ops in different sequences end up with
  //     byte-identical snapshots, which is what makes the convergence test a
  //     real test rather than a normalisation exercise.
  //   - It also means the snapshot file stops churning in Dropbox just
  //     because ops arrived in a different order.
  _ensureMilestone(it, mid) {
    let ms = it.milestones.find(m => m.mid === mid);
    if (!ms) {
      ms = { mid, label: "", date: null, remind: null, done: null, order: null, removed: null, created: null };
      it.milestones.push(ms);
      it.milestones.sort((a, b) => (a.mid < b.mid ? -1 : a.mid > b.mid ? 1 : 0));
    }
    return ms;
  }

  _ensure(id) {
    let it = this.items.get(id);
    if (!it) { it = emptyItem(id); this.items.set(id, it); }
    return it;
  }

  _winsLWW(it, field, ts) {
    const prev = it._fieldTs[field];
    return !prev || clockCompare(ts, prev) > 0;
  }

  _bumpModified(it, ts) {
    const iso = new Date(ts.wall).toISOString();
    if (!it.dates.modified || iso > it.dates.modified) {
      it.dates.modified = iso;
      it.dates.touched = iso;
    }
  }

  // =====================================================
  //  MERGE NOTES (§6.1 "nothing is ever silently unrecoverable")
  // =====================================================
  // Recorded when — and ONLY when — an incoming op LOSES a last-writer-wins
  // race against a value written by a different device. That rule is exact
  // and has no false positives: an ordinary sequential edit (change it on the
  // Mac, sync, change it again on the phone) always carries the later stamp,
  // so it always wins and is never recorded.
  //
  // The honest limitation, worth knowing before reading the panel: with a
  // scalar clock you cannot tell "concurrent" from "sequential" for the op
  // that WINS, so the note lands on whichever device receives the older op.
  // In a two-device offline collision that is one device, not both. The value
  // that lost is preserved in full either way, and the logs hold both forever.
  _noteCollision(it, key, op, meta = {}) {
    const prevTs = it._fieldTs[key];
    if (!prevTs) return;
    if (prevTs.device === op.ts.device) return;         // same device correcting itself
    const current = key.startsWith("ms:")
      ? (this._msFieldValue(it, meta.mid, op.field))
      : (DATE_SCALARS.has(op.field) ? it.dates[op.field] : it[op.field]);
    if (sameValue(current, op.value)) return;           // both wrote the same thing

    const noteKey = `${it.id}|${key}|${op.ts.wall}.${op.ts.count}.${op.ts.device}`;
    if (this._collisionKeys.has(noteKey)) return;       // already recorded
    this._collisionKeys.add(noteKey);

    this._collisions.unshift({
      key: noteKey,
      itemId: it.id,
      itemTitle: it.title || "Untitled",
      mid: meta.mid || null,
      field: op.field,
      what: meta.label || op.field,
      lostValue: op.value === undefined ? null : op.value,
      lostDevice: op.ts.device,
      lostAt: new Date(op.ts.wall).toISOString(),
      keptValue: current === undefined ? null : current,
      keptDevice: prevTs.device,
      keptAt: new Date(prevTs.wall).toISOString(),
      seenAt: new Date().toISOString(),
    });
    if (this._collisions.length > MERGE_NOTES_MAX) this._collisions.length = MERGE_NOTES_MAX;
    saveMergeNotes(this._collisions);
  }

  _msFieldValue(it, mid, field) {
    const ms = (it.milestones || []).find(m => m.mid === mid);
    return ms ? ms[field] : undefined;
  }

  // The merge-notes surface reads these (see js/merge-notes.js).
  collisions() { return this._collisions; }

  dismissCollision(key) {
    this._collisions = this._collisions.filter(c => c.key !== key);
    saveMergeNotes(this._collisions);
    this._emit();
  }

  clearCollisions() {
    this._collisions = [];
    this._collisionKeys.clear();
    saveMergeNotes(this._collisions);
    this._emit();
  }

  // Put the value that lost back, as a fresh normal edit with a new timestamp
  // (so it wins cleanly everywhere). Works for both plain fields and
  // milestone fields — restoring is never a special merge path.
  restoreCollision(key) {
    const c = this._collisions.find(x => x.key === key);
    if (!c) return false;
    try {
      if (c.mid) this.setMilestoneField(c.itemId, c.mid, c.field, c.lostValue);
      else this.setField(c.itemId, c.field, c.lostValue);
    } catch (err) {
      console.warn("couldn't restore that merge note:", err);
      return false;
    }
    this.dismissCollision(key);
    return true;
  }

  // =====================================================
  //  REGISTRY (types/statuses are data, edited in-app — §2.2)
  // =====================================================
  addType(def) { this._registryEdit("types", def); }
  addStatus(def) { this._registryEdit("statuses", def); }

  _registryEdit(kind, def) {
    const list = this.registry[kind];
    const i = list.findIndex(x => x.key === def.key);
    if (i >= 0) list[i] = { ...list[i], ...def };
    else list.push(def);
    this.pendingOps.push({ op: "registry", kind, value: def, ts: clockNow() });
    this._emit();
  }

  // reassign then remove a type/status that's in use (§2.2)
  reassignAndRemove(kind, fromKey, toKey) {
    const field = kind === "types" ? "type" : "status";
    for (const it of this.all()) {
      if (it[field] === fromKey) this.setField(it.id, field, toKey);
    }
    const list = this.registry[kind];
    const i = list.findIndex(x => x.key === fromKey);
    if (i >= 0) { list.splice(i, 1); this.pendingOps.push({ op: "registry-remove", kind, key: fromKey, ts: clockNow() }); }
    this._emit();
  }

  // =====================================================
  //  SNAPSHOT + LOG (de)serialization (sync.js does the file I/O)
  // =====================================================
  toSnapshot() {
    return {
      formatVersion: FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      registry: this.registry,
      items: this.all().concat([...this.items.values()].filter(i => i._deleted))
        .map(stripInternal),
    };
  }

  loadSnapshot(snap) {
    if (!snap) return;
    // A snapshot written by a NEWER build used to throw here. It no longer
    // does, because the addendum (§4.3) requires that brief version skew
    // between devices must not corrupt or crash: format bumps in Dash are
    // additive, unknown item fields ride along untouched through the
    // Object.assign below, and unknown op kinds are ignored-and-preserved in
    // _applyOp. The logs are the source of truth and are append-only, so the
    // worst case of loading a newer snapshot is that this device doesn't yet
    // display something — not that anything is lost. We say so out loud
    // rather than silently, per §13.1 "loud, legible".
    if (snap.formatVersion && snap.formatVersion > FORMAT_VERSION) {
      this.formatNotice =
        `Some of your data was written by a newer version of Dash (format ${snap.formatVersion}). ` +
        `Everything is safe and nothing was changed, but this device may not show the newest kinds of ` +
        `information until you refresh the app here.`;
      console.warn(this.formatNotice);
    }
    if (snap.registry) this.registry = snap.registry;
    for (const raw of snap.items || []) {
      const it = emptyItem(raw.id);
      Object.assign(it, raw);
      it._fieldTs = it._fieldTs || {};
      this.items.set(it.id, it);
    }
    this._emit();
  }

  // serialize this device's pending ops as JSONL lines to append (§3)
  drainPendingAsLines() {
    const lines = this.pendingOps.map(o => JSON.stringify(o));
    this.pendingOps = [];
    return lines;
  }

  // replay a device's whole log (array of parsed op objects)
  replayLog(ops) {
    for (const op of ops) {
      // A log segment's format stamp, written once per run by sync.js. It
      // isn't an edit — it's provenance — so it's skipped here rather than
      // falling through to the unknown-op warning.
      if (op.op === "header") continue;
      if (op.op === "registry") { this._replayRegistry(op); continue; }
      if (op.op === "registry-remove") {
        const list = this.registry[op.kind];
        const i = list.findIndex(x => x.key === op.key);
        if (i >= 0) list.splice(i, 1);
        continue;
      }
      this._applyOp(op, false);
    }
    this._emit();
  }

  _replayRegistry(op) {
    const prevTs = this._registryTs[`${op.kind}:${op.value.key}`];
    if (prevTs && clockCompare(op.ts, prevTs) <= 0) return; // LWW on registry too
    this._registryTs[`${op.kind}:${op.value.key}`] = op.ts;
    const list = this.registry[op.kind];
    const i = list.findIndex(x => x.key === op.value.key);
    if (i >= 0) list[i] = { ...list[i], ...op.value };
    else list.push(op.value);
  }
}

// ---------- helpers ----------
function applySetAdd(it, field, value) {
  const arr = it[field];
  if (field === "links") {
    if (!arr.some(l => l.target === value.target && l.label === value.label)) arr.push(value);
  } else if (field === "attachments") {
    if (!arr.some(a => a.hash === value.hash && a.role === value.role)) arr.push(value);
  } else { // tags: plain strings
    if (!arr.includes(value)) arr.push(value);
  }
}

function applySetRemove(it, field, value) {
  const arr = it[field];
  if (field === "links") {
    it[field] = arr.filter(l => !(l.target === value.target && l.label === value.label));
  } else if (field === "attachments") {
    it[field] = arr.filter(a => !(a.hash === value.hash && a.role === value.role));
  } else {
    it[field] = arr.filter(v => v !== value);
  }
}

// Merge a create-op's skeleton into an item that already exists because one of
// its edits got here first. Every branch below answers the same question: is
// there already better information than the skeleton's?
function fillCreateBlanks(it, skel) {
  for (const [k, v] of Object.entries(skel)) {
    if (k === "id" || k === "_fieldTs" || k === "milestones") continue;  // never skeleton-supplied
    if (k === "_deleted") { if (!it._deleted && v) it._deleted = true; continue; }
    if (k === "tags" || k === "links" || k === "attachments") {
      // Set fields: add-ops may already have landed, so merge, never replace.
      for (const one of v || []) applySetAdd(it, k, one);
      continue;
    }
    if (k === "dates") {
      const d = v || {};
      if (!it.dates.created) it.dates.created = d.created || null;
      if (d.modified && (!it.dates.modified || d.modified > it.dates.modified)) it.dates.modified = d.modified;
      if (d.touched && (!it.dates.touched || d.touched > it.dates.touched)) it.dates.touched = d.touched;
      for (const f of ["due", "remind"]) {
        if (it._fieldTs[f]) continue;                 // a set op already won it
        if (it.dates[f] == null && d[f] != null) it.dates[f] = d[f];
      }
      continue;
    }
    if (it._fieldTs[k]) continue;                     // a set op already won this field
    it[k] = v;
  }
}

function sameValue(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function stripInternal(it) {
  // keep _deleted + _fieldTs (needed for correct merge across reloads),
  // but present a clean object; everything here is JSON-safe.
  const { ...rest } = it;
  return rest;
}

function structuredCloneSafe(obj) {
  try { return structuredClone(obj); }
  catch { return JSON.parse(JSON.stringify(obj)); }
}

// Merge notes are per-device UI state (like dash.view or dash.collapsed), so
// they live in localStorage and are never synced. A device that isn't there
// when a collision resolves has nothing to be told about.
function loadMergeNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(MERGE_NOTES_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function saveMergeNotes(list) {
  try { localStorage.setItem(MERGE_NOTES_KEY, JSON.stringify(list)); }
  catch { /* storage full or blocked; the notes just don't survive a reload */ }
}

function defaultRegistry() {
  return {
    types: [
      { key: "quick-idea",  label: "Quick idea",      icon: "⚡", color: "ochre" },
      { key: "project",     label: "Project",         icon: "◆",  color: "green" },
      { key: "strategy",    label: "Long-term goal",  icon: "◎", color: "blue" },
      { key: "note",        label: "Note",            icon: "•",  color: "slate" },
      { key: "sketch",      label: "Sketch",          icon: "✎",  color: "plum" },
    ],
    statuses: [
      { key: "active",  label: "Active",  color: "green" },
      { key: "on-hold", label: "On hold", color: "ochre" },
      { key: "done",    label: "Done",    color: "slate" },
    ],
  };
}
