// Haiku web beta: the whole app (Welcome, My maps, the map screen and the user's own
// waypoints). Plain JavaScript with no build step: edit this file and reload.
//
// How it fits together:
//   - Screens are the three <section class="view"> blocks in index.html. The address after
//     # says which one shows: #welcome, #maps, or #map/<map id>.
//   - Maps are PMTiles files. Opening one keeps a copy on the phone (store.js), so it opens
//     again with no signal. The page itself is kept by the service worker (sw.js).
//   - The user's waypoints are stored by coordinates, so each one shows on every map that
//     covers its spot.
//   - Nothing is sent anywhere. "Check alignment" and links in waypoints need a signal.

"use strict";

const APP_VERSION = "0.3.0";

// The Map Store shows in the Haiku menu once the website exists: put its address here.
const MAP_STORE_URL = "";

// ---------------------------------------------------------------- small helpers

const $ = (selector) => document.querySelector(selector);

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// 42.66244, −108.99816 (with a real minus sign, as on the designs)
function fmtCoords(lat, lon) {
  const f = (n) => (n < 0 ? "−" : "") + Math.abs(n).toFixed(5);
  return `${f(lat)}, ${f(lon)}`;
}

function fmtSize(bytes) {
  if (!bytes) return "";
  return bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + " GB" : Math.round(bytes / 1048576) + " MB";
}

function fmtFeet(metres) { return Math.round(metres * 3.28084) + " ft"; }

function fmtDistance(metres) {
  const miles = metres / 1609.344;
  if (miles < 0.1) return Math.max(10, Math.round(metres * 3.28084 / 10) * 10) + " ft";
  return miles < 10 ? miles.toFixed(1) + " mi" : Math.round(miles) + " mi";
}

