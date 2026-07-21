// theme.js — runtime theming (§10). A theme is a JSON map of token->value.
// Applying it writes CSS custom properties on :root, so switching or live-
// tweaking a theme touches ZERO component code. This is the mechanism that
// lets Andra restyle the whole app later from one JSON file / theme editor.

import { toast } from "./ui/toast.js";

const LS_KEY = "dash.theme";
const LS_SCALE = "dash.textScale";
const LS_DARK = "dash.dark";

// Item type/status colors are stored as names ("green", "clay"…) and mapped
// to the actual token here, so data-driven colors re-theme cleanly (§10).
export function colorToken(name) {
  if (!name) return "var(--color-gray)";
  return `var(--color-${name})`;
}
export function tintToken(name) {
  if (!name) return "var(--tint-gray)";
  return `var(--tint-${name})`;
}

export function applyTheme(themeObj) {
  if (!themeObj || !themeObj.tokens) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeObj.tokens)) {
    root.style.setProperty(k.startsWith("--") ? k : `--${k}`, v);
  }
}

export function loadSavedTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (saved) applyTheme(saved);
  } catch { /* ignore corrupt saved theme */ }

  const scale = localStorage.getItem(LS_SCALE);
  if (scale) document.documentElement.style.setProperty("--text-scale", scale);

  if (localStorage.getItem(LS_DARK) === "1") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

export function setTextScale(scale) {
  document.documentElement.style.setProperty("--text-scale", String(scale));
  localStorage.setItem(LS_SCALE, String(scale));
}
export function getTextScale() {
  return parseFloat(localStorage.getItem(LS_SCALE) || "1");
}

export function toggleDark() {
  const root = document.documentElement;
  const isDark = root.getAttribute("data-theme") === "dark";
  if (isDark) { root.removeAttribute("data-theme"); localStorage.setItem(LS_DARK, "0"); }
  else { root.setAttribute("data-theme", "dark"); localStorage.setItem(LS_DARK, "1"); }
}

// Try to load Dash/themes/default.json from the connected folder (Mac).
export async function loadThemeFromFolder(dirHandle) {
  if (!dirHandle) return;
  try {
    const themes = await dirHandle.getDirectoryHandle("themes", { create: true });
    const h = await themes.getFileHandle("default.json");
    const text = await (await h.getFile()).text();
    const theme = JSON.parse(text);
    applyTheme(theme);
    localStorage.setItem(LS_KEY, JSON.stringify(theme));
  } catch { /* no custom theme yet — the built-in default is fine */ }
}
