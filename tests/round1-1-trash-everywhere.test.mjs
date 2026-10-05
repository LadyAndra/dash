// Round 1.1 (October 2026): TRASH EVERYWHERE.
//
//   node tests/round1-1-trash-everywhere.test.mjs      (needs jsdom)
//
// What has to be true, and why each matters:
//   - B: the retired per-item button (trashButton, opts.trash) still works as a
//     helper, and a row that doesn't ask for it gets none. Nothing asks for it.
//   - B2 (Round 1.3, Andra: the repeated scribble was noise): List rows (search
//     included) and Board cards draw NO button. A right-click (or the Menu key)
//     shows the delete scribble; clicking it trashes through the same single
//     op and the same Undo. It does nothing special in Select mode.
//   - B3 (Round 1.4: "across the entire system"): the same on Home (Unfiled box
//     and due panel) and on the desk's drawer rows; a milestone row gets nothing
//     (a milestone is not an item); and a scan fails the build if any view asks
//     for the old button again.
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

// ---- Round 1.3: the quiet version. No button; right-click offers the same op. ----
const tick = () => new Promise(r => setTimeout(r, 5));
const rowMenuEl = () => document.querySelector('.row-menu');
function contextAt(node, x = 300, y = 260) {
  const ev = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
  node.dispatchEvent(ev);
  return ev;
}
const pressEscape = () =>
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

// Round 1.4 (Andra: "right click and then you should see the scribble icon
// appear, and that's what you click"): the thing that appears is the scribble
// itself, the desk's icon-only delete slip, and it is the only way, on EVERY
// surface. `find` lets a surface whose rows have no data-id (Home's Today
// rows) say how to find the one it means.
async function checkRightClick(surface, store, container, id, opened, find) {
  const title = store.get(id).title;
  const node = find ? find(container)
                    : container.querySelector(`.item-row[data-id="${id}"], .card[data-id="${id}"]`);
  ok(`${surface}: finds the row/card for "${title}"`, !!node);
  if (!node) return;
  ok(`${surface}: draws no trash button anywhere`, container.querySelectorAll('.item-trash').length === 0);
  ok(`${surface}: ...and leaves no has-trash layout hook`, container.querySelectorAll('.has-trash').length === 0);

  const ev = contextAt(node);
  ok(`${surface}: right-click is taken over (browser menu suppressed)`, ev.defaultPrevented);
  const menu = rowMenuEl();
  const items = menu ? [...menu.querySelectorAll('.desk-menu-item')] : [];
  ok(`${surface}: right-click shows the delete scribble, and only that`,
     !!menu && menu.classList.contains('desk-menu-delete-only') && items.length === 1 && items[0].classList.contains('desk-menu-delete'));
  ok(`${surface}: ...an icon with no words on it, like the desk's post-it scribble`, items.length === 1 && items[0].textContent === "");
  ok(`${surface}: ...named for the entry, for a screen reader`, items[0] && items[0].getAttribute('aria-label') === `Move to trash: ${title}`);
  ok(`${surface}: ...a real menu item, parked on the page body, in the desk's menu style`,
     !!menu && menu.parentNode === document.body && menu.classList.contains('desk-menu') && menu.getAttribute('role') === 'menu' && items[0].getAttribute('role') === 'menuitem');
  ok(`${surface}: ...placed at the pointer`, !!menu && menu.style.left === "300px" && menu.style.top === "260px", menu && menu.style.cssText);
  ok(`${surface}: ...keyboard focus lands on the choice`, !!items[0] && document.activeElement === items[0]);

  clearToasts();
  store.pendingOps = [];
  if (items[0]) click(items[0]);
  ok(`${surface}: choosing it trashes the entry`, store.get(id) === null && !!store.getAny(id)?.trashed);
  ok(`${surface}: ...with exactly one ordinary set op`,
     store.pendingOps.length === 1 && store.pendingOps[0].op === OP.SET && store.pendingOps[0].field === "trashed",
     JSON.stringify(store.pendingOps));
  ok(`${surface}: ...without opening the entry`, !opened.includes(id));
  ok(`${surface}: ...with no confirm`, !document.querySelector('.modal-scrim'));
  ok(`${surface}: ...and the menu closes`, !rowMenuEl());
  const undo = toasts().querySelector('.toast-undo');
  ok(`${surface}: the same message with Undo appears`, !!undo && /Moved to trash/.test(toasts().textContent));
  if (undo) click(undo);
  ok(`${surface}: Undo puts it back`, !!store.get(id));
}

