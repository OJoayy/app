// sw.js — garde l'app en mémoire pour qu'elle s'ouvre sans internet.
// À chaque nouvelle version : changer VERSION, sinon le téléphone garde l'ancienne.

const VERSION = 'fp-v0.6';
const FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/crypto.js',
  './js/store.js',
  './js/i18n.js',
  './js/ledger.js',
  './js/screens.js',
  './js/widgets.js',
  './js/fx.js',
  './js/ui.js',
  './js/finance.js',
  './js/debts.js',
  './js/assets.js',
  './fonts/figtree.woff2',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' = toujours la version fraîche du serveur, jamais un mélange.
  event.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fp-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.open(VERSION).then((c) => c.match('./index.html')).then((r) => r || fetch(req)));
    return;
  }
  // On ne lit que NOTRE cache (pas ceux d'autres sites de la même adresse).
  event.respondWith(caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true })).then((r) => r || fetch(req)));
});
