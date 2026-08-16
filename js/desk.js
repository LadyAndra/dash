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
//   clip     a clip's id, or null. Phase D2 reads this.
//   removed  tombstone. Un-placing keeps the position, so restoring puts the
//            card back where it was rather than somewhere new.
//   created  ISO timestamp of first placement.
//
// Phase D2 adds the other floor: project-side desk objects, carried by the
// `"dk"` op and materialised on the PROJECT item (§12.3):
//
//   project.deskObjects = { clips: [ { cid, created, removed } ],
//                           notes: [ { nid, text, pos, clip, offset, created, removed } ] }
//
// A post-it has two placements and never both at once: `pos` while it is free
// on the desk, `offset` {dx, dy} from its clip's anchor while it is attached.
// `offset` was added in August 2026 — before it, an attached note ignored
// position entirely and drew wherever the code put it, which made it the one
// object here where dropping it somewhere wasn't the decision.
//
// Everything about a clip's geometry is derived here, at render time, from its
// members' positions — a clip stores no position and no member list (§12.2).
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

// An EXPANDED card is the thing you are reading, so it sits above everything
// else on the surface — its own neighbours, the members of the clip it may be
// inside, the mark, and any post-it. A band of its own rather than "max + 1",
// because there is only ever one and it should not have to win an argument.
// Contained by .desk-viewport's stacking context, so it can never reach the
// banner or an open drawer (§14.18).
export const Z_EXPANDED = 9000;

// ===================================================================
//  D2 CONSTANTS — first pass, expect Andra to tune these live
// ===================================================================
// Same posture as the D0/D1 numbers above: small, named, in one place, so a
// reaction to seeing it on screen is a one-line edit rather than a hunt. None
// of these is stored, synced or merged — they are all render-time arithmetic.

// THE CLOSED STACK. A clip is "rigid" where a pile is "fluid" (§5.4), so its
// members draw much tighter than a dropped pile ever lands — just enough that
// the paper edges peek out at their own angles underneath. Bigger numbers =
// looser sheaf. Unchanged from the first D2 delivery: Andra didn't weigh in.
export const STACK_DX = 7;           // per-member step, in the stack
export const STACK_DY = 6;           // ...and down
// A clipped card sizes itself between CARD_MIN_W and CARD_MAX_W like any
// other, so its LEFT edge says nothing about where the stack's right edge is.
// This is the width the stack reckons its right edge from — see stackSlot().
export const STACK_W = CARD_MAX_W;

// THE PAPERCLIP MARK. Sits on the stack's RIGHT corner and overlaps the top
// card. `MARK_RX` is how far its right edge hangs PAST the paper's right edge,
// the way a real clip does; `MARK_DY` is how far above the paper's top it sits.
export const MARK_RX = 18;
export const MARK_DY = -22;
export const MARK_SIZE = 52;         // must match --desk-clip-mark in css/app.css

// THE CLIP'S OWN TILT. Derived from a hash of the clip's id, exactly like a
// card's wobble — stable, identical on every device, never stored. Wider than
// a card's 2.3° on purpose: a clip is put on by hand and by eye, and a mark
// that agrees too closely with the paper under it reads as printed-on.
export const CLIP_ROT_MAX_DEG = 7;

// THE OPEN GRID. Double-clicking the mark lays the members out to be read.
//
// The column pitch is NOT a constant any more, and that was a real bug: cards
// size themselves between CARD_MIN_W and CARD_MAX_W, so a fixed 300px pitch
// guaranteed that any member wider than 300px overlapped its neighbour and
// showed only part of itself. The pitch is now the widest member's MEASURED
// box plus a gap, and the column count is whatever that pitch actually fits —
// so every member is fully visible whatever it contains and however many
// there are. See openGrid() below; the view measures, this file does the sums.
export const OPEN_GAP_X = 24;        // clear air between columns
export const OPEN_GAP_Y = 24;        // ...and between rows
export const OPEN_COLS_MAX = 3;      // the delivered look, when there is room
export const OPEN_INSET_Y = 44;      // grid starts below the mark, not under it

