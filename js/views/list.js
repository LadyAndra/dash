// list.js — the expandable list/tree view (§4.2, "V1 — easy, the default").
// Groups can be collapsed. groupBy is chosen by the toolbar (none/type/tag/status).

import { el, itemRow, emptyState } from "./shared.js";

export const listView = {
  name: "list",
  label: "List",
  defaultGroupBy: "type",

  render(result, ctx, container) {
    container.innerHTML = "";
    if (result.total === 0) {
      container.appendChild(emptyState(
        "Nothing here yet",
        "Capture your first thing — an idea, a project, a note. You can retype or retag it any time.",
        "New item", ctx.onNew));
      return;
    }
    for (const group of result.groups) {
      if (group.items.length === 0) continue;
      const wrap = el("div", { class: "group" });
      if (group.label) {
        const collapsed = ctx.isCollapsed(group.key);
        const head = el("div", {
          class: "group-head" + (collapsed ? " collapsed" : ""),
          role: "button", tabindex: "0",
          onclick: () => ctx.toggleCollapse(group.key),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ctx.toggleCollapse(group.key); } },
        }, [
          el("span", { class: "caret", text: "▾" }),
          el("span", { text: group.label }),
          el("span", { class: "group-count", text: `${group.items.length}` }),
        ]);
        wrap.appendChild(head);
        if (collapsed) { container.appendChild(wrap); continue; }
      }
      for (const item of group.items) wrap.appendChild(itemRow(ctx.store, item, ctx.onOpen));
      container.appendChild(wrap);
    }
  },
};
