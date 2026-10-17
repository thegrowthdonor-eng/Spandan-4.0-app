"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check if already running standalone
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) return;

    // 2. Check if dismissed recently (cooldown: 72 hours)
    const dismissedTime = localStorage.getItem("spandan_pwa_dismissed");
    if (dismissedTime) {
      const diffHours = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60);
      if (diffHours < 72) return;
    }

    // 3. iOS Detection
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    queueMicrotask(() => setIsIOS(isIOSDevice));

    // 4. Android / Chromium handler
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // If iOS Safari, reveal prompt after 4 seconds
    let iosTimer: NodeJS.Timeout | null = null;
    if (isIOSDevice) {
      iosTimer = setTimeout(() => setShowPrompt(true), 4000);
    }

    return () => {
      if (iosTimer) clearTimeout(iosTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  function handleDismiss() {
    localStorage.setItem("spandan_pwa_dismissed", String(Date.now()));
    setShowPrompt(false);
    setShowIOSGuide(false);
  }

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setShowPrompt(false);
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  }

  if (!showPrompt) return null;

  return (
    <aside className="pwa-install-banner" aria-label="Install festival app">
      <div className="pwa-banner-content">
        <div className="pwa-icon-box" aria-hidden>
          <span>⚡</span>
        </div>
        <div className="pwa-text-box">
          <strong className="pwa-title">Install Spandan 4.0</strong>
          <p className="pwa-sub">Add to home screen for instant offline access and lockscreen alerts.</p>
        </div>
      </div>

      <div className="pwa-actions-box">
        <button
          type="button"
          className="pwa-install-btn"
          onClick={handleInstallClick}
        >
          {isIOS ? "How to Install" : "Install App"}
        </button>
        <button
          type="button"
          className="pwa-dismiss-btn"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
        >
          ✕
        </button>
      </div>

      {showIOSGuide && (
        <div className="pwa-ios-modal">
          <div className="pwa-ios-modal-header">
            <strong>Install on iPhone / iPad</strong>
            <button type="button" className="pwa-close-btn" onClick={() => setShowIOSGuide(false)}>✕</button>
          </div>
          <ol className="pwa-ios-steps">
            <li>
              Tap the <strong>Share</strong> button <span className="ios-icon" aria-hidden>⎋</span> at the bottom of Safari.
            </li>
            <li>
              Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong> <span className="ios-icon" aria-hidden>⊞</span>.
            </li>
            <li>
              Tap <strong>Add</strong> in the top right corner. The festival app will appear on your phone home screen!
            </li>
          </ol>
        </div>
      )}
    </aside>
  );
}
