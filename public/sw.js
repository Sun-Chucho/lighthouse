const CACHE_NAME = "lighthouse-shell-v1";

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Network unavailable and no cached response exists.");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (!request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(request.url);

  // API responses contain live business data and must never enter the asset cache.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Next static files are content-hashed. Cache-first is safe and prevents the
  // same JavaScript, CSS, fonts, and optimized images from consuming CDN data
  // again on every visit.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "image"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Documents remain network-first so deployments are picked up immediately,
  // while the last successful response remains available offline.
  if (request.destination === "document" || request.destination === "manifest") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    }),
  );
});
