// desk-images-bootstrap.js — narrow adapter for Project Desk reference images.
// ===========================================================================
// Dash stays vanilla/no-build. This tiny adapter lets the optional image layer
// reuse the one Store and Sync instance app.js creates without turning images
// into Entries or teaching unrelated views about them.
//
// IMPORTANT SAFETY RULE: app.js starts FIRST. If the image layer ever develops
// a bug, Dash itself must still open; the feature may fail, the app may not.

import { Store } from "./store.js";
import { Sync } from "./sync.js";
import { hasBlob, getBlob, putBlob } from "./blobs.js";
import { contentBounds, glanceFrame } from "./desk.js";

const bridge = globalThis.__dashDeskImages = {
  store: null,
  sync: null,
  suppressEntryRaise: null,
  setEntryZ: null,
};

const originalAll = Store.prototype.all;
Store.prototype.all = function (...args) { bridge.store = this; return originalAll.apply(this, args); };
const originalGet = Store.prototype.get;
Store.prototype.get = function (...args) { bridge.store = this; return originalGet.apply(this, args); };

const originalSetDeskField = Store.prototype.setDeskField;
bridge.setEntryZ = (store, entryId, projectId, z) =>
  originalSetDeskField.call(store, entryId, projectId, "z", z);
Store.prototype.setDeskField = function (entryId, projectId, field, value) {
  bridge.store = this;
  const s = bridge.suppressEntryRaise;
  if (field === "z" && s && s.entryId === entryId && s.projectId === projectId) return;
  return originalSetDeskField.call(this, entryId, projectId, field, value);
};

const originalPlaceOnDesk = Store.prototype.placeOnDesk;
Store.prototype.placeOnDesk = function (entryId, projectId, pos, z) {
  bridge.store = this;
  const requested = Number(z) || 0;
  return originalPlaceOnDesk.call(this, entryId, projectId, pos,
    Math.max(requested, maxImageZ(this, projectId) + 1));
};

const originalSyncInit = Sync.prototype.init;
Sync.prototype.init = async function (...args) {
  bridge.sync = this;
  return await originalSyncInit.apply(this, args);
};

// Portable Export must carry old desk images too, not only newly queued blobs.
const originalExportForSync = Sync.prototype.exportForSync;
Sync.prototype.exportForSync = async function (...args) {
  bridge.sync = this;
  for (const asset of referencedDeskImages(this.store)) await this.queueBlob(asset.hash, asset.ext);
  return await originalExportForSync.apply(this, args);
};

// Pull only assets the recoverable model still references. Historical remote
// blobs stay untouched for offline-device safety, but deleted images are not
// silently downloaded back into local storage.
Sync.prototype._pullBlobsFromDropbox = async function () {
  if (!this.dbx) return;
  for (const asset of referencedAssets(this.store)) {
    try {
      if (await hasBlob(asset.hash)) continue;
      const buf = await this.dbx.downloadBinary(`/assets/${asset.hash}.${asset.ext}`);
      if (buf) await putBlob(asset.hash, buf, asset.mime || mimeForExt(asset.ext));
    } catch { /* a missing asset can retry on the next pull */ }
  }
};
Sync.prototype._pullBlobsFromFolder = async function () {
  if (this.mode !== "folder" || !this.dirHandle) return;
  let assetsDir;
  try { assetsDir = await this.dirHandle.getDirectoryHandle("assets", { create: true }); }
  catch { return; }
  for (const asset of referencedAssets(this.store)) {
    try {
      if (await hasBlob(asset.hash)) continue;
      const h = await assetsDir.getFileHandle(`${asset.hash}.${asset.ext}`);
      const file = await h.getFile();
      await putBlob(asset.hash, await file.arrayBuffer(), file.type || asset.mime || mimeForExt(asset.ext));
    } catch { /* a missing asset can retry on the next pull */ }
  }
};

