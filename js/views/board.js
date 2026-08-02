// board.js — Pinterest-style masonry board (§4.2, "V1 — easy").
// Same query as everything else; just a CSS column layout of cards.
// (Phase 2 adds image thumbnails; today it's text cards.)

import { el, itemCard, emptyState } from "./shared.js";

export const boardView = {
  name: "board",
  label: "Board",
  defaultGroupBy: "none",
  supportsSelect: true, // shows the Select button in the topbar (§ multi-select)
  supportsFilterPanel: true, // shows the "☰ Filters & Group" panel (app.js)

  render(result, ctx, container) {
    container.innerHTML = "";
    if (result.total === 0) {
      container.appendChild(emptyState(
        "An empty board",
        "Things you capture will show up here as cards.",
        "New item", ctx.onNew));
      return;
    }
    const board = el("div", { class: "board" });
    for (const group of result.groups) {
      for (const item of group.items) {
        // statusControl: the card carries a quick status dropdown, so a status
        // can be changed without opening the editor (what Kanban used to be for).
        board.appendChild(itemCard(ctx.store, item, ctx.onOpen, { selection: ctx.selection, statusControl: true }));
      }
    }
    container.appendChild(board);
  },
};
