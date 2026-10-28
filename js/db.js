'use strict';
// Úložiště v prohlížeči (IndexedDB).
// 'meta'    – nastavení a zabalené klíče (nic čitelného o podnicích)
// 'records' – zašifrované záznamy { id, updatedAt, iv, ct }
(function (App) {
  const D = {};
  let dbPromise = null;

  D.open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('obchodnik', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('meta');
          db.createObjectStore('records', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  };

  const tx = async (storeName, mode, fn) => {
    const db = await D.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };

  D.getMeta = (key) => tx('meta', 'readonly', (s) => s.get(key));
  D.setMeta = (key, value) => tx('meta', 'readwrite', (s) => s.put(value, key));
  D.allRecords = () => tx('records', 'readonly', (s) => s.getAll());
  D.putRecord = (rec) => tx('records', 'readwrite', (s) => s.put(rec));

  App.db = D;
})(window.App);
