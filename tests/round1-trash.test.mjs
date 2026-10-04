// Round 1 (October 2026): THE TRASH.
//
//   node tests/round1-trash.test.mjs      (needs jsdom)
//
// What has to be true, and why each matters:
//   - Moving to trash is ONE ordinary `set trashed` op, restoring is one more,
//     and neither needs a new op kind or a formatVersion bump.
//   - A trashed item vanishes from EVERY surface — List/Board (query), Home's
//     counts and due panel, the Calendar, the desk, search, link lists, the
//     project index and its member counts — because they all read through
//     store.all()/get(). One fence, tested from each side.
//   - Restore brings it back with nothing lost: links, tags, desk position.
//   - Only Empty trash is permanent, and it asks first.
//   - The snapshot keeps trashed items (the must-fix Fable flagged: it used to
//     be built from all(), which would now silently drop them).
//   - Two devices: trash and restore merge by last-writer-wins like any field.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: 'https://ladyandra.github.io/dash/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver',
                 'requestAnimationFrame','getComputedStyle','CustomEvent','Event','PointerEvent',
                 'MouseEvent','KeyboardEvent','FileReader','Blob','URL'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine'), addEventListener(){}, removeEventListener(){} });

const { Store, FORMAT_VERSION, OP } = await import('../js/store.js');
const { query } = await import('../js/query.js');
const { entriesFor, todayGroups, overdueCount, calendarData } = await import('../js/entries.js');
const { todayISO } = await import('../js/milestones.js');
const { deskData } = await import('../js/desk.js');
const { openEditor } = await import('../js/editor.js');
const { openTrash, trashCount } = await import('../js/views/trash.js');
const { projectView } = await import('../js/views/project.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const settle = () => new Promise(r => setTimeout(r, 20));
const plusDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); d.setHours(12, 0, 0, 0); return d.toISOString(); };

function world() {
  const store = new Store();
  const pid = store.createItem({ title: "Freelance site", type: "project" });
  const ms = store.addMilestone(pid, { label: "Launch" });
  store.setMilestoneField(pid, ms, "date", todayISO());
  const a = store.createItem({ title: "Alpha note", tags: ["ideas"] });
  const b = store.createItem({ title: "Beta overdue" });
  store.setField(b, "due", plusDays(-3));
  store.assignToProject(a, pid);
  store.assignToProject(b, pid);
  store.placeOnDesk(a, pid, { x: 120, y: 80 }, 3);
  store.addToSet(b, "links", { target: a, label: "see also" });
  return { store, pid, ms, a, b };
}

console.log("\n--- moving to trash is one ordinary set op ---");
{
  const { store, a } = world();
  store.pendingOps = [];
  store.trash(a);
  ok("exactly one op was written", store.pendingOps.length === 1, JSON.stringify(store.pendingOps));
  const op = store.pendingOps[0];
  ok("...and it is a plain `set` of the `trashed` field", op.op === OP.SET && op.field === "trashed" && typeof op.value === "string");
  ok("no new op kind exists for it", !Object.values(OP).includes("trash"));
  ok("formatVersion is still 3", FORMAT_VERSION === 3);
  store.pendingOps = [];
  store.restore(a);
  ok("restoring is one op too, setting it back to null",
     store.pendingOps.length === 1 && store.pendingOps[0].field === "trashed" && store.pendingOps[0].value === null);
}

