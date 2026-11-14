// Service worker : le jeu fonctionne hors ligne (le mode En ligne a besoin d'internet).
const VERSION = 'em-v4';
const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js?v=4', 'js/ui.js', 'js/engine.js', 'js/data.js', 'js/ai.js', 'js/knowledge.js',
  'en-ligne.js?v=4',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(FICHIERS.map((u) => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Réseau d'abord (pour recevoir les mises à jour), cache en secours.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((r) => {
      const copie = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copie));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
