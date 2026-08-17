// mobile-chrome.js — phone-only hierarchy for Dash's existing app controls.
//
// This file deliberately DOES NOT duplicate any action logic from app.js.
// It moves the real buttons app.js already owns, so New / Select / Read /
// Settings / Sync keep exactly the same handlers and state updates.

const PHONE_SHORT_SIDE_MAX = 600;
let installed = false;

function isPhoneUI() {
  try {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const shortSide = Math.min(window.innerWidth || Infinity, window.innerHeight || Infinity);
    return coarse && shortSide <= PHONE_SHORT_SIDE_MAX;
  } catch {
    return false;
  }
}

function closeMore() {
  const wrap = document.getElementById("phone-more-wrap");
  const btn = document.getElementById("phone-more-btn");
  if (!wrap || !btn) return;
  wrap.classList.remove("is-open");
  btn.setAttribute("aria-expanded", "false");
}

function installPhoneChrome() {
  if (installed || !isPhoneUI()) return;

  const topbar = document.querySelector(".topbar");
  const tabs = document.getElementById("view-tabs");
  const selectBtn = document.getElementById("select-btn");
  const syncBtn = document.getElementById("sync-btn");
  const syncPill = document.getElementById("sync-pill");
  const mergeBtn = document.getElementById("merge-btn");
  const bandTop = document.querySelector(".band-top");
  const newBtn = [...document.querySelectorAll(".topbar .btn")]
    .find((b) => /new/i.test(b.textContent || ""));
  const readBtn = document.querySelector('.topbar [aria-label="Read this view aloud"]');
  const settingsBtn = document.querySelector('.topbar [aria-label="Settings"]');

  // app.js builds chrome synchronously, but the module can finish downloading
  // first on a very cold cache. If anything is missing, try again next frame.
  if (!topbar || !tabs || !selectBtn || !syncBtn || !syncPill || !bandTop || !newBtn || !readBtn || !settingsBtn) {
    requestAnimationFrame(installPhoneChrome);
    return;
  }

  installed = true;
  document.documentElement.classList.add("phone-chrome-on");

  // + New is the one permanent verb on the phone. It is still app.js's real
  // button; this class only gives it a phone-specific visual treatment.
  newBtn.classList.add("phone-new-btn");

  const actionRow = document.createElement("div");
  actionRow.className = "phone-action-row";
  actionRow.id = "phone-action-row";

  const moreWrap = document.createElement("div");
  moreWrap.className = "phone-more-wrap";
  moreWrap.id = "phone-more-wrap";

  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "phone-more-btn";
  moreBtn.id = "phone-more-btn";
  moreBtn.setAttribute("aria-label", "More actions");
  moreBtn.setAttribute("aria-expanded", "false");
  moreBtn.setAttribute("aria-controls", "phone-more-menu");
  moreBtn.textContent = "•••";

  const menu = document.createElement("div");
  menu.className = "phone-more-menu";
  menu.id = "phone-more-menu";
  menu.setAttribute("role", "menu");

  // These are the original controls, moved rather than cloned. app.js can
  // continue finding them by id and updating their labels/state normally.
  readBtn.classList.add("phone-menu-action");
  settingsBtn.classList.add("phone-menu-action");
  syncBtn.classList.add("phone-menu-action");
  if (mergeBtn) mergeBtn.classList.add("phone-menu-action");
  menu.append(readBtn, settingsBtn, syncBtn);
  if (mergeBtn) menu.append(mergeBtn);

  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !moreWrap.classList.contains("is-open");
    moreWrap.classList.toggle("is-open", open);
    moreBtn.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("click", (e) => {
    // Let the original action run, then get the menu out of the way.
    if (e.target.closest("button")) closeMore();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!moreWrap.contains(e.target)) closeMore();
  }, { capture: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeMore(); moreBtn.focus(); }
  });

  moreWrap.append(moreBtn, menu);
  actionRow.append(newBtn, syncPill, moreWrap);
  tabs.insertAdjacentElement("afterend", actionRow);

  // Select belongs to the collection currently on screen, not the app-wide
  // verb strip. app.js still shows/hides and relabels this same button.
  selectBtn.classList.add("band-select-btn");
  bandTop.append(selectBtn);

  // When sync is healthy, the phone needs only the green dot. When something
  // needs attention, app.js changes the status class/label and the text comes
  // back automatically via CSS.
  syncPill.setAttribute("title", "Sync status");
}

installPhoneChrome();
window.addEventListener("pageshow", installPhoneChrome);
