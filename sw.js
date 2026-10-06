const CACHE_NAME = "ninetofiveish-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./sync.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Stale-while-revalidate: vis det som ligger i cache med en gang, men hent
// ny versjon i bakgrunnen så oppdateringer dukker opp neste gang appen åpnes
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Aldri cache andre domener (f.eks. Dropbox)
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
