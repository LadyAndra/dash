// calendar.js — the Calendar view (milestones addendum M3).
// ===================================================================
// The design this builds is docs/calendar-design/dash-calendar-visual-
// architecture.md, approved section by section. The short version:
//
//   AN INSTRUMENT, NOT A SPREADSHEET. Calendar's main surface is THE
//   APPROACH — a fixed NOW line with everything drifting toward it. Time is
//   distance, not boxes. Below it sits THE MONTH LIST (October 2026: it
//   replaced the shelf of month dial, load gauge and year radar, which are
//   retired but kept in this file — see "THE RETIRED SHELF" below), and along
//   the bottom edge a single line of chrome for the unscheduled tray, where
//   the flip mechanism opens.
//
// Three rules do all the drawing, everywhere on this screen (§1):
//
//   HUE is identity and ONLY identity — a mark's colour is its project's
//     colour. Urgency never touches it. Ember still means "past its date"
//     and nothing else.
//   MATERIAL is time-distance — how soon a thing is reads as how much dye
//     it holds, whether grain has arrived, and how hard its edge is. See
//     rampOf() below; the percentages are tokens, the day boundaries are
//     the constants next to it.
//   SIZE is weight and only size — 3 for a project's final milestone, 2 for
//     any other milestone, 1 for a plain item's due date.
//
// ---- THINGS THAT WILL BITE A FUTURE SESSION ----
//
// 1. ONE ARCHIVE PASS PER FRAME. The strip, Month mode and the month list
//    are all fed by a SINGLE calendarData() call with an open lower bound (so
//    nothing overdue is ever silently dropped) and an end far enough out to
//    cover them. Everything after that is filtering in memory. Do not add a
//    second query for a new instrument.
//
// 2. NO BAKED COLOURS. Every fill and stroke on this screen is a var() or a
//    color-mix() of one, either from a CSS class in css/calendar.css or from
//    a --pc custom property carrying the project's own colour. That is what
//    lets a theme swap re-paint the whole instrument with no re-render — the
//    prototype baked computed colours and had to redraw, and the build must
//    not. tests/calendar.test.mjs fails the build if a literal creeps in.
//
// 3. THE DOM IS KEPT, NOT REBUILT. Dash re-renders the active view on every
//    store change. If this file rebuilt its shell each time, an open flip
//    widget in the tray would be destroyed mid-edit. So the shell is built
//    once and only the instruments repaint — the same rule the Projects shelf
//    follows. The month list goes one step further: it only redraws when its
//    own rows actually changed, so an unrelated write can't snap its scroll
//    position back to today or drop keyboard focus off a row.
//
// 4. WHICH PROJECT AN ENTRY BELONGS TO is worked out HERE, once per frame, by
//    annotateOwners() — not in js/entries.js, which Home also depends on and
//    which stays untouched. A milestone and a date mark carry it already; an
//    ordinary entry gets it from its "in project" links. Lane, colour and the
//    month list's project name all read that one answer.

import { calendarData } from "../entries.js";
import { todayISO, daysUntil, visibleMilestones } from "../milestones.js";
import { itemColor } from "./shared.js";
import { mount as mountDateInput } from "../widgets/flipdate.js";
import { colorToken } from "../theme.js";

// ===================================================================
//  CONSTANTS — behaviour, not appearance
// ===================================================================
// The appearance side of the ramp (how much dye each band holds) lives in
// css/tokens.css as --cal-dye-*. These are the DAY boundaries that decide
// which band an entry is in, and they are here because they are logic: a
// test walks them, and a theme has no business moving them.

export const CAL_HORIZON_DAYS = 120;          // four months, per §9 item 2
export const RAMP_NEAR_MAX = 2;               // 0–2 days   -> full dye, hard edge
export const RAMP_SOON_MAX = 7;               // 3–7 days   -> full dye, no edge
export const RAMP_MID_MAX = 14;               // 8–14 days  -> 55% dye + grain
                                              // 15+        -> 24% dye + grain

// Beyond this many days out a mark stops carrying its label; the quiet far
// field is part of the reading, and the tooltip is what the far field is for.
export const LABEL_HORIZON_DAYS = 14;

// The load gauge (§3b). Everything live in the overdue-through-14-day window
// — the same window the strip already treats as "near enough to label".
export const LOAD_WINDOW_DAYS = 14;
// Something already late is heavier than the same thing due next week: it is
// carrying its own debt as well as its work.
export const LOAD_OVERDUE_MULTIPLIER = 1.5;
// What a FULL gauge means, in weight-units. Roughly eight final milestones,
// or a dozen milestones, or two dozen small item dues, all inside a fortnight.
// This is the one number here that is a judgement rather than a rule; it is a
// constant rather than a token because moving it changes what the instrument
// MEASURES, not how loudly it says it.
export const LOAD_FULL = 24;

// Strip geometry, in px.
const EDGE_PAD = 26;              // breathing room at both ends of the axis
const MONTH_PAD = 56;             // Month mode's linear axis inset
const LANE_TOP = 46;              // room above the first lane for the NOW cap
const AXIS_H = 30;                // the day/month numbers along the bottom
const OVERDUE_ZONE_MAX = 0.28;    // the ember field never eats more than this
const OVERDUE_ZONE_MIN = 26;      // ...and collapses to this with no debt
const COLLIDE_PX = 15;            // two marks closer than this get nudged apart
const COLLIDE_NUDGE = 11;

// Dial + radar geometry, in their own viewBox units.
const DIAL_VB = 720, DIAL_C = 360, DIAL_R_OUT = 272, DIAL_R_IN = 96;
const DIAL_TICK_IN = 306, DIAL_TICK_OUT = 318, DIAL_NUM_R = 342, DIAL_ORPHAN_R = 52;
const YEAR_VB = 240, YEAR_C = 120, YEAR_R_OUT = 92, YEAR_R_IN = 44;

// The load gauge's scene, in the viewBox assets/window-scene.svg declares.
const SCENE_W = 400, SCENE_H = 320;

// The two vendored assets, resolved from this module rather than from the
// page, so they load wherever the Calendar is mounted from.
const GRAIN_URL = new URL("../../assets/grain.svg", import.meta.url).href;
const SCENE_URL = new URL("../../assets/window-scene.svg", import.meta.url).href;

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTHS_FULL = ["January","February","March","April","May","June","July",
                     "August","September","October","November","December"];
const WEEKDAYS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

// Per-device, exactly as settled.
const LS_MODE = "dash.calendar.mode";
const LS_CURSOR = "dash.calendar.cursor";
const LS_MOTION = "dash.calendar.motion";

// ===================================================================
//  PURE: dates
// ===================================================================

