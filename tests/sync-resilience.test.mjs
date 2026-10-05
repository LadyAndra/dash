// sync-resilience.test.mjs: one damaged or odd sync line must never stop the
// good ones around it.
//
// Background (October 2026 audit): Store.replayLog() used to throw on the first
// line it could not apply. The caller only records "how far I have read" after
// a successful replay, so the same line was hit again on every 10-second poll
// and everything after it (and every other device's log after that one) never
// arrived. Five of seven kinds of odd line did this.
//
// Promises tested here:
//   1. Every kind of damaged line is skipped, and a good edit AFTER it still lands.
//   2. A `set` may not write the item's private bookkeeping or its identity.
//   3. A rejected LOCAL edit is not queued for sync either.
//   4. A damaged snapshot loads, and items from it are usable.
//   5. Ordinary edits still work exactly as before.
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

// The store logs a warning for every line it skips. That is the point, but it
// would bury the PASS/FAIL lines here, so count the warnings instead.
let warnings = 0;
const realWarn = console.warn;
console.warn = () => { warnings++; };

const { Store } = await import('../js/store.js');

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '\n      ' + extra));
};

let tick = Date.now() + 1000;
const ts = (device = 'z') => ({ wall: tick++, counter: 0, device });

function freshStore() {
  const s = new Store();
  const id = s.createItem({ title: 'Real item' });
  s.pendingOps = [];
  return { s, id };
}

console.log('\n--- damaged lines are skipped; the good edit after them still lands ---');
const damaged = {
  'set on "_fieldTs" with a string':      (id) => ({ op: 'set', itemId: id, field: '_fieldTs', value: 'x', ts: ts() }),
  'set on "_deleted"':                    (id) => ({ op: 'set', itemId: id, field: '_deleted', value: true, ts: ts() }),
  'set on "__proto__"':                   (id) => ({ op: 'set', itemId: id, field: '__proto__', value: { polluted: 1 }, ts: ts() }),
  'set on "id"':                          (id) => ({ op: 'set', itemId: id, field: 'id', value: 'someone-else', ts: ts() }),
  'set on "tags" with a string':          (id) => ({ op: 'set', itemId: id, field: 'tags', value: 'oops', ts: ts() }),
  'registry-remove with an unknown kind': ()   => ({ op: 'registry-remove', kind: 'nope', key: 'x' }),
  'registry line with no value':          ()   => ({ op: 'registry', kind: 'types' }),
  'registry line with an unknown kind':   ()   => ({ op: 'registry', kind: 'nope', value: { key: 'k' }, ts: ts() }),
  'add to a field that is not a list':    (id) => ({ op: 'add', itemId: id, field: 'title', value: 'a', ts: ts() }),
  'add with no value':                    (id) => ({ op: 'add', itemId: id, field: 'tags', ts: ts() }),
  'set with no item id':                  ()   => ({ op: 'set', field: 'title', value: 'x', ts: ts() }),
  'a line that is just null':             ()   => null,
  'a line that is just a number':         ()   => 42,
  'a line that is a list':                ()   => [],
  'an op with no kind':                   ()   => ({ itemId: 'x' }),
};
for (const [name, make] of Object.entries(damaged)) {
  const { s, id } = freshStore();
  const after = { op: 'set', itemId: id, field: 'title', value: 'GOOD EDIT AFTER', ts: ts('y') };
  let threw = null;
  try { s.replayLog([make(id), after]); } catch (e) { threw = e.message; }
  ok(`${name}: does not throw`, !threw, threw || '');
  ok(`${name}: the next good edit still lands`, s.get(id).title === 'GOOD EDIT AFTER', `title was "${s.get(id).title}"`);
}

console.log('\n--- the item\'s own bookkeeping is protected ---');
{
  const { s, id } = freshStore();
  s.replayLog([
    { op: 'set', itemId: id, field: '_deleted', value: true, ts: ts() },
    { op: 'set', itemId: id, field: '_fieldTs', value: 'x', ts: ts() },
    { op: 'set', itemId: id, field: 'id', value: 'hijacked', ts: ts() },
    { op: 'set', itemId: id, field: '__proto__', value: { polluted: 1 }, ts: ts() },
  ]);
  const it = s.get(id);
  ok('an item cannot be deleted by a plain set on _deleted', it && it._deleted !== true);
  ok('_fieldTs is still an object', it && typeof it._fieldTs === 'object' && it._fieldTs !== null);
  ok('the item keeps its identity', it && it.id === id);
  ok('Object.prototype was not touched', ({}).polluted === undefined);
  ok('the item\'s prototype was not swapped', Object.getPrototypeOf(it) === Object.prototype);
}

