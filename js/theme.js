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
//
// As of August 2026 a colour may ALSO be a literal hex, because projects can
// be given any colour from a picker. A name still re-themes; a hex is a hex,
// which is the deal you accept when you choose an exact colour. Everything
// that draws a colour goes through here, so both kinds work everywhere.
export function colorToken(name) {
  if (!name) return "var(--color-gray)";
  if (isHex(name)) return name;
  return `var(--color-${name})`;
}
export function tintToken(name) {
  if (!name) return "var(--tint-gray)";
  if (isHex(name)) return name;   // no tint variant of a custom colour
  return `var(--tint-${name})`;
}

export function isHex(v) {
  return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

// ===================================================================
//  COLOUR MATHS — luminance, contrast, and which ink to put on top
// ===================================================================
// Why this lives here and not in a view: Settings, the item editor and every
// colour block all need the same answers, and there must be exactly one
// definition of "is this readable" in the app.
//
// The policy, decided August 2026: a colour you pick is used EXACTLY as you
// picked it. Dash never quietly darkens it to make itself comfortable. What
// Dash does instead is (a) tell you the contrast ratio before you commit, and
// (b) choose the more readable of its two inks to put on top — which changes
// nothing about your colour, only what's written over it.

function expand(hex) {
  const h = hex.trim().replace("#", "");
  return h.length === 3 ? h.split("").map(c => c + c).join("") : h;
}

export function hexToRgb(hex) {
  const h = expand(hex);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

// WCAG relative luminance.
export function luminance(hex) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [r, g, b] = hexToRgb(hex).map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio between two hexes. 4.5 is the AA floor for normal text,
// 3.0 for large text and for meaningful non-text boundaries.
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Read a token's CURRENT computed value as a hex — so the maths works on
// whatever theme is live, including one loaded from a JSON file.
export function tokenHex(token, fallback = "#000000") {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (isHex(v)) return v;
    // getComputedStyle may hand back rgb() instead of the authored hex
    const m = v.match(/^rgba?\(([^)]+)\)/);
    if (m) {
      const [r, g, b] = m[1].split(",").map(n => parseInt(n, 10));
      return "#" + [r, g, b].map(n => n.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* fall through */ }
  return fallback;
}

// Resolve any stored colour value — palette name OR hex — to a real hex, so
// it can be measured. Named colours are read from the live theme.
export function resolveHex(value, fallback = "#6a6252") {
  if (!value) return fallback;
  if (isHex(value)) return value.trim();
  return tokenHex(`--color-${value}`, fallback);
}

// The two inks Dash has to write on a colour block: its light one and its
// dark one. Both are real tokens and both keep their character across
// themes, which is why they're the candidates rather than --text-on-accent
// (which flips, and so can't be compared against itself).
export function inkCandidates() {
  return { light: tokenHex("--ink-on-mount", "#efe8d8"), dark: tokenHex("--mount", "#17150f") };
}

// Given a ground, which ink reads better on it? Returns { hex, ratio }.
// This is NOT an adjustment to the chosen colour — the ground is untouched.
export function inkFor(groundHex) {
  const { light, dark } = inkCandidates();
  const cl = contrast(light, groundHex), cd = contrast(dark, groundHex);
  return cl >= cd ? { hex: light, ratio: cl } : { hex: dark, ratio: cd };
}

// The two questions worth asking about any colour before you commit to it,
// answered in the words the picker shows you.
export function colorReport(value) {
  const hex = resolveHex(value);
  const paper = tokenHex("--surface", "#f2ece0");
  const asText = contrast(hex, paper);
  const ink = inkFor(hex);
  return {
    hex,
    asText,                          // the colour used as small text on paper
    asBlock: ink.ratio,              // Dash's best ink written on the colour
    ink: ink.hex,
    textOk: asText >= 4.5,
    blockOk: ink.ratio >= 4.5,
  };
}

// ===================================================================
//  THE ACCENT
// ===================================================================
// Ember is the default, not the only option. Setting a custom accent writes
// the same three tokens the rest of the app already reads, so nothing
// downstream changes: --ember and --accent-2 become your colour, and
// --ember-ink becomes whichever ink reads on it.
//
// It's written into the SAME saved-theme object that loadSavedTheme() already
// restores, so a custom accent survives a reload with no new storage key and
// no new startup path.
const ACCENT_TOKENS = ["--ember", "--accent-2", "--ember-ink"];

function readSavedTheme() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null") || { tokens: {} }; }
  catch { return { tokens: {} }; }
}
function writeSavedTheme(theme) {
  localStorage.setItem(LS_KEY, JSON.stringify(theme));
}

export function getAccent() {
  const saved = readSavedTheme();
  const v = saved.tokens && saved.tokens["--ember"];
  return isHex(v) ? v : null;      // null = still using the built-in ember
}

export function defaultAccentHex() {
  // read it off a fresh element so a custom accent already on :root
  // doesn't answer the question "what is ember normally?"
  return "#b23a14";
}

export function setAccent(hex) {
  if (!isHex(hex)) return false;
  const ink = inkFor(hex).hex;
  const root = document.documentElement;
  root.style.setProperty("--ember", hex);
  root.style.setProperty("--accent-2", hex);
  root.style.setProperty("--ember-ink", ink);

  const theme = readSavedTheme();
  theme.tokens = theme.tokens || {};
  theme.tokens["--ember"] = hex;
  theme.tokens["--accent-2"] = hex;
  theme.tokens["--ember-ink"] = ink;
  writeSavedTheme(theme);
  return true;
}

export function resetAccent() {
  const root = document.documentElement;
  for (const t of ACCENT_TOKENS) root.style.removeProperty(t);
  const theme = readSavedTheme();
  if (theme.tokens) for (const t of ACCENT_TOKENS) delete theme.tokens[t];
  writeSavedTheme(theme);
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
