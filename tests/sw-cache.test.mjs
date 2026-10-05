// sw-cache.test.mjs: the offline copy of Dash must only ever hold GOOD files.
//
// Background (October 2026 audit): sw.js saved whatever the server answered,
// including a 404 or 503. One bad answer during a deploy replaced the good
// offline copy of a file, and the next time Dash opened with no network it
// served the error instead of the app.
//
// sw.js is run here inside a sandbox with a pretend cache and a pretend
// network, so nothing real is touched.
//
// Promises tested here:
//   1. A good answer is saved for offline.
//   2. A 404 or a 503 is NOT saved, and does not replace the good copy.
//   3. The page still receives the error this once (we never hide it).
//   4. With no network at all, the good copy is served.
//   5. Writes and other websites are never intercepted.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '\n      ' + extra));
};

const ORIGIN = 'https://ladyandra.github.io';
const FILE = ORIGIN + '/dash/js/app.js';

// Pretend cache: url -> Response. match() hands back a clone, like the real one.
const store = new Map();
const keyOf = (req) => (typeof req === 'string' ? req : req.url);
const caches = {
  async open() {
    return {
      async put(req, res) { store.set(keyOf(req), res); },
      async addAll() {},
    };
  },
  async match(req) { const r = store.get(keyOf(req)); return r ? r.clone() : undefined; },
  async keys() { return []; },
  async delete() {},
};

// Pretend network: whatever `network` currently is. 'offline' makes it reject.
let network = new Response('GOOD app.js', { status: 200 });
const listeners = {};
const ctx = vm.createContext({
  self: {
    location: new URL(ORIGIN + '/dash/sw.js'),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  },
  caches, URL, Request, Response, console,
  fetch: async () => {
    if (network === 'offline') throw new TypeError('Failed to fetch');
    return network.clone();
  },
});
vm.runInContext(src, ctx);

// Send one request through the worker. Returns what the PAGE got, or null if
// the worker did not intercept it.
async function hit(answer, { url = FILE, method = 'GET' } = {}) {
  network = answer;
  let promise = null;
  const req = new Request(url, { method });
  listeners.fetch({ request: req, respondWith: (p) => { promise = p; } });
  if (!promise) return null;
  const res = await promise;
  await new Promise((r) => setTimeout(r, 25)); // let the background save finish
  return res;
}
const cachedText = async () => {
  const c = store.get(FILE);
  return c ? `${c.status} ${await c.clone().text()}` : '(nothing)';
};

console.log('\n--- a good answer is saved for offline ---');
{
  const res = await hit(new Response('GOOD app.js', { status: 200 }));
  ok('the page gets the good file', res && res.status === 200 && (await res.text()) === 'GOOD app.js');
  ok('the good file is saved', (await cachedText()) === '200 GOOD app.js', await cachedText());
}

console.log('\n--- a bad answer never replaces the good copy ---');
{
  const res404 = await hit(new Response('Not Found', { status: 404 }));
  ok('a 404 is still handed to the page this once', res404 && res404.status === 404);
  ok('a 404 does NOT replace the saved copy', (await cachedText()) === '200 GOOD app.js', await cachedText());

  const res503 = await hit(new Response('Unavailable', { status: 503 }));
  ok('a 503 is still handed to the page this once', res503 && res503.status === 503);
  ok('a 503 does NOT replace the saved copy', (await cachedText()) === '200 GOOD app.js', await cachedText());

  const res500 = await hit(new Response('Oops', { status: 500 }));
  ok('a 500 does NOT replace the saved copy', (await cachedText()) === '200 GOOD app.js', await cachedText());
}

console.log('\n--- a new good answer still updates the saved copy ---');
{
  await hit(new Response('NEWER app.js', { status: 200 }));
  ok('the saved copy moves forward', (await cachedText()) === '200 NEWER app.js', await cachedText());
}

console.log('\n--- an error is never saved when nothing good exists yet ---');
{
  store.clear();
  await hit(new Response('Not Found', { status: 404 }));
  ok('nothing is saved from a first-ever 404', (await cachedText()) === '(nothing)', await cachedText());
}

console.log('\n--- with no network, the good copy is served ---');
{
  store.clear();
  await hit(new Response('GOOD app.js', { status: 200 }));
  await hit(new Response('Unavailable', { status: 503 })); // a bad moment on the server
  const res = await hit('offline');
  ok('offline: the page gets the good copy, not the error', res && res.status === 200 && (await res.text()) === 'GOOD app.js');
}

console.log('\n--- what the worker leaves alone ---');
{
  ok('a write (POST) is not intercepted', (await hit(new Response('x'), { method: 'POST' })) === null);
  ok('another website is not intercepted', (await hit(new Response('x'), { url: 'https://www.googleapis.com/x.js' })) === null);
}

console.log('\n--- bookkeeping ---');
{
  const version = src.match(/const\s+CACHE_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  ok('CACHE_VERSION is present and well formed', /^dash-v\d+$/.test(version || ''), String(version));
}

console.log(fail ? `\n${fail} check(s) FAILED` : '\nAll sw-cache checks passed');
process.exit(fail ? 1 : 0);
