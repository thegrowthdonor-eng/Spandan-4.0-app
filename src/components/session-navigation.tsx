"use client";

import { useSyncExternalStore } from "react";
import { BottomNav } from "./bottom-nav";
import { InstalledAppNotificationPrompt } from "./installed-app-notification-prompt";

export const UI_NAV_COOKIE = "spandan_ui_nav";

function readNavCookie(): "" | "member" | "staff" {
  if (typeof document === "undefined") return "";
  const prefix = `${UI_NAV_COOKIE}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length);
      if (value === "staff" || value === "member") return value;
    }
  }
  return "";
}

function subscribeNav(callback: () => void) {
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

/** Client-only UI visibility check so RootLayout stays cookie-free for Static/ISR pages. */
export function SessionNavigation() {
  const navRole = useSyncExternalStore(subscribeNav, readNavCookie, () => "");
  const isAuthenticated = navRole === "member" || navRole === "staff";
  const canManage = navRole === "staff";

  return (
    <>
      <InstalledAppNotificationPrompt isAuthenticated={isAuthenticated} />
      <BottomNav isAuthenticated={isAuthenticated} canManage={canManage} />
    </>
  );
}
