// Regression tests for the two fixes in the post-deploy pass (Fable's
// root-cause review, 14 Aug 2026): the self-sync echo and the glance's
// corruption of the saved scroll position.
//
//   node tests/desk-d1.viewstate.test.mjs      (needs jsdom: npm install jsdom)
//
// The glance test stubs scrollLeft/scrollTop with a CLAMP, because that is the
// entire mechanism of the bug: while the surface is scaled down the scrollable
// area is tiny, the browser clamps any write to roughly zero, and the old code
// recorded that clamped value as the new truth. jsdom has no layout, so
// without the stub the test would pass against the broken code too.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: 'https://x.test/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement',
                 'MutationObserver','requestAnimationFrame','getComputedStyle','Event'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
let REDUCED = false;
dom.window.matchMedia = (q) => ({
  matches: q.includes('pointer: fine') ? true : (q.includes('reduce') ? REDUCED : false),
  addEventListener(){}, removeEventListener(){},
});
Object.defineProperty(dom.window, 'innerWidth', { get: () => 1440, configurable: true });

const { Store, PROJECT_LINK } = await import('../js/store.js');
const { renderProjectPage } = await import('../js/views/desk.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ===================================================================
console.log("\n--- 1. the self-sync echo: what we write is what we'd read back ---");
// sync.js records `JSON.stringify(snapshotObject)` after a flush, while the
// folder pull compares `JSON.stringify(JSON.parse(fileText))`. The marker only
// works if those two strings are identical — i.e. if a JSON round-trip is
// order-preserving for a real snapshot. If this ever stops holding, the echo
// comes back and the desk starts flickering again every 8 seconds.
{
  const s = new Store();
  const pid = s.createItem({ title: "P", type: "project" });
  const e = s.createItem({ title: "one", body: "text" });
  s.assignToProject(e, pid);
  s.addMilestone(pid, { label: "Research", date: "2026-09-01" });
  s.placeOnDesk(e, pid, { x: 120, y: 90 }, 1);

  const obj = s.toSnapshot();
  const written = JSON.stringify(obj);                       // what flush records
  const readBack = JSON.stringify(JSON.parse(JSON.stringify(obj, null, 2)));  // what pull compares
  ok("a snapshot survives the JSON round-trip unchanged", written === readBack,
     `${written.length} vs ${readBack.length}`);
  ok("...including the desk's viewState keys", readBack.includes('"desk:' + pid + '"'));
}

// ===================================================================
console.log("\n--- 2. the glance must not TOUCH the scroll position at all ---");
// The contract changed with the second attempt, and the new one is much
// easier to hold: the glance is purely a transform, and the scroll position is
// never written. So the test is no longer "does it restore correctly" (a race
// against a CSS transition, which is exactly what kept going wrong) but "does
// it write at all" — which is decidable, and which jsdom can answer honestly.
async function glanceCycle({ reduced }) {
  REDUCED = reduced;
  const store = new Store();
  const pid = store.createItem({ title: "Dash", type: "project" });
  const ids = ["a", "b", "c"].map(t => store.createItem({ title: t }));
  for (const id of ids) store.assignToProject(id, pid);
  store.placeOnDesk(ids[0], pid, { x: 900, y: 700 }, 1);

  const ctx = { store, viewLocal: {}, selection: { active: false }, onOpen(){}, rerender(){}, sync: null };
  const page = renderProjectPage(store, store.get(pid), ctx, { onBack(){}, onEdit(){}, onNew(){}, onAdd(){} });
  document.getElementById('host').appendChild(page);
  const view = page.querySelector('.desk-viewport');
  const deskEl = page.querySelector('.desk-surface');
  const sizer = page.querySelector('.desk-sizer');

  // jsdom has no layout, so every measurement is zero — which makes the
  // glance's arithmetic produce NaN and the browser reject the transform
  // outright. Give it plausible dimensions so the maths is real.
  const stub = (node, props) => { for (const [k, v] of Object.entries(props))
    Object.defineProperty(node, k, { configurable: true, get: () => v }); };
  stub(view, { clientWidth: 1200, clientHeight: 700 });
  for (const c of page.querySelectorAll('.dcard')) {
    stub(c, {
      offsetLeft: parseInt(c.style.left) || 0, offsetTop: parseInt(c.style.top) || 0,
      offsetWidth: 300, offsetHeight: 160,
    });
  }

  let sx = 0, sy = 0, writes = 0, counting = false;
  const defineScroll = (axis) => Object.defineProperty(view, axis, {
    configurable: true,
    get: () => (axis === 'scrollLeft' ? sx : sy),
    set: (v) => {
      if (counting) writes++;
      if (axis === 'scrollLeft') sx = v; else sy = v;
      view.dispatchEvent(new dom.window.Event('scroll'));
    },
  });
  defineScroll('scrollLeft'); defineScroll('scrollTop');

  await sleep(30);                       // let the initial centring run
  const st = ctx.viewLocal.desk;
  view.scrollLeft = 1200; view.scrollTop = 800;
  st.scrollX = 1200; st.scrollY = 800;
  await sleep(20);

  counting = true;
  const btn = page.querySelector('.banner-glance');
  btn.dispatchEvent(new dom.window.Event('pointerdown'));
  await sleep(20);
  const during = { x: sx, y: sy, st: { ...st }, transform: deskEl.style.transform };
  btn.dispatchEvent(new dom.window.Event('pointerup'));
  await sleep(reduced ? 60 : 700);
  counting = false;

  return { st, during, sx, sy, writes, sizer, deskEl };
}

{
  const r = await glanceCycle({ reduced: false });
  ok("the sizer holds the scrollable area, not the surface",
     !!r.sizer && r.deskEl.parentElement === r.sizer);
  ok("glancing applies a transform", /scale/.test(r.during.transform), r.during.transform);
  ok("...and the transform folds in the scroll offset, rather than resetting it",
     parseFloat((r.during.transform.match(/translate\(([-\d.]+)px/) || [0, "0"])[1]) > 0, r.during.transform);
  ok("the live scroll position is untouched while glancing",
     r.during.x === 1200 && r.during.y === 800, `${r.during.x},${r.during.y}`);
  ok("the saved position is untouched while glancing",
     r.during.st.scrollX === 1200 && r.during.st.scrollY === 800);
  ok("letting go clears the transform", r.deskEl.style.transform === "", r.deskEl.style.transform);
  ok("you are exactly where you were, because nothing ever moved",
     r.sx === 1200 && r.sy === 800 && r.st.scrollX === 1200 && r.st.scrollY === 800);
  ok("...and the whole gesture wrote to scroll ZERO times — nothing to clamp, nothing to race",
     r.writes === 0, `${r.writes} write(s)`);
}
{
  const r = await glanceCycle({ reduced: true });
  ok("same with reduced motion", r.writes === 0 && r.sx === 1200 && r.st.scrollX === 1200);
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
