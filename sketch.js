// sketch.js — the "napkin journal" drawing canvas (§9, refined).
// =================================================================
// The vibe Andra asked for: sketching in a warm paper journal, calm and
// simple — NOT Procreate. So this is deliberately tiny:
//   - one pen (soft, tapered), one eraser
//   - two inks: soft black + a faded-blue accent
//   - undo, clear
// No layers, no zoom, no brush menus.
//
// How the "real pen" feel is achieved (§9 "Pencil pressure -> line weight"):
//   - Pointer Events give us pressure on Apple Pencil for free.
//   - Where there's no pressure (finger / trackpad / mouse), we fake a
//     natural taper from stroke SPEED: fast = thin, slow = thick, the way a
//     real pen lays down more ink when it lingers. Widths are smoothed so a
//     line doesn't jitter.
//
// How saving works (immutable assets, §2.1/§6.1):
//   - The visible page = an optional background image (a previously-saved
//     drawing being continued) + this session's fresh strokes on top.
//   - toBlob() flattens paper-free (transparent) ink to a PNG. editor.js
//     hashes it into a new attachment; the old one is replaced. Every save is
//     a new file with a new hash — nothing is mutated in place.
//
// The canvas keeps a crisp line on Retina by backing the display size with
// devicePixelRatio and drawing in CSS-pixel coordinates.

import { el } from "./views/shared.js";

// Ink options. Colors are read from the live theme tokens (§10) so a re-theme
// restyles the pens too — we resolve them at mount time from CSS variables.
const INKS = [
  { key: "ink",    label: "Ink",  var: "--sketch-ink" },
  { key: "accent", label: "Blue", var: "--sketch-ink-accent" },
];

// Brush sizing (in CSS px). These are the *base* widths; pressure/speed
// modulate around them.
const PEN_BASE = 2.6;
const PEN_MIN  = 0.8;
const PEN_MAX  = 5.5;
const ERASER_WIDTH = 26;

