// Render smoke test: does the desk actually build a DOM, on a "Mac" and on a
// "phone", and do the drag/place/un-place paths write the ops they claim to?
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { pretendToBeVisual: true, url: 'https://ladyandra.github.io/dash/' });
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver','requestAnimationFrame','getComputedStyle','CustomEvent','Event','PointerEvent'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
let FINE = true, WIDTH = 1440;
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine') ? FINE : false, addEventListener(){}, removeEventListener(){} });
Object.defineProperty(dom.window, 'innerWidth', { get: () => WIDTH, configurable: true });

const { Store, PROJECT_LINK } = await import('../js/store.js');
const { renderProjectPage, supportsDesk } = await import('../js/views/desk.js');
const D = await import('../js/desk.js');

let fail = 0, n = 0;
const ok = (name, c, extra="") => { n++; if(!c) fail++; console.log((c?"PASS  ":"FAIL  ")+name+(c?"":"\n      "+extra)); };

const store = new Store();
const pid = store.createItem({ title: "Dash", type: "project" });
store.addMilestone(pid, { label: "Research branding", date: "2026-09-01" });
const ids = ["Reply to the studio","Rail sketches","Ship the panel layout"].map(t => store.createItem({ title: t, body: "Body text." }));
for (const id of ids) store.assignToProject(id, pid);
store.placeOnDesk(ids[0], pid, { x: 120, y: 90 }, 1);

const ctx = { store, viewLocal: {}, selection: { active:false }, onOpen(){}, rerender(){}, sync:null };
const actions = { onBack(){}, onEdit(){}, onNew(){}, onAdd(){} };

console.log("\n--- Mac ---");
ok("the gate opens on a wide, precise-pointer device", supportsDesk() === true);
let page = renderProjectPage(store, store.get(pid), ctx, actions);
document.getElementById('host').appendChild(page);
ok("the banner is the ledger band", !!page.querySelector('.pb-a .pb-name'));
ok("the project name is on it", page.querySelector('.pb-name').textContent === "Dash");
ok("the facts line has cells", page.querySelectorAll('.pb-line > *').length >= 3);
ok("the progress fraction is there", !!page.querySelector('.pb-f-count'));
ok("three drawer handles", page.querySelectorAll('.desk-handle').length === 3);
// REGRESSION (first deploy): the drawer body must stay inside the handle row.
// Moved out, its `top: 100%` resolves against the whole page and it opens a
// viewport height below the fold — indistinguishable from "drawers don't open".
ok("the drawer hangs off the handle row, not the page",
   page.querySelector('.desk-drawer').parentElement.classList.contains('desk-handles'));
ok("the desk surface exists", !!page.querySelector('.desk-surface'));
ok("the mat is drawn and inert", page.querySelectorAll('.desk-mat path').length > 20);
ok("one placed card is on the desk", page.querySelectorAll('.dcard').length === 1);
ok("...positioned where the record says", page.querySelector('.dcard').style.left === "120px");
ok("...with a derived wobble", /rotate/.test(page.querySelector('.dcard').style.transform) || page.querySelector('.dcard').style.getPropertyValue('--rot') !== "");
ok("the unplaced count is right", page.querySelector('.desk-handle').textContent.includes("2"));

console.log("\n--- the drawers ---");
const handles = [...page.querySelectorAll('.desk-handle')];
handles[0].dispatchEvent(new dom.window.Event('click', { bubbles: true }));
ok("opening Unplaced mounts its contents", page.querySelectorAll('.desk-unplaced-row').length === 2);
ok("...and marks itself open", handles[0].getAttribute('aria-expanded') === "true");
handles[1].dispatchEvent(new dom.window.Event('click', { bubbles: true }));
ok("Filed shows every member, placed or not", page.querySelectorAll('.desk-drawer .item-row').length === 3);
ok("...and only one drawer is open at a time", handles[0].getAttribute('aria-expanded') === "false");
handles[2].dispatchEvent(new dom.window.Event('click', { bubbles: true }));
ok("Milestones mounts the real editor", !!page.querySelector('.desk-drawer .ms-row'));

console.log("\n--- the writes ---");
store.placeOnDesk(ids[1], pid, { x: 400, y: 300 }, 2);
let data = D.deskData(store.all(), pid, PROJECT_LINK);
ok("placing a second card lands it", data.placed.length === 2 && data.unplaced.length === 1);
store.setDeskField(ids[1], pid, "pos", D.clampPos({ x: 99999, y: 50 }, 300, 150));
ok("a shove past the edge is clamped in the MODEL", store.deskRecord(ids[1], pid).pos.x === D.DESK_W - D.ORIGIN - 300);
store.unplaceFromDesk(ids[1], pid);
data = D.deskData(store.all(), pid, PROJECT_LINK);
ok("un-placing returns it to the tray", data.placed.length === 1 && data.unplaced.length === 2);
ok("...keeping its position for the way back", store.deskRecordRaw(ids[1], pid).pos.y === 50);

console.log("\n--- phone ---");
FINE = false; WIDTH = 390;
ok("the gate closes on a coarse pointer", supportsDesk() === false);
const phone = renderProjectPage(store, store.get(pid), { ...ctx, viewLocal: {} }, actions);
ok("no desk on the phone", !phone.querySelector('.desk-surface'));
ok("no unplaced shelf either — nothing to be unplaced from", !phone.querySelector('.desk-unplaced'));
ok("Peek content is the page", phone.querySelectorAll('.peek-page .item-row').length === 3);
ok("milestones stay a section", !!phone.querySelector('.peek-page .ms-row'));
ok("the banner is still there", !!phone.querySelector('.pb-name'));

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
