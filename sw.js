// Service worker — rend l'application installable et utilisable hors-ligne
const CACHE = 'gt-cache-v1';
const ASSETS = ['/index.html', '/config.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // L'API passe toujours par le réseau (jamais de cache)
  if (url.pathname.startsWith('/api/')) return;
  // Les pages HTML : réseau d'abord (toujours à jour), cache en secours
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Le reste (icônes, manifeste) : cache d'abord
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
