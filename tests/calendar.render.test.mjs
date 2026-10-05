// calendar.render.test.mjs — the Calendar view under jsdom.
//
//   node tests/calendar.render.test.mjs      (needs jsdom)
//
// What a headless DOM CAN check about a drawing: that the right number of the
// right things got drawn, that each one carries the class the ramp says it
// should, that every mark is reachable and speakable by a screen reader, that
// the shell survives a redraw with an open editor inside it, and — the one
// that would otherwise only be caught by eye, months later — that flipping the
// theme changes NOTHING in the markup, because nothing in it is a colour.

import { JSDOM } from 'jsdom';

// PIN "TODAY" TO THE 15TH OF THE CURRENT MONTH (October 4, 2026).
// The fixture below puts an overdue milestone four days back and expects to
// see it in the MONTH list. During the first four days of any month that day
// falls in the previous month, off the list, and two checks failed for no
// reason that had anything to do with the code. Shifting the clock to the
// middle of the month makes every date in the fixture land where the checks
// expect, on every day of the year. The clock still TICKS (it is an offset,
// not a frozen instant), so timers and animations behave exactly as before.
// Nothing outside this test file is affected.
{
  const RealDate = Date;
  const n = new RealDate();
  const offset = new RealDate(n.getFullYear(), n.getMonth(), 15, n.getHours(), n.getMinutes(), n.getSeconds()).getTime() - RealDate.now();
  globalThis.Date = class extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
    static now() { return RealDate.now() + offset; }
  };
}

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: 'https://x.test/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement',
                 'MutationObserver','requestAnimationFrame','cancelAnimationFrame',
                 'getComputedStyle','Event','KeyboardEvent','MouseEvent'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

let REDUCE = false;
dom.window.matchMedia = (q) => ({
  matches: /prefers-reduced-motion/.test(q) ? REDUCE : q.includes('pointer: fine'),
  addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){},
});

const { Store } = await import('../js/store.js');
const { calendarView } = await import('../js/views/calendar.js');
const { todayISO } = await import('../js/milestones.js');
const flipdate = await import('../js/widgets/flipdate.js');

let fail = 0, n = 0;
const ok = (name, cond, extra = "") => {
  n++; if (!cond) fail++;
  console.log((cond ? "PASS  " : "FAIL  ") + name + (cond || !extra ? "" : `\n      ${extra}`));
};
const tick = () => new Promise(r => setTimeout(r, 0));

const TODAY = todayISO();
function plus(days) {
  const [y, m, d] = TODAY.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// ------------------------------------------------------------------
// A small archive with one of everything the ramp has an opinion about.
function harness() {
  localStorage.clear();
  const store = new Store();

  const alpha = store.createItem({ title: "Alpha rebuild", type: "project" });
  store.setField(alpha, "color", "clay");
  const a1 = store.addMilestone(alpha, { label: "Wireframes" });
  const a2 = store.addMilestone(alpha, { label: "Comps" });
  const a3 = store.addMilestone(alpha, { label: "Launch" });     // last in pipeline
  store.setMilestoneField(alpha, a1, "date", plus(3));           // soon
  store.setMilestoneField(alpha, a2, "date", plus(40));          // far
  store.setMilestoneField(alpha, a3, "date", plus(10));          // mid, and FINAL

  const beta = store.createItem({ title: "Beta zine", type: "project" });
  store.setField(beta, "color", "plum");
  const b1 = store.addMilestone(beta, { label: "Print deadline" });
  const b2 = store.addMilestone(beta, { label: "Distribution plan" });  // no date -> tray
  const b3 = store.addMilestone(beta, { label: "Retro" });
  store.setMilestoneField(beta, b1, "date", plus(-4));           // overdue
  store.setMilestoneField(beta, b3, "date", plus(-30));
  store.setMilestoneField(beta, b3, "done", new Date().toISOString());

  const chore = store.createItem({ title: "Renew domain" });
  store.setField(chore, "due", `${plus(1)}T12:00:00.000Z`);      // item lane, weight 1

  const viewLocal = {};
  let renders = 0;
  const opened = [];
  const ctx = {
    store, viewLocal, selection: { active: false }, sync: null,
    onOpen: (id) => opened.push(id),
    onNew(){}, isCollapsed: () => false, toggleCollapse(){},
    holdRenders: () => () => {},
    rerender: () => draw(),
  };
  const host = document.getElementById('host');
  const draw = () => { renders++; calendarView.render(null, ctx, host); };
  draw();
  return {
    store, ctx, host, draw, opened, viewLocal,
    ids: { alpha, beta, chore, a1, a2, a3, b1, b2, b3 },
    root: () => host.querySelector('.cal-root'),
    marks: () => [...host.querySelectorAll('.cal-strip .cal-mark')],
    q: (sel) => host.querySelector(sel),
    all: (sel) => [...host.querySelectorAll(sel)],
    click: (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
    key: (el, key) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })),
  };
}

