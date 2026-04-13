const CACHE = "snake-neon-v1";
const FILES = [
    "./",
    "./index.html",
    "./game.js",
    "./manifest.json"
];

self.addEventListener("install", e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(FILES))
    );
});

self.addEventListener("fetch", e => {
    e.respondWith(
        caches.match(e.request).then(resp => resp || fetch(e.request))
    );
});
