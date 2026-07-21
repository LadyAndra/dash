// sync.js — persistence + sync, abstracting the two device realities (§6.2).
// ================================================================
// Two backends behind ONE interface, chosen automatically:
//
//  A) Folder backend (Mac, Chrome/Edge): the File System Access API lets
//     us hold a persistent handle to the Dash/ folder in iCloud Drive and
//     read/write files directly. Sync is automatic-ish: we flush our log +
//     snapshot on a timer and re-read other devices' logs. (§1a)
//
//  B) Portable backend (iPhone/iPad, Safari): browsers there cannot open
//     an iCloud folder (§1a). Data lives in IndexedDB; syncing is a manual
//     Export (writes a dash-sync .json you save into Dash/ via the Files
//     sheet) and Import (pick the merged file back). One-tap-ish, safe.
//
// File layout written by the folder backend (§3):
//   Dash/data/log-<device>.jsonl   (this device appends only its own)
//   Dash/data/snapshot.json        (merged state; this device may write)
//   Dash/themes/default.json       (theme; see theme.js)
//
// Everything is plain text/JSON so the data outlives the app (§3).

import { getDeviceSlug } from "./device.js";
import { toast } from "./ui/toast.js";
import { allHashes, getBlob, putBlob } from "./blobs.js";

const SNAPSHOT_NAME = "snapshot.json";
const LOG_PREFIX = "log-";
const LOG_EXT = ".jsonl";

// ---- IndexedDB helpers (portable backend + folder-handle persistence) ----
const IDB_NAME = "dash";
const IDB_STORE = "kv";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    tx.onsuccess = () => res(tx.result);
    tx.onerror = () => rej(tx.error);
  });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(val, key);
    tx.onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export function supportsFolder() {
  return typeof window.showDirectoryPicker === "function";
}

export class Sync {
  constructor(store) {
    this.store = store;
    this.dirHandle = null;
    this.mode = supportsFolder() ? "folder" : "portable";
    this.logSlug = getDeviceSlug();
    this.readOffsets = {};   // logFileName -> bytes already applied
    this.status = "idle";
    this._statusListeners = new Set();
  }

  onStatus(fn) { this._statusListeners.add(fn); return () => this._statusListeners.delete(fn); }
  _setStatus(s) { this.status = s; for (const fn of this._statusListeners) fn(s); }

  // ---------- startup ----------
  async init() {
    try {
      // load local snapshot first so the app opens instantly with last state
      const localSnap = await idbGet("snapshot");
      if (localSnap) this.store.loadSnapshot(localSnap);

      if (this.mode === "folder") {
        // try to silently re-acquire a previously granted folder handle
        const saved = await idbGet("dirHandle");
        if (saved && (await verifyPermission(saved))) {
          this.dirHandle = saved;
          await this.pull();
        }
      }
      this._setStatus(this.dirHandle || this.mode === "portable" ? "ok" : "needs-folder");
    } catch (err) {
      reportError("Couldn't load your saved data", err);
      this._setStatus("error");
    }
  }

