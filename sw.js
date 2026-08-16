// sw.js — offline-first app shell cache.
//
// Dash's CODE is cached so the app can open without internet. User DATA is
// stored separately on-device and synced through Dropbox.
//
// IMPORTANT: this cache has a permanent name on purpose. Dash is network-first
// while online, so current files replace their cached copies automatically.
// Do not introduce a manual "bump the cache version on every deploy" ritual.
const CACHE_NAME = "dash-runtime";

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
  "./js/icons.js",
  "./js/entries.js",
  "./js/merge-notes.js",
  "./js/settings.js",
  "./js/blobs.js",
  "./js/sketch.js",
  "./js/ui/toast.js",
  "./js/ui/colorfield.js",
  "./js/ui/readaloud.js",

  // The corner-cluster widgets are shelved but intentionally retained.
  "./js/widgets/motion.js",
  "./js/widgets/cluster.js",
  "./js/widgets/shapes.js",
  "./js/widgets/pet.js",

  "./js/views/shared.js",
  "./js/views/home.js",
  "./js/views/list.js",
  "./js/views/board.js",

  // Kanban and Finder are unregistered but intentionally retained.
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

// GitHub Pages can keep its own HTTP cache briefly. cache: "no-store" makes
// online requests actually check the network instead of being handed an older
// copy by the browser's HTTP cache.
function fromNetwork(req) {
  try {
    return fetch(req, { cache: "no-store" });
  } catch {
    return fetch(req.url, { cache: "no-store" });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            // Remove the old version-numbered Dash caches from the previous
            // system. After this one-time cleanup, CACHE_NAME stays permanent.
            .filter((key) => key !== CACHE_NAME && key.startsWith("dash-"))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never interfere with requests to Dropbox or any other outside service.
  if (url.origin !== self.location.origin) return;

  // Never intercept writes.
  if (event.request.method !== "GET") return;

  // Network-first:
  // 1. When online, fetch the newest file and replace the cached copy.
  // 2. When offline, fall back to the last good copy.
  //
  // This also means a newly added file does not require a cache-version bump.
  // Once Dash requests it successfully while online, it is cached automatically.
  event.respondWith(
    fromNetwork(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, copy))
          .catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(event.request)
          .then((cached) => cached || caches.match("./index.html"))
      )
  );
});
