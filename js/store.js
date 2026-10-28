'use strict';
// Rozšifrovaná data v paměti po odemčení. Při zamčení se vše smaže.
// Každý záznam se ukládá zašifrovaný zvlášť (připraveno na synchronizaci).
(function (App) {
  const S = { key: null };
  const cache = new Map();
  const listeners = new Set();

  S.isOpen = () => !!S.key;

  S.load = async (key) => {
    S.key = key;
    cache.clear();
    const recs = await App.db.allRecords();
    for (const r of recs) {
      try {
        const o = await App.crypto.decryptJSON(key, r);
        cache.set(o.id, o);
      } catch (e) {
        console.error('Záznam nelze dešifrovat:', r.id);
      }
    }
  };

  S.clear = () => {
    S.key = null;
    cache.clear();
  };

  S.list = (type) => [...cache.values()].filter((o) => o.type === type && !o.deleted);
  S.get = (id) => {
    const o = id ? cache.get(id) : null;
    return o && !o.deleted ? o : null;
  };

  S.save = async (obj, opts) => {
    if (!S.key) throw new Error('Appka je zamčená');
    const o = Object.assign({}, obj);
    const now = new Date().toISOString();
    if (!o.id) o.id = App.util.uuid();
    if (!o.created) o.created = now;
    o.updatedAt = now;
    const enc = await App.crypto.encryptJSON(S.key, o);
    await App.db.putRecord({ id: o.id, updatedAt: o.updatedAt, iv: enc.iv, ct: enc.ct });
    cache.set(o.id, o);
    if (!opts || !opts.silent) S.emit();
    return o;
  };

  // Smazání = zašifrovaný záznam "smazáno" (aby se později dalo synchronizovat).
  S.remove = async (id, opts) => {
    const o = cache.get(id);
    if (!o) return;
    await S.save({ id: o.id, type: o.type, created: o.created, deleted: true }, opts);
  };

  S.onChange = (fn) => listeners.add(fn);
  S.emit = () => listeners.forEach((fn) => fn());

  App.store = S;
})(window.App);