console.log("\n--- a trashed entry vanishes from every surface ---");
{
  const { store, pid, a, b } = world();
  const before = {
    all: store.all().length,
    list: query(store, {}).total,
    search: query(store, { filter: { text: "beta" } }).total,
    tag: query(store, { filter: { tag: "ideas" } }).total,
    overdue: overdueCount(store),
    members: deskData(store.all(), pid).members.length,
  };
  ok("baseline: Beta is overdue and both are on the project", before.overdue === 1 && before.members === 2);

  store.trash(b);
  ok("store.all() drops it", store.all().length === before.all - 1);
  ok("store.get() returns nothing for it", store.get(b) === null);
  ok("List / Board (query) drop it", query(store, {}).total === before.list - 1);
  ok("search no longer finds it", query(store, { filter: { text: "beta" } }).total === 0);
  ok("Home's overdue count drops it", overdueCount(store) === 0);
  ok("Home's due panel drops it", !todayGroups(store).overdue.some(e => e.itemId === b));
  ok("the Calendar drops it", !calendarData(store, null, null).entries.some(e => e.itemId === b));
  ok("the desk's member list drops it", deskData(store.all(), pid).members.length === 1);
  ok("it is in the trash", store.trashed().some(it => it.id === b) && trashCount(store) === 1);

  store.trash(a);
  ok("a trashed desk card leaves the desk", deskData(store.all(), pid).placed.length === 0);
  ok("a tag filter drops it", query(store, { filter: { tag: "ideas" } }).total === 0);

  store.restore(a);
  store.restore(b);
  ok("restore brings both back to List", query(store, {}).total === before.list);
  ok("...and the overdue count", overdueCount(store) === 1);
  const dd = deskData(store.all(), pid);
  ok("...and the desk card lands EXACTLY where it was",
     dd.placed.length === 1 && dd.placed[0].pos.x === 120 && dd.placed[0].pos.y === 80 && dd.placed[0].z === 3);
  ok("...with its tag", store.get(a).tags.includes("ideas"));
  ok("...and its link", store.get(b).links.some(l => l.target === a && l.label === "see also"));
  ok("the trash is empty again", trashCount(store) === 0);
}

console.log("\n--- links: the other side drops a trashed item and gets it back ---");
{
  const { store, a, b } = world();
  store.trash(a);
  const target = store.get(b).links.find(l => l.target === a);
  ok("the link itself is untouched on the other entry", !!target);
  ok("...but it resolves to nothing while A is trashed", store.get(target.target) === null);
  store.restore(a);
  ok("...and resolves again on restore", store.get(target.target)?.id === a);
}

console.log("\n--- a trashed project ---");
{
  const { store, pid, a } = world();
  ok("before: the entry knows its project", store.projectsOf(a).length === 1);
  store.trash(pid);
  ok("it leaves the project list", !store.projects().some(p => p.id === pid));
  ok("its members show no project context", store.projectsOf(a).length === 0);
  ok("its milestones leave Home and the Calendar",
     !calendarData(store, null, null).entries.some(e => e.itemId === pid));
  ok("its members are NOT trashed with it", !!store.get(a));
  store.restore(pid);
  ok("restore brings back project, membership and milestone",
     store.projects().some(p => p.id === pid) && store.projectsOf(a).length === 1 &&
     calendarData(store, null, null).entries.some(e => e.itemId === pid));
}

console.log("\n--- emptying is the permanent step ---");
{
  const { store, a, b } = world();
  store.trash(a); store.trash(b);
  store.pendingOps = [];
  const gone = store.emptyTrash();
  ok("both were emptied", gone === 2);
  ok("one existing `delete` tombstone each", store.pendingOps.length === 2 && store.pendingOps.every(o => o.op === OP.DELETE));
  ok("they are no longer in the trash", trashCount(store) === 0);
  ok("and not anywhere else either", !store.getAny(a) && !store.getAny(b) && !store.get(a));
}

console.log("\n--- the snapshot keeps the trash (Fable's must-fix) ---");
{
  const { store, a, b } = world();
  store.trash(a);
  store.deleteItem(b);
  const snap = JSON.parse(JSON.stringify(store.toSnapshot()));
  ok("the snapshot still carries the trashed item", snap.items.some(i => i.id === a && i.trashed));
  ok("...and the deleted one's tombstone", snap.items.some(i => i.id === b && i._deleted));
  const again = new Store();
  again.loadSnapshot(snap);
  ok("after a reload it is still in the trash, not lost and not live",
     again.trashed().some(i => i.id === a) && again.get(a) === null);
  again.restore(a);
  ok("...and can still be restored", again.get(a)?.title === "Alpha note");
}

console.log("\n--- two devices ---");
{
  const { store: mac, a } = world();
  const log = mac.drainPendingAsLines().map(l => JSON.parse(l));
  const ipad = new Store();
  ipad.replayLog(log);
  ok("the iPad sees the entry", !!ipad.get(a));

  mac.trash(a);
  ipad.replayLog(mac.drainPendingAsLines().map(l => JSON.parse(l)));
  ok("trashing on one device trashes it on the other", ipad.get(a) === null && ipad.trashed().length === 1);

  ipad.restore(a);
  mac.replayLog(ipad.drainPendingAsLines().map(l => JSON.parse(l)));
  ok("a later restore on the other device wins back on the first", !!mac.get(a));

  // An older build that does not know `trashed` applies the op harmlessly.
  const raw = new Store();
  raw.replayLog(log);
  raw._applyOp({ op: "set", itemId: a, field: "trashed", value: "2026-10-04T12:00:00.000Z",
                 ts: { wall: Date.now() + 5000, count: 0, device: "old" } }, false);
  ok("the field simply lands on the item; nothing throws", raw.items.get(a).trashed === "2026-10-04T12:00:00.000Z");
}

