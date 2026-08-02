// home.js — the daily sheet, and as of August 2026 the TODAY PANEL as well.
// ===================================================================
// This is where Dash opens, and it answers the question you open Dash to ask:
// what's late, what's today, what's coming.
//
// LAYOUT (August 2026 — "Concept B", mockups/home-hierarchy-explorations.html)
// ---------------------------------------------------------------------------
// Home used to be one vertical scroll of numbered plates, and everything in it
// read as one continuous list. It's now a two-column dashboard grid:
//
//   left rail (fixed 340px)        right column (flexible)
//   ├─ Plate I — Accession         └─ PANEL: Due & coming up
//   │   the capture well
//   ├─ stat readouts (2 × 2)
//   └─ PANEL: From the archive
//       (the neglect register)
//
// Nothing about what those pieces DO changed in this pass. todayPanel() and
// neglectRegister() have the same internals they had before; they're just
// wrapped in panel chrome instead of being appended to a single column.
//
// THE PANEL CONTRACT
// ------------------
// Both columns are driven by the PANELS array below, the same way the app's
// views are driven by the view registry (proposal §4.1). A panel is a plain
// object:
//
//   { id, title, span, render(container, ctx) }   // + optional column/right/flush
//
// So adding a widget to Home later is "write one panel object and put it in
// the array" — not "go edit render()". The three shelved corner widgets (pet,
// weather, tide, train) would each be one of these if they ever come back.
//
// The box-drawing (renderPanel) moved to views/shared.js in August 2026, when
// Projects became the second view to want panels — which was the stated
// trigger. There is still deliberately NO js/panels.js registry module: the
// PANELS array stays local to each view, because what belongs on Home and
// what belongs on a project page have nothing to say to each other.
//
// Capture is NOT in the array. It's structurally pinned to the rail, the same
// way Settings and Read-aloud are pinned in the topbar rather than being
// registry entries — it must always be first and always be reachable.
//
// Home is a registered view like any other. It ignores the query result and
// reads the store directly, since it's a dashboard, not a grouped list.
// viewLocal preserves the capture box across re-renders so a background sync
// never eats what you're typing.

import { el, catalogNo, typeChip, statusChip, renderPanel } from "./shared.js";
import { toast } from "../ui/toast.js";
import { todayGroups } from "../entries.js";
import { formatDay, daysUntil } from "../milestones.js";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

// (The old isToday / isTodayOrPast helpers lived here. They compared full
// timestamps and have been replaced by the date-only comparisons in
// js/entries.js and js/milestones.js — one way of deciding "what day is this
// on" for the whole app, instead of two that can disagree.)

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ===================================================================
//  THE PANEL REGISTRY
// ===================================================================
// Fields:
//   id      stable string. Not used for anything yet; it's the handle a future
//           per-device "reorder / hide panels" setting would store, the same
//           way `dash.sidebar` and `dash.collapsed` already store layout state.
//   title   shown in the panel's header bar, in the mono label voice.
//   column  optional. "rail" puts the panel in the narrow left column under
//           capture and the stats; anything else (the default) puts it in the
//           wide right column. This is the only thing that decides which side
//           a panel lands on — moving one across is a one-word edit.
//   span    how many grid columns wide. 1 = a normal panel. 2 (or more) = full
//           width, whatever the current column count happens to be. Only
//           meaningful in the right column; the rail is always one panel wide.
//   right   optional. String, or a function of ctx, for the right-hand readout
//           in the header bar.
//   flush   optional. True when the panel's content brings its own edge-to-edge
//           surface (the neglect register's black mount) and shouldn't be
//           inset by the body's padding.
//   render(container, ctx)
//           same shape views already use. ctx is the view ctx plus `groups`,
//           the one archive scan this render already did — so a panel never
//           re-scans the store for something that's already been computed.
const PANELS = [
  {
    id: "today",
    title: "Due & coming up",
    span: 1,
    right: (ctx) => String(ctx.groups.total).padStart(2, "0"),
    render(container, ctx) {
      container.appendChild(todayPanel(ctx.store, ctx, ctx.groups));
    },
  },
  {
    id: "neglect",
    title: "From the archive",
    column: "rail",
    span: 1,
    flush: true,
    right: "Untouched longest",
    render(container, ctx) {
      container.appendChild(neglectRegister(ctx.store, ctx.onOpen));
    },
  },
];

