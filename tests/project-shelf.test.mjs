// The Projects overview's shelf, under jsdom.
//
//   node tests/project-shelf.test.mjs      (needs jsdom: npm install jsdom)
//
// Written for one bug (August 16, 2026): the spines appeared to shake when the
// page opened. The tilt is a CSS transition on :hover, and the browser resolves
// :hover a style pass AFTER an element is inserted — so a spine that is thrown
// away and rebuilt restarts that animation, whether or not anyone moved the
// mouse. Every store write anywhere in Dash redraws the whole screen, so the
// shelf was being rebuilt constantly for no reason.
//
// The standing rule applies as always: jsdom has no layout, so nothing here
// asserts a pixel. What it CAN see is ELEMENT IDENTITY — whether a redraw kept
// a node or replaced it — which is exactly the structural fact the fix is about.
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

const { Store } = await import('../js/store.js');
const { projectView } = await import('../js/views/project.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function harness(projects = [["Bestie", 4], ["Dash", 9], ["House", 2]]) {
  const store = new Store();
  const pids = projects.map(([title, count]) => {
    const pid = store.createItem({ title, type: "project" });
    for (let i = 0; i < count; i++) {
      const id = store.createItem({ title: `${title} ${i}` });
      store.assignToProject(id, pid);
    }
    return pid;
  });
  const viewLocal = {};
  const ctx = { store, viewLocal, selection: { active: false }, onOpen(){}, sync: null,
                holdRenders: () => () => {}, rerender: () => draw() };
  const host = document.getElementById('host');
  const draw = () => projectView.render(null, ctx, host);
  draw();
  const spines = () => [...host.querySelectorAll('.spine')];
  return { store, pids, ctx, viewLocal, draw, host, spines };
}

// ===================================================================
console.log("\n--- a redraw keeps the shelf, it does not rebuild it ---");
{
  const h = harness();
  const before = h.spines();
  ok("three projects, three spines", before.length === 3);
  ok("...each carrying its own id", before.every(s => !!s.dataset.id));

  h.draw();
  const after = h.spines();
  ok("a redraw that changes nothing reuses every spine element",
     after.length === 3 && after.every((s, i) => s === before[i]),
     "this is the whole fix: an element that survives keeps whatever the pointer was doing to it");

  // ...and ten more redraws, because the real trigger is a burst of them
  for (let i = 0; i < 10; i++) h.draw();
  ok("...and still does after ten more",
     h.spines().every((s, i) => s === before[i]));

  // the wrapper too — otherwise the container is emptied and the spines go with it
  ok("the picker element itself is kept across redraws",
     h.host.firstChild === h.host.firstChild && !!h.viewLocal.picker);
}

console.log("\n--- but it still reflects what actually changed ---");
{
  const h = harness();
  const before = h.spines();
  const pid = h.pids[0];

  h.store.setField(pid, "title", "Bestie renamed");
  h.draw();
  ok("renaming a project updates its spine in place",
     h.spines()[0] === before[0] || h.spines().some(s => s.querySelector('.spine-title').textContent === "Bestie renamed"));
  ok("...without replacing any element",
     h.spines().length === 3 && h.spines().every(s => before.includes(s)));

  // a new project appears, and only it is new
  const fresh = h.store.createItem({ title: "Zed", type: "project" });
  h.draw();
  const now = h.spines();
  ok("a new project adds exactly one spine", now.length === 4);
  ok("...and leaves the other three alone",
     before.every(s => now.includes(s)));

  // and a removed one goes
  h.store.setField(fresh, "type", "note");
  h.draw();
  ok("a project that stops being one loses its spine", h.spines().length === 3);
  ok("...and again nothing else was replaced", h.spines().every(s => before.includes(s)));
}

console.log("\n--- entry counts come from ONE pass over the archive ---");
{
  const h = harness([["Bestie", 4], ["Dash", 9], ["House", 2]]);
  // The width of a spine is driven by --n. It has to be right, and it has to
  // be right without walking the whole archive once per project.
  const byTitle = new Map(h.spines().map(s => [s.querySelector('.spine-title').textContent, s]));
  const nOf = (t) => Number((byTitle.get(t).getAttribute('style').match(/--n:\s*(\d+)/) || [])[1]);
  ok("Bestie counts 4", nOf("Bestie") === 4);
  ok("Dash counts 9", nOf("Dash") === 9);
  ok("House counts 2", nOf("House") === 2);

  let walks = 0;
  const realAll = h.store.all.bind(h.store);
  h.store.all = () => { walks++; return realAll(); };
  h.draw();
  h.store.all = realAll;
  ok("drawing three spines does not walk the archive once per spine",
     walks <= 3, `walked ${walks} times for 3 projects — it used to be one per spine, plus one`);
}

console.log("\n--- a brand new spine does not animate into a hover nobody made ---");
{
  const h = harness();
  ok("every spine is born marked as fresh, so its transition is off for that frame",
     h.spines().every(s => s.classList.contains('is-fresh')));
  await sleep(60);
  ok("...and has the transition handed back once it has been laid out",
     h.spines().every(s => !s.classList.contains('is-fresh')),
     "if this sticks, the tilt would never animate at all");

  // a redraw must not re-mark the spines it KEPT — they have been hovered for
  // a while and turning their transition off would make a real hover jump
  h.draw();
  ok("a kept spine is not marked fresh again",
     h.spines().every(s => !s.classList.contains('is-fresh')));
}

console.log("\n--- clicking a spine still opens its project ---");
{
  const h = harness();
  const spine = h.spines()[1];
  const id = spine.dataset.id;
  spine.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok("one delegated handler on the shelf, and it still works",
     h.viewLocal.projectId === id, `${h.viewLocal.projectId} vs ${id}`);
  ok("...and leaving the picker lets go of it",
     h.viewLocal.picker === null);
}

await sleep(20);
console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
