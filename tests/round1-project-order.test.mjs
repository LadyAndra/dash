// Round 1 (October 2026): HAND-SORTED PROJECTS.
//
//   node tests/round1-project-order.test.mjs      (needs jsdom)
//
// What has to be true:
//   - Starting order is the old alphabetical order, with ZERO writes.
//   - The first move materialises ranks once (one op per project); every move
//     after that is exactly ONE op.
//   - New projects land at the bottom with no code.
//   - The order is synced content: two devices converge, and moving different
//     projects on each device keeps both moves.
//   - The ▲ ▼ buttons are real, labelled, 44px-class buttons that move one
//     step, and are disabled at the ends.
//   - The keyboard pattern: Space picks up, arrows move, Space/Enter drops,
//     Escape cancels — and plain arrow keys do NOTHING when nothing is picked
//     up. Nothing is written until the drop.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: 'https://x.test/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement',
                 'MutationObserver','requestAnimationFrame','getComputedStyle','Event','KeyboardEvent','MouseEvent'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine'), addEventListener(){}, removeEventListener(){} });

const { Store, OP } = await import('../js/store.js');
const { projectView } = await import('../js/views/project.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const frame = () => new Promise(r => setTimeout(r, 30));

function seed(titles = ["Dash", "Bestie", "House", "Garden"]) {
  const store = new Store();
  const ids = {};
  for (const t of titles) ids[t] = store.createItem({ title: t, type: "project" });
  return { store, ids };
}
const order = (store) => store.projects().map(p => p.title);

console.log("\n--- the store's order ---");
{
  const { store, ids } = seed();
  ok("starting order is alphabetical", order(store).join() === "Bestie,Dash,Garden,House", order(store).join());
  store.pendingOps = [];
  store.projects();
  ok("...and reading it writes nothing", store.pendingOps.length === 0);

  store.moveProject(ids.House, 0);
  ok("moving House to the top works", order(store).join() === "House,Bestie,Dash,Garden", order(store).join());
  const first = store.pendingOps.filter(o => o.field === "rank");
  ok("the FIRST move materialises a rank on every project (plus the move)",
     new Set(first.map(o => o.itemId)).size === 4, JSON.stringify(first.map(o => o.value)));
  ok("every rank op is an ordinary set", first.every(o => o.op === OP.SET));

  store.pendingOps = [];
  store.moveProject(ids.Garden, 1);
  ok("a later move is exactly ONE op", store.pendingOps.length === 1 && store.pendingOps[0].itemId === ids.Garden);
  ok("...and lands where asked", order(store).join() === "House,Garden,Bestie,Dash", order(store).join());

  store.pendingOps = [];
  ok("moving to where it already is writes nothing", store.moveProject(ids.House, 0) === false && store.pendingOps.length === 0);
  ok("out-of-range targets clamp rather than throw", store.moveProject(ids.House, 99) === true && order(store).at(-1) === "House");

  store.createItem({ title: "Aardvark", type: "project" });
  ok("a NEW project goes to the bottom, even if it sorts first alphabetically",
     order(store).at(-1) === "Aardvark", order(store).join());
}

console.log("\n--- precision: fifty moves into the same gap still order correctly ---");
{
  const { store, ids } = seed(["A", "B", "C"]);
  // Shuttle C between A and B, then B between A and C, forever: every move
  // halves the same gap. The store must notice and re-space rather than
  // silently produce a tie.
  for (let i = 0; i < 60; i++) store.moveProject(i % 2 ? ids.B : ids.C, 1);
  const ranks = store.projects().map(p => p.rank);
  ok("ranks stay strictly increasing", ranks.every((r, i) => i === 0 || r > ranks[i - 1]), ranks.join());
  ok("and the list is still three projects", ranks.length === 3);
}

console.log("\n--- two devices ---");
{
  const { store: mac, ids } = seed();
  const ipad = new Store();
  ipad.replayLog(mac.drainPendingAsLines().map(JSON.parse));
  ok("same starting order on both", order(mac).join() === order(ipad).join());

  // Materialise once on the Mac and sync, so both share ranks.
  mac.moveProject(ids.House, 0);
  ipad.replayLog(mac.drainPendingAsLines().map(JSON.parse));
  ok("the move arrives on the iPad", order(ipad)[0] === "House");

  // Now each device moves a DIFFERENT project, offline.
  mac.moveProject(ids.Garden, 1);    // House, Garden, Bestie, Dash
  ipad.moveProject(ids.Dash, 0);     // Dash, House, Bestie, Garden  (on the iPad)
  const fromMac = mac.drainPendingAsLines().map(JSON.parse);
  const fromIpad = ipad.drainPendingAsLines().map(JSON.parse);
  mac.replayLog(fromIpad);
  ipad.replayLog(fromMac);
  ok("both devices converge on the same order", order(mac).join() === order(ipad).join(),
     `${order(mac).join()} vs ${order(ipad).join()}`);
  ok("...and BOTH moves survived: Dash on top (iPad), Garden above Bestie (Mac)",
     order(mac).join() === "Dash,House,Garden,Bestie", order(mac).join());

  // Same project moved on both: last writer wins, never corruption.
  mac.moveProject(ids.Bestie, 0);
  ipad.moveProject(ids.Bestie, 3);
  const m2 = mac.drainPendingAsLines().map(JSON.parse);
  const i2 = ipad.drainPendingAsLines().map(JSON.parse);
  mac.replayLog(i2); ipad.replayLog(m2);
  ok("the same project moved on both still converges", order(mac).join() === order(ipad).join(),
     `${order(mac).join()} vs ${order(ipad).join()}`);
}

console.log("\n--- the picker's ▲ ▼ buttons ---");
function harness(titles) {
  const { store, ids } = seed(titles);
  const host = document.getElementById('host');
  host.innerHTML = "";
  const viewLocal = {};
  let opened = 0;
  const ctx = { store, viewLocal, selection: { active: false }, onOpen(){}, sync: null,
                holdRenders: () => () => {}, rerender: () => draw() };
  const draw = () => {
    if (viewLocal.projectId) { opened++; viewLocal.projectId = null; }
    projectView.render(null, ctx, host);
  };
  draw();
  const titlesOnScreen = () => [...host.querySelectorAll('[data-project-index-item] .project-index-title')].map(t => t.textContent);
  const row = (t) => [...host.querySelectorAll('[data-project-index-item]')].find(r => r.querySelector('.project-index-title').textContent === t);
  const key = (node, k) => node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return { store, ids, host, draw, titlesOnScreen, row, key, opened: () => opened };
}
{
  const h = harness();
  const moveBtns = [...h.host.querySelectorAll('[data-move]')];
  ok("every row has a ▲ and a ▼", moveBtns.length === 8);
  ok("each is a real button with a spoken label naming the project",
     moveBtns.every(b => b.tagName === "BUTTON" && /^Move .+ (up|down)$/.test(b.getAttribute('aria-label'))));
  const firstUp = h.host.querySelector('[data-row-id] [data-move="up"]');
  const lastDown = [...h.host.querySelectorAll('[data-move="down"]')].pop();
  ok("the top row's ▲ and the bottom row's ▼ are disabled", firstUp.disabled && lastDown.disabled);

  const before = h.row("House");
  h.row("House").parentElement.querySelector('[data-move="up"]').click();
  ok("▲ moves the project up one", h.titlesOnScreen().join() === "Bestie,Dash,House,Garden", h.titlesOnScreen().join());
  ok("...without opening it", h.opened() === 0);
  ok("...and the row element is reused, not rebuilt", h.row("House") === before);
  ok("...and the order is stored, not just drawn", order(h.store).join() === "Bestie,Dash,House,Garden");
  ok("a polite live region says what happened",
     /House moved up, now position 3 of 4/.test(h.host.querySelector('.project-order-announcer').textContent));

  h.row("Bestie").parentElement.querySelector('[data-move="down"]').click();
  ok("▼ moves the project down one", h.titlesOnScreen().join() === "Dash,Bestie,House,Garden", h.titlesOnScreen().join());

  // A redraw keeps the same rows (the stable-DOM rule this rail lives by).
  const rows = [...h.host.querySelectorAll('[data-project-index-item]')];
  h.draw();
  ok("a plain redraw reuses every row", [...h.host.querySelectorAll('[data-project-index-item]')].every((r, i) => r === rows[i]));
}

console.log("\n--- the keyboard pattern ---");
{
  const h = harness();
  const house = h.row("House");
  house.focus();
  h.store.pendingOps = [];

  h.key(house, "ArrowUp");
  ok("plain ↑ with nothing picked up does nothing", h.titlesOnScreen().join() === "Bestie,Dash,Garden,House" && h.store.pendingOps.length === 0);

  h.key(house, " ");
  ok("Space picks it up (pressed, and marked)", house.getAttribute('aria-pressed') === "true" &&
     house.parentElement.classList.contains('is-picked'));
  ok("...and announces how to move it", /Picked up House, position 4 of 4/.test(h.host.querySelector('.project-order-announcer').textContent));
  ok("...and does not open the project", h.opened() === 0);

  h.key(house, "ArrowUp");
  h.key(house, "ArrowUp");
  ok("↑ ↑ moves it two places on screen", h.titlesOnScreen().join() === "Bestie,House,Dash,Garden", h.titlesOnScreen().join());
  ok("...while writing NOTHING yet", h.store.pendingOps.length === 0);
  ok("...and keyboard focus stays on the row being carried", document.activeElement === house);

  h.draw();   // a background sync landing mid-pick
  ok("a redraw mid-pick keeps the order being chosen", h.titlesOnScreen().join() === "Bestie,House,Dash,Garden");

  h.key(house, " ");
  ok("Space drops it there", order(h.store).join() === "Bestie,House,Dash,Garden", order(h.store).join());
  ok("...and it is no longer picked up", !house.hasAttribute('aria-pressed'));
  ok("...and the drop is announced", /dropped at position 2 of 4/.test(h.host.querySelector('.project-order-announcer').textContent));
  ok("...and it never opened the project", h.opened() === 0);

  // Escape cancels.
  const dash = h.row("Dash");
  dash.focus();
  h.store.pendingOps = [];
  h.key(dash, " ");
  h.key(dash, "ArrowDown");
  ok("picked up and moved down on screen", h.titlesOnScreen().join() === "Bestie,House,Garden,Dash");
  h.key(dash, "Escape");
  ok("Escape puts it back where it was", h.titlesOnScreen().join() === "Bestie,House,Dash,Garden", h.titlesOnScreen().join());
  ok("...and wrote nothing", h.store.pendingOps.length === 0);
  ok("...and announces the cancel", /cancelled/i.test(h.host.querySelector('.project-order-announcer').textContent));

  // Enter drops too.
  h.key(dash, " ");
  h.key(dash, "ArrowUp");
  h.key(dash, "Enter");
  ok("Enter drops as well", order(h.store).join() === "Bestie,Dash,House,Garden", order(h.store).join());
  ok("...and the Enter did not open the project", h.opened() === 0);

  // Moving past the top just says so.
  const bestie = h.row("Bestie");
  bestie.focus();
  h.key(bestie, " ");
  h.key(bestie, "ArrowUp");
  ok("↑ at the top stays put and says so", /already at the top/.test(h.host.querySelector('.project-order-announcer').textContent));
  h.key(bestie, "Escape");

  // A plain click still opens a project. (Wait out the short window in which a
  // click straight after a Space/Enter is treated as that key's own echo.)
  await new Promise(r => setTimeout(r, 450));
  h.row("Garden").click();
  ok("an ordinary click still opens the project", h.opened() === 1);
}

console.log(`\n${fail ? `${fail} of ${n} project order checks FAILED` : `all ${n} project order checks passed`}`);
process.exit(fail ? 1 : 0);
