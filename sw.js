// Service worker: keeps a copy of the app (pages, styles, fonts, libraries) on the phone
// after the first visit, so Haiku opens with no signal. Map files are not cached here;
// they are saved on the phone by the app itself when opened (see store.js).
//
// After changing any file listed below, raise VERSION so phones fetch the new copy.
const VERSION = "haiku-v2";
const FILES = [
  "./",
  "./index.html",
  "./app.css",
  "./tokens.css",
  "./app.js",
  "./store.js",
  "./symbols.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./fonts/barlow-latin-400-normal.woff2",
  "./fonts/barlow-latin-500-normal.woff2",
  "./fonts/barlow-latin-600-normal.woff2",
  "./fonts/barlow-latin-700-normal.woff2",
  "./fonts/barlow-condensed-latin-500-normal.woff2",
  "./fonts/barlow-condensed-latin-600-normal.woff2",
  "./fonts/barlow-condensed-latin-700-normal.woff2",
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

// Network first (so updates show up when there is signal), saved copy when offline.
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
