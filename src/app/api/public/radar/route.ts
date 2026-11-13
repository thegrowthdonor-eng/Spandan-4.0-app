import { NextResponse } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { coalesceCached, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { programmeCacheTag } from "@/server/supabase/programme-fetch";
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

async function loadRadar() {
    const client = createPublicClient();
    const now = new Date();
    const nowIso = now.toISOString();

    const [{ data: fixtures }, { data: events }] = await Promise.all([
      client
        .from("fixtures")
        .select("id,stage,participant_a_label,participant_b_label,venue,starts_at,reporting_at,state,events(id,title,category,score_template,slug),score_snapshots(version,status,score_payload,updated_at)")
        .neq("state", "cancelled")
        .order("starts_at", { ascending: true })
        .limit(30),
      client
        .from("events")
        .select("id,title,category,venue,starts_at,reporting_at,state,score_template,slug")
        .in("state", ["open", "published"])
        .order("starts_at", { ascending: true })
        .limit(20),
    ]);

    let liveItem: RadarItem | null = null;
    let nextUpItem: RadarItem | null = null;

    // Check for live fixture first (highest excitement value)
    if (fixtures && fixtures.length > 0) {
      for (const f of fixtures) {
        const ev = f.events as unknown as { id: string; title: string; category: string; score_template: string; slug: string } | null;
        const starts = f.starts_at ? new Date(f.starts_at) : null;
        
        const snapshot = (f.score_snapshots ?? []).reduce<{
          version: number; status: string; score_payload: unknown;
        } | null>((latest, item) => !latest || item.version > latest.version ? item : latest, null);
        let isLive = snapshot?.status === "live" || snapshot?.status === "paused";
        if (!isLive && starts) {
          const diffMs = now.getTime() - starts.getTime();
          // Active within 2.5 hours of start time
          if (diffMs >= 0 && diffMs <= 2.5 * 60 * 60 * 1000) {
            isLive = true;
          }
        }

        let scoreSummary: string | null = null;
        if (snapshot?.score_payload && typeof snapshot.score_payload === "object") {
          const p = snapshot.score_payload as Record<string, unknown>;
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
            score_status: snapshot?.status ?? null,
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

    return {
      ok: true,
      live: liveItem,
      nextUp: nextUpItem,
      serverTime: nowIso,
    };
}

export async function GET() {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ ok: false, live: null, nextUp: null, message: "Service unavailable" }, { status: 503 });
  }

  try {
    const payload = await coalesceCached(
      "public-radar",
      [PUBLIC_CACHE_TAGS.live, programmeCacheTag],
      15,
      loadRadar,
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, live: null, nextUp: null }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
