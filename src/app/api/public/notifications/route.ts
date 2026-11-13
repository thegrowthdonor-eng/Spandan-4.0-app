import { NextResponse } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { coalesceCached, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { programmeCacheTag } from "@/server/supabase/programme-fetch";
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

async function loadNotifications() {
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
        .select("id, published_at, events(title, slug), result_positions(placing, batches(name:label))")
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
        .select("id, participant_a_label, participant_b_label, starts_at, state, venue, created_at, events(title, slug), score_snapshots(version,status)")
        .in("state", ["scheduled", "ongoing"])
        .order("starts_at", { ascending: true })
        .limit(10),
    ]);

    const items: FestivalNotification[] = [];
    const nowMs = Date.now();

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

    // Process fixtures (accurately dated, no false "starting shortly" for distant dates)
    if (fixturesRes.data && Array.isArray(fixturesRes.data)) {
      for (const f of fixturesRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fix = f as any;
        const latestSnapshot = (fix.score_snapshots ?? []).reduce((latest: { version: number; status: string } | null, snapshot: { version: number; status: string }) => !latest || snapshot.version > latest.version ? snapshot : latest, null);
        const isLive = latestSnapshot?.status === "live" || latestSnapshot?.status === "paused" || fix.state === "ongoing";

        const startsAtMs = fix.starts_at ? new Date(fix.starts_at).getTime() : 0;
        const diffHours = startsAtMs ? (startsAtMs - nowMs) / (1000 * 3600) : 999;
        const isImminent = startsAtMs > 0 && diffHours >= 0 && diffHours <= 3;
        const isWithin48h = startsAtMs > 0 && diffHours >= 0 && diffHours <= 48;
        const createdMs = fix.created_at ? new Date(fix.created_at).getTime() : nowMs;
        const isRecentAnnouncement = (nowMs - createdMs) < 48 * 3600 * 1000;

        // Only include in notification bell if live, starting within 48h, or newly announced
        if (!isLive && !isImminent && !isWithin48h && !isRecentAnnouncement) {
          continue;
        }

        let bodyText = "";
        let badgeText = "⏱️ Match Scheduled";
        if (isLive) {
          bodyText = `${fix.events?.title ?? "Match"} · ${fix.venue ?? "Campus Grounds"}. Currently in play!`;
          badgeText = "⚡ Live Match";
        } else if (isImminent) {
          const timeStr = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "numeric", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(startsAtMs));
          bodyText = `${fix.events?.title ?? "Match"} · ${fix.venue ?? "Campus Grounds"}. Starting shortly at ${timeStr}.`;
          badgeText = "⏱️ Starting Soon";
        } else if (fix.starts_at) {
          const dateStr = new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "numeric", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(startsAtMs));
          bodyText = `${fix.events?.title ?? "Match"} · ${fix.venue ?? "Campus Grounds"}. Scheduled for ${dateStr}.`;
          badgeText = "📅 Match Scheduled";
        } else {
          bodyText = `${fix.events?.title ?? "Match"} · ${fix.venue ?? "Campus Grounds"}. Match scheduled.`;
        }

        // Notification timestamp must NEVER be in the future (prevents unread badge loop)
        const notificationTime = isLive
          ? new Date().toISOString()
          : fix.created_at && new Date(fix.created_at).getTime() <= nowMs
            ? fix.created_at
            : new Date(Math.min(startsAtMs || nowMs, nowMs)).toISOString();

        items.push({
          id: `fixture-${fix.id}`,
          type: "fixture",
          title: `${fix.participant_a_label} vs ${fix.participant_b_label}`,
          body: bodyText,
          badge: badgeText,
          urgency: isLive ? "urgent" : "normal",
          href: "/live",
          timestamp: notificationTime,
        });
      }
    }

    // Clamp all timestamps to Date.now() to ensure no future dates cause unread persistence
    for (const item of items) {
      if (new Date(item.timestamp).getTime() > nowMs) {
        item.timestamp = new Date(nowMs).toISOString();
      }
    }

    // Sort all by timestamp descending (newest first)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      ok: true,
      items: items.slice(0, 24),
      timestamp: new Date().toISOString(),
    };
}

export async function GET() {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ ok: false, items: [], message: "Service unavailable" }, { status: 503 });
  }

  try {
    const payload = await coalesceCached(
      "public-notifications",
      [PUBLIC_CACHE_TAGS.notifications, PUBLIC_CACHE_TAGS.feed, programmeCacheTag],
      20,
      loadNotifications,
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, items: [], message: error instanceof Error ? error.message : "Failed to load notifications" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
