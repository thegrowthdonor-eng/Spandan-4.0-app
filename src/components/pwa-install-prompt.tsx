"use client";

import Image from "next/image";
import { useEffect, useReducer } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Platform = "android" | "ios" | "other";

type InstallState = { deferredPrompt: BeforeInstallPromptEvent | null; showPrompt: boolean; platform: Platform; showGuide: boolean };
type InstallAction =
  | { type: "show"; platform: Platform; prompt?: BeforeInstallPromptEvent }
  | { type: "dismiss" }
  | { type: "showGuide" }
  | { type: "hideGuide" }
  | { type: "promptDismissed" }
  | { type: "installed" };

const initialInstallState: InstallState = { deferredPrompt: null, showPrompt: false, platform: "other", showGuide: false };

function installReducer(state: InstallState, action: InstallAction): InstallState {
  switch (action.type) {
    case "show": return { ...state, deferredPrompt: action.prompt ?? null, platform: action.platform, showPrompt: true };
    case "dismiss": return { ...state, showPrompt: false, showGuide: false };
    case "showGuide": return { ...state, showGuide: true };
    case "hideGuide": return { ...state, showGuide: false };
    case "promptDismissed": return { ...state, deferredPrompt: null, showPrompt: true, showGuide: true };
    case "installed": return initialInstallState;
  }
}

export function PwaInstallPrompt() {
  const [state, dispatch] = useReducer(installReducer, initialInstallState);
  const setShowGuide = (showGuide: boolean) => dispatch({ type: showGuide ? "showGuide" : "hideGuide" });

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone || localStorage.getItem("spandan_pwa_dismissed") === "true") return;

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    if (!isIOS && !isAndroid) return;
    if (isIOS) dispatch({ type: "show", platform: "ios" });

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      dispatch({ type: "show", platform: isAndroid ? "android" : "other", prompt: event as BeforeInstallPromptEvent });
    };

    const handleInstalled = () => {
      localStorage.removeItem("spandan_pwa_dismissed");
      dispatch({ type: "installed" });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  function handleDismiss() {
    localStorage.setItem("spandan_pwa_dismissed", "true");
    dispatch({ type: "dismiss" });
  }

  async function handleInstallClick() {
    if (!state.deferredPrompt) {
      dispatch({ type: "showGuide" });
      return;
    }

    await state.deferredPrompt.prompt();
    const choice = await state.deferredPrompt.userChoice;
    if (choice.outcome === "dismissed") {
      dispatch({ type: "promptDismissed" });
    } else {
      dispatch({ type: "dismiss" });
    }
  }

  if (!state.showPrompt) return null;

  return (
    <aside className="pwa-install-banner" aria-label="Install festival app">
      <div className="pwa-banner-content">
        <div className="pwa-icon-box" aria-hidden>
          <Image src="/spandan-logo.png" alt="" width={40} height={40} />
        </div>
        <div className="pwa-text-box">
          <strong className="pwa-title">Install Spandan 4.0</strong>
          <p className="pwa-sub">Save the official festival app to this device.</p>
        </div>
      </div>

      <div className="pwa-actions-box">
        <button type="button" className="pwa-install-btn" onClick={handleInstallClick}>
          {state.deferredPrompt ? "Install app" : state.platform === "ios" ? "How to install" : "Install options"}
        </button>
        <button type="button" className="pwa-dismiss-btn" onClick={handleDismiss} aria-label="Dismiss install prompt">
          ×
        </button>
      </div>

      {state.showGuide && (
        <div className="pwa-ios-modal">
          <div className="pwa-ios-modal-header">
            <strong>{state.platform === "ios" ? "Install on iPhone / iPad" : "Install from your browser"}</strong>
            <button type="button" className="pwa-close-btn" onClick={() => setShowGuide(false)} aria-label="Close install instructions">×</button>
          </div>
          <ol className="pwa-ios-steps">
            {state.platform === "ios" ? (
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
