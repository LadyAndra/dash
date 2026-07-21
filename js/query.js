// query.js — the ONE query shape every view uses (§4.1).
// query(store, { filter, groupBy, sortBy }) -> { groups: [{key,label,items}] }
// Views never touch the store's internals; they call this and render.
// This is why board / kanban / tree / finder are "the same query rendered
// four ways" (§4.2) — they differ only in groupBy and layout.

export function query(store, opts = {}) {
  const { filter = {}, groupBy = "none", sortBy = "modified-desc" } = opts;

  let items = store.all();

  // ---- filter ----
  if (filter.text) {
    const q = filter.text.toLowerCase();
    items = items.filter(it =>
      it.title.toLowerCase().includes(q) ||
      it.body.toLowerCase().includes(q) ||
      it.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  if (filter.type) items = items.filter(it => it.type === filter.type);
  if (filter.status) items = items.filter(it => it.status === filter.status);
  if (filter.tag) items = items.filter(it => it.tags.includes(filter.tag));
  if (filter.untagged) items = items.filter(it => it.tags.length === 0);

  // ---- sort ----
  items = sortItems(items, sortBy);

  // ---- group ----
  const groups = groupItems(store, items, groupBy);
  return { groups, total: items.length };
}

function sortItems(items, sortBy) {
  const by = {
    "modified-desc": (a, b) => cmpDate(b.dates.modified, a.dates.modified),
    "modified-asc":  (a, b) => cmpDate(a.dates.modified, b.dates.modified),
    "created-desc":  (a, b) => cmpDate(b.dates.created, a.dates.created),
    "created-asc":   (a, b) => cmpDate(a.dates.created, b.dates.created),
    "title-asc":     (a, b) => (a.title || "").localeCompare(b.title || ""),
    "touched-desc":  (a, b) => cmpDate(b.dates.touched, a.dates.touched),
  }[sortBy] || null;
  return by ? [...items].sort(by) : items;
}

function cmpDate(a, b) {
  return (a || "").localeCompare(b || "");
}

function groupItems(store, items, groupBy) {
  if (groupBy === "none") {
    return [{ key: "__all", label: null, items }];
  }
  if (groupBy === "status") {
    // ordered by the registry so kanban columns follow the user's order (§2.2)
    return store.statuses().map(s => ({
      key: s.key,
      label: s.label,
      color: s.color,
      items: items.filter(it => it.status === s.key),
    }));
  }
  if (groupBy === "type") {
    return store.types().map(t => ({
      key: t.key,
      label: t.label,
      icon: t.icon,
      color: t.color,
      items: items.filter(it => it.type === t.key),
    }));
  }
  if (groupBy === "tag") {
    const map = new Map();
    for (const it of items) {
      if (it.tags.length === 0) push(map, "__untagged", it);
      for (const t of it.tags) push(map, t, it);
    }
    const groups = [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, arr]) => ({
        key,
        label: key === "__untagged" ? "Untagged" : key,
        items: arr,
      }));
    return groups;
  }
  return [{ key: "__all", label: null, items }];
}

function push(map, key, val) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(val);
}
