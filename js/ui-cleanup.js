// ui-cleanup.js — surgical UI simplification (August 2026).
// ===================================================================
// This module deliberately MOVES NO ACTION LOGIC. Sync, Read, Settings,
// Select and New remain the real buttons app.js created, with their real
// handlers still on them; this file only changes their visible marks on
// non-phone layouts.
//
// The Projects rail colour shortcut also uses Dash's existing data path:
// Store.setField(projectId, "color", hex). That is the same scalar field the
// project editor writes, so normal Store subscriptions, sync flushing and all
// existing groundStyle() readers continue to do the persistence/render work.

import { resolveHex } from "./theme.js";

const SYNC_MARK = "<—>";
const SETTINGS_MARK = "/////////////";
const SPEAKER_SVG = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor"/>
  <path d="M16 9.25c1.25 1.35 1.25 4.15 0 5.5M18.75 7c2.5 2.7 2.5 7.3 0 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`.trim();

function isPhoneUI() {
  try {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const shortSide = Math.min(window.innerWidth || Infinity, window.innerHeight || Infinity);
    return coarse && shortSide <= 600;
  } catch {
    return false;
  }
}

function markButton(button, kind, label, title, content) {
  if (!button) return;
  button.classList.add("dash-utility-btn", `dash-utility-${kind}`);
  if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
  if (button.title !== title) button.title = title;

  if (kind === "read") {
    if (button.dataset.dashUtilityContent !== "read") {
      button.innerHTML = SPEAKER_SVG;
      button.dataset.dashUtilityContent = "read";
    }
    return;
  }

  // app.js rewrites the Sync button's label as sync state changes. Reasserting
  // the visible mark here is harmless: the original element, onclick handler,
  // disabled state and status pill are untouched.
  if (button.textContent !== content || button.dataset.dashUtilityContent !== content) {
    button.replaceChildren();
    const mark = document.createElement("span");
    mark.className = "dash-utility-mark";
    mark.textContent = content;
    button.appendChild(mark);
    button.dataset.dashUtilityContent = content;
  }
}

function markSelectButton() {
  const button = document.getElementById("select-btn");
  if (!button) return;

  // app.js owns the state and rewrites the real text on every render. Leave
  // that text in the DOM (and therefore available to assistive tech), then let
  // CSS draw the circle over it. Only a tiny count datum is copied to a data
  // attribute so it can remain visible beside the mark while selection is on.
  button.dataset.dashSelect = "1";
  const active = button.getAttribute("aria-pressed") === "true";
  const text = (button.textContent || "").trim();
  const countMatch = /^Done\s*\((\d+)\)$/i.exec(text);
  const count = active && countMatch ? countMatch[1] : "";
  if (button.dataset.dashSelectCount !== count) button.dataset.dashSelectCount = count;

  const label = active
    ? (count ? `Done selecting, ${count} selected` : "Done selecting")
    : "Select entries";
  if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
  const title = active ? "Done selecting" : "Select";
  if (button.title !== title) button.title = title;
}

function findNewButton() {
  const marked = document.querySelector('.topbar [data-dash-new="1"]');
  if (marked) return marked;
  return [...document.querySelectorAll(".topbar button")].find((button) =>
    /^\s*[+＋]?\s*New\s*$/i.test(button.textContent || "")
  ) || null;
}

function markNewButton() {
  const button = findNewButton();
  if (!button) return;

  button.dataset.dashNew = "1";
  if (button.getAttribute("aria-label") !== "New item") button.setAttribute("aria-label", "New item");
  if (button.title !== "New") button.title = "New";

  if (button.dataset.dashNewContent === "ticket") return;
  const ticket = document.createElement("span");
  ticket.className = "dash-new-ticket";
  ticket.setAttribute("aria-hidden", "true");
  ticket.textContent = "+";
  button.replaceChildren(ticket);
  button.dataset.dashNewContent = "ticket";
}

