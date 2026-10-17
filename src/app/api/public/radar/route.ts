import { NextResponse } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type RadarItem = {
  id: string;
  type: "fixture" | "event";
  title: string;
  subtitle: string;
  venue: string | null;
  starts_at: string | null;
  reporting_at: string | null;
  status: string; // 'live' | 'upcoming'
  score_status?: string | null;
  score_summary?: string | null;
  score_template?: string | null;
  event_slug?: string | null;
};

let cachedRadar: {
  payload: { ok: boolean; live: RadarItem | null; nextUp: RadarItem | null; serverTime: string };
  expiresAt: number;
} | null = null;

const CACHE_TTL_MS = 15_000; // 15 seconds

export async function GET() {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ ok: false, live: null, nextUp: null, message: "Service unavailable" }, { status: 503 });
  }

  // Return in-memory cache if still fresh — protects Supabase from 1000 concurrent students
  const nowMs = Date.now();
  if (cachedRadar && nowMs < cachedRadar.expiresAt) {
    return NextResponse.json(cachedRadar.payload, {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const client = createPublicClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Fetch relevant fixtures
    const { data: fixtures } = await client
      .from("fixtures")
      .select("id,stage,participant_a_label,participant_b_label,venue,starts_at,reporting_at,state,score_status,score_payload,events(id,title,category,score_template,slug)")
      .neq("state", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(30);

    // 2. Fetch relevant standalone events
    const { data: events } = await client
      .from("events")
      .select("id,title,category,venue,starts_at,reporting_at,state,score_template,slug")
      .in("state", ["open", "published"])
      .order("starts_at", { ascending: true })
      .limit(20);

    let liveItem: RadarItem | null = null;
    let nextUpItem: RadarItem | null = null;

    // Check for live fixture first (highest excitement value)
    if (fixtures && fixtures.length > 0) {
      for (const f of fixtures) {
        const ev = f.events as unknown as { id: string; title: string; category: string; score_template: string; slug: string } | null;
        const starts = f.starts_at ? new Date(f.starts_at) : null;
        
        let isLive = f.score_status === "live" || f.score_status === "paused";
        if (!isLive && starts) {
          const diffMs = now.getTime() - starts.getTime();
          // Active within 2.5 hours of start time
          if (diffMs >= 0 && diffMs <= 2.5 * 60 * 60 * 1000) {
            isLive = true;
          }
        }

        let scoreSummary: string | null = null;
        if (f.score_payload && typeof f.score_payload === "object") {
          const p = f.score_payload as Record<string, unknown>;
          if (ev?.score_template === "cricket") {
            scoreSummary = `${String(p.teamA_runs ?? 0)}/${String(p.teamA_wickets ?? 0)} vs ${String(p.teamB_runs ?? 0)}/${String(p.teamB_wickets ?? 0)}`;
          } else if (ev?.score_template === "football") {
            scoreSummary = `${String(p.teamA_goals ?? 0)} — ${String(p.teamB_goals ?? 0)}`;
          } else if (p.summary) {
            scoreSummary = String(p.summary);
          }
        }

        if (isLive && !liveItem) {
          liveItem = {
            id: f.id,
            type: "fixture",
            title: `${f.participant_a_label} vs ${f.participant_b_label}`,
            subtitle: `${ev?.title ?? "Festival Match"} · ${f.stage}`,
            venue: f.venue,
            starts_at: f.starts_at,
            reporting_at: f.reporting_at,
            status: "live",
            score_status: f.score_status,
            score_summary: scoreSummary,
            score_template: ev?.score_template,
            event_slug: ev?.slug,
          };
        } else if (starts && starts > now && !nextUpItem) {
          nextUpItem = {
            id: f.id,
            type: "fixture",
            title: `${f.participant_a_label} vs ${f.participant_b_label}`,
            subtitle: `${ev?.title ?? "Festival Match"} · ${f.stage}`,
            venue: f.venue,
            starts_at: f.starts_at,
            reporting_at: f.reporting_at,
            status: "upcoming",
            score_template: ev?.score_template,
            event_slug: ev?.slug,
          };
        }
      }
    }

    // If no live fixture, check if an event is currently happening
    if (!liveItem && events) {
      for (const e of events) {
        if (!e.starts_at) continue;
        const starts = new Date(e.starts_at);
        const diffMs = now.getTime() - starts.getTime();
        if (diffMs >= 0 && diffMs <= 3 * 60 * 60 * 1000) {
          liveItem = {
            id: e.id,
            type: "event",
            title: e.title,
            subtitle: `${e.category} · Live on Campus`,
            venue: e.venue,
            starts_at: e.starts_at,
            reporting_at: e.reporting_at,
            status: "live",
            score_template: e.score_template,
            event_slug: e.slug,
          };
          break;
        }
      }
    }

    // If no next-up fixture, check for next scheduled event
    if (!nextUpItem && events) {
      for (const e of events) {
        if (!e.starts_at) continue;
        const starts = new Date(e.starts_at);
        if (starts > now) {
          nextUpItem = {
            id: e.id,
            type: "event",
            title: e.title,
            subtitle: `${e.category} · Next Scheduled Event`,
            venue: e.venue,
            starts_at: e.starts_at,
            reporting_at: e.reporting_at,
            status: "upcoming",
            score_template: e.score_template,
            event_slug: e.slug,
          };
          break;
        }
      }
    }

    const payload = {
      ok: true,
      live: liveItem,
      nextUp: nextUpItem,
      serverTime: nowIso,
    };

    cachedRadar = {
      payload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        "X-Cache": "MISS",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, live: null, nextUp: null }, { status: 500 });
  }
}
