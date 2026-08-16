// Phase D2 rendering and gestures, under jsdom.
//
//   node tests/desk-d2.render.test.mjs      (needs jsdom: npm install jsdom)
//
// The standing rule on this desk is that jsdom has no layout and must never be
// trusted with anything geometric — so nothing here asserts where a pixel
// landed. What it does assert is STRUCTURAL: that a gesture wrote the ops it
// claims to write, that a mode really does pause the gestures it says it
// pauses, and that nothing writes to the store between pointerdown and
// pointerup. Those are the things that have actually broken before.
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
Object.defineProperty(dom.window, 'innerHeight', { get: () => 900, configurable: true });

const { Store, PROJECT_LINK } = await import('../js/store.js');
const { renderProjectPage } = await import('../js/views/desk.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeHost() {
  let holds = 0, missed = false, renders = 0;
  const scheduleRender = () => { if (holds > 0) { missed = true; return; } renders++; };
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

// A whole app-ish harness: build() draws the page, and redraw() rebuilds it the
// way app.js does after a store write, so a second gesture runs against fresh
// elements rather than stale ones.
function harness(seed) {
  const host = makeHost();
  const store = new Store();
  const pid = store.createItem({ title: "Dash", type: "project" });
  const ids = ["a", "b", "c"].map(t => store.createItem({ title: t }));
  for (const id of ids) store.assignToProject(id, pid);
  ids.forEach((id, i) => store.placeOnDesk(id, pid, { x: 200 + i * 300, y: 200 + i * 150 }, i + 1));
  if (seed) seed(store, pid, ids);

  const viewLocal = {};
  const ctx = {
    store, viewLocal, selection: { active: false }, onOpen(){}, sync: null,
    holdRenders: host.holdRenders, rerender: host.scheduleRender,
  };
  const actions = { onBack(){}, onEdit(){}, onNew(){}, onAdd(){} };
  let page = null;
  const redraw = () => {
    document.getElementById('host').innerHTML = "";
    page = renderProjectPage(store, store.get(pid), ctx, actions);
    document.getElementById('host').appendChild(page);
    const deskEl = page.querySelector('.desk-surface');
    if (deskEl) deskEl.setPointerCapture = () => {};
    // jsdom has no layout: give every card a plausible box so drops can clamp
    for (const c of page.querySelectorAll('.dcard, .dnote, .dclip-mark')) {
      Object.defineProperty(c, 'offsetWidth', { get: () => 300, configurable: true });
      Object.defineProperty(c, 'offsetHeight', { get: () => 160, configurable: true });
    }
    return page;
  };
  redraw();
  return { store, pid, ids, ctx, viewLocal, host, redraw, get page() { return page; } };
}

const pointer = (type, x, y, extra = {}) => {
  const e = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, button: 0, pointerId: 1 }, extra);
  return e;
};
const click = (h, node, x, y) => {
  node.dispatchEvent(pointer('pointerdown', x, y));
  h.page.querySelector('.desk-surface').dispatchEvent(pointer('pointerup', x, y));
};

