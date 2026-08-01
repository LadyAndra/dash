// focus-debug.js — TEMPORARY diagnostic. Safe to delete once the capture-box
// focus bug is closed.
// ============================================================================
// Loaded only when the URL has ?focusdebug=1, via a dynamic import in app.js,
// so it costs nothing on a normal boot and is deliberately NOT in the service
// worker's SHELL list (debugging happens online).
//
// What it does: answers the one question that matters — WHO took focus off the
// capture box — by recording every plausible culprit with a stack trace, and
// showing it in a panel on screen with a Copy button, so no devtools are needed.
//
// It only observes. It never changes focus, never touches the store, and every
// listener is wrapped so a fault in here can't break the app.

const MAX = 60;
const log = [];
let panel, body, t0 = performance.now();

const T = () => ((performance.now() - t0) / 1000).toFixed(1) + "s";

function desc(n) {
  if (!n) return "nothing (focus fell to nowhere)";
  if (n === document.body) return "<body> (focus fell to nowhere)";
  const tag = (n.nodeName || "?").toLowerCase();
  const cls = typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\s+/)[0] : "";
  const id = n.id ? "#" + n.id : "";
  const txt = (n.textContent || "").trim().slice(0, 20);
  return `<${tag}>${id}${cls}${txt ? ` "${txt}"` : ""}`;
}

// Where did the call come from? Skip the frames belonging to this file.
function origin() {
  const raw = (new Error().stack || "").split("\n").slice(1);
  const line = raw.find(l => !l.includes("focus-debug.js")) || raw[0] || "";
  return line.trim().replace(/^at\s+/, "").replace(/^.*\/dash\//, "").slice(0, 90);
}

function add(what, detail) {
  log.push(`[${T()}] ${what}${detail ? " — " + detail : ""}`);
  if (log.length > MAX) log.shift();
  if (body) { body.textContent = log.join("\n"); body.scrollTop = body.scrollHeight; }
}

const isCapture = (n) => !!(n && n.closest && n.closest(".capture"));

export function start() {
  buildPanel();
  add("watching. type in the capture box until it goes dead, then press Copy");

  // --- the direct accusation: someone calling .blur() or .focus() by hand ---
  const protoBlur = HTMLElement.prototype.blur;
  HTMLElement.prototype.blur = function () {
    try { if (isCapture(this)) add("!! something called .blur() ON THE CAPTURE BOX", origin()); } catch {}
    return protoBlur.apply(this, arguments);
  };
  const protoFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function () {
    try {
      if (!isCapture(this) && document.activeElement && isCapture(document.activeElement)) {
        add("!! something called .focus() on " + desc(this) + ", taking it off the capture box", origin());
      }
    } catch {}
    return protoFocus.apply(this, arguments);
  };

  // --- focus actually leaving the box ---
  document.addEventListener("focusout", (e) => {
    try {
      if (!isCapture(e.target)) return;
      add("focus LEFT the box", `went to: ${desc(e.relatedTarget)} | box still on page: ${document.contains(e.target)} | page has focus: ${document.hasFocus()}`);
    } catch {}
  }, true);

  document.addEventListener("focusin", (e) => {
    try { add("focus arrived on " + desc(e.target)); } catch {}
  }, true);

  // --- the box being rebuilt underneath you ---
  try {
    const vp = document.getElementById("viewport");
    if (vp) {
      let known = document.querySelector(".capture textarea");
      new MutationObserver(() => {
        const now = document.querySelector(".capture textarea");
        if (now !== known) {
          known = now;
          add("the sheet was REDRAWN (capture box replaced)", "focus now on " + desc(document.activeElement));
        }
      }).observe(vp, { childList: true, subtree: true });
    }
  } catch {}

  // --- the window/tab itself losing focus (typing would go elsewhere) ---
  window.addEventListener("blur", () => add("the WINDOW lost focus (clicked another app, or the address bar)"));
  window.addEventListener("focus", () => add("the window got focus back"));
  document.addEventListener("visibilitychange", () => add("tab visibility: " + document.visibilityState));

  // --- did the field get switched off rather than unfocused? ---
  setInterval(() => {
    try {
      const b = document.querySelector(".capture textarea");
      if (!b) return add("!! the capture box is not on the page at all");
      if (b.disabled) add("!! the capture box is DISABLED");
      if (b.readOnly) add("!! the capture box is READ-ONLY");
    } catch {}
  }, 2000);
}

function buildPanel() {
  panel = document.createElement("div");
  panel.style.cssText = [
    "position:fixed", "top:8px", "left:8px", "z-index:9999",
    "width:min(520px,calc(100vw - 16px))", "max-height:42vh",
    "display:flex", "flex-direction:column",
    "background:var(--paper,#f4efe6)", "color:var(--text-primary,#1a1a1a)",
    "border:2px solid var(--text-primary,#1a1a1a)", "border-radius:6px",
    "font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace",
    "box-shadow:0 6px 24px rgba(0,0,0,.25)",
  ].join(";");

  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid currentColor;flex:0 0 auto";
  const title = document.createElement("strong");
  title.textContent = "focus debug";
  title.style.cssText = "flex:1;letter-spacing:.08em;text-transform:uppercase;font-size:11px";

  const mkBtn = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "font:inherit;padding:3px 10px;min-height:0;cursor:pointer;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit";
    b.addEventListener("click", fn);
    // never let the panel itself steal focus from the thing being tested
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    return b;
  };

  const copy = mkBtn("Copy", async () => {
    const text = log.join("\n");
    try { await navigator.clipboard.writeText(text); copy.textContent = "Copied ✓"; }
    catch { body.focus?.(); copy.textContent = "select & copy"; }
    setTimeout(() => (copy.textContent = "Copy"), 1600);
  });
  const clear = mkBtn("Clear", () => { log.length = 0; t0 = performance.now(); body.textContent = ""; });
  const hide = mkBtn("Hide", () => panel.remove());

  bar.append(title, copy, clear, hide);

  body = document.createElement("pre");
  body.style.cssText = "margin:0;padding:8px;overflow:auto;white-space:pre-wrap;word-break:break-word;flex:1 1 auto";

  panel.append(bar, body);
  document.body.appendChild(panel);
}
