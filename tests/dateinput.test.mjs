// dateinput.test.mjs — the flip-numeral date input, app-wide.
//
//   node tests/dateinput.test.mjs      (needs jsdom)
//
// The widget's DATE ARITHMETIC — carry across month ends, leap years, clamping
// on a month change — is tested in tests/calendar.test.mjs, where it was
// written, because that is §4 of the Calendar design and it has not moved.
//
// This file is about what the widget grew on August 23, 2026, when it stopped
// being the Calendar tray's mechanism and became THE date input in Dash: a
// compact size that fits a form row, a genuinely empty state, an honest
// unsaved-vs-saved signal (it is the one field that does not autosave per
// keystroke), and the safety nets that stop that honesty becoming a trap.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: 'https://x.test/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement',
                 'MutationObserver','requestAnimationFrame','cancelAnimationFrame',
                 'getComputedStyle','Event','KeyboardEvent','MouseEvent'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
// Reduce-motion ON throughout: the flip animation is tested in
// calendar.render.test.mjs, and here it would only add 150ms to every check.
dom.window.matchMedia = (q) => ({
  matches: /prefers-reduced-motion/.test(q),
  addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){},
});

const { mount, todayValue, toISO, AUTO_COMMIT_MS } = await import('../js/widgets/flipdate.js');

let fail = 0, n = 0;
const ok = (name, cond, extra = "") => {
  n++; if (!cond) fail++;
  console.log((cond ? "PASS  " : "FAIL  ") + name + (cond || !extra ? "" : `\n      ${extra}`));
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const TODAY = (() => { const t = todayValue(); return toISO(t.y, t.mo, t.d); })();

function harness(opts = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const commits = [];
  const w = mount(host, { onCommit: (v) => commits.push(v), ...opts });
  const q = (sel) => host.querySelector(sel);
  return {
    host, w, commits, q,
    face: (unit) => q(`.fd-${unit} .fd-top > span`).textContent,
    unit: (u) => q(`.fd-${u}`),
    set: q('.fd-btn-primary'),
    clear: q('.fd-btn-clear'),
    key: (u, key) => q(`.fd-${u}`).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })),
    click: (el) => el && !el.disabled && el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
    done: () => { w.destroy(); host.remove(); },
  };
}

// ==================================================================
console.log("\n--- compact: the same machine, sized for a form row ---");
{
  const full = harness({ value: "2026-08-23" });
  ok("full size by default", !full.w.root.classList.contains('flipdate-compact'));
  full.done();

  const h = harness({ value: "2026-08-23", size: "compact" });
  ok("compact is a class, not a second widget", h.w.root.classList.contains('flipdate-compact'));
  ok("...still three units", h.host.querySelectorAll('.fd-unit').length === 3);
  ok("...still spinbuttons a screen reader can drive",
     [...h.host.querySelectorAll('.fd-unit')].every(u =>
       u.getAttribute('role') === 'spinbutton' && u.hasAttribute('aria-valuenow')));
  ok("...still reading the same date", h.face('day') === "23" && h.face('month') === "AUG");
  ok("the visible DAY/MONTH/YEAR hints are dropped, the accessible names are NOT",
     [...h.host.querySelectorAll('.fd-unit')].every(u => /Day|Month|Year/.test(u.getAttribute('aria-label'))));
  h.done();

  const labelled = harness({ value: "2026-08-23", size: "compact", label: "Due date" });
  ok("a caller can name the field, and every unit inherits it",
     labelled.unit('day').getAttribute('aria-label') === "Due date — Day" &&
     labelled.unit('year').getAttribute('aria-label') === "Due date — Year");
  labelled.done();

  const css = fs.readFileSync(path.join(ROOT, "css/dateinput.css"), "utf8");
  const compactBlock = css.slice(css.indexOf('.flipdate-compact'));
  const dims = [...compactBlock.matchAll(/width: (\d+)px; height: (\d+)px; font-size: (\d+)px/g)]
    .map(m => ({ w: +m[1], h: +m[2], f: +m[3] }));
  ok("every compact card still clears the 44px touch floor in BOTH directions",
     dims.length === 3 && dims.every(d => d.w >= 44 && d.h >= 44),
     dims.map(d => `${d.w}x${d.h}`).join(" "));
  ok("...and every compact numeral is still 18px or larger",
     dims.every(d => d.f >= 18), dims.map(d => `${d.f}px`).join(" "));
}