export function createSketchPad({ onDirty } = {}) {
  // --- elements ---
  const canvas = el("canvas", { class: "sketch-canvas", "aria-label": "Drawing canvas" });
  const paper = el("div", { class: "sketch-paper" }, [canvas]);

  const ctx = canvas.getContext("2d");

  // Resolved ink colors (filled at mount, refreshed if theme changes).
  const inkColor = {};
  function resolveInks() {
    const cs = getComputedStyle(document.documentElement);
    for (const ink of INKS) inkColor[ink.key] = (cs.getPropertyValue(ink.var) || "#26241f").trim();
  }

  // --- drawing state ---
  let tool = "pen";          // "pen" | "eraser"
  let inkKey = "ink";
  let strokes = [];          // committed strokes THIS session (for undo)
  let current = null;        // stroke in progress
  let bgImage = null;        // Image of a drawing being continued (behind strokes)
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let dirty = false;

  function markDirty() {
    if (!dirty) { dirty = true; }
    onDirty && onDirty();
  }

  // --- sizing: back the display size with devicePixelRatio for crisp ink ---
  function fit() {
    const rect = paper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // not visible yet
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px
    redraw();
  }

  // Repaint the whole scene: background drawing (if any) then session strokes.
  function redraw() {
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    if (bgImage) {
      // fit the saved drawing to the current canvas (contain), so continuing
      // an old sketch lines up even if the window is a different size.
      drawImageContain(ctx, bgImage, w, h);
    }
    for (const s of strokes) paintStroke(s);
  }

  function paintStroke(stroke) {
    const pts = stroke.points;
    if (pts.length === 0) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (stroke.tool === "eraser") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      strokePath(pts, ERASER_WIDTH);
      ctx.restore();
      return;
    }

    ctx.strokeStyle = stroke.color;
    // Variable width: draw as many short segments, each with its own width,
    // so the line tapers smoothly instead of being one flat thickness.
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx.beginPath();
      ctx.lineWidth = (a.w + b.w) / 2;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function strokePath(pts, width) {
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  // --- pointer handling ---
  let lastPt = null;
  let lastTime = 0;
  let smoothWidth = PEN_BASE;

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Compute a pen width from pressure when available, else from speed.
  function widthFor(e, pt) {
    if (tool === "eraser") return ERASER_WIDTH;
    const now = performance.now();
    let w;
    // Apple Pencil / pressure-capable stylus: pressure in (0,1], default 0.5.
    const hasRealPressure = e.pressure && e.pressure > 0 && e.pressure !== 0.5;
    if (hasRealPressure) {
      w = PEN_MIN + (PEN_MAX - PEN_MIN) * e.pressure;
    } else if (lastPt) {
      // Speed-based taper: distance since last point over time = velocity.
      const dt = Math.max(1, now - lastTime);
      const dist = Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y);
      const speed = dist / dt; // px per ms
      // Map speed -> width: slow (~0) => thick, fast (>1.2) => thin.
      const t = Math.min(1, speed / 1.2);
      w = PEN_MAX - (PEN_MAX - PEN_MIN) * t;
    } else {
      w = PEN_BASE;
    }
    lastTime = now;
    // Smooth so width doesn't flicker between samples.
    smoothWidth = smoothWidth * 0.7 + w * 0.3;
    return smoothWidth;
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0 && e.pointerType === "mouse") return;
    canvas.setPointerCapture?.(e.pointerId);
    const pt = localPoint(e);
    lastPt = pt;
    lastTime = performance.now();
    smoothWidth = PEN_BASE;
    const w = widthFor(e, pt);
    current = {
      tool,
      color: inkColor[inkKey],
      points: [{ x: pt.x, y: pt.y, w }],
    };
    e.preventDefault();
  }

  function onMove(e) {
    if (!current) return;
    // Coalesced events give smoother lines on fast strokes / high-Hz Pencils.
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const pt = localPoint(ev);
      const w = widthFor(ev, pt);
      const prev = current.points[current.points.length - 1];
      // skip near-duplicate points (finger jitter)
      if (Math.hypot(pt.x - prev.x, pt.y - prev.y) < 0.6) continue;
      current.points.push({ x: pt.x, y: pt.y, w });
      // Incrementally paint just the new segment for responsiveness.
      paintSegment(current, prev, current.points[current.points.length - 1]);
      lastPt = pt;
    }
    e.preventDefault();
  }

  function paintSegment(stroke, a, b) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (stroke.tool === "eraser") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.beginPath();
      ctx.lineWidth = ERASER_WIDTH;
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    ctx.lineWidth = (a.w + b.w) / 2;
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  function onUp() {
    if (!current) return;
    if (current.points.length === 1) {
      // a tap = a dot: give it a tiny second point so it renders
      const p = current.points[0];
      current.points.push({ x: p.x + 0.01, y: p.y + 0.01, w: p.w });
      paintStroke(current);
    }
    strokes.push(current);
    current = null;
    lastPt = null;
    markDirty();
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onUp);

  // --- public actions ---
  function undo() {
    if (strokes.length === 0) return;
    strokes.pop();
    redraw();
    markDirty();
  }
  function clear() {
    strokes = [];
    bgImage = null;
    redraw();
    markDirty();
  }
  function setTool(t) { tool = t; }
  function setInk(k) { inkKey = k; tool = "pen"; }
  function isBlank() { return strokes.length === 0 && !bgImage; }

  // Load a previously-saved drawing to continue on top of.
  function loadBackground(url) {
    return new Promise((resolve) => {
      if (!url) { resolve(); return; }
      const img = new Image();
      img.onload = () => { bgImage = img; redraw(); resolve(); };
      img.onerror = () => resolve(); // missing image: just start blank
      img.src = url;
    });
  }

  // Flatten to a transparent PNG (ink only, no paper — paper is a CSS layer,
  // so the saved drawing composites over any future theme's paper color).
  function toBlob() {
    return new Promise((resolve) => {
      // Export at the backing resolution so lines stay crisp when reopened.
      canvas.toBlob((b) => resolve(b), "image/png");
    });
  }

  // Called by the editor after the field is in the DOM (so sizing is correct).
  function mount() {
    resolveInks();
    // two RAFs: wait for layout so getBoundingClientRect is real
    requestAnimationFrame(() => requestAnimationFrame(fit));
  }

  const ro = ("ResizeObserver" in window) ? new ResizeObserver(() => fit()) : null;
  ro && ro.observe(paper);
  function destroy() { ro && ro.disconnect(); }

  // --- toolbar UI ---
  const toolbar = el("div", { class: "sketch-toolbar", role: "toolbar", "aria-label": "Drawing tools" });

  const inkBtns = INKS.map(ink =>
    el("button", {
      type: "button", class: "sketch-color", "data-ink": ink.key,
      "aria-label": `${ink.label} pen`, title: `${ink.label} pen`,
      onclick: () => { setInk(ink.key); refreshToolbar(); },
    })
  );
  const eraserBtn = el("button", {
    type: "button", class: "sketch-tool", "aria-label": "Eraser", title: "Eraser", text: "Eraser",
    onclick: () => { setTool("eraser"); refreshToolbar(); },
  });
  const undoBtn = el("button", {
    type: "button", class: "sketch-tool", "aria-label": "Undo last stroke", title: "Undo", text: "Undo",
    onclick: undo,
  });
  const clearBtn = el("button", {
    type: "button", class: "sketch-tool", "aria-label": "Clear the page", title: "Clear",
    text: "Clear",
    onclick: () => { if (isBlank() || confirm("Clear this sketch? This can't be undone.")) clear(); },
  });

  function refreshToolbar() {
    for (const b of inkBtns) {
      const on = tool === "pen" && b.dataset.ink === inkKey;
      b.setAttribute("aria-pressed", String(on));
      // paint the swatch its ink color
      b.style.setProperty("--swatch", inkColor[b.dataset.ink] || "#26241f");
    }
    eraserBtn.setAttribute("aria-pressed", String(tool === "eraser"));
  }

  toolbar.append(...inkBtns, el("span", { class: "sketch-sep" }), eraserBtn, undoBtn, clearBtn);
  resolveInks();
  refreshToolbar();

  const root = el("div", { class: "sketch-wrap" }, [toolbar, paper]);

  return {
    root,
    mount, destroy,
    loadBackground, toBlob,
    undo, clear, isBlank,
    hasChanges: () => dirty,
  };
}

// Draw an image scaled to "contain" within w×h, centered.
function drawImageContain(ctx, img, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
