// desk-images-runtime.js — reference images on the Project Desk.
// ============================================================
// Images are spatial reference material, not Entries. This is deliberately a
// narrow layer over the existing Desk: cards, clips, post-its, Peek and project
// navigation keep their own code and data shapes.
//
// Each image is a namespaced viewState record on the PROJECT item:
//
//   deskimg:<projectId>:<iid> = { pos, z, clip: assetMeta, removed, created }
//
// `clip` is the existing merge-safe third viewState field; for deskimg:* keys
// it carries {hash, ext, mime, size:{w,h}, rotation}. Existing Desk readers only
// inspect desk:<projectId>, so the namespaces never meet. No Entry is created.

import { ulid } from "./ulid.js";
import { now as clockNow } from "./clock.js";
import { ingestDeskImage, blobObjectURL, deleteBlob } from "./blobs.js";
import { IMAGE_BANNER_SVG } from "./icons.js";
import { toast } from "./ui/toast.js";
import { DESK_W, DESK_H, ORIGIN, Z_EXPANDED } from "./desk.js";
import {
  initialDeskImageSize,
  freshDeskImageRotation,
  proportionalResize,
  stepDeskLayer,
} from "./desk-images.js";

const bridge = globalThis.__dashDeskImages;
const PREFIX = "deskimg:";
const LIMIT = 20;
const LOCAL_DB = "dash";
const LOCAL_STORE = "kv";
const live = new Map(); // key -> { node, img, hash, url, loading, retries, retryTimer }
const hiddenUntilDurable = new Set();
let scheduled = false;
let held = null;
let openMenu = null;

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    reconcile();
  });
}

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", schedule);
// app.js may already have drawn the project before this optional module finishes
// loading, so do not depend on a future mutation to get the first pass.
schedule();

function currentDesk() {
  const store = bridge && bridge.store;
  const page = document.querySelector(".desk-page");
  const surface = page && page.querySelector(".desk-surface");
  const view = page && page.querySelector(".desk-viewport");
  if (!store || !page || !surface || !view) return null;

  // The Desk controller already exposes the stable project id to its tests and
  // direct callers. Use that instead of inferring identity from visible text.
  const pid = page._deskController && page._deskController.projectId;
  if (!pid) return null;
  const project = store.get(pid);
  if (!project || project._deleted) return null;
  return { store, project, page, surface, view };
}

function imageRecords(project) {
  const prefix = `${PREFIX}${project.id}:`;
  const out = [];
  for (const [key, rec] of Object.entries(project.viewState || {})) {
    if (!key.startsWith(prefix) || !rec || rec.removed || !rec.pos) continue;
    if (hiddenUntilDurable.has(key)) continue;
    const meta = rec.clip;
    if (!meta || !meta.hash || !meta.ext || !meta.size) continue;
    out.push({ key, iid: key.slice(prefix.length), rec, meta, z: Number(rec.z) || 0 });
  }
  out.sort((a, b) => (a.z - b.z) || a.key.localeCompare(b.key));
  return out;
}

function reconcile() {
  const d = currentDesk();
  if (!d) {
    clearLive();
    return;
  }
  installAddButton(d);
  installFileDrop(d);
  const records = imageRecords(d.project);
  const wanted = new Set(records.map(x => x.key));

  for (const r of records) {
    let ctl = live.get(r.key);
    if (!ctl) {
      const node = document.createElement("div");
      node.className = "desk-image-object";
      node.dataset.imageKey = r.key;
      node.tabIndex = 0;
      node.setAttribute("aria-label", "Reference image");

      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;

      const handle = document.createElement("span");
      handle.className = "desk-image-resize";
      handle.setAttribute("aria-hidden", "true");
      node.append(img, handle);
      wireImageNode(node, handle);

      ctl = {
        node, img,
        hash: null, url: null, loading: false,
        retries: 0, retryTimer: null,
      };
      live.set(r.key, ctl);
      d.surface.appendChild(node);
    } else if (ctl.node.parentNode !== d.surface) {
      d.surface.appendChild(ctl.node);
    }
    dressImage(ctl, r);
  }

  for (const [key, ctl] of [...live]) {
    if (wanted.has(key)) continue;
    revoke(ctl);
    ctl.node.remove();
    live.delete(key);
  }

  if (held) paintHeldLayers(d, held);
}