// ==================================================================
console.log("\n--- empty: a field that is allowed to hold no date ---");
{
  const h = harness({ value: null, allowEmpty: true });
  ok("an empty field reads as empty, not as today", h.w.value() === null);
  ok("...and still shows you it has three drums",
     h.face('day') === "··" && h.face('month') === "···" && h.face('year') === "····");
  ok("...marked as empty for CSS", h.w.root.classList.contains('is-empty'));
  ok("...and told to a screen reader as 'no date', with no number to read",
     h.unit('day').getAttribute('aria-valuetext') === "No date set" &&
     !h.unit('day').hasAttribute('aria-valuenow'));
  ok("nothing to clear yet, so the × is hidden", h.clear.hidden === true);
  ok("...and the blanks are dots, not dashes — a dash sits on the card's own seam and reads as a broken control",
     !/[–—-]/.test(h.face('day') + h.face('month') + h.face('year')));

  // The point of seeding: "scroll to put a date on this" has to work without a
  // separate 'add a date' step in front of it.
  h.key('day', 'ArrowUp');
  ok("one notch on an empty field lands on TODAY, not tomorrow", h.w.value() === TODAY,
     `got ${h.w.value()}, today is ${TODAY}`);
  ok("...and it is now something worth saving", h.w.isDirty());
  h.key('day', 'ArrowUp');
  ok("the notch after that moves off today", h.w.value() !== TODAY);
  h.done();

  const typed = harness({ value: null, allowEmpty: true });
  typed.key('day', '1'); typed.key('day', '5');
  ok("typing digits into an empty field seeds it too, and lands exactly",
     typed.w.value() && typed.w.value().endsWith("-15"), typed.w.value());
  typed.done();
}

console.log("\n--- clearing ---");
{
  const h = harness({ value: "2026-08-23", allowEmpty: true });
  ok("a field with a date offers a small × to clear it", h.clear.hidden === false && h.clear.textContent === "×");
  ok("...named for a screen reader", /Clear/.test(h.clear.getAttribute('aria-label')));
  h.click(h.clear);
  ok("clearing empties the faces", h.w.value() === null && h.face('day') === "··");
  ok("...and commits on the spot, without waiting for SET", h.commits.length === 1 && h.commits[0] === null,
     "clearing is one unambiguous act with no intermediate state to scrub through");
  ok("...and the × goes away again", h.clear.hidden === true);
  h.done();

  const noEmpty = harness({ value: "2026-08-23" });
  ok("a field that may not be empty has no CLEAR at all", noEmpty.clear === null);
  noEmpty.done();
}

// ==================================================================
console.log("\n--- simple by default: no SET, no TYPE, it saves itself (October 2026) ---");
{
  const h = harness({ value: "2026-08-23", allowEmpty: true, autoCommitMs: 40 });
  ok("an ordinary date field has no SET button", h.set === null);
  ok("...and no TYPE button or hidden exact-entry field",
     ![...h.host.querySelectorAll('button')].some(b => /type/i.test(b.textContent)) && !h.q('input'));
  ok("...the × is the only button", h.host.querySelectorAll('button').length === 1);
  h.key('day', 'ArrowUp');
  ok("a tick writes nothing on the spot", h.commits.length === 0 && h.w.isDirty());
  await wait(120);
  ok("...and saves itself a beat later", h.commits.length === 1 && h.commits[0] === "2026-08-24");
  h.done();

  const dflt = harness({ value: "2026-08-23" });
  ok("autosave is ON by default, without the caller asking", AUTO_COMMIT_MS > 0);
  dflt.key('day', 'ArrowUp');
  await wait(AUTO_COMMIT_MS + 80);
  ok("...and lands after AUTO_COMMIT_MS", dflt.commits.length === 1);
  dflt.done();
}

console.log("\n--- the Calendar's tray keeps SET (confirm: true) ---");
{
  const h = harness({ value: "2026-08-23", confirm: true });
  ok("arriving on a saved date, SET is spent", h.set.disabled === true && !h.w.isDirty());
  ok("...and says so out loud", h.set.getAttribute('aria-label') === "Date saved");
  h.key('day', 'ArrowUp');
  ok("one tick and SET lights up", h.set.classList.contains('is-pending') && h.set.getAttribute('aria-label') === "Set this date");
  await wait(AUTO_COMMIT_MS + 80);
  ok("...and nothing saves on its own", h.commits.length === 0);
  h.click(h.set);
  ok("SET writes exactly once", h.commits.length === 1 && h.commits[0] === "2026-08-24");
  h.done();
}

console.log("\n--- a field that opens on today is PROPOSING today, not showing it saved ---");
{
  const h = harness({ value: null, allowEmpty: false, confirm: true });
  ok("it opens showing today", h.w.value() === TODAY);
  ok("...but today is a proposal, so SET is live immediately", h.set.disabled === false);
  h.click(h.set);
  ok("...and pressing it commits today", h.commits.length === 1 && h.commits[0] === TODAY);
  h.done();
}