function applyTopbarCleanup() {
  // Phone already has a purpose-built More menu and designed + New row. Keep
  // its readable action labels intact; this pass is for the desktop/tablet
  // instrument strip shown in the Projects workspace.
  if (isPhoneUI()) return;

  markSelectButton();
  markNewButton();
  markButton(document.getElementById("sync-btn"), "sync", "Sync now", "Sync now", SYNC_MARK);
  markButton(document.querySelector('[aria-label="Settings"]'), "settings", "Settings", "Settings", SETTINGS_MARK);
  markButton(
    document.querySelector('[aria-label="Read this view aloud"], [aria-label="Read"]'),
    "read", "Read", "Read", SPEAKER_SVG
  );
}

function removeDeskAllControl() {
  for (const button of document.querySelectorAll(".desk-page .pb-acts > button")) {
    if ((button.textContent || "").trim() === "← All") button.remove();
  }
}

// The mandatory desk-images bootstrap already exposes the live Store instance
// on this bridge before the app can render a Projects rail. Reusing it here
// avoids creating a second Store or a second persistence mechanism.
function liveStore() {
  return globalThis.__dashDeskImages?.store || null;
}

// This is the SAME native colour input as the previous pass, but it is no
// longer permanently anchored at (0, 0). Before opening it, contextmenu puts
// the 2px invisible anchor directly under the pointer. Chromium positions the
// native picker from the input's rendered box, so the picker now belongs to
// the project you actually right-clicked instead of the browser's top-left.
const projectColorInput = document.createElement("input");
projectColorInput.type = "color";
projectColorInput.className = "dash-project-color-input";
projectColorInput.tabIndex = -1;
projectColorInput.setAttribute("aria-hidden", "true");
document.body.appendChild(projectColorInput);

let projectColorId = null;
projectColorInput.addEventListener("change", () => {
  const store = liveStore();
  if (!store || !projectColorId || !store.get(projectColorId)) return;
  store.setField(projectColorId, "color", projectColorInput.value);
});

function anchorProjectColorPicker(clientX, clientY) {
  const size = 2;
  const x = Math.max(0, Math.min(window.innerWidth - size, Number(clientX) || 0));
  const y = Math.max(0, Math.min(window.innerHeight - size, Number(clientY) || 0));
  projectColorInput.style.left = `${x}px`;
  projectColorInput.style.top = `${y}px`;
}

function openProjectColorPicker(button, clientX, clientY) {
  const store = liveStore();
  const project = store?.get(button?.dataset?.id);
  if (!store || !project || project.type !== "project") return false;

  projectColorId = project.id;
  projectColorInput.value = resolveHex(
    project.color || store.typeDef(project.type)?.color || "green"
  );
  anchorProjectColorPicker(clientX, clientY);

  try {
    if (typeof projectColorInput.showPicker === "function") projectColorInput.showPicker();
    else projectColorInput.click();
  } catch {
    projectColorInput.click();
  }
  return true;
}

document.addEventListener("contextmenu", (event) => {
  const button = event.target?.closest?.("[data-project-index-item]");
  if (!button || !button.closest(".project-index-list")) return;

  // Suppress the browser context menu before opening the native colour picker;
  // both are responding to the same right-click and should not compete.
  event.preventDefault();
  openProjectColorPicker(button, event.clientX, event.clientY);
}, true);

// app.js updates Sync text and Select state after this module has run, and Desk
// banners are mounted only when a project is entered. One tiny observer keeps
// those visual adaptations true as the existing components update; it does not
// render any app content or own any action state.
let applying = false;
const observer = new MutationObserver(() => {
  if (applying) return;
  applying = true;
  try {
    applyTopbarCleanup();
    removeDeskAllControl();
  } finally {
    applying = false;
  }
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

applyTopbarCleanup();
removeDeskAllControl();
window.addEventListener("pageshow", () => {
  applyTopbarCleanup();
  removeDeskAllControl();
});
