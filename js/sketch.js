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
//
// VIEW vs DRAW mode (added July 2026)
// -----------------------------------
// WHY: the canvas is always visible inside every item, which means a finger
// dragged across it while trying to SCROLL THE PAGE used to be read as a
// stroke — you'd scroll and accidentally draw a line. The canvas can't tell a
// scroll from a doodle, because both are "finger moves across the glass".
//
// So the pad now has two explicit states, and you choose which one you're in:
//   "view" (the default) — the canvas ignores touches entirely. The browser
//       handles them normally, so the page scrolls. You can still SEE the
//       drawing; you just can't add to it.
//   "draw" — the canvas captures touches and lays down ink.
//
// The switch is the pencil button in the toolbar. It's deliberately a state
// you opt into rather than something clever and automatic: guessing wrong
// either loses a stroke or leaves a stray mark, and both are worse than one
// visible tap.
//
// HOW it's enforced, in two independent layers, so a bug in one can't cause a
// stray mark on its own:
//   1. CSS — in view mode the canvas gets `pointer-events: none`, so touches
//      never reach it at all and `touch-action` returns to normal scrolling.
//   2. JS  — onDown() refuses to start a stroke unless mode === "draw".

import { el } from "./views/shared.js";
import { toast } from "./ui/toast.js";

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

  // Fail loudly (§13.1): if this browser can't give us a 2D canvas there is no
  // drawing surface at all. Say so in plain English rather than letting every
  // later call throw somewhere invisible. `canDraw` gates the paint paths.
  const canDraw = !!ctx;
  if (!canDraw) {
    toast(
      "This browser couldn't open a drawing canvas, so sketching is unavailable on this device. Everything else still works.",
      "error", 9000
    );
  }

  // Resolved ink colors (filled at mount, refreshed if theme changes).
  const inkColor = {};
  function resolveInks() {
    const cs = getComputedStyle(document.documentElement);
    for (const ink of INKS) inkColor[ink.key] = (cs.getPropertyValue(ink.var) || "#26241f").trim();
  }

  // --- drawing state ---
  // mode: "view" = touches pass through and the page scrolls (the default,
  // so a sketch pad sitting in an open item can never grab a scroll);
  // "draw" = the canvas captures touches and makes ink.
  let mode = "view";
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
    if (!canDraw) return;
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
    if (!canDraw) return;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    if (bgImage) {
      // fit the saved drawing to the current canvas (contain), so continuing
      // an old sketch lines up even if the window is a different size.
      drawImageContain(ctx, bgImage, w, h);
    }
    for (const s of strokes) paintStroke(s);
  }

  // ---- low-level ink drawing ----------------------------------------------
  // The "corners" in the first version came from drawing dead-straight lines
  // between sampled points. Real pens curve. So instead of point-to-point
  // lines we route the path through the MIDPOINTS of each pair of samples,
  // using the sample itself as a quadratic control point. That turns a jagged
  // polyline into a smooth curve automatically — the standard trick for
  // signature/drawing canvases — while still letting each little segment carry
  // its own width, so the taper survives.
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function beginInk(stroke) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (stroke.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color;
    }
  }
  function lineSeg(stroke, a, b, w) {
    beginInk(stroke);
    ctx.beginPath(); ctx.lineWidth = w;
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function quadSeg(stroke, from, ctrl, to, w) {
    beginInk(stroke);
    ctx.beginPath(); ctx.lineWidth = w;
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y);
    ctx.stroke();
  }
  function widthAt(stroke, i) {
    return stroke.tool === "eraser" ? ERASER_WIDTH : stroke.points[i].w;
  }

  // Repaint a whole stroke as a smooth, variable-width curve.
  function paintStroke(stroke) {
    const p = stroke.points;
    if (p.length === 0) return;
    if (p.length === 1) { // a dot
      lineSeg(stroke, p[0], { x: p[0].x + 0.01, y: p[0].y + 0.01 }, widthAt(stroke, 0));
      return;
    }
    if (p.length === 2) { lineSeg(stroke, p[0], p[1], (widthAt(stroke,0)+widthAt(stroke,1))/2); return; }
    // start cap: first point to the first midpoint
    lineSeg(stroke, p[0], mid(p[0], p[1]), widthAt(stroke, 0));
    // interior: midpoint -> (control = sample) -> next midpoint
    for (let i = 1; i < p.length - 1; i++) {
      quadSeg(stroke, mid(p[i - 1], p[i]), p[i], mid(p[i], p[i + 1]), widthAt(stroke, i));
    }
    // end cap: last midpoint to the last point
    const n = p.length;
    lineSeg(stroke, mid(p[n - 2], p[n - 1]), p[n - 1], widthAt(stroke, n - 1));
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
    // Layer 2 of the scroll guard (see the header note). CSS already stops
    // touches reaching the canvas in view mode; this makes sure that even if a
    // pointer event somehow arrives, it can never become a stroke. A missed
    // scroll is annoying; a mystery line on your drawing is worse.
    if (mode !== "draw" || !canDraw) return;
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
      // Draw the newly-completed smooth segment (through midpoints) so the
      // live line curves as you go, matching the final render.
      paintIncrement(current);
      lastPt = pt;
    }
    e.preventDefault();
  }

  // Draw just the latest smooth segment of the in-progress stroke, without
  // repainting the whole canvas. Once a point has both neighbors we can draw
  // the curve centered on it; before that we lay a short straight lead.
  function paintIncrement(stroke) {
    const p = stroke.points;
    const n = p.length;
    if (n < 3) { lineSeg(stroke, p[n - 2], p[n - 1], (widthAt(stroke, n - 2) + widthAt(stroke, n - 1)) / 2); return; }
    const b = p[n - 2]; // the point that just gained a right neighbor
    quadSeg(stroke, mid(p[n - 3], b), b, mid(b, p[n - 1]), widthAt(stroke, n - 2));
  }

  function onUp() {
    if (!current) return;
    const p = current.points;
    if (p.length === 1) {
      paintStroke(current); // a tap = a dot
    } else if (p.length >= 3) {
      // paintIncrement stops at the last midpoint; draw the final cap so the
      // live stroke ends exactly where the saved render will.
      const n = p.length;
      lineSeg(current, mid(p[n - 2], p[n - 1]), p[n - 1], widthAt(current, n - 1));
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

  // Switch between scrolling and drawing. The root element carries the mode as
  // a data attribute, which is what the CSS keys off — one source of truth, so
  // the visual state and the behaviour can never disagree.
  function setMode(next) {
    if (next === "draw" && !canDraw) {
      toast("Drawing isn't available in this browser, so the canvas stays in view mode.", "error", 7000);
      return;
    }
    // If a stroke is somehow still open when we leave draw mode, close it
    // properly so it's committed to the undo stack rather than left dangling.
    if (mode === "draw" && next !== "draw" && current) onUp();
    mode = next;
    root.dataset.mode = mode;
    refreshToolbar();
  }
  function toggleMode() { setMode(mode === "draw" ? "view" : "draw"); }

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

  // The mode switch. aria-pressed tells a screen reader whether drawing is on;
  // the text label next to it tells everyone else, because "is this canvas
  // live right now?" should never be something you have to test by touching it.
  const modeBtn = el("button", {
    type: "button", class: "sketch-tool sketch-mode-btn",
    "aria-label": "Turn drawing on or off",
    title: "Turn drawing on or off",
    text: "✎ Draw",
    onclick: toggleMode,
  });
  const modeLabel = el("span", { class: "sketch-mode-label" });

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
    const drawing = mode === "draw";

    for (const b of inkBtns) {
      const on = drawing && tool === "pen" && b.dataset.ink === inkKey;
      b.setAttribute("aria-pressed", String(on));
      // paint the swatch its ink color
      b.style.setProperty("--swatch", inkColor[b.dataset.ink] || "#26241f");
      // Pens and the eraser only mean anything while drawing, so grey them out
      // in view mode. Undo and Clear stay live — they're about the drawing
      // that's already there, and you shouldn't have to turn drawing ON just
      // to take something back.
      b.disabled = !drawing;
    }
    eraserBtn.setAttribute("aria-pressed", String(drawing && tool === "eraser"));
    eraserBtn.disabled = !drawing;

    modeBtn.setAttribute("aria-pressed", String(drawing));
    modeBtn.textContent = drawing ? "✎ Drawing on" : "✎ Draw";
    modeLabel.textContent = drawing
      ? "Drawing — the page won't scroll over the paper."
      : "Viewing — scroll normally; tap Draw to sketch.";
  }

  toolbar.append(
    modeBtn, modeLabel,
    el("span", { class: "sketch-sep" }),
    ...inkBtns,
    el("span", { class: "sketch-sep" }),
    eraserBtn, undoBtn, clearBtn
  );
  resolveInks();

  // `data-mode` is what the CSS reads to decide whether the canvas swallows
  // touches. It starts in "view" so an item can be opened and scrolled through
  // without any risk of marking the paper.
  const root = el("div", { class: "sketch-wrap", "data-mode": mode }, [toolbar, paper]);
  refreshToolbar();

  return {
    root,
    mount, destroy,
    loadBackground, toBlob,
    undo, clear, isBlank,
    setMode, toggleMode,
    isDrawing: () => mode === "draw",
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
