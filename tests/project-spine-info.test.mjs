// Projects overview — editorial slats.
import { JSDOM } from "jsdom";
import fs from "node:fs";

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

const slat = (id) => host.querySelector(`.project-slat[data-id="${id}"]`);

console.log("\n--- each project is one restrained typographic specimen ---");
{
  const s = slat(activeId);
  ok("the stable spine node also carries the editorial-slat class",
     s?.classList.contains("spine") && s.classList.contains("project-slat"));
  ok("project title is present once",
     s.querySelectorAll(".spine-title").length === 1 &&
     s.querySelector(".spine-title").textContent === "Active project");
  ok("current stage is one optional caption",
     s.querySelectorAll(".spine-stage").length === 1 &&
     s.querySelector(".spine-stage").textContent === "Research" &&
     !s.querySelector(".spine-stage").hidden);
  ok("footer contains only count + catalogue number",
     s.querySelectorAll(".spine-meta > *").length === 2 &&
     s.querySelector(".spine-count").textContent === "4 entries" &&
     /^№ \d+/.test(s.querySelector(".spine-no").textContent));
}

console.log("\n--- absence stays empty; overdue is a datum, not another label ---");
{
  const plain = slat(plainId);
  ok("a project with no milestones prints no filler stage",
     plain.querySelector(".spine-stage").hidden &&
     plain.querySelector(".spine-stage").textContent === "" &&
     !plain.textContent.includes("No stage"));

  ok("a completed pipeline still says Complete because that is real state",
     slat(doneId).querySelector(".spine-stage").textContent === "Complete" &&
     !slat(doneId).querySelector(".spine-stage").hidden);

  const late = slat(lateId);
  ok("overdue is carried by the slat class",
     late.classList.contains("is-overdue"));
  ok("there is no Late badge or Late filler text",
     !late.querySelector(".spine-late") &&
     ![...late.querySelectorAll("*")].some(n => n.textContent === "Late"));
}

console.log("\n--- the hierarchy is encoded in the scoped stylesheet ---");
{
  const css = fs.readFileSync(new URL("../css/projects.css", import.meta.url), "utf8");
  ok("title uses the large existing type token",
     /\.spine-title[\s\S]*font-size:\s*var\(--text-xl\)/.test(css));
  ok("shelf gains deliberate breathing room",
     /\.project-shelf\s*\{[\s\S]*gap:\s*var\(--space-4\)/.test(css));
  ok("slats have a broader token-based minimum",
     /min-width:\s*calc\(var\(--tap-min\) \+ var\(--space-6\)\)/.test(css));
  ok("overdue is a top-edge ember rule",
     /\.is-overdue[\s\S]*border-top-color:\s*var\(--ember\)/.test(css));
  ok("hover lift contains no rotation",
     /\.project-slat:hover[\s\S]*translateY/.test(css) &&
     !/\.project-slat:hover[\s\S]{0,180}rotate/.test(css));
}

console.log("\n--- data changes still update the same slat in place ---");
{
  const before = slat(activeId);
  store.setMilestoneField(activeId, activeMid, "label", "Prototype");
  const extra = store.createItem({ title: "One more entry" });
  store.assignToProject(extra, activeId);
  draw();

  const after = slat(activeId);
  ok("the same element survives the redraw", after === before);
  ok("stage updates in place", after.querySelector(".spine-stage").textContent === "Prototype");
  ok("entry count updates in place", after.querySelector(".spine-count").textContent === "5 entries");
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
