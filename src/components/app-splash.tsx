"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function AppSplash() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDismissed(true), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={`app-splash ${dismissed ? "app-splash-dismissed" : ""}`} aria-hidden="true">
      <div className="app-splash-content">
        <div className="app-splash-logo-stage">
          <span className="app-splash-orbit app-splash-orbit-one" />
          <span className="app-splash-orbit app-splash-orbit-two" />
          <Image src="/spandan-logo.png" alt="" width={252} height={252} priority />
        </div>
        <p>ASMC FIROZABAD PRESENTS</p>
        <strong>SPANDAN <span>4.0</span></strong>
        <small>WHERE HEARTS BEAT AND PASSIONS MEET</small>
        <span className="app-splash-loader"><i /></span>
      </div>
    </div>
  );
}