// Distance in metres between two points (haversine).
function distanceM(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let toastTimer = null;
function toast(message, ms = 3500) {
  const box = $("#toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, ms);
}

function isStandalone() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

const ICONS = {
  close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
  chevron: '<svg class="chev" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  link: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  external: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  pencil: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
  flag: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4h11l-2.5 4 2.5 4H6"/></svg>',
  layers: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h.01"/></svg>',
  remove: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
  warning: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18h.01"/></svg>',
  noLocation: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M4 4l16 16"/></svg>',
  store: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  searching: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/></svg>'
};

// ---------------------------------------------------------------- app state

const state = {
  maps: [],          // map records: saved on the phone, plus any opened this session
  waypoints: [],     // the user's own waypoints (all maps)
  current: null,     // the map record on screen
  fix: null,         // last GPS position { lat, lon, accuracy }
  gps: "idle",       // idle | waiting | ok | denied
  watchId: null,
  following: false,
  compass: false,    // the map turns with the phone's compass
  aligning: false,
  sheet: null,       // what the bottom sheet shows: add | waypoint | more | list | info | confirm
  draft: null,       // the waypoint being added or edited
  selectedId: null,  // waypoint whose popup is open
  storageOk: true
};

// ---------------------------------------------------------------- screens and the address bar

function showView(name) {
  document.body.dataset.view = name;     // the message box sits higher on the map screen
  for (const view of document.querySelectorAll(".view")) {
    view.classList.toggle("is-active", view.id === "view-" + name);
  }
  if (name !== "map") { stopGps(); closeSheet(); if (state.compass) setCompass(false); }
  if (name !== "maps") closeAppMenu();
}

function go(hash, replace = false) {
  if (replace) { history.replaceState(null, "", hash); route(); }
  else if (location.hash === hash) route();
  else location.hash = hash;
}

// Whether the map screen was opened from My maps (one step back in the history). Then the
// app's back arrow steps back too, so it agrees with the phone's own back button and swipe
// instead of piling up screens to go round in circles through.
let lastHash = null;
let backIsHistory = false;

function route() {
  const hash = location.hash;
  const from = lastHash;
  lastHash = hash;
  if (hash.startsWith("#map/")) {
    const id = decodeURIComponent(hash.slice(5));
    const rec = state.maps.find((m) => m.id === id);
    backIsHistory = from === "#maps";
    if (rec) return openMap(rec);
    return go("#maps", true);
  }
  if (hash === "#welcome" || hash === "#about") {
    // The Welcome screen doubles as About Haiku (opened from the menu).
    const about = hash === "#about";
    for (const el of document.querySelectorAll("[data-about]")) el.hidden = !about;
    for (const el of document.querySelectorAll("[data-first-open]")) el.hidden = about;
    $("#about-version").textContent = `Haiku beta ${APP_VERSION}`;
    backIsHistory = about && from === "#maps";
    return showView("welcome");
  }
  if (hash === "#maps") { renderMaps(); return showView("maps"); }
  return go(Settings.get("welcomed") ? "#maps" : "#welcome", true);
}

window.addEventListener("hashchange", route);

function backToMaps() {
  if (backIsHistory) { backIsHistory = false; history.back(); }
  else go("#maps", true);
}

// ---------------------------------------------------------------- My maps

let thumbUrls = [];

function renderMaps() {
  thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  thumbUrls = [];
  const card = (m) => {
    let thumb = '<span class="map-thumb" aria-hidden="true"></span>';
    if (m.thumb) {
      const url = URL.createObjectURL(m.thumb);
      thumbUrls.push(url);
      thumb = `<img class="map-thumb" src="${url}" alt="">`;
    }
    const meta = [m.region, fmtSize(m.size)].filter(Boolean).join(" · ");
    const badge = m.saved ? '<span class="badge badge-offline">Offline ready</span>'
      : m.url ? '<span class="badge badge-warn">Test file</span>'
      : '<span class="badge badge-warn">Not saved on this phone</span>';
    return `<button type="button" class="map-card" data-action="open-map" data-id="${esc(m.id)}">
      ${thumb}
      <span class="map-card-text">
        <span class="map-card-title">${esc(m.title)}</span>
        ${meta ? `<span class="map-card-meta">${esc(meta)}</span>` : ""}
        ${badge}
      </span>${ICONS.chevron}</button>`;
  };
  const sorted = [...state.maps].sort((a, b) => a.title.localeCompare(b.title));
  const mpmw = sorted.filter((m) => m.publisher === "mpmw");
  const own = sorted.filter((m) => m.publisher !== "mpmw");
  $("#mpmw-section").hidden = mpmw.length === 0;
  $("#mpmw-list").innerHTML = mpmw.map(card).join("");
  $("#own-list").innerHTML = own.map(card).join("");
  $("#maps-sub-text").textContent = state.maps.length
    ? "Every map here works with no signal"
    : "Open a map once and it works with no signal";
  $("#install-hint").hidden = isStandalone() || Settings.get("installHintHidden") === "1" ||
    !/iPhone|iPad|iPod/.test(navigator.userAgent);
  $("#app-version").textContent = `Haiku beta ${APP_VERSION} · by MountainPrana Map Works`;
}

// ---------------------------------------------------------------- opening a map file

// A blob (a map file kept on the phone) as a PMTiles source. The key must be unique,
// because MapLibre finds the file by it.
function blobSource(blob, key) {
  return {
    getKey: () => key,
    getBytes: async (offset, length) => ({ data: await blob.slice(offset, offset + length).arrayBuffer() })
  };
}

function archiveFor(rec) {
  if (rec.url) return new pmtiles.PMTiles(rec.url);
  return new pmtiles.PMTiles(blobSource(rec.file, "map-" + rec.id));
}

// Title, region and maker, from the info written into the file by tools/set-map-info.py.
function readMapInfo(meta, fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m = meta && typeof meta.mpmw === "object" ? meta.mpmw : null;
  const name = meta && typeof meta.name === "string" && meta.name !== "map" ? meta.name : "";
  if (m && m.id) {
    return { id: "mpmw-" + m.id, title: m.title || name || base, region: m.region || "",
      version: m.version || "", publisher: "mpmw" };
  }
  return { id: null, title: name || base, region: "", version: "", publisher: null };
}

async function openMapFile(file) {
  if (!file) return;
  if (/\.(tiff?|pdf)$/i.test(file.name)) {
    toast("Haiku can't convert GeoTIFF or GeoPDF files on the phone yet. For the beta, the map needs to be a .pmtiles file.", 6000);
    return;
  }
  toast("Opening map…", 20000);
  let archive, header, meta;
  try {
    archive = new pmtiles.PMTiles(blobSource(file, "check-" + newId()));
    header = await archive.getHeader();
    meta = await archive.getMetadata().catch(() => ({}));
  } catch {
    toast("That file isn't a map Haiku can open. Choose a .pmtiles map file.", 5000);
    return;
  }
  if (![2, 3, 4, 5].includes(header.tileType)) {
    toast("This .pmtiles file holds vector tiles. Haiku shows printed (image) maps only.", 5000);
    return;
  }
  const info = readMapInfo(meta, file.name);
  const rec = {
    id: info.id || "file-" + newId(),
    title: info.title, region: info.region, version: info.version, publisher: info.publisher,
    fileName: file.name, size: file.size,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    minZoom: header.minZoom, maxZoom: header.maxZoom,
    addedAt: Date.now(), file, thumb: null, saved: false
  };
  // The same imported file opened twice replaces the first copy.
  const same = state.maps.find((m) => (info.id ? m.id === info.id
    : m.fileName === file.name && m.size === file.size && !m.publisher));
  if (same) rec.id = same.id;
  state.maps = state.maps.filter((m) => m.id !== rec.id).concat(rec);
  rec.thumb = await makeThumbnail(archive, header).catch(() => null);
  Settings.set("welcomed", "1");
  if (state.current && state.current.id === rec.id) state.current = null; // reload it
  go("#map/" + encodeURIComponent(rec.id));
  saveMap(rec);
}

async function saveMap(rec) {
  if (!state.storageOk) {
    toast("This browser can't save maps (private browsing?). The map works until you close Haiku.", 6000);
    return;
  }
  toast("Saving the map on this phone…", 30000);
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const { saved, ...record } = rec;
    await Store.put("maps", record);
    rec.saved = true;
    toast("Saved on this phone. It works with no signal.");
  } catch (err) {
    console.error(err);
    toast("Couldn't save the map on this phone (not enough space?). It works until you close Haiku.", 6000);
  }
}

// For testing on a computer: index.html?map=../maps/worthy-weekend/map.pmtiles opens a file
// from the test server without saving it.
async function openMapUrl(url) {
  try {
    const archive = new pmtiles.PMTiles(url);
    const header = await archive.getHeader();
    const meta = await archive.getMetadata().catch(() => ({}));
    const info = readMapInfo(meta, url.split("/").pop());
    const rec = {
      id: "url-" + url, url, title: info.title, region: info.region, version: info.version,
      publisher: info.publisher, fileName: url.split("/").pop(), size: 0,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      minZoom: header.minZoom, maxZoom: header.maxZoom, addedAt: Date.now(), saved: false,
      thumb: await makeThumbnail(archive, header).catch(() => null)
    };
    state.maps = state.maps.filter((m) => m.id !== rec.id).concat(rec);
    Settings.set("welcomed", "1");
    go("#map/" + encodeURIComponent(rec.id), true);
  } catch (err) {
    console.error(err);
    toast("Couldn't open " + url, 5000);
    route();
  }
}

// A small picture of the whole page for the My maps list, drawn from the map's own tiles.
async function makeThumbnail(archive, header) {
  const worldX = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z;
  const worldY = (lat, z) => {
    const s = Math.sin(lat * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z;
  };
  let z = header.maxZoom;
  for (; z > header.minZoom; z--) {
    const w = Math.floor(worldX(header.maxLon, z) / 256) - Math.floor(worldX(header.minLon, z) / 256) + 1;
    const h = Math.floor(worldY(header.minLat, z) / 256) - Math.floor(worldY(header.maxLat, z) / 256) + 1;
    if (w * h <= 9) break;
  }
  const x0 = worldX(header.minLon, z), x1 = worldX(header.maxLon, z);
  const y0 = worldY(header.maxLat, z), y1 = worldY(header.minLat, z);
  const scale = Math.min(1, 320 / (x1 - x0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((x1 - x0) * scale);
  canvas.height = Math.round((y1 - y0) * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const mime = { 2: "image/png", 3: "image/jpeg", 4: "image/webp", 5: "image/avif" }[header.tileType];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) {
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++) {
      const tile = await archive.getZxy(z, tx, ty);
      if (!tile || !tile.data) continue;
      const bitmap = await createImageBitmap(new Blob([tile.data], { type: mime }));
      ctx.drawImage(bitmap, (tx * 256 - x0) * scale, (ty * 256 - y0) * scale, 256 * scale, 256 * scale);
    }
  }
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

// ---------------------------------------------------------------- the map screen

let map = null;
let mapReady = null;
let protocol = null;
let gpsMarker = null;
let draftMarker = null;
const waypointMarkers = new Map(); // waypoint id -> MapLibre marker

function ensureMap() {
  if (map) return;
  protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        // Reference map for "Check alignment" only. Needs a signal.
        osm: { type: "raster", tileSize: 256, maxzoom: 19,
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"] }
      },
      layers: [
        { id: "surround", type: "background", paint: { "background-color": cssVar("--map-surround") } },
        { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } }
      ]
    },
    center: [-108.97, 42.67], zoom: 12,
    maxZoom: 19,              // tiles stop at 17; 18 and 19 just enlarge them
    // Two fingers can twist the map (except in compass mode, where the compass turns it).
    // Right-click stays "add a waypoint" on a computer, so the mouse can't turn the map.
    dragRotate: false, pitchWithRotate: false, touchPitch: false, boxZoom: false,
    attributionControl: false
  });
  map.addControl(new maplibregl.ScaleControl({ unit: "imperial", maxWidth: 90 }), "bottom-left");
  mapReady = new Promise((resolve) => map.once("load", resolve));

  // Dragging the map stops following you (and compass mode). Pinching to zoom doesn't.
  map.on("dragstart", (e) => {
    const touches = e.originalEvent && e.originalEvent.touches;
    if (touches && touches.length > 1) return;
    setFollowing(false);
    if (state.compass) setCompass(false);
  });
  map.on("rotate", onRotate);
  map.on("zoom", () => { sizeAccuracyCircle(); sizeWaypointsForZoom(); });
  sizeWaypointsForZoom();
  map.on("click", (e) => {
    if (e.originalEvent && e.originalEvent.target.closest(".wp-marker")) return;
    if (["waypoint", "more", "list", "info"].includes(state.sheet)) closeSheet();
  });
  map.on("contextmenu", (e) => { e.preventDefault(); startAdd(e.lngLat, "pressed"); });
  setupLongPress();

  // Day/Night: only the area around the printed page changes; the map itself never does.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (map.getLayer("surround")) map.setPaintProperty("surround", "background-color", cssVar("--map-surround"));
  });
}