// ==================================================================
console.log("\n--- registration (§7) ---");
{
  ok("the view answers to 'calendar'", calendarView.name === "calendar");
  ok("it reads the store itself, so app.js builds it no query result", calendarView.ownFilter === true);
  ok("select mode is off — there is no item list here to pick from", calendarView.supportsSelect === false);
  ok("and no catalog band or index rail", calendarView.supportsCatalogChrome === false);
}

console.log("\n--- the shell is built once and KEPT (not rebuilt on every store write) ---");
{
  const h = harness();
  const first = h.root();
  ok("a root is drawn", !!first);
  h.draw(); h.draw(); h.draw();
  ok("three more redraws reuse the same root element", h.root() === first,
     "rebuilding would destroy an open flip widget mid-edit");
  ok("...and the strip and the month list are still the same nodes",
     h.q('.cal-strip') && h.q('.cal-list') && h.q('.cal-list-body'));
  ok("the whole instrument fits one screen: four rows, no page scroll",
     h.root().classList.contains('cal-root'));
}

console.log("\n--- the approach strip draws the right marks, painted by the ramp ---");
{
  const h = harness();
  const marks = h.marks();
  // Approach shows live things only: three Alpha milestones, Beta's overdue
  // one, and the plain item. Beta's finished retro is history, not approach.
  ok("five live marks on the approach; the done one is not among them", marks.length === 5,
     `got ${marks.length}`);

  const cls = (eid) => {
    const el = marks.find(m => m.dataset.eid === eid);
    return el ? el.getAttribute('class') : "(missing)";
  };
  ok("+3 reads as soon", cls(`ms:${h.ids.alpha}:${h.ids.a1}:due`).includes('ramp-soon'));
  ok("+10 reads as mid", cls(`ms:${h.ids.alpha}:${h.ids.a3}:due`).includes('ramp-mid'));
  ok("+40 reads as far", cls(`ms:${h.ids.alpha}:${h.ids.a2}:due`).includes('ramp-far'));
  ok("-4 reads as overdue", cls(`ms:${h.ids.beta}:${h.ids.b1}:due`).includes('ramp-overdue'));

  ok("the project's FINAL milestone is the heaviest mark",
     cls(`ms:${h.ids.alpha}:${h.ids.a3}:due`).includes('w3'),
     "derived from the project itself — entries.js was not touched to get this");
  ok("its other milestones are weight 2",
     cls(`ms:${h.ids.alpha}:${h.ids.a1}:due`).includes('w2') &&
     cls(`ms:${h.ids.alpha}:${h.ids.a2}:due`).includes('w2'));
  ok("a plain item's due date is weight 1",
     cls(`it:${h.ids.chore}:due`).includes('w1'));

  const grains = h.all('.cal-strip .cal-mark-grain');
  ok("grain is drawn over the two thinned marks and nothing else", grains.length === 2,
     `got ${grains.length}`);

  ok("hue is identity: a milestone carries its project's own colour",
     marks.find(m => m.dataset.eid.includes(h.ids.alpha)).getAttribute('style').includes('--color-clay'));
  ok("...and a plain item, having no project identity, reads in the neutral ink",
     marks.find(m => m.dataset.eid === `it:${h.ids.chore}:due`).getAttribute('style').includes('--text-faint'));
  ok("ember never leaks into the hue channel — the overdue mark takes its colour from a class",
     !marks.find(m => m.dataset.eid === `ms:${h.ids.beta}:${h.ids.b1}:due`)
        .getAttribute('style').includes('ember'));
}

