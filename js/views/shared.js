// shared.js — small DOM helpers shared by views. Keeping these in one place
// means every view renders items consistently (§4.1 "views own layout").
// Views MUST NOT read raw colors; they call colorToken()/tintToken() (§10).

import { colorToken, tintToken, inkFor, resolveHex } from "../theme.js";
import { blobObjectURL } from "../blobs.js";
import { stageOf } from "../milestones.js";

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

// ---- the mono metadata voice (§ specimen-archive design) ----
// Type and status are tiny letterspaced "marks": a colored dot + a label,
// not filled pills. Color stays data-driven (registry colors are arbitrary),
// so a re-theme restyles them for free. The dot is drawn in CSS from
// currentColor, so we only set the text color here.
export function typeChip(store, item) {
  const t = store.typeDef(item.type);
  return el("span", { class: "mk", style: `color:${colorToken(t?.color)}` },
    [t?.label || item.type]);
}

export function statusChip(store, item) {
  const s = store.statusDef(item.status);
  return el("span", { class: "mk", style: `color:${colorToken(s?.color)}` },
    [s?.label || item.status]);
}

export function tagChips(item) {
  return item.tags.map(t => el("span", { class: "tag", text: t }));
}

// ---- the stage chip (milestones addendum §3.3) ----
// Where a project is right now: its earliest unfinished milestone, or
// "Complete" when they're all ticked off, or nothing at all when the project
// has no milestones. COMPUTED HERE, AT RENDER TIME, FROM THE IN-MEMORY ITEM —
// there is no stage field, no stage registry, and nothing is ever written back
// to the store. That's the whole point: it can't go stale and can't conflict.
//
// Colour: --text-muted on --surface-raised normally, --ember when the current
// stage's date has passed. Overdue is an indicator, which is the one thing
// tokens.css reserves ember for — so this is its sanctioned use, and there is
// no ember anywhere else in this feature.
//
// Returns null for anything that isn't a project with milestones, so callers
// can drop it straight into a children array.
export function stageChip(item) {
  if (!item || item.type !== "project") return null;
  const stage = stageOf(item);
  if (!stage) return null;
  return el("span", {
    class: "stage-chip" + (stage.overdue ? " overdue" : "") + (stage.complete ? " complete" : ""),
    title: stage.overdue ? "This stage's date has passed" : "Current stage",
  }, [stage.label]);
}

export function swatch(store, item) {
  return el("div", { class: "item-swatch", style: `background:${colorToken(itemColor(store, item))}` });
}

// ===================================================================
//  COLOUR: what colour is this thing, and how does it become a GROUND
// ===================================================================
// The rule as of August 2026 (an amendment to §10, made deliberately):
//
//   Ember is still an indicator and only an indicator. It means "past its
//   date" and nothing else, anywhere in Dash.
//
//   The seven PALETTE colours are now allowed to be grounds — a filled block
//   behind cream ink — and not only thin marks. That's what makes a project
//   identifiable at a glance instead of being one more line of text.
//
// The two never collide, because ember isn't in the palette. A page can have
// a plum project block and an ember overdue block on it and they still say
// two different things.
//
// Every palette colour was checked as a background against --text-on-accent
// in both themes before this shipped: the worst pair is 5.32:1, the best
// 7.62:1, all past AA. And because --text-on-accent flips per theme (cream on
// the paper theme, near-black on the mount theme), a ground stays legible
// through a re-theme without a second set of tokens to maintain.

// The colour an item is drawn in: its own override if it has one, otherwise
// the colour its TYPE carries in the registry. Everything that draws a colour
// for an item should go through here, so "let me pick a colour for this"
// works the same way everywhere rather than only on projects.
export function itemColor(store, item) {
  if (!item) return null;
  if (item.color) return item.color;
  return store.typeDef(item.type)?.color || null;
}

// Inline style for a filled colour block. Returned as a style string rather
// than a class because the colour is DATA — it comes from the registry, or
// from a colour someone picked — and CSS can't know the values in advance.
//
// It sets TWO things: the ground, and --ground-ink, which is the more
// readable of Dash's two inks written over that ground. Every rule that puts
// text on a colour block reads var(--ground-ink), so one inline property
// makes a whole block legible no matter what colour lands in it — including a
// custom hex that nothing in the stylesheet could have anticipated.
export function groundStyle(store, item) {
  const value = itemColor(store, item);
  const hex = resolveHex(value);
  const ink = inkFor(hex).hex;
  // --ground-bg as well as --ground-ink, so a control ON the block can invert
  // itself — a filled button whose text is the block's own colour. Without it
  // there'd be no way for CSS to name a colour it never knew about.
  return `background:${colorToken(value)};--ground-ink:${ink};--ground-bg:${hex}`;
}

// ===================================================================
//  PANELS — the bordered box with a header bar
// ===================================================================
// Lifted out of views/home.js in August 2026, on the rule stated there: the
// registry stays local to one view until a SECOND view needs it. Projects is
// that second view, so the box-drawing moved here and the PANELS arrays stay
// where they're used.
//
// A panel is a plain object:
//   { id, title, span, render(container, ctx) }   // + optional column/right/flush
// See views/home.js for what each field means.
export function renderPanel(panel, ctx) {
  const right = typeof panel.right === "function" ? panel.right(ctx) : panel.right;

  const body = el("div", {
    class: "panel-body" + (panel.flush ? " panel-body-flush" : ""),
  });
  panel.render(body, ctx);

  const box = el("div", { class: "panel", "data-panel": panel.id }, [
    el("div", { class: "panel-head" }, [
      el("span", { class: "plate-title", text: panel.title }),
      right ? el("span", { class: "panel-right num", text: right }) : null,
    ]),
    body,
  ]);

  // span > 1 means "full width, however many columns there are". Said as
  // `grid-column: 1 / -1` in CSS rather than `span 2`, because a literal span
  // of 2 would invent a phantom second column on a narrow screen.
  if ((panel.span || 1) > 1) box.classList.add("panel-wide");

  return box;
}

