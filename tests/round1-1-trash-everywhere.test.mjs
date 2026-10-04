// Round 1.1 (October 2026): TRASH EVERYWHERE.
//
//   node tests/round1-1-trash-everywhere.test.mjs      (needs jsdom)
//
// What has to be true, and why each matters:
//   - B: every List row (search included), Board card, desk drawer row, desk card and
//     Home entry row has a one-click "Move to trash" button: a real button,
//     labelled with the entry's name, that trashes with ONE ordinary op, never
//     opens the entry underneath it, and is absent in Select mode (where a tap
//     means "pick this").
//   - C: right-clicking a desk card offers "Move to trash", through the same
//     single op. Not on a card in a closed clip (the stack is one object).
//   - D: Select mode's bar has "Move to trash": one op per item, no confirm,
//     and an Undo that restores exactly that batch and nothing else.
//   - Trashing a PROJECT from a button keeps its members' links, exactly as
//     the editor's Move to trash does, so restore puts everything back.
//   - Post-its and desk images (second pass): their right-click scribble moves
//     them to the same Trash, Restore and Undo put them back exactly, Empty
//     trash removes them for good and erases an image's file only if nothing
//     else uses it. A BLANK post-it is still simply discarded.
//   - THE AUDIT: nothing in js/ can permanently delete an Item except Empty
//     trash, and the same for post-its and desk images. This scans the source, so a future change that adds a second
//     permanent-delete path fails the build.
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dom = new JSDOM('<!doctype html><body><div id="host"></div><div id="toasts"></div></body>', {
  pretendToBeVisual: true, url: 'https://ladyandra.github.io/dash/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver',
                 'requestAnimationFrame','getComputedStyle','CustomEvent','Event','PointerEvent',
                 'MouseEvent','KeyboardEvent','FileReader','Blob','URL'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(dom.window, 'innerWidth', { get: () => 1440, configurable: true });
Object.defineProperty(dom.window, 'innerHeight', { get: () => 900, configurable: true });
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine'), addEventListener(){}, removeEventListener(){} });

const { Store, OP, PROJECT_LINK } = await import('../js/store.js');
const { query } = await import('../js/query.js');
const { itemRow, itemCard } = await import('../js/views/shared.js');
const { listView } = await import('../js/views/list.js');
const { boardView } = await import('../js/views/board.js');
const { homeView } = await import('../js/views/home.js');
const { renderProjectPage } = await import('../js/views/desk.js');
const { createSelection } = await import('../js/selection.js');
const { moveToTrash, undoTrash } = await import('../js/trash-actions.js');
const { deskData } = await import('../js/desk.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const click = (node) => node.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }));
const toasts = () => document.getElementById('toasts');
const clearToasts = () => { toasts().innerHTML = ""; };
const plusDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); d.setHours(12, 0, 0, 0); return d.toISOString(); };

function world() {
  const store = new Store();
  const pid = store.createItem({ title: "Freelance site", type: "project" });
  const a = store.createItem({ title: "Alpha note" });
  const b = store.createItem({ title: "Beta task" });
  const c = store.createItem({ title: "Gamma idea" });
  for (const id of [a, b, c]) store.assignToProject(id, pid);
  return { store, pid, a, b, c };
}

function ctxFor(store, selection = { active: false, has: () => false }) {
  const opened = [];
  return {
    opened,
    ctx: {
      store, selection, viewLocal: {}, sync: null,
      onOpen: (id) => opened.push(id),
      rerender() {}, holdRenders: () => () => {},
      isCollapsed: () => false, toggleCollapse() {},
      unfiled: store.all().filter(it => it.inbox === true),
    },
  };
}

// The one-button contract, checked identically on every surface.
function checkButton(surface, store, container, id, opened) {
  const title = store.get(id).title;
  const btn = [...container.querySelectorAll('.item-trash')]
    .find(b => b.getAttribute('aria-label') === `Move to trash: ${title}`);
  ok(`${surface}: has a trash button labelled "Move to trash: ${title}"`, !!btn);
  if (!btn) return;
  ok(`${surface}: ...a real button, so it is keyboard reachable`, btn.tagName === "BUTTON" && btn.getAttribute('type') === "button");
  clearToasts();
  store.pendingOps = [];
  click(btn);
  ok(`${surface}: one click trashes it`, store.get(id) === null && !!store.getAny(id)?.trashed);
  ok(`${surface}: ...with exactly one ordinary set op`,
     store.pendingOps.length === 1 && store.pendingOps[0].op === OP.SET && store.pendingOps[0].field === "trashed",
     JSON.stringify(store.pendingOps));
  ok(`${surface}: ...without opening the entry underneath`, !opened.includes(id));
  ok(`${surface}: ...and no confirm`, !document.querySelector('.modal-scrim'));
  const undo = toasts().querySelector('.toast-undo');
  ok(`${surface}: a message offers Undo`, !!undo && /Moved to trash/.test(toasts().textContent));
  if (undo) click(undo);
  ok(`${surface}: Undo puts it back`, !!store.get(id));
  store.trash(id); store.restore(id);   // leave nothing odd behind
}

// ===================================================================
console.log("\n--- B: the shared row and card ---");
{
  const { store, a } = world();
  const opened = [];
  const row = itemRow(store, store.get(a), (id) => opened.push(id), { trash: true });
  document.getElementById('host').replaceChildren(row);
  checkButton("a row", store, row, a, opened);

  const plain = itemRow(store, store.get(a), () => {}, {});
  ok("a row that didn't ask for it gets no button (read-only indexes stay read-only)", !plain.querySelector('.item-trash'));

  const sel = createSelection(store, () => {});
  sel.enter();
  const picking = itemRow(store, store.get(a), () => {}, { trash: true, selection: sel });
  ok("no trash button on a row in Select mode", !picking.querySelector('.item-trash'));
  const pickingCard = itemCard(store, store.get(a), () => {}, { trash: true, selection: sel });
  ok("no trash button on a card in Select mode", !pickingCard.querySelector('.item-trash'));

  const card = itemCard(store, store.get(a), (id) => opened.push(id), { trash: true });
  document.getElementById('host').replaceChildren(card);
  checkButton("a card", store, card, a, opened);

  // Enter on the focused button must not bubble up and open the card.
  const btn = card.querySelector('.item-trash');
  btn.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok("Enter on the button never reaches the card's own open-on-Enter", !opened.includes(a));
}

// ===================================================================
console.log("\n--- B: every surface that lists entries ---");
for (const [name, view] of [["List", listView], ["Board", boardView]]) {
  const { store, b } = world();
  const { ctx, opened } = ctxFor(store);
  const host = document.createElement('div');
  view.render(query(store, {}), ctx, host);
  checkButton(name, store, host, b, opened);
}
{
  // Search is the List with a text filter, so it gets the List's rows.
  const { store, b } = world();
  const { ctx, opened } = ctxFor(store);
  const host = document.createElement('div');
  listView.render(query(store, { filter: { text: "beta" } }), ctx, host);
  checkButton("a List search", store, host, b, opened);
}
{
  const { store, a, b } = world();
  store.setField(a, "inbox", true);                    // a phone capture, waiting
  store.setField(b, "due", plusDays(1));               // due tomorrow
  const { ctx, opened } = ctxFor(store);
  const host = document.createElement('div');
  homeView.render(query(store, {}), ctx, host);
  checkButton("Home's Unfiled box", store, host.querySelector('.unfiled-list') || host, a, opened);
  const host2 = document.createElement('div');
  homeView.render(query(store, {}), ctxFor(store).ctx, host2);
  checkButton("Home's due panel", store, host2, b, opened);
}
{
  // A milestone row on Home gets no trash button: a milestone isn't an item.
  const store = new Store();
  const pid = store.createItem({ title: "P", type: "project" });
  const mid = store.addMilestone(pid, { label: "Launch" });
  store.setMilestoneField(pid, mid, "date", plusDays(1));
  const host = document.createElement('div');
  homeView.render(query(store, {}), ctxFor(store).ctx, host);
  const msRow = [...host.querySelectorAll('.today-row')].find(r => /Launch/.test(r.textContent));
  ok("Home: a milestone row has no trash button", !!msRow && !msRow.querySelector('.item-trash'));
}

// ===================================================================
console.log("\n--- B and C: the desk ---");
function deskHarness(seed) {
  const { store, pid, a, b, c } = world();
  [a, b, c].forEach((id, i) => store.placeOnDesk(id, pid, { x: 200 + i * 300, y: 200 }, i + 1));
  if (seed) seed(store, pid, [a, b, c]);
  const opened = [];
  const ctx = {
    store, viewLocal: {}, selection: { active: false }, onOpen: (id) => opened.push(id), sync: null,
    holdRenders: () => () => {}, rerender() {},
  };
  const actions = { onBack(){}, onEdit(){}, onNew(){}, onAdd(){} };
  const host = document.getElementById('host');
  host.innerHTML = "";
  const page = renderProjectPage(store, store.get(pid), ctx, actions);
  host.appendChild(page);
  const deskEl = page.querySelector('.desk-surface');
  if (deskEl) deskEl.setPointerCapture = () => {};
  return { store, pid, ids: [a, b, c], ctx, page, opened };
}
{
  const h = deskHarness();
  const card = h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`);
  ok("a desk card has a trash button", !!card?.querySelector('.dcard-trash'));
  const press = new dom.window.Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(press, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
  h.store.pendingOps = [];
  card.querySelector('.dcard-trash').dispatchEvent(press);
  ok("pressing it writes nothing and starts no drag", h.store.pendingOps.length === 0 && !card.classList.contains('is-dragging'));
  checkButton("a desk card", h.store, card, h.ids[0], h.opened);
  ok("...and restore puts the card back exactly where it was",
     deskData(h.store.all(), h.pid).placed.some(p => p.id === h.ids[0] && p.pos.x === 200 && p.pos.y === 200));
}
{
  const h = deskHarness();
  const card = h.page.querySelector(`.dcard[data-id="${h.ids[1]}"]`);
  card.dispatchEvent(Object.assign(new dom.window.Event('contextmenu', { bubbles: true, cancelable: true }),
                                   { clientX: 300, clientY: 260 }));
  const menu = document.querySelector('.desk-menu');
  const item = menu && [...menu.querySelectorAll('.desk-menu-item')].find(b => b.textContent === "Move to trash");
  ok("C: right-clicking a desk card offers Move to trash", !!item);
  ok("...and nothing else (no permanent Delete for an entry)", menu && menu.querySelectorAll('.desk-menu-item').length === 1);
  clearToasts();
  h.store.pendingOps = [];
  if (item) click(item);
  ok("...which trashes it with one op", h.store.get(h.ids[1]) === null && h.store.pendingOps.length === 1 && h.store.pendingOps[0].field === "trashed");
  ok("...and offers the same Undo", !!toasts().querySelector('.toast-undo'));
  ok("the menu closes behind itself", !document.querySelector('.desk-menu'));
}
{
  // Cards in a CLOSED clip: one object, no per-card trash, no card menu.
  let cid = null;
  const h = deskHarness((store, pid, ids) => {
    cid = store.addClip(pid, { pos: { x: 200, y: 200 }, z: 5 });
    for (const id of ids.slice(0, 2)) store.setDeskField(id, pid, "clip", cid);
  });
  const clipped = h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`);
  ok("a card in a closed clip has no trash button", !!clipped && !clipped.querySelector('.dcard-trash'));
  const ev = Object.assign(new dom.window.Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 300, clientY: 260 });
  clipped.dispatchEvent(ev);
  ok("...and right-clicking it opens no Move to trash", !document.querySelector('.desk-menu'));
  const loose = h.page.querySelector(`.dcard[data-id="${h.ids[2]}"]`);
  ok("a loose card next to it still has one", !!loose.querySelector('.dcard-trash'));
}
{
  // Round 1.1, second pass (Andra's call): a post-it's scribble moves it to
  // the Trash rather than removing it for good.
  let nid = null;
  const h = deskHarness((store, pid) => { nid = store.addNote(pid, { text: "keep me?\nsecond line", pos: { x: 80, y: 80 } }); });
  const note = h.page.querySelector('.dnote');
  note.dispatchEvent(Object.assign(new dom.window.Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 90, clientY: 90 }));
  const btn = document.querySelector('.desk-menu.desk-menu-delete-only .desk-menu-item');
  ok("a post-it's right-click scribble is named Move to trash", btn?.getAttribute('aria-label') === "Move to trash");
  clearToasts();
  h.store.pendingOps = [];
  if (btn) click(btn);
  ok("...one ordinary op: a `set trashed` on that post-it",
     h.store.pendingOps.length === 1 && h.store.pendingOps[0].op === OP.DK &&
     h.store.pendingOps[0].action === "set" && h.store.pendingOps[0].field === "trashed",
     JSON.stringify(h.store.pendingOps));
  ok("...it leaves the desk", deskData(h.store.all(), h.pid).notes.length === 0 && h.store.notes(h.pid).length === 0);
  ok("...but is NOT removed for good", !h.store.deskObjects(h.pid).notes.find(n => n.nid === nid).removed);
  ok("...it is in the trash", h.store.trashedDesk().some(t => t.kind === "note" && t.id === nid));
  const undo = toasts().querySelector('.toast-undo');
  ok("...with an Undo", !!undo && /post-it/.test(toasts().textContent));
  if (undo) click(undo);
  const back = h.store.notes(h.pid).find(n => n.nid === nid);
  ok("Undo puts it back with its words and its spot",
     !!back && back.text === "keep me?\nsecond line" && back.pos.x === 80 && back.pos.y === 80);
}

