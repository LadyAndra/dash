// list.js — the expandable list/tree view (§4.2, "V1 — easy, the default").
// Groups can be collapsed. groupBy is chosen by the toolbar (none/type/tag/status).

import { el, itemRow, emptyState } from "./shared.js";
import { colorToken } from "../theme.js";

export const listView = {
  name: "list",
  label: "List",
  defaultGroupBy: "type",
  supportsSelect: true, // shows the Select button in the topbar (§ multi-select)
  supportsCatalogChrome: true, // gets the catalog band + the index rail (app.js)

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
          "aria-expanded": String(!collapsed),
          onclick: () => ctx.toggleCollapse(group.key),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ctx.toggleCollapse(group.key); } },
        }, [
          el("span", {
            class: "group-title",
            text: group.label,
          }),

          el("span", {
            class: "group-rule",
            "aria-hidden": "true",
          }),

          el("span", { class: "group-count", text: `${group.items.length}` }),
        ]);
        wrap.appendChild(head);
        if (collapsed) { container.appendChild(wrap); continue; }
      }
      // statusControl: the row carries a quick status dropdown, so a status can
      // be changed without opening the editor (what Kanban used to be for).
      for (const item of group.items) {
        const row = itemRow(ctx.store, item, ctx.onOpen, { selection: ctx.selection, statusControl: true });

        // PROJECT IDENTITY — List experiment, round two.
        // A project's own colour is a tiny registration TAB beside its catalog
        // number. The first pass used a hairline under the number, which became
        // too faint in pale project colours and looked more like printing noise
        // than identity. The filled vertical tab gives every colour enough area
        // to read while staying completely out of the metadata grammar.
        //
        // The tab is absolutely positioned in the existing gap, so neither the
        // accession number nor the metadata shifts. Ordinary entries still get
        // nothing; Board still waits until this mark has earned its place here.
        if (item.type === "project") {
          const value = item.color || ctx.store.typeDef(item.type)?.color;
          const no = row.querySelector(".item-no");
          if (no) {
            no.style.position = "relative";
            no.appendChild(el("span", {
              "aria-hidden": "true",
              style: `position:absolute;left:calc(100% + var(--space-1));top:0;bottom:0;width:var(--space-1);background:${colorToken(value)};pointer-events:none`,
            }));
          }
        }

        wrap.appendChild(row);
      }
      container.appendChild(wrap);
    }
  },
};
