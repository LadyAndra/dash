// shapes.js — the pet's silhouettes.
// ==================================
// Dash's pet has ONE signature form: a round body on two legs. That's the
// creature. It is not a shapeshifter — an earlier version rotated through six
// forms and the result was worse, not better: at the size this actually
// renders, a heart, a blob and a puddle all read as "dark round thing", so
// the variety was theoretical while the identity was gone.
//
// So there are exactly three transformations, all rare and all earned:
//
//   burst    you marked something done
//   heart    you hit a capture-streak milestone
//   puddle   it's been ignored for days and has melted
//
// Everything else — every mood, every reaction, every hour of the day — is
// carried by the eyes and by clean deformation of the round body (see pet.js).
//
// The trick that makes the three transformations cheap: every form is stored
// the same way, as a ring of radii measured from the middle at evenly spaced
// angles. Once a blob and a burst are both "48 numbers", morphing between
// them is interpolating 48 pairs of numbers. No path matching, no library.
//
// Nothing here draws. It has no idea about canvas, tokens or the DOM.

// How many points go around the outline.
//
// 48, and the number is not arbitrary. `burst` uses cos(3θ), which puts a
// point every 60° and a notch every 60° offset by 30°. Those notches are
// narrow cusps — the radius climbs steeply out of them — so if the samples
// don't land ON a notch it's simply missed and the burst renders as a lumpy
// circle. 48 divides 360° into 7.5° steps, hitting every point and every
// notch exactly. Don't lower it without re-checking `burst`.
export const POINTS = 48;

const SAMPLES = 720;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------
//  AUTHORED OUTLINES
// ---------------------------------------------------------------
// Functions of t (0–1, once around) returning a point. Scale is irrelevant —
// everything is normalized to a maximum radius of 1 afterwards.
const OUTLINES = {
  // THE signature form. A true circle: the character's irregularity comes
  // from its eyes, its stance and how it deforms — never from a noisy edge.
  blob: (t) => ({ x: Math.cos(t * TAU), y: Math.sin(t * TAU) }),

  // Six sharp points. Maximally unlike a calm circle, which is the entire
  // reason it's the "you finished something" shape.
  burst: (t) => {
    const a = t * TAU;
    const r = 0.42 + 0.58 * Math.pow(Math.abs(Math.cos(3 * a)), 2.4);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  },

  // The classic parametric heart, flipped for canvas (y grows downward).
  heart: (t) => {
    const a = t * TAU;
    return {
      x: 16 * Math.pow(Math.sin(a), 3) / 17,
      y: -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17,
    };
  },

  // Melted. Domed on top, spread wide, flat along the bottom — the way
  // something soft goes when it's been sitting untouched for a week.
  puddle: (t) => {
    const a = t * TAU;
    const s = Math.sin(a);
    return { x: Math.cos(a) * 1.30, y: s < 0 ? s * 0.52 : s * 0.26 };
  },
};

// ---------------------------------------------------------------
//  CONVERSION TO A RADIUS RING
// ---------------------------------------------------------------
// Walk the authored outline, find its middle, then record how far the edge
// sits from that middle at each of our angles. Valid because all four forms
// are "star-shaped" about their centre — every outward ray crosses the edge
// exactly once. (The heart's cleft is the only near-miss, and any tiny
// artefact there reads as intentional.)
function polarize(outline) {
  const pts = [];
  for (let i = 0; i < SAMPLES; i++) pts.push(outline(i / SAMPLES));

  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= SAMPLES; cy /= SAMPLES;

  const samples = pts.map(p => {
    const dx = p.x - cx, dy = p.y - cy;
    return { a: Math.atan2(dy, dx), r: Math.hypot(dx, dy) };
  });

  const out = new Float64Array(POINTS);
  for (let i = 0; i < POINTS; i++) {
    const target = (i / POINTS) * TAU;
    let bestD = Infinity, r = 0;
    for (const s of samples) {
      let d = Math.abs(s.a - target);
      if (d > Math.PI) d = TAU - d;               // angles wrap
      if (d < bestD) { bestD = d; r = s.r; }
    }
    out[i] = r;
  }

  let max = 0;
  for (const v of out) max = Math.max(max, v);
  for (let i = 0; i < POINTS; i++) out[i] /= max;
  return out;
}

// ---------------------------------------------------------------
//  THE FORM TABLE
// ---------------------------------------------------------------
// Eye geometry is in fractions of the body's RADIUS, and the numbers are much
// larger than they look. In the reference images the two eyes together span
// most of the creature's width — they are the character. At the size this
// widget actually renders, small eyes cannot hold a readable expression, so
// they're sized to nearly touch each other and nearly reach the edges.
//
//   gap   distance from centre to each eye's centre
//   y     vertical offset (negative is up)
//   w/h   eye size
//   lift  how much the OUTER corner sits above the inner one. Positive reads
//         cool and level; pet.js drives it negative for a sad, worried look.
//   legs  does this form stand on legs? Only the signature form does — the
//         transformations are all momentary or melted.
export const SHAPES = {
  blob: {
    ring: polarize(OUTLINES.blob), legs: true,
    eyes: { count: 2, gap: 0.46, y: -0.06, w: 0.78, h: 0.52, lift: 0.10 },
  },
  burst: {
    ring: polarize(OUTLINES.burst), legs: false,
    eyes: { count: 2, gap: 0.34, y: -0.02, w: 0.56, h: 0.46, lift: 0.06 },
  },
  heart: {
    ring: polarize(OUTLINES.heart), legs: false,
    eyes: { count: 2, gap: 0.42, y: 0.02, w: 0.66, h: 0.50, lift: 0.12 },
  },
  puddle: {
    ring: polarize(OUTLINES.puddle), legs: false,
    eyes: { count: 2, gap: 0.40, y: 0.06, w: 0.62, h: 0.34, lift: -0.08 },
  },
};

export const SHAPE_NAMES = Object.keys(SHAPES);

// Blend two forms. `t` of 0 is all `from`, 1 is all `to`. The eyes and the
// legs blend too, so a body becoming a burst also slides its eyes into place
// and retracts its legs on the way, rather than snapping at the end.
export function blendShape(from, to, t, out) {
  const A = SHAPES[from], B = SHAPES[to];
  for (let i = 0; i < POINTS; i++) out[i] = A.ring[i] + (B.ring[i] - A.ring[i]) * t;
  const L = (a, b) => a + (b - a) * t;
  return {
    ring: out,
    legs: L(A.legs ? 1 : 0, B.legs ? 1 : 0),
    eyes: {
      count: 2,
      gap:  L(A.eyes.gap,  B.eyes.gap),
      y:    L(A.eyes.y,    B.eyes.y),
      w:    L(A.eyes.w,    B.eyes.w),
      h:    L(A.eyes.h,    B.eyes.h),
      lift: L(A.eyes.lift, B.eyes.lift),
    },
  };
}
