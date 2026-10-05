// flipdate.js — "The Setting Mechanism" (calendar architecture §4).
// ===================================================================
// THE date input for Dash. A date being READ stays quiet — a typed stamp,
// "16 JUL", a fact nobody is manipulating. A date being SET becomes a machine:
// three split-flap units that tick one value at a time. Every rule below
// follows from that:
//
//   - Every change is DISCRETE. A jump of five is five flips, never a slide.
//   - There is NO MOMENTUM anywhere, on any input path. A flick does nothing.
//   - Day roll-over CARRIES, like a real flip clock at midnight: Aug 31 +1
//     is Sep 1, and the month card flips too.
//   - Nothing is reachable only by gesture. Wheel, arrow keys, typed digits
//     and hold-and-drag all reach the same value.
//   - You never have to CLICK IT FIRST. Rest the pointer over a card and
//     scroll: it ticks. That is the whole point of a machine sitting on the
//     surface rather than a field you have to go and open.
//
// This module is DELIBERATELY self-contained: no imports, no store, no DOM
// outside the container it is handed. That is what lets one widget serve the
// item editor, the phase editor and the Calendar's tray without any of them
// knowing about each other, and what lets the carry logic below be tested
// headlessly with no DOM at all.
//
// Styling lives in css/dateinput.css — app-wide, since August 23, 2026, when
// this became the date input everywhere rather than a Calendar-only widget.
// There are no literal colours, sizes or fonts in this file.
//
//   API:  mount(container, {
//           value,        // "YYYY-MM-DD" | null
//           onCommit,     // (dateStr | null) => void — fires ONCE, on SET
//           onCancel,     // optional; Escape
//           size,         // "full" (default) | "compact"
//           allowEmpty,   // may the field hold NO date? (default false)
//           label,        // accessible name prefix, e.g. "Due date"
//           fkey,         // optional data-fkey, for focus restoration
//           confirm,      // true = show a SET button and commit ONLY on it
//                         //   (the Calendar's tray). Default false: no SET.
//           autoCommitMs, // how long after the last tick it saves itself.
//                         //   Default AUTO_COMMIT_MS without `confirm`, 0 with.
//         }) -> { root, value(), setValue(v), isDirty(), commitIfDirty(),
//                 focus(), destroy() }
//
// SIMPLIFIED, October 2026 (Andra: "a set button, a type button, and a clear
// button... that's a little complicated"). Everywhere but the Calendar's tray
// the mechanism now has NO buttons to press: scroll, arrow or type digits and
// it saves itself a beat after you stop. The TYPE button and its hidden native
// field are gone (typing digits on a focused card already did the same job).
// CLEAR is a small × that appears only when there is a date to clear.
//
// SIZE. "full" is the object as designed — a machine you can see across the
// room, for the Calendar's tray where it is the only thing happening. But a
// date field in a two-column editor gets ~200px, so "compact" shrinks the same
// mechanism to fit an ordinary form row. Nothing about the behaviour changes;
// only the cards get smaller and the DAY/MONTH/YEAR hints drop away (each unit
// keeps its aria-label, so nothing is lost to a screen reader).
//
// EMPTY. Most date fields in Dash are allowed to hold no date at all — a
// reminder usually doesn't have one. An empty mechanism shows blank flaps, and
// the first tick, drag or typed digit seeds it from today and carries on
// normally. CLEAR puts it back to empty.
//
// COMMITTING. Ticking mutates only this component's own state, so scrubbing
// through three months costs the store nothing and closing without pressing
// SET writes nothing. Because that makes dates the one field in Dash that
// doesn't autosave, the widget SHOWS it: while the faces differ from what was
// last committed, the housing takes an ink edge and SET lights up. When they
// match, SET is spent and says so. CLEAR is the one exception — clearing is a
// single unambiguous act with no intermediate state to scrub through, so it
// commits on the spot.

export const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

// What a blank flap reads as, per unit. Not spaces — a split-flap that has not
// been set to anything should still show you it has three drums and how many
// characters each one takes. Dots rather than dashes on purpose: a dash sits
// exactly on the seam between the two halves of a card and becomes
// indistinguishable from it, which made an empty field read as a broken one.
export const EMPTY_FACE = { d: "··", mo: "···", y: "····" };

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

// How long after the last tick an ordinary date field saves itself.
export const AUTO_COMMIT_MS = 700;

export const YEAR_MIN = 2020;
export const YEAR_MAX = 2100;

// ===================================================================
//  THE PURE PART — date arithmetic, no DOM, no state
// ===================================================================
// Everything down to mount() is a plain function over plain numbers, so the
// carry rules (the part that is actually easy to get wrong) can be tested at
// every boundary without a browser.

