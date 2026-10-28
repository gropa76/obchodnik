'use strict';
// Service worker: appka se načte i bez internetu.
// Ukládá jen soubory appky, nikdy data (ta jsou zašifrovaná v IndexedDB).
// Při každé změně souborů zvyš číslo verze, aby se načetly nové.
const VERSION = 'obchodnik-v0.3.0';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/util.js',
  'js/crypto.js',
  'js/db.js',
  'js/store.js',
  'js/model.js',
  'js/ui.js',
  'js/views/lock.js',
  'js/views/kalendar.js',
  'js/views/podniky.js',
  'js/views/poznamky.js',
  'js/views/nastaveni.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Nejdřív síť (aby se projevily úpravy), bez sítě uložená verze.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // cache: 'no-cache' = vždy se zeptat serveru, jestli není nová verze (bez čekání na paměť prohlížeče).
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
