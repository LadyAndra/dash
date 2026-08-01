// milestones.js — the pure logic of project milestones (addendum §2, §3).
// ===================================================================
// Deliberately DOM-free and store-free: everything in here is a plain
// function over plain objects. That means two useful things.
//
//   1. store.js can import from it without a circular import (this file
//      imports nothing at all).
//   2. It can be tested headlessly with no stubbing whatsoever — which is
//      exactly what docs/dash-current-state.md asks for after the pet build
//      ("generated geometry fails as a blank rectangle, not an error").
//
// A milestone is a sub-record of a Project item (addendum §2.1):
//
//   { mid, label, date, remind, done, order, removed, created }
//
//   mid      ULID — stable identity. Every op addresses a milestone by mid,
//            NEVER by array index (addendum §11: index addressing breaks the
//            moment one device inserts while another edits).
//   date     "YYYY-MM-DD" or null. DATE-ONLY, deliberately unlike dates.due,
//   remind   which is a full timestamp. See todayISO() below for why.
//   done     null, or the ISO timestamp of when it was ticked off.
//   order    fractional number; the manual pipeline sequence (§3.2).
//   removed  tombstone timestamp or null. Milestones are never hard-deleted.
//   created  ISO timestamp, set once.
//
// "Missing milestones array means empty array, everywhere, always" (§9).
// Every reader in this file honours that, so no project ever needs a backfill.

// Appending a milestone jumps this far past the last one. Big gaps mean a
// later insert can just take the midpoint without touching its neighbours.
export const ORDER_STEP = 1000;

// ===================================================================
//  DATES
// ===================================================================

// Today as a date-only string in the DEVICE'S OWN calendar.
//
// This reads the local calendar fields (getFullYear/getMonth/getDate) rather
// than going anywhere near toISOString(), which converts to UTC and would
// hand back "yesterday" for anyone west of Greenwich late in the evening.
// Because it never does arithmetic on milliseconds, it is also immune to DST:
// on a 23-hour or 25-hour day the calendar date is still just the calendar
// date. That immunity is the whole reason milestone dates are strings and not
// timestamps (addendum §2.1).
export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "Is this overdue?" is a plain string comparison, because ISO date strings
// sort correctly as text. No Date objects, no timezones, no drift.
export function isOverdue(dateStr, today = todayISO()) {
  return !!dateStr && dateStr < today;
}

// Whole days from today until a date-only string. Negative = in the past.
// Built by counting calendar days at noon, so a DST shift (which moves the
// clock by an hour, never by twelve) can't push a day across a boundary.
export function daysUntil(dateStr, today = todayISO()) {
  if (!dateStr) return null;
  const a = noon(today);
  const b = noon(dateStr);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

function noon(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0).getTime();
}

// Short display date in the same mono voice the rest of Dash uses ("15 AUG").
// Parsed by hand rather than with new Date(str), because new Date("2026-08-15")
// is parsed as UTC midnight by the spec and renders as the 14th in the Americas.
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
export function formatDay(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return "";
  const day = String(+m[3]);
  const mon = MONTHS[+m[2] - 1] || "";
  const thisYear = new Date().getFullYear();
  return +m[1] === thisYear ? `${day} ${mon}` : `${day} ${mon} ${m[1]}`;
}

// ===================================================================
//  ORDERING (addendum §3.2)
// ===================================================================

// The pipeline order. Ties are broken by mid — ULIDs sort by creation time,
// so the earlier-created milestone comes first and every device lands on the
// same sequence without any coordination.
//
// A milestone with no order yet (possible for a heartbeat, when a `set` op
// arrives before its `add` — §4.2) sorts to the end rather than to the front,
// so a half-known record never jumps the queue.
export function compareMilestones(a, b) {
  const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao < bo ? -1 : 1;
  if (a.mid === b.mid) return 0;
  return a.mid < b.mid ? -1 : 1;
}

export function sortMilestones(list) {
  return [...(list || [])].sort(compareMilestones);
}

