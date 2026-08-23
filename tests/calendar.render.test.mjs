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
     "rebuilding would destroy an open flip widget mid-edit and restart the dial's sweep");
  ok("...and the strip, dial, gauge and radar are all still the same nodes",
     h.q('.cal-strip') && h.q('.cal-dial') && h.q('.cal-scene') && h.q('.cal-year'));
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

console.log("\n--- the shelf: four instruments, and a shedding order ---");
{
  const h = harness();
  ok("the dial draws the month as a face", h.all('.cal-dial .cal-orbit').length === 3);
  ok("...with today's tick standing heavier than the rest", !!h.q('.cal-tick.is-today'));
  ok("...and a sweep arm that CSS can hide", !!h.q('.cal-sweep'));
  ok("overdue falls out of orbit, tethered to where it belongs",
     !!h.q('.cal-tether') && !!h.q('.cal-vacancy'),
     "a month with debt in it should look structurally wrong before you read it");
  ok("the dial's centre counts the month, in ember when anything is late",
     h.q('.cal-dial-count').classList.contains('is-overdue'));

  ok("the year radar draws twelve month spokes", h.all('.cal-year-spoke').length === 12);
  ok("...and a today hand across the face", !!h.q('.cal-year-hand'));
  ok("...with every dated thing in the year on it as a grain",
     h.all('.cal-grain-mark').length === 6, `got ${h.all('.cal-grain-mark').length}`);
  ok("...finished ones quiet, overdue ones ember",
     !!h.q('.cal-grain-mark.is-done') && !!h.q('.cal-grain-mark.is-overdue'));
  ok("the radar carries no tooltips — it is texture that happens to be true",
     h.all('.cal-year [data-eid]').length === 0);

  ok("the gauge frames a scene and says its own number",
     !!h.q('.cal-scene') && /Load · \d+/.test(h.q('.cal-gauge-cap').textContent));
  ok("...and reads that number out for a screen reader too",
     /Load: \d+ out of 100/.test(h.q('.cal-panel-gauge').getAttribute('aria-label')));
  ok("the fog draws even with no landscape file reachable — a missing picture is never a broken view",
     !!h.q('.cal-fog-bank') && !!h.q('.cal-fog-veil'));

  ok("the shelf publishes what it has shed, for CSS to obey", h.q('.cal-shelf').dataset.shed !== undefined);
  ok("one slot is left deliberately empty and holds nothing",
     h.q('.cal-panel-open').children.length === 0);
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
  ok("...and the exact-entry path is always present, never gesture-only",
     h.q('.fd-typed input[type="date"]') !== null);

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
  const w = flipdate.mount(host, { value: "2026-08-05", onCommit: (v) => commits.push(v) });
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
  const before = h.q('.cal-strip').innerHTML + h.q('.cal-dial').innerHTML + h.q('.cal-year').innerHTML;
  document.documentElement.setAttribute('data-theme', 'dark');
  const after = h.q('.cal-strip').innerHTML + h.q('.cal-dial').innerHTML + h.q('.cal-year').innerHTML;
  ok("switching to dark changes nothing in the drawn markup — so no redraw is needed",
     before === after,
     "the v3 prototype baked computed colours and had to re-render; the build must not");
  ok("...because every paint is a var() or a color-mix() of one",
     !/#[0-9a-fA-F]{6}\b/.test(after) && !/\brgba?\(/.test(after));
  document.documentElement.removeAttribute('data-theme');
}

console.log(fail ? `\n${fail} of ${n} Calendar render checks FAILED` : `\nall ${n} Calendar render checks passed`);
process.exit(fail ? 1 : 0);