export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
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
  if (!v) return EMPTY_FACE[unit];
  if (unit === "d") return String(v.d).padStart(2, "0");
  if (unit === "mo") return MONTH_LABELS[v.mo - 1];
  return String(v.y);
}

export function todayValue(now = new Date()) {
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
  const {
    onCommit = null, onCancel = null,
    size = "full", allowEmpty = false, label = "", fkey = null,
    confirm = false,
  } = opts;
  const autoCommitMs = opts.autoCommitMs != null ? opts.autoCommitMs : (confirm ? 0 : AUTO_COMMIT_MS);

  let v = parseISO(opts.value ?? null);
  if (v) v = clampDay(v);

  // COMMITTED IS WHAT THE CALLER GAVE US, not what we are showing. The
  // distinction matters: a field that cannot be empty (the Calendar's tray,
  // setting a date on a phase that has none) opens showing TODAY, because
  // there is no such thing as "no date" for it to display — but today is a
  // proposal, not a saved value. Treating it as saved would leave SET spent
  // and disabled on arrival, and "set this phase to today" — the single most
  // likely thing you want — would be the one date you could not choose.
  let committed = v ? toISO(v.y, v.mo, v.d) : null;
  if (!v && !allowEmpty) v = todayValue();

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
  root.className = "flipdate" + (size === "compact" ? " flipdate-compact" : "");
  if (label) root.setAttribute("aria-label", label);

  // ---- the three units ----
  const units = {};
  for (const [key, cls, name] of [
    ["d", "fd-day", "Day"],
    ["mo", "fd-month", "Month"],
    ["y", "fd-year", "Year"],
  ]) {
    units[key] = makeUnit(key, cls, name);
    root.appendChild(units[key]);
  }
  // The focus-restoration key goes on the DAY card rather than the housing:
  // callers that rebuild their whole form (the phase editor does, on every
  // store change) find it with querySelector and call .focus() on it, and the
  // housing is not focusable.
  if (fkey) units.d.dataset.fkey = fkey;

  function makeUnit(key, cls, name) {
    const el = doc.createElement("div");
    el.className = `fd-unit ${cls}`;
    el.tabIndex = 0;
    el.setAttribute("role", "spinbutton");
    el.setAttribute("aria-label", label ? `${label} — ${name}` : name);
    el.innerHTML =
      `<div class="fd-half fd-top"><span></span></div>` +
      `<div class="fd-half fd-bottom"><span></span></div>` +
      `<div class="fd-flap fd-flap-top"><span></span></div>` +
      `<div class="fd-flap fd-flap-bottom"><span></span></div>` +
      `<span class="fd-hint mk"></span>`;
    el.querySelector(".fd-hint").textContent = name;

    // (1) POINTER — rest on a card and scroll. One notch, one tick. NO CLICK
    //     FIRST: the mechanism is live wherever the pointer is resting, which
    //     is the difference between an instrument and a form field.
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

  // ---- SET (the Calendar's tray only) and CLEAR ----
  const actions = doc.createElement("div");
  actions.className = "fd-actions";

  let okBtn = null;
  if (confirm) {
    okBtn = doc.createElement("button");
    okBtn.type = "button";
    okBtn.className = "fd-btn fd-btn-primary";
    okBtn.textContent = "Set";
    on(okBtn, "click", () => commit());
    actions.appendChild(okBtn);
  }

  // A small ×, drawn only while there is a date to take away.
  let clearBtn = null;
  if (allowEmpty) {
    clearBtn = doc.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "fd-btn fd-btn-clear";
    clearBtn.textContent = "×";
    clearBtn.setAttribute("aria-label", label ? `Clear ${label.toLowerCase()}` : "Clear date");
    clearBtn.title = "Clear date";
    on(clearBtn, "click", () => clear());
    actions.appendChild(clearBtn);
  }
  if (actions.childNodes.length) root.appendChild(actions);

  // An empty mechanism seeds itself from today the moment you touch it, so
  // "scroll to set a date that isn't there yet" works without a separate
  // "add a date" step in front of it.
  function ensureValue() {
    if (v) return false;
    v = todayValue();
    return true;
  }

  // ---- typed digits on a focused card ----
  let buffer = "";
  let bufferTimer = null;
  function typeDigit(key, digit) {
    const seeded = ensureValue();
    buffer = (buffer + digit).slice(key === "y" ? -4 : -2);
    if (bufferTimer) clearTimeout(bufferTimer);
    bufferTimer = later(() => { buffer = ""; }, TYPE_BUFFER_MS);
    const n = parseInt(buffer, 10);
    if (key === "d" && n >= 1 && n <= daysInMonth(v.y, v.mo)) v = { ...v, d: n };
    else if (key === "y" && buffer.length === 4 && n >= YEAR_MIN && n <= YEAR_MAX) v = clampDay({ ...v, y: n });
    else if (!seeded) return;
    paintAll();
  }

  // ---- the tick queue ----
  // Ticks are QUEUED rather than applied at once, so five notches of the
  // wheel are five visible flips in sequence rather than one silent jump.
  const queue = [];
  let animating = false;

  function tick(key, delta) {
    // Seeding is itself the first change: one notch on an empty field lands
    // you on today, and the notch after that moves off it.
    if (ensureValue()) { paintAll(); return; }
    const dir = Math.sign(delta) || 1;
    for (let i = 0; i < Math.abs(delta); i++) queue.push({ key, dir });
    drain();
  }

  function drain() {
    if (animating || destroyed) return;
    const job = queue.shift();
    if (!job) { syncOutputs(); return; }
    animating = true;
    const before = v;
    v = stepDate(v, job.key, job.dir);
    const changed = changedUnits(before, v);
    if (!changed.length) { animating = false; drain(); return; }   // clamped at a bound
    syncOutputs();
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
    if (!v) {
      el.removeAttribute("aria-valuenow");
      el.setAttribute("aria-valuetext", "No date set");
      return;
    }
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
    syncOutputs();
  }

  // Everything that has to agree with the faces but isn't a face: whether
  // this mechanism is showing something it has not saved yet.
  function syncOutputs() {
    const now = valueOf();
    const dirty = now !== committed;
    root.classList.toggle("is-dirty", dirty);
    root.classList.toggle("is-empty", !v);
    if (okBtn) {
      okBtn.disabled = !dirty;
      okBtn.classList.toggle("is-pending", dirty);
      // Said out loud, not only drawn: in the tray nothing saves until SET.
      okBtn.setAttribute("aria-label", dirty ? "Set this date" : "Date saved");
    }
    if (clearBtn) { clearBtn.hidden = !v; clearBtn.disabled = !v; }
    if (dirty) scheduleAutoCommit();
  }

  function valueOf() { return v ? toISO(v.y, v.mo, v.d) : null; }

  // ---- the safety net ----
  // SET is the affirmative act, and in the Calendar's tray it is the ONLY one:
  // putting a date on an unscheduled phase is a decision with a consequence
  // (the phase leaves the tray and lands on the strip), so nothing should do
  // it on your behalf.
  //
  // A date field REPLACING an autosaving input is a different situation. Every
  // other field in those editors saves itself, and a mechanism you can drive
  // by hovering and scrolling — without ever focusing it — has no reliable
  // moment to notice you have wandered off. So those callers pass
  // autoCommitMs, and one op lands a beat after the last tick. That is still
  // one op per intent rather than one per tick, which is what the "no op spam
  // while scrubbing" rule was actually protecting.
  let autoTimer = null;
  function scheduleAutoCommit() {
    if (!autoCommitMs) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = later(() => { if (valueOf() !== committed) commit(); }, autoCommitMs);
  }

  // ONE commit, one op. Nothing before this and nothing after it.
  function commit() {
    queue.length = 0;
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    committed = valueOf();
    syncOutputs();
    if (onCommit) onCommit(committed);
  }

  // Clearing is a single unambiguous act with no intermediate state to scrub
  // through, so it commits on the spot rather than waiting for SET.
  function clear() {
    if (!allowEmpty) return;
    queue.length = 0;
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    v = null;
    committed = null;
    paintAll();
    if (onCommit) onCommit(null);
  }

  paintAll();
  container.appendChild(root);

  return {
    root,
    value: valueOf,
    isDirty: () => valueOf() !== committed,
    // For a caller that is closing: a date scrolled but not SET must never be
    // lost on the way out. editor.js calls this from close(), next to the
    // flushes that already exist there for exactly this reason.
    commitIfDirty() { if (valueOf() !== committed) commit(); },
    setValue(next) {
      const parsed = parseISO(next ?? null);
      v = parsed ? clampDay(parsed) : (allowEmpty ? null : todayValue());
      committed = valueOf();
      paintAll();
    },
    focus() { units.d.focus(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      queue.length = 0;
      if (autoTimer) clearTimeout(autoTimer);
      for (const id of timers) clearTimeout(id);
      timers.clear();
      if (bufferTimer) clearTimeout(bufferTimer);
      for (const [node, type, fn, options] of listeners) node.removeEventListener(type, fn, options);
      listeners.length = 0;
      root.remove();
    },
  };
}
