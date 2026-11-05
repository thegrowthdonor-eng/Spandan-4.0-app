"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatLiveScore, type LiveGroundPayload } from "@/lib/live-ground";

function formatIST(iso: string | null) {
  if (!iso) return "Time to be announced";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "numeric", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

export function HappeningNowRadar() {
  const [data, setData] = useState<LiveGroundPayload | null>(null);
  useEffect(() => {
    const load = async () => {
      try { const response = await fetch("/api/public/live"); if (response.ok) setData(await response.json() as LiveGroundPayload); } catch { /* retain the last successful update */ }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 120_000);
    return () => clearInterval(timer);
  }, []);

  const current = data?.live[0];
  const upcoming = data?.upcoming[0];
  return <section className="radar-strip live" aria-labelledby="live-ground-title">
    <div className="radar-strip-content">
      <span className="radar-live-badge"><span className={`radar-pulse-dot ${current ? "active" : ""}`} aria-hidden />{current ? `${data?.live.length ?? 0} LIVE NOW` : "LIVE GROUND"}</span>
      <div className="radar-chip-text">
        <strong id="live-ground-title">{current?.title ?? upcoming?.title ?? "Ground desk is on standby"}</strong>
        <span>{current ? `${formatLiveScore(current)}${current.venue ? ` · ${current.venue}` : ""}` : upcoming ? `Up next ${formatIST(upcoming.startsAt)}${upcoming.venue ? ` · ${upcoming.venue}` : ""}` : "Scores and current programmes appear here when coordinators go live."}</span>
      </div>
    </div>
    <Link className="radar-chip-link" href="/live">Open Live Ground →</Link>
  </section>;
}
