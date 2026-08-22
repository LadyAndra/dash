// Projects overview index rail, under jsdom.
//
//   node tests/project-shelf.test.mjs      (needs jsdom)
//
// The filename stays for continuity with the August 16 shelf regression test,
// but the visual metaphor is now the August 17 colour index rail. The important
// structural rule is unchanged: ordinary redraws reconcile project controls by
// id instead of throwing them away and rebuilding them under the pointer.
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
  const rows = () => [...host.querySelectorAll('[data-project-index-item]')];
  return { store, pids, ctx, viewLocal, draw, host, rows };
}

console.log("\n--- a redraw keeps the index rail, it does not rebuild it ---");
{
  const h = harness();
  const before = h.rows();
  ok("three projects, three index rows", before.length === 3);
  ok("...each carrying its own id", before.every(r => !!r.dataset.id));

  h.draw();
  const after = h.rows();
  ok("a redraw that changes nothing reuses every row element",
     after.length === 3 && after.every((r, i) => r === before[i]),
     "stable DOM is the regression guard carried forward from the shelf");

  for (let i = 0; i < 10; i++) h.draw();
  ok("...and still does after ten more redraws",
     h.rows().every((r, i) => r === before[i]));
  ok("the picker controller itself is kept across redraws", !!h.viewLocal.picker);
}

console.log("\n--- the kept rows still reflect real changes ---");
{
  const h = harness();
  const before = h.rows();
  const pid = h.pids[0];

  h.store.setField(pid, "title", "Bestie renamed");
  h.draw();
  ok("renaming a project updates its row in place",
     h.rows()[0] === before[0] &&
     h.rows()[0].querySelector('.project-index-title').textContent === "Bestie renamed");
  ok("...without replacing any existing row",
     h.rows().length === 3 && h.rows().every(r => before.includes(r)));

  const fresh = h.store.createItem({ title: "Zed", type: "project" });
  h.draw();
  const now = h.rows();
  ok("a new project adds exactly one row", now.length === 4);
  ok("...and leaves the other three alone", before.every(r => now.includes(r)));

  h.store.setField(fresh, "type", "note");
  h.draw();
  ok("a project that stops being one loses its row", h.rows().length === 3);
  ok("...and again nothing else was replaced", h.rows().every(r => before.includes(r)));
}

console.log("\n--- counts still come from one overview archive pass ---");
{
  const h = harness([["Bestie", 4], ["Dash", 9], ["House", 2]]);
  const byTitle = new Map(h.rows().map(r => [r.querySelector('.project-index-title').textContent, r]));
  ok("Bestie accessible label says 4 entries", byTitle.get("Bestie").getAttribute('aria-label').includes("4 entries"));
  ok("Dash accessible label says 9 entries", byTitle.get("Dash").getAttribute('aria-label').includes("9 entries"));
  ok("House accessible label says 2 entries", byTitle.get("House").getAttribute('aria-label').includes("2 entries"));

  let walks = 0;
  const realAll = h.store.all.bind(h.store);
  h.store.all = () => { walks++; return realAll(); };
  h.draw();
  h.store.all = realAll;
  ok("drawing the index does not walk the archive once per project",
     walks <= 3, `walked ${walks} times for 3 projects`);
}

console.log("\n--- the rail previews a focus specimen, and a click is the door ---");
{
  const h = harness();
  ok("the first visible project is focused by default", h.viewLocal.focusProjectId === h.pids[0]);
  ok("its large specimen title is shown",
     h.host.querySelector('.project-focus-title')?.textContent === "Bestie");

  // POINTING previews; CLICKING enters. The earlier rail made the click a
  // selection and put the only door on the specimen title. That second step is
  // gone (August 19): the specimen follows the pointer so you can read a
  // project without committing to it, and the row itself is the door.
  const second = h.rows()[1];
  second.dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));
  ok("pointing at a rail row changes the focus project", h.viewLocal.focusProjectId === h.pids[1]);
  ok("a preview on its own does not enter the Desk", !h.viewLocal.projectId);

  const previewed = h.rows().find(r => r.dataset.id === h.pids[1]);
  ok("the previewed row is exposed to assistive tech, not just styled",
     previewed?.getAttribute('aria-current') === 'true');
  ok("...and exactly one row claims it at a time",
     h.rows().filter(r => r.getAttribute('aria-current') === 'true').length === 1);
  ok("the rail bends one shared notch toward the row, rather than a mark per row",
     !!h.host.querySelector('.project-index-notch'));
  ok("the focus specimen updates to the previewed project",
     h.host.querySelector('.project-focus-title')?.textContent === "Dash");
  ok("the specimen shows its position in the current index",
     h.host.querySelector('.project-focus-position')?.textContent === "02 / 03");

  // Keyboard must reach the same preview, or the rail is pointer-only.
  h.rows()[2].dispatchEvent(new dom.window.Event('focusin', { bubbles: true }));
  ok("keyboard focus previews exactly the way the pointer does",
     h.viewLocal.focusProjectId === h.pids[2]);
  ok("...and the aria-current mark follows it",
     h.rows()[2].getAttribute('aria-current') === 'true' &&
     h.rows()[1].getAttribute('aria-current') === null);
}

console.log("\n--- clicking a rail row enters that project's Desk ---");
{
  const h = harness();
  h.rows()[1].dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok("the row itself is the doorway", h.viewLocal.projectId === h.pids[1]);
}

console.log("\n--- the large specimen title is still a doorway too ---");
{
  const h = harness();
  h.rows()[1].dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));
  h.host.querySelector('.project-focus-title-button')
    .dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok("clicking the specimen title enters the previewed project",
     h.viewLocal.projectId === h.pids[1]);
}

console.log("\n--- a long registry stays one rail rather than becoming a new layout ---");
{
  const projects = Array.from({ length: 20 }, (_, i) => [`Project ${String(i + 1).padStart(2, "0")}`, i % 4]);
  const h = harness(projects);
  ok("twenty projects render as twenty reconciled rail rows", h.rows().length === 20);
  ok("the focus specimen still exists beside the long registry", !!h.host.querySelector('.project-focus-specimen'));
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
