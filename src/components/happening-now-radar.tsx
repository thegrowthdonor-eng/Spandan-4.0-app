"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RadarItem } from "@/app/api/public/radar/route";

function formatIST(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export function HappeningNowRadar() {
  const [live, setLive] = useState<RadarItem | null>(null);
  const [nextUp, setNextUp] = useState<RadarItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    async function fetchRadar() {
      try {
        const res = await fetch("/api/public/radar");
        const data = await res.json();
        if (data.ok) {
          setLive(data.live);
          setNextUp(data.nextUp);
        }
      } catch {
        // Network offline — keep existing
      } finally {
        setLoading(false);
      }
    }

    fetchRadar();

    // Auto-refresh every 30 seconds when tab is active
    timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchRadar();
      }
    }, 30000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="radar-strip loading">
        <span className="radar-pulse-dot" />
        <span className="radar-chip-text">Scanning campus ground radar…</span>
      </div>
    );
  }

  if (!live && !nextUp) {
    return (
      <div className="radar-strip idle" aria-label="Live festival ground radar">
        <div className="radar-strip-content">
          <span className="radar-idle-pill">Ground Standby</span>
          <span className="radar-chip-text">No active match right now · Fixtures resume as scheduled</span>
        </div>
        <Link className="radar-chip-link" href="/schedule">Draws →</Link>
      </div>
    );
  }

  return (
    <div className="radar-strip live" aria-label="Live festival ground radar">
      <div className="radar-strip-content">
        {live ? (
          <>
            <span className="radar-live-badge">
              <span className="radar-pulse-dot active" aria-hidden /> LIVE
            </span>
            <span className="radar-chip-text">
              <strong>{live.title}</strong>
              {live.score_summary && ` · ${live.score_summary}`}
              {live.venue && ` @ ${live.venue}`}
            </span>
          </>
        ) : (
          <>
            <span className="radar-next-badge">UP NEXT</span>
            <span className="radar-chip-text">
              <strong>{nextUp?.title}</strong>
              {nextUp?.starts_at && ` at ${formatIST(nextUp.starts_at)}`}
              {nextUp?.venue && ` @ ${nextUp.venue}`}
            </span>
          </>
        )}
      </div>
      <Link className="radar-chip-link" href="/schedule">View →</Link>
    </div>
  );
}