export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
}
export function toISO(y, mo, d) {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function daysInMonth(y, mo) { return new Date(y, mo, 0).getDate(); }

// Day-of-year, counted at noon so no DST day can shunt it (the same reason
// milestones.js does all its arithmetic at noon).
export function dayOfYear(dateStr) {
  const p = parseISO(dateStr);
  if (!p) return 0;
  const a = new Date(p.y, 0, 1, 12).getTime();
  const b = new Date(p.y, p.mo - 1, p.d, 12).getTime();
  return Math.round((b - a) / 86400000);
}

// ===================================================================
//  PURE: THE RAMP  (§1 rule 2 — the one classifier every renderer shares)
// ===================================================================
// Returns { key, dye }. `key` is the CSS class that paints it; `dye` is the
// same percentage the matching --cal-dye-* token carries, returned so a test
// can assert the two never drift apart.
//
// Order matters and is not arbitrary:
//   done first    — a finished thing is history, however late it was.
//   remind next   — a reminder is a nudge, not a deadline; entries.js already
//                   refuses to call one overdue, and it carries no weight.
//   then distance — including negative distance, which is the ember band.

export function rampOf(entry, today = todayISO()) {
  if (!entry) return { key: "far", dye: 24 };
  if (entry.done) return { key: "done", dye: 0 };
  if (entry.kind === "remind") return { key: "remind", dye: 0 };
  const n = daysUntil(entry.start, today);
  if (n === null) return { key: "far", dye: 24 };
  if (n < 0) return { key: "overdue", dye: 100 };
  if (n <= RAMP_NEAR_MAX) return { key: "near", dye: 100 };
  if (n <= RAMP_SOON_MAX) return { key: "soon", dye: 100 };
  if (n <= RAMP_MID_MAX) return { key: "mid", dye: 55 };
  return { key: "far", dye: 24 };
}

// Grain arrives with the thinned dye and never before it (§1's table).
export function hasGrain(rampKey) { return rampKey === "mid" || rampKey === "far"; }

// ===================================================================
//  PURE: WEIGHT  (§1 rule 3)
// ===================================================================
// 3 = a project's FINAL milestone, 2 = any other milestone, 1 = a plain
// item's due date, 0 = a reminder (which is hollow by rule 2 and carries no
// weight at all).
//
// NOTE for anyone tempted to "fix" this by adding .order to the entries:
// don't. Dated milestone entries deliberately do not carry .order — only the
// unscheduled ones do, because the tray needs to list a project's phases in
// pipeline sequence and nothing else did. Finality is not a property of the
// entry anyway; it is a property of the PROJECT the entry came from, and it
// changes the moment a later phase is added. So it is derived here, at render
// time, from the project itself — one lookup per project per frame, memoised
// by finalMilestoneIndex() below. js/entries.js stays untouched, which is the
// point: Home depends on it too.

export function weightOf(entry, isFinal) {
  if (!entry || entry.kind === "remind") return 0;
  if (entry.source === "milestone") return isFinal ? 3 : 2;
  return 1;
}

export function markRadius(weight) {
  return weight === 3 ? 13 : weight === 2 ? 9 : 6;
}
export function radarRadius(weight) {
  return weight === 3 ? 3.4 : weight === 2 ? 2.6 : 1.9;
}

// projectId -> the mid of its last visible milestone in pipeline order.
// visibleMilestones() already sorts by compareMilestones (.order, then .mid),
// so "final" is simply the last one — tombstoned phases excluded, finished
// ones included, because a completed last phase is still the last phase.
export function finalMilestoneIndex(store, entries) {
  const out = new Map();
  for (const e of entries || []) {
    if (e.source !== "milestone" || !e.itemId || out.has(e.itemId)) continue;
    const project = store.get(e.itemId);
    const ms = project ? visibleMilestones(project) : [];
    out.set(e.itemId, ms.length ? ms[ms.length - 1].mid : null);
  }
  return out;
}

// ===================================================================
//  PURE: THE APPROACH AXIS  (§2a)
// ===================================================================
// The NOW line is ANCHORED — it does not wander. What breathes is the ember
// field behind it, which is sized by how much debt is actually in it: with
// nothing overdue it collapses to a sliver, and a growing red field at the
// left edge is itself the signal, before you have read a single label.

export function overdueZoneWidth(width, oldestDebtDays) {
  if (!oldestDebtDays || oldestDebtDays <= 0) return OVERDUE_ZONE_MIN;
  return Math.min(OVERDUE_ZONE_MAX * width, 58 + 16 * Math.sqrt(oldestDebtDays) + EDGE_PAD);
}

export function approachGeometry(width, oldestDebtDays) {
  const zone = overdueZoneWidth(width, oldestDebtDays);
  const nowX = zone;
  return { nowX, zone, span: Math.max(1, width - nowX - EDGE_PAD), width };
}

// x = nowX + span · ln(1+days)/ln(1+HORIZON).
//
// The compression IS the theory of attention: tomorrow gets a wide bay, and
// out at the horizon the gap between two gridlines is a whole month. Things
// physically decompress as they approach the line.
//
// Behind the line, overdue marks are placed on √(age) so that a very old debt
// still lands on screen instead of somewhere off in the negative.
export function approachX(days, geom) {
  if (days < 0) {
    const back = geom.nowX - EDGE_PAD - 16 * Math.sqrt(-days);
    return Math.max(4, back);
  }
  const d = Math.min(days, CAL_HORIZON_DAYS);
  return geom.nowX + geom.span * Math.log1p(d) / Math.log1p(CAL_HORIZON_DAYS);
}

// Month mode: the same renderer, a LINEAR axis. Two axis functions, one
// drawing routine — which is what stops the two modes from drifting apart.
export function monthX(day, n, width) {
  if (n <= 1) return width / 2;
  return MONTH_PAD + ((day - 1) / (n - 1)) * (width - 2 * MONTH_PAD);
}

// ===================================================================
//  PURE: THE TOOLTIP'S PLACEMENT  (§2a)
// ===================================================================
// Above the mark with a pointer arrow; flipped below when there is no room
// above; always clamped inside its container so a mark at the far right can
// never push the card off screen. The arrow stays with the MARK, not with the
// card, which is the whole reason it is a separate number.

export const TIP_GAP = 12;
export const TIP_EDGE = 6;

export function tooltipPlacement({ x, y, r, tipW, tipH, hostW }) {
  let left = x - tipW / 2;
  left = Math.max(TIP_EDGE, Math.min(left, Math.max(TIP_EDGE, hostW - tipW - TIP_EDGE)));
  let top = y - r - tipH - TIP_GAP;
  let below = false;
  if (top < 2) { top = y + r + TIP_GAP; below = true; }
  return { left, top, below, arrowX: x - left };
}

// ===================================================================
//  PURE: THE LOAD GAUGE  (§3b)
// ===================================================================

// Everything live (not done, not a reminder) from the oldest overdue thing
// through today+14, summed by weight, overdue counted heavier. One number.
export function loadScore(entries, today, weightFor) {
  const horizon = LOAD_WINDOW_DAYS;
  let sum = 0;
  for (const e of entries || []) {
    if (e.done || e.kind === "remind" || !e.start) continue;
    const n = daysUntil(e.start, today);
    if (n === null || n > horizon) continue;
    const w = weightFor ? weightFor(e) : 1;
    sum += n < 0 ? w * LOAD_OVERDUE_MULTIPLIER : w;
  }
  return Math.round(Math.min(100, (sum / LOAD_FULL) * 100));
}

// ONE CONTINUOUS READ. There are no named stops and no stages anywhere in
// here — a single 0–100 value drives every layer, the same way the dye ramp
// is a continuous function of days-until rather than a lookup table with
// visible seams. `ceiling` comes from --cal-fog-ceiling: even at maximum
// roughly a fifth of the scene stays visible. The hills are never fully gone.
export function fogLayers(load, ceiling = 0.8) {
  const v = Math.max(0, Math.min(100, load)) / 100;
  const bank = Math.min(ceiling, v * ceiling);
  return {
    bank,
    veil: bank * 0.4,                              // the sky dims first
    grain: Math.min(0.35, 0.03 + v * 0.32),
    bankTop: SCENE_H - v * (SCENE_H - 20),         // the wash rises out of the valley
  };
}

// Each ridge fades at its own rate, weighted so the farthest, coolest ridge
// disappears fastest and the nearest, warmest field holds on longest — the
// fog rolls in from the distance rather than blanketing everything at once.
// depth 0 = farthest.
export function ridgeOpacity(load, depth, maxDepth) {
  const v = Math.max(0, Math.min(100, load)) / 100;
  const spread = maxDepth > 0 ? (0.54 / maxDepth) : 0;
  const local = Math.min(1, v * (1.3 - depth * spread));
  return +(1 - local * 0.7).toFixed(3);
}

// ===================================================================
//  PURE: THE SHELF'S SHEDDING ORDER  (§3a, confirmed in §9)
// ===================================================================
// Year radar first — it is texture, and no information is lost by hiding it.
// Then the open slot, which was never load-bearing. The month dial and the
// load gauge hold longest: they are the two Andra would actually miss.
//
// This is the authority, not the media queries — calendar.css hides panels
// from the data-shed attribute this produces, so the order lives in exactly
// one place and a test can walk it.

export const SHELF_PANELS = ["dial", "gauge", "year", "open"];
export const SHELF_SHED_ORDER = [
  { panel: "year", below: 1250 },
  { panel: "open", below: 950 },
];

export function shelfShedFor(width) {
  return SHELF_SHED_ORDER.filter(rule => width < rule.below).map(rule => rule.panel);
}
export function shelfPanelsFor(width) {
  const shed = new Set(shelfShedFor(width));
  return SHELF_PANELS.filter(p => !shed.has(p));
}

// ===================================================================
//  small helpers
// ===================================================================

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// A project colour reaches us as a registry NAME or as a literal hex from the
// picker; colorToken() turns either into something CSS can use. Everything is
// then scrubbed to the small character set a colour can possibly need, because
// it is about to be written into a style attribute.
function safeColor(value) {
  const token = colorToken(value);
  return /^[#\w\-(),.%\s]+$/.test(token) ? token : "var(--color-gray)";
}

// ---- which project does an entry belong to? (October 2026) ----
// Until now only a milestone counted as "in" a project here. A date mark filed
// under the Studio project, or a note assigned to Studio with a due date, was
// drawn in the grey Items lane — which is exactly the bug Andra reported.
//
//   milestone  its itemId IS the project.
//   datemark   the project it was marked for (store.dateMarkProject).
//   item-due   the project(s) it is assigned to. An entry can be in several
//              (links is a set), and a dot can only sit in one lane, so the
//              first one in the hand-sorted project order wins — the same
//              order on every device. That order costs a scan of the archive,
//              so it is only asked for when an entry really is in two or more.
//
// The answer is written onto the entries as `projectId` (and `context`, so the
// tooltip and the list say the project's name where an item used to say
// "Item"). These objects are this frame's own copies, built fresh by
// calendarData(), so writing to them changes nothing anywhere else.
export function annotateOwners(store, entries) {
  let rank = null;
  const byItem = new Map();
  const ownerOfItem = (id) => {
    if (byItem.has(id)) return byItem.get(id);
    const mine = store.projectsOf(id);
    let pick = mine[0] || null;
    if (mine.length > 1) {
      if (!rank) rank = new Map(store.projects().map((p, i) => [p.id, i]));
      pick = mine.slice().sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))[0];
    }
    byItem.set(id, pick);
    return pick;
  };
  for (const e of entries || []) {
    let project = null;
    if (e.source === "milestone") project = e.itemId ? store.get(e.itemId) : null;
    else if (e.source === "datemark") project = store.dateMarkProject(e.itemId);
    else if (e.itemId) project = ownerOfItem(e.itemId);
    e.projectId = project ? project.id : null;
    if (project) e.context = project.title || "Untitled project";
  }
  return entries;
}