// ===================================================================
console.log("\n--- D: bulk Move to trash from Select mode ---");
{
  const { store, a, b, c } = world();
  const keep = store.createItem({ title: "Delta (trashed separately)" });
  store.trash(keep);
  const sel = createSelection(store, () => {});
  sel.enter();
  for (const id of [a, b, c]) sel.toggle(id);
  const bar = document.createElement('div');
  sel.renderBar(bar);
  const btn = [...bar.querySelectorAll('button')].find(x => x.textContent === "Move to trash");
  ok("the Select bar has Move to trash", !!btn);
  const empty = createSelection(store, () => {});
  empty.enter();
  const bar0 = document.createElement('div');
  empty.renderBar(bar0);
  ok("...disabled while nothing is picked",
     [...bar0.querySelectorAll('button')].find(x => x.textContent === "Move to trash")?.hasAttribute('disabled'));

  clearToasts();
  store.pendingOps = [];
  click(btn);
  ok("all three are in the trash", [a, b, c].every(id => store.get(id) === null && store.getAny(id)?.trashed));
  ok("...one op per item, every one an ordinary trashed set",
     store.pendingOps.length === 3 && store.pendingOps.every(o => o.op === OP.SET && o.field === "trashed"),
     JSON.stringify(store.pendingOps));
  ok("...with no confirm", !document.querySelector('.modal-scrim'));
  ok("the trashed ones leave the selection", sel.count === 0 && sel.active);
  ok("the message counts them", /Moved 3 to trash/.test(toasts().textContent), toasts().textContent);
  const undo = toasts().querySelector('.toast-undo');
  ok("...and offers Undo", !!undo);
  click(undo);
  ok("Undo brings back exactly that batch", [a, b, c].every(id => !!store.get(id)));
  ok("...and NOT something trashed some other way", store.get(keep) === null);
  ok("the Undo message goes away once used", !toasts().querySelector('.toast-undo'));
}
{
  // An Undo that arrives after Empty trash restores nothing and breaks nothing.
  const { store, a } = world();
  const done = moveToTrash(store, [a], { quiet: true });
  store.emptyTrash();
  ok("Undo after Empty trash is a harmless no-op", undoTrash(store, done) === 0 && store.getAny(a) === null);
}