function clearLive() {
  for (const [, ctl] of live) {
    revoke(ctl);
    ctl.node.remove();
  }
  live.clear();
}

function dressImage(ctl, r) {
  const { node } = ctl;
  node.dataset.imageKey = r.key;

  // A background refresh may arrive during a pointer gesture. Keep the local
  // preview the pointer owns; model geometry is painted again after release.
  if (!node.classList.contains("is-dragging")) {
    node.style.left = Math.round(r.rec.pos.x) + "px";
    node.style.top = Math.round(r.rec.pos.y) + "px";
    node.style.removeProperty("--image-dx");
    node.style.removeProperty("--image-dy");
  }
  if (!node.classList.contains("is-resizing")) {
    node.style.width = Math.round(r.meta.size.w) + "px";
    node.style.height = Math.round(r.meta.size.h) + "px";
  }
  node.style.zIndex = String(10 + heldZ(`image:${r.key}`, r.z));
  node.style.setProperty("--image-rot", `${Number(r.meta.rotation) || 0}deg`);

  if (ctl.hash !== r.meta.hash) {
    resetAsset(ctl, r.meta.hash);
    requestAsset(ctl, r.meta);
  } else if (!ctl.url && !ctl.loading && !ctl.retryTimer && ctl.retries < 20) {
    requestAsset(ctl, r.meta);
  }
}

function resetAsset(ctl, hash) {
  if (ctl.retryTimer) clearTimeout(ctl.retryTimer);
  ctl.retryTimer = null;
  if (ctl.url) URL.revokeObjectURL(ctl.url);
  ctl.url = null;
  ctl.loading = false;
  ctl.retries = 0;
  ctl.hash = hash;
  ctl.img.removeAttribute("src");
  ctl.node.classList.remove("is-missing");
}

function requestAsset(ctl, meta) {
  if (!ctl.node.isConnected || ctl.loading || ctl.hash !== meta.hash) return;
  ctl.loading = true;
  const expected = meta.hash;
  blobObjectURL(expected, meta.mime).then(url => {
    ctl.loading = false;
    if (ctl.hash !== expected || !ctl.node.isConnected) {
      if (url) URL.revokeObjectURL(url);
      return;
    }
    if (!url) {
      scheduleAssetRetry(ctl, meta);
      return;
    }
    if (ctl.url) URL.revokeObjectURL(ctl.url);
    ctl.url = url;
    ctl.retries = 0;
    ctl.node.classList.remove("is-missing");
    ctl.img.src = url;
  }).catch(() => {
    ctl.loading = false;
    scheduleAssetRetry(ctl, meta);
  });
}

function scheduleAssetRetry(ctl, meta) {
  ctl.node.classList.add("is-missing");
  if (ctl.retryTimer || ctl.retries >= 20) return;
  ctl.retries++;
  ctl.retryTimer = setTimeout(() => {
    ctl.retryTimer = null;
    if (ctl.hash === meta.hash && ctl.node.isConnected) requestAsset(ctl, meta);
  }, 3000);
}

function revoke(ctl) {
  if (ctl.retryTimer) clearTimeout(ctl.retryTimer);
  ctl.retryTimer = null;
  if (ctl.url) URL.revokeObjectURL(ctl.url);
  ctl.url = null;
  ctl.hash = null;
  ctl.loading = false;
  ctl.retries = 0;
  if (ctl.img) ctl.img.removeAttribute("src");
}

function installAddButton(d) {
  const acts = d.page.querySelector(".pb-acts");
  if (!acts || acts.querySelector(".banner-image")) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
  input.hidden = true;
  input.addEventListener("change", async () => {
    const files = [...(input.files || [])];
    input.value = "";
    const now = currentDesk();
    if (now) await addFiles(files, now, null);
  });

  const btn = document.createElement("button");
  btn.className = "btn banner-image";
  btn.type = "button";
  btn.innerHTML = IMAGE_BANNER_SVG;
  btn.title = "Add image";
  btn.setAttribute("aria-label", "Add image");
  btn.addEventListener("click", () => input.click());

  // Put image beside the existing clip/glance desk tools, not among Entry/Edit.
  const glance = acts.querySelector(".banner-glance");
  acts.insertBefore(btn, glance || null);
  acts.appendChild(input);
}