  // ---------- folder backend: connect (Mac) ----------
  async connectFolder() {
    if (this.mode !== "folder") {
      toast("This device syncs by Export/Import — see the Sync button.", "info");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: "dash", mode: "readwrite" });
      this.dirHandle = handle;
      await idbSet("dirHandle", handle);
      await this.pull();
      await this.flush();
      this._setStatus("ok");
      toast("Connected to your Dash folder. Syncing automatically now.", "success");
    } catch (err) {
      if (err && err.name === "AbortError") return; // user cancelled; not an error
      reportError("Couldn't open the Dash folder", err);
    }
  }

  // ---------- folder backend: read others' logs + snapshot ----------
  async pull() {
    if (this.mode !== "folder" || !this.dirHandle) return;
    try {
      const dataDir = await this.dirHandle.getDirectoryHandle("data", { create: true });

      // snapshot (fast base state)
      const snap = await readJSONFile(dataDir, SNAPSHOT_NAME);
      if (snap) this.store.loadSnapshot(snap);

      // every device log — replay only the unseen tail (by byte offset)
      for await (const [name, entry] of dataDir.entries()) {
        if (!name.startsWith(LOG_PREFIX) || !name.endsWith(LOG_EXT)) continue;
        const file = await entry.getFile();
        const start = this.readOffsets[name] || 0;
        if (file.size <= start) continue;
        const text = await file.slice(start).text();
        const ops = parseJSONL(text);
        this.store.replayLog(ops);
        this.readOffsets[name] = file.size;
      }
      await idbSet("snapshot", this.store.toSnapshot()); // cache locally too
      await this._pullBlobsFromFolder();
    } catch (err) {
      reportError("Couldn't read the latest from your Dash folder", err);
    }
  }

  // ---------- files/images: queue a locally-ingested blob for sync ----------
  // Called by the editor right after blobs.ingestFile() stores bytes locally.
  async queueBlob(hash, ext) {
    const pending = (await idbGet("blobOutbox")) || [];
    if (!pending.some(p => p.hash === hash)) {
      pending.push({ hash, ext });
      await idbSet("blobOutbox", pending);
    }
  }

  // ---------- flush this device's pending ops ----------
  async flush() {
    const lines = this.store.drainPendingAsLines();
    // always keep a local snapshot cache regardless of backend
    await idbSet("snapshot", this.store.toSnapshot());

    if (this.mode === "folder" && this.dirHandle) {
      try {
        const dataDir = await this.dirHandle.getDirectoryHandle("data", { create: true });
        if (lines.length) {
          const logName = `${LOG_PREFIX}${this.logSlug}${LOG_EXT}`;
          await appendLines(dataDir, logName, lines);
          // account for our own appended bytes so pull() won't re-apply them
          const f = await (await dataDir.getFileHandle(logName)).getFile();
          this.readOffsets[logName] = f.size;
          // periodically rewrite the merged snapshot (cheap at this scale — §2.3)
          await writeJSONFile(dataDir, SNAPSHOT_NAME, this.store.toSnapshot());
        }
        await this._flushBlobsToFolder();
        this._setStatus("ok");
      } catch (err) {
        reportError("Couldn't save to your Dash folder", err);
        this._setStatus("error");
      }
    } else {
      // portable: mark that there are unsynced changes for the UI
      const pendingBlobs = (await idbGet("blobOutbox")) || [];
      if (lines.length || pendingBlobs.length) {
        const queued = (await idbGet("outbox")) || [];
        await idbSet("outbox", queued.concat(lines));
        this._setStatus("dirty");
      }
    }
  }

  // write any locally-ingested files into Dash/assets/<hash>.<ext> (§3).
  // Content-addressed means "does this file already exist" is a cheap check
  // and never a conflict (§6.1).
  async _flushBlobsToFolder() {
    const pending = (await idbGet("blobOutbox")) || [];
    if (pending.length === 0) return;
    const assetsDir = await this.dirHandle.getDirectoryHandle("assets", { create: true });
    const remaining = [];
    for (const { hash, ext } of pending) {
      const filename = `${hash}.${ext}`;
      try {
        await assetsDir.getFileHandle(filename); // already there — nothing to do
      } catch {
        const rec = await getBlob(hash);
        if (rec) {
          const h = await assetsDir.getFileHandle(filename, { create: true });
          const w = await h.createWritable();
          await w.write(rec.bytes);
          await w.close();
        } else {
          remaining.push({ hash, ext }); // blob not local yet (e.g. came from an import); retry later
        }
      }
    }
    await idbSet("blobOutbox", remaining);
  }

  // pull any assets from the folder into local IndexedDB so this device can
  // preview files another device added (Mac writes; any device can read).
  async _pullBlobsFromFolder() {
    if (this.mode !== "folder" || !this.dirHandle) return;
    try {
      const assetsDir = await this.dirHandle.getDirectoryHandle("assets", { create: true });
      const have = new Set(await allHashes());
      for await (const [name, entry] of assetsDir.entries()) {
        const m = /^([0-9a-f]{64})\.([a-z0-9]+)$/i.exec(name);
        if (!m) continue;
        const [, hash] = m;
        if (have.has(hash)) continue;
        const file = await entry.getFile();
        await putBlob(hash, await file.arrayBuffer(), file.type);
      }
    } catch { /* assets dir not ready yet; fine */ }
  }

  // ---------- portable backend: Export / Import (iPhone/iPad) ----------
  async exportForSync() {
    // Produce a single JSON the user drops into Dash/data/ via Files sheet.
    // It carries this device's full log tail (outbox) + a snapshot, so the
    // Mac can merge it. Deterministic merge means order doesn't matter (§6.1).
    // Files (photos, PDFs, etc.) ride along as base64 so a phone photo can
    // reach the Mac's iCloud folder without ever needing a server (§1a/§9).
    const outbox = (await idbGet("outbox")) || [];
    const pendingBlobs = (await idbGet("blobOutbox")) || [];
    const blobs = [];
    for (const { hash, ext } of pendingBlobs) {
      const rec = await getBlob(hash);
      if (rec) blobs.push({ hash, ext, mime: rec.mime, dataBase64: bufToBase64(rec.bytes) });
    }
    const payload = {
      formatVersion: 1,
      device: this.logSlug,
      exportedAt: new Date().toISOString(),
      ops: outbox.map(l => JSON.parse(l)),
      snapshot: this.store.toSnapshot(),
      blobs,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const fname = `dash-sync-${this.logSlug}-${Date.now()}.json`;
    downloadBlob(blob, fname);
    await idbSet("blobOutbox", []); // the Mac now owns writing these to assets/
    toast("Saved a sync file. Move it into your Dash folder, then Import on your Mac.", "success", 8000);
  }

  async importSyncFile(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload.snapshot) this.store.loadSnapshot(payload.snapshot);
      if (Array.isArray(payload.ops)) this.store.replayLog(payload.ops);
      for (const b of payload.blobs || []) {
        await putBlob(b.hash, base64ToBuf(b.dataBase64), b.mime);
        if (this.mode === "folder" && this.dirHandle) await this.queueBlob(b.hash, b.ext);
      }
      await idbSet("snapshot", this.store.toSnapshot());
      if (this.mode === "folder" && this.dirHandle) await this._flushBlobsToFolder();
      this._setStatus("ok");
      toast("Merged the sync file. Everything's up to date.", "success");
    } catch (err) {
      reportError("That sync file couldn't be read", err);
    }
  }

  async markSynced() {
    await idbSet("outbox", []);
    this._setStatus("ok");
  }
}

