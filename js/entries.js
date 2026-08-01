// entries.js — the date SOURCE REGISTRY (addendum §6.1).
// ===================================================================
// Nothing that shows dates reads items directly. This module sits between
// the store and any date-driven surface, and hands out "entries":
//
//   {
//     id,            // stable key for rendering
//     source,        // "milestone" | "item-due"   (later: "gcal", "personal", …)
//     kind,          // "due" | "remind"
//     itemId, mid,   // what to open when tapped
//     label,         // the thing itself   ("Research")
//     context,       // what it belongs to ("Freelance site rebuild"), or null
//     start,         // "YYYY-MM-DD"
//     end,           // "YYYY-MM-DD" or null  (null = a single day)
//     allDay,
//     done, overdue  // display hints
//   }
//
// Why this indirection exists at all, given only two sources ship today:
//
//   - A future RANGE-shaped source (travel) returns entries with `end` set,
//     and the grid learns to draw spans as a renderer change — no model or
//     query change anywhere.
//   - A future RECURRING source (birthdays, holidays) expands its rule into
//     concrete entries for the requested window INSIDE the source. Nothing
//     downstream ever learns what recurrence is.
//   - Gmail / Calendar events become a third source, exactly as §7.2 of the
//     original proposal promised.
//
// That is why sources are asked for a RANGE rather than "everything".
//
// One scan, always. Both shipped sources are derived from items, so they
// declare `fromItem` and share a single walk of the archive per call rather
// than each scanning it themselves. (Standing rule in the current-state doc:
// anything that scans store.all() gets coalesced, no exceptions.) A future
// source that isn't item-derived declares `entriesFor` instead and fetches
// its own way; the registry supports both.

import { visibleMilestones, isOverdue, todayISO } from "./milestones.js";

// ---- date helpers, all date-only strings (addendum §2.1) ----

// An ordinary item's dates.due / dates.remind are full ISO timestamps, unlike
// a milestone's date-only strings. Reduce them to the LOCAL calendar day so
// the two can sit in one sorted list without a timezone ever mattering.
export function dayOfTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return todayISO(d);
}

