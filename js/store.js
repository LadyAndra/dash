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

import { ulid } from "./ulid.js";
import { now as clockNow, compare as clockCompare } from "./clock.js";

export const FORMAT_VERSION = 1;

// The dedicated "Project" type. An entry assigned to a project links to it
// with the PROJECT_LINK relationship label, which lets us tell project
// membership apart from generic "see also" connections.
export const PROJECT_TYPE = "project";
export const PROJECT_LINK = "in project";

// ---- op kinds (extend, never repurpose — §13.2 #1) ----
export const OP = {
  CREATE: "create",   // value = full skeleton item
  SET:    "set",      // field + value  (scalar LWW)
  ADD:    "add",      // field (a set) + value (element)
  REMOVE: "remove",   // field (a set) + value (element)
  DELETE: "delete",   // tombstone the item
};

const SCALAR_FIELDS = new Set(["type", "status", "title", "body", "due", "remind"]);
const SET_FIELDS = new Set(["tags", "links", "attachments"]);

function emptyItem(id) {
  return {
    id,
    type: "note",
    status: "active",
    title: "",
    body: "",
    tags: [],
    links: [],
    attachments: [],
    dates: { created: null, modified: null, touched: null, due: null, remind: null },
    source: null,
    viewState: {},
    _deleted: false,
    // per-field winning timestamps, so LWW is decided without re-reading logs
    _fieldTs: {},
  };
}

export class Store {
  constructor() {
    this.items = new Map();       // id -> item
    this.registry = defaultRegistry();
    this.pendingOps = [];         // ops made on THIS device, not yet flushed
    this._listeners = new Set();
    this._registryTs = {};        // LWW bookkeeping for registry edits
  }

  // ---- subscription: views re-render on change ----
  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(); }

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
    return id;
  }

  setField(id, field, value) {
    if (!SCALAR_FIELDS.has(field)) throw new Error(`setField: '${field}' is not a scalar field`);
    this._applyOp({ op: OP.SET, itemId: id, field, value, ts: clockNow() }, true);
  }

  addToSet(id, field, value) {
    if (!SET_FIELDS.has(field)) throw new Error(`addToSet: '${field}' is not a set field`);
    this._applyOp({ op: OP.ADD, itemId: id, field, value, ts: clockNow() }, true);
  }

  removeFromSet(id, field, value) {
    if (!SET_FIELDS.has(field)) throw new Error(`removeFromSet: '${field}' is not a set field`);
    this._applyOp({ op: OP.REMOVE, itemId: id, field, value, ts: clockNow() }, true);
  }

  deleteItem(id) {
    // tombstone only — never erase (§13.2 #8)
    this._applyOp({ op: OP.DELETE, itemId: id, ts: clockNow() }, true);
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

  // =====================================================
  //  OP APPLICATION  (used by both local edits and log replay)
  //  local=true  -> also queue to pendingOps for flushing
  // =====================================================
  _applyOp(op, local = false) {
    switch (op.op) {
      case OP.CREATE: {
        if (!this.items.has(op.itemId)) {
          const it = emptyItem(op.itemId);
          Object.assign(it, structuredCloneSafe(op.value));
          it._fieldTs = {};
          this.items.set(op.itemId, it);
        }
        break;
      }
      case OP.SET: {
        const it = this._ensure(op.itemId);
        if (this._winsLWW(it, op.field, op.ts)) {
          it[op.field] = op.value;
          it._fieldTs[op.field] = op.ts;
          this._bumpModified(it, op.ts);
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
      default:
        console.warn("unknown op kind (ignored, forward-compat):", op.op);
    }
    if (local) { this.pendingOps.push(op); this._emit(); }
    return op;
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
    if (snap.formatVersion && snap.formatVersion > FORMAT_VERSION) {
      throw new Error(
        `This data was written by a newer version of Dash (format ${snap.formatVersion}). ` +
        `Please update the app before opening it, so nothing gets damaged.`
      );
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

  // Detect recent same-field collisions for the merge-notes UI (§6.1).
  // (Full UI is Phase 4; the data hook exists now so nothing is lost.)
  collisions() { return this._collisions || []; }
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

function defaultRegistry() {
  return {
    types: [
      { key: "quick-idea",  label: "Quick idea",      icon: "⚡", color: "ochre" },
      { key: "project",     label: "Project",         icon: "◆",  color: "green" },
      { key: "strategy",    label: "Long-term goal",  icon: "◎",  color: "blue" },
      { key: "note",        label: "Note",            icon: "•",  color: "slate" },
    ],
    statuses: [
      { key: "active",  label: "Active",  color: "green" },
      { key: "on-hold", label: "On hold", color: "ochre" },
      { key: "done",    label: "Done",    color: "slate" },
    ],
  };
}
