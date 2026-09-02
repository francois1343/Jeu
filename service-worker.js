const CACHE = "arcade-station-v30";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/home.css",
  "./css/shared/arcade-home.css",
  "./js/home.js",
  "./js/pwa-config.js",
  "./js/pwa-install.js",
  "./js/core/arcade-config.js",
  "./js/core/arcade-local-store.js",
  "./js/core/arcade-stats.js",
  "./js/core/arcade-feedback.js",
  "./js/core/arcade-platform.js",
  "./js/core/arcade-shop.js",
  "./js/core/arcade-game-sdk.js",
  "./js/core/arcade-game-config.js",
  "./js/core/arcade-game-preferences.js",
  "./js/core/arcade-game-shell.js",
  "./css/shared/arcade-game-shell.css",
  "./js/arcade-admin-loader.js",
  "./games/dice-hub/dice-hub.html",
  "./games/dice-hub/dice-hub.css",
  "./games/dice-hub/dice-hub.js",
  "./assets/icons/arcade-icon-v2-180.png",
  "./assets/icons/arcade-icon-v2-192.png",
  "./assets/icons/arcade-icon-v2-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("arcade-station-") && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function cacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
}

async function saveResponse(request, response) {
  if (!response || !response.ok || new URL(request.url).origin !== self.location.origin) return response;
  const cache = await caches.open(CACHE);
  await cache.put(cacheKey(request), response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    return await saveResponse(request, await fetch(request));
  } catch {
    return (await caches.match(cacheKey(request)))
      || (await caches.match("./index.html"))
      || new Response("Hors connexion", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(cacheKey(request));
  const network = fetch(request).then((response) => saveResponse(request, response)).catch(() => null);
  return cached || (await network) || new Response("Ressource indisponible", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const needsFreshVersion = request.mode === "navigate"
    || request.destination === "style"
    || request.destination === "script";
  event.respondWith(needsFreshVersion ? networkFirst(request) : staleWhileRevalidate(request));
});