// The catalog accession number: the item's position in creation order,
// 1-based and zero-padded. Delegated to the store, which keeps the register
// stable (deletions don't renumber; new items take the next number). See
// Store.accessionNo. Display-only — the ULID remains the real id, so no data
// migration and it stays consistent across devices.
export function catalogNo(store, item) {
  return store.accessionNo(item.id);
}

// Short uppercase date for the mono meta line, e.g. "16 JUL". Falls back to
// created if modified is missing.
export function shortDate(item) {
  const iso = item?.dates?.modified || item?.dates?.created;
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()];
  return `${d.getDate()} ${mon}`;
}

// The drawing attached to a sketch item, if any.
function sketchAtt(item) {
  return (item.attachments || []).find(a => a.role === "sketch") || null;
}

// A small preview of a sketch, on warm paper, that fills in asynchronously
// (blobs live in IndexedDB). Returns null if the item has no drawing, so
// callers can decide whether to fall back to text.
function sketchThumb(item, cls) {
  const att = sketchAtt(item);
  if (!att) return null;
  const box = el("div", { class: cls });
  blobObjectURL(att.hash).then((url) => {
    if (url) box.appendChild(el("img", { src: url, alt: item.title || "sketch", class: "sketch-thumb-img" }));
  });
  return box;
}

// A full specimen entry for the list view: a catalog number in the left
// column, a mono meta line, the title in serif, a short preview, then tags.
// Hairline-separated rather than boxed (§ specimen-archive design).
// opts.selection — the selection controller (see js/selection.js). When select
// mode is on the row grows a checkbox and a picked state; the click handler is
// unchanged, because onOpen is what app.js re-points at "toggle selection".
export function itemRow(store, item, onOpen, opts = {}) {
  const thumb = sketchThumb(item, "item-sketch-thumb");
  const left = thumb || el("span", { class: "item-no", text: `№ ${catalogNo(store, item)}` });

  const meta = el("div", { class: "item-meta" }, [
    typeChip(store, item),
    statusChip(store, item),
    stageChip(item),                 // projects only; null for everything else
    el("span", { class: "num", text: shortDate(item) }),
  ]);
  const main = el("div", { class: "item-main" }, [
    meta,
    el("h3", { class: "item-title", text: item.title || (thumb ? "Sketch" : "Untitled") }),
    item.body ? el("p", { class: "item-body-preview", text: item.body }) : null,
    item.tags.length ? el("div", { class: "item-foot" }, tagChips(item)) : null,
  ]);

  const row = el("div", {
    class: "item-row",
    role: "button",
    tabindex: "0",
    "data-id": item.id,
    onclick: () => onOpen(item.id),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } },
  }, [left, main]);

  return applySelectable(row, item, opts.selection);
}

// A compact specimen card for board / kanban. Same voice as the row: a mono
// header line (catalog no. + marks), serif title, preview, tags.
export function itemCard(store, item, onOpen, opts = {}) {
  const thumb = sketchThumb(item, "card-sketch-thumb");
  const header = el("div", { class: "card-head" }, [
    el("span", { class: "item-no", text: `№ ${catalogNo(store, item)}` }),
    el("span", { class: "num", text: shortDate(item) }),
  ]);
  const marks = el("div", { class: "item-meta" }, [
    opts.hideType ? null : typeChip(store, item),
    opts.hideStatus ? null : statusChip(store, item),
    stageChip(item),                 // projects only; null for everything else
  ]);

  const card = el("div", {
    class: "card",
    role: "button",
    tabindex: "0",
    "data-id": item.id,
    onclick: () => onOpen(item.id),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } },
  }, [
    header,
    thumb,
    el("h3", { class: "item-title", text: item.title || (sketchAtt(item) ? "Sketch" : "Untitled") }),
    item.body ? el("p", { class: "item-body-preview", text: item.body }) : null,
    marks,
    item.tags.length ? el("div", { class: "item-foot" }, tagChips(item)) : null,
  ]);

  return applySelectable(card, item, opts.selection);
}

// ---- select mode (the Pinterest-style "organise" toggle) ----
// A small square that shows whether an entry is picked. It's decoration only:
// the tap is handled by the row/card itself (app.js decides whether a tap
// means "open" or "select"), so there is exactly ONE click path per item and
// no chance of the box and the row disagreeing.
function selectBox(selected) {
  return el("span", {
    class: "select-box" + (selected ? " on" : ""),
    "aria-hidden": "true",       // the row already carries aria-pressed
    text: selected ? "✓" : "",
  });
}

// Apply the shared select-mode treatment to a row or card: the checkbox, the
// pressed state for screen readers, and the classes the CSS uses to highlight.
// `sel` is the selection controller from app.js, or null/undefined when the
// view isn't in select mode — in which case this does nothing at all.
function applySelectable(node, item, sel) {
  if (!sel || !sel.active) return node;
  const on = sel.has(item.id);
  node.classList.add("selecting");
  if (on) node.classList.add("is-selected");
  node.setAttribute("aria-pressed", String(on));
  node.insertBefore(selectBox(on), node.firstChild);
  return node;
}

export function emptyState(title, body, actionLabel, onAction) {
  return el("div", { class: "empty" }, [
    el("h2", { text: title }),
    el("p", { text: body }),
    actionLabel ? el("button", { class: "btn btn-primary", text: actionLabel, onclick: onAction }) : null,
  ]);
}
