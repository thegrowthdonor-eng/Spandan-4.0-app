"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function AppSplash() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (!isStandalone) {
      setDismissed(true);
      return;
    }

    const timer = window.setTimeout(() => setDismissed(true), 1250);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={`app-splash ${dismissed ? "app-splash-dismissed" : ""}`} aria-hidden="true">
      <div className="app-splash-glow app-splash-glow-one" />
      <div className="app-splash-glow app-splash-glow-two" />
      <div className="app-splash-content">
        <div className="app-splash-mark">
          <Image src="/spandan-logo.png" alt="" width={252} height={252} priority />
        </div>
        <p>ASMC FIROZABAD PRESENTS</p>
        <strong>SPANDAN <span>4.0</span></strong>
        <small>PLAY · PERFORM · BELONG</small>
      </div>
    </div>
  );
}