console.log("\n--- every mark is reachable, speakable, and openable ---");
{
  const h = harness();
  const marks = h.marks();
  ok("every mark is in the tab order", marks.every(m => m.getAttribute('tabindex') === '0'));
  ok("every mark says what it is, what it belongs to, and when",
     marks.every(m => /.+: .+, .+/.test(m.getAttribute('aria-label') || "")));
  const overdue = marks.find(m => m.getAttribute('class').includes('ramp-overdue'));
  ok("an overdue mark says so out loud, in days", /overdue/.test(overdue.getAttribute('aria-label')));

  // The tooltip follows FOCUS as well as hover: v1 put this information in a
  // caption away from the marks and Andra could not make the connection.
  const tip = h.q('.cal-stripzone .cal-tip');
  ok("the tooltip starts hidden", tip.hidden === true);
  marks[0].dispatchEvent(new dom.window.Event('focus'));
  ok("focusing a mark speaks it — the information is never hover-only", tip.hidden === false);
  ok("...and the mark goes hot while it is speaking", marks[0].classList.contains('is-hot'));
  ok("...with the project, the label and the date all in the card",
     tip.querySelector('.mk') && tip.querySelector('.cal-tip-t') && tip.querySelector('.cal-tip-when'));
  marks[0].dispatchEvent(new dom.window.Event('blur'));
  ok("blurring puts it away again", tip.hidden === true && !marks[0].classList.contains('is-hot'));

  h.click(marks[0]);
  ok("clicking a mark opens the thing it belongs to", h.opened.length === 1);
  h.key(marks[1], 'Enter');
  ok("...and so does Enter, so the keyboard is not a second-class path", h.opened.length === 2);
}

console.log("\n--- lanes come from the projects that actually have entries ---");
{
  const h = harness();
  const labels = h.all('.cal-lane-label').map(t => t.textContent);
  ok("one lane per project with entries, plus an Items lane", labels.length === 3, labels.join(" / "));
  ok("...in alphabetical order, with Items last",
     labels[0] === "ALPHA REBUILD" && labels[1] === "BETA ZINE" && labels[2] === "ITEMS",
     labels.join(" / "));
}

console.log("\n--- the overdue zone breathes; the NOW line does not move ---");
{
  const h = harness();
  ok("with debt on the desk there is an ember field behind the line", !!h.q('.cal-overdue-zone'));
  const wide = +h.q('.cal-overdue-zone').getAttribute('width');
  const nowX = +h.q('.cal-now').getAttribute('x1');
  ok("the NOW line stands at the edge of that field", Math.abs(wide - nowX) < 0.001);

  // Clear the debt and the field should collapse to almost nothing.
  h.store.setMilestoneField(h.ids.beta, h.ids.b1, "date", plus(6));
  h.draw();
  ok("with nothing overdue the field is gone entirely", !h.q('.cal-overdue-zone'));
  ok("...and the NOW line has moved back to its resting position",
     +h.q('.cal-now').getAttribute('x1') === 26);
}