// Rule 1: hue is the PROJECT's colour. An entry that is in no project has no
// project identity to carry, so it reads in the neutral faint ink rather than
// borrowing one.
function hueOf(store, entry) {
  if (!entry || !entry.projectId) return "var(--text-faint)";
  const project = store.get(entry.projectId);
  return project ? safeColor(itemColor(store, project)) : "var(--text-faint)";
}

function laneKeyOf(entry) {
  return entry.projectId || null;
}

function whenText(entry, today) {
  const p = parseISO(entry.start);
  const stamp = p ? `${p.d} ${MONTHS[p.mo - 1]}` : "";
  if (entry.done) return { text: `${stamp} · done`, ember: false };
  const n = daysUntil(entry.start, today);
  if (n === null) return { text: stamp, ember: false };
  if (n < 0) return { text: `${stamp} · ${-n} day${n === -1 ? "" : "s"} overdue`, ember: true };
  if (n === 0) return { text: `${stamp} · today`, ember: false };
  const tail = entry.kind === "remind" ? " · reminder" : "";
  return { text: `${stamp} · in ${n} day${n === 1 ? "" : "s"}${tail}`, ember: false };
}

function readCursor() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CURSOR) || "null");
    if (raw && Number.isInteger(raw.y) && raw.mo >= 1 && raw.mo <= 12) return { y: raw.y, mo: raw.mo };
  } catch { /* a corrupt cursor is not worth a broken view */ }
  const t = parseISO(todayISO());
  return { y: t.y, mo: t.mo };
}
function writeCursor(c) {
  try { localStorage.setItem(LS_CURSOR, JSON.stringify(c)); } catch { /* private mode */ }
}
function readMode() {
  try { return localStorage.getItem(LS_MODE) === "month" ? "month" : "approach"; }
  catch { return "approach"; }
}
function readMotion() {
  try { return localStorage.getItem(LS_MOTION) !== "off"; } catch { return true; }
}

// ===================================================================
//  THE VIEW
// ===================================================================

export const calendarView = {
  name: "calendar",
  label: "Calendar",
  // Calendar reads the store through entries.js, not through query(), so
  // app.js should not build a filtered result for it (§7: registration).
  ownFilter: true,
  supportsSelect: false,
  supportsCatalogChrome: false,

  render(result, ctx, container) {
    const view = ensureShell(ctx, container);
    paint(view, ctx);
  },
};

// ---- the shell: built once, kept ----
//
// One live Calendar at a time, tracked at module scope. app.js throws away
// state.viewLocal when you switch views, which would otherwise strand this
// view's resize listener and its once-a-minute day check with no way back to
// them — one abandoned interval per visit to the tab. Holding the mounted
// instance here is what makes the teardown reachable.
let mounted = null;

function ensureShell(ctx, container) {
  const local = ctx.viewLocal;
  if (local.cal && local.cal.root.isConnected && container.contains(local.cal.root)) {
    return local.cal;
  }
  if (mounted) { mounted.teardown(); mounted = null; }
  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "cal-root";
  root.innerHTML = `
    <div class="cal-bar">
      <span class="mk cal-title"></span>
      <div class="cal-monthnav" hidden>
        <button type="button" class="cal-ctl" data-act="prev" aria-label="Previous month">‹</button>
        <button type="button" class="cal-ctl" data-act="next" aria-label="Next month">›</button>
        <button type="button" class="cal-ctl" data-act="today">Today</button>
      </div>
      <div class="cal-controls">
        <button type="button" class="cal-ctl" data-act="approach" aria-pressed="true">Approach</button>
        <button type="button" class="cal-ctl" data-act="month" aria-pressed="false">Month</button>
        <button type="button" class="cal-ctl" data-act="motion" aria-pressed="true">Motion</button>
      </div>
    </div>

    <div class="cal-stripzone">
      <svg class="cal-strip" role="list" aria-label="The approach"></svg>
      <div class="cal-tip" role="status" hidden></div>
    </div>

    <section class="cal-list" aria-label="This month, in order">
      <div class="cal-list-head">
        <h2 class="cal-list-title"></h2>
        <span class="cal-list-count"></span>
        <div class="cal-listnav">
          <button type="button" class="cal-ctl" data-act="prev" aria-label="Previous month">‹</button>
          <button type="button" class="cal-ctl" data-act="next" aria-label="Next month">›</button>
          <button type="button" class="cal-ctl" data-act="today">Today</button>
        </div>
      </div>
      <div class="cal-list-body"></div>
    </section>

    <div class="cal-tray">
      <button type="button" class="cal-tray-head mk" aria-expanded="false"></button>
      <div class="cal-tray-body" hidden></div>
    </div>
  `;
  container.appendChild(root);

  const view = {
    root,
    title: root.querySelector(".cal-title"),
    monthnav: root.querySelector(".cal-monthnav"),
    strip: root.querySelector(".cal-strip"),
    stripzone: root.querySelector(".cal-stripzone"),
    tip: root.querySelector(".cal-stripzone .cal-tip"),
    listTitle: root.querySelector(".cal-list-title"),
    listCount: root.querySelector(".cal-list-count"),
    listnav: root.querySelector(".cal-listnav"),
    listBody: root.querySelector(".cal-list-body"),
    listSig: null,       // what the list last drew, so an unchanged list is left alone
    listMonth: null,     // which month it last drew, so a NEW month scrolls to today
    listEntries: new Map(),
    trayHead: root.querySelector(".cal-tray-head"),
    trayBody: root.querySelector(".cal-tray-body"),
    mode: readMode(),
    cursor: readCursor(),
    motion: readMotion(),
    trayOpen: false,
    flip: null,          // the mounted flip widget, if one is open
    flipFor: null,       // and which tray row it belongs to
    entriesById: new Map(),
    today: todayISO(),
  };

  root.dataset.motion = view.motion ? "on" : "off";

  root.querySelector(".cal-controls").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "approach" || act === "month") {
      view.mode = act;
      try { localStorage.setItem(LS_MODE, act); } catch { /* private mode */ }
    } else if (act === "motion") {
      view.motion = !view.motion;
      root.dataset.motion = view.motion ? "on" : "off";
      try { localStorage.setItem(LS_MOTION, view.motion ? "on" : "off"); } catch { /* private mode */ }
    }
    paint(view, ctx);
  });

  // Two sets of month buttons drive ONE cursor: the bar's (shown in Month mode,
  // next to the strip it moves) and the list's own (shown otherwise, so the
  // list can always change month). Only one set is ever on screen.
  const onMonthNav = (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "today") view.cursor = readCursorFromToday();
    else {
      const step = btn.dataset.act === "next" ? 1 : -1;
      let { y, mo } = view.cursor;
      mo += step;
      if (mo > 12) { mo = 1; y++; }
      if (mo < 1) { mo = 12; y--; }
      view.cursor = { y, mo };
    }
    writeCursor(view.cursor);
    paint(view, ctx);
  };
  view.monthnav.addEventListener("click", onMonthNav);
  view.listnav.addEventListener("click", onMonthNav);

  // One listener for every row of the list. It reads the LATEST frame's context
  // (view.lastShared), not the one this shell was built with, because app.js
  // makes a fresh ctx on every render.
  view.listBody.addEventListener("click", (ev) => {
    const row = ev.target.closest(".cal-item");
    if (!row || !view.lastShared) return;
    const e = view.listEntries.get(row.dataset.eid);
    if (e && e.itemId) view.lastShared.ctx.onOpen(e.itemId);
  });

  view.trayHead.addEventListener("click", () => {
    view.trayOpen = !view.trayOpen;
    paint(view, ctx);
  });

  // The strip is measured, not assumed: it re-renders from its container's
  // real size so the whole instrument adapts as the window does (§2).
  let resizeTimer = null;
  const onResize = () => {
    if (!root.isConnected) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (root.isConnected) paint(view, ctx); }, 120);
  };
  window.addEventListener("resize", onResize);

  // ...and the window is not the only thing that changes that size. Opening
  // the tray takes a bite out of the strip; so does the flip mechanism
  // appearing inside an already-open tray. Watching the strip's own box
  // catches all of it, including the cases nobody thought of — without it,
  // the strip stays drawn at its old height and quietly clips its bottom lane
  // and its whole day axis off the end of the screen.
  //
  // This cannot feed back on itself: the SVG is taller than its container only
  // inside overflow:hidden, so redrawing never changes the box being watched.
  let boxTimer = null;
  let observer = null;
  if (typeof ResizeObserver === "function") {
    observer = new ResizeObserver(() => {
      if (!root.isConnected) return;
      clearTimeout(boxTimer);
      boxTimer = setTimeout(() => {
        if (!root.isConnected || !view.lastShared) return;
        const w = Math.max(560, view.stripzone.clientWidth || 900);
        const h = Math.max(160, view.stripzone.clientHeight || 380);
        if (view.stripSize === `${w}x${h}`) return;
        renderStrip(view, view.lastShared);
      }, 60);
    });
    observer.observe(view.stripzone);
  }

  // Day rollover: a calendar left open overnight must not keep saying
  // "in 1 day" about yesterday. Cheap, lazy, and only while visible.
  const checkDay = () => {
    // A view that has been navigated away from stops costing anything, even if
    // nothing thought to tear it down.
    if (!root.isConnected) { view.teardown(); return; }
    if (document.visibilityState === "hidden") return;
    const now = todayISO();
    if (now !== view.today) { view.today = now; paint(view, ctx); }
  };
  const dayTimer = setInterval(checkDay, 60000);
  document.addEventListener("visibilitychange", checkDay);

  let torn = false;
  view.teardown = () => {
    if (torn) return;
    torn = true;
    closeFlip(view);
    clearTimeout(resizeTimer);
    clearTimeout(boxTimer);
    if (observer) observer.disconnect();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", checkDay);
    clearInterval(dayTimer);
    if (mounted === view) mounted = null;
  };

  mounted = view;
  ctx.viewLocal.cal = view;
  return view;
}

