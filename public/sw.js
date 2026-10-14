const CACHE_NAME = "spandan-public-shell-v1";
const PUBLIC_SHELL = ["/", "/offline"];
const PRIVATE_PREFIXES = ["/account", "/admin", "/api"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))); self.clients.claim(); });
self.addEventListener("fetch", (event) => { const request = event.request; const url = new URL(request.url); if (request.method !== "GET" || url.origin !== self.location.origin || PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return; if (request.mode === "navigate") event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match("/offline")))); });