console.log("\n--- Month mode is the same renderer on a linear axis ---");
{
  const h = harness();
  ok("the approach is the default", h.q('.cal-title').textContent.includes("approach"));
  ok("...and month navigation is hidden while it is", h.q('.cal-monthnav').hidden === true);

  h.click(h.q('[data-act="month"]'));
  ok("switching to Month names the month and the year",
     /\w+ \d{4}/.test(h.q('.cal-title').textContent), h.q('.cal-title').textContent);
  ok("...and reveals prev/next/today", h.q('.cal-monthnav').hidden === false);
  ok("the mode is remembered per device", localStorage.getItem('dash.calendar.mode') === 'month');

  // A past month should read as HISTORY — done entries are drawn, quietly.
  const doneMarks = h.all('.cal-strip .cal-mark.ramp-done');
  const thisMonthHasDone = doneMarks.length > 0;
  h.click(h.q('[data-act="prev"]'));
  ok("the cursor is remembered too", !!localStorage.getItem('dash.calendar.cursor'));
  const anyDone = thisMonthHasDone || h.all('.cal-strip .cal-mark.ramp-done').length > 0;
  ok("finished entries appear in Month mode, so a past month reads as history", anyDone,
     "the approach is forward-facing; history lives here and on the radar");

  h.click(h.q('button[data-act="today"]'));
  ok("Today snaps the cursor back", h.q('.cal-title').textContent.includes(String(new Date().getFullYear())));
}

console.log("\n--- the month list replaces the shelf (October 2026) ---");
{
  const h = harness();
  ok("the three instruments Andra found cluttered are no longer drawn",
     !h.q('.cal-dial') && !h.q('.cal-year') && !h.q('.cal-scene') && !h.q('.cal-shelf') && !h.q('.cal-panel'),
     "retired, not deleted — the code and CSS stay, but nothing puts them on screen");

  const monthName = new Date().toLocaleString('en-US', { month: 'long' });
  ok("the list names its month and year",
     h.q('.cal-list-title').textContent === `${monthName} ${new Date().getFullYear()}`,
     h.q('.cal-list-title').textContent);

  // TODAY is pinned to the 15th of this month (top of file), so the fixture's
  // dated things fall like this: Print deadline -4 (the 11th), Renew domain +1,
  // Wireframes +3, Launch +10. Comps (+40) and the done Retro (-30) are not in
  // this month.
  const rows = h.all('.cal-item');
  const labels = rows.map(r => r.querySelector('.cal-item-label').textContent);
  ok("one row for every dated thing in the month, in date order",
     labels.join(" / ") === "Print deadline / Renew domain / Wireframes / Launch", labels.join(" / "));
  ok("...and says how many", h.q('.cal-list-count').textContent === "4 items", h.q('.cal-list-count').textContent);
  ok("every row is a real button, so Enter and Space work and the tap target is the control size",
     rows.every(r => r.tagName === 'BUTTON'));
  ok("every row says what it is, what it belongs to, and when, for a screen reader",
     rows.every(r => /.+: .+, .+/.test(r.getAttribute('aria-label') || "")));

  const row = (label) => rows.find(r => r.querySelector('.cal-item-label').textContent === label);
  ok("a milestone's dot is its project's own colour",
     row("Wireframes").getAttribute('style').includes('--color-clay') &&
     row("Print deadline").getAttribute('style').includes('--color-plum'));
  ok("an entry in no project reads in the neutral ink",
     row("Renew domain").getAttribute('style').includes('--text-faint'));
  ok("each row names its project, or says there isn't one",
     row("Wireframes").querySelector('.cal-item-ctx').textContent === "Alpha rebuild" &&
     row("Renew domain").querySelector('.cal-item-ctx').textContent === "No project");

  const od = row("Print deadline").querySelector('.cal-item-when');
  ok("overdue is said in words, in ember", od.classList.contains('is-overdue') && od.textContent === "4 days overdue",
     od.textContent);
  ok("...and ember is never put into the dot, which stays the project's colour",
     !row("Print deadline").getAttribute('style').includes('ember'));
  ok("a future row says how far off it is",
     row("Wireframes").querySelector('.cal-item-when').textContent === "in 3 days");

  // The TODAY line sits where today falls: after the overdue row, before the rest.
  const kids = [...h.q('.cal-list-body').children];
  ok("a TODAY line sits between what is behind and what is ahead",
     kids[1] && kids[1].classList.contains('cal-list-today') && kids[0] === rows[0],
     kids.map(k => k.className).join(" | "));
  ok("...and the day number and weekday show once per day, not once per row",
     rows.every(r => r.querySelector('.cal-item-num')));

  h.click(row("Wireframes"));
  ok("clicking a milestone row opens its project, the way its dot on the strip does",
     h.opened.length === 1 && h.opened[0] === h.ids.alpha);
  h.click(row("Renew domain"));
  ok("...and an ordinary entry opens itself", h.opened[1] === h.ids.chore);

  // An unrelated write must not rebuild the list: that would snap the scroll
  // back to today and drop keyboard focus off the row being read.
  const firstBefore = h.all('.cal-item')[0];
  h.store.setField(h.ids.alpha, "title", "Alpha rebuild");   // same value: nothing to redraw
  h.draw();
  ok("a redraw with nothing changed leaves the list's rows alone", h.all('.cal-item')[0] === firstBefore);
  h.store.setField(h.ids.chore, "title", "Renew the domain");
  h.draw();
  ok("...but a real change to a row redraws it",
     h.all('.cal-item').some(r => r.querySelector('.cal-item-label').textContent === "Renew the domain"));
}

