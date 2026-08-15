// sw.js — offline-first app shell cache (§13.2 #6).
// The app's CODE is cached so Dash opens with no network (your DATA is local
// anyway). Bump CACHE_VERSION whenever you upload changed files so devices
// pick them up. Everything is same-origin static files — nothing tricky.

const CACHE_VERSION = "dash-v35";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/tokens.css",
  "./css/app.css",
  "./js/app.js",
  "./js/store.js",
  "./js/sync.js",
  "./js/dropbox.js",
  "./js/dropbox-auth.js",
  "./js/query.js",
  "./js/theme.js",
  "./js/ulid.js",
  "./js/clock.js",
  "./js/device.js",
  "./js/editor.js",
  "./js/selection.js",
  "./js/milestones.js",
  "./js/desk.js",
  "./js/entries.js",
  "./js/merge-notes.js",
  "./js/settings.js",
  "./js/blobs.js",
  "./js/sketch.js",
  "./js/ui/toast.js",
  "./js/ui/colorfield.js",
  "./js/ui/readaloud.js",
  // The corner-cluster widgets are SHELVED (August 2026) — app.js no longer
  // imports them. They stay cached on purpose: nothing costs anything, and
  // bringing the pet back is then two uncommented lines in app.js with no
  // risk of the classic "forgot to add it to SHELL" broken deploy.
  "./js/widgets/motion.js",
  "./js/widgets/cluster.js",
  "./js/widgets/shapes.js",
  "./js/widgets/pet.js",
  "./js/views/shared.js",
  "./js/views/home.js",
  "./js/views/list.js",
  "./js/views/board.js",
  // Kanban and Columns are UNREGISTERED (August 2026) — app.js no longer
  // imports them, so nothing fetches these at runtime. They stay cached for
  // the same reason the widgets do: it costs nothing, and putting either back
  // is then one uncommented import in app.js with no risk of the classic
  // "forgot to add it to SHELL" broken deploy.
  "./js/views/kanban.js",
  "./js/views/finder.js",
  "./js/views/project.js",
  "./js/views/desk.js",
  "./js/views/milestone-editor.js",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./logo-mark.png",
];

// Why every fetch in here says cache: "no-store"
// ----------------------------------------------
// GitHub Pages serves assets with `Cache-Control: max-age=600`. That is the
// BROWSER's own HTTP cache, which sits IN FRONT of this service worker — so
// for ten minutes after a deploy, a plain fetch (even the module loader's
// fetch for app.js) can be answered from disk without the network or this
// file ever being consulted. Network-first below was therefore a promise the
// worker couldn't keep: it looked like it was fetching, and it was being
// handed a stale copy.
//
// Concretely: an uploaded fix would appear live on the server and still not
// be what the app was running, which makes a fixed bug look unfixed. Asking
// for "no-store" bypasses the HTTP cache and actually goes to the network.
// The CACHE_VERSION cache below is still the offline copy; this only changes
// where the fresh copy comes from.
function fromNetwork(req) {
  // A Request whose mode is "navigate" can't be reconstructed with an init,
  // so fall back to re-fetching by URL in that case.
  try { return fetch(req, { cache: "no-store" }); }
  catch { return fetch(req.url, { cache: "no-store" }); }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      // cache: "reload" for the same reason — precaching a stale copy of the
      // shell would bake the old version into the offline cache.
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never touch Google etc.
  if (e.request.method !== "GET") return;   // never intercept writes
  // network-first for HTML/JS so updates arrive; fall back to cache offline.
  e.respondWith(
    fromNetwork(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
