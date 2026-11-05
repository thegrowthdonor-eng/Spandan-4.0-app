const CACHE_NAME = "spandan-public-shell-v11";
const PUBLIC_SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/icon.svg",
  "/spandan-logo.png",
  "/spandan-logo-maskable-192.png",
  "/spandan-logo-maskable-512.png",
  "/scorer"
];
// Never persist routes that can render student identity, account status or setup controls.
const PRIVATE_PREFIXES = ["/account", "/admin", "/api", "/my-fest", "/home", "/live", "/setup"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        PUBLIC_SHELL.map(async (path) => {
          const response = await fetch(path, { cache: "reload" });
          if (response.ok) await cache.put(path, response);
        })
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("spandan-public-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isNextRuntimeRequest =
    url.pathname.startsWith("/_next/") ||
    url.searchParams.has("_rsc") ||
    request.headers.get("rsc") === "1" ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.get("accept")?.includes("text/x-component");

  // Content-hashed Next assets are safe to retain for the dedicated offline
  // scorer. API/RSC responses remain excluded so no private data is cached.
  if (request.method === "GET" && url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
      if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
      return response;
    })));
    return;
  }

  if (request.method === "GET" && url.origin === self.location.origin && request.mode === "navigate" && url.pathname === "/scorer") {
    const canonical = new Request("/scorer", { credentials: "same-origin" });
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) (await caches.open(CACHE_NAME)).put(canonical, response.clone());
      return response;
    }).catch(() => caches.match(canonical).then((cached) => cached || caches.match("/offline"))));
    return;
  }

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    isNextRuntimeRequest ||
    url.pathname === "/" ||
    PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return;
  }

  // Network first for HTML navigate, fallback to cache, then /offline
  if (request.mode === "navigate") {
    const networkResponse = fetch(request);
    event.waitUntil(
      networkResponse
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
        })
        .catch(() => undefined)
    );
    event.respondWith(
      networkResponse
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline")))
    );
    return;
  }

  // Only cache stable public assets. Next owns its runtime chunks and route
  // payload cache, so the service worker deliberately stays out of that path.
  if (!["image", "font", "style"].includes(request.destination)) return;

  const networkFetch = fetch(request);
  event.waitUntil(
    networkFetch
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
      })
      .catch(() => undefined)
  );
  event.respondWith(caches.match(request).then((cached) => cached || networkFetch));
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "spandan-score-sync") return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: "SPANDAN_SYNC_SCORES" }));
  }));
});

// ==========================================
// Web Push Notifications Handlers (R17)
// ==========================================
self.addEventListener("push", (event) => {
  let payload = {
    title: "Spandan 4.0",
    body: "New festival bulletin received.",
    url: "/my-fest"
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body || "New festival update from the organising committee.",
    icon: "/spandan-logo.png",
    badge: "/spandan-logo.png",
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || "/my-fest"
    }
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Spandan 4.0 Alert", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/my-fest";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