async function openMap(rec) {
  showView("map");
  ensureMap();
  map.resize();
  await mapReady;
  if (!state.current || state.current.id !== rec.id) {
    closeSheet();
    try {
      const archive = archiveFor(rec);
      protocol.add(archive);
      if (map.getLayer("printed")) map.removeLayer("printed");
      if (map.getSource("printed")) map.removeSource("printed");
      map.addSource("printed", {
        type: "raster", tileSize: 256, bounds: rec.bounds,
        url: "pmtiles://" + archive.source.getKey()
      });
      map.addLayer({ id: "printed", type: "raster", source: "printed",
        paint: { "raster-resampling": "linear", "raster-fade-duration": 0 } });
    } catch (err) {
      console.error(err);
      toast("Couldn't open this map. Try opening its file again.", 5000);
      return go("#maps", true);
    }
    state.current = rec;
    const [w, s, e, n] = rec.bounds;
    // Room to move around the page, but not to lose it. Generous, because a wide page on
    // a tall phone screen (or the other way round) needs room above and below.
    const padX = (e - w) * 3, padY = (n - s) * 3;
    map.setMaxBounds([[w - padX, s - padY], [e + padX, n + padY]]);
    map.setMinZoom(Math.max(0, rec.minZoom - 1));
    setAlignment(false);
    setFollowing(false);
    if (state.compass) setCompass(false);
    fitWhole(false);
    renderWaypointMarkers();
  }
  $("#map-title").textContent = rec.title;
  renderGpsCard();
  showTipIfNeeded();
  startGps();
}

function fitWhole(animate = true) {
  if (!state.current) return;
  const [w, s, e, n] = state.current.bounds;
  // Fit the page between the top bar and the location card.
  const viewH = map.getContainer().offsetHeight;
  let top = $(".topbar").getBoundingClientRect().bottom + 8;
  let bottom = viewH - $("#gps-card").getBoundingClientRect().top + 8;
  if (top + bottom > viewH - 120) { top = 12; bottom = 12; }
  // The whole page is shown north up, the way it was printed.
  map.fitBounds([[w, s], [e, n]], { padding: { top, bottom, left: 12, right: 12 }, bearing: 0, animate });
}

function onCurrentMap(lat, lon) {
  if (!state.current) return false;
  const [w, s, e, n] = state.current.bounds;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

function showTipIfNeeded() {
  if (Settings.get("tipSeen") === "1") { $("#tip").hidden = true; return; }
  // Printed symbols become tappable when the map's waypoints.geojson is loaded (next step).
  $("#tip-text").textContent = "Press and hold anywhere on the map to add your own waypoint.";
  $("#tip").hidden = false;
}

function setAlignment(on) {
  state.aligning = on;
  if (!map || !map.getLayer("osm")) return;
  map.setLayoutProperty("osm", "visibility", on ? "visible" : "none");
  if (map.getLayer("printed")) map.setPaintProperty("printed", "raster-opacity", on ? 0.55 : 1);
  $("#osm-credit").hidden = !on;
}

// Keep the spot of interest visible in the strip of map between the top bar and the bottom
// sheet. (Measured, not guessed: the strip depends on the phone and on the sheet. Tall
// sheets are kept short enough in app.css that there is always a strip.)
function revealAboveSheet(lngLat) {
  const sheet = $("#sheet");
  const box = map.getContainer().getBoundingClientRect();
  const top = $(".topbar").getBoundingClientRect().bottom - box.top + 24;
  const bottom = box.height - (sheet.hidden ? 0 : sheet.offsetHeight) - 24;
  const y = map.project(lngLat).y;
  if (y >= top && y <= bottom) return;
  const targetY = bottom > top ? (top + bottom) / 2 : top;
  map.panBy([0, y - targetY], { duration: 300 });
}

// Press and hold on the map adds a waypoint there. (Phones don't all send a "long press"
// event, so it is timed here: one finger down for 0.55 s without moving.)
let lastAddAt = 0;
let swallowClickUntil = 0;
let fingersDown = 0;         // fingers on the map; following and the compass wait while > 0   // the click a browser sends when the long-pressing finger lifts
function setupLongPress() {
  const box = map.getCanvasContainer();
  let timer = null, start = null;
  let fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const begin = (x, y, target) => {
    cancel();
    // Every new press starts fresh. If the lift after the last long press was missed (the
    // sheet opened under the mouse, or the finger was on a marker that got redrawn), a
    // leftover "fired" would swallow this tap, and tapping a waypoint would do nothing.
    fired = false;
    if (target && target.closest && target.closest(".wp-marker")) return;
    start = { x, y };
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      const rect = box.getBoundingClientRect();
      if (navigator.vibrate) navigator.vibrate(15);
      startAdd(map.unproject([start.x - rect.left, start.y - rect.top]), "pressed");
    }, 550);
  };
  const moved = (x, y) => { if (timer && Math.hypot(x - start.x, y - start.y) > 10) cancel(); };
  const countFingers = (e) => { fingersDown = e.touches.length; };
  for (const type of ["touchstart", "touchend", "touchcancel"]) {
    box.addEventListener(type, countFingers, { passive: true });
  }
  box.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return cancel();
    begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
  }, { passive: true });
  box.addEventListener("touchmove", (e) => moved(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  // Lifting the finger after a long press must not also "tap" the sheet that just opened.
  const lifted = (e) => {
    cancel();
    if (!fired) return;
    fired = false;
    swallowClickUntil = Date.now() + 400;
    if (e.cancelable) e.preventDefault();
  };
  box.addEventListener("touchend", lifted);
  box.addEventListener("touchcancel", cancel);
  box.addEventListener("mousedown", (e) => { if (e.button === 0) begin(e.clientX, e.clientY, e.target); });
  box.addEventListener("mousemove", (e) => { if (timer) moved(e.clientX, e.clientY); });
  // On the whole window: the sheet that opens can end up under the mouse, so the button
  // is often released over the sheet, not the map.
  window.addEventListener("mouseup", lifted);
  map.on("zoomstart", cancel);
}

// ---------------------------------------------------------------- GPS

function startGps() {
  if (state.watchId !== null) return;
  if (!("geolocation" in navigator)) { state.gps = "denied"; renderGpsCard(); return; }
  if (state.gps !== "ok") { state.gps = "waiting"; renderGpsCard(); }
  state.watchId = navigator.geolocation.watchPosition(onFix, onGpsError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
}

function stopGps() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
}

function onFix(pos) {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  state.fix = { lat, lon, accuracy };
  state.gps = "ok";
  if (!gpsMarker) {
    const el = document.createElement("div");
    el.className = "gps-marker";
    // The cone shows which way the phone points (compass mode only).
    el.innerHTML = '<div class="gps-accuracy"></div>' +
      '<div class="gps-heading" hidden><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">' +
      '<defs><linearGradient id="heading-fade" x1="0" y1="1" x2="0" y2="0">' +
      '<stop offset="0" stop-opacity="0.75"/><stop offset="1" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M24 48L4 9a44 44 0 0 1 40 0z" fill="url(#heading-fade)"/></svg></div>' +
      '<div class="gps-dot"></div>';
    gpsMarker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
  } else {
    gpsMarker.setLngLat([lon, lat]);
  }
  sizeAccuracyCircle();
  updateHeadingCone();
  if (state.following && !state.compass && !fingersDown) map.easeTo({ center: [lon, lat], duration: 600 });
  renderGpsCard();
}

function onGpsError(err) {
  if (err.code === 1) {            // permission denied
    state.gps = "denied";
    stopGps();
    if (gpsMarker) { gpsMarker.remove(); gpsMarker = null; }
    state.fix = null;
  } else if (state.gps !== "ok") {  // no fix yet; the phone keeps trying
    state.gps = "waiting";
  }
  renderGpsCard();
}

// The accuracy circle is drawn to scale: its radius is the phone's accuracy estimate.
function sizeAccuracyCircle() {
  if (!gpsMarker || !state.fix) return;
  const metresPerPixel = 78271.517 * Math.cos(state.fix.lat * Math.PI / 180) / 2 ** map.getZoom();
  const d = Math.min(4000, 2 * state.fix.accuracy / metresPerPixel);
  const circle = gpsMarker.getElement().firstChild;
  circle.style.width = circle.style.height = d + "px";
}

function renderGpsCard() {
  const card = $("#gps-card");
  let icon, main, sub, warn = false;
  if (state.gps === "ok" && state.fix) {
    const { lat, lon, accuracy } = state.fix;
    if (onCurrentMap(lat, lon)) {
      icon = '<span class="dot"></span>';
      main = fmtCoords(lat, lon);
      // In compass mode the second line shows which way you face instead (for checking
      // against a real compass); the compass's own accuracy shows when the phone gives it.
      sub = state.compass && compass.smooth !== null
        ? `±${fmtFeet(accuracy)} · Facing ${Math.round(compass.smooth) % 360}° true` +
          (compass.accuracy > 0 ? ` · compass ±${Math.round(compass.accuracy)}°` : "")
        : `Accuracy ±${fmtFeet(accuracy)} · On this map`;
    } else {
      warn = true;
      icon = ICONS.warning;
      main = "You're outside this map";
      sub = `${fmtCoords(lat, lon)} · ±${fmtFeet(accuracy)}`;
    }
  } else if (state.gps === "denied") {
    icon = ICONS.noLocation;
    main = "Location unavailable";
    sub = "Allow location for this page in your phone's Settings.";
  } else {
    icon = ICONS.searching;
    main = "Finding your location…";
    sub = "Allow location when your phone asks.";
  }
  card.classList.toggle("is-warning", warn);
  $("#gps-icon").innerHTML = icon;
  $("#gps-main").textContent = main;
  $("#gps-sub").textContent = sub;
}

function setFollowing(on) {
  state.following = on;
  const btn = $('[data-action="follow"]');
  btn.setAttribute("aria-pressed", String(on));
  btn.setAttribute("aria-label", state.compass ? "Compass on: tap for north up"
    : on ? "Following you: tap to turn the map with the compass" : "Follow my location");
}

// The location button: first tap follows you (north up), second tap also turns the map
// with the compass, third tap goes back to north up. Dragging the map stops both.
function onFollow() {
  if (state.following && !state.compass) return startCompassMode();
  if (state.compass) {
    setCompass(false);
    map.easeTo({ bearing: 0, duration: 400 });
    return;
  }
  if (state.gps === "denied") {
    toast("Location is off. Allow location for this page in your phone's Settings.", 5000);
    return;
  }
  setFollowing(true);
  if (state.fix) {
    map.easeTo({ center: [state.fix.lon, state.fix.lat], zoom: Math.max(map.getZoom(), 15), duration: 700 });
  } else {
    toast("Finding your location…");
    startGps();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopGps(); stopCompassSensor(); }
  else if ($("#view-map").classList.contains("is-active")) {
    startGps();
    if (state.compass) startCompassSensor();
  }
});

