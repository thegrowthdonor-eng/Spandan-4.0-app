"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV === "development") {
      // A service worker must not sit in front of Next's dev server. Cached RSC
      // payloads or Turbopack chunks can otherwise make client navigation hang
      // after a code/data change even though the route itself is healthy.
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const controlledBySpandan = navigator.serviceWorker.controller?.scriptURL.endsWith("/sw.js") === true;
        const ownedRegistrations = registrations.filter((registration) => {
          const worker = registration.active ?? registration.waiting ?? registration.installing;
          return worker?.scriptURL.endsWith("/sw.js");
        });
        await Promise.allSettled(
          ownedRegistrations.map((registration) => registration.unregister()),
        );

        // Delete after unregistering so an old worker cannot recreate its cache
        // while it is still servicing this page's initial requests.
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.allSettled(
            keys
              .filter((key) => key.startsWith("spandan-public-shell-"))
              .map((key) => caches.delete(key)),
          );
        }

        // Unregistering does not release an already-controlled tab until its
        // next load. Refresh exactly once so the repaired dev session is fully
        // detached from the stale worker.
        if (controlledBySpandan && ownedRegistrations.length > 0) window.location.reload();
      })().catch(() => undefined);
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, []);
  return null;
}