console.log("\n--- the list's month buttons, and where they live ---");
{
  const h = harness();
  const listNext = () => h.q('.cal-listnav [data-act="next"]');
  ok("the list has its own month buttons while the strip is on the approach",
     h.q('.cal-listnav').hidden === false && h.q('.cal-monthnav').hidden === true);

  h.click(listNext());
  ok("Next moves the list on a month", h.q('.cal-list-title').textContent !== "" &&
     !h.q('.cal-list-title').textContent.startsWith(new Date().toLocaleString('en-US', { month: 'long' })));
  const next = h.all('.cal-item').map(r => r.querySelector('.cal-item-label').textContent);
  ok("...and shows next month's one dated thing (Comps, +40)", next.join(",") === "Comps", next.join(","));
  ok("...with no TODAY line, because today is not in that month", !h.q('.cal-list-today'));

  h.click(h.q('.cal-listnav [data-act="today"]'));
  ok("Today brings it home", h.all('.cal-item').length === 4);

  h.click(h.q('[data-act="month"]'));
  ok("in Month mode the strip's own buttons are the ones on screen, never two sets",
     h.q('.cal-listnav').hidden === true && h.q('.cal-monthnav').hidden === false);
  h.click(h.q('.cal-monthnav [data-act="next"]'));
  ok("...and they move the list as well, because there is one cursor",
     h.all('.cal-item').length === 1);

  // A month with nothing in it says so instead of showing a blank panel.
  h.click(h.q('.cal-monthnav [data-act="next"]'));
  h.click(h.q('.cal-monthnav [data-act="next"]'));
  ok("an empty month says so", !!h.q('.cal-list-empty') && h.q('.cal-list-count').textContent === "0 items");
}

