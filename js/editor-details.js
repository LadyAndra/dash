// editor-details.js — progressive disclosure for the item editor.
//
// The editor is deliberately rich, but capture should not feel like filling in
// a database record. This tiny presentation module leaves editor.js and all of
// its save/sync behavior alone, then groups the less-frequent organising tools
// under one native <details> disclosure once an item editor reaches the DOM.
//
// New items start compact. Existing items start open so information that was
// already recorded can never appear to have vanished behind a new UI rule.

// Sketch is deliberately NOT in this list. It's part of the entry itself —
// the same category as Title and Notes — not organising/filing metadata, so
// it should never be tucked behind this disclosure. It stays wherever
// editor.js put it in the DOM (right after Notes) on every screen size.
const SECONDARY_ORDER = [
  "Projects",
  "Tags",
  "Files & images",
  "Connections",
];

function directFieldLabel(field) {
  const label = field.querySelector(":scope > label");
  return label?.textContent?.trim() || "";
}

function isItemEditor(modal) {
  return !!modal?.querySelector('input[aria-label="Title"]');
}

function enhanceEditor(modal) {
  if (!isItemEditor(modal) || modal.dataset.detailsEnhanced === "1") return;
  modal.dataset.detailsEnhanced = "1";

  const fields = new Map();
  for (const child of modal.children) {
    if (!child.classList?.contains("field")) continue;
    const label = directFieldLabel(child);
    if (SECONDARY_ORDER.includes(label)) fields.set(label, child);
  }

  const ordered = SECONDARY_ORDER.map((label) => fields.get(label)).filter(Boolean);
  if (!ordered.length) return;

  const heading = modal.querySelector(":scope > :first-child h2");
  const isNew = heading?.textContent?.trim().toLowerCase() === "new item";

  const details = document.createElement("details");
  details.className = "editor-more editor-details";
  // Existing items open by default. This is intentionally conservative: the
  // editor cannot inspect store data from this presentation-only module, so
  // opening edits guarantees that existing projects/tags/files/links are
  // never made to look missing. New capture gets the space-saving default.
  //
  // On desktop there's no vertical-space problem to solve, so the CSS at
  // 901px+ hides the toggle entirely and this section is meant to just
  // always be part of the right column. A native <details> only renders its
  // content when genuinely open — CSS alone can't fake that past the
  // browser's own closed-state hiding — so the real `open` attribute has to
  // be true on desktop, not just visually implied. Decided once, at the
  // moment the editor opens; resizing an already-open editor across the
  // breakpoint is a rare enough case not to chase.
  const desktopWide = window.matchMedia("(min-width: 901px)").matches;
  details.open = !isNew || desktopWide;
  modal.classList.toggle("editor-expanded", details.open);
  details.addEventListener("toggle", () => {
    modal.classList.toggle("editor-expanded", details.open);
  });

  const summary = document.createElement("summary");
  summary.className = "editor-more-summary";

  const title = document.createElement("span");
  title.className = "editor-more-title";
  title.textContent = "More details";

  const hint = document.createElement("span");
  hint.className = "editor-more-hint";
  hint.textContent = "Projects · Tags · Files · Links";

  summary.append(title, hint);

  const body = document.createElement("div");
  body.className = "editor-more-body";

  const metadata = document.createElement("div");
  metadata.className = "editor-detail-metadata";
  const sketch = ordered.find((field) => directFieldLabel(field) === "Sketch");

  ordered[0].before(details);
  details.append(summary, body);
  body.append(metadata);
  for (const field of ordered) {
    if (field !== sketch) metadata.appendChild(field);
  }
  if (sketch) body.append(sketch);
}

function scan(root = document) {
  if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(".modal")) enhanceEditor(root);
  root.querySelectorAll?.(".modal").forEach(enhanceEditor);
}

scan();

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      scan(node);
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
