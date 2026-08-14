// desk.js — the pure rules of the Desk (desk addendum §12, Phase D1).
// ===================================================================
// Deliberately DOM-free and store-free, exactly like js/milestones.js:
// everything in here is a plain function over plain objects, and this file
// IMPORTS NOTHING. That buys two things.
//
//   1. store.js can import from it without a circular import.
//   2. It can be tested headlessly with no stubbing whatsoever — which is how
//      the merge and geometry rules got tested before any of this was drawn.
//
// One deviation from the addendum worth naming: §12.6 sketched the scanner as
// `deskData(store, projectId)`. It is `deskData(items, projectId, linkLabel)`
// here — a pure function over an ARRAY of items. The substance is unchanged
// (ONE pass over the archive, and this is the only thing that walks it), but
// it means the scanner can be tested with three plain objects instead of a
// fake store, and it keeps this file's "imports nothing" promise. The caller
// does `deskData(store.all(), pid, PROJECT_LINK)` — one call to all(), once
// per render.
//
// A desk record is a sub-record of an ENTRY, keyed by project (§12.1):
//
//   item.viewState["desk:<projectId>"] = { pos, z, clip, removed, created }
//
//   pos      {x, y} in the desk's own logical pixels. One field, not two:
//            a card is never half-way between two dropped positions.
//   z        integer. Touch or drop sets desk-max + 1; ties break by entry id.
//   clip     a clip's id, or null. Phase D2 — nothing reads it yet.
//   removed  tombstone. Un-placing keeps the position, so restoring puts the
//            card back where it was rather than somewhere new.
//   created  ISO timestamp of first placement.
//
// "Missing viewState means never placed, everywhere, always." Every reader
// here honours that, so no entry ever needs a backfill.

// ===================================================================
//  THE KEY
// ===================================================================
// The namespace is what stops two desks contesting: the same entry placed on
// Project A and on Project B writes two different keys, so there is nothing to
// merge between them. Future spatial views (a corkboard proper, roadmap
// nudges) get merge-safe layout for free by picking another prefix.
export const DESK_KEY_PREFIX = "desk:";
export function deskKey(projectId) { return DESK_KEY_PREFIX + projectId; }
export function projectIdFromDeskKey(key) {
  return (typeof key === "string" && key.startsWith(DESK_KEY_PREFIX))
    ? key.slice(DESK_KEY_PREFIX.length)
    : null;
}

// ===================================================================
//  THE CONSTANTS  (locked in the D0 mockup rounds — addendum §14.7)
// ===================================================================
// These are the numbers Andra chose by pushing sliders in
// mockups/desk-preview.html. They live here, once, as named values — never
// as literals in a view. The CSS half of the same set lives in
// css/app.css under "THE DESK".
//
// One D0 value has deliberately NOT been carried over: "looseness". It scaled
// the mockup's stand-in coordinates so a fixed demo arrangement could be shown
// tighter or looser. Real positions come from real drags, so it has no runtime
// meaning; what it was really tuning — how much desk you get per card — is
// DESK_W/DESK_H against CARD_MAX_W, which are all locked below.
export const ROT_MAX_DEG = 2.3;      // biggest tilt any card gets, plus or minus
export const DESK_W = 4400;          // the bounded surface: a desk has edges (§5.1)
export const DESK_H = 2900;          // sized for ~100 entries with room left over
export const ORIGIN = 24;            // inset of the coordinate space inside the surface
export const CARD_MIN_W = 260;       // a card sizes itself between these two
export const CARD_MAX_W = 410;
export const CARD_OPEN_W = 460;      // expanded in place (§14.5)
export const WEIGHT_RADIUS = 170;    // how close counts as "the same pile" for weight
export const WEIGHT_MAX = 3;         // most hairline sheets drawn under one card
export const GLANCE_PAD = 60;        // breathing room around the content when glancing

// ===================================================================
//  WOBBLE — derived, never stored (§12.1, §8.26)
// ===================================================================
// A hash of entry id + project id. Stable, identical on every device for
// free, never synced, and a STATIC rotation rather than an animation — so it
// survives prefers-reduced-motion untouched.
//
// The project id is in the hash on purpose: the same entry on two different
// desks sits at two different angles, which is the small honest signal that
// these are two placements of one thing, not one placement seen twice.
export function hashUnit(str) {
  let h = 2166136261;                          // FNV-1a: small, boring, stable
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2000) / 1000 - 1;        // -1.000 … +0.999
}