// ===================================================================
console.log("\n--- the clip button, and select-to-clip ---");
{
  const h = harness();
  const btn = h.page.querySelector('.banner-clip');
  ok("the banner carries a clip button", !!btn);
  ok("...drawn as inline SVG, so it inherits the banner's ink", !!btn.querySelector('svg'));
  ok("...and it starts un-pressed", btn.getAttribute('aria-pressed') === "false");

  btn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok("pressing it turns the mode on", h.viewLocal.desk.clipping !== null);
  h.redraw();
  ok("...and the button says so", h.page.querySelector('.banner-clip').getAttribute('aria-pressed') === "true");
  ok("...with a line on screen telling you what to do", !!h.page.querySelector('.desk-clip-hint'));

  // clicking two cards picks them, and writes nothing
  const before = h.store.pendingOps.length;
  const a = h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`);
  const b = h.page.querySelector(`.dcard[data-id="${h.ids[1]}"]`);
  a.dispatchEvent(pointer('pointerdown', 250, 250));
  b.dispatchEvent(pointer('pointerdown', 550, 400));
  ok("two cards are picked", h.viewLocal.desk.clipping.picked.length === 2);
  ok("...and nothing at all has been written yet", h.store.pendingOps.length === before);
  ok("...they are marked on screen", h.page.querySelectorAll('.dcard.is-clip-picked').length === 2);

  // clicking one again un-picks it
  a.dispatchEvent(pointer('pointerdown', 250, 250));
  ok("clicking a picked card takes it back off", h.viewLocal.desk.clipping.picked.length === 1);
  a.dispatchEvent(pointer('pointerdown', 250, 250));

  h.page.querySelector('.banner-clip').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok("pressing the button again leaves the mode", h.viewLocal.desk.clipping === null);
  const clips = h.store.clips(h.pid);
  ok("...and commits ONE clip", clips.length === 1);
  ok("...with both cards in it",
     h.store.deskRecord(h.ids[0], h.pid).clip === clips[0].cid &&
     h.store.deskRecord(h.ids[1], h.pid).clip === clips[0].cid);
  ok("...and the third card untouched", h.store.deskRecord(h.ids[2], h.pid).clip == null);
}

console.log("\n--- one card is not a clip, and neither is none ---");
{
  const h = harness();
  h.page.querySelector('.banner-clip').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  h.redraw();
  h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`).dispatchEvent(pointer('pointerdown', 250, 250));
  h.page.querySelector('.banner-clip').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok("committing one card writes no clip", h.store.clips(h.pid).length === 0);
  ok("...and no membership either", h.store.deskRecord(h.ids[0], h.pid).clip == null);

  h.page.querySelector('.banner-clip').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  h.redraw();
  const before = h.store.pendingOps.length;
  h.page.querySelector('.banner-clip').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok("committing nothing writes nothing", h.store.pendingOps.length === before);
}

console.log("\n--- while picking, cards do not drag, open, or raise ---");
{
  const h = harness();
  h.page.querySelector('.banner-clip').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  h.redraw();
  const deskEl = h.page.querySelector('.desk-surface');
  const card = h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`);
  const posBefore = JSON.stringify(h.store.deskRecord(h.ids[0], h.pid).pos);
  const zBefore = h.store.deskRecord(h.ids[0], h.pid).z;

  card.dispatchEvent(pointer('pointerdown', 250, 250));
  deskEl.dispatchEvent(pointer('pointermove', 600, 600));
  deskEl.dispatchEvent(pointer('pointerup', 600, 600));
  ok("a drag-shaped gesture does not move the card",
     JSON.stringify(h.store.deskRecord(h.ids[0], h.pid).pos) === posBefore);
  ok("...and does not raise it either", h.store.deskRecord(h.ids[0], h.pid).z === zBefore);
  ok("...it just picks it", h.viewLocal.desk.clipping.picked.length === 1);

  // two quick clicks are two picks, not an expand
  card.dispatchEvent(pointer('pointerdown', 250, 250));
  card.dispatchEvent(pointer('pointerdown', 250, 250));
  ok("double-clicking does not expand a card while picking", h.viewLocal.desk.expanded == null);
}

console.log("\n--- a card can only be in one clip, and the UI says so ---");
{
  const h = harness((store, pid, ids) => {
    const cid = store.addClip(pid);
    store.setDeskField(ids[0], pid, "clip", cid);
    store.setDeskField(ids[1], pid, "clip", cid);
  });
  h.page.querySelector('.banner-clip').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  h.redraw();
  const clipped = h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`);
  clipped.dispatchEvent(pointer('pointerdown', 250, 250));
  ok("clicking an already-clipped card picks nothing", h.viewLocal.desk.clipping.picked.length === 0);
  ok("...and says why", !!document.querySelector('.toast'));
  for (const t of document.querySelectorAll('.toast')) t.remove();
}

