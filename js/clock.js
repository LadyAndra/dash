// clock.js — hybrid timestamp for deterministic merge ordering (§6.1)
// ---------------------------------------------------------------
// Every operation carries a timestamp used for last-writer-wins on
// scalar fields. Plain wall-clock time is unsafe: two devices' clocks
// drift, so a later edit could look earlier. A hybrid logical clock
// combines wall time with a per-device counter so ordering is stable
// even under clock skew, and ties break by device id (never random).
//
// Format returned: { wall, count, device } — compared in that order.

import { getDeviceId } from "./device.js";

const STORAGE_KEY = "dash.hlc.count";
let lastWall = 0;
let counter = 0;

// restore counter across reloads so ordering is monotonic on a device
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (saved) { lastWall = saved.wall || 0; counter = saved.count || 0; }
} catch { /* first run; fine */ }

export function now() {
  const wall = Date.now();
  if (wall > lastWall) {
    lastWall = wall;
    counter = 0;
  } else {
    // same millisecond (or clock went backwards): bump the counter
    counter += 1;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ wall: lastWall, count: counter }));
  } catch { /* storage full/blocked; ordering still works this session */ }
  return { wall: lastWall, count: counter, device: getDeviceId() };
}

// -1 if a<b, 1 if a>b, 0 if identical
export function compare(a, b) {
  if (a.wall !== b.wall) return a.wall < b.wall ? -1 : 1;
  if (a.count !== b.count) return a.count < b.count ? -1 : 1;
  if (a.device !== b.device) return a.device < b.device ? -1 : 1;
  return 0;
}
