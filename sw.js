// Service worker : le jeu fonctionne hors ligne (hors mode téléphones qui a besoin du réseau local/internet).
const VERSION = 'em-v1';
const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/ui.js', 'js/engine.js', 'js/data.js', 'js/ai.js', 'js/knowledge.js', 'js/net.js',
  'js/vendor/peerjs.min.js', 'js/vendor/qrcode.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
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
    fetch(e.request).then((r) => {
      const copie = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copie));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
