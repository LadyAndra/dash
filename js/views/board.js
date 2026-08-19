// board.js — Pinterest-style masonry board (§4.2, "V1 — easy").
// Same query as everything else; just a CSS column layout of cards.
// (Phase 2 adds image thumbnails; today it's text cards.)

import { el, itemCard, emptyState } from "./shared.js";
import { colorToken } from "../theme.js";

export const boardView = {
  name: "board",
  label: "Board",
  defaultGroupBy: "none",
  supportsSelect: true, // shows the Select button in the topbar (§ multi-select)
  supportsCatalogChrome: true, // gets the catalog band + the index rail (app.js)

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
        const card = itemCard(ctx.store, item, ctx.onOpen, { selection: ctx.selection, statusControl: true });

        // PROJECT IDENTITY — the same filing mark that proved itself in List.
        // Board gets no new colour language: only project ITEMS receive a tiny
        // vertical registration tab beside their accession number. The card
        // stays paper-coloured; metadata stays untouched; ordinary entries and
        // entries merely assigned to a project still receive no mark.
        if (item.type === "project") {
          const value = item.color || ctx.store.typeDef(item.type)?.color;
          const no = card.querySelector(".card-head .item-no");
          if (no) {
            no.style.position = "relative";
            no.appendChild(el("span", {
              "aria-hidden": "true",
              style: `position:absolute;left:calc(100% + var(--space-1));top:0;bottom:0;width:var(--space-1);background:${colorToken(value)};pointer-events:none`,
            }));
          }
        }

        board.appendChild(card);
      }
    }
    container.appendChild(board);
  },
};