function readCursorFromToday() {
  const t = parseISO(todayISO());
  return { y: t.y, mo: t.mo };
}

// ===================================================================
//  ONE PASS PER FRAME
// ===================================================================

function paint(view, ctx) {
  const store = ctx.store;
  const today = view.today = todayISO();
  const t = parseISO(today);

  // THE one archive scan. Open lower bound so nothing overdue is ever
  // dropped; the end covers the strip's horizon, the radar's whole year and
  // whatever month the cursor is parked on, whichever reaches furthest.
  const ends = [
    toISO(t.y, 12, 31),
    isoPlusDays(today, CAL_HORIZON_DAYS),
    toISO(view.cursor.y, view.cursor.mo, daysInMonth(view.cursor.y, view.cursor.mo)),
    toISO(view.cursor.y, 12, 31),
  ];
  const end = ends.reduce((a, b) => (a > b ? a : b));
  const data = calendarData(store, null, end, { today });
  // Before anything reads a lane, a colour or a project name off an entry.
  annotateOwners(store, data.entries);

  const finals = finalMilestoneIndex(store, data.entries);
  const weightFor = (e) => weightOf(e, finals.get(e.itemId) === e.mid);

  const lanes = lanesFor(store, data.entries);
  const shared = { store, ctx, today, t, data, weightFor, lanes };
  // kept so the box watcher can redraw the strip alone, without a second
  // archive pass, when something else on the screen changes its size
  view.lastShared = shared;

  // ORDER MATTERS HERE, for one non-obvious reason: the tray is the only part
  // of this screen whose own content changes how much height everything else
  // gets (expanding it takes a bite out of the strip). The strip is MEASURED
  // rather than assumed, so it has to be measured after the tray has settled —
  // otherwise opening the tray leaves a strip drawn at the old height, with
  // its bottom lane and its whole day axis quietly clipped off.
  renderBar(view, shared);
  renderTray(view, shared);
  renderStrip(view, shared);
  renderList(view, shared);
  // renderDial / renderGauge / renderYear are retired from the screen (October
  // 2026) and deliberately NOT called. See "THE RETIRED SHELF" below.
}