function installFileDrop(d) {
  if (d.view.dataset.imageDropWired) return;
  d.view.dataset.imageDropWired = "1";

  d.view.addEventListener("dragover", e => {
    if (!(e.dataTransfer && e.dataTransfer.types && [...e.dataTransfer.types].includes("Files"))) return;
    e.preventDefault();
    d.view.classList.add("is-image-drop");
  });
  d.view.addEventListener("dragleave", e => {
    if (e.relatedTarget && d.view.contains(e.relatedTarget)) return;
    d.view.classList.remove("is-image-drop");
  });
  d.view.addEventListener("drop", async e => {
    if (!(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)) return;
    e.preventDefault();
    d.view.classList.remove("is-image-drop");
    const now = currentDesk();
    if (now) await addFiles([...e.dataTransfer.files], now, { x: e.clientX, y: e.clientY });
  });
}

async function addFiles(files, d, point) {
  let count = imageRecords(d.project).length;
  for (const file of files) {
    if (count >= LIMIT) {
      toast(`This desk already has ${LIMIT} images.`, "info", 3500);
      break;
    }

    let asset = null;
    let key = null;
    try {
      asset = await ingestDeskImage(file);
      const size = initialDeskImageSize(asset.width, asset.height);
      const pos = positionForNewImage(d, size, point, count);
      const iid = ulid();
      key = `${PREFIX}${d.project.id}:${iid}`;
      const ts = clockNow();
      const meta = {
        hash: asset.hash,
        ext: asset.ext,
        mime: asset.mime,
        size,
        rotation: freshDeskImageRotation(),
      };
      const z = maxDeskZ(d) + 1;
      const op = {
        op: "vs", itemId: d.project.id, key, action: "add",
        value: { pos, z, clip: meta, created: new Date(ts.wall).toISOString() }, ts,
      };

      // Store emits immediately, but the image layer deliberately withholds the
      // object until the local snapshot write succeeds. If you ever see the
      // picture once, a reload already has the record needed to put it back.
      hiddenUntilDurable.add(key);
      d.store._applyOp(op, true);
      try {
        await persistLocalSnapshot(d.store);
      } catch (err) {
        d.store._applyOp({ op: "vs", itemId: d.project.id, key, action: "remove", ts: clockNow() }, true);
        hiddenUntilDurable.delete(key);
        try { await persistLocalSnapshot(d.store); } catch { /* original failure is the useful one */ }
        if (!hashReferenced(d.store, asset.hash)) {
          try { await deleteBlob(asset.hash); } catch {}
        }
        throw new Error("Dash couldn't save that image locally.");
      }
      hiddenUntilDurable.delete(key);

      try {
        await bridge.sync?.queueBlob(asset.hash, asset.ext);
      } catch {
        toast("The image is saved here, but Dash couldn't queue it for sync yet.", "info", 5000);
      }

      count++;
      point = point ? { x: point.x + 20, y: point.y + 20 } : null;
      schedule();
    } catch (err) {
      if (key) hiddenUntilDurable.delete(key);
      toast(err && err.message ? err.message : `Couldn't add ${file.name}.`, "error", 5000);
    }
  }
}

