// October 5, 2026: an iPad gets the "desktop only" screen too.
//
//   node tests/ipad-desktop-only.test.mjs      (needs jsdom)
//
// The twin of tests/round1-desktop-only.test.mjs (a phone-sized window). Boots
// the REAL js/app.js under an iPad-shaped window: coarse pointer, 820 x 1180,
// far above any "phone" size. It must get the same plain screen with nothing to
// tap, because the gate is the pointer, not the screen size. Two files because
// app.js boots once per process.
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';

const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toasts"></div></body>', {
  pretendToBeVisual: true, url: 'https://ladyandra.github.io/dash/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver',
                 'requestAnimationFrame','getComputedStyle','Event','KeyboardEvent','MouseEvent',
                 'CustomEvent','Blob','URL','FileReader'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(dom.window, 'innerWidth', { value: 820 });
Object.defineProperty(dom.window, 'innerHeight', { value: 1180 });
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: coarse'), addEventListener(){}, removeEventListener(){} });
// A do-nothing IndexedDB: an empty local cache, so boot runs to the end.
globalThis.indexedDB = fakeIndexedDB();
process.on('unhandledRejection', () => {});

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };

await import('../js/app.js');
await new Promise(r => setTimeout(r, 200));

console.log("\n--- an iPad-sized screen (820 x 1180, coarse pointer) ---");
const host = document.getElementById('view-host');
ok("the iPad sees the desktop-only message", /Dash is desktop only\./.test(host.textContent) && /Open it on your Mac\./.test(host.textContent),
   host.textContent.slice(0, 200));
ok("...and NOT the old capture screen", !host.querySelector('.pcap') && !/Sketch/.test(host.textContent));
ok("...with nothing to tap inside it", host.querySelectorAll('button, a, input, textarea, select, [tabindex]').length === 0);
ok("the <html> carries the class that hides the app chrome", document.documentElement.classList.contains('desktop-only-on'));
ok("...and not the retired capture class", !document.documentElement.classList.contains('phone-capture-on'));

const css = readFileSync(new URL('../css/desktop-only.css', import.meta.url), 'utf8');
ok("css/desktop-only.css hides the topbar under that class", /\.desktop-only-on \.topbar/.test(css));
ok("...and uses tokens, never literal colours", !/#[0-9a-f]{3,8}\b|rgb\(/i.test(css));

console.log(`\n${fail ? `${fail} of ${n} desktop-only checks FAILED` : `all ${n} desktop-only checks passed`}`);
process.exit(fail ? 1 : 0);

function fakeIndexedDB() {
  const req = (result) => {
    const r = { result, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => r.onsuccess && r.onsuccess(), 0);
    return r;
  };
  const db = {
    createObjectStore() {},
    transaction() { return { objectStore() { return { get: () => req(undefined), put: () => req(undefined), delete: () => req(undefined) }; } }; },
  };
  return { open: () => req(db) };
}