// ---------------------------------------------------------------- compass: the map turns with the phone
//
// iPhone: Safari asks once for "Motion & Orientation" access (it must be asked from a tap),
// then gives webkitCompassHeading. Android: the deviceorientationabsolute event, no asking.
// Both point to magnetic north, so the declination from NOAA's World Magnetic Model
// (lib/magvar.js, works offline) is added to get true north, which is up on the map.

const COMPASS_SMOOTHING = 0.1;   // share of the way to the newest reading, each frame (60 a second)
const compass = {
  listening: false, raw: null, smooth: null, accuracy: -1,
  gotReading: false, frame: null, timer: null, cardAt: 0,
  decl: 0, declAt: null           // declination in degrees east, and where it was worked out
};

function startCompassMode() {
  // On iPhone the permission has to be asked right here, in the tap. (Newer Chrome has the
  // same call; on Android it answers without asking.)
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission().then((answer) => {
      if (answer === "granted") setCompass(true);
      else if (isIPhone()) toast("Turning the map needs Motion & Orientation access. Close Haiku completely and open it again to be asked again.", 7000);
      else toast("This phone didn't let Haiku use its compass, so the map stays north up.", 5000);
    }).catch(() => toast("Couldn't start the compass on this phone.", 4000));
    return;
  }
  setCompass(true);
}

function isIPhone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPad asks to be a Mac
}

function setCompass(on) {
  state.compass = on;
  $('[data-action="follow"]').classList.toggle("is-compass", on);
  if (on) {
    setFollowing(true);
    map.touchZoomRotate.disableRotation();
    compass.raw = compass.smooth = null;
    startCompassSensor();
  } else {
    if (map) map.touchZoomRotate.enableRotation();
    stopCompassSensor();
    compass.raw = compass.smooth = null;
  }
  setFollowing(state.following);   // updates the button's label
  onRotate();
  updateHeadingCone();
  renderGpsCard();
}

// Both events are heard: iPhone sends "deviceorientation" with webkitCompassHeading;
// Android sends "deviceorientationabsolute". Readings that aren't tied to north are ignored.
const ORIENTATION_EVENTS = ["deviceorientationabsolute", "deviceorientation"];

function startCompassSensor() {
  if (compass.listening) return;
  for (const type of ORIENTATION_EVENTS) window.addEventListener(type, onOrientation);
  compass.listening = true;
  compass.gotReading = false;
  clearTimeout(compass.timer);
  compass.timer = setTimeout(() => {
    if (state.compass && !compass.gotReading) {
      toast("This device has no compass Haiku can use, so the map stays north up.", 5000);
      setCompass(false);
      map.easeTo({ bearing: 0, duration: 400 });
    }
  }, 3000);
  cancelAnimationFrame(compass.frame);
  compass.frame = requestAnimationFrame(compassFrame);
}

function stopCompassSensor() {
  if (compass.listening) for (const type of ORIENTATION_EVENTS) window.removeEventListener(type, onOrientation);
  compass.listening = false;
  clearTimeout(compass.timer);
  cancelAnimationFrame(compass.frame);
}

