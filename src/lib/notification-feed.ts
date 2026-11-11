import type { FestivalNotification } from "@/app/api/public/notifications/route";

export const NOTIFICATION_INTERVAL = 300_000;
let items: FestivalNotification[] | null = null;
let nextFetch = 0;
let failures = 0;
let pending: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(items: FestivalNotification[]) => void>();

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (listeners.size && !document.hidden) timer = setTimeout(() => void refresh(), Math.max(0, nextFetch - Date.now()));
}

async function refresh() {
  if (document.hidden) return;
  if (Date.now() < nextFetch) { schedule(); return; }
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch("/api/public/notifications", { credentials: "omit" });
      const body = await response.json();
      if (!response.ok || !body.ok || !Array.isArray(body.items)) throw new Error("Feed unavailable");
      items = body.items;
      failures = 0;
      for (const listener of listeners) listener(items!);
    } catch { failures = Math.min(failures + 1, 4); }
    finally {
      nextFetch = Date.now() + NOTIFICATION_INTERVAL * 2 ** failures;
      pending = null;
      schedule();
    }
  })();
  return pending;
}

function onVisibility() { if (document.hidden) { if (timer) clearTimeout(timer); timer = null; } else void refresh(); }

export function subscribeNotifications(listener: (items: FestivalNotification[]) => void) {
  listeners.add(listener);
  if (items) listener(items);
  if (listeners.size === 1) document.addEventListener("visibilitychange", onVisibility);
  void refresh();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}