async function checkMenuBehaviour(surface, store, container, idA, idB) {
  const nodeA = container.querySelector(`.item-row[data-id="${idA}"], .card[data-id="${idA}"]`);
  const nodeB = container.querySelector(`.item-row[data-id="${idB}"], .card[data-id="${idB}"]`);

  contextAt(nodeA);
  pressEscape();
  ok(`${surface}: Escape closes the menu and trashes nothing`, !rowMenuEl() && !!store.get(idA));

  contextAt(nodeA);
  await tick();
  document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  ok(`${surface}: pressing anywhere else closes it and trashes nothing`, !rowMenuEl() && !!store.get(idA));

  contextAt(nodeA);
  contextAt(nodeB, 100, 120);
  ok(`${surface}: only one menu exists at a time`, document.querySelectorAll('.row-menu').length === 1);
  const stillA = store.get(idA), stillB = store.get(idB);
  ok(`${surface}: ...and merely opening menus trashes nothing`, !!stillA && !!stillB);
  pressEscape();

  // The keyboard's Menu key reports 0,0: the menu must still open, at the row.
  const kev = contextAt(nodeA, 0, 0);
  const km = rowMenuEl();
  ok(`${surface}: the Menu key opens it too`, kev.defaultPrevented && !!km);
  ok(`${surface}: ...at the row, not stuck in the page corner`, !!km && km.style.left !== "0px" && km.style.top !== "0px", km && km.style.cssText);
  pressEscape();
  ok(`${surface}: left no menu behind`, !rowMenuEl());
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

  // The quiet option (Round 1.3): opt-in, so read-only indexes stay read-only.
  const quietRow = itemRow(store, store.get(a), (id) => opened.push(id), { rightClickTrash: true });
  const quietCard = itemCard(store, store.get(a), (id) => opened.push(id), { rightClickTrash: true });
  ok("rightClickTrash draws no button on a row or a card", !quietRow.querySelector('.item-trash') && !quietCard.querySelector('.item-trash'));
  const plainRow = itemRow(store, store.get(a), () => {}, {});
  const plainCard = itemCard(store, store.get(a), () => {}, {});
  ok("a row that didn't ask for it has no right-click menu either", !contextAt(plainRow).defaultPrevented && !rowMenuEl());
  ok("...nor does a card", !contextAt(plainCard).defaultPrevented && !rowMenuEl());
  opened.length = 0;
  click(quietRow);
  quietCard.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok("a left-click and Enter still just open the entry", opened.length === 2 && opened.every(id => id === a) && !!store.get(a));
  ok("...and a right-click never opens it", (opened.length = 0, contextAt(quietRow), opened.length === 0));
  pressEscape();
}

// ===================================================================
console.log("\n--- B2: List and Board draw no button; right-click trashes ---");
for (const [name, view] of [["List", listView], ["Board", boardView]]) {
  const { store, a, b } = world();
  const { ctx, opened } = ctxFor(store);
  const host = document.createElement('div');
  document.body.appendChild(host);
  view.render(query(store, {}), ctx, host);
  await checkRightClick(name, store, host, b, opened);
  await checkMenuBehaviour(name, store, host, a, b);
  host.remove();
}
{
  // Search is the List with a text filter, so it gets the List's rows.
  const { store, b } = world();
  const { ctx, opened } = ctxFor(store);
  const host = document.createElement('div');
  document.body.appendChild(host);
  listView.render(query(store, { filter: { text: "beta" } }), ctx, host);
  await checkRightClick("a List search", store, host, b, opened);
  host.remove();
}
{
  // Select mode: a tap means "pick this", and a right-click must not throw
  // anything away either. Asked at the moment of the click, so it also holds
  // when Select mode is switched on AFTER the row was drawn.
  for (const [name, view] of [["List", listView], ["Board", boardView]]) {
    const { store, a } = world();
    const sel = createSelection(store, () => {});
    const { ctx } = ctxFor(store, sel);
    const host = document.createElement('div');
    document.body.appendChild(host);
    view.render(query(store, {}), ctx, host);          // drawn BEFORE Select mode
    const node = host.querySelector(`.item-row[data-id="${a}"], .card[data-id="${a}"]`);
    sel.enter();
    const ev = contextAt(node);
    ok(`${name}: in Select mode a right-click offers nothing`, !rowMenuEl() && !ev.defaultPrevented);
    ok(`${name}: ...and trashes nothing`, !!store.get(a));
    sel.exit();
    const ev2 = contextAt(node);
    ok(`${name}: leaving Select mode brings the menu back`, !!rowMenuEl() && ev2.defaultPrevented);
    pressEscape();
    host.remove();
  }
}