function onOrientation(e) {
  let magnetic = null;
  if (typeof e.webkitCompassHeading === "number" && e.webkitCompassHeading >= 0) {
    magnetic = e.webkitCompassHeading;                       // iPhone
    compass.accuracy = typeof e.webkitCompassAccuracy === "number" ? e.webkitCompassAccuracy : -1;
  } else if (e.absolute && typeof e.alpha === "number") {
    magnetic = headingFromAngles(e.alpha, e.beta, e.gamma);  // Android
    compass.accuracy = -1;
  }
  if (magnetic === null || !Number.isFinite(magnetic)) return;
  compass.gotReading = true;
  // If the phone is turned sideways, the top of the screen is a side of the phone.
  const screenAngle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  compass.raw = norm360(magnetic + screenAngle + declinationHere());
}

// Which way the phone points, from the Android angles: the top edge (best when the phone
// is flat) plus the back (best when it's upright), both laid flat on the ground.
function headingFromAngles(alpha, beta, gamma) {
  const d = Math.PI / 180;
  const sa = Math.sin(alpha * d), ca = Math.cos(alpha * d);
  const sb = Math.sin((beta || 0) * d), cb = Math.cos((beta || 0) * d);
  const sg = Math.sin((gamma || 0) * d), cg = Math.cos((gamma || 0) * d);
  const east = -sa * cb - ca * sg - sa * sb * cg;
  const north = ca * cb - sa * sg + ca * sb * cg;
  return norm360(Math.atan2(east, north) / d);
}

// Declination where you are (or at the map's center), worked out again after ~10 km.
function declinationHere() {
  const p = state.fix ? { lat: state.fix.lat, lon: state.fix.lon }
    : map ? { lat: map.getCenter().lat, lon: map.getCenter().lng } : null;
  if (!p || !window.magvar) return compass.decl;
  if (!compass.declAt || Math.abs(p.lat - compass.declAt.lat) > 0.1 || Math.abs(p.lon - compass.declAt.lon) > 0.1) {
    try { compass.decl = magvar.magvar(p.lat, p.lon); compass.declAt = p; } catch { /* keep the last value */ }
  }
  return compass.decl;
}

function norm360(deg) { return ((deg % 360) + 360) % 360; }
function angleDiff(a, b) { return ((a - b + 540) % 360) - 180; }   // shortest turn from b to a

// Each frame: ease toward the newest compass reading (so the map doesn't shiver), turn the
// map to it, and keep your position in the middle. Waits while fingers are on the map.
function compassFrame() {
  compass.frame = requestAnimationFrame(compassFrame);
  if (!state.compass || compass.raw === null) return;
  compass.smooth = compass.smooth === null ? compass.raw
    : norm360(compass.smooth + angleDiff(compass.raw, compass.smooth) * COMPASS_SMOOTHING);
  if (fingersDown) return;
  const camera = {};
  if (Math.abs(angleDiff(compass.smooth, map.getBearing())) > 0.3) camera.bearing = compass.smooth;
  if (state.fix) {
    const c = map.getCenter();
    if (Math.abs(c.lng - state.fix.lon) > 1e-6 || Math.abs(c.lat - state.fix.lat) > 1e-6) {
      camera.center = [state.fix.lon, state.fix.lat];
    }
  }
  if (camera.bearing !== undefined || camera.center) map.jumpTo(camera);
  updateHeadingCone();
  const now = Date.now();
  if (now - compass.cardAt > 500) { compass.cardAt = now; renderGpsCard(); }
}

function updateHeadingCone() {
  if (!gpsMarker) return;
  const cone = gpsMarker.getElement().querySelector(".gps-heading");
  const show = state.compass && compass.smooth !== null;
  cone.hidden = !show;
  if (show) cone.style.transform = `translate(-50%, -100%) rotate(${angleDiff(compass.smooth, map.getBearing())}deg)`;
}

// The north arrow shows whenever the map is turned; its needle points to north on the map.
function onRotate() {
  if (!map) return;
  const bearing = map.getBearing();
  $(".north-btn").hidden = !(state.compass || Math.abs(bearing) > 0.5);
  $(".north-needle").style.transform = `rotate(${-bearing}deg)`;
}

// ---------------------------------------------------------------- the user's waypoints on the map

function waypointsOnCurrentMap() {
  if (!state.current) return [];
  return state.waypoints.filter((w) => onCurrentMap(w.lat, w.lon));
}

function renderWaypointMarkers() {
  for (const marker of waypointMarkers.values()) marker.remove();
  waypointMarkers.clear();
  if (!map || !state.current) return;
  for (const w of waypointsOnCurrentMap()) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "wp-marker" + (w.type === "existing" ? " is-halo" : "") +
      (w.id === state.selectedId ? " is-selected" : "");
    el.dataset.id = w.id;
    // Only the symbol shows on the map (Tim, 0.2.1); the name is in its popup and the list.
    el.innerHTML = w.type === "existing" ? '<span class="halo"></span>'
      : symbolSvg(w.type, { size: 24, fill: cssVar("--map-yours"), edge: cssVar("--map-edge") });
    el.addEventListener("click", (e) => { e.stopPropagation(); openWaypoint(w.id); });
    waypointMarkers.set(w.id, new maplibregl.Marker({ element: el }).setLngLat([w.lon, w.lat]).addTo(map));
    // Set after addTo: MapLibre names every marker "Map marker" otherwise.
    el.setAttribute("aria-label", w.type === "existing"
      ? `${w.name || "Printed symbol"}, has your note` : `${w.name}, your waypoint`);
  }
}

// Sizes by zoom, so a zoomed-out map with many waypoints isn't cluttered. (MapLibre zoom
// levels: Worthy Weekend's whole page fits at about 11; tiles are sharpest at 16.)
//   - The user's symbols are full size from fullZoom in, shrink as you zoom out, and stop
//     shrinking at `floor` (a share of full size) from floorZoom out.
//   - The ring on a printed symbol (Existing waypoint) grows and shrinks with the map, so it
//     stays around the printed symbol: its 38 px fits Worthy Weekend's symbols at
//     haloFitZoom. It never gets smaller than haloMin or bigger than haloMax.
const WP_SIZE = {
  fullZoom: 14, floorZoom: 11.5, floor: 0.5,
  haloFitZoom: 15, haloMin: 0.45, haloMax: 8
};

function sizeWaypointsForZoom() {
  if (!map) return;
  const z = map.getZoom();
  const t = Math.min(1, Math.max(0, (z - WP_SIZE.floorZoom) / (WP_SIZE.fullZoom - WP_SIZE.floorZoom)));
  const halo = Math.min(WP_SIZE.haloMax, Math.max(WP_SIZE.haloMin, 2 ** (z - WP_SIZE.haloFitZoom)));
  const box = map.getContainer();
  box.style.setProperty("--wp-scale", (WP_SIZE.floor + (1 - WP_SIZE.floor) * t).toFixed(3));
  box.style.setProperty("--halo-scale", halo.toFixed(3));
}

function markSelected(id) {
  state.selectedId = id;
  for (const [wid, marker] of waypointMarkers) {
    marker.getElement().classList.toggle("is-selected", wid === id);
  }
}

// ---------------------------------------------------------------- bottom sheet

function openSheet(kind, html) {
  const sheet = $("#sheet");
  state.sheet = kind;
  sheet.dataset.kind = kind;
  sheet.innerHTML = html;
  sheet.hidden = false;
  $("#view-map").classList.add("has-sheet");   // map buttons hide behind the sheet
  sheet.scrollTop = 0;
  sheet.setAttribute("aria-label", {
    add: "New waypoint", waypoint: "Waypoint details", more: "More", list: "Your waypoints",
    info: "Map info", confirm: "Please confirm"
  }[kind] || "");
}

