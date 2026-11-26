/* TickLO service worker (TKT-06).
 * Deliberately minimal: it never caches pages, API responses or QR tokens
 * (tickets must always be live). It only shows an offline page when a
 * navigation fails because there is no internet. */
const CACHE = "ticklo-offline-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    }),
  );
});