// ===================================================================
console.log("\n--- a closed clip is ONE object ---");
{
  const h = harness((store, pid, ids) => {
    const cid = store.addClip(pid);
    store.setDeskField(ids[0], pid, "clip", cid);
    store.setDeskField(ids[1], pid, "clip", cid);
  });
  const cid = h.store.clips(h.pid)[0].cid;
  ok("its members are marked as clipped", h.page.querySelectorAll('.dcard.is-clipped').length === 2);
  ok("the paperclip mark is drawn once", h.page.querySelectorAll('.dclip-mark').length === 1);
  ok("...as inline SVG that inherits the project's colour", !!h.page.querySelector('.dclip-mark svg'));
  ok("...tilted from its own id, not from the artwork",
     h.page.querySelector('.dclip-mark').style.getPropertyValue('--rot') !== "");
  ok("the loose card is still loose", h.page.querySelectorAll('.dcard:not(.is-clipped)').length === 1);

  // drag the stack by one of its members
  const deskEl = h.page.querySelector('.desk-surface');
  const before = [h.ids[0], h.ids[1]].map(id => ({ ...h.store.deskRecord(id, h.pid).pos }));
  const renders = h.host.renders;
  const member = h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`);
  member.dispatchEvent(pointer('pointerdown', 300, 300));
  ok("a clip drag takes a render hold", h.host.holds === 1);
  deskEl.dispatchEvent(pointer('pointermove', 400, 360));
  ok("every piece of the clip moved locally, together",
     [...h.page.querySelectorAll('.dcard.is-clipped')].every(n2 => n2.style.getPropertyValue('--dx') === "100px") &&
     h.page.querySelector('.dclip-mark').style.getPropertyValue('--dx') === "100px");
  ok("...and nothing was written mid-drag", h.host.renders === renders);
  deskEl.dispatchEvent(pointer('pointerup', 400, 360));
  ok("the hold is released on drop", h.host.holds === 0);

  const after = [h.ids[0], h.ids[1]].map(id => ({ ...h.store.deskRecord(id, h.pid).pos }));
  ok("both members moved by the same delta — one pos op each",
     after[0].x - before[0].x === 100 && after[1].x - before[1].x === 100 &&
     after[0].y - before[0].y === 60 && after[1].y - before[1].y === 60,
     JSON.stringify({ before, after }));
  ok("...their relative offsets are exactly preserved",
     after[1].x - after[0].x === before[1].x - before[0].x);
  ok("the clip record still has no position of its own",
     h.store.deskObjects(h.pid).clips[0].pos === undefined);
  ok("...and membership is unchanged", h.store.deskRecord(h.ids[0], h.pid).clip === cid);
}

console.log("\n--- tap raises the whole stack; double-click on the mark opens it ---");
{
  const h = harness((store, pid, ids) => {
    const cid = store.addClip(pid);
    store.setDeskField(ids[0], pid, "clip", cid);
    store.setDeskField(ids[1], pid, "clip", cid);
  });
  // the loose card is on top to start with (it was placed last, z = 3)
  const topBefore = h.store.deskRecord(h.ids[2], h.pid).z;
  click(h, h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`), 300, 300);
  ok("tapping the stack raises EVERY member above the loose card",
     h.store.deskRecord(h.ids[0], h.pid).z > topBefore &&
     h.store.deskRecord(h.ids[1], h.pid).z > topBefore);
  ok("...keeping their order inside the stack",
     h.store.deskRecord(h.ids[1], h.pid).z > h.store.deskRecord(h.ids[0], h.pid).z);

  h.redraw();
  const mark = h.page.querySelector('.dclip-mark');
  const cid = h.store.clips(h.pid)[0].cid;
  const before = h.store.pendingOps.length;
  click(h, mark, 320, 280);
  h.redraw();
  click(h, h.page.querySelector('.dclip-mark'), 320, 280);
  ok("double-clicking the mark opens the clip", h.viewLocal.desk.clipOpen === cid);
  ok("...and writes NOTHING — open/closed is per-device chrome",
     h.store.pendingOps.length === before, `${h.store.pendingOps.length - before} op(s)`);

  h.redraw();
  const flat = [...h.page.querySelectorAll('.dcard.is-clip-open')];
  ok("open, both members are drawn flat for reading",
     flat.length === 2 && flat.every(nd => nd.style.getPropertyValue('--rot') === "0.000deg"),
     `${flat.length} member(s) drawn open`);
  click(h, h.page.querySelector('.dclip-mark'), 320, 280);
  h.redraw();
  click(h, h.page.querySelector('.dclip-mark'), 320, 280);
  ok("double-clicking it again closes it", h.viewLocal.desk.clipOpen === null);
  h.redraw();
  ok("...and they go back to being a tilted stack",
     h.page.querySelectorAll('.dcard.is-clip-open').length === 0 &&
     h.page.querySelectorAll('.dcard.is-clipped').length === 2);
}

