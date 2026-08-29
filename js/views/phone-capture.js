// phone-capture.js — the ENTIRE phone experience (August 2026).
// ===========================================================================
// Dash is desktop-first. Desk, List, Board and Projects are where the real
// work happens, and none of them translate to a phone screen — trying to fit
// them there had become the reason the app went unopened on a phone at all.
//
// So on a phone Dash is one thing and one thing only: a place to put a thought
// down. Three buttons — Text, Sketch, Image. Tap one, do the thing, tap
// "File away", and you are back at the three buttons. Nothing is filed, tagged,
// typed or scheduled here; items land with no project, exactly the way
// store.createItem() already leaves them, and get sorted later on the Mac.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
// ---------------------------------------
//   - It does not duplicate capture logic. The text split (first line = title,
//     the rest = body) is the same rule as the Home capture well; the drawing
//     surface is the same createSketchPad() the item editor uses; the photo
//     goes through the same ingestFile() as "＋ Attach files".
//   - It does not touch Home, List, Board or Project. Those files are
//     unchanged and still run exactly as before on desktop and iPad. This view
//     is reached only through the phone gate in app.js.
//
// WHY THE CAPTURE SURFACES LIVE ON document.body
// ----------------------------------------------
// app.js redraws the whole view host whenever the store changes — a background
// sync pull is enough to do it. If a half-typed note or a half-finished drawing
// lived inside that host it would be torn out from under you mid-sentence. So
// the three-button screen (cheap, stateless) renders into the view host, and
// each capture surface is a full-screen overlay appended to document.body,
// outside the render cycle entirely. Nothing can redraw it away.

import { el } from "./shared.js";
import { toast } from "../ui/toast.js";
import { createSketchPad } from "../sketch.js";
import { ingestFile, ingestSketchPNG } from "../blobs.js";

// Only one capture surface can ever be open. Kept at module scope so a stray
// second tap (or a re-render behind the overlay) can't stack two of them.
let openSurface = null;

export const phoneCaptureView = {
  name: "phone-capture",
  label: "Capture",
  // ownFilter: app.js must not build a query result for this view — there is
  // no list on screen to fill. Same contract Home and Project use.
  ownFilter: true,
  supportsSelect: false,
  supportsCatalogChrome: false,

  render(_result, ctx, host) {
    host.innerHTML = "";
    host.appendChild(captureHome(ctx));
  },
};

// ===================================================================
//  THE THREE BUTTONS
// ===================================================================
function captureHome(ctx) {
  const mk = (label, hint, onclick) =>
    el("button", { type: "button", class: "pcap-btn", onclick }, [
      el("span", { class: "pcap-btn-label", text: label }),
      el("span", { class: "pcap-btn-hint", text: hint }),
    ]);

  return el("div", { class: "pcap" }, [
    el("div", { class: "pcap-buttons" }, [
      mk("Text", "Type or dictate a note", () => openTextCapture(ctx)),
      mk("Sketch", "Draw it instead", () => openSketchCapture(ctx)),
      mk("Image", "Camera or photo library", () => pickImage(ctx)),
    ]),
    el("p", { class: "pcap-note", text: "Everything filed here waits on your Mac to be sorted." }),
  ]);
}

// ===================================================================
//  THE SHARED FULL-SCREEN SURFACE
// ===================================================================
// Every capture type gets the same frame: a cancel affordance, a title, the
// working area, and one "File away" button. The cancel (‹) is an ADDITION on
// top of what was asked for — an accidental tap on a phone shouldn't be able
// to force a save. Deleting the backBtn line below removes it.
function surface({ title, fileLabel = "File away", onFile, onClose }) {
  if (openSurface) return null;

  const close = () => {
    if (openSurface !== root) return;
    document.removeEventListener("keydown", onKey, true);
    root.remove();
    openSurface = null;
    onClose && onClose();
  };

  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };

  const backBtn = el("button", {
    type: "button", class: "pcap-back", "aria-label": "Cancel, don't file this",
    text: "‹", onclick: close,
  });

  const body = el("div", { class: "pcap-surface-body" });

  const fileBtn = el("button", {
    type: "button", class: "btn btn-primary pcap-file-btn", text: fileLabel,
    onclick: async () => {
      // A slow ingest (a large photo) must not be filed twice by an impatient
      // second tap, so the button locks for the duration.
      if (fileBtn.disabled) return;
      fileBtn.disabled = true;
      try {
        const filed = await onFile();
        if (filed) { toast("Filed away.", "success", 2000); close(); }
        else fileBtn.disabled = false;
      } catch (err) {
        fileBtn.disabled = false;
        toast("Couldn't file that just now — it's still on the screen.", "error", 7000, err.message);
      }
    },
  });

  const root = el("div", {
    class: "pcap-surface", role: "dialog", "aria-modal": "true", "aria-label": title,
  }, [
    el("div", { class: "pcap-surface-head" }, [
      backBtn,
      el("h2", { class: "pcap-surface-title", text: title }),
    ]),
    body,
    el("div", { class: "pcap-surface-foot" }, [fileBtn]),
  ]);

  document.body.appendChild(root);
  openSurface = root;
  document.addEventListener("keydown", onKey, true);

  return { root, body, close };
}

