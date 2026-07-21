// toast.js — visible, plain-English messages (§13.1 "fail loudly and legibly").
// A silent console.error is useless to someone who can't open a console, so
// errors, confirmations, and hints all surface here as a dismissible banner
// with an optional "copy details" affordance.

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.getElementById("toasts");
  if (!container) {
    container = document.createElement("div");
    container.id = "toasts";
    document.body.appendChild(container);
  }
  return container;
}

// kind: "info" | "success" | "error"
export function toast(message, kind = "info", timeout = 5000, details = null) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");

  const msg = document.createElement("div");
  msg.className = "toast-msg";
  msg.textContent = message;
  el.appendChild(msg);

  if (details) {
    const copy = document.createElement("button");
    copy.textContent = "Copy details";
    copy.onclick = () => {
      navigator.clipboard?.writeText(typeof details === "string" ? details : JSON.stringify(details, null, 2));
      copy.textContent = "Copied";
    };
    el.appendChild(copy);
  }

  const close = document.createElement("button");
  close.textContent = "Dismiss";
  close.onclick = () => el.remove();
  el.appendChild(close);

  ensureContainer().appendChild(el);
  if (timeout > 0) setTimeout(() => el.remove(), timeout);
  return el;
}

// A global safety net: any uncaught error becomes a visible banner, so the
// app never just "does nothing" silently (§13.1).
export function installGlobalErrorBanner() {
  window.addEventListener("error", (e) => {
    toast("Something went wrong inside Dash.", "error", 9000, e.message + "\n" + (e.error?.stack || ""));
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason?.message || String(e.reason);
    toast("Something went wrong inside Dash.", "error", 9000, reason + "\n" + (e.reason?.stack || ""));
  });
}
