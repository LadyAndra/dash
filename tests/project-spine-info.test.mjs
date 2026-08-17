// Projects overview baseline after the August 16 visual rollback.
//
// Keeps the useful overview behavior while explicitly rejecting the experimental
// book/slat markup that was not visually successful.
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
const pid = store.createItem({ title: "Dash", type: "project" });
const mid = store.addMilestone(pid, { label: "Research", date: null });
for (let i = 0; i < 4; i++) {
  const id = store.createItem({ title: `Item ${i}` });
  store.assignToProject(id, pid);
}

const viewLocal = {};
const host = document.getElementById("host");
const ctx = {
  store, viewLocal, selection: { active: false }, onOpen(){}, sync: null,
  holdRenders: () => () => {},
  rerender: () => draw(),
};
const draw = () => projectView.render(null, ctx, host);
draw();

console.log("\n--- baseline overview is restored ---");
{
  const spine = host.querySelector(".project-shelf .spine");
  ok("shelf spine exists", !!spine);
  ok("experimental project-slat class is gone", !spine.classList.contains("project-slat"));
  ok("slat-only stage/footer structure is gone",
     !spine.querySelector(".spine-stage") &&
     !spine.querySelector(".spine-count") &&
     !spine.querySelector(".spine-meta"));
  ok("title and catalogue number remain",
     spine.querySelector(".spine-title")?.textContent === "Dash" &&
     /^№ \d+/.test(spine.querySelector(".spine-no")?.textContent || ""));
}

console.log("\n--- Next up remains in the banner ---");
{
  const next = host.querySelector('[data-project-next="1"]');
  ok("Next up still exists", !!next);
  ok("Next up is inside the dark Projects band",
     host.querySelector(".project-picker-band")?.contains(next));
}

console.log("\n--- experimental stylesheet is no longer loaded ---");
{
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  ok("index.html does not load projects.css",
     !html.includes('href="css/projects.css"'));
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
