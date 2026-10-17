"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationCard() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isClient = typeof window !== "undefined";
    if (!isClient) return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    queueMicrotask(() => setIsIOS(iosDevice));

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      queueMicrotask(() => { setSupported(false); setPermission("unsupported"); });
      return;
    }

    queueMicrotask(() => { setSupported(true); setPermission(Notification.permission); });

    // Check existing registration
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(Boolean(sub));
      });
    });
  }, []);

  async function handleTogglePush() {
    if (!supported) return;
    setLoading(true);
    setMessage(null);

    try {
      const reg = await navigator.serviceWorker.ready;

      if (subscribed) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
        setMessage("Festival lockscreen alerts disabled.");
      } else {
        // Request permission & subscribe
        const perm = await Notification.requestPermission();
        setPermission(perm);

        if (perm !== "granted") {
          setMessage("Notification permission was not granted in your browser.");
          return;
        }

        const keyRes = await fetch("/api/push/subscribe");
        const keyData = await keyRes.json();
        const vapidPublicKey = keyData.publicKey;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        const subJson = sub.toJSON();
        const saveRes = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
            userAgent: navigator.userAgent,
          }),
        });

        if (saveRes.ok) {
          setSubscribed(true);
          setMessage("✓ Lockscreen alerts activated! You will receive live schedule changes & urgent bulletins.");
        } else {
          setMessage("Could not register device with the festival alert server.");
        }
      }
    } catch {
      setMessage("Failed to update notification settings. Please check your browser permissions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="push-alert-card">
      <div className="push-header-row">
        <div>
          <span className="push-tag">Browser Push PWA</span>
          <h3 className="push-title">Festival Lockscreen Alerts</h3>
        </div>
        <span className={`push-status-pill ${subscribed ? "active" : "inactive"}`}>
          {subscribed ? "ALERTS ACTIVE" : "DISABLED"}
        </span>
      </div>

      <p className="push-desc">
        Never miss an emergency notice, sudden match delay or venue shift on ground. 
        Works directly on your phone lockscreen even when your browser tab is closed.
      </p>

      {isIOS && !subscribed && (
        <div className="push-ios-hint">
          <strong>iPhone User Tip:</strong> To enable lockscreen notifications on iOS, install this app first: tap the <em>Share icon (bottom bar)</em> and select <strong>&quot;Add to Home Screen&quot;</strong>.
        </div>
      )}

      {message && <p className="push-msg">{message}</p>}

      <div className="push-actions">
        {permission === "denied" ? (
          <p className="push-denied-note">
            ⚠️ Notifications are blocked in your browser settings. Please click the padlock icon in your URL bar to allow notifications for Spandan 4.0.
          </p>
        ) : (
          <button
            type="button"
            className={`push-toggle-btn ${subscribed ? "btn-unsubscribe" : "btn-subscribe"}`}
            disabled={loading || supported === false}
            onClick={handleTogglePush}
          >
            {loading ? "Updating alerts…" : subscribed ? "Turn Off Lockscreen Alerts" : "🔔 Turn On Festival Alerts"}
          </button>
        )}
      </div>
    </div>
  );
}
