// Round 1 (October 2026): the desktop app shell, booted for real.
//
//   node tests/round1-app-desktop.test.mjs      (needs jsdom)
//
// Boots the REAL js/app.js in a desktop-shaped window and checks the wiring the
// unit tests can't see: the Trash button sits beside Settings in the topbar,
// carries its count, opens the drawer in one tap, and the editor's Move to
// trash round-trips through it. Also that Home opens with the Mark a date
// button. (The phone side is tests/round1-desktop-only.test.mjs.)
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toasts"></div></body>', {
  pretendToBeVisual: true, url: 'https://ladyandra.github.io/dash/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver',
                 'requestAnimationFrame','getComputedStyle','Event','KeyboardEvent','MouseEvent',
                 'PointerEvent','CustomEvent','Blob','URL','FileReader'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(dom.window, 'innerWidth', { value: 1440 });
Object.defineProperty(dom.window, 'innerHeight', { value: 900 });
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine'), addEventListener(){}, removeEventListener(){} });
globalThis.indexedDB = fakeIndexedDB();
process.on('unhandledRejection', () => {});

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const wait = (ms = 60) => new Promise(r => setTimeout(r, ms));

await import('../js/app.js');
await wait(200);

console.log("\n--- the topbar ---");
const trashBtn = document.getElementById('trash-btn');
const settingsBtn = document.querySelector('.topbar [aria-label="Settings"]');
ok("there is a Trash button in the topbar", !!trashBtn && !!trashBtn.closest('.topbar'));
ok("...right beside Settings", trashBtn.nextElementSibling === settingsBtn);
ok("...labelled for a screen reader as empty", trashBtn.getAttribute('aria-label') === "Trash, empty", trashBtn.getAttribute('aria-label'));
ok("the desktop does NOT get the desktop-only screen", !document.documentElement.classList.contains('desktop-only-on'));

console.log("\n--- Home ---");
const host = document.getElementById('view-host');
ok("Home opens with a Mark a date button", [...host.querySelectorAll('button')].some(b => /Mark a date/.test(b.textContent)));

console.log("\n--- trash round trip through the real app ---");
// app.js doesn't export its store, so make the entry the way Andra would:
// through Home's capture well.
const box = host.querySelector('.capture textarea');
box.value = "Old idea to bin";
box.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
[...host.querySelectorAll('.capture button')].find(b => b.textContent === "File it").click();
await wait();
host.ownerDocument.querySelector('[data-view="list"]').click();
await wait();
const listRow = [...host.querySelectorAll('.item-row, .item-card, [role="button"]')].find(r => /Old idea to bin/.test(r.textContent));
ok("the captured entry is in the List", !!listRow);
listRow.click();
await wait();
const moveBtn = [...document.querySelectorAll('.modal-scrim button')].find(b => b.textContent === "Move to trash");
ok("its editor offers Move to trash", !!moveBtn);
moveBtn.click();
await wait(120);
ok("it leaves the List", ![...host.querySelectorAll('*')].some(r => r.children.length === 0 && /Old idea to bin/.test(r.textContent)));
ok("the Trash button now shows the count", /Trash \(1\)/.test(trashBtn.textContent) && trashBtn.getAttribute('aria-label') === "Trash, 1 item",
   trashBtn.textContent + " / " + trashBtn.getAttribute('aria-label'));

trashBtn.click();
await wait();
const sheet = document.querySelector('.trash-sheet');
ok("one tap opens the Trash drawer", !!sheet);
ok("...listing the entry", /Old idea to bin/.test(sheet.textContent));
sheet.querySelector('.trash-restore').click();
[...sheet.querySelectorAll('button')].find(b => b.textContent === "Done").click();
await wait(120);
ok("Restore puts it back in the List", [...host.querySelectorAll('*')].some(r => r.children.length === 0 && /Old idea to bin/.test(r.textContent)));
ok("...and the count clears", trashBtn.textContent === "Trash", trashBtn.textContent);

console.log(`\n${fail ? `${fail} of ${n} app shell checks FAILED` : `all ${n} app shell checks passed`}`);
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