async function persistLocalSnapshot(store) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOCAL_STORE)) req.result.createObjectStore(LOCAL_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return await new Promise((resolve, reject) => {
    const req = db.transaction(LOCAL_STORE, "readwrite").objectStore(LOCAL_STORE)
      .put(store.toSnapshot(), "snapshot");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function positionForNewImage(d, size, point, n) {
  const r = d.view.getBoundingClientRect();
  const x = point
    ? point.x - r.left + d.view.scrollLeft - ORIGIN - size.w / 2
    : d.view.scrollLeft + d.view.clientWidth / 2 - size.w / 2 + (n % 4) * 18;
  const y = point
    ? point.y - r.top + d.view.scrollTop - ORIGIN - size.h / 2
    : d.view.scrollTop + d.view.clientHeight / 2 - size.h / 2 + (n % 4) * 18;
  return clampImagePos({ x, y }, size);
}

function clampImagePos(pos, size) {
  return {
    x: Math.round(Math.max(0, Math.min(Number(pos.x) || 0, Math.max(0, DESK_W - ORIGIN - size.w)))),
    y: Math.round(Math.max(0, Math.min(Number(pos.y) || 0, Math.max(0, DESK_H - ORIGIN - size.h)))),
  };
}

function fitImageSizeToDesk(size, pos) {
  const availW = Math.max(1, DESK_W - ORIGIN - (Number(pos.x) || 0));
  const availH = Math.max(1, DESK_H - ORIGIN - (Number(pos.y) || 0));
  const k = Math.min(1, availW / size.w, availH / size.h);
  if (k >= 1) return size;
  return { w: Math.max(1, Math.round(size.w * k)), h: Math.max(1, Math.round(size.h * k)) };
}

function maxDeskZ(d) {
  let max = 0;
  for (const it of d.store.all()) {
    const rec = it.viewState && it.viewState[`desk:${d.project.id}`];
    if (rec && !rec.removed) max = Math.max(max, Number(rec.z) || 0);
  }
  for (const r of imageRecords(d.project)) max = Math.max(max, r.z);
  return max;
}

function recordForKey(d, key) {
  const rec = d.project.viewState && d.project.viewState[key];
  return rec && !rec.removed && rec.clip ? { rec, meta: rec.clip } : null;
}

function wireImageNode(node, handle) {
  node.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.target === handle) return;
    const d = currentDesk();
    const found = d && recordForKey(d, node.dataset.imageKey);
    if (!found) return;

    e.preventDefault();
    e.stopPropagation();
    closeImageMenu();
    held = makeLayerHold(d, {
      kind: "image",
      id: `image:${node.dataset.imageKey}`,
      key: node.dataset.imageKey,
      pid: d.project.id,
    });

    const start = { ...found.rec.pos };
    const x0 = e.clientX, y0 = e.clientY;
    node.classList.add("is-dragging");
    try { node.setPointerCapture(e.pointerId); } catch {}

    const move = ev => {
      node.style.setProperty("--image-dx", `${ev.clientX - x0}px`);
      node.style.setProperty("--image-dy", `${ev.clientY - y0}px`);
    };
    const up = ev => {
      cleanup();
      node.classList.remove("is-dragging");
      const nowDesk = currentDesk();
      const nowRec = nowDesk && recordForKey(nowDesk, node.dataset.imageKey);
      if (nowDesk && nowRec) {
        const pos = clampImagePos(
          { x: start.x + ev.clientX - x0, y: start.y + ev.clientY - y0 },
          nowRec.meta.size);
        if (pos.x !== nowRec.rec.pos.x || pos.y !== nowRec.rec.pos.y) {
          nowDesk.store._setViewStateField(nowDesk.project.id, node.dataset.imageKey, "pos", pos);
        }
        commitHeldLayers(nowDesk, held);
      }
      held = null;
      schedule();
    };
    const cancel = () => {
      cleanup();
      node.classList.remove("is-dragging");
      held = null;
      schedule();
    };
    const cleanup = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cancel);
  });

  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    const d = currentDesk();
    const found = d && recordForKey(d, node.dataset.imageKey);
    if (!found) return;

    e.preventDefault();
    e.stopPropagation();
    const startSize = { ...found.meta.size };
    const startPos = { ...found.rec.pos };
    const x0 = e.clientX, y0 = e.clientY;
    node.classList.add("is-resizing");
    try { handle.setPointerCapture(e.pointerId); } catch {}

    const sizeAt = ev => fitImageSizeToDesk(
      proportionalResize(startSize, ev.clientX - x0, ev.clientY - y0),
      startPos);
    const move = ev => {
      const size = sizeAt(ev);
      node.style.width = size.w + "px";
      node.style.height = size.h + "px";
    };
    const end = ev => {
      cleanup();
      node.classList.remove("is-resizing");
      const nowDesk = currentDesk();
      const nowRec = nowDesk && recordForKey(nowDesk, node.dataset.imageKey);
      if (nowDesk && nowRec) {
        const size = sizeAt(ev);
        if (size.w !== nowRec.meta.size.w || size.h !== nowRec.meta.size.h) {
          nowDesk.store._setViewStateField(nowDesk.project.id, node.dataset.imageKey, "clip", {
            ...nowRec.meta,
            size,
          });
        }
      }
      schedule();
    };
    const cancel = () => {
      cleanup();
      node.classList.remove("is-resizing");
      schedule();
    };
    const cleanup = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", cancel);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", cancel);
  });

  node.addEventListener("contextmenu", e => {
    e.preventDefault();
    e.stopPropagation();
    openImageMenu(e, node.dataset.imageKey);
  });
}