function closeSheet() {
  const sheet = $("#sheet");
  if (!sheet) return;
  sheet.hidden = true;
  sheet.innerHTML = "";
  state.sheet = null;
  $("#view-map").classList.remove("has-sheet");
  revokePhotoUrls();
  if (draftMarker) { draftMarker.remove(); draftMarker = null; }
  state.draft = null;
  if (state.selectedId) markSelected(null);
}

let photoUrls = [];
function photoUrl(blob) { const u = URL.createObjectURL(blob); photoUrls.push(u); return u; }
function revokePhotoUrls() { photoUrls.forEach((u) => URL.revokeObjectURL(u)); photoUrls = []; }

function sheetHead(title, sub, { icon = "", closeAction = "close-sheet", closeLabel = "Close" } = {}) {
  return `<div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head">
      ${icon}
      <div class="sheet-titles">
        <h2 class="sheet-title">${esc(title)}</h2>
        ${sub ? `<p class="sheet-sub">${esc(sub)}</p>` : ""}
      </div>
      <button type="button" class="icon-btn" data-action="${closeAction}" aria-label="${closeLabel}">${ICONS.close}</button>
    </div>`;
}

// ---------------------------------------------------------------- adding and editing a waypoint

function startAdd(lngLat, source) {
  if (!state.current) return;
  const now = Date.now();
  if (now - lastAddAt < 800) return;   // a long press can arrive twice on some phones
  lastAddAt = now;
  const lat = lngLat.lat, lon = lngLat.lng;
  // Waypoints show only on maps that cover their spot, so one pressed beside the printed
  // page would vanish once saved. (The orange + adds one where you are, even off the map.)
  if (source === "pressed" && !onCurrentMap(lat, lon)) {
    toast("Press and hold on the map itself to add a waypoint there.");
    return;
  }
  $("#tip").hidden = true;
  // Pressing again while adding moves the new waypoint to the new spot.
  if (state.sheet === "add" && state.draft && !state.draft.id) {
    syncDraftFromForm();
    revokePhotoUrls();
    Object.assign(state.draft, { lat, lon, source });
  } else {
    closeSheet();
    const lastType = Settings.get("lastType");
    state.draft = {
      id: null, type: SYMBOLS.some((s) => s.type === lastType) ? lastType : "campsite",
      name: "", description: "", link: "", showLink: false, photos: [], lat, lon, source
    };
  }
  renderAddSheet();
  drawDraftMarker();
  revealAboveSheet([lon, lat]);
}

function startEdit(id) {
  const w = state.waypoints.find((x) => x.id === id);
  if (!w) return;
  closeSheet();
  state.draft = { ...w, photos: [...(w.photos || [])], showLink: !!w.link, source: "saved" };
  renderAddSheet();
  revealAboveSheet([w.lon, w.lat]);
}

function drawDraftMarker() {
  const d = state.draft;
  if (!d || d.id) return;
  const el = document.createElement("div");
  el.className = "draft-marker" + (d.type === "existing" ? " is-halo" : "");
  el.innerHTML = d.type === "existing" ? '<span class="halo"></span>'
    : symbolSvg(d.type, { size: 28, fill: cssVar("--map-yours"), edge: cssVar("--map-edge") });
  if (draftMarker) draftMarker.remove();
  draftMarker = new maplibregl.Marker({ element: el }).setLngLat([d.lon, d.lat]).addTo(map);
}

function syncDraftFromForm() {
  const d = state.draft;
  if (!d || state.sheet !== "add") return;
  d.name = $("#f-name").value;
  d.description = $("#f-desc").value;
  d.link = $("#f-link").value;
}

function renderAddSheet() {
  const d = state.draft;
  const existing = d.type === "existing";
  const where = { gps: "At your location", pressed: "Where you pressed", saved: "Saved spot" }[d.source] +
    (onCurrentMap(d.lat, d.lon) ? "" : ", outside this map");
  const title = d.id ? (existing ? "Edit your note" : "Edit waypoint")
    : existing ? "Add to a printed symbol" : "New waypoint";
  const sub = existing && !d.id
    ? "Your note shows as an orange ring around the symbol"
    : `${where} · ${fmtCoords(d.lat, d.lon)}`;
  const picks = [EXISTING, ...SYMBOLS].map((s) =>
    `<button type="button" class="symbol-btn" role="radio" aria-checked="${s.type === d.type}"
      data-action="pick-symbol" data-type="${s.type}">
      ${symbolSvg(s.type, { size: 26, fill: "currentColor", detail: s.type === "existing" ? cssVar("--ink") : "#FFFFFF" })}
      <span>${esc(s.name)}</span></button>`).join("");
  const photos = d.photos.map((p, i) =>
    `<div class="photo-thumb"><img src="${photoUrl(p)}" alt="Photo ${i + 1}">
      <button type="button" data-action="remove-photo" data-index="${i}" aria-label="Remove photo ${i + 1}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button></div>`).join("");
  openSheet("add", `
    ${sheetHead(title, sub, { closeAction: "cancel-add", closeLabel: "Cancel" })}
    <div class="field" role="radiogroup" aria-label="Symbol">
      <span class="stamp muted">Symbol</span>
      <div class="symbol-grid">${picks}</div>
    </div>
    <label class="field">${existing ? "What's printed here" : "Name"}
      <input id="f-name" type="text" maxlength="80" autocomplete="off" value="${esc(d.name)}"
        placeholder="${existing ? "Optional, for example Campsite 1" : esc(symbolFor(d.type).name)}">
    </label>
    <label class="field">${existing ? "Your note" : "Description"}
      <textarea id="f-desc" rows="2" maxlength="2000"
        placeholder="${existing ? "What do you want to remember here?" : "Optional"}">${esc(d.description)}</textarea>
    </label>
    <div class="photo-row">${photos}</div>
    <label class="field" ${d.showLink ? "" : "hidden"}>Link
      <input id="f-link" type="url" inputmode="url" autocomplete="off" placeholder="https://" value="${esc(d.link)}">
    </label>
    <div class="btn-row">
      <button type="button" class="btn btn-outline" data-action="add-photo">${ICONS.camera} Add photo</button>
      <button type="button" class="btn btn-outline" data-action="add-link" ${d.showLink ? "hidden" : ""}>${ICONS.link} Add link</button>
    </div>
    <button type="button" class="btn btn-primary btn-block" data-action="save-waypoint">
      ${existing ? "Save note" : d.id ? "Save changes" : "Save waypoint"}</button>`);
}

// Photos are shrunk to at most 1600 px before saving, to keep the phone's storage small.
async function shrinkPhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob || file;
  } catch {
    return file;
  }
}