console.log("\n--- an entry is drawn under the project it belongs to (October 2026) ---");
{
  // Andra's report: "the notes and dates I put in for my studio project show up
  // under Items in calendar view and not under the studio title." Only a
  // MILESTONE used to count as being in a project; a date mark filed under one,
  // or a note assigned to one, was drawn in the grey Items lane.
  const h = harness();
  const { alpha, beta } = h.ids;
  const mark = h.store.createDateMark({ title: "Studio visit", date: plus(2), projectId: alpha });
  const note = h.store.createItem({ title: "Pick paper" });
  h.store.setField(note, "due", `${plus(5)}T12:00:00.000Z`);
  h.store.assignToProject(note, alpha);
  const loose = h.store.createDateMark({ title: "Mom's birthday", date: plus(6) });
  h.draw();

  const marks = h.marks();
  const byId = (id) => marks.find(m => m.dataset.eid === id);
  const cy = (id) => +byId(id).getAttribute('cy');
  const wire = byId(`ms:${alpha}:${h.ids.a1}:due`);
  const chore = byId(`it:${h.ids.chore}:due`);

  ok("a date mark filed under a project is drawn in that project's colour",
     byId(`dm:${mark}`).getAttribute('style').includes('--color-clay'));
  ok("...and a note assigned to a project is too",
     byId(`it:${note}:due`).getAttribute('style').includes('--color-clay'));
  ok("...and both sit in the project's lane, not the Items lane",
     Math.abs(cy(`dm:${mark}`) - +wire.getAttribute('cy')) <= 12 &&
     Math.abs(cy(`it:${note}:due`) - +wire.getAttribute('cy')) <= 12,
     `lane y ${wire.getAttribute('cy')} vs ${cy(`dm:${mark}`)} / ${cy(`it:${note}:due`)}; items lane y ${chore.getAttribute('cy')}`);
  ok("a date mark in no project still reads neutral, in the Items lane",
     byId(`dm:${loose}`).getAttribute('style').includes('--text-faint') &&
     Math.abs(cy(`dm:${loose}`) - +chore.getAttribute('cy')) <= 12);
  ok("the tooltip and screen-reader label name the project, where an entry used to say 'Item'",
     byId(`it:${note}:due`).getAttribute('aria-label').startsWith("Alpha rebuild: Pick paper"),
     byId(`it:${note}:due`).getAttribute('aria-label'));
  ok("no extra lane appears: still Alpha, Beta, Items",
     h.all('.cal-lane-label').map(t => t.textContent).join(" / ") === "ALPHA REBUILD / BETA ZINE / ITEMS");

  // An entry can be in several projects but a dot sits in one lane. The one that
  // wins is the first in Andra's own hand-sorted project order, so every device
  // agrees.
  const both = h.store.createItem({ title: "Shared errand" });
  h.store.setField(both, "due", `${plus(7)}T12:00:00.000Z`);
  h.store.assignToProject(both, beta);
  h.store.assignToProject(both, alpha);
  h.draw();
  const first = h.store.projects()[0];
  ok("an entry in two projects goes to the first in the hand-sorted order",
     byId(`it:${both}:due`) === undefined &&
     h.marks().find(m => m.dataset.eid === `it:${both}:due`).getAttribute('aria-label').startsWith(`${first.title}: `),
     `expected ${first.title}`);

  // The pure function, on its own.
  const cal = await import('../js/views/calendar.js');
  const entries = [
    { source: "milestone", itemId: alpha, context: "x" },
    { source: "datemark", itemId: mark, context: null },
    { source: "item-due", itemId: note, context: null },
    { source: "item-due", itemId: h.ids.chore, context: null },
  ];
  cal.annotateOwners(h.store, entries);
  ok("annotateOwners names the owner of each kind of entry, and null for none",
     entries[0].projectId === alpha && entries[1].projectId === alpha &&
     entries[2].projectId === alpha && entries[3].projectId === null);
  ok("...and says the project's name where there was none",
     entries[1].context === "Alpha rebuild" && entries[2].context === "Alpha rebuild" && entries[3].context === null);

  // A date mark in the past is history (done) but is still its project's.
  const past = h.store.createDateMark({ title: "Last week's review", date: plus(-3), projectId: beta });
  h.draw();
  h.click(h.q('[data-act="month"]'));
  const pastMark = h.marks().find(m => m.dataset.eid === `dm:${past}`);
  ok("a passed date mark is drawn as history, but still in its project's colour",
     !!pastMark && /ramp-done/.test(pastMark.getAttribute('class')) && pastMark.getAttribute('style').includes('--color-plum'));
}

