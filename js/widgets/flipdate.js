// flipdate.js — "The Setting Mechanism" (calendar architecture §4).
// ===================================================================
// A date being READ stays quiet: a typed stamp, "16 JUL", a fact nobody is
// manipulating. A date being SET becomes a machine — three split-flap units
// that tick one value at a time. That is the whole idea, and every rule below
// follows from it:
//
//   - Every change is DISCRETE. A jump of five is five flips, never a slide.
//   - There is NO MOMENTUM anywhere, on any input path. A flick does nothing.
//   - Day roll-over CARRIES, like a real flip clock at midnight: Aug 31 +1
//     is Sep 1, and the month card flips too.
//   - Nothing is reachable only by gesture. Wheel, arrow keys, typed digits,
//     hold-and-drag, and a native date field all reach the same value.
//
// This module is DELIBERATELY self-contained: no imports, no store, no DOM
// outside the container it is handed. That is what makes it adoptable — the
// entry and milestone editors can swap their date fields onto mount() later
// without a rewrite, and it is what lets the carry logic below be tested
// headlessly with no DOM at all.
//
// Styling lives in css/calendar.css for now (it is Calendar-scoped this pass);
// when a second surface adopts the widget, that block moves to app.css. There
// are no literal colours, sizes or fonts in this file — the CSS owns all of
// it through tokens, per the standing rule.
//
//   API:  mount(container, { value, onCommit, onCancel }) -> { destroy() }
//
//     value      "YYYY-MM-DD" or null (null starts from today)
//     onCommit   called ONCE, with a "YYYY-MM-DD" string, when SET is pressed
//     onCancel   optional; called on Escape
//
// Ticking mutates only this component's own state. Nothing is written until
// SET, so scrubbing through three months costs the store exactly nothing and
// collapsing the widget without pressing SET writes nothing at all.

export const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

// A tick is ~150ms: the top flap folds down over 75ms, the bottom flap falls
// in over the next 75ms. More than this many ticks still queued and the whole
// mechanism drops to a flutter, because watching thirty deliberate 150ms
// flips to move a date by a month is not charm, it is waiting.
export const TICK_MS = 150;
export const FLUTTER_MS = 60;
export const FLUTTER_AFTER = 3;

// One notch of the wheel is one tick, and no faster than this — a trackpad
// emits wheel events far faster than a flap can physically fall.
export const WHEEL_THROTTLE_MS = 80;
// One tick per this many pixels of drag. Chosen so a comfortable thumb-swipe
// is a handful of days rather than a year.
export const DRAG_PX_PER_TICK = 28;
// How long a typed digit stays "open" for a second digit ("2" then "7" -> 27).
export const TYPE_BUFFER_MS = 900;

export const YEAR_MIN = 2020;
export const YEAR_MAX = 2100;

// ===================================================================
//  THE PURE PART — date arithmetic, no DOM, no state
// ===================================================================
// Everything below this line down to makeUnit() is a plain function over
// plain numbers, so the carry rules (the part that is actually easy to get
// wrong) can be tested at every boundary without a browser.

export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3] };
}

export function toISO(y, mo, d) {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Day 0 of the NEXT month is the last day of this one — which gets February
// and every leap year right without a rule about leap years.
export function daysInMonth(y, mo) {
  return new Date(y, mo, 0).getDate();
}

// A month change can leave the day out of range (Jan 31 -> Feb). Clamp rather
// than roll: someone moving the MONTH card meant to change the month.
export function clampDay(v) {
  return { ...v, d: Math.min(v.d, daysInMonth(v.y, v.mo)) };
}

// ONE STEP of one unit, in one direction. This is the carry, and it is the
// whole reason this function is exported: Aug 31 +1 -> Sep 1, Mar 1 -1 ->
// Feb 28 (or 29), Dec +1 -> Jan of next year, and a month change clamps.
export function stepDate(v, key, dir) {
  const step = Math.sign(dir) || 1;
  let { y, mo, d } = v;

  if (key === "d") {
    d += step;
    if (d > daysInMonth(y, mo)) {          // midnight on a real flip clock
      d = 1; mo++;
      if (mo > 12) { mo = 1; y++; }
    } else if (d < 1) {
      mo--;
      if (mo < 1) { mo = 12; y--; }
      d = daysInMonth(y, mo);
    }
    return { y, mo, d };
  }

  if (key === "mo") {
    mo += step;
    if (mo > 12) { mo = 1; y++; }
    if (mo < 1) { mo = 12; y--; }
    return clampDay({ y, mo, d });
  }

  y = Math.min(YEAR_MAX, Math.max(YEAR_MIN, y + step));
  return clampDay({ y, mo, d });
}

// Which units actually changed between two values. Each changed unit flips
// exactly once per tick — so a day roll-over flips the day AND the month, and
// a New Year's Eve roll-over flips all three.
export function changedUnits(before, after) {
  const out = [];
  if (before.d !== after.d) out.push("d");
  if (before.mo !== after.mo) out.push("mo");
  if (before.y !== after.y) out.push("y");
  return out;
}

export function faceText(v, unit) {
  if (unit === "d") return String(v.d).padStart(2, "0");
  if (unit === "mo") return MONTH_LABELS[v.mo - 1];
  return String(v.y);
}

function todayValue() {
  const now = new Date();
  return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
}

// Reduced motion is checked as a JS GUARD as well as in CSS (§4). The CSS
// alone would hide the flaps but still run the timers; this skips the
// animation entirely so the value lands instantly.
function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}

