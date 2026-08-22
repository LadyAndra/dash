// desk-images.js — pure rules for project Desk reference images.
// ============================================================
// Images on a Desk are spatial reference material, not Entries. This module is
// deliberately DOM-free and store-free so the geometry and ordering rules can
// be tested before the UI is wired to them.

export const DESK_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);
export const DESK_IMAGE_INITIAL_MAX = 330; // about the diameter of the mat's centre circle
export const DESK_IMAGE_MIN_EDGE = 72;
export const DESK_IMAGE_ROT_MAX = 1.6;

export function isDeskImageExt(ext) {
  return DESK_IMAGE_EXTS.has(String(ext || "").toLowerCase());
}

export function initialDeskImageSize(naturalW, naturalH, maxEdge = DESK_IMAGE_INITIAL_MAX) {
  const w = finitePositive(naturalW);
  const h = finitePositive(naturalH);
  if (!w || !h) return { w: maxEdge, h: maxEdge };
  const k = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// A new image gets one small, human-looking tilt. The value is STORED on the
// desk object; this helper is called only when the object is created.
export function freshDeskImageRotation(random = Math.random, maxDeg = DESK_IMAGE_ROT_MAX) {
  const u = Math.max(0, Math.min(1, Number(random()) || 0));
  return Math.round(((u * 2 - 1) * maxDeg) * 1000) / 1000;
}

export function proportionalResize(start, dx, dy, minEdge = DESK_IMAGE_MIN_EDGE) {
  const w0 = finitePositive(start && start.w) || minEdge;
  const h0 = finitePositive(start && start.h) || minEdge;
  const aspect = w0 / h0;

  const dw = Number(dx || 0) / w0;
  const dh = Number(dy || 0) / h0;
  const ww = Math.abs(dw);
  const wh = Math.abs(dh);
  const movement = ww + wh;
  const deltaScale = movement ? ((dw * ww) + (dh * wh)) / movement : 0;

  let scale = 1 + deltaScale;
  const minScale = minEdge / Math.min(w0, h0);
  scale = Math.max(minScale, scale);

  return {
    w: Math.round(w0 * scale),
    h: Math.round((w0 * scale) / aspect),
  };
}

// Return the z changes needed to move one unit exactly one neighbour toward
// the front or back. Moving an object never otherwise changes its layer.
export function stepDeskLayer(units, id, direction) {
  const sorted = (units || [])
    .filter(u => u && u.id != null)
    .map(u => ({ id: String(u.id), z: Number.isFinite(u.z) ? u.z : 0 }))
    .sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id));
  const i = sorted.findIndex(u => u.id === String(id));
  if (i < 0) return [];
  const j = direction > 0 ? i + 1 : i - 1;
  if (j < 0 || j >= sorted.length) return [];
  const a = sorted[i], b = sorted[j];

  // In normal Dash data z values are distinct. If two devices ever leave an
  // equal-z tie behind, a literal swap would be invisible. Give the held unit
  // one integer step in the requested direction instead; the stable id tie
  // remains the fallback for any other equal-z neighbours.
  if (a.z === b.z) {
    return [{ id: a.id, z: a.z + (direction > 0 ? 1 : -1) }];
  }
  return [
    { id: a.id, z: b.z },
    { id: b.id, z: a.z },
  ];
}

function finitePositive(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
