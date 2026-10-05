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

// ---- what a click on an attachment is allowed to do ------------------------
// Attachments open in a new tab from a blob: address. A blob: page runs with
// Dash's OWN origin, so a file that can carry a script (an SVG picture or an
// HTML page above all) would run inside Dash, next to everything Dash has
// saved on this device, including the Dropbox sign-in. So only a short list of
// plain, script-free types may open in a tab, and each is handed to the browser
// with a fixed content type. The type stored with the file is NOT used for
// this: it was copied from the file's own name, or from synced or imported
// data, and could claim to be anything. Every other type is offered as a
// download instead (see attachmentLinkAttrs). Pictures still show as small
// thumbnails either way: an <img> never runs a script.
const OPEN_MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", heic: "image/heic",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8",
  markdown: "text/plain; charset=utf-8",
};

// The fixed content type for a file that may open in a tab, or null when it
// may not. hasOwn so that an extension like "constructor" is not a match.
export function openMimeForExt(ext) {
  const key = String(ext == null ? "" : ext).toLowerCase();
  return Object.prototype.hasOwnProperty.call(OPEN_MIME, key) ? OPEN_MIME[key] : null;
}

// Object URL for a file that is allowed to open in a tab, labelled with the
// fixed type above. Null when the file is missing or not on the allowed list.
export async function blobOpenURL(hash, ext) {
  const mime = openMimeForExt(ext);
  if (!mime) return null;
  const rec = await getBlob(hash);
  if (!rec) return null;
  return URL.createObjectURL(new Blob([rec.bytes], { type: mime }));
}

// The attributes for an attachment's link: open in a new tab when that is safe,
// otherwise save to disk. Kept as a plain function so it can be tested without
// a page.
export function attachmentLinkAttrs(att, url) {
  const href = url || "#";
  if (openMimeForExt(att && att.ext)) return { href, target: "_blank", rel: "noopener" };
  const name = (att && att.name) || `${String((att && att.hash) || "file").slice(0, 8)}.${(att && att.ext) || "bin"}`;
  return { href, download: name };
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
