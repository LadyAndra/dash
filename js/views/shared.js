// shared.js — small DOM helpers shared by views. Keeping these in one place
// means every view renders items consistently (§4.1 "views own layout").
// Views MUST NOT read raw colors; they call colorToken() or groundStyle() (§10).

import { colorToken, inkFor, resolveHex } from "../theme.js";
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
// opts.quiet — draw the type mark WITHOUT its registry colour, as plain
// faint mono (.mk-quiet in app.css). Filing is not state: what something was
// typed as never changes and can't be changed from a row, while a status can
// be. Where both marks sit on the same line, only the one you can act on
// earns colour — otherwise two coloured marks compete with each other and
// with the serif title, and colour stops meaning anything. Opt-in, so List
// gets it and every other surface keeps the colour it already had.
export function typeChip(store, item, opts = {}) {
  const t = store.typeDef(item.type);
  const label = t?.label || item.type;
  if (opts.quiet) return el("span", { class: "mk mk-quiet" }, [label]);
  return el("span", { class: "mk", style: `color:${colorToken(t?.color)}` },
    [label]);
}

export function statusChip(store, item) {
  const s = store.statusDef(item.status);
  return el("span", { class: "mk", style: `color:${colorToken(s?.color)}` },
    [s?.label || item.status]);
}

// ---- the quick status control (August 1, 2026) ----
// Kanban was unregistered because Andra doesn't use it, but it did one thing
// nothing else could: change an entry's status without opening the editor.
// This is that, moved onto the rows and cards themselves.
//
// It is deliberately BORING underneath. The options come from the same status
// registry Kanban's columns were derived from (§2.2 — statuses are data, not
// code), and choosing one calls the same store.setField() the editor calls. No
// new op kind, no new field, nothing added to the data model. Add a status in
// Settings and it appears in here, on every row, for free.
//
// Two details that matter:
//   - Every event is stopped from bubbling. The row around it is a role=button
//     that opens the editor, so without this a tap on the dropdown would open
//     the item instead — and Enter/Space on the open dropdown would too.
//   - An item can carry a status that has since been renamed or removed from
//     the registry. Rather than silently snapping it to the first option, the
//     unknown key is added as its own option so the control shows the truth.
export function statusControl(store, item) {
  const cur = store.statusDef(item.status);
  const known = store.statuses();

  const sel = el("select", {
    "aria-label": "Status",
    onclick: (e) => e.stopPropagation(),
    onmousedown: (e) => e.stopPropagation(),
    onkeydown: (e) => e.stopPropagation(),
    onchange: (e) => {
      e.stopPropagation();
      store.setField(item.id, "status", e.target.value);
    },
  });
  for (const s of known) sel.appendChild(el("option", { value: s.key, text: s.label || s.key }));
  if (!known.some(s => s.key === item.status)) {
    sel.appendChild(el("option", { value: item.status, text: item.status }));
  }
  sel.value = item.status;

  // Colour comes from the registry, inline, exactly like a .mk mark — the dot
  // and the caret are drawn from currentColor / a token in CSS, so a re-theme
  // and a brand-new status both work without touching the stylesheet.
  return el("span", { class: "status-ctl", style: `color:${colorToken(cur?.color)}` }, [sel]);
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
// opts.statusControl — draw the status as an editable control rather than a
// read-only mark. Opt-in, so List and Board get it and Project's connected-item
// lists stay a quiet read-only index.
// opts.quietType — draw the type mark in plain faint mono instead of its
// registry colour (see typeChip above). Opt-in for the same reason.
export function itemRow(store, item, onOpen, opts = {}) {
  const thumb = sketchThumb(item, "item-sketch-thumb");
  const left = thumb || el("span", { class: "item-no", text: `№ ${catalogNo(store, item)}` });

  const meta = el("div", { class: "item-meta" }, [
    typeChip(store, item, { quiet: !!opts.quietType }),
    editableStatus(opts) ? statusControl(store, item) : statusChip(store, item),
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
// opts.quietType — draw the type mark in plain faint mono instead of its
// registry colour, exactly as itemRow's option of the same name does (see
// typeChip above). Opt-in for the same reason: Board asks for it, and any
// other surface that draws a card keeps the colour it already had.
export function itemCard(store, item, onOpen, opts = {}) {
  const thumb = sketchThumb(item, "card-sketch-thumb");
  const header = el("div", { class: "card-head" }, [
    el("span", { class: "item-no", text: `№ ${catalogNo(store, item)}` }),
    el("span", { class: "num", text: shortDate(item) }),
  ]);
  const marks = el("div", { class: "item-meta" }, [
    opts.hideType ? null : typeChip(store, item, { quiet: !!opts.quietType }),
    opts.hideStatus ? null
      : (editableStatus(opts) ? statusControl(store, item) : statusChip(store, item)),
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

// Should this row/card draw an editable status? Only if the view asked for it
// AND we're not in select mode. While you're picking entries, a tap anywhere on
// a row means "pick this" — a dropdown that opened instead, or worse quietly
// changed a status mid-selection, would be exactly the kind of surprise bulk
// editing must never cause. (Same reasoning that switched off kanban drag
// during select mode.) The read-only mark takes its place, so nothing moves.
function editableStatus(opts) {
  return !!opts.statusControl && !(opts.selection && opts.selection.active);
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
