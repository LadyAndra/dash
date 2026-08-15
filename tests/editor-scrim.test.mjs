// The editor must not close when you drag to select text and let go outside it.
//
// The browser fires `click` on the nearest common ancestor of pointerdown and
// pointerup. Start a selection inside the modal, release a few pixels past its
// edge, and that ancestor is the scrim — so the backdrop handler saw a clean
// "you clicked the backdrop" and shut the editor mid-select.
//
// jsdom does not compute that ancestor for us, so the test dispatches the two
// halves of the gesture the way a real browser would deliver them: the
// pointerdown on the element actually under the pointer, and the click on the
// common ancestor.
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'https://ladyandra.github.io/dash/' });
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver','requestAnimationFrame','getComputedStyle','CustomEvent','Event','PointerEvent','MouseEvent','FileReader','Blob','URL'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

const { Store } = await import('../js/store.js');
const { openEditor } = await import('../js/editor.js');

let fail = 0, n = 0;
const ok = (name, c, extra="") => { n++; if(!c) fail++; console.log((c?"PASS  ":"FAIL  ")+name+(c?"":"\n      "+extra)); };

const store = new Store();
const id = store.createItem({ title: "Rail sketches", body: "Some body text to select." });

const fire = (node, type) => node.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }));
const openOne = () => {
  openEditor(store, id, {});
  const scrims = document.querySelectorAll('.modal-scrim');
  const scrim = scrims[scrims.length - 1];
  return { scrim, modal: scrim.querySelector('.modal') };
};

// close() is async (it saves the sketch pad on the way out), so the scrim is
// removed a tick after the click rather than during it. Every assertion below
// waits for that tick — otherwise "still open" would pass for the wrong reason.
const settle = () => new Promise(r => setTimeout(r, 0));

console.log("\n--- a selection drag out of the modal ---");
let { scrim, modal } = openOne();
const field = modal.querySelector('input, textarea');
ok("the editor opened with something to select", !!field);
fire(field, 'pointerdown');            // the drag STARTS on the text
fire(scrim, 'click');                  // ...and the click lands on the ancestor
await settle();
ok("the editor is still open", scrim.isConnected,
   "closed on a text-selection drag — this is the bug");

console.log("\n--- a real backdrop click ---");
fire(scrim, 'pointerdown');            // both ends of the gesture are the scrim
fire(scrim, 'click');
await settle();
ok("clicking the backdrop still closes the editor", !scrim.isConnected);

console.log("\n--- and it stays honest a second time ---");
({ scrim, modal } = openOne());
fire(modal, 'pointerdown');
fire(scrim, 'click');
await settle();
ok("a fresh editor isn't closed by a drag either", scrim.isConnected);
fire(scrim, 'pointerdown');
fire(scrim, 'click');
await settle();
ok("...and still closes on a genuine backdrop click", !scrim.isConnected);

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
