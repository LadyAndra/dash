// pet.js — Dash's pet.
// ====================
// A round near-black body on two legs, with two very large eyes. One creature,
// always recognisable. It doesn't change into different things to show you how
// it feels — it shows you with its eyes and with how its body holds itself,
// and it transforms only three times: a burst when you finish something, a
// heart at a streak milestone, and a slow melt into a puddle if you ignore it.
//
// Two decisions drive everything here, and both came from looking at what
// didn't work first:
//
//   1. The edge is CLEAN. An earlier version jittered all 48 outline points
//      to look hand-made; per-point randomness is high-frequency noise, and it
//      just read as lumpy. With a clean edge, every deviation you see in the
//      silhouette is meaning rather than texture.
//
//   2. The eyes are HUGE — together they span most of the body, as they do in
//      the reference images. Expression is the whole job at this size, and
//      small eyes cannot do it. They aren't drawn from a set of fixed faces
//      either: six expressions are defined as numbers and blended, so the
//      character can be halfway between sleepy and sad, which is where most
//      real feeling actually sits.
//
// Drawn in --text-primary, never --ember: tokens.css reserves ember as an
// indicator (overdue, stale, sync trouble) and explicitly not decoration.
// Near-black is a *material* in the specimen-archive system, which is what a
// cut-paper character is. On the dark theme that token is warm cream, so the
// creature inverts to a cream silhouette for free.
//
// Knowledge comes from data that already exists: neglect from `touched` dates,
// reactions from the store's ambient action channel, which logs and syncs
// nothing. Shapes live in shapes.js; timing lives in motion.js, shared with
// the three widgets still to come.

import {
  MOTION, springStep, approach, clamp, easeOutCubic,
  dailyRandom, todayKey, prefersReducedMotion, onReducedMotionChange,
  readToken, toRGB, rgba,
} from "./motion.js";
import { POINTS, SHAPES, blendShape } from "./shapes.js";

const LS_STREAK = "dash.pet.streak";
const LS_LASTOPEN = "dash.pet.lastOpen";

const DROOP_START_DAYS = 2;
const DROOP_FULL_DAYS = 10;
const WAKE_GAP_HOURS = 6;
const STREAK_MILESTONES = [2, 3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 365];

const HOLD = { burst: 1500, heart: 2800 };

// ---------------------------------------------------------------
//  EXPRESSIONS
// ---------------------------------------------------------------
// An eye is an almond: an upper lid curving over and a lower lid curving
// back. Everything expressive comes from four numbers, so any two
// expressions can be blended into each other continuously.
//
//   up     how high the upper lid arcs. Low = a heavy, sleepy lid.
//   lo     how low the lower lid dips. NEGATIVE pushes it up past the middle,
//          which turns the eye into an upward crescent — that's the "happy"
//          face, and it's reachable by sliding one number rather than by
//          swapping to a different drawing.
//   pupil  pupil size, relative.
//   lift   extra outer-corner raise. Negative drops the outer corners and
//          raises the inner ones, which is what reads as worried or sad.
const EXPR = {
  neutral: { up: 1.25, lo: 0.95, pupil: 1.00, lift: 0.00 },
  wide:    { up: 1.60, lo: 1.20, pupil: 1.18, lift: 0.02 },
  happy:   { up: 1.15, lo: -0.55, pupil: 1.00, lift: 0.06 },
  sleepy:  { up: 0.34, lo: 0.72, pupil: 0.92, lift: -0.02 },
  sad:     { up: 0.80, lo: 0.90, pupil: 0.78, lift: -0.30 },
  squint:  { up: 0.44, lo: 0.44, pupil: 0.86, lift: 0.14 },
};

export function createPetWidget({ store }) {
  return { key: "pet", label: "Dash pet", scale: 1, mount: (frame) => mountPet(frame, store) };
}