// ===================================================================
//  THE WIDGET
// ===================================================================

export function mount(container, opts = {}) {
  const { value = null, onCommit = null, onCancel = null } = opts;

  let v = parseISO(value) || todayValue();
  v = clampDay(v);

  const doc = container.ownerDocument || document;
  const listeners = [];
  const timers = new Set();
  let destroyed = false;

  const on = (node, type, fn, options) => {
    node.addEventListener(type, fn, options);
    listeners.push([node, type, fn, options]);
  };
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
    timers.add(id);
    return id;
  };

  const root = doc.createElement("div");
  root.className = "flipdate";

  // ---- the three units ----
  const units = {};
  for (const [key, cls, label] of [
    ["d", "fd-day", "Day"],
    ["mo", "fd-month", "Month"],
    ["y", "fd-year", "Year"],
  ]) {
    units[key] = makeUnit(key, cls, label);
    root.appendChild(units[key]);
  }

  function makeUnit(key, cls, label) {
    const el = doc.createElement("div");
    el.className = `fd-unit ${cls}`;
    el.tabIndex = 0;
    el.setAttribute("role", "spinbutton");
    el.setAttribute("aria-label", label);
    el.innerHTML =
      `<div class="fd-half fd-top"><span></span></div>` +
      `<div class="fd-half fd-bottom"><span></span></div>` +
      `<div class="fd-flap fd-flap-top"><span></span></div>` +
      `<div class="fd-flap fd-flap-bottom"><span></span></div>` +
      `<span class="fd-hint mk"></span>`;
    el.querySelector(".fd-hint").textContent = label;

    // (1) POINTER — rest on a card and scroll. One notch, one tick.
    on(el, "wheel", (ev) => {
      ev.preventDefault();
      const now = Date.now();
      if (el._wheelAt && now - el._wheelAt < WHEEL_THROTTLE_MS) return;
      el._wheelAt = now;
      tick(key, ev.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    // (2) KEYBOARD — arrows tick, digits jump exactly, Escape backs out.
    on(el, "keydown", (ev) => {
      if (ev.key === "ArrowUp") { ev.preventDefault(); tick(key, 1); }
      else if (ev.key === "ArrowDown") { ev.preventDefault(); tick(key, -1); }
      else if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      else if (ev.key === "Escape") { ev.preventDefault(); onCancel && onCancel(); }
      else if (/^\d$/.test(ev.key) && key !== "mo") { typeDigit(key, ev.key); }
    });

    // (3) TOUCH — hold and drag. The value moves ONLY while the finger moves;
    //     there is no velocity anywhere in here, so a flick does nothing.
    on(el, "pointerdown", (ev) => {
      try { el.setPointerCapture(ev.pointerId); } catch { /* jsdom, old Safari */ }
      el._dragY = ev.clientY;
    });
    on(el, "pointermove", (ev) => {
      if (el._dragY == null) return;
      const steps = Math.trunc((ev.clientY - el._dragY) / DRAG_PX_PER_TICK);
      if (!steps) return;
      el._dragY += steps * DRAG_PX_PER_TICK;
      tick(key, -steps);            // drag DOWN pulls earlier dates up past you
    });
    const endDrag = () => { el._dragY = null; };
    on(el, "pointerup", endDrag);
    on(el, "pointercancel", endDrag);
    on(el, "lostpointercapture", endDrag);

    return el;
  }

  // ---- SET / TYPE ----
  const actions = doc.createElement("div");
  actions.className = "fd-actions";

  const okBtn = doc.createElement("button");
  okBtn.type = "button";
  okBtn.className = "fd-btn fd-btn-primary";
  okBtn.textContent = "Set";
  on(okBtn, "click", () => commit());

  const typeBtn = doc.createElement("button");
  typeBtn.type = "button";
  typeBtn.className = "fd-btn";
  typeBtn.textContent = "Type";
  typeBtn.setAttribute("aria-expanded", "false");
  on(typeBtn, "click", () => toggleTyped());

  actions.append(okBtn, typeBtn);
  root.appendChild(actions);

  // (4) EXACT — the native date field. Always present, never the only way in.
  const typed = doc.createElement("span");
  typed.className = "fd-typed";
  const input = doc.createElement("input");
  input.type = "date";
  input.setAttribute("aria-label", "Exact date");
  on(input, "change", () => {
    const next = parseISO(input.value);
    if (next) { v = clampDay(next); paintAll(); }
  });
  on(input, "keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    if (ev.key === "Escape") { ev.preventDefault(); onCancel && onCancel(); }
  });
  typed.appendChild(input);
  root.appendChild(typed);

  function toggleTyped() {
    const open = !root.classList.contains("typing");
    root.classList.toggle("typing", open);
    typeBtn.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  }

  // ---- typed digits on a focused card ----
  let buffer = "";
  let bufferTimer = null;
  function typeDigit(key, digit) {
    buffer = (buffer + digit).slice(key === "y" ? -4 : -2);
    if (bufferTimer) clearTimeout(bufferTimer);
    bufferTimer = later(() => { buffer = ""; }, TYPE_BUFFER_MS);
    const n = parseInt(buffer, 10);
    if (key === "d" && n >= 1 && n <= daysInMonth(v.y, v.mo)) { v = { ...v, d: n }; paintAll(); }
    if (key === "y" && buffer.length === 4 && n >= YEAR_MIN && n <= YEAR_MAX) { v = clampDay({ ...v, y: n }); paintAll(); }
  }

  // ---- the tick queue ----
  // Ticks are QUEUED rather than applied at once, so five notches of the
  // wheel are five visible flips in sequence rather than one silent jump.
  const queue = [];
  let animating = false;

  function tick(key, delta) {
    const dir = Math.sign(delta) || 1;
    for (let i = 0; i < Math.abs(delta); i++) queue.push({ key, dir });
    drain();
  }

  function drain() {
    if (animating || destroyed) return;
    const job = queue.shift();
    if (!job) { input.value = valueOf(); return; }
    animating = true;
    const before = v;
    v = stepDate(v, job.key, job.dir);
    const changed = changedUnits(before, v);
    if (!changed.length) { animating = false; drain(); return; }   // clamped at a bound
    const ms = queue.length > FLUTTER_AFTER ? FLUTTER_MS : TICK_MS;
    let waiting = changed.length;
    const settle = () => { if (--waiting === 0) { animating = false; drain(); } };
    for (const u of changed) flip(u, ms, settle);
  }

  function flip(unit, ms, done) {
    const el = units[unit];
    const next = faceText(v, unit);
    writeAria(unit);

    const top = el.querySelector(".fd-top > span");
    const bottom = el.querySelector(".fd-bottom > span");

    if (prefersReducedMotion()) {
      top.textContent = next; bottom.textContent = next;
      done();
      return;
    }

    const flapT = el.querySelector(".fd-flap-top");
    const flapB = el.querySelector(".fd-flap-bottom");
    const prev = top.textContent;

    flapT.firstElementChild.textContent = prev;
    flapB.firstElementChild.textContent = next;
    top.textContent = next;                       // revealed as the flap falls

    flapT.style.display = "flex"; flapB.style.display = "flex";
    flapT.style.transition = "none"; flapB.style.transition = "none";
    flapT.style.transform = "rotateX(0deg)";
    flapB.style.transform = "rotateX(90deg)";

    const start = () => {
      if (destroyed) return;
      flapT.style.transition = `transform ${ms / 2}ms ease-in`;
      flapT.style.transform = "rotateX(-90deg)";
      later(() => {
        flapB.style.transition = `transform ${ms / 2}ms ease-out`;
        flapB.style.transform = "rotateX(0deg)";
        later(() => {
          bottom.textContent = next;
          flapT.style.display = "none"; flapB.style.display = "none";
          done();
        }, ms / 2);
      }, ms / 2);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(start);
    else start();
  }

  // ---- painting ----
  function writeAria(unit) {
    const el = units[unit];
    el.setAttribute("aria-valuenow", String(unit === "mo" ? v.mo : unit === "d" ? v.d : v.y));
    el.setAttribute("aria-valuetext", faceText(v, unit));
    el.setAttribute("aria-valuemin", String(unit === "y" ? YEAR_MIN : 1));
    el.setAttribute("aria-valuemax", String(
      unit === "y" ? YEAR_MAX : unit === "mo" ? 12 : daysInMonth(v.y, v.mo)));
  }

  function paintAll() {
    for (const unit of ["d", "mo", "y"]) {
      const el = units[unit];
      const txt = faceText(v, unit);
      el.querySelector(".fd-top > span").textContent = txt;
      el.querySelector(".fd-bottom > span").textContent = txt;
      writeAria(unit);
    }
    input.value = valueOf();
  }

  function valueOf() { return toISO(v.y, v.mo, v.d); }

  // ONE commit, one op. Nothing before this and nothing after it.
  function commit() {
    queue.length = 0;
    if (onCommit) onCommit(valueOf());
  }

  paintAll();
  container.appendChild(root);

  return {
    root,
    value: valueOf,
    focus() { units.d.focus(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      queue.length = 0;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      if (bufferTimer) clearTimeout(bufferTimer);
      for (const [node, type, fn, options] of listeners) node.removeEventListener(type, fn, options);
      listeners.length = 0;
      root.remove();
    },
  };
}
