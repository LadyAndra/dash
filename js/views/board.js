// board.js — Pinterest-style masonry board (§4.2, "V1 — easy").
// Same query as everything else; just a CSS column layout of cards.
// (Phase 2 adds image thumbnails; today it's text cards.)

import { el, itemCard, emptyState } from "./shared.js";

export const boardView = {
  name: "board",
  label: "Board",
  defaultGroupBy: "none",

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
        board.appendChild(itemCard(ctx.store, item, ctx.onOpen));
      }
    }
    container.appendChild(board);
  },
};