// POST-ITS.
export const NOTE_W = 220;           // must match --desk-note-w in css/app.css
export const NOTE_H = 140;           // used only for clamping on drop
// Where an attached post-it sits when it has never been placed by hand — i.e.
// a note attached before `offset` existed. Below the stack and clear of the
// mark, which now lives on the right; anything dropped since carries its own
// offset and is never moved again.
export const NOTE_OFFSET_DEFAULT = { dx: 0, dy: 176 };
// The paper tint: this percentage of the project's banner colour mixed into
// the ordinary raised surface. VERIFIED, not eyeballed — tests/desk-d2.test.mjs
// walks the whole RGB cube against js/theme.js's own contrast() and demands
// --text-primary clear 4.5:1 on the result in BOTH themes (the worst case at
// this value is 7.66:1, which is AAA). --text-muted also clears; --text-faint
// does NOT, so nothing on a post-it may use it.
export const NOTE_TINT_PCT = 18;     // must match --desk-note-tint in css/app.css

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

// The paperclip mark's tilt. Same technique, different salt — so a clip and a
// card that happen to share an id prefix don't end up at the same angle.
export function clipRotationOf(cid, projectId, maxDeg = CLIP_ROT_MAX_DEG) {
  return hashUnit("clip|" + String(cid) + "|" + String(projectId)) * maxDeg;
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

// CLAMPING A WHOLE CLUSTER (§12.2, Phase D2).
//
// Clamping each member separately would be wrong, and visibly so: push a clip
// into a corner and the card nearest the edge stops while the others keep
// going, so the stack fans out and never comes back — the relative offsets a
// clip exists to preserve would be destroyed by an edge. Instead the DELTA is
// clamped once, to the tightest constraint any member imposes, and every
// member then moves by exactly that. The clip stops at the edge as one object,
// which is what a real one does.
//
// Pure, and separate from clampPos on purpose: clampPos answers "is this
// position on the desk", this answers "how far can all of these move together".
export function clampDelta(positions, dx, dy, cardW = CARD_MAX_W, cardH = 160, w = DESK_W, h = DESK_H) {
  if (!positions || positions.length === 0) return { dx: Math.round(dx), dy: Math.round(dy) };
  const maxX = Math.max(0, w - ORIGIN - cardW);
  const maxY = Math.max(0, h - ORIGIN - cardH);
  let loX = -Infinity, hiX = Infinity, loY = -Infinity, hiY = Infinity;
  for (const p of positions) {
    loX = Math.max(loX, 0 - num(p.x));    hiX = Math.min(hiX, maxX - num(p.x));
    loY = Math.max(loY, 0 - num(p.y));    hiY = Math.min(hiY, maxY - num(p.y));
  }
  // A cluster wider than the desk itself has no legal delta at all; pinning it
  // to the low bound keeps it on screen rather than producing NaN.
  const pick = (v, lo, hi) => Math.round(hi < lo ? lo : Math.min(Math.max(v, lo), hi));
  return { dx: pick(dx, loX, hiX), dy: pick(dy, loY, hiY) };
}

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

// ===================================================================
//  CLIP GEOMETRY (§12.2, §12.5 — derived, never stored)
// ===================================================================
// A clip owns no position. Where it sits is a question you ask its members,
// and the answer is recomputed on every render. That is the whole reason
// dragging a clip is "one ordinary pos op per member" and nothing else: move
// the members and the clip has already moved, because there was never a second
// coordinate to keep in step.

// THE ANCHOR — the topmost member's position, not the centroid.
//
// Both were offered; this one is cleaner against the helpers that already
// exist. `placed` arrives sorted by compareZ, so "topmost" is just the last
// element — no new comparison, no averaging, and no rounding drift. It also
// behaves better under a drag: every member moves by the same delta, so the
// anchor moves by exactly that delta too, and the stack cannot creep.
export function clipAnchor(members) {
  if (!members || members.length === 0) return { x: 0, y: 0 };
  const top = members[members.length - 1];
  return { x: top.pos.x, y: top.pos.y };
}

// Where member i draws while the clip is CLOSED.
//
// THE STACK IS RIGHT-ALIGNED, and reckoned from its RIGHT edge rather than its
// left — because the clip pins it from the right, and a right-hander wants the
// clip on their own side. That is not a cosmetic difference: a card's width is
// its own business (CARD_MIN_W…CARD_MAX_W, sized to its title), so aligning
// LEFT edges left the right edges ragged by up to 150px and the clip gripping
// nothing but air on the narrow sheets. Aligning the RIGHT edges means the
// clip grips every sheet at the same point whatever each one contains.
//
// So this returns `right` — an x coordinate of the card's RIGHT edge, in the
// desk's own space — and the view turns it into a CSS `right` against the
// desk's width. Nothing about the STORED position changes: a clip still owns
// no geometry, and dragging one is still one ordinary pos op per member.
export function stackSlot(anchor, i, dx = STACK_DX, dy = STACK_DY, cardW = STACK_W) {
  return { right: anchor.x + cardW + i * dx, y: anchor.y + i * dy };
}

// The mark's own corner, derived from the TOP card (so it always overlaps the
// sheet you can actually see) — closed only; an open clip parks it above the
// grid's own origin, which openGrid() reports.
export function markSlot(anchor, count, cardW = STACK_W) {
  const top = stackSlot(anchor, Math.max(0, count - 1), STACK_DX, STACK_DY, cardW);
  return { right: top.right + MARK_RX, y: top.y + MARK_DY };
}

// THE OPEN GRID — laid out from what the cards MEASURE, not from a constant.
//
// `sizes` is one { w, h } per member, read off the real elements after they
// are in the document (jsdom has no layout, so this file is given the numbers
// rather than reading them — the same split every other pure helper here uses).
// `room` is how much width the grid may spend, normally the viewport's.
//
// Column count falls out of the arithmetic instead of being a fixed 3: the
// pitch is the widest member plus a gap, and the count is however many of
// those fit, capped at the delivered three. Two consequences worth knowing:
// a clip of wide cards on a narrow window opens two across rather than three
// and overlapping, and a clip of twelve opens as three columns of four rather
// than a row that walks off the desk.
//
// The origin is pulled back onto the desk if the grid would otherwise hang off
// the right or bottom edge — the same "clamp in the model" rule §14.2 fixed
// for cards, applied to a layout that is derived rather than stored.
export function openGrid(anchor, sizes, opts = {}) {
  const n = Math.max(0, sizes ? sizes.length : 0);
  const gapX = num2(opts.gapX, OPEN_GAP_X), gapY = num2(opts.gapY, OPEN_GAP_Y);
  const inset = num2(opts.inset, OPEN_INSET_Y);
  const deskW = num2(opts.deskW, DESK_W), deskH = num2(opts.deskH, DESK_H);
  let w = CARD_MIN_W, h = 140;
  for (const s of sizes || []) {
    if (s && isFinite(s.w) && s.w > w) w = s.w;
    if (s && isFinite(s.h) && s.h > h) h = s.h;
  }
  const pitchX = Math.round(w + gapX), pitchY = Math.round(h + gapY);
  const room = num2(opts.room, deskW);
  const fits = Math.max(1, Math.floor((room + gapX) / pitchX));
  const cols = Math.max(1, Math.min(n || 1, OPEN_COLS_MAX, fits));
  const rows = Math.ceil((n || 1) / cols);
  const gw = cols * pitchX - gapX;
  const gh = inset + rows * pitchY - gapY;
  const origin = {
    x: Math.round(Math.max(0, Math.min(anchor.x, Math.max(0, deskW - ORIGIN - gw)))),
    y: Math.round(Math.max(0, Math.min(anchor.y, Math.max(0, deskH - ORIGIN - gh)))),
  };
  const at = [];
  for (let i = 0; i < n; i++) {
    at.push({
      x: origin.x + (i % cols) * pitchX,
      y: origin.y + inset + Math.floor(i / cols) * pitchY,
    });
  }
  return { cols, rows, pitchX, pitchY, origin, at, w: gw, h: gh };
}
function num2(v, dflt) { return typeof v === "number" && isFinite(v) ? v : dflt; }

// WHERE AN ATTACHED POST-IT SITS (§12.3, revised August 2026).
//
// It used to be derived from the mark, which meant every attached note landed
// in the same place and sat on top of the clip icon — "placement is the
// decision" everywhere else on this desk, and nowhere here. A note now carries
// its own `offset` {dx, dy} from the clip's anchor point, written when it is
// dropped, exactly as a wonder symbol carries one from its host card.
//
// `pos` keeps its old meaning and is used only while the note is free.
// A note attached before `offset` existed has none, and gets the default —
// once, until the first time it is dragged.
export function noteAt(anchor, offset) {
  const o = offset && isFinite(offset.dx) && isFinite(offset.dy) ? offset : NOTE_OFFSET_DEFAULT;
  return { x: Math.round(anchor.x + o.dx), y: Math.round(anchor.y + o.dy) };
}
// The inverse, used on drop: where the note landed, as an offset from the
// anchor it landed on.
export function noteOffset(anchor, pos) {
  return { dx: Math.round(pos.x - anchor.x), dy: Math.round(pos.y - anchor.y) };
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
  let project = null;

  for (const it of items) {
    if (!it) continue;
    // The project item is not a member of its own desk, but it IS where the
    // project-side desk objects live (§12.3) — so it is picked up on the way
    // past rather than costing a second walk.
    if (it.id === projectId) { project = it; continue; }
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

  // ---- the project-side floor: clips and post-its (§12.3) ----
  // Both collections are already stored sorted by id, so nothing is sorted
  // again here; a tombstoned record is simply skipped, never erased.
  const objects = (project && project.deskObjects) || {};
  const liveClips = (objects.clips || []).filter(c => c && !c.removed);
  const liveNotes = (objects.notes || []).filter(n => n && !n.removed);
  const clipIds = new Set(liveClips.map(c => c.cid));

  // Membership inverted in ONE pass over the cards we already have. A card
  // whose `clip` points at a clip that has since been removed (or that this
  // device hasn't received yet) is simply a loose card — the reference is
  // ignored, never repaired, because repairing it would be a write.
  const byClip = new Map(liveClips.map(c => [c.cid, []]));
  const loose = [];
  for (const p of placed) {
    const arr = p.clip && clipIds.has(p.clip) ? byClip.get(p.clip) : null;
    if (arr) arr.push(p); else loose.push(p);
  }

  const notesByClip = new Map();
  const freeNotes = [];
  for (const n of liveNotes) {
    if (n.clip && clipIds.has(n.clip)) {
      if (!notesByClip.has(n.clip)) notesByClip.set(n.clip, []);
      notesByClip.get(n.clip).push(n);
    } else {
      // Same rule as a card: a note whose clip is gone is a free note, and it
      // keeps whatever `pos` it last had. Its data outlives the clip (§12.3).
      freeNotes.push(n);
    }
  }

  const clips = liveClips.map(rec => {
    const mem = byClip.get(rec.cid) || [];
    return {
      cid: rec.cid,
      rec,
      members: mem,                                  // already in compareZ order
      anchor: clipAnchor(mem),
      // A clip rides at the height of its topmost member, so the whole sheaf
      // stays together in the stacking order rather than interleaving.
      z: mem.length ? num(mem[mem.length - 1].z) : 0,
      rot: clipRotationOf(rec.cid, projectId),
      notes: notesByClip.get(rec.cid) || [],
    };
  });

  return {
    key, projectId, placed, unplaced, members, maxZ: nextZ(placed) - 1,
    project, clips, loose, freeNotes, notes: liveNotes,
  };
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