export const homeView = {
  name: "home",
  label: "Home",
  ownFilter: true,   // no group-by; Home reads the store directly

  render(_result, ctx, container) {
    const store = ctx.store;
    container.innerHTML = "";

    const sheet = el("div", { class: "sheet-page" });

    // ---------------- masthead ----------------
    const now = new Date();
    const dateLine = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
    const sheetNo = `SHEET ${now.getFullYear()}·${String(dayOfYear(now)).padStart(3,"0")}`;

    // The whole dated picture, in ONE archive scan (js/entries.js does the
    // scanning; this asks for it once per render and everything below reads
    // the result). Never once per row, never once per section, never once
    // per panel.
    const groups = todayGroups(store);

    // The counts that used to run along under the masthead as a plain text
    // line now live in the rail as blocked readouts — same numbers, read as
    // instruments instead of as a sentence.
    sheet.appendChild(el("div", { class: "sheet-masthead" }, [
      el("div", { class: "sheet-masthead-top" }, [
        el("h1", { class: "sheet-h1", text: dateLine }),
        el("span", { class: "num", text: sheetNo }),
      ]),
    ]));

    const grid = el("div", { class: "dash-grid" });
    const panelCtx = Object.assign({}, ctx, { groups });

    // ---------------- left rail ----------------
    // Capture is deliberately first and deliberately NOT a panel: a thought you
    // don't write down is gone, so it can never be something you're allowed to
    // reorder away or hide. The stats sit under it. Rail panels come after.
    const rail = el("div", { class: "dash-rail" });
    rail.appendChild(plate("Accession", "New entry"));
    rail.appendChild(captureWell(ctx));
    rail.appendChild(statStrip(store, groups));
    for (const p of PANELS) {
      if (p.column === "rail") rail.appendChild(renderPanel(p, panelCtx));
    }
    grid.appendChild(rail);

    // ---------------- right column ----------------
    // The column lays its panels out itself (CSS `auto-fit`), so when a third
    // panel arrives it flows into a second column of panels on a wide screen
    // without this function changing at all.
    const col = el("div", { class: "panel-col" });
    for (const p of PANELS) {
      if (p.column !== "rail") col.appendChild(renderPanel(p, panelCtx));
    }
    grid.appendChild(col);

    sheet.appendChild(grid);
    container.appendChild(sheet);

    // restore capture text + focus if the user was typing before a re-render
    const box = container.querySelector(".capture textarea");
    if (box) {
      box.value = ctx.viewLocal.captureText || "";
      if (ctx.viewLocal.captureFocused) {
        try { box.focus({ preventScroll: true }); } catch { box.focus(); }
        const end = box.value.length;
        const [s, e] = ctx.viewLocal.captureSel || [end, end];
        try { box.setSelectionRange(Math.min(s, end), Math.min(e, end)); } catch {}
      }
    }
  },
};

// A section head in the rail. It used to take a plate NUMBER as well — Home was
// once a vertical run of numbered plates ("I. Accession", "II. …"). The panel
// layout replaced that in August 2026 and only plate I survived, so the app was
// showing a roman numeral one belonging to a sequence that no longer existed.
// The number is gone; the mono voice and the right-hand readout stay.
function plate(title, right) {
  return el("div", { class: "plate" }, [
    el("span", { class: "plate-title", text: title }),
    right ? el("span", { class: "plate-right num", text: right }) : null,
  ]);
}

// The four readouts in the rail. Every number here is derived at render time
// from the scan that already happened — nothing is stored, nothing is cached,
// nothing is written back.
function statStrip(store, groups) {
  const upcoming = groups.upcoming.reduce((n, g) => n + g.items.length, 0);

  const rows = [
    { n: store.all().length,   label: "In collection" },
    { n: groups.now.length,    label: "Due today" },
    { n: groups.overdueCount,  label: "Overdue", alert: groups.overdueCount > 0 },
    { n: upcoming,             label: "Next 14 days" },
  ];

  return el("div", { class: "stat-strip" }, rows.map(r =>
    el("div", { class: "stat" + (r.alert ? " is-alert" : "") }, [
      el("span", { class: "stat-num", text: String(r.n) }),
      el("span", { class: "lbl", text: r.label }),
    ])
  ));
}