// Likewise, a deleted image must not leave a dead blobOutbox row retrying
// forever. Flush only still-referenced blobs; a referenced-but-temporarily-
// missing local blob stays queued so sync can recover later.
Sync.prototype._flushBlobsToDropbox = async function () {
  const pending = (await localGet("blobOutbox")) || [];
  if (!pending.length) return;
  const needed = new Set(referencedAssets(this.store).map(a => a.hash));
  const remaining = [];
  for (const { hash, ext } of pending) {
    if (!needed.has(hash)) continue;
    const rec = await getBlob(hash);
    if (!rec) { remaining.push({ hash, ext }); continue; }
    try { await this.dbx.upload(`/assets/${hash}.${ext}`, rec.bytes, { mode: "overwrite" }); }
    catch { remaining.push({ hash, ext }); }
  }
  await localSet("blobOutbox", remaining);
};
Sync.prototype._flushBlobsToFolder = async function () {
  const pending = (await localGet("blobOutbox")) || [];
  if (!pending.length || !this.dirHandle) return;
  const needed = new Set(referencedAssets(this.store).map(a => a.hash));
  const assetsDir = await this.dirHandle.getDirectoryHandle("assets", { create: true });
  const remaining = [];
  for (const { hash, ext } of pending) {
    if (!needed.has(hash)) continue;
    const filename = `${hash}.${ext}`;
    try { await assetsDir.getFileHandle(filename); continue; }
    catch { /* upload below */ }
    const rec = await getBlob(hash);
    if (!rec) { remaining.push({ hash, ext }); continue; }
    try {
      const h = await assetsDir.getFileHandle(filename, { create: true });
      const w = await h.createWritable();
      await w.write(rec.bytes);
      await w.close();
    } catch { remaining.push({ hash, ext }); }
  }
  await localSet("blobOutbox", remaining);
};

function storedItems(store) {
  if (store && store.items instanceof Map) return [...store.items.values()];
  return store ? store.all() : [];
}
function referencedDeskImages(store) {
  const out = new Map();
  if (!store) return [];
  for (const it of storedItems(store)) {
    for (const [key, rec] of Object.entries(it.viewState || {})) {
      if (!key.startsWith("deskimg:") || !rec || rec.removed) continue;
      const meta = rec.clip;
      if (meta && meta.hash && meta.ext) out.set(meta.hash,
        { hash: meta.hash, ext: meta.ext, mime: meta.mime || null });
    }
  }
  return [...out.values()];
}
function referencedAssets(store) {
  const out = new Map();
  if (!store) return [];
  for (const it of storedItems(store)) {
    for (const a of it.attachments || []) {
      if (a && a.hash && a.ext) out.set(a.hash, { hash: a.hash, ext: a.ext, mime: a.mime || null });
    }
    for (const [key, rec] of Object.entries(it.viewState || {})) {
      if (!key.startsWith("deskimg:") || !rec || rec.removed) continue;
      const meta = rec.clip;
      if (meta && meta.hash && meta.ext) out.set(meta.hash,
        { hash: meta.hash, ext: meta.ext, mime: meta.mime || null });
    }
  }
  return [...out.values()];
}
function maxImageZ(store, projectId) {
  const project = store && store.get(projectId);
  if (!project) return 0;
  const prefix = `deskimg:${projectId}:`;
  let max = 0;
  for (const [key, rec] of Object.entries(project.viewState || {})) {
    if (key.startsWith(prefix) && rec && !rec.removed) max = Math.max(max, Number(rec.z) || 0);
  }
  return max;
}
function mimeForExt(ext) {
  const map = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif",
    webp:"image/webp", svg:"image/svg+xml", heic:"image/heic", pdf:"application/pdf",
    md:"text/markdown", markdown:"text/markdown", txt:"text/plain" };
  return map[String(ext || "").toLowerCase()] || "application/octet-stream";
}

function localDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dash", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function localGet(key) {
  const db = await localDb();
  return await new Promise((resolve, reject) => {
    const req = db.transaction("kv", "readonly").objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function localSet(key, value) {
  const db = await localDb();
  return await new Promise((resolve, reject) => {
    const req = db.transaction("kv", "readwrite").objectStore("kv").put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

await import("./app.js");

// Refine the existing Glance transform after the Desk computes its card-only
// frame. The Desk's own release handler still owns returning to normal.
const refineGlance = () => queueMicrotask(() => {
  const page = document.querySelector(".desk-page");
  const view = page && page.querySelector(".desk-viewport.is-glancing");
  const surface = page && page.querySelector(".desk-surface");
  if (!view || !surface || !surface.querySelector(".desk-image-object")) return;
  const boxes = [...surface.querySelectorAll(".dcard, .desk-image-object")].map(n => ({
    x:n.offsetLeft, y:n.offsetTop, w:n.offsetWidth, h:n.offsetHeight,
  }));
  const f = glanceFrame(contentBounds(boxes), view.clientWidth, view.clientHeight);
  const tx = f.tx + view.scrollLeft, ty = f.ty + view.scrollTop;
  surface.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${f.k.toFixed(4)})`;
});
document.addEventListener("pointerdown", e => {
  if (e.target && e.target.closest && e.target.closest(".desk-page .banner-glance")) refineGlance();
}, true);
document.addEventListener("keydown", e => {
  if ((e.key === "z" || e.key === "Z") && !e.repeat && !typingIn(e.target)) refineGlance();
}, true);
function typingIn(target) { return !!(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)); }

import("./desk-images-runtime.js").catch(err => {
  console.error("Desk images disabled for this session:", err);
});
