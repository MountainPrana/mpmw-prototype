// Service worker: keeps a copy of the app (pages, styles, fonts, libraries) on the phone
// after the first visit, so Haiku opens with no signal. Map files are not cached here;
// they are saved on the phone by the app itself when opened (see store.js).
//
// After changing any file listed below, raise VERSION so phones fetch the new copy.
const VERSION = "haiku-v4";
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
  "./lib/pmtiles.js",
  "./lib/magvar.js"
];

self.addEventListener("install", (event) => {
  // cache: "reload" asks the server for fresh copies, not ones the browser kept from an
  // earlier visit, so a new version never mixes in old files.
  event.waitUntil(caches.open(VERSION).then((cache) =>
    cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
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
//
// With weak signal (bars but no real data) a request can hang for a minute before it
// fails, so the saved copy is used after WAIT_MS. The network copy still updates the
// saved one if it arrives later.
const WAIT_MS = 4000;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  if (new URL(req.url).origin !== location.origin) return;
  const network = fetch(req);
  // Save a copy for offline use (copied right away, before the page reads the response).
  const saving = network.then((res) => {
    if (!res.ok) return;
    const copy = res.clone();
    return caches.open(VERSION).then((cache) => cache.put(req, copy));
  });
  event.waitUntil(saving.catch(() => {}));
  event.respondWith(networkOrSaved(req, network));
});

async function networkOrSaved(req, network) {
  const slow = new Promise((resolve) => setTimeout(resolve, WAIT_MS, null));
  const first = await Promise.race([network.catch(() => null), slow]);
  if (first) return first;
  const saved = await caches.match(req, { ignoreSearch: true });
  return saved || network;   // nothing saved yet: keep waiting for the network
}
