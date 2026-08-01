// motion.js — the shared motion vocabulary for the Home corner cluster.
// ===================================================================
// The four cluster widgets (pet, weather, tide, train) are meant to read as
// ONE small living world, not four bolted-together demos. The way you get
// that is not shared colors — tokens already handle those — it's shared
// TIMING. A bounce, a station-settle and a tidal breath that all use the same
// spring constants feel like they came from the same place, even when the
// shapes have nothing in common.
//
// So every number that governs "how something moves" lives here, once, and
// every widget imports it. If a motion ever feels wrong, it gets fixed in
// this file and all four widgets change together.
//
// Nothing in here touches the DOM, the store, or the network. It's pure math,
// which also makes it the easiest file in the cluster to reason about.

// ---------------------------------------------------------------
//  THE VOCABULARY
// ---------------------------------------------------------------
// Spring pairs are written as { k, d } — stiffness and damping.
//   higher k  = snappier, arrives sooner
//   higher d  = less overshoot, fewer wobbles
// These are tuned for "calm and satisfying" (§4 of the brief): everything
// overshoots a little, because a motion that stops dead reads as mechanical,
// but nothing oscillates more than about one and a half times.
export const MOTION = {
  // the resting breath every widget shares — one full inhale + exhale
  breathePeriod: 4.6,      // seconds
  breatheAmount: 0.028,    // ±2.8% of size. Deliberately near-subliminal.

  // a quick delighted impulse: the pet's perk, the train's arrival tick
  pop:    { k: 210, d: 15 },
  // a vertical hop — heavier than a pop, settles slower
  lift:   { k: 170, d: 13 },
  // the big one: a completion. Loose and slow so it reads as satisfying
  // rather than sharp.
  squash: { k: 120, d: 11 },
  // light and brightness changes. Very soft — light should never snap.
  glow:   { k: 60,  d: 12 },

  // expanding rings. Speed is a fraction of the widget's radius per second,
  // so a small widget and a large one ripple at the same *apparent* rate.
  rippleSpeed: 0.55,
  rippleLife: 2.1,         // seconds from birth to fully faded

  // how long a thing takes to settle once it arrives somewhere
  settle: 0.55,            // seconds

  // Bursts of activity (a bulk tag across 30 entries fires 30 store changes
  // in a tight loop) get merged into ONE bigger reaction inside this window,
  // rather than 30 stacked animations. See pet.js react().
  coalesceMs: 150,

  // Nothing may react more strongly than this, no matter how many events
  // arrive at once. Keeps a bulk edit exciting instead of alarming.
  maxIntensity: 2.4,
};

// ---------------------------------------------------------------
//  SPRINGS
// ---------------------------------------------------------------
// A plain damped spring, integrated one frame at a time.
//
// Used for impulses: something knocks `x` away from 0, and the spring walks
// it back, overshooting slightly on the way. Call it every frame with the
// real elapsed time and feed the result back in.
//
// Returns a NEW pair rather than mutating, because a widget usually has
// several of these and keeping them as plain numbers on a state object is
// easier to follow than a class.
export function springStep(x, v, target, { k, d }, dt) {
  const a = -k * (x - target) - d * v;
  const nv = v + a * dt;
  return [x + nv * dt, nv];
}

// Ease a value toward a target at a rate that's independent of frame rate.
// Good for slow, non-springy things — the neglect droop, a fading glow.
// `rate` is roughly "how much of the remaining gap to close per second".
export function approach(x, target, rate, dt) {
  return x + (target - x) * (1 - Math.exp(-rate * dt));
}

// ---------------------------------------------------------------
//  EASINGS
// ---------------------------------------------------------------
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
// A little overshoot at the end — the "settle-in" feel.
export function easeOutBack(t, amount = 1.4) {
  const c3 = amount + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + amount * Math.pow(t - 1, 2);
}
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ---------------------------------------------------------------
//  SEEDED RANDOMNESS
// ---------------------------------------------------------------
// The pet is meant to be subtly different every day but the SAME all day —
// "same creature, new mood", not a different creature every repaint. That
// means the randomness has to come from the date, not from Math.random().
//
// mulberry32 is a tiny, fast, well-behaved PRNG. Seed it with a number and
// it produces the same sequence forever, which is exactly what we want.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Today's date as a stable seed. Local date on purpose: the pet should change
// when YOUR day changes, not at some UTC hour in the middle of the evening.
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dailyRandom(salt = "") {
  return mulberry32(hashString(todayKey() + "|" + salt));
}

// ---------------------------------------------------------------
//  REDUCED MOTION
// ---------------------------------------------------------------
// tokens.css already zeroes --transition under prefers-reduced-motion. A
// canvas animation can't be switched off by CSS, so the widgets have to ask
// directly and hold a still pose instead of running a loop.
//
// This returns a live object, not a boolean, because the setting can change
// mid-session (someone turns it on in System Settings while Dash is open).
const rmQuery = typeof matchMedia === "function"
  ? matchMedia("(prefers-reduced-motion: reduce)")
  : null;

export function prefersReducedMotion() {
  return !!(rmQuery && rmQuery.matches);
}
export function onReducedMotionChange(fn) {
  if (!rmQuery || !rmQuery.addEventListener) return () => {};
  rmQuery.addEventListener("change", fn);
  return () => rmQuery.removeEventListener("change", fn);
}

// ---------------------------------------------------------------
//  THEME COLOR READING
// ---------------------------------------------------------------
// Widgets draw on canvas, where CSS custom properties don't reach. The rule
// (§10, and non-negotiable #2) is still "tokens only" — so instead of writing
// literal colors, a widget RESOLVES a token to its current value at draw time
// and uses that. Swap the theme and the next read returns the new value, so a
// full re-theme still works with no widget code changed.
export function readToken(name, fallback = "#000000") {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

// Turn whatever the browser hands back for a token ("#b23a14", "rgb(178,58,20)")
// into {r,g,b} so canvas can blend and fade it.
export function toRGB(color) {
  const c = String(color).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(c);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return { r: 0, g: 0, b: 0 };
}

export function mixRGB(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

export function rgba({ r, g, b }, alpha = 1) {
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}