// Every milestone on an item, tombstoned ones included, in order.
export function allMilestones(item) {
  return sortMilestones(item && item.milestones ? item.milestones : []);
}

// What the UI normally shows: everything that hasn't been removed.
export function visibleMilestones(item) {
  return allMilestones(item).filter(m => !m.removed);
}

// The "removed milestones" drawer in the editor (§2.1: never hard-deleted).
export function removedMilestones(item) {
  return allMilestones(item).filter(m => !!m.removed);
}

export function findMilestone(item, mid) {
  return (item && item.milestones ? item.milestones : []).find(m => m.mid === mid) || null;
}

// Order for a milestone appended to the end. Tombstoned milestones count
// towards the maximum on purpose: restoring one must never collide with a
// milestone added while it was away.
export function nextOrder(list) {
  let max = 0;
  let seen = false;
  for (const m of list || []) {
    if (typeof m.order === "number") { seen = true; if (m.order > max) max = m.order; }
  }
  return seen ? max + ORDER_STEP : ORDER_STEP;
}

// Order for a milestone landing BETWEEN two neighbours (either may be null,
// meaning "the end of the list in that direction"). This is what makes a
// reorder exactly one op on exactly one milestone (§3.2) — neighbours are
// never renumbered, so a reorder here and a label edit there merge perfectly.
export function orderBetween(before, after) {
  const a = before && typeof before.order === "number" ? before.order : null;
  const b = after && typeof after.order === "number" ? after.order : null;
  if (a === null && b === null) return ORDER_STEP;
  if (a === null) return b - ORDER_STEP;
  if (b === null) return a + ORDER_STEP;
  return (a + b) / 2;
}

// Repeated midpoint splits into the same gap eventually exhaust float
// precision (roughly 50 in a row — vanishingly unlikely at human scale, but
// it is a real number and not infinity). When the midpoint stops landing
// strictly between its neighbours, the list needs a one-off renumber.
export function needsRenumber(list) {
  const ms = sortMilestones(list);
  for (let i = 1; i < ms.length; i++) {
    const a = ms[i - 1].order, b = ms[i].order;
    if (typeof a !== "number" || typeof b !== "number") continue;
    const mid = (a + b) / 2;
    if (!(mid > a && mid < b)) return true;
  }
  return false;
}

// Fresh 1000-spacing for the whole list. The caller emits one `set` per
// milestone — legal, rare, self-healing (§3.2).
export function renumbered(list) {
  return sortMilestones(list).map((m, i) => ({ mid: m.mid, order: (i + 1) * ORDER_STEP }));
}

// ===================================================================
//  STAGE (addendum §3.3)
// ===================================================================

// Where a project is right now. DERIVED AT RENDER TIME AND NEVER STORED —
// there is no stage field, no stage registry, and nothing writes back.
//
//   no milestones      -> null (show nothing)
//   earliest unfinished-> that milestone's label; overdue if its date passed
//   none unfinished    -> "Complete"
//
// Two consequences worth keeping in mind, both correct:
//   - An UNDATED milestone can be the current stage. "We're in the Execution
//     phase, no deadline set yet" is a true statement about a project.
//   - Ticking off a later milestone while an earlier one is open does NOT
//     advance the stage. The pipeline says the earlier phase is still open.
export function stageOf(item, today = todayISO()) {
  const ms = visibleMilestones(item);
  if (ms.length === 0) return null;

  const first = ms.find(m => !m.done);
  if (!first) {
    return { label: "Complete", complete: true, overdue: false, mid: null, date: null };
  }
  return {
    label: first.label || "Untitled milestone",
    complete: false,
    overdue: isOverdue(first.date, today),
    mid: first.mid,
    date: first.date || null,
  };
}

// How many of a project's milestones are done, for the editor's summary line.
export function milestoneProgress(item) {
  const ms = visibleMilestones(item);
  return { done: ms.filter(m => !!m.done).length, total: ms.length };
}