function mountPet(frame, store) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");   // decorative; the frame carries the label
  canvas.className = "pet-canvas";
  frame.appendChild(canvas);
  const g = canvas.getContext("2d");

  let day = todayKey();
  let look = makeDailyLook(day);

  // -------------------------------------------------------------
  //  STATE
  // -------------------------------------------------------------
  const s = {
    t: 0,
    pop: 0, popV: 0,
    hop: 0, hopV: 0,
    squash: 0, squashV: 0,
    spin: 0, spinV: 0,
    droop: 0, droopTarget: 0,
    wake: 0,
    sway: 0,

    // form
    from: "blob", to: "blob", morph: 1, holdUntil: 0,

    // expression: a live blend, plus a temporary override that decays
    face: { ...EXPR.neutral },
    flash: null, flashLeft: 0,   // a short-lived expression laid over the mood

    blink: 0, nextBlink: 3,
    wink: 0,
    gazeX: 0, gazeY: 0, gazeTX: 0, gazeTY: 0, nextGaze: 2,

    // how stirred up it is right now — decays over ~20s and feeds the
    // silhouette's tension. Rises when you're actively working in Dash.
    buzz: 0,

    ticks: [],
    friend: null,
  };

  const ring = new Float64Array(POINTS);
  const recent = new Map();

  // -------------------------------------------------------------
  //  SIZING
  // -------------------------------------------------------------
  let W = 0, H = 0, dpr = 1;
  function resize() {
    const r = frame.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (still) draw();
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  ro?.observe(frame);

  // -------------------------------------------------------------
  //  COLOR — two tokens, read live so a re-theme is free
  // -------------------------------------------------------------
  let body = null, paper = null, colorsAt = 0;
  function colors(now) {
    if (body && now - colorsAt < 1000) return;
    colorsAt = now;
    body = toRGB(readToken("--text-primary", "#1c1a14"));
    paper = toRGB(readToken("--surface", "#f2ece0"));
  }
  const themeObserver = new MutationObserver(() => { body = null; if (still) draw(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });

  // -------------------------------------------------------------
  //  NEGLECT
  // -------------------------------------------------------------
  function refreshDroop() {
    let newest = null;
    for (const it of store.all()) {
      const iso = it.dates?.touched || it.dates?.modified;
      if (!iso) continue;
      const t = Date.parse(iso);
      if (!isNaN(t) && (newest === null || t > newest)) newest = t;
    }
    if (newest === null) { s.droopTarget = 0; return; }
    const days = (Date.now() - newest) / 86400000;
    s.droopTarget = clamp((days - DROOP_START_DAYS) / (DROOP_FULL_DAYS - DROOP_START_DAYS), 0, 1);
  }
  // Coalesced for the same reason app.js coalesces renders: a bulk edit emits
  // one store change per item, and re-scanning the archive 30 times in a row
  // costs real milliseconds for an answer that cannot have changed.
  let droopQueued = false;
  function queueDroop() {
    if (droopQueued) return;
    droopQueued = true;
    requestAnimationFrame(() => { droopQueued = false; refreshDroop(); });
  }
  refreshDroop();
  const unsubscribe = store.subscribe(queueDroop);
  const droopTimer = setInterval(refreshDroop, 60000);

  // -------------------------------------------------------------
  //  MOOD  ->  RESTING EXPRESSION
  // -------------------------------------------------------------
  // The face it settles back to when nothing is happening. Read top to bottom;
  // the first condition that matches wins. This table is meant to be edited by
  // eye — it's the character's whole temperament in eight lines.
  function restingFace() {
    if (s.droop > 0.75) return EXPR.sleepy;          // long gone: given up waiting
    if (s.droop > 0.35) return EXPR.sad;             // a few days: visibly missing you
    const h = new Date().getHours();
    if (h >= 23 || h < 5) return EXPR.sleepy;        // small hours
    if (h >= 21) return blendExpr(EXPR.neutral, EXPR.sleepy, 0.45);   // winding down
    if (s.buzz > 0.55) return EXPR.happy;            // you've been busy: pleased
    if (s.buzz > 0.2) return EXPR.wide;              // something's going on
    return EXPR.neutral;
  }

  function restingShape() { return s.droop > 0.6 ? "puddle" : "blob"; }

  function setShape(name, holdMs = 0) {
    if (name === s.to) { if (holdMs) s.holdUntil = performance.now() + holdMs; return; }
    // Freeze the nearest real form as the new start, so interrupting a morph
    // never snaps.
    s.from = s.morph < 1 ? (s.morph < 0.5 ? s.from : s.to) : s.to;
    s.to = name;
    s.morph = 0;
    s.holdUntil = holdMs ? performance.now() + holdMs : 0;
  }

  // Lay an expression over the mood for a moment — a flash of surprise that
  // fades back to whatever it was feeling underneath.
  function flash(expr, seconds) { s.flash = expr; s.flashLeft = seconds; s.flashFull = seconds; }

  // -------------------------------------------------------------
  //  REACTIONS  (the action -> reaction map)
  // -------------------------------------------------------------
  function react(kind) {
    const now = performance.now();
    const prev = recent.get(kind);
    let i = 1;
    // A bulk edit across 30 entries fires 30 store changes in a tight loop.
    // Merging them into ONE larger reaction is calmer to look at and more
    // truthful — 30 tags at once genuinely is a bigger event than one tag.
    if (prev && now - prev.at < MOTION.coalesceMs) {
      i = Math.min(MOTION.maxIntensity - prev.intensity, 0.25);
      recent.set(kind, { at: now, intensity: prev.intensity + i });
      if (i <= 0) return;
    } else {
      recent.set(kind, { at: now, intensity: 1 });
    }

    s.buzz = clamp(s.buzz + 0.30 * i, 0, 1);

    switch (kind) {
      case "create":                         // a new entry: jumps, eyes go wide
        s.hopV -= 3.2 * i; s.popV += 2.2 * i;
        flash(EXPR.wide, 1.1); lookAt(0, -0.6);
        addTicks(3, -Math.PI / 2, 0.9);
        break;

      case "tag":
      case "link":
        s.popV += 1.4 * i;
        flash(EXPR.squint, 0.5); lookAt(-0.7, 0.1);
        addTicks(2, Math.PI, 0.5);
        break;

      case "attach":
        s.hopV -= 1.7 * i;
        flash(EXPR.wide, 0.8); lookAt(0, 0.6);
        break;

      case "done":                           // the big one
        setShape("burst", HOLD.burst);
        s.squashV += 3.0 * i; s.popV += 2.2 * i;
        flash(EXPR.happy, 2.2); lookAt(0, 0);
        addTicks(7, 0, 1.3);
        break;

      case "wake":                           // opening Dash after a gap
        s.wake = 1; s.hopV -= 2.4; s.blink = 1;
        flash(EXPR.wide, 1.6);
        break;

      case "streak":                         // a capture-streak milestone
        setShape("heart", HOLD.heart);
        s.squashV += 1.6;
        flash(EXPR.happy, 3.2);
        addTicks(6, -Math.PI / 2, 1.1);
        break;

      default:
        s.popV += 0.5 * i;
        lookAt((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8);
    }

    maybeEasterEgg(kind);
    if (still) draw();
  }

  function lookAt(x, y) { s.gazeTX = clamp(x, -1, 1); s.gazeTY = clamp(y, -1, 1); s.nextGaze = 1.2 + Math.random() * 2; }

  function addTicks(n, around, len) {
    for (let k = 0; k < n; k++) {
      const spread = n === 1 ? 0 : (k / (n - 1) - 0.5) * (n > 4 ? Math.PI * 1.9 : Math.PI * 0.7);
      s.ticks.push({ a: around + spread, r: 1.04, len: len * (0.7 + Math.random() * 0.5), life: 1 });
    }
  }

  // -------------------------------------------------------------
  //  EASTER EGGS — the surprise layer
  // -------------------------------------------------------------
  // The reactions above are dependable on purpose: you should be able to learn
  // what the pet does. These are rare and genuinely random — a surprise you
  // can predict isn't one.
  function maybeEasterEgg() {
    const hour = new Date().getHours();
    if ((hour >= 23 || hour < 4) && Math.random() < 0.10) {   // a small-hours yawn
      s.blink = 1; s.squashV -= 1.4; flash(EXPR.sleepy, 1.8);
      return;
    }
    const roll = Math.random();
    if (roll < 0.012) s.spinV += 12;                          // a full turn
    else if (roll < 0.028) s.wink = 1;                        // one eye, briefly
    else if (roll < 0.040) s.friend = { life: 1, side: Math.random() < 0.5 ? -1 : 1 };
  }

  // -------------------------------------------------------------
  //  GREETINGS
  // -------------------------------------------------------------
  const gapMs = Date.now() - (Number(localStorage.getItem(LS_LASTOPEN)) || Date.now());
  try { localStorage.setItem(LS_LASTOPEN, String(Date.now())); } catch {}
  const returning = gapMs > WAKE_GAP_HOURS * 3600000;
  if (returning) setTimeout(() => react("wake"), 700);

  const streak = bumpStreak();
  if (streak.fresh && STREAK_MILESTONES.includes(streak.count)) {
    setTimeout(() => react("streak"), returning ? 2600 : 900);
  }

  // -------------------------------------------------------------
  //  LOOP
  // -------------------------------------------------------------
  let still = prefersReducedMotion();
  let active = false, raf = 0, last = 0;

  const stopRM = onReducedMotionChange(() => {
    still = prefersReducedMotion();
    if (still) { cancelAnimationFrame(raf); raf = 0; draw(); }
    else if (active) start();
  });

  function start() {
    if (raf || still || !active || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function tick(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);  // clamped: a backgrounded tab must not fling the springs
    last = now;
    step(dt, now);
    draw();
    start();
  }
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener("visibilitychange", onVisibility);

  // -------------------------------------------------------------
  //  PHYSICS
  // -------------------------------------------------------------
  function step(dt, now) {
    s.t += dt;

    const k = todayKey();
    if (k !== day) { day = k; look = makeDailyLook(day); }   // rolls over at midnight, no reload

    [s.pop, s.popV] = springStep(s.pop, s.popV, 0, MOTION.pop, dt);
    [s.hop, s.hopV] = springStep(s.hop, s.hopV, 0, MOTION.lift, dt);
    [s.squash, s.squashV] = springStep(s.squash, s.squashV, 0, MOTION.squash, dt);

    s.spinV *= Math.exp(-2.2 * dt);
    s.spin += s.spinV * dt;
    if (Math.abs(s.spinV) < 0.02) {
      s.spinV = 0;
      s.spin = approach(s.spin, Math.round(s.spin / (Math.PI * 2)) * Math.PI * 2, 6, dt);
    }

    s.droop = approach(s.droop, s.droopTarget, 0.6, dt);
    if (s.wake > 0) s.wake = Math.max(0, s.wake - dt / 1.6);
    s.buzz = Math.max(0, s.buzz - dt / 20);
    s.sway = Math.sin(s.t * 0.42) * 0.5 + Math.sin(s.t * 0.27 + 1.1) * 0.5;

    // ---- form ----
    if (s.morph < 1) s.morph = Math.min(1, s.morph + dt / 0.8);
    const temporary = s.holdUntil > 0;
    if (temporary && now >= s.holdUntil) { s.holdUntil = 0; setShape(restingShape()); }
    if (!temporary && s.morph >= 1) {
      const want = restingShape();
      if (want !== s.to) setShape(want);
    }

    // ---- expression ----
    // The mood underneath, plus any flash laid over it, eased into the face
    // that's actually drawn. Easing rather than switching is what lets it be
    // halfway between two feelings.
    let target = restingFace();
    if (s.flashLeft > 0) {
      s.flashLeft = Math.max(0, s.flashLeft - dt);
      const strength = easeOutCubic(clamp(s.flashLeft / (s.flashFull * 0.7), 0, 1));
      target = blendExpr(target, s.flash, strength);
    }
    for (const key of ["up", "lo", "pupil", "lift"]) {
      s.face[key] = approach(s.face[key], target[key], 7, dt);
    }

    s.nextBlink -= dt;
    if (s.nextBlink <= 0) { s.blink = 1; s.nextBlink = 2.5 + Math.random() * 5.5; }
    if (s.blink > 0) s.blink = Math.max(0, s.blink - dt / 0.16);
    if (s.wink > 0) s.wink = Math.max(0, s.wink - dt / 0.5);

    s.nextGaze -= dt;
    if (s.nextGaze <= 0) {
      s.gazeTX = (Math.random() - 0.5) * 1.5;
      s.gazeTY = (Math.random() - 0.5) * 1.0;
      s.nextGaze = 1.5 + Math.random() * 4;
    }
    s.gazeX = approach(s.gazeX, s.gazeTX, 4.5, dt);
    s.gazeY = approach(s.gazeY, s.gazeTY, 4.5, dt);

    for (const m of s.ticks) { m.r += 0.75 * dt; m.life -= dt / 0.85; }
    s.ticks = s.ticks.filter(m => m.life > 0);
    if (s.friend) { s.friend.life -= dt / 2.6; if (s.friend.life <= 0) s.friend = null; }
  }

  // -------------------------------------------------------------
  //  DRAWING
  // -------------------------------------------------------------
  function draw() {
    if (!W || !H) return;
    const now = performance.now();
    colors(now);
    g.clearRect(0, 0, W, H);

    const size = Math.min(W, H);
    const form = blendShape(s.from, s.to, easeOutCubic(s.morph), ring);

    const droop = Math.max(0, s.droop - s.wake);
    const breath = Math.sin((s.t / MOTION.breathePeriod) * Math.PI * 2) * MOTION.breatheAmount;

    const legLen = size * 0.19 * form.legs * (1 - droop * 0.8);
    const bodyR = size * 0.285 * look.build * (1 - 0.09 * form.legs);
    const cx = W / 2 + s.sway * size * 0.010;
    const cy = H / 2 - legLen * 0.52 + size * (0.05 * droop) + s.hop * size * 0.15;

    const sc = 1 + breath + s.pop * 0.10 + (s.wake > 0 ? s.wake * 0.08 : 0);
    // Tension: when it's been busy it stands a touch taller and narrower;
    // when neglected it settles wider and lower. Clean, low-frequency, and
    // the only silhouette change other than the three transformations.
    const tension = s.buzz * 0.05 - droop * 0.08;
    const sx = sc * (1 + s.squash * 0.14) * (1 - tension * 0.6);
    const sy = sc * (1 - s.squash * 0.11) * (1 + tension) * (1 - 0.10 * droop);

    const fill = rgba(body, 1);

    if (form.legs > 0.02 && legLen > 1) drawLegs(cx, cy, bodyR * sy, legLen, size, fill, droop);

    g.save();
    g.translate(cx, cy);
    if (s.spin) g.rotate(s.spin);
    g.beginPath();
    traceBody(form.ring, bodyR * sx, bodyR * sy, droop);
    g.fillStyle = fill;
    g.fill();
    drawEyes(form.eyes, bodyR, droop);
    g.restore();

    for (const m of s.ticks) {
      const r0 = bodyR * m.r, r1 = r0 + size * 0.055 * m.len * m.life;
      g.beginPath();
      g.moveTo(cx + Math.cos(m.a) * r0, cy + Math.sin(m.a) * r0);
      g.lineTo(cx + Math.cos(m.a) * r1, cy + Math.sin(m.a) * r1);
      g.lineWidth = Math.max(1.5, size * 0.018 * m.life);
      g.lineCap = "round";
      g.strokeStyle = rgba(body, m.life);
      g.stroke();
    }

    if (s.friend) {
      const fr = bodyR * 0.24 * Math.min(1, s.friend.life * 2);
      g.beginPath();
      traceBody(SHAPES.blob.ring, fr, fr, 0, cx + s.friend.side * bodyR * 1.5, cy + bodyR * 0.6);
      g.fillStyle = rgba(body, Math.min(1, s.friend.life * 1.6));
      g.fill();
    }
  }

  // The outline. No noise of any kind — a clean shape, so anything you notice
  // in it means something. `sag` is the one deformation: a tired creature
  // carries its weight low, so the lower half swells slightly and the upper
  // half flattens. Drawn with midpoints as anchors and the ring points as
  // control handles, which turns 48 points into a genuinely smooth curve.
  function traceBody(r, rx, ry, sag, ox = 0, oy = 0) {
    const pts = [];
    for (let i = 0; i < POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2;
      const heavy = 1 + sag * 0.13 * Math.sin(a);       // sin > 0 is downward in canvas
      pts.push({ x: ox + Math.cos(a) * rx * heavy, y: oy + Math.sin(a) * ry * heavy });
    }
    const first = pts[POINTS - 1], second = pts[0];
    g.moveTo((first.x + second.x) / 2, (first.y + second.y) / 2);
    for (let i = 0; i < POINTS; i++) {
      const cur = pts[i], next = pts[(i + 1) % POINTS];
      g.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
    }
    g.closePath();
  }

  // Two big almond eyes knocked out of the body, each with a large pupil that
  // slides around inside. Shape comes entirely from the blended expression, so
  // there are no discrete "faces" — it can be part sleepy and part sad.
  function drawEyes(e, bodyR, droop) {
    const f = s.face;
    const openness = clamp(1 - s.blink, 0, 1);
    if (openness <= 0.02) { drawClosedEyes(e, bodyR, f); return; }

    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1;
      const winking = s.wink > 0 && k === 0;
      const open = openness * (winking ? 1 - s.wink : 1);
      if (open <= 0.02) { drawLid(e, bodyR, side, f); continue; }

      const ew = e.w * bodyR * 0.5;                 // half-width
      const eh = e.h * bodyR * 0.5 * open;
      // Outer corner lift. Positive raises the OUTER end, which reads cool and
      // level; negative raises the inner ends, which reads worried.
      const rotation = -(e.lift + f.lift) * side;

      g.save();
      g.translate(side * e.gap * bodyR, e.y * bodyR);
      g.rotate(rotation);

      g.beginPath();
      g.moveTo(-ew, 0);
      g.quadraticCurveTo(-ew * 0.30, -eh * f.up * 1.9, ew, -eh * 0.10);
      g.quadraticCurveTo(ew * 0.10, eh * f.lo * 1.7, -ew, 0);
      g.closePath();
      g.fillStyle = rgba(paper, 1);
      g.fill();

      // The pupil is clipped to the white, so it can look right to the edge
      // without ever spilling out onto the body.
      g.clip();
      const pr = Math.max(0.7, Math.min(ew * 0.46, eh * 0.95) * f.pupil);
      g.beginPath();
      g.arc(s.gazeX * ew * 0.30 + ew * 0.08, s.gazeY * eh * 0.45 - eh * 0.12 + droop * eh * 0.25, pr, 0, Math.PI * 2);
      g.fillStyle = rgba(body, 1);
      g.fill();
      g.restore();
    }
  }

  // A shut eye is a line, not an absence — without it the character briefly
  // has no face at all, which reads as a rendering glitch rather than a blink.
  function drawClosedEyes(e, bodyR, f) {
    for (let k = 0; k < 2; k++) drawLid(e, bodyR, k === 0 ? -1 : 1, f);
  }
  function drawLid(e, bodyR, side, f) {
    const ew = e.w * bodyR * 0.5;
    g.save();
    g.translate(side * e.gap * bodyR, e.y * bodyR);
    g.rotate(-(e.lift + f.lift) * side);
    g.beginPath();
    g.lineWidth = Math.max(1.5, e.h * bodyR * 0.13);
    g.lineCap = "round";
    g.strokeStyle = rgba(paper, 1);
    g.moveTo(-ew * 0.9, 0);
    g.quadraticCurveTo(0, e.h * bodyR * 0.10, ew * 0.9, 0);
    g.stroke();
    g.restore();
  }

  // Two legs with a small foot each. Not quite parallel, not quite straight —
  // the daily stance is the one place a little asymmetry survives, since the
  // body itself is now perfectly clean. They compress on a hop and buckle
  // inward as the creature droops.
  function drawLegs(cx, cy, bodyBottom, legLen, size, fill, droop) {
    const len = legLen * (1 + s.hop * 0.5);
    const w = size * 0.040;
    const top = cy + bodyBottom * 0.70;
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1;
      const lean = look.legLean[k];
      const lx = cx + side * size * 0.070 + lean * size * 0.010;
      const sway = s.sway * size * 0.008 * side;
      const buckle = droop * size * 0.020 * side;    // knees go outward as it sags
      const footY = top + len;
      g.beginPath();
      g.lineWidth = w;
      g.lineCap = "butt";
      g.strokeStyle = fill;
      g.moveTo(lx, top);
      g.quadraticCurveTo(lx + sway + buckle + lean * size * 0.008, top + len * 0.55, lx + sway, footY);
      g.stroke();
      g.beginPath();
      g.lineWidth = w * 0.92;
      g.lineCap = "round";
      g.moveTo(lx + sway, footY - w * 0.1);
      g.lineTo(lx + sway + side * size * 0.050, footY - w * 0.1);
      g.stroke();
    }
  }

  // -------------------------------------------------------------
  resize();
  setShape(restingShape());
  s.morph = 1;
  s.face = { ...restingFace() };
  draw();

  return {
    setActive(on) {
      active = on;
      if (on) { resize(); refreshDroop(); start(); if (still) draw(); }
      else stop();
    },
    action: react,
    destroy() {
      stop();
      ro?.disconnect();
      themeObserver.disconnect();
      clearInterval(droopTimer);
      unsubscribe();
      stopRM();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
    },
  };
}

function blendExpr(a, b, t) {
  return {
    up: a.up + (b.up - a.up) * t,
    lo: a.lo + (b.lo - a.lo) * t,
    pupil: a.pupil + (b.pupil - a.pupil) * t,
    lift: a.lift + (b.lift - a.lift) * t,
  };
}

// ---------------------------------------------------------------
//  TODAY'S LOOK
// ---------------------------------------------------------------
// Seeded from the date, so the same day gives the same creature on every
// device and tomorrow gives a slightly different one. With a clean silhouette
// the variation lives in its build and its stance rather than in its edge —
// today it's a little rounder and stands a little wider, tomorrow it doesn't.
function makeDailyLook(dayKey) {
  const rnd = dailyRandom(dayKey);
  return {
    build: 0.95 + rnd() * 0.10,                       // slightly bigger or smaller
    legLean: [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2],  // its stance for the day
  };
}

// ---------------------------------------------------------------
//  CAPTURE STREAK
// ---------------------------------------------------------------
// Consecutive days Dash was opened. Per device and unsynced on purpose: it's
// a nudge, not a record, and merging streaks across devices is a bigger
// question than it's worth answering now.
function bumpStreak() {
  let saved = { day: null, count: 0 };
  try { saved = JSON.parse(localStorage.getItem(LS_STREAK) || "null") || saved; } catch {}
  const today = todayKey();
  if (saved.day === today) return { count: saved.count, fresh: false };
  const y = new Date(); y.setDate(y.getDate() - 1);
  const next = { day: today, count: saved.day === todayKey(y) ? saved.count + 1 : 1 };
  try { localStorage.setItem(LS_STREAK, JSON.stringify(next)); } catch {}
  return { count: next.count, fresh: true };
}
