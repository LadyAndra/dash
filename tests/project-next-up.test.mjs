// Projects overview: compact Next up register inside the dark Projects band.
//
//   node tests/project-next-up.test.mjs    (needs jsdom)
//
// The colour index is the stable library. Next up is only the at-a-glance
// queue and must NOT consume a second block of vertical space below the banner.
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: "https://x.test/",
});
for (const k of ["window","document","Node","Element","HTMLElement","SVGElement",
                 "MutationObserver","requestAnimationFrame","getComputedStyle","Event"])
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
    fourth: project("Fourth", dateOffset(20), { members: 6 }),
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

  const next = () => host.querySelector('[data-project-next="1"]');
  const buttons = () => [...host.querySelectorAll("[data-project-next-item]")];
  const buttonTitles = () => buttons().map(b => b.querySelector(".project-next-title")?.textContent);

  return { store, ids, viewLocal, host, draw, next, buttons, buttonTitles };
}

console.log("\n--- Next up lives INSIDE the Projects banner ---");
{
  const h = harness();
  const page = h.host.querySelector(".project-picker-page");
  const band = h.host.querySelector(".project-picker-band");
  const layout = h.host.querySelector(".project-index-layout");
  ok("the overview has one scoped full-bleed wrapper", !!page);
  ok("the wrapper reaches through the host's normal inset",
     page.getAttribute("style").includes("var(--space-5)") &&
     page.getAttribute("style").includes("var(--space-6)"));
  ok("the dark banner is one compact ledger row",
     !band.querySelector(".band-top") && !band.querySelector(".band-controls"));
  ok("Projects search is intentionally absent",
     !band.querySelector('input[aria-label="Search projects"]'));
  ok("the duplicate New project action is intentionally absent",
     ![...band.querySelectorAll("button")].some(b => b.textContent.includes("New project")));
  ok("Next up exists", !!h.next());
  ok("Next up is a child of the dark Projects banner", band.contains(h.next()));
  ok("there is no standalone Next up panel below the banner",
     !h.host.querySelector('.panel[data-project-next], [data-project-next-panel]'));
  ok("the index/focus composition follows the banner directly",
     band.nextElementSibling === layout);
  ok("the composition contains one rail and one focus specimen",
     !!layout.querySelector('.project-index-rail') && !!layout.querySelector('[data-project-focus="1"]'));
}

console.log("\n--- it is a compact immediate queue, not a second project list ---");
{
  const h = harness();
  ok("only three immediate projects are shown", h.buttons().length === 3, `${h.buttons().length} shown`);
  ok("overdue comes first, then nearest dated stages",
     JSON.stringify(h.buttonTitles()) === JSON.stringify(["Overdue", "Soon", "Later"]),
     `got ${JSON.stringify(h.buttonTitles())}`);
  ok("summary still reports the full active queue",
     h.next().querySelector(".num").textContent === "1 overdue · 5 active",
     h.next().querySelector(".num").textContent);
  ok("completed projects are omitted", !h.buttonTitles().includes("Complete"));
  ok("projects without milestones are omitted", !h.buttonTitles().includes("No milestones"));
}

console.log("\n--- ordinary redraws keep the compact controls ---");
{
  const h = harness();
  const before = h.buttons();
  h.draw();
  const after = h.buttons();
  ok("a redraw reuses every shown Next up control",
     before.length === after.length && after.every((b, i) => b === before[i]));

  h.store.setField(h.ids.soon, "title", "Soon renamed");
  h.draw();
  ok("a title edit updates the kept control", h.buttonTitles().includes("Soon renamed"));
  ok("...without replacing that control",
     h.buttons().some(b => b === before.find(x => x.dataset.id === h.ids.soon)));
}

console.log("\n--- the rail is the complete project-finding surface ---");
{
  const h = harness();
  ok("the rail calls itself All projects",
     h.host.querySelector(".project-index-head .lbl")?.textContent === "All projects");
  ok("the project count moved into the rail header",
     h.host.querySelector(".project-index-count")?.textContent === "7");
  ok("all projects remain visible without a search/filter layer",
     h.host.querySelectorAll(".project-index-list [data-project-index-item]").length === 7);
}

console.log("\n--- compact controls still open projects ---");
{
  const h = harness();
  const first = h.buttons()[0];
  const id = first.dataset.id;
  first.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  ok("clicking a Next up control still enters that project", h.viewLocal.projectId === id);
}

console.log("\n--- no archive-walk regression ---");
{
  const h = harness();
  let walks = 0;
  const realAll = h.store.all.bind(h.store);
  h.store.all = () => { walks++; return realAll(); };
  h.draw();
  h.store.all = realAll;
  ok("the overview still avoids one archive pass per project",
     walks <= 3, `walked archive ${walks} times`);
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