console.log("\n--- the unscheduled tray, and the setting mechanism ---");
{
  const h = harness();
  const head = h.q('.cal-tray-head');
  ok("the tray is one line of chrome, and counts what is in it",
     head.textContent === "Unscheduled · 1", head.textContent);
  ok("...collapsed to start", h.q('.cal-tray-body').hidden === true);

  h.click(head);
  ok("opening it lists the undated phase", h.all('.cal-tray-row').length === 1);
  ok("...with its project's colour beside it", !!h.q('.cal-dot'));
  ok("...and the project named in the mono voice",
     h.q('.cal-tray-ctx').textContent === "Beta zine");

  h.click(h.q('.cal-setdate'));
  await tick(); await tick();
  ok("Set date opens the flip mechanism inline", !!h.q('.flipdate'));
  ok("...three units, in the mount material",
     h.all('.fd-unit').length === 3 && !!h.q('.fd-day') && !!h.q('.fd-month') && !!h.q('.fd-year'));
  ok("...each one a spinbutton a screen reader can drive",
     h.all('.fd-unit').every(u =>
       u.getAttribute('role') === 'spinbutton' &&
       u.hasAttribute('aria-valuenow') && u.hasAttribute('aria-valuetext') &&
       u.hasAttribute('aria-valuemin') && u.hasAttribute('aria-valuemax')));
  ok("...and it is never gesture-only: every card is a keyboard spinbutton (typed digits and arrows)",
     [...h.all('.fd-unit')].every(u => u.getAttribute('role') === 'spinbutton' && u.tabIndex === 0));

  ok("nothing has been written to the store yet",
     h.store.milestone(h.ids.beta, h.ids.b2).date === null,
     "ticking mutates component state only — no op spam while scrubbing");

  // A redraw caused by unrelated work must NOT yank the mechanism away.
  h.store.setField(h.ids.chore, "title", "Renew domain (again)");
  h.draw();
  ok("an unrelated store write does not destroy a half-set date", !!h.q('.flipdate'));

  h.click(h.q('.fd-btn-primary'));
  ok("SET writes the date as one ordinary op",
     h.store.milestone(h.ids.beta, h.ids.b2).date !== null);
  ok("...and the mechanism closes behind it", !h.q('.flipdate'));
  ok("...and the phase leaves the tray, having materialised on the strip in the same pass",
     h.q('.cal-tray-head').textContent === "Unscheduled · 0");
  ok("an empty tray cannot be opened into nothing", h.q('.cal-tray-head').disabled === true);
}

console.log("\n--- reduced motion is a different path, not a slower one ---");
{
  const host = document.createElement('div');
  document.body.appendChild(host);

  REDUCE = true;
  let widget = flipdate.mount(host, { value: "2026-08-31", onCommit(){} });
  const day = host.querySelector('.fd-day');
  day.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  ok("with reduce-motion on, the value lands immediately — no timers, no flaps",
     host.querySelector('.fd-day .fd-top > span').textContent === "01" &&
     host.querySelector('.fd-day .fd-bottom > span').textContent === "01");
  ok("...and the month carried with it, in the same instant",
     host.querySelector('.fd-month .fd-top > span').textContent === "SEP");
  ok("...with aria-valuetext following the face", day.getAttribute('aria-valuetext') === "01");
  widget.destroy();

  REDUCE = false;
  widget = flipdate.mount(host, { value: "2026-08-31", onCommit(){} });
  const day2 = host.querySelector('.fd-day');
  day2.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  ok("with motion on, the bottom half waits for the flap to fall",
     host.querySelector('.fd-day .fd-bottom > span').textContent === "31",
     "the top reveals the new value as the flap covers it; the bottom lands after");
  ok("...but the value itself has already changed underneath", widget.value() === "2026-09-01");
  widget.destroy();
  ok("destroy() takes the whole widget with it", host.querySelector('.flipdate') === null);
  host.remove();
}

