// kanban.js — status columns (§4.2, "V1 — easy"). Columns are DERIVED from
// the status registry (§2.2): add a status in settings, get a column here.
// Dragging a card to another column is literally one scalar field edit
// (status = newColumn) — no special kanban data is stored.

import { el, itemCard, emptyState } from "./shared.js";

export const kanbanView = {
  name: "kanban",
  label: "Kanban",
  forceGroupBy: "status", // this view always groups by status

  render(result, ctx, container) {
    container.innerHTML = "";
    if (result.total === 0) {
      container.appendChild(emptyState(
        "No cards yet",
        "New items appear in the column for their status. Drag between columns to change status.",
        "New item", ctx.onNew));
      return;
    }

    const board = el("div", { class: "kanban" });
    for (const group of result.groups) {
      const list = el("div", { class: "kanban-list" });
      for (const item of group.items) {
        const card = itemCard(ctx.store, item, ctx.onOpen, { hideStatus: true });
        card.draggable = true;
        card.addEventListener("dragstart", (e) => {
          card.classList.add("dragging");
          e.dataTransfer.setData("text/plain", item.id);
          e.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", () => card.classList.remove("dragging"));
        list.appendChild(card);
      }

      const col = el("div", { class: "kanban-col", "data-status": group.key }, [
        el("h3", {}, [group.label || group.key, el("span", { class: "group-count", text: `${group.items.length}` })]),
        list,
      ]);

      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drop-target"); });
      col.addEventListener("dragleave", () => col.classList.remove("drop-target"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("drop-target");
        const id = e.dataTransfer.getData("text/plain");
        if (id) ctx.store.setField(id, "status", group.key); // the entire "move" (§4.2)
      });

      board.appendChild(col);
    }
    container.appendChild(board);
  },
};