function openImageMenu(e, key) {
  closeImageMenu();
  const box = document.createElement("div");
 box.className = "desk-menu desk-menu-delete-only";
  box.setAttribute("role", "menu");

 const del = document.createElement("button");
del.className = "desk-menu-item desk-menu-delete";
del.setAttribute("role", "menuitem");
del.setAttribute("aria-label", "Delete");
del.title = "Delete";

  del.addEventListener("click", () => {
    closeImageMenu();
    removeImage(key);
  });
  box.appendChild(del);
  document.body.appendChild(box);

  const w = box.offsetWidth || 180, h = box.offsetHeight || 48;
  box.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - w - 4)) + "px";
  box.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - h - 4)) + "px";
  openMenu = box;
  setTimeout(() => document.addEventListener("pointerdown", awayMenu, true), 0);
  del.focus({ preventScroll: true });
}

function awayMenu(e) {
  if (openMenu && openMenu.contains(e.target)) return;
  closeImageMenu();
}

function closeImageMenu() {
  document.removeEventListener("pointerdown", awayMenu, true);
  if (openMenu) openMenu.remove();
  openMenu = null;
}

async function removeImage(key) {
  const d = currentDesk();
  const found = d && recordForKey(d, key);
  if (!d || !found) return;
  const hash = found.meta.hash;

  // Right-click Delete is permanent for the image object. The project itself
  // still uses Dash's ordinary recoverable deletion rules; no project cleanup
  // happens here.
  d.store._applyOp({ op: "vs", itemId: d.project.id, key, action: "remove", ts: clockNow() }, true);
  schedule();

  if (!hashReferenced(d.store, hash)) {
    try { await deleteBlob(hash); }
    catch { /* cleanup is best-effort; the visible deletion already succeeded */ }
  }
}

function allStoredItems(store) {
  if (store && store.items instanceof Map) return [...store.items.values()];
  return store ? store.all() : [];
}

function hashReferenced(store, hash) {
  for (const it of allStoredItems(store)) {
    // Attachments on recoverable/tombstoned Entries still count as references.
    for (const a of it.attachments || []) if (a && a.hash === hash) return true;
    // A deleted PROJECT can be restored, so its still-live image records count.
    // A desk image explicitly right-click-deleted does not.
    for (const [key, rec] of Object.entries(it.viewState || {})) {
      if (!key.startsWith(PREFIX) || !rec || rec.removed) continue;
      if (rec.clip && rec.clip.hash === hash) return true;
    }
  }
  return false;
}

// ===========================================================================
// Shared layer gesture: loose entries + images, one neighbour at a time.
// ===========================================================================

function layerUnits(d) {
  const units = [];
  for (const card of d.surface.querySelectorAll(".dcard:not([data-clip])")) {
    const rec = d.store.deskRecord(card.dataset.id, d.project.id);
    if (rec && !rec.removed) units.push({ id: `entry:${card.dataset.id}`, z: Number(rec.z) || 0 });
  }
  for (const r of imageRecords(d.project)) units.push({ id: `image:${r.key}`, z: r.z });
  return units;
}

function makeLayerHold(d, base) {
  const units = layerUnits(d);
  return {
    ...base,
    units,
    originalZ: new Map(units.map(u => [u.id, u.z])),
  };
}

function heldZ(id, fallback) {
  if (!held || !held.units) return fallback;
  const u = held.units.find(x => x.id === id);
  return u ? u.z : fallback;
}