function captureWell(ctx) {
  const store = ctx.store;

  const noteSel = (e) => {
    ctx.viewLocal.captureSel = [e.target.selectionStart, e.target.selectionEnd];
  };

  // ---- sticky focus -------------------------------------------------------
  // The rule, stated plainly: the capture box keeps the cursor until you click
  // somewhere else or on a button. Nothing else gets to take it.
  //
  // Why this is needed rather than just fixing one culprit: a lot of things can
  // blow focus off a field in a live app — a re-render tearing the node out, an
  // ambient widget grabbing it, focus falling to <body> for no reason a user
  // could ever predict. Chasing them one at a time is whack-a-mole, and every
  // miss looks to you like "it went dead again". So instead of asking "who took
  // it", the box asks "did SHE hand it over?" — and if not, takes it straight
  // back on the next frame.
  //
  // A real hand-over is a blur whose relatedTarget is something you can
  // actually interact with. Focus landing on nothing is never something a
  // person did on purpose.
  const HANDOVER = 'button, a[href], input, textarea, select, [contenteditable], [tabindex], [role="button"]';

  function releaseOrKeep(e) {
    const box = e.target;
    const next = e.relatedTarget;

    if (next && next.closest && next.closest(HANDOVER)) {
      ctx.viewLocal.captureFocused = false;   // you clicked a control. It's yours.
      return;
    }
    // Switching windows or tabs isn't a hand-over either, but grabbing focus
    // back from a page that isn't frontmost is rude and can fight the browser.
    // Stay armed so the box is still live when you come back.
    ctx.viewLocal.captureFocused = true;
    if (!document.hasFocus()) return;
    // If the node is gone, the re-render's own restore pass handles it.
    if (!document.contains(box)) return;
    // preventScroll: taking focus back must never yank the page around.
    requestAnimationFrame(() => {
      if (ctx.viewLocal.captureFocused && document.contains(box) && document.activeElement !== box) {
        try { box.focus({ preventScroll: true }); } catch { box.focus(); }
        const end = box.value.length;
        const [s, en] = ctx.viewLocal.captureSel || [end, end];
        try { box.setSelectionRange(Math.min(s, end), Math.min(en, end)); } catch {}
      }
    });
  }

  const textarea = el("textarea", {
    placeholder: "Say or type anything…",
    "aria-label": "Quick capture",
    oninput: (e) => { ctx.viewLocal.captureText = e.target.value; noteSel(e); },
    // remember where the cursor is, so a re-render doesn't fling it to the end
    onkeyup: noteSel,
    onclick: noteSel,
    onselect: noteSel,
    onfocus: () => { ctx.viewLocal.captureFocused = true; },
    onblur: (e) => releaseOrKeep(e),
    onkeydown: (e) => {
      // ⌘/Ctrl + Enter files it, so capture never needs the mouse
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); fileIt(); }
    },
  });

  function fileIt() {
    const text = (ctx.viewLocal.captureText || "").trim();
    if (!text) { textarea.focus(); return; }
    // first line becomes the title; the rest (if any) becomes the body
    const nl = text.indexOf("\n");
    const title = (nl === -1 ? text : text.slice(0, nl)).trim();
    const body = nl === -1 ? "" : text.slice(nl + 1).trim();
    store.createItem({ title, body });          // defaults: Quick idea · Active
    ctx.viewLocal.captureText = "";
    ctx.viewLocal.captureFocused = true;         // keep capturing after re-render
    // store change triggers a re-render; the box comes back empty and focused
  }

  const fileBtn = el("button", { class: "btn btn-primary", text: "File it", onclick: fileIt });
  const recordBtn = el("button", { class: "btn", text: "● Record",
    onclick: () => toast("Voice capture arrives in a later phase — for now, jot it or sketch it.", "info") });
  const sketchBtn = el("button", { class: "btn", text: "✎ Sketch", onclick: () => {
    const id = store.createItem({ type: store.typeDef("sketch") ? "sketch" : undefined });
    ctx.onOpen(id);
  }});
  const editorBtn = el("button", { class: "btn", text: "Full editor", onclick: () => ctx.onNew() });

  return el("div", { class: "capture" }, [
    textarea,
    el("div", { class: "capture-row" }, [
      fileBtn, recordBtn, sketchBtn, editorBtn,
      el("span", { class: "lbl lbl-faint capture-note", text: "Files as Quick idea · Active" }),
    ]),
  ]);
}