// Round 1.4: Home too. Its Unfiled box and its due panel used to keep a visible
// button; now they are right-click like everything else.
console.log("\n--- B3: Home draws no button either; right-click shows the scribble ---");
{
  const { store, a, b } = world();
  store.setField(a, "inbox", true);                    // a phone capture, waiting
  store.setField(b, "due", plusDays(1));               // due tomorrow
  const { ctx, opened } = ctxFor(store);
  const host = document.createElement('div');
  document.body.appendChild(host);
  homeView.render(query(store, {}), ctx, host);
  ok("Home draws no trash button anywhere", host.querySelectorAll('.item-trash').length === 0);
  await checkRightClick("Home's Unfiled box", store, host.querySelector('.unfiled-list') || host, a, opened);
  host.replaceChildren();
  homeView.render(query(store, {}), ctxFor(store).ctx, host);
  await checkRightClick("Home's due panel", store, host, b, opened,
    (c) => [...c.querySelectorAll('.today-row')].find(r => /Beta task/.test(r.textContent)));
  host.remove();
}
{
  // A milestone row on Home gets no scribble: a milestone isn't an item.
  const store = new Store();
  const pid = store.createItem({ title: "P", type: "project" });
  const mid = store.addMilestone(pid, { label: "Launch" });
  store.setMilestoneField(pid, mid, "date", plusDays(1));
  const host = document.createElement('div');
  document.body.appendChild(host);
  homeView.render(query(store, {}), ctxFor(store).ctx, host);
  const msRow = [...host.querySelectorAll('.today-row')].find(r => /Launch/.test(r.textContent));
  ok("Home: a milestone row has no trash button", !!msRow && !msRow.querySelector('.item-trash'));
  const ev = msRow ? contextAt(msRow) : { defaultPrevented: true };
  ok("...and a right-click on it offers nothing (a milestone is not an item)", !ev.defaultPrevented && !rowMenuEl());
  host.remove();
}
{
  // THE GUARD (Round 1.4): nothing draws the per-item button any more. The
  // helper and the opt-in stay in the code, retired, but no view may ask for
  // them, so "right-click, then the scribble" cannot quietly stop being the
  // one way. A new view that wants a trash button has to change this test.
  const asked = [];
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { scan(full); continue; }
      if (!name.endsWith('.js')) continue;
      if (full.endsWith('views/shared.js') || full.endsWith('js/trash-actions.js')) continue;   // where they are DEFINED
      const src = readFileSync(full, 'utf8');
      if (/\btrashButton\s*\(/.test(src) || /\btrash\s*:\s*true\b/.test(src)) asked.push(full);
    }
  };
  scan(new URL('../js', import.meta.url).pathname);
  ok("no view draws a per-item trash button (right-click is the only way)", asked.length === 0, asked.join(", "));
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
  // October 2026 (Andra): NO trash scribble anywhere on the desk page — not
  // on its cards and not in its drawers. Right-click is how a card goes.
  const h = deskHarness();
  ok("desk cards carry no trash button", h.page.querySelectorAll('.dcard .item-trash').length === 0);
  const filed = [...h.page.querySelectorAll('.desk-handle')].find(b => b.dataset.shelf === "filed");
  click(filed);
  ok("...and neither do the desk's drawer rows",
     h.page.querySelectorAll('.desk-drawer .item-row').length > 0 && h.page.querySelectorAll('.desk-drawer .item-trash').length === 0);
  // Round 1.4: but a drawer row takes the same right-click scribble.
  const row = h.page.querySelector('.desk-drawer .item-row[data-id]');
  const ev = contextAt(row);
  const scribble = rowMenuEl() && rowMenuEl().querySelector('.desk-menu-delete');
  ok("...a desk drawer row right-clicks to the scribble too", ev.defaultPrevented && !!scribble);
  clearToasts();
  const rid = row.dataset.id;
  if (scribble) click(scribble);
  ok("...and clicking it trashes that entry", h.store.get(rid) === null && !!h.store.getAny(rid)?.trashed);
  h.page.remove();
}
{
  const h = deskHarness();
  const card = h.page.querySelector(`.dcard[data-id="${h.ids[1]}"]`);
  card.dispatchEvent(Object.assign(new dom.window.Event('contextmenu', { bubbles: true, cancelable: true }),
                                   { clientX: 300, clientY: 260 }));
  const menu = document.querySelector('.desk-menu');
  const item = menu && [...menu.querySelectorAll('.desk-menu-item')].find(b => b.getAttribute('aria-label') === "Move to trash");
  ok("C: right-clicking a desk card offers Move to trash", !!item);
  ok("...as the delete scribble, the same as everywhere else (Round 1.4)",
     !!item && menu.classList.contains('desk-menu-delete-only') && item.classList.contains('desk-menu-delete') && item.textContent === "");
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
  ok("a card in a closed clip is there to right-click", !!clipped);
  const ev = Object.assign(new dom.window.Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 300, clientY: 260 });
  clipped.dispatchEvent(ev);
  ok("...and right-clicking it opens no Move to trash", !document.querySelector('.desk-menu'));
  const loose = h.page.querySelector(`.dcard[data-id="${h.ids[2]}"]`);
  loose.dispatchEvent(Object.assign(new dom.window.Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 300, clientY: 260 }));
  ok("a loose card next to it still offers Move to trash on right-click",
     [...document.querySelectorAll('.desk-menu-item')].some(b => b.getAttribute('aria-label') === "Move to trash"));
  document.querySelector('.desk-menu')?.remove();
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
console.log("\n--- a project trashed from a right-click ---");
{
  const { store, pid, a, b } = world();
  const { ctx, opened } = ctxFor(store);
  const host = document.createElement('div');
  document.body.appendChild(host);
  listView.render(query(store, {}), ctx, host);
  const projRow = host.querySelector(`.item-row[data-id="${pid}"]`);
  ok("the project's own List row is there", !!projRow);
  contextAt(projRow);
  const choice = rowMenuEl() && rowMenuEl().querySelector('.desk-menu-item');
  ok("...and a right-click on it offers Move to trash", !!choice && choice.getAttribute('aria-label') === "Move to trash: Freelance site");
  click(choice);
  host.remove();
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