// ===================================================================
//  TEXT
// ===================================================================
function openTextCapture(ctx) {
  const store = ctx.store;

  const textarea = el("textarea", {
    class: "pcap-textarea",
    placeholder: "Say or type anything…",
    "aria-label": "Quick capture",
  });

  const s = surface({
    title: "Text",
    onFile: () => {
      const text = (textarea.value || "").trim();
      if (!text) {
        toast("Nothing to file yet.", "info", 2500);
        textarea.focus();
        return false;
      }
      // Exactly the rule the Home capture well uses: first line is the title,
      // everything after it is the body. Type and status stay at whatever
      // store.createItem() already defaults to.
      const nl = text.indexOf("\n");
      const title = (nl === -1 ? text : text.slice(0, nl)).trim();
      const body = nl === -1 ? "" : text.slice(nl + 1).trim();
      store.createItem({ title, body });
      return true;
    },
  });
  if (!s) return;

  s.body.appendChild(textarea);
  // One frame, so the element is laid out before iOS is asked for the keyboard.
  requestAnimationFrame(() => { try { textarea.focus({ preventScroll: true }); } catch { textarea.focus(); } });
}

// ===================================================================
//  SKETCH
// ===================================================================
function openSketchCapture(ctx) {
  const store = ctx.store;
  let pad = null;

  const s = surface({
    title: "Sketch",
    onFile: async () => {
      if (!pad || (pad.isBlank() && !pad.hasChanges())) {
        toast("Nothing drawn yet.", "info", 2500);
        return false;
      }
      const blob = await pad.toBlob();
      if (!blob) { toast("Couldn't read the drawing.", "error", 6000); return false; }
      const rec = await ingestSketchPNG(await blob.arrayBuffer());
      // Same shape the Home Sketch button creates, so a phone sketch and a
      // desktop sketch are the same kind of thing in the archive.
      const id = store.createItem({ type: store.typeDef("sketch") ? "sketch" : undefined });
      store.addToSet(id, "attachments", rec);
      ctx.sync?.queueBlob(rec.hash, rec.ext);
      return true;
    },
    onClose: () => { if (pad) pad.destroy(); },
  });
  if (!s) return;

  s.root.classList.add("pcap-surface-sketch");
  pad = createSketchPad({});
  s.body.appendChild(pad.root);
  pad.mount();
  // The pad opens in "view" mode inside the item editor because it is sitting
  // in a scrolling page there and must not eat a scroll. Here it IS the page,
  // there is nothing to scroll, and you tapped "Sketch" — so it starts ready
  // to draw. The ✎ button in its toolbar still toggles this.
  pad.setMode("draw");
}

// ===================================================================
//  IMAGE
// ===================================================================
// The button opens the phone's own picker straight away. `capture` is
// deliberately NOT set: on iOS that attribute REPLACES the picker sheet with
// the camera, which would make it impossible to file a screenshot or a photo
// taken five minutes ago. Without it the sheet still offers "Take Photo" as
// its first option, so the camera is one tap away and the library is still
// there.
function pickImage(ctx) {
  const input = el("input", {
    type: "file", accept: "image/*", class: "pcap-file-input",
    "aria-hidden": "true", tabindex: "-1",
  });

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener("focus", onWindowFocus);
    input.remove();
  };
  // If the picker is dismissed no change event ever fires, so the input would
  // sit in the DOM forever. Coming back to the window is the reliable signal.
  const onWindowFocus = () => setTimeout(() => { if (!input.files || !input.files.length) cleanup(); }, 400);

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    cleanup();
    if (file) openImageCapture(ctx, file);
  });
  input.addEventListener("cancel", cleanup);
  window.addEventListener("focus", onWindowFocus);

  document.body.appendChild(input);
  input.click();
}

function openImageCapture(ctx, file) {
  const store = ctx.store;
  let previewUrl = null;

  const s = surface({
    title: "Image",
    onFile: async () => {
      // Same helper the editor's "＋ Attach files" uses, so a phone photo is
      // an ordinary attachment with an ordinary content hash.
      const rec = await ingestFile(file);
      // A blank title reads as "Untitled" everywhere in Dash, which makes a
      // photo indistinguishable from an empty note in a list. "Photo" is the
      // smallest honest label; nothing is guessed from the file name.
      const id = store.createItem({ title: "Photo" });
      store.addToSet(id, "attachments", rec);
      ctx.sync?.queueBlob(rec.hash, rec.ext);
      return true;
    },
    onClose: () => { if (previewUrl) URL.revokeObjectURL(previewUrl); },
  });
  if (!s) return;

  previewUrl = URL.createObjectURL(file);
  s.body.appendChild(
    el("div", { class: "pcap-preview" }, [
      el("img", { class: "pcap-preview-img", src: previewUrl, alt: "The photo you picked" }),
    ])
  );
}