// ===================================================================
console.log("\n--- a project trashed from a button ---");
{
  const { store, pid, a, b } = world();
  const { ctx, opened } = ctxFor(store);
  const host = document.createElement('div');
  listView.render(query(store, {}), ctx, host);
  const btn = [...host.querySelectorAll('.item-trash')].find(x => x.getAttribute('aria-label') === "Move to trash: Freelance site");
  ok("the project's own List row has the button", !!btn);
  click(btn);
  ok("the project is in the trash", store.get(pid) === null && store.getAny(pid)?.trashed);
  ok("its members are still live", !!store.get(a) && !!store.get(b));
  ok("...and still carry their link to it",
     [a, b].every(id => store.get(id).links.some(l => l.target === pid && l.label === PROJECT_LINK)));
  store.restore(pid);
  ok("restoring the project gives it its members back", deskData(store.all(), pid).members.length === 3);
}

// ===================================================================
console.log("\n--- post-its and desk images in the Trash ---");
const { openTrash, trashCount } = await import('../js/views/trash.js');
const { moveDeskThingToTrash, restoreDeskThing, cleanUpImageFiles, trashedImageHashes } = await import('../js/trash-actions.js');
function deskWorld() {
  const w = world();
  const { store, pid, a } = w;
  w.nid = store.addNote(pid, { text: "Call the printer", pos: { x: 40, y: 50 } });
  w.cid = store.addClip(pid);
  store.placeOnDesk(a, pid, { x: 300, y: 300 }, 2);
  store.setDeskField(a, pid, "clip", w.cid);
  w.clippedNid = store.addNote(pid, { text: "on the clip", clip: w.cid, offset: { dx: 10, dy: 20 } });
  // A desk image record, written the way js/desk-images-runtime.js writes it.
  w.key = `deskimg:${pid}:IMG1`;
  store._applyOp({ op: OP.VS, itemId: pid, key: w.key, action: "add",
    value: { pos: { x: 500, y: 90 }, z: 4, clip: { hash: "HASHA", ext: "png", mime: "image/png", size: { w: 200, h: 100 } } },
    ts: { wall: Date.now(), counter: 0, device: "t" } }, true);
  return w;
}
{
  const w = deskWorld();
  const { store, pid, nid, key } = w;
  store.pendingOps = [];
  moveDeskThingToTrash(store, { kind: "image", projectId: pid, id: key }, { quiet: true });
  ok("trashing a desk image is one ordinary `set trashed` op",
     store.pendingOps.length === 1 && store.pendingOps[0].op === OP.VS && store.pendingOps[0].field === "trashed",
     JSON.stringify(store.pendingOps));
  ok("...the image record keeps everything else", store.getAny(pid).viewState[key].pos.x === 500 && !store.getAny(pid).viewState[key].removed);
  ok("...and its file is still counted as in use", trashedImageHashes(store).join() === "HASHA");
  moveDeskThingToTrash(store, { kind: "note", projectId: pid, id: nid }, { quiet: true });
  moveDeskThingToTrash(store, { kind: "note", projectId: pid, id: w.clippedNid }, { quiet: true });
  ok("the trash count includes post-its and images", trashCount(store) === 3, String(trashCount(store)));

  // The drawer lists them, by kind, with the desk they came from.
  const t = openTrash(store);
  const rows = [...t.el.querySelectorAll('.trash-row')];
  const textOf = (r) => r.textContent;
  ok("the Trash drawer lists the post-it by its words", rows.some(r => /Post-it/.test(textOf(r)) && /Call the printer/.test(textOf(r)) && /Freelance site desk/.test(textOf(r))));
  ok("...and the image", rows.some(r => /Image/.test(textOf(r)) && /Reference image/.test(textOf(r))));
  const restoreImg = rows.find(r => /Reference image/.test(textOf(r)))?.querySelector('.trash-restore');
  click(restoreImg);
  ok("Restore puts the image back on its desk", !store.getAny(pid).viewState[key].trashed && store.trashedDesk().every(x => x.kind !== "image"));
  const clippedRow = [...t.el.querySelectorAll('.trash-row')].find(r => /on the clip/.test(r.textContent));
  click(clippedRow.querySelector('.trash-restore'));
  const cn = store.notes(pid).find(n => n.nid === w.clippedNid);
  ok("a post-it that was on a clip comes back still on that clip", cn && cn.clip === w.cid && cn.offset.dx === 10);
  t.close();
}
{
  // Empty trash takes post-its and images with everything else, for good.
  const w = deskWorld();
  const { store, pid, nid, key, b } = w;
  // Another entry uses the SAME file as an attachment: that file must survive.
  store.addToSet(b, "attachments", { hash: "HASHB", name: "shared.png", role: "image" });
  store._applyOp({ op: OP.VS, itemId: pid, key: `deskimg:${pid}:IMG2`, action: "add",
    value: { pos: { x: 10, y: 10 }, z: 5, clip: { hash: "HASHB", ext: "png", mime: "image/png", size: { w: 10, h: 10 } } },
    ts: { wall: Date.now(), counter: 1, device: "t" } }, true);
  moveDeskThingToTrash(store, { kind: "image", projectId: pid, id: key }, { quiet: true });
  moveDeskThingToTrash(store, { kind: "image", projectId: pid, id: `deskimg:${pid}:IMG2` }, { quiet: true });
  moveDeskThingToTrash(store, { kind: "note", projectId: pid, id: nid }, { quiet: true });
  moveToTrash(store, [w.c], { quiet: true });
  const files = trashedImageHashes(store);
  const gone = store.emptyTrash();
  ok("Empty trash counts the post-it and images too", gone === 4, String(gone));
  ok("the post-it is now removed for good", !!store.deskObjects(pid).notes.find(n => n.nid === nid).removed);
  ok("...and the image record", !!store.getAny(pid).viewState[key].removed);
  ok("the trash is empty", trashCount(store) === 0 && store.trashedDesk().length === 0);
  const erased = [];
  await cleanUpImageFiles(store, files, async (h) => { erased.push(h); });
  ok("the image file nothing else uses is erased", erased.includes("HASHA"));
  ok("...but one an entry still uses is kept", !erased.includes("HASHB"));
  ok("an Undo after Empty trash does nothing", restoreDeskThing(store, { kind: "note", projectId: pid, id: nid }) === false);
}
{
  // A project in the trash with its own trashed post-it: emptying takes both.
  const w = deskWorld();
  const { store, pid, nid } = w;
  moveDeskThingToTrash(store, { kind: "note", projectId: pid, id: nid }, { quiet: true });
  moveToTrash(store, [pid], { quiet: true });
  const t = openTrash(store);
  ok("a post-it from a trashed project says so", /project in trash/.test(t.el.textContent));
  t.close();
  store.emptyTrash();
  ok("emptying takes the project and its trashed post-it", store.getAny(pid) === null && store.trashedDesk().length === 0);
}
{
  // Two devices: a post-it trashed on the Mac is trashed on the iPad, and back.
  const w = deskWorld();
  const mac = w.store;
  const ipad = new Store();
  ipad.replayLog(mac.drainPendingAsLines().map(l => JSON.parse(l)));
  moveDeskThingToTrash(mac, { kind: "note", projectId: w.pid, id: w.nid }, { quiet: true });
  ipad.replayLog(mac.drainPendingAsLines().map(l => JSON.parse(l)));
  ok("a post-it trashed on one device is trashed on the other", ipad.trashedDesk().some(t => t.id === w.nid) && !ipad.notes(w.pid).some(n => n.nid === w.nid));
  ipad.restoreNote(w.pid, w.nid);
  mac.replayLog(ipad.drainPendingAsLines().map(l => JSON.parse(l)));
  ok("...and restored on both", mac.notes(w.pid).some(n => n.nid === w.nid));
}
{
  // A BLANK post-it you click away from is still discarded, not trashed:
  // there's nothing in it to get back, and it mustn't clutter the Trash.
  let nid = null;
  const h = deskHarness((store, pid) => { nid = store.addNote(pid, { text: "", pos: { x: 80, y: 80 } }); });
  const ta = h.page.querySelector('.dnote textarea');
  ta.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok("a blank post-it is discarded, not put in the Trash",
     h.store.trashedDesk().length === 0 && !!h.store.deskObjects(h.pid).notes.find(n => n.nid === nid)?.removed);
}

