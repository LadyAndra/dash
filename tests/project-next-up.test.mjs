// Projects overview "Next up" register, under jsdom.
//
//   node tests/project-next-up.test.mjs    (needs jsdom)
//
// The shelf is the stable library. Next up is the derived answer to
// "which open project stage reaches me first?" Nothing about this order is
// stored: it comes from stageOf() every render.
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: "https://x.test/",
});
for (const k of ["window","document","Node","Element","HTMLElement","SVGElement",
                 "MutationObserver","requestAnimationFrame","getComputedStyle","Event","KeyboardEvent"])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
dom.window.matchMedia = (q) => ({ matches: q.includes("pointer: fine"), addEventListener(){}, removeEventListener(){} });

const { Store } = await import("../js/store.js");
const { projectView } = await import("../js/views/project.js");

let fail = 0, n = 0;
const ok = (name, c, extra = "") => {
  n++;
  if (!c) fail++;
  console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra));
};

function dateOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function harness() {
  const store = new Store();

  function project(title, stageDate, { done = false, members = 0 } = {}) {
    const pid = store.createItem({ title, type: "project" });
    if (stageDate !== undefined) {
      const mid = store.addMilestone(pid, { label: `${title} stage`, date: stageDate });
      if (done) store.setMilestoneField(pid, mid, "done", new Date().toISOString());
    }
    for (let i = 0; i < members; i++) {
      const id = store.createItem({ title: `${title} ${i}` });
      store.assignToProject(id, pid);
    }
    return pid;
  }

  const ids = {
    later: project("Later", dateOffset(12), { members: 4 }),
    undated: project("Undated", null, { members: 2 }),
    overdue: project("Overdue", dateOffset(-3), { members: 7 }),
    soon: project("Soon", dateOffset(2), { members: 1 }),
    complete: project("Complete", dateOffset(-20), { done: true, members: 3 }),
    noMilestones: project("No milestones", undefined, { members: 5 }),
  };

  const viewLocal = {};
  const host = document.getElementById("host");
  const ctx = {
    store, viewLocal, selection: { active: false }, onOpen(){}, sync: null,
    holdRenders: () => () => {},
    rerender: () => draw(),
  };
  const draw = () => projectView.render(null, ctx, host);
  draw();

  const rows = () => [...host.querySelectorAll('[data-project-next="1"] .item-row[data-id]')];
  const rowTitles = () => rows().map(r => r.querySelector(".project-next-title")?.textContent);

  return { store, ids, viewLocal, host, draw, rows, rowTitles };
}

console.log("\n--- Next up is derived, ordered and selective ---");
{
  const h = harness();
  const panel = h.host.querySelector('[data-project-next="1"]');
  ok("Next up is visible when unfinished milestone stages exist", panel && !panel.hidden);
  ok("overdue comes first, then nearest dated stages, then undated",
     JSON.stringify(h.rowTitles()) === JSON.stringify(["Overdue", "Soon", "Later", "Undated"]),
     `got ${JSON.stringify(h.rowTitles())}`);
  ok("completed projects stay off Next up", !h.rowTitles().includes("Complete"));
  ok("projects with no milestones stay off Next up", !h.rowTitles().includes("No milestones"));
  ok("header reports overdue and active counts",
     panel.querySelector(".panel-right").textContent === "1 overdue · 4 active",
     panel.querySelector(".panel-right").textContent);
  ok("member count reuses the shelf count data",
     h.rows()[0].querySelector(".project-next-members").textContent === "7 entries");
}

console.log("\n--- the register survives ordinary redraws ---");
{
  const h = harness();
  const before = h.rows();
  h.draw();
  const after = h.rows();
  ok("a redraw reuses every Next up row element",
     before.length === after.length && after.every((r, i) => r === before[i]));

  h.store.setField(h.ids.soon, "title", "Soon renamed");
  h.draw();
  ok("a title edit updates the kept row",
     h.rowTitles().includes("Soon renamed"));
  ok("...without replacing that row",
     h.rows().some(r => r === before.find(x => x.dataset.id === h.ids.soon)));
}

console.log("\n--- search scopes shelf and Next up together ---");
{
  const h = harness();
  const search = h.host.querySelector('input[aria-label="Search projects"]');
  search.value = "soon";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  ok("search narrows Next up too",
     JSON.stringify(h.rowTitles()) === JSON.stringify(["Soon"]));
  ok("search narrows the shelf to the same project",
     h.host.querySelectorAll(".project-shelf .spine").length === 1);
}

console.log("\n--- Next up rows open the project ---");
{
  const h = harness();
  const first = h.rows()[0];
  const id = first.dataset.id;
  first.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  ok("clicking a Next up row selects that project", h.viewLocal.projectId === id);
}

console.log("\n--- the extra overview does not add archive walks ---");
{
  const h = harness();
  let walks = 0;
  const realAll = h.store.all.bind(h.store);
  h.store.all = () => { walks++; return realAll(); };
  h.draw();
  h.store.all = realAll;
  ok("shelf + Next up still share one member-count pass",
     walks <= 3, `walked archive ${walks} times`);
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
