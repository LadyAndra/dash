// device.js — stable per-device identity (§3, §6)
// Each device writes ONLY its own log file (log-<device>.jsonl), which
// is what makes iCloud never have to merge concurrent writes to one file.
// The id is minted once and kept in localStorage; the label is human-set
// so merge notes can say "edited on iPhone" rather than a random string.

import { ulid } from "./ulid.js";

const ID_KEY = "dash.device.id";
const LABEL_KEY = "dash.device.label";

export function getDeviceId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = ulid();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

// short slug used in the log filename: log-<slug>.jsonl
export function getDeviceSlug() {
  return getDeviceLabel().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "device";
}

export function getDeviceLabel() {
  let label = localStorage.getItem(LABEL_KEY);
  if (!label) {
    label = guessLabel();
    localStorage.setItem(LABEL_KEY, label);
  }
  return label;
}

export function setDeviceLabel(label) {
  localStorage.setItem(LABEL_KEY, label.trim() || "Device");
}

function guessLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Device";
}

// Is this a touch device (iPhone, iPad, any touch-first screen)?
//
// Dash is DESKTOP ONLY. A touch device gets one plain screen saying so, and
// none of the app. The test is the PRIMARY pointer, not the screen size: an
// iPad is as much a "no" as an iPhone. A laptop with a touchscreen reports its
// trackpad as the primary pointer, so it reads as a desktop, which is the
// answer we want. A small browser window on a Mac is still a desktop and still
// gets the app.
//
// This is the ONE place that decides. app.js and ui-cleanup.js ask it.
export function isTouchDevice() {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}
