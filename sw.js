// sw.js — offline-first app shell cache (§13.2 #6).
// The app's CODE is cached so Dash opens with no network (your DATA is local
// anyway). Bump CACHE_VERSION whenever you upload changed files so devices
// pick them up. Everything is same-origin static files — nothing tricky.

const CACHE_VERSION = "dash-v4";
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
  "./js/query.js",
  "./js/theme.js",
  "./js/ulid.js",
  "./js/clock.js",
  "./js/device.js",
  "./js/editor.js",
  "./js/settings.js",
  "./js/blobs.js",
  "./js/ui/toast.js",
  "./js/ui/readaloud.js",
  "./js/views/shared.js",
  "./js/views/list.js",
  "./js/views/board.js",
  "./js/views/kanban.js",
  "./js/views/finder.js",
  "./js/views/project.js",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  // network-first for HTML/JS so updates arrive; fall back to cache offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
