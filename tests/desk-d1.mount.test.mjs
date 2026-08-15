// Mount timing: the desk must size and scroll itself IN THE SAME TASK that
// attaches it, not one animation frame later.
//
// This is the regression test for the typing flicker (§14.24). The desk used
// to restore its scroll position inside requestAnimationFrame, so the browser
// painted one frame of the surface's top-left corner before the restore
// landed. The editor saves on every keystroke, every save rebuilds the page,
// and so every character you typed flashed the corner of an empty desk.
//
// jsdom has no layout and cannot see a flash — but it CAN see the thing that
// caused it, which is WHEN the restore runs. requestAnimationFrame in jsdom
// fires on a timer, so anything that has happened by the time render() returns
// happened synchronously. That is exactly the property we need to hold.
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { pretendToBeVisual: true, url: 'https://ladyandra.github.io/dash/' });
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver','requestAnimationFrame','getComputedStyle','CustomEvent','Event','PointerEvent'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
let FINE = true, WIDTH = 1440;
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine') ? FINE : false, addEventListener(){}, removeEventListener(){} });
Object.defineProperty(dom.window, 'innerWidth', { get: () => WIDTH, configurable: true });

const { Store } = await import('../js/store.js');
const { renderProjectPage } = await import('../js/views/desk.js');
const { projectView } = await import('../js/views/project.js');

let fail = 0, n = 0;
const ok = (name, c, extra="") => { n++; if(!c) fail++; console.log((c?"PASS  ":"FAIL  ")+name+(c?"":"\n      "+extra)); };

const store = new Store();
const pid = store.createItem({ title: "Dash", type: "project" });
const ids = ["Reply to the studio","Rail sketches"].map(t => store.createItem({ title: t }));
for (const id of ids) store.assignToProject(id, pid);
store.placeOnDesk(ids[0], pid, { x: 120, y: 90 }, 1);

const baseCtx = { store, selection: { active:false }, onOpen(){}, rerender(){}, sync:null, holdRenders: () => () => {} };
const actions = { onBack(){}, onEdit(){}, onNew(){}, onAdd(){} };

console.log("\n--- the hook exists ---");
let ctx = { ...baseCtx, viewLocal: {} };
const page = renderProjectPage(store, store.get(pid), ctx, actions);
ok("the desk page hands out a mount hook", typeof page._deskMount === "function");
ok("...and has not run it yet, because it isn't attached", ctx.viewLocal.desk.scrollX === null);
document.getElementById('host').appendChild(page);
page._deskMount();
ok("calling it settles the scroll position", ctx.viewLocal.desk.scrollX !== null);
ok("...and it is idempotent — a second call cannot undo the first", (() => {
  ctx.viewLocal.desk.scrollX = 640;
  page._deskMount();
  return ctx.viewLocal.desk.scrollX === 640;
})());

console.log("\n--- project.js calls it, synchronously ---");
// THE ACTUAL REGRESSION. If a future edit drops the _deskMount call from
// projectView.render, or defers it to a frame, this is what goes red.
const host = document.getElementById('host');
host.innerHTML = "";
ctx = { ...baseCtx, viewLocal: { projectId: pid } };
projectView.render(null, ctx, host);
ok("the desk is on the page", !!host.querySelector('.desk-surface'));
ok("its scroll was restored before render() returned", ctx.viewLocal.desk.scrollX !== null,
   "still null — the mount hook ran late (or not at all), which is the corner-flash");

console.log("\n--- the phone has no desk to mount ---");
FINE = false; WIDTH = 390;
const phone = renderProjectPage(store, store.get(pid), { ...baseCtx, viewLocal: {} }, actions);
ok("no mount hook on the Peek page", !phone._deskMount);
// and project.js must not fall over calling a hook that isn't there
host.innerHTML = "";
let threw = null;
try { projectView.render(null, { ...baseCtx, viewLocal: { projectId: pid } }, host); }
catch (e) { threw = e; }
ok("rendering the phone page doesn't throw", threw === null, String(threw));

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
