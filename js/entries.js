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

import { visibleMilestones, isOverdue, todayISO, compareMilestones } from "./milestones.js";

// The one place this file decides what a project is. It's still the literal
// string the rest of Dash uses (store.js exports PROJECT_TYPE for this, and
// sweeping every hardcoded copy across the app is its own queued cleanup) —
// but keeping it behind one function here means this file has exactly one line
// to change when that sweep happens, rather than one per source.
function isProject(item) {
  return item.type === "project";
}

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

  // Undated milestones (addendum §6.3). A milestone with no date can't sit on
  // a grid, but silently dropping it re-creates the exact failure Dash exists
  // to fight — things falling out of sight. So a source can also declare what
  // it has that is REAL but UNPLACEABLE, and the Calendar's "Unscheduled" tray
  // renders it.
  //
  // This is deliberately not an entry: an entry has a `start`, and this has no
  // date by definition. It rides the same archive walk though (see collect()),
  // so asking for both costs one pass, not two.
  //
  // Done-and-undated is excluded on purpose: a finished phase that never had a
  // date is not something waiting to be scheduled.
  unscheduledFromItem(item, emit, ctx) {
    if (!isProject(item)) return;
    for (const m of visibleMilestones(item)) {
      if (m.date || m.done) continue;
      emit({
        id: `ms:${item.id}:${m.mid}:unscheduled`,
        source: "milestone", kind: "unscheduled",
        itemId: item.id, mid: m.mid,
        label: m.label || "Untitled milestone",
        context: item.title || "Untitled project",
        start: null, end: null, allDay: true,
        // the pipeline position, so the tray lists a project's phases in the
        // order the project actually moves through them (addendum §3.2)
        order: typeof m.order === "number" ? m.order : null,
        done: false, overdue: false,
      });
    }
  },

  fromItem(item, emit, ctx) {
    if (!isProject(item)) return;
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
// The shared machinery. `want` says which of the two collections the caller
// actually needs, and BOTH come out of the same walk of the archive — which is
// the whole reason this is one function instead of two.
//
// The Calendar (M3) needs the dated entries for the grid AND the undated ones
// for the tray on every render. Two separate queries would mean two full
// archive scans per frame, which is the standing rule in
// docs/dash-current-state.md ("coalesce to one pass per frame") broken on
// arrival. Asking for both here costs one pass.
function collect(store, start, end, opts, want) {
  const kinds = opts.kinds || ["due", "remind"];
  const today = opts.today || todayISO();
  const includeDone = opts.includeDone !== false;

  const dated = [];
  const undated = [];
  const emit = (e) => { if (kinds.includes(e.kind)) dated.push(e); };
  const emitUnscheduled = (e) => undated.push(e);
  const ctx = { store, start, end, today };

  // Only walk for sources that can actually contribute something we asked for.
  const itemSources = SOURCES.filter(s =>
    (want.entries && typeof s.fromItem === "function") ||
    (want.unscheduled && typeof s.unscheduledFromItem === "function"));

  if (itemSources.length) {
    // THE one archive scan.
    for (const item of store.all()) {
      for (const s of itemSources) {
        if (want.entries && s.fromItem) s.fromItem(item, emit, ctx);
        if (want.unscheduled && s.unscheduledFromItem) s.unscheduledFromItem(item, emitUnscheduled, ctx);
      }
    }
  }
  // Sources that aren't item-derived fetch their own way (none ship yet).
  if (want.entries) {
    for (const s of SOURCES) {
      if (typeof s.entriesFor === "function") {
        for (const e of s.entriesFor(start, end, ctx) || []) emit(e);
      }
    }
  }

  const kept = includeDone ? dated : dated.filter(e => !e.done);
  kept.sort(compareEntries);
  return { entries: kept, unscheduled: undated };
}

export function entriesFor(store, start, end, opts = {}) {
  return collect(store, start, end, opts, { entries: true, unscheduled: false }).entries;
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
//  SHAPING: by day, and by project
// ===================================================================
// Both live here rather than in a view, for the same reason todayGroups does:
// the grouping rule belongs next to the query it depends on, so there is one
// definition of it rather than one per surface that wants it.

// Bucket entries onto the day they start. Used by the Today panel's "next 14
// days" and, from M3, by the Calendar's month grid — one bucketing rule for
// both, so they can't drift apart.
//
// Note what this deliberately does NOT do: an entry with an `end` set (a
// future ranged source — travel) lands only on its START day. Drawing a span
// across several cells is a renderer change the addendum (§6.1) parks until
// there's a source that produces one. Nothing here assumes single days; it
// just doesn't invent the multi-day behaviour before it's needed.
//
// Expects entries already sorted (entriesFor sorts by date), so the days come
// out in chronological order.
export function groupByDay(entries) {
  const byDay = new Map();
  for (const e of entries || []) {
    if (!e.start) continue;
    if (!byDay.has(e.start)) byDay.set(e.start, []);
    byDay.get(e.start).push(e);
  }
  return [...byDay.entries()].map(([day, items]) => ({ day, items }));
}

// Group unscheduled milestones under the project they belong to (addendum
// §6.3 — "grouped by project"). Projects in alphabetical order; within a
// project, phases in PIPELINE order, using the same comparison the milestone
// list itself uses so the tray reads in the order the project moves through.
export function groupByProject(list) {
  const byProject = new Map();
  for (const e of list || []) {
    if (!byProject.has(e.itemId)) {
      byProject.set(e.itemId, { projectId: e.itemId, title: e.context, items: [] });
    }
    byProject.get(e.itemId).items.push(e);
  }
  const groups = [...byProject.values()];
  // compareMilestones reads .order and .mid, which these entries carry — so
  // the tray and the project page order phases identically, by construction.
  for (const g of groups) g.items.sort(compareMilestones);
  groups.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  return groups;
}

// ===================================================================
//  THE UNSCHEDULED TRAY  (addendum §6.3)
// ===================================================================
// Every undated, unfinished milestone, grouped by project. This is what stops
// an undated phase from being invisible: the moment you're looking at a
// calendar is the moment you're thinking about time, so "needs a date" belongs
// one tap from the surface where the date will land.
//
// Standalone (one archive pass). The Calendar should call calendarData()
// instead, which gets this AND the grid's entries out of a single pass.
export function unscheduledFor(store, opts = {}) {
  return groupByProject(collect(store, null, null, opts, { entries: false, unscheduled: true }).unscheduled);
}

// ===================================================================
//  THE CALENDAR'S QUERY  (addendum §6.2)
// ===================================================================
// Everything the Calendar view needs for one render, from ONE archive pass:
//
//   entries      the dated things in the requested window, sorted
//   days         those same entries bucketed by day, for the month grid
//   unscheduled  the undated tray, grouped by project
//
// Done entries are INCLUDED by default, because §6.2 wants them rendered muted
// rather than vanishing — a past month should read as history. Pass
// { includeDone: false } for a view that only wants live things.
export function calendarData(store, start, end, opts = {}) {
  const { entries, unscheduled } = collect(store, start, end, opts, { entries: true, unscheduled: true });
  return {
    entries,
    days: groupByDay(entries),
    unscheduled: groupByProject(unscheduled),
    unscheduledCount: unscheduled.length,
  };
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
  const later = [];

  for (const e of all) {
    if (e.start < today) overdue.push(e);
    else if (e.start === today) now.push(e);
    else later.push(e);
  }

  return {
    today,
    horizon,
    overdue,
    now,
    // Bucketed by the shared rule, so the Today panel and the Calendar's month
    // grid group days the same way by construction rather than by agreement.
    upcoming: groupByDay(later),
    total: all.length,
    overdueCount: overdue.length,
  };
}

// Just the number, for the badge on the Home tab. Same one-scan query.
export function overdueCount(store, today = todayISO()) {
  return entriesFor(store, null, today, { today, includeDone: false })
    .filter(e => e.start < today && e.kind === "due").length;
}
