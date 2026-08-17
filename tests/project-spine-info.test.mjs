// Projects overview: August 17 balanced colour index rail.
//
// The old filename is retained so Check Dash replaces the rollback-era test
// instead of leaving a stale test behind. This now guards the chosen design:
// colour-rich registry on the left, quiet focus specimen on the right, tiny
// technical metadata, and overdue/no-milestone states expressed by grammar.
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

function dayOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const store = new Store();
const activeId = store.createItem({ title: "Dash", type: "project" });
store.addMilestone(activeId, { label: "Research", date: dayOffset(-1) });
for (let i = 0; i < 4; i++) {
  const id = store.createItem({ title: `Item ${i}` });
  store.assignToProject(id, activeId);
}
const quietId = store.createItem({ title: "Quiet project", type: "project" });

const viewLocal = {};
const host = document.getElementById("host");
const ctx = {
  store, viewLocal, selection: { active: false }, onOpen(){}, sync: null,
  holdRenders: () => () => {},
  rerender: () => draw(),
};
const draw = () => projectView.render(null, ctx, host);
draw();

console.log("\n--- the chosen index-rail composition is present ---");
{
  const layout = host.querySelector(".project-index-layout");
  const rows = [...host.querySelectorAll("[data-project-index-item]")];
  ok("one index/focus composition exists", !!layout);
  ok("the left registry has one row per project", rows.length === 2);
  ok("each registry row carries project colour as a filled ground",
     rows.every(row => (row.getAttribute("style") || "").includes("background:")));
  ok("rail rows intentionally show only catalogue number, title and overdue datum",
     rows.every(row =>
       !!row.querySelector(".project-index-no") &&
       !!row.querySelector(".project-index-title") &&
       !!row.querySelector(".project-index-overdue") &&
       !!row.querySelector(".project-index-pointer") &&
       !row.querySelector(".spine-stage, .spine-count, .spine-meta, .project-index-stage, .project-index-count")));
  ok("literal shelf/spine objects are gone from the overview",
     !host.querySelector(".project-shelf, .spine, .project-slat"));
}

console.log("\n--- overdue is an integrated datum, not a badge ---");
{
  const activeRow = host.querySelector(`.project-index-list [data-id="${activeId}"]`);
  const flag = activeRow.querySelector(".project-index-overdue");
  ok("overdue project exposes the slim overdue datum", flag.hidden === false);
  ok("there is no visible Late/Overdue badge on the rail",
     !activeRow.textContent.toLowerCase().includes("late") &&
     !activeRow.textContent.toLowerCase().includes("overdue"));
  ok("the accessible label still says the truth",
     activeRow.getAttribute("aria-label").toLowerCase().includes("overdue"));
}

console.log("\n--- the focus specimen carries identity, then tiny metadata ---");
{
  ok("the focused title is large-specimen content",
     host.querySelector(".project-focus-title")?.textContent === "Dash");
  const meta = host.querySelector(".project-focus-meta").textContent;
  ok("stage, due date and entry count live in the technical zone",
     meta.includes("Stage") && meta.includes("Research") && meta.includes("Next due") && meta.includes("Entries") && meta.includes("4"));
  ok("entry count is not repeated on the colour rail",
     !host.querySelector(`.project-index-list [data-id="${activeId}"]`).textContent.includes("4 entries"));
  ok("the title doorway carries the datum rule and notch",
     !!host.querySelector(".project-focus-datum .project-focus-datum-notch"));
  ok("the specimen includes a quiet position reference",
     host.querySelector(".project-focus-position")?.textContent === "01 / 02");
}

console.log("\n--- no milestones read as absence, not filler text ---");
{
  const quietRow = host.querySelector(`.project-index-list [data-id="${quietId}"]`);
  quietRow.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  ok("quiet project becomes the focus specimen", host.querySelector(".project-focus-title")?.textContent === "Quiet project");
  const meta = host.querySelector(".project-focus-meta").textContent;
  ok("stage and due rows are omitted", !meta.includes("Stage") && !meta.includes("Next due"));
  ok("no explanatory placeholder is inserted",
     !host.querySelector(".project-focus-specimen").textContent.toLowerCase().includes("no milestone"));
  ok("ordinary project facts can remain", meta.includes("Entries"));
}

console.log("\n--- Next up and the full-bleed Projects banner are preserved ---");
{
  const next = host.querySelector('[data-project-next="1"]');
  ok("Next up still exists", !!next);
  ok("Next up is inside the dark Projects band",
     host.querySelector(".project-picker-band")?.contains(next));
}

console.log("\n--- the scoped Projects stylesheet carries the hierarchy contract ---");
{
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../css/projects.css", import.meta.url), "utf8");
  const tokens = fs.readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");
  ok("index.html loads projects.css after the shared app stylesheet",
     html.indexOf('href="css/projects.css"') > html.indexOf('href="css/app.css"'));
  ok("selected project styling does not draw a persistent highlight",
     /\.project-index-item\[aria-pressed="true"\][\s\S]*?box-shadow:\s*none;/.test(css));
  ok("the selector pointer uses Dash ink rather than the project's colour",
     /\.project-index-pointer[\s\S]*?border-left:[^;]*var\(--text-primary\)/.test(css));
  ok("the rail owns vertical overflow for larger project collections",
     /\.project-index-rail[\s\S]*?overflow-y:\s*auto;/.test(css));
  ok("title, datum and metadata share one shortened specimen measure",
     css.includes("--project-specimen-measure") &&
     /project-focus-title-button[\s\S]*?width:\s*var\(--project-specimen-measure\)/.test(css) &&
     /project-focus-meta[\s\S]*?width:\s*var\(--project-specimen-measure\)/.test(css));
  ok("the datum notch is registered to the metadata label/value division",
     /project-focus-datum-notch[\s\S]*?left:\s*var\(--project-meta-label-w\)/.test(css) &&
     /project-focus-meta[\s\S]*?grid-template-columns:\s*var\(--project-meta-label-w\)/.test(css));
  ok("Open desk is registered to the far end of the datum",
     /project-focus-enter[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*0;/.test(css));
  ok("Canyon is requested only from a locally installed copy",
     tokens.includes('local("BN Canyon")') && tokens.includes('local("BNCanyonRegular")') &&
     !/@font-face[\s\S]*?url\(/.test(tokens));
  ok("the display token falls back to Dash's existing reading serif",
     /--font-display:[^;]*Dash Canyon Local[^;]*Iowan Old Style/.test(tokens));
  ok("project identity uses the display token while body typography stays separate",
     /project-index-title[\s\S]*?font-family:\s*var\(--font-display\)/.test(css) &&
     /project-focus-title[\s\S]*?font-family:\s*var\(--font-display\)/.test(css));
  ok("the Projects band is the compact one-row ledger",
     /project-picker-band[\s\S]*?flex-direction:\s*row;/.test(css));
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
