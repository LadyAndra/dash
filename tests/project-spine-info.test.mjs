// The Projects shelf's larger, information-bearing book spines.
//
// jsdom cannot judge whether a book LOOKS large enough. This test guards the
// structural promises behind that visual pass: title, derived stage, entry
// count, catalogue number, explicit late marker, and DOM identity on redraw.
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: "https://x.test/",
});
for (const k of ["window","document","Node","Element","HTMLElement","SVGElement",
                 "MutationObserver","requestAnimationFrame","getComputedStyle","Event"])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator, configurable: true,
});
dom.window.matchMedia = (q) => ({
  matches: q.includes("pointer: fine"),
  addEventListener(){}, removeEventListener(){},
});

const { Store } = await import("../js/store.js");
const { projectView } = await import("../js/views/project.js");

let fail = 0, n = 0;
const ok = (name, cond, extra = "") => {
  n++;
  if (!cond) fail++;
  console.log((cond ? "PASS  " : "FAIL  ") + name + (cond ? "" : "\n      " + extra));
};

const store = new Store();

function makeProject(title, count = 0) {
  const pid = store.createItem({ title, type: "project" });
  for (let i = 0; i < count; i++) {
    const id = store.createItem({ title: `${title} ${i}` });
    store.assignToProject(id, pid);
  }
  return pid;
}

const activeId = makeProject("Active project", 4);
const activeMid = store.addMilestone(activeId, { label: "Research", date: null });

const lateId = makeProject("Late project", 2);
store.addMilestone(lateId, { label: "Launch", date: "2000-01-01" });

const plainId = makeProject("Plain project", 0);

const doneId = makeProject("Done project", 1);
const doneMid = store.addMilestone(doneId, { label: "Finish", date: "2000-01-01" });
store.setMilestoneField(doneId, doneMid, "done", new Date().toISOString());

const viewLocal = {};
const host = document.getElementById("host");
const ctx = {
  store, viewLocal, selection: { active: false }, onOpen(){}, sync: null,
  holdRenders: () => () => {},
  rerender: () => draw(),
};
const draw = () => projectView.render(null, ctx, host);
draw();

const spine = (id) => host.querySelector(`.spine[data-id="${id}"]`);

console.log("\n--- every book carries useful shelf information ---");
{
  const s = spine(activeId);
  ok("book has a separate copy area", !!s.querySelector(".spine-copy"));
  ok("project title is present", s.querySelector(".spine-title").textContent === "Active project");
  ok("current stage is visible", s.querySelector(".spine-stage").textContent === "Research");
  ok("entry count is visible", s.querySelector(".spine-count").textContent === "4 entries");
  ok("catalogue number is still present", /^№ \d+/.test(s.querySelector(".spine-no").textContent));
  ok("book has the new readable width floor",
     s.getAttribute("style").includes("min-width:calc(var(--tap-min) + var(--space-5))"));
  ok("title uses the larger existing type token",
     s.querySelector(".spine-title").getAttribute("style").includes("var(--text-lg)"));
}

console.log("\n--- milestone states read plainly on the shelf ---");
{
  ok("a project with no milestones says No stage",
     spine(plainId).querySelector(".spine-stage").textContent === "No stage");
  ok("a completed pipeline says Complete",
     spine(doneId).querySelector(".spine-stage").textContent === "Complete");
  ok("an overdue project gets an explicit Late marker",
     spine(lateId).querySelector(".spine-late")?.textContent === "Late");
  ok("an ordinary active project has no Late marker",
     !spine(activeId).querySelector(".spine-late"));
}

console.log("\n--- richer books still reconcile in place ---");
{
  const before = spine(activeId);
  store.setMilestoneField(activeId, activeMid, "label", "Prototype");
  const extra = store.createItem({ title: "One more entry" });
  store.assignToProject(extra, activeId);
  draw();

  const after = spine(activeId);
  ok("the same book element survives the redraw", after === before);
  ok("stage updates in place", after.querySelector(".spine-stage").textContent === "Prototype");
  ok("entry count updates in place", after.querySelector(".spine-count").textContent === "5 entries");

  store.setMilestoneField(activeId, activeMid, "done", new Date().toISOString());
  draw();
  ok("finishing the milestone changes the same book to Complete",
     spine(activeId) === before &&
     spine(activeId).querySelector(".spine-stage").textContent === "Complete");
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