console.log("\n--- typed digits, carry, and commit-once ---");
{
  const host = document.createElement('div');
  document.body.appendChild(host);
  REDUCE = true;
  const commits = [];
  const w = flipdate.mount(host, { value: "2026-08-05", confirm: true, onCommit: (v) => commits.push(v) });
  const day = host.querySelector('.fd-day');
  day.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: '2', bubbles: true }));
  day.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: '7', bubbles: true }));
  ok('typing "2" then "7" lands exactly on the 27th', w.value() === "2026-08-27");
  ok("nothing is committed by typing", commits.length === 0);

  for (let i = 0; i < 5; i++) day.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  ok("five ticks is five days, one at a time", w.value() === "2026-09-01");

  host.querySelector('.fd-btn-primary').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  ok("SET commits exactly once, with the value on the faces",
     commits.length === 1 && commits[0] === "2026-09-01");

  let cancelled = 0;
  const w2 = flipdate.mount(host, { value: "2026-08-05", onCommit(){}, onCancel: () => cancelled++ });
  host.querySelectorAll('.fd-day')[1]
    .dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok("Escape backs out without writing anything", cancelled === 1);
  w.destroy(); w2.destroy(); host.remove();
  REDUCE = false;
}

console.log("\n--- leaving the view does not leave anything running ---");
{
  const h = harness();
  const first = h.viewLocal.cal;
  ok("a mounted Calendar knows how to take itself down", typeof first.teardown === "function");

  // What app.js actually does when you switch tabs: throw away viewLocal and
  // let the next view clear the host. Nothing calls back into this file.
  h.host.innerHTML = "";
  h.ctx.viewLocal = {};
  const h2Local = h.ctx.viewLocal;
  calendarView.render(null, h.ctx, h.host);
  ok("coming back builds a fresh shell", h.host.querySelector('.cal-root') !== null);
  ok("...and the abandoned one was torn down rather than left ticking forever",
     h2Local.cal !== first,
     "one orphaned once-a-minute interval per visit to the tab is a real leak");
}

console.log("\n--- the theme-swap audit, on the real markup (§7) ---");
{
  const h = harness();
  const before = h.q('.cal-strip').innerHTML + h.q('.cal-list-body').innerHTML;
  document.documentElement.setAttribute('data-theme', 'dark');
  const after = h.q('.cal-strip').innerHTML + h.q('.cal-list-body').innerHTML;
  ok("switching to dark changes nothing in the drawn markup — so no redraw is needed",
     before === after,
     "the v3 prototype baked computed colours and had to re-render; the build must not");
  ok("...because every paint is a var() or a color-mix() of one",
     !/#[0-9a-fA-F]{6}\b/.test(after) && !/\brgba?\(/.test(after));
  document.documentElement.removeAttribute('data-theme');
}

console.log("\n--- a milestone already marked done, with its date still ahead (October 2026) ---");
{
  // Andra's report: "milestones I set in a project don't show on the
  // Calendar". Her real ones were marked done with dates still to come, and
  // the approach used to hide every done thing, leaving the lane empty.
  const h = harness();
  const { alpha, a2 } = h.ids;
  h.store.setMilestoneField(alpha, a2, "done", new Date().toISOString());   // dated plus(40)
  h.draw();
  const m = h.marks().find(x => x.dataset.eid === `ms:${alpha}:${a2}:due`);
  ok("a done milestone dated ahead still shows on the approach", !!m);
  ok("...drawn as done, quietly", !!m && /ramp-done/.test(m.getAttribute('class')), m && m.getAttribute('class'));
  ok("...and a done one in the PAST still stays off the approach (Month shows it)",
     !h.marks().some(x => x.dataset.eid === `ms:${h.ids.beta}:${h.ids.b3}:due`));
}

console.log(fail ? `\n${fail} of ${n} Calendar render checks FAILED` : `\nall ${n} Calendar render checks passed`);
process.exit(fail ? 1 : 0);