async function saveWaypoint() {
  syncDraftFromForm();
  const d = state.draft;
  let link = d.link.trim();
  if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
  const record = {
    id: d.id || newId(),
    type: d.type,                       // the symbol type, as in QGIS; "existing" = halo
    name: d.name.trim() || (d.type === "existing" ? "" : symbolFor(d.type).name),
    description: d.description.trim(),
    link,
    photos: d.photos,
    lat: d.lat, lon: d.lon,             // stored by coordinates: shows on every map here
    mpmwId: d.mpmwId || null,           // printed waypoint id, once waypoints.geojson exists
    mapId: d.mapId || (state.current ? state.current.id : null),
    createdAt: d.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  try {
    await Store.put("waypoints", record);
  } catch (err) {
    console.error(err);
    toast("Couldn't save on this phone. Is the phone's storage full?", 5000);
    return;
  }
  state.waypoints = state.waypoints.filter((w) => w.id !== record.id).concat(record);
  if (d.type !== "existing") Settings.set("lastType", d.type);
  Settings.set("tipSeen", "1");     // they've found press and hold
  closeSheet();
  renderWaypointMarkers();
  if (!onCurrentMap(record.lat, record.lon)) {
    toast("Saved on this phone. It's outside this map, so it shows on maps that cover that spot.", 5000);
  } else {
    toast(record.type === "existing" ? "Note saved on this phone" : "Waypoint saved on this phone", 2500);
  }
}

// ---------------------------------------------------------------- waypoint popup

function openWaypoint(id) {
  const w = state.waypoints.find((x) => x.id === id);
  if (!w) return;
  if (state.sheet === "add") return;     // finish or cancel the new waypoint first
  revokePhotoUrls();
  markSelected(id);
  const existing = w.type === "existing";
  const dist = state.fix ? fmtDistance(distanceM(state.fix.lat, state.fix.lon, w.lat, w.lon)) + " from you" : "";
  const sub = [existing ? "Your note on a printed symbol" : "Your waypoint", dist].filter(Boolean).join(" · ");
  const icon = `<span class="sheet-icon">${symbolSvg(w.type, { size: 26, fill: cssVar("--yours"), detail: existing ? cssVar("--ink") : "#FFFFFF" })}</span>`;
  const photos = (w.photos || []).length ? `
    <div class="photos">
      <div class="photos-strip" id="photos-strip">${w.photos.map((p, i) => `<img src="${photoUrl(p)}" alt="Photo ${i + 1} of ${w.photos.length}">`).join("")}</div>
      ${w.photos.length > 1 ? `<span class="photos-count" id="photos-count">1 of ${w.photos.length}</span>` : ""}
    </div>` : "";
  openSheet("waypoint", `
    ${sheetHead(w.name || (existing ? "Your note" : "Waypoint"), sub, { icon })}
    ${photos}
    ${w.description ? `<p class="sheet-text">${esc(w.description)}</p>` : ""}
    ${w.link ? `<a class="btn btn-outline btn-block" href="${esc(w.link)}" target="_blank" rel="noopener">${ICONS.external} Open link <span class="muted">· needs a signal</span></a>` : ""}
    <div class="sheet-divider"></div>
    <div class="sheet-foot">
      <div class="sheet-foot-text"><b>${existing ? "Your note" : "Yours"}</b><span>Saved on this phone</span></div>
      <button type="button" class="btn btn-outline" data-action="edit-waypoint" data-id="${esc(w.id)}">${ICONS.pencil} Edit</button>
      <button type="button" class="btn btn-outline btn-danger" data-action="delete-waypoint" data-id="${esc(w.id)}" aria-label="Delete">${ICONS.trash}</button>
    </div>`);
  const strip = $("#photos-strip");
  if (strip && $("#photos-count")) {
    strip.addEventListener("scroll", () => {
      const i = Math.round(strip.scrollLeft / strip.clientWidth) + 1;
      $("#photos-count").textContent = `${i} of ${w.photos.length}`;
    }, { passive: true });
  }
  revealAboveSheet([w.lon, w.lat]);
}

// "Keep it" goes back to where the question came from (noAction), not all the way out.
function confirmSheet(title, text, yesLabel, yesAction, id = "", noAction = "close-sheet") {
  openSheet("confirm", `
    ${sheetHead(title, "")}
    <p class="sheet-text">${esc(text)}</p>
    <div class="btn-row">
      <button type="button" class="btn btn-outline" data-action="${noAction}" data-id="${esc(id)}">Keep it</button>
      <button type="button" class="btn btn-danger-fill" data-action="${yesAction}" data-id="${esc(id)}">${esc(yesLabel)}</button>
    </div>`);
}

async function deleteWaypoint(id) {
  try { await Store.remove("waypoints", id); } catch (err) { console.error(err); }
  state.waypoints = state.waypoints.filter((w) => w.id !== id);
  closeSheet();
  renderWaypointMarkers();
  toast("Deleted", 2000);
}

// ---------------------------------------------------------------- More menu, list, map info

function openMore() {
  const count = waypointsOnCurrentMap().length;
  const canRemove = state.current && !state.current.url;
  openSheet("more", `
    ${sheetHead(state.current.title, "")}
    <div class="menu">
      <button type="button" class="menu-item" data-action="list-waypoints">
        ${ICONS.flag}<span class="menu-item-text"><b>Your waypoints</b><span>On this map, saved on this phone</span></span>
        <span class="menu-count">${count}</span>
      </button>
      <button type="button" class="menu-item" role="switch" aria-checked="${state.aligning}" data-action="toggle-align">
        ${ICONS.layers}<span class="menu-item-text"><b>Check alignment</b><span>Lays OpenStreetMap under the map to check it lines up. Needs a signal.</span></span>
        <span class="switch" aria-hidden="true"></span>
      </button>
      <button type="button" class="menu-item" data-action="map-info">
        ${ICONS.info}<span class="menu-item-text"><b>Map info</b><span>Size, zoom range, where it's saved</span></span>
      </button>
      ${canRemove ? `<button type="button" class="menu-item is-danger" data-action="remove-map">
        ${ICONS.remove}<span class="menu-item-text"><b>Remove from this phone</b><span>Your waypoints stay</span></span>
      </button>` : ""}
    </div>`);
}

function openList() {
  const list = waypointsOnCurrentMap().map((w) => ({
    w, d: state.fix ? distanceM(state.fix.lat, state.fix.lon, w.lat, w.lon) : null
  }));
  list.sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : (a.w.name || "").localeCompare(b.w.name || "")));
  const rows = list.map(({ w, d }) => `
    <button type="button" class="menu-item" data-action="goto-waypoint" data-id="${esc(w.id)}">
      <span class="wp-row-icon">${symbolSvg(w.type, { size: 22, fill: cssVar("--yours"), detail: w.type === "existing" ? cssVar("--ink") : "#FFFFFF" })}</span>
      <span class="menu-item-text"><b>${esc(w.name || "Your note")}</b><span>${esc([
        w.type === "existing" ? "Note on a printed symbol" : symbolFor(w.type).name,
        d !== null ? fmtDistance(d) + " from you" : ""].filter(Boolean).join(" · "))}</span></span>
      ${ICONS.chevron}
    </button>`).join("");
  openSheet("list", `
    ${sheetHead("Your waypoints", state.current.title)}
    ${rows ? `<div class="menu">${rows}</div>`
      : `<p class="empty-note">No waypoints on this map yet. Press and hold the map to add one, or tap the orange + to add one where you are.</p>`}`);
}