// ===================================================================
//  THE TODAY PANEL  (addendum §5.2)
// ===================================================================
// Three sections in order: Overdue, Today, then the next fourteen days
// grouped by day. Milestones and ordinary entries interleave — sorted by
// date, then by name — because on the day itself you don't care which kind
// of thing it is, only that it's due.
//
// URGENCY TEMPERATURE (August 2026)
// ---------------------------------
// The three sections are three visual registers, loud to quiet, so the panel
// reads as bands rather than one list:
//
//   Overdue   solid ember block, bled to the panel's edges, cream ink.
//   Today     a bordered well, one step darker than the panel ground.
//   Upcoming  plain. No box, no fill.
//
// Coding by urgency rather than by type is a deliberate choice: ember already
// MEANS "past its date" everywhere else in Dash (§10 — the accent is an
// indicator, never decoration), so this is turning up the volume on a signal
// that already exists, not inventing a second colour language. It also means
// a day with nothing overdue has no ember on it at all, which is the point.
function todayPanel(store, ctx, groups) {
  const wrap = el("div", { class: "today" });

  if (groups.total === 0) {
    // A real state, not a gap. Named plainly so an empty fortnight reads as
    // "you're clear" rather than "something failed to load".
    wrap.appendChild(el("div", { class: "sheet-empty" }, [
      el("p", { text: "Nothing due in the next two weeks." }),
      el("p", { class: "hint", text: "Dates you put on entries, and on a project's milestones, gather here." }),
    ]));
    return wrap;
  }

  if (groups.overdue.length) {
    const band = el("div", { class: "today-band today-band-overdue" });
    band.appendChild(sectionHead("Overdue", groups.overdue.length, true));
    for (const e of groups.overdue) band.appendChild(entryRow(store, ctx, e, groups.today));
    wrap.appendChild(band);
  }

  if (groups.now.length) {
    const band = el("div", { class: "today-band today-band-today" });
    band.appendChild(sectionHead("Today", groups.now.length, false));
    for (const e of groups.now) band.appendChild(entryRow(store, ctx, e, groups.today));
    wrap.appendChild(band);
  }

  // Upcoming is deliberately unbanded — it's the quiet register.
  if (groups.upcoming.length) {
    wrap.appendChild(sectionHead("Next 14 days", groups.upcoming.reduce((n, g) => n + g.items.length, 0), false));
    for (const { day, items } of groups.upcoming) {
      wrap.appendChild(el("div", { class: "today-day" }, [
        el("span", { class: "num", text: formatDay(day) }),
        el("span", { class: "lbl lbl-faint", text: relativeDay(day, groups.today) }),
      ]));
      for (const e of items) wrap.appendChild(entryRow(store, ctx, e, groups.today));
    }
  }

  return wrap;
}

function sectionHead(label, count, ember) {
  return el("div", { class: "today-head" + (ember ? " is-overdue" : "") }, [
    el("span", { text: label }),
    el("span", { class: "group-count", text: String(count) }),
  ]);
}

function relativeDay(day, today) {
  const n = daysUntil(day, today);
  if (n === 1) return "tomorrow";
  if (n != null && n > 1) return `in ${n} days`;
  return "";
}