// ---------------- file helpers ----------------
async function readJSONFile(dir, name) {
  try {
    const h = await dir.getFileHandle(name);
    const f = await h.getFile();
    const t = await f.text();
    return t ? JSON.parse(t) : null;
  } catch { return null; } // missing file is normal on first run
}

async function writeJSONFile(dir, name, obj) {
  const h = await dir.getFileHandle(name, { create: true });
  const w = await h.createWritable();
  await w.write(JSON.stringify(obj, null, 2));
  await w.close();
}

async function appendLines(dir, name, lines) {
  const h = await dir.getFileHandle(name, { create: true });
  let existing = "";
  try { existing = await (await h.getFile()).text(); } catch { /* new */ }
  const w = await h.createWritable();
  const sep = existing && !existing.endsWith("\n") ? "\n" : "";
  await w.write(existing + sep + lines.join("\n") + "\n");
  await w.close();
}

function parseJSONL(text) {
  const ops = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try { ops.push(JSON.parse(s)); }
    catch { /* skip a torn line; logs are append-only so this is rare */ }
  }
  return ops;
}

async function verifyPermission(handle) {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bufToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function reportError(human, err) {
  console.error(human, err);
  toast(`${human}. (${err && err.message ? err.message : "unknown error"})`, "error", 9000);
}
