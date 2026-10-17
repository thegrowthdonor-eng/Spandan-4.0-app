"use client";

import { useEffect, useState } from "react";

type Props = {
  isAuthenticated: boolean;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

export function InstalledAppNotificationPrompt({ isAuthenticated }: Props) {
  const [visible, setVisible] = useState(false);

  async function activatePushSubscription() {
    if (!isAuthenticated || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (await registration.pushManager.getSubscription()) return;

      const keyResponse = await fetch("/api/push/subscribe", { cache: "no-store" });
      if (!keyResponse.ok) return;

      const { publicKey } = await keyResponse.json();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const keys = subscription.toJSON().keys;

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: keys?.p256dh,
          auth: keys?.auth,
          userAgent: navigator.userAgent,
        }),
      });
    } catch {
      // Permission and subscription errors can be retried from My Fest settings.
    }
  }

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

    if (!isStandalone || !supported) return;

    if (Notification.permission === "granted") {
      void activatePushSubscription();
      return;
    }

    if (Notification.permission !== "default") return;

    const timer = window.setTimeout(() => setVisible(true), 1650);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  async function requestPermission() {
    const permission = await Notification.requestPermission();
    setVisible(false);

    if (permission === "granted") {
      void activatePushSubscription();
    }
  }

  if (!visible) return null;

  return (
    <aside className="notification-onboarding" role="dialog" aria-label="Enable festival alerts">
      <div className="notification-onboarding-icon" aria-hidden>✦</div>
      <div>
        <p className="notification-onboarding-eyebrow">SPANDAN 4.0 ALERTS</p>
        <strong>Stay in the moment.</strong>
        <span>Get schedule changes, results and urgent festival notices on your phone.</span>
      </div>
      <div className="notification-onboarding-actions">
        <button type="button" onClick={() => void requestPermission()}>Allow notifications</button>
        <button type="button" onClick={() => setVisible(false)}>Not now</button>
      </div>
    </aside>
  );
}
