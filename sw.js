// Service worker: keeps a copy of the page and its libraries on the device after the
// first visit, so the page opens with no signal. Map files are not cached here; they
// are opened from the device with "Open file".
//
// After changing index.html or anything in lib/, bump VERSION so phones fetch the new copy.
const VERSION = "mpmw-prototype-v1";
const FILES = [
  "./",
  "./index.html",
  "./lib/maplibre-gl.css",
  "./lib/maplibre-gl.js",
  "./lib/pmtiles.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network first (so updates show up when there is signal), cached copy when offline.
// Map tiles and partial-file requests are left alone.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  if (new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
