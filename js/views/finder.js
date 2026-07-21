// finder.js — Finder-style columns (§4.2, "V1 — easy"). These are VIRTUAL
// folders: column 1 lists tags (or types); picking one filters column 2 to
// matching items. Nothing is actually "in" a folder — it's a live query, so
// the same item appears under every tag it has. This is the folder feel
// without folders (the requirement in §0).

import { el, itemRow, emptyState } from "./shared.js";

export const finderView = {
  name: "finder",
  label: "Columns",
  ownFilter: true, // this view manages its own selection, not the toolbar groupBy

  render(result, ctx, container) {
    container.innerHTML = "";
    const store = ctx.store;
    const all = store.all();
    if (all.length === 0) {
      container.appendChild(emptyState(
        "Nothing to browse yet",
        "Once you've captured and tagged a few things, browse them by tag or type here.",
        "New item", ctx.onNew));
      return;
    }

    const state = ctx.viewLocal; // persists selection while this view is open
    state.axis = state.axis || "tags";
    const finder = el("div", { class: "finder" });

    // --- column 0: axis switch (tags | types) ---
    const axisCol = el("div", { class: "finder-col" });
    for (const axis of [["tags", "Tags"], ["types", "Types"]]) {
      axisCol.appendChild(el("div", {
        class: "finder-entry",
        "aria-current": String(state.axis === axis[0]),
        onclick: () => { state.axis = axis[0]; state.pick = null; ctx.rerender(); },
      }, [axis[1]]));
    }
    finder.appendChild(axisCol);

    // --- column 1: the keys on that axis ---
    const keyCol = el("div", { class: "finder-col" });
    let keys;
    if (state.axis === "tags") {
      keys = store.allTags().map(t => ({ key: t, label: t, count: all.filter(i => i.tags.includes(t)).length }));
      keys.unshift({ key: "__untagged", label: "Untagged", count: all.filter(i => i.tags.length === 0).length });
    } else {
      keys = store.types().map(t => ({ key: t.key, label: t.label, count: all.filter(i => i.type === t.key).length }));
    }
    for (const k of keys) {
      if (k.count === 0) continue;
      keyCol.appendChild(el("div", {
        class: "finder-entry",
        "aria-current": String(state.pick === k.key),
        onclick: () => { state.pick = k.key; ctx.rerender(); },
      }, [el("span", { text: k.label }), el("span", { class: "count", text: `${k.count}` })]));
    }
    finder.appendChild(keyCol);

    // --- column 2: matching items ---
    const itemCol = el("div", { class: "finder-col" });
    if (state.pick) {
      let matches;
      if (state.axis === "tags") {
        matches = state.pick === "__untagged"
          ? all.filter(i => i.tags.length === 0)
          : all.filter(i => i.tags.includes(state.pick));
      } else {
        matches = all.filter(i => i.type === state.pick);
      }
      matches.sort((a, b) => (b.dates.modified || "").localeCompare(a.dates.modified || ""));
      for (const item of matches) itemCol.appendChild(itemRow(store, item, ctx.onOpen));
    } else {
      itemCol.appendChild(el("p", { class: "item-body-preview", text: "Pick a tag or type to see what's inside." }));
    }
    finder.appendChild(itemCol);

    container.appendChild(finder);
  },
};