function paintHeldLayers(d, h) {
  if (!d || !h || !h.units) return;
  for (const u of h.units) {
    if (u.id.startsWith("entry:")) {
      const id = u.id.slice(6);
      const node = d.surface.querySelector(`.dcard[data-id="${cssEscape(id)}"]:not([data-clip])`);
      if (node && !node.classList.contains("is-expanded")) node.style.zIndex = String(10 + u.z);
    } else if (u.id.startsWith("image:")) {
      const key = u.id.slice(6);
      const ctl = live.get(key);
      if (ctl) ctl.node.style.zIndex = String(10 + u.z);
    }
  }
}

function commitHeldLayers(d, h) {
  if (!d || !h || !h.units || !h.originalZ) return;
  for (const u of h.units) {
    if (h.originalZ.get(u.id) === u.z) continue;
    if (u.id.startsWith("entry:")) {
      bridge.setEntryZ(d.store, u.id.slice(6), d.project.id, u.z);
    } else if (u.id.startsWith("image:")) {
      d.store._setViewStateField(d.project.id, u.id.slice(6), "z", u.z);
    }
  }
}

function cssEscape(v) {
  if (globalThis.CSS && typeof CSS.escape === "function") return CSS.escape(String(v));
  return String(v).replace(/["\\]/g, "\\$&");
}

// Capture loose-entry pointerdown before the Desk's own bubble handler. Its old
// local raise is undone after dispatch and its z write is suppressed until
// release. Clips keep their existing behaviour untouched.
document.addEventListener("pointerdown", e => {
  if (e.button !== 0 || !e.target.closest) return;
  const card = e.target.closest(".desk-page .dcard:not([data-clip])");
  if (!card) return;
  if (e.target.closest("button,a,input,textarea,select")) return;
  if (card.classList.contains("is-expanded") && !e.target.closest(".dcard-drag")) return;
  const page = card.closest(".desk-page");
  if (page && page.querySelector(".banner-clip.is-on")) return;

  const d = currentDesk();
  const rec = d && d.store.deskRecord(card.dataset.id, d.project.id);
  if (!d || !rec) return;

  held = makeLayerHold(d, {
    kind: "entry",
    id: `entry:${card.dataset.id}`,
    entryId: card.dataset.id,
    pid: d.project.id,
  });
  bridge.suppressEntryRaise = { entryId: card.dataset.id, projectId: d.project.id };

  // raiseLocally() runs later in the Desk's bubble handler. Restore the shared
  // model order after the event finishes so merely grabbing/moving stays put.
  queueMicrotask(() => {
    const now = currentDesk();
    if (held && held.kind === "entry" && now) paintHeldLayers(now, held);
  });
}, true);

function finishEntryHold(commit) {
  if (!held || held.kind !== "entry") return;
  const ending = held;
  queueMicrotask(() => {
    const d = currentDesk();
    if (commit && d && d.project.id === ending.pid) commitHeldLayers(d, ending);
    bridge.suppressEntryRaise = null;
    if (held === ending) held = null;
    schedule();
  });
}

document.addEventListener("pointerup", () => finishEntryHold(true), true);
document.addEventListener("pointercancel", () => finishEntryHold(false), true);
window.addEventListener("blur", () => {
  bridge.suppressEntryRaise = null;
  held = null;
  closeImageMenu();
  schedule();
});

// Ordinary wheel scrolling is untouched. Only while a layerable object is
// actually being held does the wheel become the one-step layer control.
window.addEventListener("wheel", e => {
  if (!held) return;
  e.preventDefault();
  stepHeld(e.deltaY < 0 ? 1 : -1);
}, { passive: false, capture: true });

document.addEventListener("keydown", e => {
  if (!held || isTyping(e.target)) return;
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  stepHeld(e.key === "ArrowUp" ? 1 : -1);
}, true);

function stepHeld(direction) {
  const d = currentDesk();
  if (!d || !held || held.pid !== d.project.id) return;
  const changes = stepDeskLayer(held.units, held.id, direction);
  if (!changes.length) return;
  for (const ch of changes) {
    const u = held.units.find(x => x.id === ch.id);
    if (u) u.z = ch.z;
  }
  paintHeldLayers(d, held); // immediate visual result, zero store writes mid-gesture
}

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName && target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}
