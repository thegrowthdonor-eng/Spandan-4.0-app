import { NextResponse } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type FestivalNotification = {
  id: string;
  type: "notice" | "result" | "event" | "fixture";
  title: string;
  body: string;
  badge: string;
  urgency?: "urgent" | "normal";
  href: string;
  timestamp: string; // ISO string
};

let cachedNotifications: {
  payload: { ok: boolean; items: FestivalNotification[]; timestamp: string };
  expiresAt: number;
} | null = null;

const CACHE_TTL_MS = 20_000; // 20 seconds cache

export async function GET() {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ ok: false, items: [], message: "Service unavailable" }, { status: 503 });
  }

  const nowMs = Date.now();
  if (cachedNotifications && nowMs < cachedNotifications.expiresAt) {
    return NextResponse.json(cachedNotifications.payload, {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const client = createPublicClient();

    const [noticesRes, resultsRes, eventsRes, fixturesRes] = await Promise.all([
      // 1. Official notices & circulars
      client
        .from("notices")
        .select("id, title, body, urgency, publish_at, events(title)")
        .order("publish_at", { ascending: false })
        .limit(8),

      // 2. Published tournament & stage results
      client
        .from("result_publications")
        .select("id, published_at, events(title, slug), result_positions(placing, batches(name))")
        .eq("state", "published")
        .order("published_at", { ascending: false })
        .limit(8),

      // 3. New / active festival events
      client
        .from("events")
        .select("id, title, slug, category, format, summary, state, starts_at, created_at")
        .neq("state", "draft")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(8),

      // 4. Live or imminent match fixtures
      client
        .from("fixtures")
        .select("id, participant_a_label, participant_b_label, starts_at, state, venue, events(title, slug)")
        .in("state", ["live", "scheduled"])
        .order("starts_at", { ascending: true })
        .limit(6),
    ]);

    const items: FestivalNotification[] = [];

    // Process notices
    if (noticesRes.data && Array.isArray(noticesRes.data)) {
      for (const n of noticesRes.data) {
        items.push({
          id: `notice-${n.id}`,
          type: "notice",
          title: n.title,
          body: n.body?.slice(0, 140) ?? "Official bulletin from ASMC Firozabad Student Council.",
          badge: n.urgency === "urgent" ? "🚨 Urgent Circular" : "📢 Notice",
          urgency: n.urgency === "urgent" ? "urgent" : "normal",
          href: "/notices",
          timestamp: n.publish_at || new Date().toISOString(),
        });
      }
    }

    // Process results
    if (resultsRes.data && Array.isArray(resultsRes.data)) {
      for (const r of resultsRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = r as any;
        const eventTitle = raw.events?.title ?? "Festival Event";
        const positions = (raw.result_positions ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => (a.placing ?? 0) - (b.placing ?? 0))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => `${p.placing === 1 ? "🥇 1st" : p.placing === 2 ? "🥈 2nd" : "🥉 3rd"}: ${p.batches?.name ?? "Winner"}`)
          .slice(0, 3)
          .join(" · ");

        items.push({
          id: `result-${raw.id}`,
          type: "result",
          title: `${eventTitle} Results Announced`,
          body: positions || "Official podium standings published by the organizing desk.",
          badge: "🏆 Result",
          urgency: "normal",
          href: raw.events?.slug ? `/events/${raw.events.slug}` : "/standings",
          timestamp: raw.published_at || new Date().toISOString(),
        });
      }
    }

    // Process events
    if (eventsRes.data && Array.isArray(eventsRes.data)) {
      for (const e of eventsRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ev = e as any;
        items.push({
          id: `event-${ev.id}`,
          type: "event",
          title: ev.title,
          body: ev.summary || `Official ${ev.category || "festival"} event. Check schedule and register your batch squad.`,
          badge: "🎯 Event Added",
          urgency: "normal",
          href: `/events/${ev.slug}`,
          timestamp: ev.created_at || ev.starts_at || new Date().toISOString(),
        });
      }
    }

    // Process fixtures
    if (fixturesRes.data && Array.isArray(fixturesRes.data)) {
      for (const f of fixturesRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fix = f as any;
        const isLive = fix.state === "live";
        items.push({
          id: `fixture-${fix.id}`,
          type: "fixture",
          title: `${fix.participant_a_label} vs ${fix.participant_b_label}`,
          body: `${fix.events?.title ?? "Match"} · ${fix.venue ?? "Campus Grounds"}. ${isLive ? "Currently in play!" : "Starting shortly."}`,
          badge: isLive ? "⚡ Live Match" : "⏱️ Match Scheduled",
          urgency: isLive ? "urgent" : "normal",
          href: "/live",
          timestamp: fix.starts_at || new Date().toISOString(),
        });
      }
    }

    // Sort all by timestamp descending (newest first)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const payload = {
      ok: true,
      items: items.slice(0, 24),
      timestamp: new Date().toISOString(),
    };

    cachedNotifications = {
      payload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, items: [], message: error instanceof Error ? error.message : "Failed to load notifications" },
      { status: 500 }
    );
  }
}