export function rotationOf(entryId, projectId, maxDeg = ROT_MAX_DEG) {
  return hashUnit(String(entryId) + "|" + String(projectId)) * maxDeg;
}

// ===================================================================
//  GEOMETRY
// ===================================================================

// Keep a position ON the bounded desk. Applied on every COMMIT, not only when
// drawing: clamping at render time only was a D0 bug — the stored position
// stayed off the edge, the card looked pinned to the boundary, and the first
// part of any drag back did nothing. The model is the truth.
export function clampPos(pos, cardW = CARD_MAX_W, cardH = 160, w = DESK_W, h = DESK_H) {
  const maxX = Math.max(0, w - ORIGIN - cardW);
  const maxY = Math.max(0, h - ORIGIN - cardH);
  return {
    x: Math.round(Math.min(Math.max(0, num(pos && pos.x)), maxX)),
    y: Math.round(Math.min(Math.max(0, num(pos && pos.y)), maxY)),
  };
}
function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }

// Z-ORDER (§8.27). Touch or drop sets max + 1. Ties break by entry id, so two
// devices that raise different cards to the same number still agree on which
// is on top — without either of them having to ask.
export function compareZ(a, b) {
  const az = num(a.z), bz = num(b.z);
  if (az !== bz) return az - bz;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
export function nextZ(placed) {
  let max = 0;
  for (const p of placed) max = Math.max(max, num(p.z));
  return max + 1;
}

// PILE WEIGHT (§12.5) — local card density, computed at render time, stored
// nowhere. A pile is not a thing; this is just how many other cards happen to
// be within arm's reach of this one.
export function weights(placed, radius = WEIGHT_RADIUS, cap = WEIGHT_MAX) {
  const out = new Map();
  for (const a of placed) {
    let n = 0;
    for (const b of placed) {
      if (a === b) continue;
      if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) < radius) n++;
    }
    out.set(a.id, Math.min(cap, n));
  }
  return out;
}

// THE GLANCE (§14.3, §14.18) — fit the CONTENT, not the desk's own bounds, and
// centre it. Fitting the bounds meant a handful of cards shrank to nothing in
// order to show a lot of empty surface. Never scales UP: a nearly empty desk
// is shown at its own size rather than magnified.
export function contentBounds(boxes, w = DESK_W, h = DESK_H) {
  if (!boxes || boxes.length === 0) return { x: 0, y: 0, w, h };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);          y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function glanceFrame(b, viewW, viewH, pad = GLANCE_PAD) {
  const k = Math.min((viewW - pad * 2) / b.w, (viewH - pad * 2) / b.h, 1);
  return {
    k,
    tx: viewW / 2 - (b.x + b.w / 2) * k,
    ty: viewH / 2 - (b.y + b.h / 2) * k,
  };
}

// ===================================================================
//  THE ONE ARCHIVE PASS (§12.6)
// ===================================================================
// Everything a desk render needs, and everything the Peek drawers need, out of
// a single walk. Nothing else in the desk may touch store.all(). The
// calendarData precedent, and the reason the render-scans rule exists at all.
//
// `items` is store.all(); `linkLabel` is store.js's PROJECT_LINK. Both are
// passed in so this file stays free of imports.
export function deskData(items, projectId, linkLabel = "in project") {
  const key = deskKey(projectId);
  const placed = [];
  const unplaced = [];
  const members = [];

  for (const it of items) {
    if (!it || it.id === projectId) continue;
    // membership is an explicit link, not a generic "see also" connection
    let member = false;
    for (const l of it.links || []) {
      if (l && l.target === projectId && l.label === linkLabel) { member = true; break; }
    }
    if (!member) continue;
    members.push(it);

    const rec = it.viewState ? it.viewState[key] : null;
    if (rec && !rec.removed && rec.pos) {
      placed.push({
        id: it.id,
        item: it,
        rec,
        pos: rec.pos,
        z: num(rec.z),
        clip: rec.clip || null,                       // Phase D2 reads this
        rot: rotationOf(it.id, projectId),
      });
    } else {
      // The unplaced set is COMPUTED, never stored (§6): it is simply "in this
      // project, with no live desk record". A tombstoned record lands here too,
      // which is exactly right — un-placing puts a card back in the tray.
      unplaced.push(it);
    }
  }

  placed.sort(compareZ);
  return { key, projectId, placed, unplaced, members, maxZ: nextZ(placed) - 1 };
}

