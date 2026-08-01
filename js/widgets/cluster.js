// cluster.js — the floating corner cluster on the Home sheet.
// ==========================================================
// A small bounded stage pinned to the bottom-right of the window, holding the
// ambient widgets. Right now that's one widget (the pet); weather, tide and
// train slot into the same stage later with no changes here — a widget just
// has to declare its size and hand back something to mount.
//
// Why floating rather than part of the sheet: the point of these widgets is
// that they're GLANCEABLE. Home is a scrolling page, so anything that lives
// in the flow disappears the moment you scroll. Fixed to the viewport, the
// cluster is always there.
//
// Position rules (§3 of the brief):
//   - widgets are draggable inside the stage, corkboard-style
//   - positions are stored per DEVICE in localStorage, NOT in the synced item
//     log. This is UI arrangement, not content: putting it in the log would
//     add merge cases to sync.js for something that isn't really data. If it
//     should follow her across devices later, it moves into the synced
//     registry doc — a small, separate change.
//   - positions are stored as FRACTIONS of the free space, not pixels, so
//     rotating a phone or resizing a window doesn't fling a widget off-stage.
//
// Accessibility: the widgets are decorative ambient motion, so their canvases
// are aria-hidden (non-negotiable #3 explicitly allows this). The frame around
// each one is still focusable and movable by keyboard, because a thing you can
// drag with a finger should be movable without one.

const LS_POS = "dash.cluster.pos";

export function createCluster({ widgets = [] } = {}) {
  const stage = document.createElement("div");
  stage.className = "cluster";
  stage.setAttribute("role", "complementary");
  stage.setAttribute("aria-label", "Ambient corner widgets");
  // Starts hidden so the cluster can't flash in the corner during boot,
  // before render() has decided which view we landed on.
  stage.hidden = true;
  stage.dataset.visible = "false";

  const positions = loadPositions();
  const mounted = [];

  for (const w of widgets) {
    const frame = document.createElement("div");
    frame.className = "cluster-widget";
    frame.dataset.key = w.key;
    frame.tabIndex = 0;
    frame.setAttribute("role", "group");
    frame.setAttribute("aria-label", `${w.label}. Drag, or use the arrow keys, to move it.`);
    // Widgets declare their own size in the shared size hierarchy (§3):
    // weather largest, then pet, then tide, then train. The number is a
    // multiplier on the stage's base unit so the whole cluster scales
    // together on a phone.
    frame.style.setProperty("--cw-scale", String(w.scale ?? 1));

    stage.appendChild(frame);

    const handle = w.mount(frame);   // the widget builds its own contents
    mounted.push({ w, frame, handle });

    makeDraggable(stage, frame, w.key, positions);
  }

  // Re-clamp everything when the stage changes size (window resize, phone
  // rotation, the text-size slider changing the layout underneath us).
  const ro = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => applyAll(stage, positions))
    : null;
  if (ro) ro.observe(stage);
  window.addEventListener("resize", () => applyAll(stage, positions));

  document.body.appendChild(stage);
  // Positions need a real layout before they can be clamped, so apply on the
  // next frame rather than immediately.
  requestAnimationFrame(() => applyAll(stage, positions));

  return {
    el: stage,

    // Shown on Home only. Elsewhere the cluster is hidden AND its widgets are
    // told to stop, so nothing animates behind a view that can't see it.
    setVisible(on) {
      if (stage.dataset.visible === String(on)) return;
      stage.dataset.visible = String(on);
      stage.hidden = !on;
      for (const m of mounted) m.handle?.setActive?.(on);
      if (on) requestAnimationFrame(() => applyAll(stage, positions));
    },

    // Pass an action through to any widget that wants it (the pet reacts to
    // these; the data-driven widgets ignore them).
    action(kind, detail) {
      for (const m of mounted) m.handle?.action?.(kind, detail);
    },

    destroy() {
      for (const m of mounted) m.handle?.destroy?.();
      ro?.disconnect();
      stage.remove();
    },
  };
}

// ---------------------------------------------------------------
//  DRAGGING
// ---------------------------------------------------------------
// Pointer events, so one code path covers mouse, finger and Apple Pencil.
// `touch-action: none` in the CSS is what stops a drag from scrolling the
// page underneath on iOS.
function makeDraggable(stage, frame, key, positions) {
  let dragging = false;
  let grabX = 0, grabY = 0;

  frame.addEventListener("pointerdown", (e) => {
    dragging = true;
    frame.classList.add("dragging");
    const r = frame.getBoundingClientRect();
    grabX = e.clientX - r.left;
    grabY = e.clientY - r.top;
    try { frame.setPointerCapture(e.pointerId); } catch {}
    // preventDefault stops the page scrolling under the drag on iOS, but it
    // also suppresses the default focus, so focus is moved by hand. The ring
    // only paints for keyboard users (:focus-visible), so this stays quiet.
    e.preventDefault();
    frame.focus();
  });

  frame.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const s = stage.getBoundingClientRect();
    // Where the widget's top-left wants to be, in stage coordinates.
    const x = e.clientX - s.left - grabX;
    const y = e.clientY - s.top - grabY;
    positions[key] = toFractions(stage, frame, x, y);
    place(stage, frame, positions[key]);
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    frame.classList.remove("dragging");
    savePositions(positions);
  };
  frame.addEventListener("pointerup", end);
  frame.addEventListener("pointercancel", end);

  // Keyboard nudging. 12px a press is small enough to be precise and large
  // enough to get somewhere; holding the key repeats it.
  frame.addEventListener("keydown", (e) => {
    const step = 12;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const cur = currentPixels(stage, frame, positions[key]);
    positions[key] = toFractions(stage, frame, cur.x + d[0], cur.y + d[1]);
    place(stage, frame, positions[key]);
    savePositions(positions);
  });
}

// ---------------------------------------------------------------
//  POSITION MATH
// ---------------------------------------------------------------
// A position is { fx, fy }, each 0–1, meaning "this far across the free space
// the stage leaves after the widget's own size is accounted for". 1,1 is the
// bottom-right corner, which is where widgets start.
function toFractions(stage, frame, x, y) {
  const freeW = Math.max(1, stage.clientWidth - frame.offsetWidth);
  const freeH = Math.max(1, stage.clientHeight - frame.offsetHeight);
  return {
    fx: Math.min(1, Math.max(0, x / freeW)),
    fy: Math.min(1, Math.max(0, y / freeH)),
  };
}

function currentPixels(stage, frame, pos) {
  const p = pos || { fx: 1, fy: 1 };
  return {
    x: p.fx * Math.max(0, stage.clientWidth - frame.offsetWidth),
    y: p.fy * Math.max(0, stage.clientHeight - frame.offsetHeight),
  };
}

function place(stage, frame, pos) {
  const { x, y } = currentPixels(stage, frame, pos);
  frame.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function applyAll(stage, positions) {
  // A hidden stage measures zero, and placing against zero would park every
  // widget in the top-left. Skip; setVisible() re-applies once it's on screen.
  if (!stage.clientWidth || !stage.clientHeight) return;
  for (const frame of stage.querySelectorAll(".cluster-widget")) {
    const key = frame.dataset.key;
    if (!positions[key]) positions[key] = { fx: 1, fy: 1 };   // default: the corner
    place(stage, frame, positions[key]);
  }
}

// ---------------------------------------------------------------
//  PERSISTENCE (per device, deliberately)
// ---------------------------------------------------------------
function loadPositions() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_POS) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch { return {}; }   // a corrupt value just means "start in the corner"
}

function savePositions(positions) {
  try { localStorage.setItem(LS_POS, JSON.stringify(positions)); } catch {}
}