// ==================================================================
console.log("\n--- the safety nets ---");
{
  const tray = harness({ value: null, confirm: true });
  tray.key('day', 'ArrowUp');
  await wait(80);
  ok("with autocommit off, ticking alone never writes — SET is the only way",
     tray.commits.length === 0,
     "the tray is a decision with a consequence; nothing should take it for you");
  tray.done();

  const field = harness({ value: "2026-08-23", allowEmpty: true, autoCommitMs: 40 });
  field.key('day', 'ArrowUp');
  ok("a field with autocommit still writes nothing on the tick itself", field.commits.length === 0);
  await wait(120);
  ok("...but one op lands a beat after the last tick", field.commits.length === 1 && field.commits[0] === "2026-08-24",
     "every other field in that editor autosaves; a date must not be the one thing that vanishes");

  // The important half: a BURST is still one op, not one per tick.
  for (let i = 0; i < 6; i++) field.key('day', 'ArrowUp');
  await wait(120);
  ok("six more ticks are still ONE op, not six", field.commits.length === 2, `${field.commits.length} commits`);
  ok("...landing on the value the faces are showing", field.commits[1] === field.w.value());
  field.done();

  const abandoned = harness({ value: "2026-08-23", allowEmpty: true });
  abandoned.key('day', 'ArrowUp');
  abandoned.w.commitIfDirty();
  ok("commitIfDirty() catches a date scrolled but never SET", abandoned.commits.length === 1);
  abandoned.w.commitIfDirty();
  ok("...and does nothing at all when there is nothing pending", abandoned.commits.length === 1);
  abandoned.done();
}

console.log("\n--- driving it without ever clicking it ---");
{
  // The whole point of the mechanism over a native picker: it is live where
  // the pointer is resting. No click to open, no focus required.
  const h = harness({ value: "2026-08-23" });
  const ev = new dom.window.Event('wheel', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'deltaY', { value: 4 });
  h.unit('day').dispatchEvent(ev);
  ok("a wheel notch over a card ticks it, with nothing focused and nothing clicked",
     h.w.value() === "2026-08-24");
  ok("...and the page is not scrolled out from under you while you do it",
     ev.defaultPrevented === true);
  h.done();
}

console.log("\n--- setValue, for a caller whose data changed underneath ---");
{
  const h = harness({ value: "2026-08-23" });
  h.key('day', 'ArrowUp');
  h.w.setValue("2027-01-09");
  ok("setValue replaces what is on the faces", h.w.value() === "2027-01-09" && h.face('day') === "09");
  ok("...and counts as saved, not as pending", !h.w.isDirty());
  ok("...without writing anything of its own", h.commits.length === 0);
  h.w.setValue(null);
  ok("a non-emptyable field handed null falls back to today rather than to blank",
     h.w.value() === TODAY);
  h.done();
}

// ==================================================================
console.log("\n--- every date field in Dash now goes through it ---");
{
  const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

  for (const rel of ["js/editor.js", "js/views/milestone-editor.js", "js/views/calendar.js"]) {
    ok(`${rel} mounts the mechanism`, /flipdate\.js"/.test(src(rel)));
  }
  const natives = ["js/editor.js", "js/views/milestone-editor.js"]
    .flatMap(rel => (src(rel).match(/type: *"date"/g) || []).map(() => rel));
  ok("no hand-rolled native date input is left in either editor", natives.length === 0,
     natives.join(", "));

  ok("the item editor mounts two of them, compact, and lets them be empty",
     (src("js/editor.js").match(/mountDateInput\(/g) || []).length === 1 &&
     /size: "compact"/.test(src("js/editor.js")) && /allowEmpty: true/.test(src("js/editor.js")),
     "one call site, used for both Due and Remind me");
  ok("...and commits anything still pending when the editor closes",
     /commitIfDirty\(\)/.test(src("js/editor.js")));
  ok("the phase editor mounts it through its ONE shared date-field helper",
     (src("js/views/milestone-editor.js").match(/mountDateInput\(/g) || []).length === 1);
  ok("...and keeps its focus-restoration key, which that drawer depends on",
     /fkey,/.test(src("js/views/milestone-editor.js")));
  ok("the Calendar's tray mounts it FULL size, with SET (confirm) and no autocommit",
     /size: "full"/.test(src("js/views/calendar.js")) && /confirm: true/.test(src("js/views/calendar.js")) &&
     !/autoCommitMs/.test(src("js/views/calendar.js")));
  ok("the phase editor holds redraws while the pointer is on a date (the jumping fix)",
     /holdWhileOver\(wrap, ctx\)/.test(src("js/views/milestone-editor.js")));

  ok("the widget is a STATIC import everywhere now, so the SHELL crawler can see it",
     !/await import\(["'][^"']*flipdate/.test(src("js/views/calendar.js")));

  const sw = src("sw.js");
  ok("sw.js caches the widget and its stylesheet",
     sw.includes('"./js/widgets/flipdate.js"') && sw.includes('"./css/dateinput.css"'));
  ok("index.html loads the stylesheet", /href="css\/dateinput\.css"/.test(src("index.html")));
  ok("calendar.css no longer styles the widget it used to own",
     !/\.fd-unit|\.flipdate\s*\{/.test(src("css/calendar.css")));
}

console.log(fail ? `\n${fail} of ${n} date-input checks FAILED` : `\nall ${n} date-input checks passed`);
process.exit(fail ? 1 : 0);