// Add days to a date-only string and get a date-only string back. Built at
// noon so a 23- or 25-hour DST day can't shunt the result across a boundary.
export function addDays(dateStr, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

function within(day, start, end) {
  if (!day) return false;
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

// ===================================================================
//  THE SOURCES
// ===================================================================

const milestoneSource = {
  name: "milestone",
  fromItem(item, emit, ctx) {
    if (item.type !== "project") return;
    for (const m of visibleMilestones(item)) {
      const done = !!m.done;

      if (m.date && within(m.date, ctx.start, ctx.end)) {
        emit({
          id: `ms:${item.id}:${m.mid}:due`,
          source: "milestone", kind: "due",
          itemId: item.id, mid: m.mid,
          label: m.label || "Untitled milestone",
          context: item.title || "Untitled project",
          start: m.date, end: null, allDay: true,
          done, overdue: !done && isOverdue(m.date, ctx.today),
        });
      }

      // A reminder can fire well ahead of a far-off date — that is its entire
      // purpose — so it is its own entry, sitting on the day it fires.
      if (m.remind && !done && within(m.remind, ctx.start, ctx.end)) {
        emit({
          id: `ms:${item.id}:${m.mid}:remind`,
          source: "milestone", kind: "remind",
          itemId: item.id, mid: m.mid,
          label: m.label || "Untitled milestone",
          context: item.title || "Untitled project",
          start: m.remind, end: null, allDay: true,
          dueOn: m.date || null,
          done, overdue: false,          // a reminder is never "overdue"; it just fired
        });
      }
    }
  },
};

const itemDueSource = {
  name: "item-due",
  fromItem(item, emit, ctx) {
    const done = ctx.store.isDoneStatus(item.status);

    const due = dayOfTimestamp(item.dates?.due);
    if (due && within(due, ctx.start, ctx.end)) {
      emit({
        id: `it:${item.id}:due`,
        source: "item-due", kind: "due",
        itemId: item.id, mid: null,
        label: item.title || "Untitled",
        context: null,
        start: due, end: null, allDay: true,
        done, overdue: !done && isOverdue(due, ctx.today),
      });
    }

    const remind = dayOfTimestamp(item.dates?.remind);
    if (remind && !done && within(remind, ctx.start, ctx.end)) {
      emit({
        id: `it:${item.id}:remind`,
        source: "item-due", kind: "remind",
        itemId: item.id, mid: null,
        label: item.title || "Untitled",
        context: null,
        start: remind, end: null, allDay: true,
        dueOn: due || null,
        done, overdue: false,
      });
    }
  },
};

// Registered sources. Adding one here is the whole job of adding a new kind of
// date to Dash — no view changes anywhere.
export const SOURCES = [milestoneSource, itemDueSource];

// ===================================================================
//  THE QUERY
// ===================================================================
// entriesFor(store, start, end, opts) -> [entry] sorted by date then title.
//
// `start` and `end` are inclusive date-only strings. Either may be null,
// meaning "no bound in that direction" — which is how the Today panel asks
// for "everything overdue" without inventing an arbitrary floor.
export function entriesFor(store, start, end, opts = {}) {
  const kinds = opts.kinds || ["due", "remind"];
  const today = opts.today || todayISO();
  const includeDone = opts.includeDone !== false;

  const out = [];
  const emit = (e) => { if (kinds.includes(e.kind)) out.push(e); };
  const ctx = { store, start, end, today };

  const itemSources = SOURCES.filter(s => typeof s.fromItem === "function");
  if (itemSources.length) {
    // THE one archive scan.
    for (const item of store.all()) {
      for (const s of itemSources) s.fromItem(item, emit, ctx);
    }
  }
  // Sources that aren't item-derived fetch their own way (none ship yet).
  for (const s of SOURCES) {
    if (typeof s.entriesFor === "function") {
      for (const e of s.entriesFor(start, end, ctx) || []) emit(e);
    }
  }

  const kept = includeDone ? out : out.filter(e => !e.done);
  kept.sort(compareEntries);
  return kept;
}

export function compareEntries(a, b) {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  // due before remind on the same day: the thing itself outranks the nudge
  if (a.kind !== b.kind) return a.kind === "due" ? -1 : 1;
  const at = `${a.context || ""} ${a.label || ""}`;
  const bt = `${b.context || ""} ${b.label || ""}`;
  return at.localeCompare(bt);
}

// ===================================================================
//  THE TODAY WINDOW  (addendum §5.2)
// ===================================================================
// Overdue, plus everything dated through today+14. Grouped into the three
// sections the panel renders, so the grouping rule lives here — next to the
// query it depends on — rather than inside a view.
export const TODAY_WINDOW_DAYS = 14;

export function todayGroups(store, opts = {}) {
  const today = opts.today || todayISO();
  const horizon = addDays(today, opts.days ?? TODAY_WINDOW_DAYS);

  // No lower bound: something six months overdue is still overdue, and
  // quietly dropping it is the exact failure Dash exists to fight.
  const all = entriesFor(store, null, horizon, { today, includeDone: false });

  const overdue = [];
  const now = [];
  const upcoming = new Map();      // "YYYY-MM-DD" -> [entry]

  for (const e of all) {
    if (e.start < today) overdue.push(e);
    else if (e.start === today) now.push(e);
    else {
      if (!upcoming.has(e.start)) upcoming.set(e.start, []);
      upcoming.get(e.start).push(e);
    }
  }

  return {
    today,
    horizon,
    overdue,
    now,
    upcoming: [...upcoming.entries()].map(([day, items]) => ({ day, items })),
    total: all.length,
    overdueCount: overdue.length,
  };
}

// Just the number, for the badge on the Home tab. Same one-scan query.
export function overdueCount(store, today = todayISO()) {
  return entriesFor(store, null, today, { today, includeDone: false })
    .filter(e => e.start < today && e.kind === "due").length;
}