// One line per dated thing. Two shapes, because they can do different things:
//
//   milestone — project title · milestone name · date, with a DONE toggle
//               (ticking it here removes the row and advances that project's
//               stage chip), and tapping opens the project.
//   entry     — type mark, title, date; tapping opens it. No "done" action is
//               invented for an ordinary entry: what finished means depends on
//               your own statuses, so the row opens the editor rather than
//               guessing on your behalf.
//
// A REMINDER row is a nudge rather than the thing itself, so it says so and
// offers "dismiss", which clears that reminder and nothing else.
function entryRow(store, ctx, e, today) {
  const isRemind = e.kind === "remind";
  const item = store.get(e.itemId);

  const meta = el("div", { class: "item-meta" }, [
    e.overdue ? el("span", { class: "mk mk-ember", text: "Overdue" }) : null,
    isRemind ? el("span", { class: "mk", text: "Reminder" }) : null,
    e.source === "milestone"
      ? el("span", { class: "mk", text: "Milestone" })
      : (item ? typeChip(store, item) : null),
    item && e.source !== "milestone" ? statusChip(store, item) : null,
    el("span", { class: "num", text: formatDay(e.start) }),
    isRemind && e.dueOn
      ? el("span", { class: "num", text: `due ${formatDay(e.dueOn)}` })
      : null,
  ]);

  const title = e.context ? `${e.context} · ${e.label}` : e.label;

  const main = el("div", { class: "item-main" }, [
    meta,
    el("h3", { class: "item-title", text: title }),
  ]);

  // --- the row's own actions, kept out of the tap-to-open target ---
  const actions = el("div", { class: "today-actions" });

  if (e.source === "milestone" && !isRemind) {
    actions.appendChild(el("button", {
      class: "ms-tick", type: "button",
      "aria-pressed": "false",
      "aria-label": `Mark done: ${e.label}`,
      onclick: (ev) => {
        ev.stopPropagation();
        store.setMilestoneField(e.itemId, e.mid, "done", new Date().toISOString());
      },
    }));
  }

  if (isRemind) {
    actions.appendChild(el("button", {
      class: "btn", type: "button", text: "Dismiss",
      "aria-label": `Dismiss the reminder for ${e.label}`,
      onclick: (ev) => {
        ev.stopPropagation();
        if (e.source === "milestone") store.setMilestoneField(e.itemId, e.mid, "remind", null);
        else store.setField(e.itemId, "remind", null);
      },
    }));
  }

  const open = () => {
    // A milestone row opens its PROJECT — that's where the milestone lives
    // and can be edited. An ordinary row opens the entry itself.
    ctx.onOpen(e.itemId);
  };

  const row = el("div", {
    class: "item-row today-row" + (e.overdue ? " flag" : ""),
    role: "button", tabindex: "0",
    onclick: open,
    onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); } },
  }, [
    el("span", { class: "item-no", text: item ? `№ ${catalogNo(store, item)}` : "№ ----" }),
    main,
    actions.childNodes.length ? actions : null,
  ]);

  return row;
}

// What the read-aloud button says on Home. Spoken top to bottom, in the same
// order it's drawn, because the point is to be able to hear where you stand
// without reading a screen (proposal §10, and the eye-strain constraint).
export function speakToday(store) {
  const g = todayGroups(store);
  if (g.total === 0) return "Nothing due in the next two weeks.";
  const say = (e) => (e.context ? `${e.context}, ${e.label}` : e.label);
  const parts = [];
  if (g.overdue.length) {
    parts.push(`${g.overdue.length} overdue: ${g.overdue.map(say).join("; ")}.`);
  }
  if (g.now.length) {
    parts.push(`Today: ${g.now.map(say).join("; ")}.`);
  }
  const later = g.upcoming.flatMap(d => d.items.map(e => `${say(e)}, ${formatDay(d.day)}`));
  if (later.length) {
    parts.push(`Next fourteen days: ${later.join("; ")}.`);
  }
  return parts.join(" ");
}

// the neglect register — the black mount panel. Longest-untouched items,
// read-only (tap opens). Age color is a display hint here; the configurable
// per-type Heat view arrives in Update 3.
//
// It no longer draws its own "Neglect register / Days since touched" header
// bar: the panel it now sits in carries the title and the right-hand readout,
// and two stacked headers on top of each other was just noise.
function neglectRegister(store, onOpen) {
  const items = store.all()
    .map(it => ({ it, age: daysSince(it.dates?.touched) }))
    .filter(x => x.age != null)
    .sort((a, b) => b.age - a.age)
    .slice(0, 6);

  const mount = el("div", { class: "mount" });

  if (items.length === 0) {
    mount.appendChild(el("p", { class: "mount-empty", text: "Nothing filed yet." }));
    return mount;
  }

  for (const { it, age } of items) {
    const band = age >= 60 ? "stale" : age >= 30 ? "aging" : "";
    mount.appendChild(el("div", {
      class: "mount-row", role: "button", tabindex: "0",
      onclick: () => onOpen(it.id),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(it.id); } },
    }, [
      el("span", { class: "mount-no", text: `№ ${catalogNo(store, it)}` }),
      el("span", { class: "mount-title", text: it.title || "Untitled" }),
      el("span", { class: `mount-age ${band}`, text: `${age}d` }),
    ]));
  }

  // the dot-cluster motif under the register — a nod to the monoprint
  const strip = el("div", { class: "heat-strip", "aria-hidden": "true" });
  const maxAge = items[0].age || 1;
  for (let i = 0; i < 18; i++) {
    const a = items[i % items.length].age;
    const cls = a >= 60 ? "cold" : a >= 30 ? "warm" : "";
    strip.appendChild(el("span", { class: `heat-dot ${cls}` }));
  }
  mount.appendChild(strip);
  return mount;
}
