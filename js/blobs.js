// blobs.js — content-addressed file storage (§2.1, §3).
// Every uploaded file (image, PDF, markdown, text, anything) is hashed with
// SHA-256; the hash IS its identity. Two people uploading the same PDF
// twice store it once. An "edited" version is really a new file with a new
// hash — nothing is ever mutated in place, which is what makes this safe
// under sync (§6.1: "binary assets... conflicts are structurally impossible").
//
// Storage lives in IndexedDB (works identically on Mac/iPhone/iPad). The
// folder backend (sync.js) additionally writes/reads these bytes under
// Dash/assets/<hash>.<ext> on the Mac, and the portable backend carries
// them as base64 inside the export/import JSON so a phone's photo can
// reach the Mac's iCloud folder.

const IDB_NAME = "dash-blobs";
const STORE = "blobs";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || "");
  return m ? m[1].toLowerCase() : "bin";
}

// image | document — used to pick an icon/preview strategy, not a hard rule
export function roleForExt(ext) {
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "image";
  return "document";
}

export async function putBlob(hash, arrayBuffer, mime) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE)
      .put({ bytes: arrayBuffer, mime }, hash);
    tx.onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getBlob(hash) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(hash);
    tx.onsuccess = () => res(tx.result || null);
    tx.onerror = () => rej(tx.error);
  });
}

export async function hasBlob(hash) {
  return (await getBlob(hash)) !== null;
}

// Reads a File from an <input type=file>, hashes it, stores it, and
// returns the attachment record ready for store.addToSet(id, "attachments", …).
export async function ingestFile(file) {
  const buf = await file.arrayBuffer();
  const hash = await sha256Hex(buf);
  const ext = extOf(file.name);
  await putBlob(hash, buf, file.type);
  return { hash, ext, role: roleForExt(ext), name: file.name, size: file.size };
}

// Object URL for previewing/opening a stored blob. Caller should revoke
// it when done (e.g. on modal close) to avoid piling up memory.
export async function blobObjectURL(hash, mimeHint) {
  const rec = await getBlob(hash);
  if (!rec) return null;
  const blob = new Blob([rec.bytes], { type: rec.mime || mimeHint || "application/octet-stream" });
  return URL.createObjectURL(blob);
}

export async function allHashes() {
  const db = await idb();
  return new Promise((res, rej) => {
    const out = [];
    const req = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { out.push(cur.key); cur.continue(); } else res(out);
    };
    req.onerror = () => rej(req.error);
  });
}
