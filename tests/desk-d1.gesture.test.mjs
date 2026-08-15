// Steps 3 and 4 of the post-deploy pass: renders are held for the life of a
// gesture, and the double-click memory survives a rebuild.
//
//   node tests/desk-d1.gesture.test.mjs      (needs jsdom: npm install jsdom)
//
// These two are testable in jsdom precisely because neither is about geometry:
// one is "did a render happen while the pointer was down", the other is "did a
// value survive being rebuilt". Both are structural facts.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: 'https://x.test/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement',
                 'MutationObserver','requestAnimationFrame','getComputedStyle','Event'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine'), addEventListener(){}, removeEventListener(){} });
Object.defineProperty(dom.window, 'innerWidth', { get: () => 1440, configurable: true });

const { Store, PROJECT_LINK } = await import('../js/store.js');
const { renderProjectPage } = await import('../js/views/desk.js');
const D = await import('../js/desk.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A stand-in for app.js's render pipeline, with the same hold semantics.
function makeHost() {
  let holds = 0, missed = false, renders = 0;
  const scheduleRender = () => {
    if (holds > 0) { missed = true; return; }
    renders++;
  };
  const holdRenders = () => {
    holds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds = Math.max(0, holds - 1);
      if (holds === 0 && missed) { missed = false; scheduleRender(); }
    };
  };
  return { holdRenders, scheduleRender, get renders() { return renders; }, get holds() { return holds; } };
}

function build(host) {
  const store = new Store();
  const pid = store.createItem({ title: "Dash", type: "project" });
  const ids = ["a", "b"].map(t => store.createItem({ title: t }));
  for (const id of ids) store.assignToProject(id, pid);
  store.placeOnDesk(ids[0], pid, { x: 300, y: 200 }, 1);
  store.placeOnDesk(ids[1], pid, { x: 900, y: 600 }, 2);

  const viewLocal = {};
  const ctx = {
    store, viewLocal, selection: { active: false }, onOpen(){}, sync: null,
    holdRenders: host.holdRenders,
    rerender: host.scheduleRender,
  };
  // every store change schedules a render, exactly as app.js subscribes
  store.subscribe(host.scheduleRender);
  const page = renderProjectPage(store, store.get(pid), ctx, { onBack(){}, onEdit(){}, onNew(){}, onAdd(){} });
  document.getElementById('host').appendChild(page);
  return { store, pid, ids, ctx, page, viewLocal };
}

const pointer = (type, x, y) => {
  const e = new dom.window.Event(type, { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y, button: 0, pointerId: 1 });
  return e;
};

// ===================================================================
console.log("\n--- 3. nothing redraws while the pointer is down ---");
{
  const host = makeHost();
  const { store, pid, ids, page } = build(host);
  const deskEl = page.querySelector('.desk-surface');
  deskEl.setPointerCapture = () => {};
  const cardNode = page.querySelector(`.dcard[data-id="${ids[1]}"]`);
  Object.defineProperty(cardNode, 'offsetWidth', { get: () => 300, configurable: true });
  Object.defineProperty(cardNode, 'offsetHeight', { get: () => 160, configurable: true });

  const before = host.renders;
  cardNode.dispatchEvent(pointer('pointerdown', 500, 400));
  ok("a gesture takes a hold", host.holds === 1, `holds=${host.holds}`);

  // the world carries on: a sync pull lands, an editor keystroke fires
  store.setField(ids[0], "title", "changed while dragging");
  store.setField(ids[0], "body", "and again");
  await sleep(20);
  ok("...and a store change during the drag redraws NOTHING",
     host.renders === before, `${host.renders - before} render(s) slipped through`);

  deskEl.dispatchEvent(pointer('pointermove', 560, 450));
  ok("the card is still the one the pointer grabbed", cardNode.isConnected);
  ok("...and it moved locally, without a write",
     cardNode.style.getPropertyValue('--dx') === "60px", cardNode.style.getPropertyValue('--dx'));

  deskEl.dispatchEvent(pointer('pointerup', 560, 450));
  ok("the hold is released on drop", host.holds === 0);
  const rec = store.deskRecord(ids[1], pid);
  ok("the drop committed the new position", rec.pos.x === 960 && rec.pos.y === 650, JSON.stringify(rec.pos));
  await sleep(20);
  ok("...and the deferred redraw ran once the pointer let go", host.renders > before);
}

console.log("\n--- ...and a hold is never leaked ---");
{
  const host = makeHost();
  const { page } = build(host);
  const deskEl = page.querySelector('.desk-surface');
  deskEl.setPointerCapture = () => {};
  deskEl.dispatchEvent(pointer('pointerdown', 100, 100));      // pan on empty desk
  ok("panning takes a hold too", host.holds === 1);
  deskEl.dispatchEvent(pointer('pointercancel', 100, 100));    // the OS steals the pointer
  ok("a cancelled pointer releases it", host.holds === 0);

  deskEl.dispatchEvent(pointer('pointerdown', 100, 100));
  dom.window.dispatchEvent(new dom.window.Event('blur'));      // window loses focus mid-drag
  ok("a blurred window releases it", host.holds === 0);

  deskEl.dispatchEvent(pointer('pointerdown', 100, 100));
  deskEl.dispatchEvent(pointer('pointerdown', 100, 100));      // a second down without an up
  ok("a doubled pointerdown doesn't stack holds", host.holds === 1, `holds=${host.holds}`);
  deskEl.dispatchEvent(pointer('pointerup', 100, 100));
  ok("...and one up clears it", host.holds === 0);
}

// ===================================================================
console.log("\n--- 4. double-click survives the rebuild the first click causes ---");
{
  const host = makeHost();
  const { store, pid, ids, ctx, page, viewLocal } = build(host);
  const deskEl = page.querySelector('.desk-surface');
  deskEl.setPointerCapture = () => {};

  // the LOWER card: clicking it raises it, which is a write, which rebuilds
  const lower = page.querySelector(`.dcard[data-id="${ids[0]}"]`);
  lower.dispatchEvent(pointer('pointerdown', 320, 220));
  deskEl.dispatchEvent(pointer('pointerup', 320, 220));
  ok("the first click on a lower card commits a raise", store.deskRecord(ids[0], pid).z > 2);
  ok("...and the tap is remembered outside the closure", viewLocal.desk.lastTapId === ids[0]);

  // that write rebuilds the desk — the old closure and its locals are gone
  const page2 = renderProjectPage(store, store.get(pid), ctx, { onBack(){}, onEdit(){}, onNew(){}, onAdd(){} });
  document.getElementById('host').innerHTML = "";
  document.getElementById('host').appendChild(page2);
  const desk2 = page2.querySelector('.desk-surface');
  desk2.setPointerCapture = () => {};
  const lower2 = page2.querySelector(`.dcard[data-id="${ids[0]}"]`);

  lower2.dispatchEvent(pointer('pointerdown', 320, 220));
  desk2.dispatchEvent(pointer('pointerup', 320, 220));
  ok("the second click on the REBUILT desk still counts as a double-click",
     viewLocal.desk.expanded === ids[0], `expanded=${viewLocal.desk.expanded}`);

  // and a slow second click is not a double-click
  viewLocal.desk.expanded = null;
  viewLocal.desk.lastTapAt = Date.now() - 5000;
  lower2.dispatchEvent(pointer('pointerdown', 320, 220));
  desk2.dispatchEvent(pointer('pointerup', 320, 220));
  ok("a click five seconds later is just a click", viewLocal.desk.expanded === null);
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
