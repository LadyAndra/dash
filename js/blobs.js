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
const DESK_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);
const DESK_IMAGE_MIMES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

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

// Local garbage collection uses this only after the model has proved that no
// live object still references the hash. Content-addressed blobs may be shared,
// so callers — never this low-level helper — own that decision.
export async function deleteBlob(hash) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).delete(hash);
    tx.onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  });
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

// The Desk's image picker is deliberately narrower than general attachments:
// JPEG/JPG, PNG and WebP only. Decode BEFORE writing the blob: a renamed or
// corrupt file must fail visibly without leaving either a phantom desk record
// or unreachable bytes behind.
export async function ingestDeskImage(file) {
  const ext = extOf(file && file.name);
  if (!DESK_IMAGE_EXTS.has(ext)) {
    throw new Error("Desk images must be JPEG, PNG, or WebP.");
  }
  const expectedMime = DESK_IMAGE_MIMES[ext];
  const suppliedMime = String(file.type || "").toLowerCase();
  const jpegAlias = (ext === "jpg" || ext === "jpeg") && suppliedMime === "image/jpg";
  if (suppliedMime && suppliedMime !== expectedMime && !jpegAlias) {
    throw new Error("That file doesn't match its image format.");
  }

  const dims = await decodeDeskImage(file);
  const buf = await file.arrayBuffer();
  const hash = await sha256Hex(buf);
  // Normalize the old image/jpg alias so previews/sync always carry the
  // standards spelling even if the OS supplied the historical one.
  const mime = expectedMime;
  await putBlob(hash, buf, mime);
  return {
    hash,
    ext,
    mime,
    width: dims.width,
    height: dims.height,
    size: file.size,
  };
}

async function decodeDeskImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const out = { width: bitmap.width, height: bitmap.height };
      if (typeof bitmap.close === "function") bitmap.close();
      if (out.width > 0 && out.height > 0) return out;
    } catch { /* Safari/browser fallback below gives the same yes/no answer */ }
  }

  if (typeof Image !== "undefined" && typeof URL !== "undefined" && URL.createObjectURL) {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const width = img.naturalWidth || img.width || 0;
          const height = img.naturalHeight || img.height || 0;
          if (width > 0 && height > 0) resolve({ width, height });
          else reject(new Error("That image couldn't be read."));
        };
        img.onerror = () => reject(new Error("That image couldn't be read."));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  throw new Error("That image couldn't be read.");
}

// Same idea as ingestFile, but for bytes that didn't come from a file picker —
// the sketch canvas's rendered PNG. role is forced to "sketch" (distinct from
// role:"image") so the editor and card thumbnails can find the one canonical
// drawing on an item without guessing from the file extension.
export async function ingestSketchPNG(arrayBuffer) {
  const hash = await sha256Hex(arrayBuffer);
  await putBlob(hash, arrayBuffer, "image/png");
  return { hash, ext: "png", role: "sketch", name: "sketch.png", size: arrayBuffer.byteLength };
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
