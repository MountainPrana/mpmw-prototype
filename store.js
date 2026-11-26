// Saves maps and waypoints on this phone, in the browser's own database (IndexedDB), so
// they are still there after a reload and with no signal. Nothing is sent anywhere.
//
// Two lists ("stores"):
//   maps       one record per opened map, including the map file itself
//   waypoints  the user's own waypoints and notes, stored by coordinates so they show on
//              every map that covers the spot

"use strict";

const Store = (() => {
  const DB_NAME = "haiku";
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("maps")) db.createObjectStore("maps", { keyPath: "id" });
          if (!db.objectStoreNames.contains("waypoints")) db.createObjectStore("waypoints", { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  async function run(storeName, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = action(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Saving was stopped"));
    });
  }

  return {
    all: (storeName) => run(storeName, "readonly", (s) => s.getAll()),
    put: (storeName, record) => run(storeName, "readwrite", (s) => s.put(record)),
    remove: (storeName, id) => run(storeName, "readwrite", (s) => s.delete(id))
  };
})();

// Small settings (seen the welcome, seen the tip, last symbol used). Kept separately from
// the maps because they are tiny; losing them only shows a tip again.
const Settings = {
  get(key) {
    try { return localStorage.getItem("haiku." + key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem("haiku." + key, String(value)); } catch { /* private mode */ }
  }
};
