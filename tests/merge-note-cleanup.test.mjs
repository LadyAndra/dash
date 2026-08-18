// Regression coverage for the August 17, 2026 merge-note cleanup.
//
// Three promises are tied together here:
//   1. Title/Notes typing becomes one meaningful Store op instead of one op
//      per keystroke, while blur/close still save immediately.
//   2. Old per-keystroke collision records are shown as one conflict episode,
//      and resolving that card resolves the hidden typing drafts with it.
//   3. Finalizing an episode stays final even if another raw draft from that
//      same old editing episode arrives later.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', {
  pretendToBeVisual: true,
  url: 'https://ladyandra.github.io/dash/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver','requestAnimationFrame','getComputedStyle','CustomEvent','Event','PointerEvent','MouseEvent','FileReader','Blob','URL'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
localStorage.clear();
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
globalThis.confirm = () => true;

const { Store } = await import('../js/store.js');
const { openEditor } = await import('../js/editor.js');
const { coalescedMergeNotes, mergeNoteCount, openMergeNotes } = await import('../js/merge-notes.js');

let fail = 0, n = 0;
const ok = (name, c, extra='') => {
  n++;
  if (!c) fail++;
  console.log((c ? 'PASS  ' : 'FAIL  ') + name + (c ? '' : '\n      ' + extra));
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const fire = (node, type, bubbles=true) => node.dispatchEvent(new dom.window.Event(type, { bubbles, cancelable: true }));
const setInput = (node, value) => { node.value = value; fire(node, 'input'); };
const setOps = (store, field) => store.pendingOps.filter(op => op.op === 'set' && op.field === field);

console.log('\n--- text autosave coalesces a typing burst ---');
const store = new Store();
const id = store.createItem({ title: 'Old title', body: 'Old notes' });
openEditor(store, id, {});
let editor = document.querySelector('.modal-scrim:last-of-type .modal') || document.querySelector('.modal-scrim .modal');
let title = editor.querySelector('[aria-label="Title"]');
let body = editor.querySelector('[aria-label="Notes"]');
store.pendingOps = []; // ignore create/touch setup; only the edit itself matters here

setInput(title, 'B');
setInput(title, 'Bo');
setInput(title, 'Bowerhaus / Substack');
ok('no title operation is written during the keystroke burst', setOps(store, 'title').length === 0,
   `saw ${setOps(store, 'title').length} title ops before the quiet period`);
await wait(980);
let titleOps = setOps(store, 'title');
ok('the burst becomes one title operation', titleOps.length === 1,
   `expected 1 title op, got ${titleOps.length}`);
ok('that one operation contains the final title', titleOps[0]?.value === 'Bowerhaus / Substack');

console.log('\n--- blur and close flush the final draft immediately ---');
store.pendingOps = [];
setInput(body, 'A');
setInput(body, 'A useful note');
fire(body, 'blur', false);
await wait(0);
let bodyOps = setOps(store, 'body');
ok('blur writes one Notes operation', bodyOps.length === 1,
   `expected 1 body op, got ${bodyOps.length}`);
ok('blur saves the final Notes value', bodyOps[0]?.value === 'A useful note');

store.pendingOps = [];
setInput(title, 'Final title before close');
const done = [...editor.querySelectorAll('button')].find(b => b.textContent === 'Done');
done.click();
await wait(0);
titleOps = setOps(store, 'title');
ok('Done flushes a pending title without waiting 900ms', titleOps.length === 1);
ok('Done saves the final pending title', titleOps[0]?.value === 'Final title before close');

console.log('\n--- the same editor rule covers project entries too ---');
const projectId = store.createItem({ title: 'Project draft', type: 'project' });
openEditor(store, projectId, {});
editor = [...document.querySelectorAll('.modal-scrim .modal')].at(-1);
title = editor.querySelector('[aria-label="Title"]');
store.pendingOps = [];
setInput(title, 'Project d');
setInput(title, 'Project done');
await wait(980);
titleOps = setOps(store, 'title');
ok('a project title burst is also one operation', titleOps.length === 1);
ok('the project operation carries the final title', titleOps[0]?.value === 'Project done');
[...editor.querySelectorAll('button')].find(b => b.textContent === 'Done').click();
await wait(0);

console.log('\n--- old keystroke collisions collapse into one conflict episode ---');
const base = {
  itemId: 'project-1',
  itemTitle: 'Bowerhaus / Substack',
  mid: null,
  vsKey: null,
  coll: null,
  dkId: null,
  field: 'title',
  what: 'title',
  lostDevice: 'old-device',
  keptDevice: 'current-device',
  keptAt: '2026-08-17T20:59:00.000Z',
  keptValue: 'Bowerhaus / Substack',
};
const rawEpisode = [
  { ...base, key: 'k1', lostValue: 'B', lostAt: '2026-07-29T21:53:00.100Z', seenAt: '2026-08-17T20:59:00.100Z' },
  { ...base, key: 'k2', lostValue: 'Bowerhaus/Su', lostAt: '2026-07-29T21:53:00.300Z', seenAt: '2026-08-17T20:59:00.300Z' },
  { ...base, key: 'k3', lostValue: 'Bowerhaus/Substack', lostAt: '2026-07-29T21:53:00.500Z', seenAt: '2026-08-17T20:59:00.500Z' },
];
let grouped = coalescedMergeNotes(rawEpisode);
ok('three per-keystroke records show as one merge note', grouped.length === 1,
   `expected 1 group, got ${grouped.length}`);
ok('the one card offers the losing device\'s final draft', grouped[0]?.lostValue === 'Bowerhaus/Substack');
ok('the group remembers every underlying record', grouped[0]?.keys.length === 3);

const genuinelyLater = {
  ...base,
  key: 'later',
  keptAt: '2026-08-18T20:59:00.000Z',
  lostValue: 'A later real edit',
  lostAt: '2026-08-18T20:58:00.000Z',
  seenAt: '2026-08-18T21:00:00.000Z',
};
grouped = coalescedMergeNotes([...rawEpisode, genuinelyLater]);
ok('a different winning timestamp stays a separate real conflict', grouped.length === 2);

console.log('\n--- resolving the visible card resolves its hidden typing drafts ---');
let raw = rawEpisode.map(x => ({ ...x }));
const dismissed = [];
const restored = [];
const fakeStore = {
  collisions: () => raw,
  dismissCollision(key) {
    dismissed.push(key);
    raw = raw.filter(n => n.key !== key);
  },
  restoreCollision(key) {
    restored.push(key);
    raw = raw.filter(n => n.key !== key); // real Store also dismisses the restored representative
    return true;
  },
  clearCollisions() { raw = []; },
};
openMergeNotes(fakeStore);
ok('the Merge notes UI renders one card for the episode', document.querySelectorAll('.merge-note').length === 1);
ok('the badge/count model also reports one note', mergeNoteCount(fakeStore) === 1);
let fine = [...document.querySelectorAll('.merge-note button')].find(b => b.textContent === "That's fine");
fine.click();
ok("That's fine resolves every hidden keystroke record", raw.length === 0 && dismissed.length === 3,
   `raw=${raw.length}, dismissed=${dismissed.join(',')}`);

console.log('\n--- a late sibling from the same finalized episode stays gone ---');
const lateSibling = {
  ...base,
  key: 'k4-late',
  lostValue: 'Bowerhaus/Substac',
  lostAt: '2026-07-29T21:53:00.450Z',
  seenAt: '2026-08-17T21:10:00.000Z',
};
raw.push(lateSibling);
ok('a late raw draft from the finalized episode does not revive the badge', mergeNoteCount(fakeStore) === 0,
   `count=${mergeNoteCount(fakeStore)}`);
document.querySelector('.modal-scrim')?.remove();
openMergeNotes(fakeStore);
ok('a late raw draft from the finalized episode does not revive the card',
   document.querySelectorAll('.merge-note').length === 0);
document.querySelector('.modal-scrim')?.remove();

raw.push({ ...genuinelyLater });
ok('a genuinely later conflict still appears after the older episode was finalized',
   mergeNoteCount(fakeStore) === 1,
   `count=${mergeNoteCount(fakeStore)}`);
raw = [];

// Isolate the restore scenario from the dismissal episode above.
localStorage.removeItem('dash.mergeNoteEpisodesResolved');

console.log('\n--- restoring also finalizes the whole episode ---');
raw = rawEpisode.map(x => ({ ...x }));
dismissed.length = 0;
openMergeNotes(fakeStore);
const restore = [...document.querySelectorAll('.merge-note button')].find(b => b.textContent === 'Put the replaced one back');
restore.click();
ok('restore chooses the final losing draft, not an intermediate keystroke', restored.at(-1) === 'k3',
   `restored ${restored.at(-1)}`);
ok('restoring also clears the hidden drafts in that episode', raw.length === 0);
raw.push({ ...lateSibling, key: 'k5-after-restore' });
ok('a late sibling also stays gone after restore', mergeNoteCount(fakeStore) === 0,
   `count=${mergeNoteCount(fakeStore)}`);
document.querySelector('.modal-scrim')?.remove();

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