console.log("\n--- unclipping: one card by dragging it out, or the lot by right-click ---");
{
  const h = harness((store, pid, ids) => {
    const cid = store.addClip(pid);
    for (const id of ids) store.setDeskField(id, pid, "clip", cid);
  });
  const cid = h.store.clips(h.pid)[0].cid;
  h.viewLocal.desk.clipOpen = cid;
  h.redraw();

  const deskEl = h.page.querySelector('.desk-surface');
  const one = h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`);
  one.dispatchEvent(pointer('pointerdown', 300, 300));
  deskEl.dispatchEvent(pointer('pointermove', 800, 700));
  deskEl.dispatchEvent(pointer('pointerup', 800, 700));
  ok("dragging a card out of an open clip unclips it",
     h.store.deskRecord(h.ids[0], h.pid).clip === null);
  ok("...and gives it the position it was dropped at",
     h.store.deskRecord(h.ids[0], h.pid).pos.x > 0);
  ok("...while the others stay clipped",
     h.store.deskRecord(h.ids[1], h.pid).clip === cid &&
     h.store.deskRecord(h.ids[2], h.pid).clip === cid);

  // and the whole thing, from the mark's menu
  const others = [h.ids[1], h.ids[2]].map(id => JSON.stringify(h.store.deskRecord(id, h.pid).pos));
  h.redraw();
  const mark = h.page.querySelector('.dclip-mark');
  const menuEvent = pointer('contextmenu', 320, 280);
  mark.dispatchEvent(menuEvent);
  const menu = document.querySelector('.desk-menu');
  ok("right-clicking the mark opens a little menu", !!menu);
  ok("...with exactly one thing on it", menu && menu.querySelectorAll('.desk-menu-item').length === 1);
  menu.querySelector('.desk-menu-item').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok("Unclip clears every membership",
     [h.ids[1], h.ids[2]].every(id => h.store.deskRecord(id, h.pid).clip === null));
  ok("...tombstones the clip", h.store.clips(h.pid).length === 0);
  ok("...and repositions nobody",
     [h.ids[1], h.ids[2]].map(id => JSON.stringify(h.store.deskRecord(id, h.pid).pos)).join() === others.join());
  ok("the menu closes behind itself", !document.querySelector('.desk-menu'));
}

// ===================================================================
console.log("\n--- post-its ---");
{
  const h = harness();
  const deskEl = h.page.querySelector('.desk-surface');
  const view = h.page.querySelector('.desk-viewport');
  view.getBoundingClientRect = () => ({ left: 0, top: 100, right: 1440, bottom: 900, width: 1440, height: 800 });

  // a double-click on bare desk
  deskEl.dispatchEvent(pointer('pointerdown', 900, 500));
  deskEl.dispatchEvent(pointer('pointerup', 900, 500));
  ok("one click on bare desk makes nothing", h.store.notes(h.pid).length === 0);
  deskEl.dispatchEvent(pointer('pointerdown', 900, 500));
  deskEl.dispatchEvent(pointer('pointerup', 900, 500));
  ok("double-clicking bare desk makes a post-it", h.store.notes(h.pid).length === 1);
  const nid = h.store.notes(h.pid)[0].nid;
  ok("...free-floating, with a position of its own", !!h.store.notes(h.pid)[0].pos);
  ok("...no clip", h.store.notes(h.pid)[0].clip === null);
  ok("...and the cursor is sent to it", h.viewLocal.desk.noteFocus === `note:${nid}`);

  h.redraw();
  const note = h.page.querySelector('.dnote');
  ok("it draws", !!note);
  const ta = note.querySelector('.dnote-text');
  ok("...with a text field and a separate drag strip",
     !!ta && !!note.querySelector('.dnote-drag'));

  // typing writes NOTHING until it is committed
  const before = h.store.pendingOps.length;
  ta.value = "why these two";
  ta.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  ok("typing writes nothing to the store", h.store.pendingOps.length === before);
  ok("...but is held as a draft, so a rebuild can't swallow it",
     h.viewLocal.desk.noteDrafts[nid] === "why these two");
  h.redraw();
  ok("...and the draft is what a rebuild puts back in the box",
     h.page.querySelector('.dnote-text').value === "why these two");

  const ta2 = h.page.querySelector('.dnote-text');
  ta2.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
  ok("blur commits the words", h.store.notes(h.pid)[0].text === "why these two");
  ok("...and clears the draft", h.viewLocal.desk.noteDrafts[nid] === undefined);
}

console.log("\n--- emptying a post-it throws it away, but a rebuild does not ---");
{
  const h = harness((store, pid) => { store.addNote(pid, { text: "hello", pos: { x: 50, y: 50 } }); });
  const ta = h.page.querySelector('.dnote-text');
  ta.value = "";
  ta.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  ta.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
  ok("clearing the words and clicking away throws it away", h.store.notes(h.pid).length === 0);

  // the dangerous case: a brand new (empty) post-it, and a sync lands
  const h2 = harness();
  const nid = h2.store.addNote(h2.pid, { pos: { x: 10, y: 10 } });
  h2.redraw();
  const detached = h2.page.querySelector('.dnote-text');
  h2.redraw();                                   // the rebuild detaches the old box
  detached.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
  ok("a blur caused by a REBUILD does not delete an empty post-it",
     h2.store.notes(h2.pid).length === 1, "this is the 'blur is not proof' rule");
}

console.log("\n--- the drop decides whether a post-it is attached ---");
{
  const h = harness((store, pid, ids) => {
    const cid = store.addClip(pid);
    store.setDeskField(ids[0], pid, "clip", cid);
    store.setDeskField(ids[1], pid, "clip", cid);
    store.addNote(pid, { text: "note", pos: { x: 60, y: 60 } });
  });
  const cid = h.store.clips(h.pid)[0].cid;
  const nid = h.store.notes(h.pid)[0].nid;
  const deskEl = h.page.querySelector('.desk-surface');
  const note = h.page.querySelector('.dnote');
  const mark = h.page.querySelector('.dclip-mark');
  // jsdom has no layout, so put the mark somewhere the pointer can land on it
  mark.getBoundingClientRect = () => ({ left: 700, top: 400, right: 760, bottom: 460, width: 60, height: 60 });
  for (const c of h.page.querySelectorAll('.dcard')) c.getBoundingClientRect = () => ({ left: -1, top: -1, right: -1, bottom: -1, width: 0, height: 0 });

  ok("the text field is not a drag handle",
     (note.querySelector('.dnote-text').dispatchEvent(pointer('pointerdown', 100, 100)), h.host.holds === 0));

  note.querySelector('.dnote-drag').dispatchEvent(pointer('pointerdown', 100, 100));
  ok("the grip is", h.host.holds === 1);
  deskEl.dispatchEvent(pointer('pointermove', 720, 430));
  ok("...and the clip it would land on lights up", mark.classList.contains('is-drop-target'));
  deskEl.dispatchEvent(pointer('pointerup', 720, 430));
  ok("dropping it on a clip attaches it", h.store.notes(h.pid)[0].clip === cid);
  ok("...in one field, keeping its old position underneath",
     h.store.notes(h.pid)[0].pos.x === 60);

  // and back off again — onto bare desk this time
  h.redraw();
  const desk2 = h.page.querySelector('.desk-surface');
  const note2 = h.page.querySelector('.dnote');
  for (const nd of h.page.querySelectorAll('.dclip-mark, .dcard')) {
    nd.getBoundingClientRect = () => ({ left: -1, top: -1, right: -1, bottom: -1, width: 0, height: 0 });
  }
  note2.querySelector('.dnote-drag').dispatchEvent(pointer('pointerdown', 720, 430));
  desk2.dispatchEvent(pointer('pointermove', 200, 700));
  desk2.dispatchEvent(pointer('pointerup', 200, 700));
  ok("dropping it on open desk takes it back off the clip",
     h.store.notes(h.pid)[0].clip === null);
  ok("...and gives it a real position again", h.store.notes(h.pid)[0].pos.x !== 60);
}

console.log("\n--- an attached post-it rides its clip ---");
{
  const h = harness((store, pid, ids) => {
    const cid = store.addClip(pid);
    store.setDeskField(ids[0], pid, "clip", cid);
    store.setDeskField(ids[1], pid, "clip", cid);
    store.addNote(pid, { text: "why", clip: cid });
  });
  const note = h.page.querySelector('.dnote');
  ok("it draws as attached", note.classList.contains('is-attached'));
  const at = { x: parseFloat(note.style.left), y: parseFloat(note.style.top) };

  const deskEl = h.page.querySelector('.desk-surface');
  h.page.querySelector(`.dcard[data-id="${h.ids[0]}"]`).dispatchEvent(pointer('pointerdown', 300, 300));
  deskEl.dispatchEvent(pointer('pointermove', 380, 350));
  ok("it moves with the stack during the drag",
     note.style.getPropertyValue('--dx') === "80px");
  deskEl.dispatchEvent(pointer('pointerup', 380, 350));
  h.redraw();
  const moved = h.page.querySelector('.dnote');
  ok("...and its new resting place is derived, with no op of its own",
     parseFloat(moved.style.left) === at.x + 80 && parseFloat(moved.style.top) === at.y + 50,
     `${moved.style.left},${moved.style.top} from ${at.x},${at.y}`);
  ok("the note record was never written to", h.store.notes(h.pid)[0].pos === null);
}

// ===================================================================
console.log("\n--- Escape closes the topmost surface, one per press ---");
{
  const h = harness((store, pid, ids) => {
    const cid = store.addClip(pid);
    store.setDeskField(ids[0], pid, "clip", cid);
    store.setDeskField(ids[1], pid, "clip", cid);
  });
  const cid = h.store.clips(h.pid)[0].cid;
  const esc = () => document.dispatchEvent(Object.assign(new dom.window.Event('keydown', { bubbles: true }), { key: 'Escape' }));
  // A rebuild takes the OLD desk's document-level listeners off via its
  // MutationObserver, and that runs on a microtask. Waiting one tick is what
  // makes "one press, one surface" a real measurement here rather than two
  // generations of the same desk both answering the same keystroke.
  const settle = () => sleep(0);

  h.viewLocal.desk.clipOpen = cid;
  h.viewLocal.desk.expanded = h.ids[0];
  h.viewLocal.desk.clipping = { picked: [] };
  h.redraw(); await settle();

  esc();
  ok("first press leaves the picking mode", h.viewLocal.desk.clipping === null);
  ok("...and nothing else moved", h.viewLocal.desk.expanded === h.ids[0] && h.viewLocal.desk.clipOpen === cid,
     JSON.stringify({ expanded: h.viewLocal.desk.expanded, open: h.viewLocal.desk.clipOpen }));
  h.redraw(); await settle(); esc();
  ok("second press collapses the expanded card", h.viewLocal.desk.expanded === null);
  ok("...and the clip is still open", h.viewLocal.desk.clipOpen === cid);
  h.redraw(); await settle(); esc();
  ok("third press closes the clip", h.viewLocal.desk.clipOpen === null);
  h.redraw(); await settle(); esc();
  ok("a fourth press with nothing left open does nothing at all",
     h.viewLocal.desk.clipOpen === null && h.viewLocal.desk.expanded === null);
}

console.log("\n--- the phone still gets no desk, and no clip button ---");
{
  dom.window.matchMedia = (q) => ({ matches: false, addEventListener(){}, removeEventListener(){} });
  const h = harness();
  ok("no desk surface on a coarse pointer", !h.page.querySelector('.desk-surface'));
  ok("...and therefore no clip button either", !h.page.querySelector('.banner-clip'));
  ok("...but the Peek page is there", !!h.page.querySelector('.peek-page'));
  dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine'), addEventListener(){}, removeEventListener(){} });
}

await sleep(20);
console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
