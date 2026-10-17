"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Platform = "android" | "ios" | "other";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) return;

    const dismissedTime = localStorage.getItem("spandan_pwa_dismissed");
    if (dismissedTime) {
      const hoursSinceDismissal = (Date.now() - Number(dismissedTime)) / 3_600_000;
      if (hoursSinceDismissal < 72) return;
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isMobile = isIOS || isAndroid || window.matchMedia("(pointer: coarse)").matches;

    if (!isMobile) return;

    setPlatform(isIOS ? "ios" : isAndroid ? "android" : "other");

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    const handleInstalled = () => {
      localStorage.removeItem("spandan_pwa_dismissed");
      setShowPrompt(false);
      setShowGuide(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    // iOS does not dispatch beforeinstallprompt. Some Android browsers only
    // dispatch it after their own eligibility checks, so always offer guidance.
    const promptTimer = window.setTimeout(() => setShowPrompt(true), 1500);

    return () => {
      window.clearTimeout(promptTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  function handleDismiss() {
    localStorage.setItem("spandan_pwa_dismissed", String(Date.now()));
    setShowPrompt(false);
    setShowGuide(false);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) {
      setShowGuide(true);
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setShowPrompt(false);
    setDeferredPrompt(null);

    if (choice.outcome === "dismissed") {
      localStorage.setItem("spandan_pwa_dismissed", String(Date.now()));
    }
  }

  if (!showPrompt) return null;

  return (
    <aside className="pwa-install-banner" aria-label="Install festival app">
      <div className="pwa-banner-content">
        <div className="pwa-icon-box" aria-hidden>
          <span>S</span>
        </div>
        <div className="pwa-text-box">
          <strong className="pwa-title">Install Spandan 4.0</strong>
          <p className="pwa-sub">Save the festival app to your home screen for quicker access.</p>
        </div>
      </div>

      <div className="pwa-actions-box">
        <button type="button" className="pwa-install-btn" onClick={handleInstallClick}>
          {deferredPrompt ? "Install app" : "Add to home screen"}
        </button>
        <button type="button" className="pwa-dismiss-btn" onClick={handleDismiss} aria-label="Dismiss install prompt">
          ×
        </button>
      </div>

      {showGuide && (
        <div className="pwa-ios-modal">
          <div className="pwa-ios-modal-header">
            <strong>{platform === "ios" ? "Install on iPhone / iPad" : "Install from your browser"}</strong>
            <button type="button" className="pwa-close-btn" onClick={() => setShowGuide(false)} aria-label="Close install instructions">×</button>
          </div>
          <ol className="pwa-ios-steps">
            {platform === "ios" ? (
              <>
                <li>Open this page in <strong>Safari</strong>, then tap the <strong>Share</strong> button.</li>
                <li>Choose <strong>&quot;Add to Home Screen&quot;</strong>.</li>
                <li>Tap <strong>Add</strong>. Spandan 4.0 will appear on your home screen.</li>
              </>
            ) : (
              <>
                <li>Open your browser menu (usually the <strong>three dots</strong>).</li>
                <li>Tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.</li>
                <li>Confirm <strong>Install</strong> to add Spandan 4.0 to your phone.</li>
              </>
            )}
          </ol>
        </div>
      )}
    </aside>
  );
}
