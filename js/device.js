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

// Is this a phone? One answer for the whole app (app.js, mobile-chrome.js and
// ui-cleanup.js each used to carry their own copy).
//
// Phone mode is intentionally capture-first for now. Project/Desk is a large
// workspace feature and is deliberately not offered on a phone while its
// mobile information architecture is unresolved. It uses the SHORT side rather
// than viewport width so rotating an iPhone cannot accidentally turn Project
// back on; iPad-sized coarse-pointer devices remain eligible.
export const PHONE_SHORT_SIDE_MAX = 600;

export function isPhoneUI() {
  try {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const shortSide = Math.min(window.innerWidth || Infinity, window.innerHeight || Infinity);
    return coarse && shortSide <= PHONE_SHORT_SIDE_MAX;
  } catch {
    return false;
  }
}
