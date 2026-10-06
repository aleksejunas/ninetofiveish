const CACHE_NAME = "ninetofiveish-v6";
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
    // cache: "reload" forbi HTTP-cachen, så alle filene er fra samme versjon
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: "reload" }))),
      ),
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

// Network-first: hent alltid fersk versjon når nettet er der, så HTML og JS
// aldri blandes fra ulike versjoner. Cachen brukes offline eller hvis nettet
// bruker mer enn 3 sekunder.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Aldri cache andre domener (f.eks. Dropbox)
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const network = fetch(event.request, { cache: "no-cache" }).then(
        (res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        },
      );
      const cached = await cache.match(event.request);
      if (!cached) return network;
      const timeout = new Promise((resolve) =>
        setTimeout(() => resolve(cached), 3000),
      );
      return Promise.race([network.catch(() => cached), timeout]);
    }),
  );
});
