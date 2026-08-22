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
        "New item",
        ctx.onNew
      ));
      return;
    }

    // GROUP: TYPE already names the type once, in the heading above the
    // column run. A card that repeats it under every title is saying nothing
    // — and quieting the mark's colour made that redundancy easier to see
    // rather than fixing it. Drop the mark in that one case only: grouped by
    // status or tag, or not grouped at all, the type is still the only thing
    // on a card that says what the entry IS.
    const typeIsTheHeading = result.groupBy === "type";

    const makeCard = (item) => {
      const card = itemCard(
        ctx.store,
        item,
        ctx.onOpen,
        {
          selection: ctx.selection,
          statusControl: true,
          hideType: typeIsTheHeading,

          // Filing is not state. A card's type mark drops its registry
          // colour so the status — the one mark you can actually change
          // from the card — is the only coloured thing on it. Same rule
          // List follows; see typeChip() in shared.js.
          quietType: true,
        }
      );

      // Preserve the existing project-colour registration tab.
      if (item.type === "project") {
        const value =
          item.color ||
          ctx.store.typeDef(item.type)?.color;

        const no =
          card.querySelector(".card-head .item-no");

        if (no) {
          no.style.position = "relative";

          no.appendChild(el("span", {
            "aria-hidden": "true",
            style: `position:absolute;left:calc(100% + var(--space-1));top:0;bottom:0;width:var(--space-1);background:${colorToken(value)};pointer-events:none`,
          }));
        }
      }

      return card;
    };

    const visibleGroups =
      result.groups.filter(
        (group) => group.items.length > 0
      );

    const grouped =
      visibleGroups.some(
        (group) => Boolean(group.label)
      );

    if (!grouped) {
      const board =
        el("div", { class: "board" });

      for (const group of visibleGroups) {
        for (const item of group.items) {
          board.appendChild(makeCard(item));
        }
      }

      container.appendChild(board);
      return;
    }

    for (const group of visibleGroups) {
      const section =
        el("section", {
          class: "board-group",
        });

      section.appendChild(
        el("div", {
          class: "board-group-head",
        }, [
          el("span", {
            class: "board-group-title",
            text: group.label,
          }),

          el("span", {
            class: "board-group-count",
            text: `${group.items.length}`,
          }),
        ])
      );

      const board =
        el("div", {
          class: "board",
        });

      for (const item of group.items) {
        board.appendChild(makeCard(item));
      }

      section.appendChild(board);
      container.appendChild(section);
    }
  },
};