console.log("\n--- the editor's Delete button is now Move to trash ---");
{
  const { store, a } = world();
  let confirmed = 0;
  window.confirm = () => { confirmed++; return true; };
  openEditor(store, a, {});
  const scrim = [...document.querySelectorAll('.modal-scrim')].pop();
  const btn = [...scrim.querySelectorAll('button')].find(x => x.textContent === "Move to trash");
  ok("the button says Move to trash", !!btn);
  ok("...and no button says Delete", ![...scrim.querySelectorAll('button')].some(x => x.textContent === "Delete"));
  btn.click();
  await settle();
  ok("it asked for no confirmation (it can be undone)", confirmed === 0);
  ok("the item is in the trash", store.trashed().some(i => i.id === a));
  ok("the editor closed", !scrim.isConnected);
  document.querySelectorAll('.toast, #toasts *').forEach(x => x.remove());
}

console.log("\n--- the Trash drawer: restore, and empty with confirmation ---");
{
  const { store, a, b, pid } = world();
  store.trash(a); store.trash(b);
  let changed = 0;
  const t = openTrash(store, () => changed++);
  const rows = () => [...t.el.querySelectorAll('.trash-row')];
  ok("it lists both trashed items", rows().length === 2);
  ok("each row has a labelled Restore button",
     rows().every(r => /^Restore /.test(r.querySelector('.trash-restore')?.getAttribute('aria-label') || "")));
  ok("the dialog is labelled", t.el.getAttribute('role') === 'dialog' && !!t.el.getAttribute('aria-labelledby'));

  rows().find(r => r.dataset.id === a).querySelector('.trash-restore').click();
  ok("Restore takes it out of the drawer", rows().length === 1);
  ok("...and puts it back in the archive", !!store.get(a));
  ok("...and says so to a screen reader", /restored/i.test(t.el.querySelector('[role="status"]').textContent));

  t.el.querySelector('.trash-empty-btn').click();
  ok("Empty trash does NOT delete straight away", store.trashed().length === 1);
  ok("...it asks first, in the drawer", /for good/i.test(t.el.querySelector('.trash-confirm-text')?.textContent || ""));
  [...t.el.querySelectorAll('button')].find(x => x.textContent === "Keep them").click();
  ok("Keep them backs out with nothing deleted", store.trashed().length === 1 && !t.el.querySelector('.trash-confirm-text'));

  t.el.querySelector('.trash-empty-btn').click();
  t.el.querySelector('.trash-confirm-btn').click();
  ok("Delete forever empties it", store.trashed().length === 0 && !store.getAny(b));
  ok("the drawer says it is empty", /empty/i.test(t.el.querySelector('.trash-empty')?.textContent || ""));
  t.close();
  ok("closing tells the app to redraw", changed === 1);
  ok("the project is untouched by all this", !!store.get(pid));
}

console.log("\n--- the project index drops a trashed project, member counts too ---");
{
  const { store, pid, a } = world();
  const other = store.createItem({ title: "Garden", type: "project" });
  const host = document.getElementById('host');
  const ctx = { store, viewLocal: {}, selection: { active: false }, onOpen(){}, sync: null,
                holdRenders: () => () => {}, rerender: () => projectView.render(null, ctx, host) };
  ctx.rerender();
  const rowIds = () => [...host.querySelectorAll('[data-project-index-item]')].map(r => r.dataset.id);
  ok("both projects are on the index", rowIds().length === 2);
  store.trash(pid); ctx.rerender();
  ok("a trashed project leaves the index", rowIds().length === 1 && rowIds()[0] === other);
  store.restore(pid); ctx.rerender();
  ok("and comes back on restore", rowIds().length === 2);
  store.trash(a); ctx.rerender();
  const label = host.querySelector(`.project-index-list [data-id="${pid}"]`).getAttribute('aria-label');
  ok("a trashed member no longer counts toward its project", /1 entry/.test(label), label);
}

console.log(`\n${fail ? `${fail} of ${n} trash checks FAILED` : `all ${n} trash checks passed`}`);
process.exit(fail ? 1 : 0);