console.log('\n--- a refused LOCAL edit is not queued for sync ---');
{
  const { s, id } = freshStore();
  // Local edits go through an allow list and throw on anything else (this was
  // already true before the audit). The point here is that nothing leaks into
  // the outgoing queue, where it would reach every other device.
  for (const field of ['_deleted', 'id', '_fieldTs', '__proto__']) {
    let threw = false;
    try { s.setField(id, field, 'x'); } catch { threw = true; }
    ok(`setField on "${field}" is refused`, threw);
  }
  ok('nothing was queued', s.pendingOps.length === 0, `queued ${s.pendingOps.length}`);
  ok('the item is untouched', s.get(id) && !s.get(id)._deleted && s.get(id).id === id);
}

console.log('\n--- several good lines around one bad one: all the good ones land ---');
{
  const { s, id } = freshStore();
  s.replayLog([
    { op: 'set', itemId: id, field: 'title', value: 'First', ts: ts('a') },
    { op: 'set', itemId: id, field: '_fieldTs', value: 'x', ts: ts('a') },
    { op: 'add', itemId: id, field: 'tags', value: 'kept', ts: ts('a') },
    null,
    { op: 'set', itemId: id, field: 'body', value: 'Notes after the bad lines', ts: ts('a') },
  ]);
  const it = s.get(id);
  ok('edit before the bad line landed', it.title === 'First');
  ok('edit between the bad lines landed', it.tags.includes('kept'));
  ok('edit after the bad lines landed', it.body === 'Notes after the bad lines');
  ok('skipped lines were reported, not silent', warnings > 0);
}

console.log('\n--- a damaged item list heals instead of crashing ---');
{
  const { s, id } = freshStore();
  s.get(id).tags = null;
  let threw = null;
  try { s.replayLog([{ op: 'add', itemId: id, field: 'tags', value: 'fresh', ts: ts() }]); }
  catch (e) { threw = e.message; }
  ok('add onto a null tag list does not throw', !threw, threw || '');
  ok('the tag list is a real list again, holding the new tag', Array.isArray(s.get(id).tags) && s.get(id).tags.includes('fresh'));
}

console.log('\n--- a damaged snapshot loads, and its items are usable ---');
{
  const s = new Store();
  let threw = null;
  try {
    s.loadSnapshot({
      formatVersion: 1,
      registry: { types: 'not a list' },
      items: [
        null,
        'a string',
        { title: 'no id at all' },
        { id: 'ok-1', title: 'fine', tags: null, links: 'x', attachments: undefined, dates: 7, _fieldTs: 'bad' },
        { id: 'ok-2', title: 'also fine', futureField: { keep: 'me' } },
      ],
    });
  } catch (e) { threw = e.message; }
  ok('loading does not throw', !threw, threw || '');
  const a = s.get('ok-1');
  ok('the usable item was loaded', a && a.title === 'fine');
  ok('its lists are lists again', a && Array.isArray(a.tags) && Array.isArray(a.links) && Array.isArray(a.attachments));
  ok('its dates block is an object', a && a.dates && typeof a.dates === 'object');
  ok('its bookkeeping is an object', a && a._fieldTs && typeof a._fieldTs === 'object');
  ok('an unknown field from a newer build still rides through', s.get('ok-2') && s.get('ok-2').futureField && s.get('ok-2').futureField.keep === 'me');
  ok('entries that cannot be items were left out', !s.get('') && s.items.size === 2 && [...s.items.keys()].every(k => typeof k === 'string' && k !== ''));
  ok('the registry still has types and statuses to draw', Array.isArray(s.registry.types) && s.registry.types.length > 0 && Array.isArray(s.registry.statuses));
}

console.log('\n--- ordinary edits behave exactly as before ---');
{
  const { s, id } = freshStore();
  s.setField(id, 'title', 'New title');
  s.setField(id, 'due', '2026-12-01');
  s.addToSet(id, 'tags', 'alpha');
  s.addToSet(id, 'links', { target: 'other', label: 'part of' });
  s.removeFromSet(id, 'tags', 'alpha');
  const it = s.get(id);
  ok('title set', it.title === 'New title');
  ok('due date still lands inside dates', it.dates.due === '2026-12-01');
  ok('tag added then removed', !it.tags.includes('alpha'));
  ok('link added', it.links.length === 1 && it.links[0].target === 'other');
  ok('every ordinary edit was queued for sync', s.pendingOps.length >= 5, `queued ${s.pendingOps.length}`);
  // and a future build's unknown op kind is still ignored, not an error
  let threw = null;
  try { s.replayLog([{ op: 'from-the-future', itemId: id, ts: ts() }]); } catch (e) { threw = e.message; }
  ok('an op kind from a newer build is ignored, not an error', !threw);
}

console.warn = realWarn;
console.log(fail ? `\n${fail} check(s) FAILED` : '\nAll sync-resilience checks passed');
process.exit(fail ? 1 : 0);