function openInfo() {
  const m = state.current;
  const [w, s, e, n] = m.bounds;
  const rows = [
    ["Map", m.title],
    m.region && ["Area", m.region],
    ["Made by", m.publisher === "mpmw" ? "MountainPrana Map Works" : "Imported by you"],
    m.version && ["Version", m.version],
    ["File", m.fileName],
    m.size && ["Size", fmtSize(m.size)],
    ["Zoom levels", `${m.minZoom} to ${m.maxZoom}`],
    ["Covers", `${fmtCoords(s, w)} to ${fmtCoords(n, e)}`],
    window.magvar && ["Compass correction", fmtDeclination(magvar.magvar((s + n) / 2, (w + e) / 2))],
    ["Saved", m.saved ? "On this phone: works with no signal" : m.url ? "Test file on the computer" : "Not saved on this phone"],
    ["App", `Haiku beta ${APP_VERSION}`]
  ].filter(Boolean);
  openSheet("info", `
    ${sheetHead("Map info", "")}
    <dl class="info-list">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`);
}

// 9.75 -> "9.8° east of true north (NOAA World Magnetic Model 2025)"
function fmtDeclination(deg) {
  return `${Math.abs(deg).toFixed(1)}° ${deg >= 0 ? "east" : "west"} of true north (NOAA World Magnetic Model 2025)`;
}

async function removeCurrentMap() {
  const m = state.current;
  try { await Store.remove("maps", m.id); } catch (err) { console.error(err); }
  state.maps = state.maps.filter((x) => x.id !== m.id);
  state.current = null;
  if (map.getLayer("printed")) map.removeLayer("printed");
  if (map.getSource("printed")) map.removeSource("printed");
  renderWaypointMarkers();
  toast(`Removed ${m.title} from this phone`);
  backToMaps();
}

// ---------------------------------------------------------------- Haiku menu (My maps)

function openAppMenu() {
  const items = [`<button type="button" class="menu-item" data-action="about">
      ${ICONS.info}<span class="menu-item-text"><b>About Haiku</b><span>What it is, version and credits</span></span>${ICONS.chevron}
    </button>`];
  if (MAP_STORE_URL) {
    items.push(`<a class="menu-item" href="${esc(MAP_STORE_URL)}" target="_blank" rel="noopener">
      ${ICONS.store}<span class="menu-item-text"><b>Map Store</b><span>MountainPrana maps · needs a signal</span></span>${ICONS.external}
    </a>`);
  }
  const sheet = $("#app-sheet");
  sheet.innerHTML = sheetHead("Haiku", `Beta ${APP_VERSION}`, { closeAction: "close-app-menu" }) +
    `<div class="menu">${items.join("")}</div>`;
  sheet.hidden = false;
  $("#app-scrim").hidden = false;
}

function closeAppMenu() {
  const sheet = $("#app-sheet");
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  sheet.innerHTML = "";
  $("#app-scrim").hidden = true;
}

// ---------------------------------------------------------------- buttons

const actions = {
  // Welcome shows once, so My maps replaces it (back doesn't return to it).
  "welcome-done": () => { Settings.set("welcomed", "1"); go("#maps", true); },
  "welcome-import": () => { Settings.set("welcomed", "1"); go("#maps", true); $("#file-map").click(); },
  "import": () => $("#file-map").click(),
  "hide-install-hint": () => { Settings.set("installHintHidden", "1"); $("#install-hint").hidden = true; },
  "open-map": (el) => go("#map/" + encodeURIComponent(el.dataset.id)),
  "back": backToMaps,
  "app-menu": openAppMenu,
  "close-app-menu": closeAppMenu,
  "about": () => { closeAppMenu(); go("#about"); },
  "about-back": backToMaps,
  "north-up": () => {
    if (state.compass) setCompass(false);
    map.easeTo({ bearing: 0, duration: 400 });
  },
  // Showing the whole map stops following you, so the next GPS fix doesn't pull it away.
  "fit": () => { setFollowing(false); if (state.compass) setCompass(false); fitWhole(); },
  "follow": onFollow,
  "add-here": () => {
    if (state.fix) return startAdd({ lat: state.fix.lat, lng: state.fix.lon }, "gps");
    toast(state.gps === "denied"
      ? "Location is off. Press and hold the map to add a waypoint anywhere."
      : "Still finding your location. You can also press and hold the map to add a waypoint anywhere.", 5000);
  },
  "tip-ok": () => { Settings.set("tipSeen", "1"); $("#tip").hidden = true; },
  "more": () => (state.sheet === "more" ? closeSheet() : openMore()),
  "close-sheet": closeSheet,
  "cancel-add": closeSheet,
  "pick-symbol": (el) => {
    syncDraftFromForm();
    state.draft.type = el.dataset.type;
    revokePhotoUrls();
    renderAddSheet();
    drawDraftMarker();
  },
  "add-photo": () => $("#file-photo").click(),
  "remove-photo": (el) => {
    syncDraftFromForm();
    state.draft.photos.splice(Number(el.dataset.index), 1);
    revokePhotoUrls();
    renderAddSheet();
  },
  "add-link": () => {
    syncDraftFromForm();
    state.draft.showLink = true;
    revokePhotoUrls();
    renderAddSheet();
    $("#f-link").focus();
  },
  "save-waypoint": saveWaypoint,
  "edit-waypoint": (el) => startEdit(el.dataset.id),
  "delete-waypoint": (el) => {
    const w = state.waypoints.find((x) => x.id === el.dataset.id);
    confirmSheet(`Delete ${w.name ? "“" + w.name + "”" : "this note"}?`,
      "This removes it from this phone. It can't be undone.", "Delete", "confirm-delete-waypoint", w.id,
      "open-waypoint");
  },
  "open-waypoint": (el) => openWaypoint(el.dataset.id),
  "confirm-delete-waypoint": (el) => deleteWaypoint(el.dataset.id),
  "list-waypoints": openList,
  "goto-waypoint": (el) => {
    const w = state.waypoints.find((x) => x.id === el.dataset.id);
    closeSheet();
    setFollowing(false);
    map.jumpTo({ center: [w.lon, w.lat], zoom: Math.max(map.getZoom(), 15) });
    openWaypoint(w.id);
  },
  "toggle-align": (el) => {
    setAlignment(!state.aligning);
    el.setAttribute("aria-checked", String(state.aligning));
  },
  "map-info": openInfo,
  "remove-map": () => confirmSheet(`Remove ${state.current.title}?`,
    "The map file comes off this phone; your waypoints stay. To use the map again, open its file again.",
    "Remove", "confirm-remove-map", "", "more"),
  "confirm-remove-map": removeCurrentMap
};

// Ignore the click that comes from lifting the finger after a long press, so it doesn't
// also press a button in the sheet that just opened under it.
document.addEventListener("click", (e) => {
  if (Date.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); }
}, true);

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el, e);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (state.sheet) closeSheet();
  closeAppMenu();
});

$("#file-map").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";            // so the same file can be picked again
  openMapFile(file);
});

$("#file-photo").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!state.draft || !files.length) return;
  syncDraftFromForm();
  for (const f of files) state.draft.photos.push(await shrinkPhoto(f));
  revokePhotoUrls();
  renderAddSheet();
});

// ---------------------------------------------------------------- start

async function start() {
  try {
    state.maps = (await Store.all("maps")).map((m) => ({ ...m, saved: true }));
    state.waypoints = await Store.all("waypoints");
  } catch (err) {
    console.warn("Saving on this phone isn't available:", err);
    state.storageOk = false;
  }
  const testUrl = new URLSearchParams(location.search).get("map");
  if (testUrl) return openMapUrl(testUrl);
  route();
}

start();

// Keep a copy of the app on the phone so it opens with no signal (see sw.js).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