// ===================================================================
console.log("\n--- the audit: Empty trash is the only permanent delete ---");
{
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  };
  walk(new URL('../js', import.meta.url).pathname);
  const offenders = [];
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (!/deleteItem\s*\(|OP\.DELETE|op:\s*["']delete["']/.test(code)) return;
      const where = `${f.split('/js/')[1]}:${i + 1}`;
      const allowed =
        // the method's own definition, and its single op inside it
        (f.endsWith('/store.js') && /^\s*deleteItem\s*\(id\)\s*\{/.test(code)) ||
        (f.endsWith('/store.js') && /_applyOp\(\{\s*op:\s*OP\.DELETE,\s*itemId:\s*id/.test(code)) ||
        // the op table and merge code that APPLIES a received delete
        (f.endsWith('/store.js') && /DELETE:\s*"delete"|case OP\.DELETE|op\.op === OP\.DELETE|=== OP\.DELETE/.test(code)) ||
        // Empty trash, the ONE caller
        (f.endsWith('/store.js') && /for \(const id of ids\) this\.deleteItem\(id\);/.test(code));
      if (!allowed) offenders.push(`${where}  ${line.trim()}`);
    });
  }
  ok("nothing outside Empty trash calls deleteItem() or writes a delete op", offenders.length === 0, offenders.join("\n      "));

  const store = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  const callers = (store.match(/this\.deleteItem\(/g) || []).length;
  const emptyBody = store.slice(store.indexOf("  emptyTrash() {"), store.indexOf("\n  }\n", store.indexOf("  emptyTrash() {")));
  ok("inside the store, deleteItem() has exactly one caller: emptyTrash()",
     callers === 1 && /this\.deleteItem\(id\)/.test(emptyBody));

  // Post-its: the permanent removeNote() is only for Empty trash and for a
  // BLANK post-it (desk.js's commit-when-emptied and discard-if-blank).
  const noteRemovers = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/removeNote\(/.test(line.replace(/\/\/.*$/, ''))) noteRemovers.push(`${f.split('/js/')[1]}:${i + 1}`);
    });
  }
  const desk = readFileSync(new URL('../js/views/desk.js', import.meta.url), 'utf8');
  const deskRemoves = (desk.match(/removeNote\(/g) || []).length;
  ok("a post-it is only removed for good by Empty trash or when it is blank",
     noteRemovers.every(w => w.startsWith('store.js') || w.startsWith('views/desk.js')) && deskRemoves === 2 &&
     /discardIfBlank[\s\S]{0,200}removeNote/.test(desk) && /v\.trim\(\) === ""[\s\S]{0,160}removeNote/.test(desk),
     noteRemovers.join(", "));
  // Desk images: the right-click no longer removes the record or the file.
  const runtime = readFileSync(new URL('../js/desk-images-runtime.js', import.meta.url), 'utf8');
  const removeOps = (runtime.match(/action: "remove"/g) || []).length;
  ok("a desk image is only removed for good by Empty trash (or a save that failed)",
     removeOps === 1 && /persistLocalSnapshot[\s\S]{0,400}action: "remove"/.test(runtime) && !/function removeImage/.test(runtime));

  const trashView = readFileSync(new URL('../js/views/trash.js', import.meta.url), 'utf8');
  ok("and emptyTrash() is only called from the Trash drawer",
     files.filter(f => /emptyTrash\(\)/.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')))
          .map(f => f.split('/js/')[1]).sort().join() === ["store.js", "views/trash.js"].join()
     && /store\.emptyTrash\(\)/.test(trashView));
}

console.log(`\n${fail ? `${fail} of ${n} trash-everywhere checks FAILED` : `all ${n} trash-everywhere checks passed`}`);
process.exit(fail ? 1 : 0);
