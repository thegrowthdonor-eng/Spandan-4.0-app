const CACHE_NAME = "spandan-public-shell-v9";
const PUBLIC_SHELL = [
  "/offline",
  "/events",
  "/schedule",
  "/standings",
  "/notices",
  "/sponsors",
  "/faqs",
  "/gallery",
  "/merchandise",
  "/committee",
  "/manifest.webmanifest",
  "/icon.svg",
  "/spandan-logo.png",
  "/spandan-logo-maskable-192.png",
  "/spandan-logo-maskable-512.png"
];
// Never persist routes that can render student identity, account status or setup controls.
const PRIVATE_PREFIXES = ["/account", "/admin", "/api", "/my-fest", "/home", "/live", "/setup"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/" ||
    PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return;
  }

  // Network first for HTML navigate, fallback to cache, then /offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline")))
    );
  } else {
    // Stale-while-revalidate for static assets
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
        return cached || networkFetch;
      })
    );
  }
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