function isoPlusDays(dateStr, n) {
  const p = parseISO(dateStr);
  const d = new Date(p.y, p.mo - 1, p.d + n, 12);
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Lanes come from the projects that ACTUALLY have entries in the window, not
// from a fixed list — an archive with two live projects gets two lanes and
// the room back. Alphabetical, with the Items lane last.
function lanesFor(store, entries) {
  const seen = new Map();
  let hasItems = false;
  for (const e of entries) {
    const key = laneKeyOf(e);
    if (key === null) { hasItems = true; continue; }
    if (!seen.has(key)) seen.set(key, e.context || "Untitled project");
  }
  const lanes = [...seen.entries()]
    .map(([key, title]) => ({ key, title }))
    .sort((a, b) => a.title.localeCompare(b.title));
  if (hasItems || !lanes.length) lanes.push({ key: null, title: "Items" });
  return lanes;
}

function renderBar(view, s) {
  const isMonth = view.mode === "month";
  view.monthnav.hidden = !isMonth;
  view.listnav.hidden = isMonth;      // one set of month buttons on screen, never two
  view.title.textContent = isMonth
    ? `${MONTHS_FULL[view.cursor.mo - 1]} ${view.cursor.y}`
    : "The approach · next four months";
  for (const btn of view.root.querySelectorAll(".cal-controls [data-act]")) {
    if (btn.dataset.act === "approach") btn.setAttribute("aria-pressed", String(!isMonth));
    if (btn.dataset.act === "month") btn.setAttribute("aria-pressed", String(isMonth));
    if (btn.dataset.act === "motion") btn.setAttribute("aria-pressed", String(view.motion));
  }
}

// ===================================================================
//  THE APPROACH STRIP  (§2a) — one renderer, two axis functions
// ===================================================================

function renderStrip(view, s) {
  const zone = view.stripzone;
  // MEASURED, never assumed. The fallbacks are for a headless DOM, which
  // reports every box as zero; the floors are only there so a pathologically
  // short window still draws something rather than dividing a lane height
  // into nothing.
  const W = Math.max(560, zone.clientWidth || 900);
  const H = Math.max(160, zone.clientHeight || 380);
  view.stripSize = `${W}x${H}`;
  const svg = view.strip;
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const lanes = s.lanes;
  const laneH = (H - LANE_TOP - AXIS_H) / Math.max(1, lanes.length);
  const laneY = (i) => LANE_TOP + i * laneH + laneH / 2;

  let out = "";
  let xOf, shown;

  if (view.mode === "approach") {
    const live = s.data.entries.filter(e => !e.done);
    const overdue = live.filter(e => daysUntil(e.start, s.today) < 0);
    const oldest = overdue.length ? Math.max(...overdue.map(e => -daysUntil(e.start, s.today))) : 0;
    const geom = approachGeometry(W, oldest);
    xOf = (e) => approachX(daysUntil(e.start, s.today), geom);
    // A FINISHED thing whose date is still ahead stays on the approach, drawn
    // quietly as done (the same muted grain Month uses for history). It used
    // to be hidden with every other done entry, which left its project's lane
    // sitting empty and read as "my milestone isn't on the Calendar" (October
    // 2026). Finished things in the PAST still belong to Month, not here:
    // the left of NOW is the overdue zone, and done is never overdue.
    const doneAhead = s.data.entries.filter(e => e.done && daysUntil(e.start, s.today) >= 0);
    shown = live.concat(doneAhead).filter(e => daysUntil(e.start, s.today) <= CAL_HORIZON_DAYS);

    if (overdue.length) {
      out += `<rect class="cal-overdue-zone" x="0" y="0" width="${geom.nowX}" height="${H}"/>`;
      if (geom.zone > 70) {
        out += `<text class="cal-zone-label" x="${geom.nowX / 2}" y="${LANE_TOP - 24}" text-anchor="middle">OVERDUE</text>`;
      }
    }
    out += approachGrid(geom, H, s.today);
    out += `<line class="cal-now" x1="${geom.nowX}" y1="${LANE_TOP - 26}" x2="${geom.nowX}" y2="${H - AXIS_H + 4}"/>`;
    out += `<text class="cal-now-label" x="${geom.nowX}" y="${LANE_TOP - 34}" text-anchor="middle">NOW</text>`;
  } else {
    const n = daysInMonth(view.cursor.y, view.cursor.mo);
    const prefix = `${view.cursor.y}-${String(view.cursor.mo).padStart(2, "0")}-`;
    xOf = (e) => monthX(parseISO(e.start).d, n, W);
    shown = s.data.entries.filter(e => String(e.start).startsWith(prefix));
    out += monthGrid(view.cursor, n, W, H, s.t);
  }

  for (let i = 0; i < lanes.length; i++) {
    const y = laneY(i);
    out += `<line class="cal-lane" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
    out += `<text class="cal-lane-label" x="8" y="${y - 13}">${esc(lanes[i].title.toUpperCase())}</text>`;
  }

  // Resolved from this module's own URL rather than written relative to the
  // document: an <image href> inside SVG resolves against the PAGE, so a
  // document-relative path would break the moment anything other than
  // index.html renders the strip (tests/calendar-harness.html, for one).
  out += `<defs><pattern id="cal-grain-tile" patternUnits="userSpaceOnUse" width="140" height="140">`
      + `<image href="${GRAIN_URL}" width="140" height="140"/></pattern></defs>`;

  view.entriesById = new Map();
  const laneIndex = new Map(lanes.map((l, i) => [l.key, i]));
  const lastAt = new Map();

  const ordered = shown.slice().sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (const e of ordered) {
    const li = laneIndex.has(laneKeyOf(e)) ? laneIndex.get(laneKeyOf(e)) : lanes.length - 1;
    let y = laneY(li);
    const x = xOf(e);

    // In the compressed far field two marks can land almost on top of each
    // other. Nudge alternate collisions off the lane line rather than letting
    // them merge into one illegible blob.
    const prev = lastAt.get(li);
    if (prev && x - prev.x < COLLIDE_PX) {
      y += prev.flip ? -COLLIDE_NUDGE : COLLIDE_NUDGE;
      lastAt.set(li, { x, flip: !prev.flip });
    } else {
      lastAt.set(li, { x, flip: false });
    }

    out += markSvg(s, e, x, y, "cal-mark", view.entriesById);

    // Labels within a fortnight, in the mono voice. Overdue labels go BENEATH
    // the mark in ember; everything else sits beside it, flipping to the left
    // when the mark is close enough to the right edge to be clipped.
    const n = daysUntil(e.start, s.today);
    if (!e.done && e.kind !== "remind" && (view.mode === "month" || n <= LABEL_HORIZON_DAYS)) {
      const r = markRadius(s.weightFor(e));
      if (view.mode === "approach" && n < 0) {
        out += `<text class="cal-mark-label is-overdue" data-lane="${li}" data-eid="${esc(e.id)}" x="${x}" y="${y + r + 15}" text-anchor="middle">${esc(e.label.toUpperCase())}</text>`;
      } else {
        const flip = x > W - 150;
        const tx = flip ? x - r - 6 : x + r + 6;
        const cls = n < 0 ? "cal-mark-label is-overdue" : "cal-mark-label";
        out += `<text class="${cls}" data-lane="${li}" data-eid="${esc(e.id)}" x="${tx}" y="${y + 4}" text-anchor="${flip ? "end" : "start"}">${esc(e.label.toUpperCase())}</text>`;
      }
    }
  }

  svg.innerHTML = out;
  pruneLabels(svg);
  wireMarks(view, s, svg, view.tip, view.stripzone, (x, y) => ({ x, y }), 1);
}

// A busy fortnight can put more labels on one lane than the lane has room
// for, and two overlapping words are worse than one word and a tooltip — the
// quiet far field is already part of the reading, so a crowded near field
// borrowing the same silence is consistent rather than a compromise.
//
// Measured rather than estimated: getBBox() knows the real width at the real
// text scale, which a character count never would. It only exists in a real
// browser, so a headless render simply keeps every label (which is what the
// structural tests want to see anyway).
function pruneLabels(svg) {
  const labels = [...svg.querySelectorAll(".cal-mark-label")];
  if (!labels.length || typeof labels[0].getBBox !== "function") return;

  // Marks are obstacles too, not just other labels — a word running under the
  // next circle along the lane is the crowding you actually see first.
  const marks = [...svg.querySelectorAll(".cal-mark")].map(el => ({
    eid: el.dataset.eid,
    x: +el.getAttribute("cx") - +el.getAttribute("r"),
    y: +el.getAttribute("cy") - +el.getAttribute("r"),
    width: 2 * +el.getAttribute("r"),
    height: 2 * +el.getAttribute("r"),
  }));
  const overlaps = (a, b, pad) =>
    a.x < b.x + b.width + pad && b.x < a.x + a.width + pad &&
    a.y < b.y + b.height && b.y < a.y + a.height;

  const keptByLane = new Map();
  for (const el of labels) {
    let box;
    try { box = el.getBBox(); } catch { return; }
    const kept = keptByLane.get(el.dataset.lane) || [];
    const clash =
      kept.some(b => overlaps(box, b, 6)) ||
      marks.some(m => m.eid !== el.dataset.eid && overlaps(box, m, 2));
    if (clash) { el.style.display = "none"; continue; }
    kept.push(box);
    keptByLane.set(el.dataset.lane, kept);
  }
}

// Gridlines follow the compression: daily to +14, weekly to +56, then the
// actual month boundaries out to the horizon. A gap that is one day near the
// line is a whole month at the far end, and the gridlines say so.
function approachGrid(geom, H, today) {
  let out = "";
  const y2 = H - AXIS_H;
  for (let d = 1; d <= 14; d++) {
    const x = approachX(d, geom);
    out += `<line class="cal-grid${d % 7 === 0 ? " is-week" : ""}" x1="${x}" y1="${LANE_TOP - 14}" x2="${x}" y2="${y2}"/>`;
    if ((d <= 7 && approachX(d, geom) - approachX(d - 1, geom) >= 17) || d === 7 || d === 14) {
      out += `<text class="cal-axis-num" x="${x}" y="${H - 12}" text-anchor="middle">+${d}</text>`;
    }
  }
  for (let d = 21; d <= 56; d += 7) {
    const x = approachX(d, geom);
    out += `<line class="cal-grid${d % 28 === 0 ? " is-week" : ""}" x1="${x}" y1="${LANE_TOP - 14}" x2="${x}" y2="${y2}"/>`;
    if (d === 28) out += `<text class="cal-axis-num" x="${x}" y="${H - 12}" text-anchor="middle">+28</text>`;
  }
  const t = parseISO(today);
  let cur = { y: t.y, mo: t.mo };
  for (;;) {
    cur.mo++;
    if (cur.mo > 12) { cur.mo = 1; cur.y++; }
    const d = daysUntil(toISO(cur.y, cur.mo, 1), today);
    if (d > CAL_HORIZON_DAYS) break;
    const x = approachX(d, geom);
    out += `<line class="cal-grid is-month" x1="${x}" y1="${LANE_TOP - 18}" x2="${x}" y2="${y2}"/>`;
    out += `<text class="cal-axis-month" x="${x + 4}" y="${H - 12}" text-anchor="start">${MONTHS[cur.mo - 1]}</text>`;
  }
  return out;
}

function monthGrid(cursor, n, W, H, t) {
  let out = "";
  for (let d = 1; d <= n; d++) {
    const x = monthX(d, n, W);
    const isToday = t.y === cursor.y && t.mo === cursor.mo && t.d === d;
    const cls = isToday ? "cal-now" : `cal-grid${d % 7 === 1 ? " is-week" : ""}`;
    out += `<line class="${cls}" x1="${x}" y1="${LANE_TOP - 14}" x2="${x}" y2="${H - AXIS_H}"/>`;
    out += `<text class="cal-axis-num${isToday ? " is-today" : ""}" x="${x}" y="${H - 12}" text-anchor="middle">${d}</text>`;
    if (isToday) out += `<text class="cal-now-label" x="${x}" y="${LANE_TOP - 34}" text-anchor="middle">NOW</text>`;
  }
  return out;
}

// One mark, painted by the ramp. The paint is entirely CSS: the class picks
// the band, --pc carries the project's own hue, and color-mix() in
// css/calendar.css does the dye. Nothing here computes a colour, which is
// what makes a theme swap free.
function markSvg(s, e, x, y, cls, registry, radiusBonus = 0) {
  const ramp = rampOf(e, s.today);
  const w = s.weightFor(e);
  const r = markRadius(w || 1) + radiusBonus;
  const hue = hueOf(s.store, e);
  const id = e.id;
  registry.set(id, e);
  const when = whenText(e, s.today);
  const context = e.context || "Item";
  const aria = `${context}: ${e.label}, ${when.text}`;

  let out = `<circle class="${cls} ramp-${ramp.key} w${w}" tabindex="0" role="listitem"`
    + ` aria-label="${esc(aria)}" data-eid="${esc(id)}" data-cx="${x}" data-cy="${y}" data-r="${r}"`
    + ` cx="${x}" cy="${y}" r="${r}" style="--pc:${hue}"></circle>`;
  if (hasGrain(ramp.key)) {
    out += `<circle class="cal-mark-grain" cx="${x}" cy="${y}" r="${r}" fill="url(#cal-grain-tile)" aria-hidden="true"></circle>`;
  }
  return out;
}

// ===================================================================
//  THE TOOLTIP — information AT the mark, for pointer AND keyboard
// ===================================================================
// v1 put this in a caption line away from the marks and Andra couldn't make
// the connection across the distance. So it speaks where the mark is, it is
// made of the same mount material as the flip clock so the two mechanisms
// rhyme, and it follows FOCUS as well as hover — the information is never
// hover-only, and every mark is in the tab order with a full aria-label.

function wireMarks(view, s, svg, tipEl, hostEl, toLocal, scale) {
  const show = (el) => {
    const e = view.entriesById.get(el.dataset.eid);
    if (!e) return;
    const when = whenText(e, s.today);
    tipEl.innerHTML =
      `<span class="mk">${esc(e.context || "Item")}</span>` +
      `<span class="cal-tip-t">${esc(e.label)}</span>` +
      `<span class="cal-tip-when${when.ember ? " is-overdue" : ""}">${esc(when.text)}</span>`;
    tipEl.hidden = false;
    const { x, y } = toLocal(+el.dataset.cx, +el.dataset.cy);
    const host = hostEl.getBoundingClientRect();
    const place = tooltipPlacement({
      x, y, r: (+el.dataset.r) * scale,
      tipW: tipEl.offsetWidth, tipH: tipEl.offsetHeight,
      hostW: host.width,
    });
    tipEl.classList.toggle("is-below", place.below);
    tipEl.style.left = `${place.left}px`;
    tipEl.style.top = `${place.top}px`;
    tipEl.style.setProperty("--cal-arrow-x", `${place.arrowX}px`);
    el.classList.add("is-hot");
  };
  const hide = (el) => { tipEl.hidden = true; el && el.classList.remove("is-hot"); };

  for (const el of svg.querySelectorAll("[data-eid]")) {
    el.addEventListener("mouseenter", () => show(el));
    el.addEventListener("mouseleave", () => hide(el));
    el.addEventListener("focus", () => show(el));
    el.addEventListener("blur", () => hide(el));
    el.addEventListener("click", () => openEntry(view, s, el));
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openEntry(view, s, el); }
      if (ev.key === "Escape") hide(el);
    });
  }
}

function openEntry(view, s, el) {
  const e = view.entriesById.get(el.dataset.eid);
  if (e && e.itemId) s.ctx.onOpen(e.itemId);
}

// ===================================================================
//  THE MONTH LIST  (October 2026)
// ===================================================================
// Everything dated in one month, in order, as plain readable rows — the thing
// Andra asked for in place of the three instruments she found cluttered. It
// shows the month the cursor is on (today's month to begin with), and its own
// ‹ › Today buttons move that cursor.
//
// One row per entry, milestones, date marks, ordinary entries and reminders
// alike, because that is what "all of the calendar items" means. Finished and
// past things stay in, muted: a month should read as the whole month, not as
// whatever is left of it. Overdue is ember in the words only. The dot is the
// project's colour, always — hue is identity (§1 rule 1) — drawn solid for a
// live thing, as a ring for a finished one and a dashed ring for a reminder,
// the same grammar the strip's marks use.
//
// A TODAY divider sits where today falls, and the list opens scrolled to it,
// so "what's next" is the first thing you see rather than the 1st of the month.

function listWhen(e, today) {
  if (e.done) return { text: e.source === "datemark" ? "passed" : "done", ember: false };
  const n = daysUntil(e.start, today);
  if (n === null) return { text: "", ember: false };
  if (n < 0) return { text: `${-n} day${n === -1 ? "" : "s"} overdue`, ember: true };
  const tail = e.kind === "remind" ? " · reminder" : "";
  if (n === 0) return { text: `today${tail}`, ember: false };
  return { text: `in ${n} day${n === 1 ? "" : "s"}${tail}`, ember: false };
}

function renderList(view, s) {
  const { y, mo } = view.cursor;
  const prefix = `${y}-${String(mo).padStart(2, "0")}-`;
  // entries.js already sorted these by date, then due-before-reminder, then name
  const rows = s.data.entries.filter(e => String(e.start).startsWith(prefix));
  const isThisMonth = s.t.y === y && s.t.mo === mo;
  const monthKey = `${y}-${mo}`;

  view.listTitle.textContent = `${MONTHS_FULL[mo - 1]} ${y}`;
  view.listCount.textContent = `${rows.length} ${rows.length === 1 ? "item" : "items"}`;

  // Nothing to redraw if nothing the list shows has changed. This is what keeps
  // an unrelated store write from yanking the scroll position or keyboard focus
  // out from under a list being read.
  const hues = rows.map(e => hueOf(s.store, e));
  const sig = [monthKey, isThisMonth ? s.today : "", rows.map((e, i) =>
    [e.id, e.label, e.context, e.start, e.done ? 1 : 0, e.kind, hues[i]].join("~")).join("|")].join("#");
  if (sig === view.listSig) return;
  view.listSig = sig;
  view.listEntries = new Map(rows.map(e => [e.id, e]));

  const todayDivider = () => {
    const wd = WEEKDAYS[new Date(s.t.y, s.t.mo - 1, s.t.d, 12).getDay()];
    return `<div class="cal-list-today" role="separator">Today · ${wd} ${s.t.d} ${MONTHS[s.t.mo - 1]}</div>`;
  };

  let html = "";
  let lastDay = null;
  let dividerDrawn = false;
  rows.forEach((e, i) => {
    if (isThisMonth && !dividerDrawn && e.start >= s.today) { html += todayDivider(); dividerDrawn = true; }
    const p = parseISO(e.start);
    const showDay = e.start !== lastDay;
    lastDay = e.start;
    const wd = WEEKDAYS[new Date(p.y, p.mo - 1, p.d, 12).getDay()];
    const ramp = rampOf(e, s.today);
    const when = listWhen(e, s.today);
    const aria = `${e.context || "No project"}: ${e.label}, ${whenText(e, s.today).text}`;
    html += `<button type="button" class="cal-item ramp-${ramp.key}${e.start === s.today ? " is-today" : ""}"`
      + ` data-eid="${esc(e.id)}" style="--pc:${hues[i]}" aria-label="${esc(aria)}">`
      + `<span class="cal-item-day" aria-hidden="true">`
      + (showDay ? `<span class="cal-item-num">${p.d}</span><span class="cal-item-wd">${wd}</span>` : "")
      + `</span>`
      + `<span class="cal-item-dot" aria-hidden="true"></span>`
      + `<span class="cal-item-main"><span class="cal-item-label">${esc(e.label)}</span>`
      + `<span class="cal-item-ctx">${esc(e.context || "No project")}</span></span>`
      + `<span class="cal-item-when${when.ember ? " is-overdue" : ""}">${esc(when.text)}</span>`
      + `</button>`;
  });
  if (isThisMonth && !dividerDrawn) html += todayDivider();      // today is past the last row
  if (!rows.length) html = `<p class="cal-list-empty">Nothing dated in ${MONTHS_FULL[mo - 1]}.</p>`;

  const body = view.listBody;
  const keep = body.scrollTop;
  body.innerHTML = html;
  if (view.listMonth !== monthKey) {
    // A different month (or the first draw): open at today's line, or the top.
    view.listMonth = monthKey;
    const mark = body.querySelector(".cal-list-today");
    body.scrollTop = mark ? mark.offsetTop : 0;
  } else {
    body.scrollTop = keep;
  }
}

// ===================================================================
//  THE RETIRED SHELF — month dial, year radar, load gauge  (October 2026)
// ===================================================================
// Andra asked for these three to come off the Calendar screen: "they just
// aren't necessary and they create a lot of clutter." They are RETIRED, not
// deleted — the house rule (START-HERE.md, "unregister, don't delete") for
// anything that might come back. Nothing below is called any more.
//
// To bring them back (all three, or one):
//   1. Put this markup back in ensureShell's template, between the strip and
//      the month list (and give the .cal-root grid in css/calendar.css one
//      more row for it):
//
//        <div class="cal-shelf" data-shed="">
//          <section class="cal-panel cal-panel-dial" aria-label="Month at a glance">
//            <svg class="cal-dial" viewBox="0 0 ${DIAL_VB} ${DIAL_VB}"></svg>
//            <span class="mk cal-cap cal-dial-cap"></span>
//            <div class="cal-tip cal-tip-dial" role="status" hidden></div>
//          </section>
//          <section class="cal-panel cal-panel-gauge" aria-label="Load">
//            <div class="cal-window"><div class="cal-glass">
//              <svg class="cal-scene" viewBox="0 0 ${SCENE_W} ${SCENE_H}"
//                   preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>
//              <div class="cal-gauge-grain" aria-hidden="true"></div>
//              <div class="cal-mullion-v" aria-hidden="true"></div>
//              <div class="cal-mullion-h" aria-hidden="true"></div>
//            </div></div>
//            <div class="cal-sill" aria-hidden="true"></div>
//            <span class="mk cal-cap cal-gauge-cap"></span>
//          </section>
//          <section class="cal-panel cal-panel-year" aria-label="The year">
//            <svg class="cal-year" viewBox="0 0 ${YEAR_VB} ${YEAR_VB}" aria-hidden="true"></svg>
//            <span class="mk cal-cap cal-year-cap"></span>
//          </section>
//          <section class="cal-panel cal-panel-open" aria-hidden="true"></section>
//        </div>
//
//   2. In ensureShell's `view` object, add back: shelf (.cal-shelf), dial,
//      dialCap, dialTip, scene, gaugeGrain, gaugeCap, year, yearCap — each a
//      root.querySelector of the class above — and call loadScene(view) once
//      the view is built.
//   3. In renderStrip, after the marks are drawn, add back:
//        view.shelf.dataset.shed = shelfShedFor(view.root.clientWidth || W).join(" ");
//   4. In paint(), call renderDial(view, shared), renderGauge(view, shared) and
//      renderYear(view, shared).
//
// Their pure helpers (loadScore, fogLayers, ridgeOpacity, shelfShedFor …) are
// still exported and still tested, and css/calendar.css still carries their
// rules, so none of this needs anything new to be written.

// ===================================================================
//  ACCENT 1 — the month dial  (§3)  — RETIRED, see above
// ===================================================================
// The month as a clock face. Its best moment, kept from v1: OVERDUE FALLS
// OUT OF ORBIT — pulled to the centre in ember, dash-tethered to where it
// belongs, with a hollow ring left in its place. A month with debt in it
// looks structurally wrong before you read anything.

function renderDial(view, s) {
  const { y: cy0, mo } = view.cursor;
  const n = daysInMonth(cy0, mo);
  const angle = (d) => ((d - 1) / n) * Math.PI * 2 - Math.PI / 2;
  const pt = (d, r) => [DIAL_C + Math.cos(angle(d)) * r, DIAL_C + Math.sin(angle(d)) * r];
  const lanes = s.lanes;
  const laneR = radiusScale(lanes.length, DIAL_R_OUT, DIAL_R_IN);
  const laneIndex = new Map(lanes.map((l, i) => [l.key, i]));
  const isThisMonth = s.t.y === cy0 && s.t.mo === mo;

  let out = "";
  // The slow sweep. 75 seconds a turn — an instrument idling, not an
  // animation demanding attention. CSS hides it under reduced motion and
  // under the Motion toggle; nothing here checks.
  out += `<g class="cal-sweep"><path class="cal-sweep-arm" d="M ${DIAL_C} ${DIAL_C} L ${DIAL_C} ${DIAL_C - 330}`
      + ` A 330 330 0 0 1 ${DIAL_C + 330 * Math.sin(0.5)} ${DIAL_C - 330 * Math.cos(0.5)} Z"/></g>`;
  for (let i = 0; i < lanes.length; i++) {
    out += `<circle class="cal-orbit" cx="${DIAL_C}" cy="${DIAL_C}" r="${laneR(i)}"/>`;
  }
  for (let d = 1; d <= n; d++) {
    const isToday = isThisMonth && d === s.t.d;
    const [x1, y1] = pt(d, DIAL_TICK_IN), [x2, y2] = pt(d, DIAL_TICK_OUT);
    out += `<line class="cal-tick${isToday ? " is-today" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    if (isToday || d === 1 || d % 7 === 0) {
      const [tx, ty] = pt(d, DIAL_NUM_R);
      out += `<text class="cal-dial-num${isToday ? " is-today" : ""}" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle">${d}</text>`;
    }
    if (isToday) {
      const [hx, hy] = pt(d, DIAL_TICK_IN - 10);
      out += `<line class="cal-dial-hand" x1="${DIAL_C}" y1="${DIAL_C}" x2="${hx}" y2="${hy}"/>`;
    }
  }

  const prefix = `${cy0}-${String(mo).padStart(2, "0")}-`;
  const inMonth = s.data.entries.filter(e => String(e.start).startsWith(prefix));
  const registry = view.entriesById;
  for (const e of inMonth) {
    const d = parseISO(e.start).d;
    const li = laneIndex.has(laneKeyOf(e)) ? laneIndex.get(laneKeyOf(e)) : lanes.length - 1;
    const ramp = rampOf(e, s.today);
    const home = laneR(li);
    const orbiting = ramp.key !== "overdue";
    const r = orbiting ? home : DIAL_ORPHAN_R;
    const [x, y] = pt(d, r);
    if (!orbiting) {
      const [ox, oy] = pt(d, home);
      out += `<line class="cal-tether" x1="${ox}" y1="${oy}" x2="${x}" y2="${y}"/>`;
      out += `<circle class="cal-vacancy" cx="${ox}" cy="${oy}" r="4"/>`;
    }
    // +4 in the dial's own viewBox units: the face is drawn at 720 and shown
    // at a third of that, so a strip-sized mark would land as a speck.
    out += markSvg(s, e, x, y, "cal-mark cal-mark-dial", registry, 4);
  }

  const live = inMonth.filter(e => !e.done && e.kind !== "remind");
  const od = live.filter(e => daysUntil(e.start, s.today) < 0).length;
  out += `<text class="cal-dial-month" x="${DIAL_C}" y="${DIAL_C - 6}" text-anchor="middle">${MONTHS[mo - 1]}</text>`;
  out += `<text class="cal-dial-count${od ? " is-overdue" : ""}" x="${DIAL_C}" y="${DIAL_C + 30}" text-anchor="middle">`
      + `${od ? `${od} OVERDUE · ` : ""}${live.length} DATED</text>`;

  view.dial.innerHTML = out;
  view.dialCap.textContent = `${MONTHS_FULL[mo - 1]} · at a glance`;

  const rect = view.dial.getBoundingClientRect();
  const k = (rect.width || DIAL_VB) / DIAL_VB;
  wireMarks(view, s, view.dial, view.dialTip, view.dial.parentElement,
    (x, y) => ({ x: x * k, y: y * k }), k);
}

// Evenly spaced orbits, outermost first. One lane still gets a sensible
// radius rather than dividing by zero.
function radiusScale(count, outer, inner) {
  if (count <= 1) return () => (outer + inner) / 2;
  const step = (outer - inner) / (count - 1);
  return (i) => outer - i * step;
}

// ===================================================================
//  ACCENT 2 — the year radar  (§3)
// ===================================================================
// Deliberately tiny and dense: the whole calendar year as one face, no
// labels and no tooltips. It is texture that happens to be true.

function renderYear(view, s) {
  const year = s.t.y;
  const lanes = s.lanes;
  const laneR = radiusScale(lanes.length, YEAR_R_OUT, YEAR_R_IN);
  const laneIndex = new Map(lanes.map((l, i) => [l.key, i]));
  const angleOf = (doy) => (doy / 365) * Math.PI * 2 - Math.PI / 2;

  let out = "";
  for (let m = 0; m < 12; m++) {
    const a = angleOf(dayOfYear(toISO(year, m + 1, 1)));
    out += `<line class="cal-year-spoke" x1="${YEAR_C + Math.cos(a) * 36}" y1="${YEAR_C + Math.sin(a) * 36}"`
        + ` x2="${YEAR_C + Math.cos(a) * 98}" y2="${YEAR_C + Math.sin(a) * 98}"/>`;
    const mid = a + Math.PI / 12;
    out += `<text class="cal-year-letter" x="${YEAR_C + Math.cos(mid) * 108}" y="${YEAR_C + Math.sin(mid) * 108}"`
        + ` text-anchor="middle" dominant-baseline="middle">${MONTHS[m][0]}</text>`;
  }
  for (let i = 0; i < lanes.length; i++) {
    out += `<circle class="cal-year-orbit" cx="${YEAR_C}" cy="${YEAR_C}" r="${laneR(i)}"/>`;
  }
  const ta = angleOf(dayOfYear(s.today));
  out += `<line class="cal-year-hand" x1="${YEAR_C + Math.cos(ta) * 26}" y1="${YEAR_C + Math.sin(ta) * 26}"`
      + ` x2="${YEAR_C + Math.cos(ta) * 98}" y2="${YEAR_C + Math.sin(ta) * 98}"/>`;

  const prefix = `${year}-`;
  for (const e of s.data.entries) {
    if (!String(e.start).startsWith(prefix)) continue;
    const li = laneIndex.has(laneKeyOf(e)) ? laneIndex.get(laneKeyOf(e)) : lanes.length - 1;
    const a = angleOf(dayOfYear(e.start));
    const r = laneR(li);
    const ramp = rampOf(e, s.today);
    const grain = ramp.key === "done" ? "is-done"
      : ramp.key === "overdue" ? "is-overdue"
      : (ramp.key === "mid" || ramp.key === "near" || ramp.key === "soon") ? "is-near" : "is-far";
    out += `<circle class="cal-grain-mark ${grain}" cx="${YEAR_C + Math.cos(a) * r}" cy="${YEAR_C + Math.sin(a) * r}"`
        + ` r="${radarRadius(s.weightFor(e) || 1)}" style="--pc:${hueOf(s.store, e)}"/>`;
  }
  out += `<text class="cal-year-label" x="${YEAR_C}" y="${YEAR_C + 3}" text-anchor="middle">${year}</text>`;
  view.year.innerHTML = out;
  view.yearCap.textContent = `${year} · the whole year`;
}

// ===================================================================
//  THE LOAD GAUGE — "the fog, windowed"  (§3b)
// ===================================================================
// A window over layered hills. Clear and warm on a quiet day; a dark fog
// rises out of the valley and thickens as the desk fills. Dusk settling into
// a valley, not weather — it is near --mount, the same material the flip
// clock and the tooltip cards are made of.
//
// The landscape is a SEPARATE FILE, on purpose. assets/window-scene.svg is
// fetched once and inlined (rather than dropped in as an <img>) for one
// reason: the fog has to reach the individual ridges so the distant ones can
// disappear first. That is the whole contract with the art — every ridge
// carries class="ridge" and data-depth, and Andra's hand-drawn replacement is
// still a one-file swap as long as it does the same.

let scenePromise = null;
let sceneMarkup = null;

function loadScene(view) {
  if (sceneMarkup !== null) { view.sceneReady = true; return; }
  if (!scenePromise) {
    scenePromise = fetch(SCENE_URL)
      .then(r => (r.ok ? r.text() : ""))
      .then(text => {
        const m = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(text);
        sceneMarkup = m ? m[1] : "";
        return sceneMarkup;
      })
      .catch(() => { sceneMarkup = ""; return ""; });
  }
  // The gauge draws its fog either way; a missing landscape costs the view a
  // picture, never a render.
  scenePromise.then(() => { if (view.root.isConnected) view.repaintGauge && view.repaintGauge(); });
}

function renderGauge(view, s) {
  const load = loadScore(s.data.entries, s.today, s.weightFor);
  view.repaintGauge = () => drawGauge(view, load);
  drawGauge(view, load);
  view.gaugeCap.textContent = `Load · ${load}`;
  view.root.querySelector(".cal-panel-gauge")
    .setAttribute("aria-label", `Load: ${load} out of 100 across the next two weeks`);
}

function drawGauge(view, load) {
  const ceiling = readNumberToken(view.root, "--cal-fog-ceiling", 0.8);
  const fog = fogLayers(load, ceiling);

  view.scene.innerHTML = `${sceneMarkup || ""}
    <defs>
      <linearGradient id="cal-fog-bank" x1="0" y1="0" x2="0" y2="1">
        <stop class="cal-fog-stop-a" offset="0"/>
        <stop class="cal-fog-stop-b" offset="0.4"/>
        <stop class="cal-fog-stop-c" offset="1"/>
      </linearGradient>
    </defs>
    <rect class="cal-fog-bank" x="0" y="${fog.bankTop}" width="${SCENE_W}" height="${SCENE_H - fog.bankTop}"
          fill="url(#cal-fog-bank)" opacity="${fog.bank.toFixed(3)}"/>
    <rect class="cal-fog-veil" x="0" y="0" width="${SCENE_W}" height="${SCENE_H}" opacity="${fog.veil.toFixed(3)}"/>`;

  const ridges = [...view.scene.querySelectorAll(".ridge")];
  const maxDepth = ridges.reduce((m, el, i) => Math.max(m, +(el.dataset.depth ?? i) || 0), 0);
  ridges.forEach((el, i) => {
    const depth = +(el.dataset.depth ?? i) || 0;
    el.setAttribute("opacity", String(ridgeOpacity(load, depth, maxDepth)));
  });

  view.gaugeGrain.style.setProperty("--cal-fog-grain", fog.grain.toFixed(3));
}

// --cal-fog-ceiling is a plain number token, so it has to be read rather than
// referenced — SVG opacity on a <rect> can take a var(), but the fog's
// arithmetic (the veil is a fraction OF the bank) has to happen in JS.
function readNumberToken(el, name, fallback) {
  try {
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}

// ===================================================================
//  THE UNSCHEDULED TRAY  (§5, footprint per §3a)
// ===================================================================
// One line of chrome pinned at the bottom edge — not a shelf panel. Its
// contents are phase placeholders, not tasks waiting on a date, so it gets a
// strip rather than real estate. "Set date" opens the flip mechanism INLINE,
// and SET writes one op; the milestone then materialises on the strip, the
// dial and the radar in the same render pass, because they all read the same
// query.

function renderTray(view, s) {
  const groups = s.data.unscheduled;
  const count = s.data.unscheduledCount;
  view.trayHead.textContent = `Unscheduled · ${count}`;
  view.trayHead.setAttribute("aria-expanded", String(view.trayOpen));
  view.trayHead.disabled = count === 0;
  view.root.querySelector(".cal-tray").dataset.empty = String(count === 0);

  if (!view.trayOpen || count === 0) {
    closeFlip(view);
    view.trayBody.hidden = true;
    view.trayBody.innerHTML = "";
    return;
  }
  view.trayBody.hidden = false;

  // If a flip widget is open, the tray keeps its DOM rather than rebuilding —
  // otherwise an unrelated store write anywhere in Dash would yank the
  // mechanism out from under a half-set date.
  const signature = groups.map(g => `${g.projectId}:${g.items.map(i => i.mid).join(",")}`).join("|");
  if (view.flip && view.traySignature === signature) return;
  closeFlip(view);
  view.traySignature = signature;
  view.trayBody.innerHTML = "";

  for (const group of groups) {
    const project = s.store.get(group.projectId);
    const hue = project ? safeColor(itemColor(s.store, project)) : "var(--text-faint)";
    for (const item of group.items) {
      const row = document.createElement("div");
      row.className = "cal-tray-row";
      row.innerHTML =
        `<span class="cal-dot" style="background:${hue}" aria-hidden="true"></span>` +
        `<span class="cal-tray-label">${esc(item.label)}</span>` +
        `<span class="mk cal-tray-ctx">${esc(group.title || "")}</span>` +
        `<button type="button" class="cal-setdate mk" aria-expanded="false">Set date →</button>` +
        `<div class="cal-flip-slot"></div>`;

      const btn = row.querySelector(".cal-setdate");
      const slot = row.querySelector(".cal-flip-slot");
      btn.addEventListener("click", () => {
        if (view.flipFor === item.id) { closeFlip(view); btn.setAttribute("aria-expanded", "false"); return; }
        closeFlip(view);
        // FULL size here, and SET only — deliberately no autocommit. Putting a
        // date on an unscheduled phase is a decision with a consequence (the
        // phase leaves the tray and lands on the strip), so nothing should do
        // it on your behalf. In the editors, where the mechanism is replacing
        // a field that already autosaved, it is the other way round.
        view.flip = mountDateInput(slot, {
          value: null,
          size: "full",
          confirm: true,          // the one place SET is kept (see above)
          label: `Date for ${item.label}`,
          onCommit: (dateStr) => {
            closeFlip(view);
            // ONE ordinary set op, exactly as any other date edit in Dash.
            s.store.setMilestoneField(group.projectId, item.mid, "date", dateStr);
            s.ctx.rerender();
          },
          onCancel: () => { closeFlip(view); btn.setAttribute("aria-expanded", "false"); btn.focus(); },
        });
        view.flipFor = item.id;
        btn.setAttribute("aria-expanded", "true");
        view.flip.focus();
      });

      view.trayBody.appendChild(row);
    }
  }
}

function closeFlip(view) {
  if (view.flip) { view.flip.destroy(); view.flip = null; }
  view.flipFor = null;
  for (const b of view.root.querySelectorAll(".cal-setdate[aria-expanded='true']")) {
    b.setAttribute("aria-expanded", "false");
  }
}