// ===================================================================
//  THE MAT (§14.1, §14.12)
// ===================================================================
// A cylinder in a uniform field — Maxwell's Fig. XV turned on its side. Both
// families of curves come from one complex map:
//
//     W  =  z + a²/z
//
// so instead of tracing anything numerically, each curve is drawn by walking
// a straight line in W and inverting exactly:
//
//     z  =  ( W ± sqrt(W² − 4a²) ) / 2 ,  taking the root outside the cylinder
//
// Curvy, organic, mathematically real, and cheap: a few dozen paths, no image
// file, no texture, and it re-themes because the view strokes it in the ink
// token. Returns plain path data so this stays DOM-free and testable.
//
// The mat has its OWN fixed footprint and is centred on the desk — it is a
// thing ON a desk, not a covering OF one (§14.12) — and it is decorative and
// inert: it is never a container, a drop zone or a boundary (§14.13).
export const MAT_EXTENT = 6;         // locked r3. Lower = a bigger central eye.
export const MAT_W = 2000;           // locked r4. Height follows at 3:2.

export function matPaths(extentX = MAT_EXTENT, a = 1) {
  const X = extentX, Y = extentX * 2 / 3;      // landscape 3:2, like a desk mat
  const step = X / 12;
  const paths = [];

  const csqrt = (u, v) => {
    const m = Math.hypot(u, v);
    return [Math.sqrt(Math.max(0, (m + u) / 2)),
            (v < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (m - u) / 2))];
  };
  const invert = (u, v) => {
    const [p, q] = csqrt(u * u - v * v - 4 * a * a, 2 * u * v);
    const z1 = [(u + p) / 2, (v + q) / 2];
    const z2 = [(u - p) / 2, (v - q) / 2];
    const m1 = Math.hypot(z1[0], z1[1]), m2 = Math.hypot(z2[0], z2[1]);
    // The two roots multiply to a², so the bigger one is always the outside
    // one — EXCEPT right on the cylinder, where both sit on the circle and
    // floating point picks between them at random. That flapping drew chords
    // straight across the disc; on the boundary, draw nothing.
    if (Math.abs(m1 - m2) < 1e-6) return [NaN, NaN];
    return m1 >= m2 ? z1 : z2;
  };

  const curve = (level, along, isStream) => {
    const N = 260;
    let d = "", pen = false, prev = null;
    for (let i = 0; i <= N; i++) {
      const t = -along + (2 * along * i) / N;
      const [zx, zy] = isStream ? invert(t, level) : invert(level, t);
      const off = !isFinite(zx) || !isFinite(zy)
        || Math.hypot(zx, zy) < a * 0.999
        || Math.abs(zx) > X * 1.1 || Math.abs(zy) > Y * 1.1;
      if (off) { pen = false; prev = null; continue; }
      if (prev && Math.hypot(zx - prev[0], zy - prev[1]) > X / 3) pen = false;
      d += (pen ? "L" : "M") + zx.toFixed(3) + " " + zy.toFixed(3) + " ";
      pen = true; prev = [zx, zy];
    }
    if (d) paths.push(d.trim());
  };

  // half-step offsets keep every curve off the two degenerate ones through the
  // middle, which is what stops the pattern reading as a cross
  for (let k = 0; k < 14; k++) {
    const lev = (k + 0.5) * step;
    curve(lev, X * 1.6, true);   curve(-lev, X * 1.6, true);    // field lines
    curve(lev, Y * 1.8, false);  curve(-lev, Y * 1.8, false);   // equipotentials
  }
  return { viewBox: `${-X} ${-Y} ${2 * X} ${2 * Y}`, paths, radius: a };
}
