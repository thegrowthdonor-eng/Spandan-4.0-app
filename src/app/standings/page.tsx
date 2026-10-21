import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SponsorPlacement } from "@/components/sponsor-placement";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { FestTopNav } from "@/components/spandan-branding";
import "../public-info.css";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Results & Standings | SPANDAN 4.0",
  description: "Official Spandan 4.0 match results, batch leaderboard, verified point standings, and podium celebration highlights.",
};

type Standing = { batch_id: string; label: string; course_label: string | null; points: number };

type PublishedEventResult = {
  event_id: string;
  event_title: string;
  event_slug: string;
  category: string;
  podium_photo_url: string | null;
  podium_caption: string | null;
  positions: Array<{
    placing: number;
    batch_label: string;
    winner_name?: string | null;
    participant_category?: string | null;
    points: number;
    note: string | null;
  }>;
};

async function getPublishedResults(): Promise<PublishedEventResult[]> {
  if (!hasPublicSupabaseConfiguration()) return [];
  try {
    const client = createPublicClient();
    // Try the unified_event_results RPC
    const { data: unifiedData, error: unifiedError } = await client.rpc("unified_event_results");
    if (!unifiedError && Array.isArray(unifiedData) && unifiedData.length > 0) {
      type UnifiedRow = {
        event_id: string;
        event_title: string;
        event_slug: string;
        category: string;
        podium_photo_url: string | null;
        podium_caption: string | null;
        positions: Array<{
          placing: number;
          batch_label: string;
          winner_name?: string | null;
          participant_category?: string | null;
          points: number;
          note: string | null;
        }>;
      };
      return (unifiedData as UnifiedRow[]).map((item) => ({
        event_id: item.event_id,
        event_title: item.event_title,
        event_slug: item.event_slug,
        category: item.category,
        podium_photo_url: item.podium_photo_url,
        podium_caption: item.podium_caption,
        positions: Array.isArray(item.positions) ? item.positions : [],
      }));
    }

    // Try the older RPC if available
    const { data: rpcData, error: rpcError } = await client.rpc("get_published_event_results");
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      type RpcResult = {
        event_id: string;
        event_title: string;
        event_slug: string;
        category: string;
        podium_photo_url: string | null;
        podium_caption: string | null;
        positions: unknown;
      };
      return (rpcData as RpcResult[]).map((item) => ({
        event_id: item.event_id,
        event_title: item.event_title,
        event_slug: item.event_slug,
        category: item.category,
        podium_photo_url: item.podium_photo_url,
        podium_caption: item.podium_caption,
        positions: Array.isArray(item.positions) ? item.positions : [],
      }));
    }

    // Direct table join query as resilient fallback
    const { data, error } = await client
      .from("result_publications")
      .select("id, podium_photo_url, podium_caption, events(id, title, slug, category), result_positions(placing, note, batches(label))")
      .eq("state", "published")
      .order("published_at", { ascending: false });

    if (error || !data) return [];

    type RawPub = {
      id: string;
      podium_photo_url: string | null;
      podium_caption: string | null;
      events: { id: string; title: string; slug: string; category: string } | null;
      result_positions: Array<{ placing: number; note: string | null; batches: { label: string } | null }> | null;
    };

    return (data as unknown as RawPub[]).map((pub) => ({
      event_id: pub.events?.id ?? pub.id,
      event_title: pub.events?.title ?? "Event",
      event_slug: pub.events?.slug ?? "",
      category: pub.events?.category ?? "sport",
      podium_photo_url: pub.podium_photo_url,
      podium_caption: pub.podium_caption,
      positions: ((pub.result_positions ?? []))
        .map((pos) => ({
          placing: pos.placing,
          batch_label: pos.batches?.label ? `Batch ${pos.batches.label}` : "Batch",
          points: 0,
          note: pos.note,
        }))
        .sort((a, b) => a.placing - b.placing),
    }));
  } catch {
    return [];
  }
}

export default async function StandingsPage() {
  let standings: Standing[] = [];
  let results: PublishedEventResult[] = [];
  let unavailable = !hasPublicSupabaseConfiguration();

  if (!unavailable) {
    const client = createPublicClient();
    const [standingsRes, eventResults] = await Promise.all([
      client
        .from("published_batch_standing_board")
        .select("batch_id,label,course_label,points")
        .order("points", { ascending: false })
        .order("label"),
      getPublishedResults(),
    ]);

    unavailable = Boolean(standingsRes.error);
    standings = (standingsRes.data ?? []) as unknown as Standing[];
    results = eventResults;
  }

  return (
    <main className="public-page">
      <FestTopNav activePage="standings" />

      <section className="public-hero">
        <span className="fest-hero-badge">🏆 Official Leaderboard</span>
        <h1>Results &amp; <em>Standings</em></h1>
        <p>Live podium finishes, event winners, and batch points tally.</p>
      </section>

      <section className="public-content">
        <div className="public-section-heading">
          <div>
            <h2>Batch Championship Standings</h2>
            <p>Calculated strictly from verified podium finishes.</p>
          </div>
        </div>

        {standings.length > 0 ? (
          <ol className="standing-list">
            {standings.map((standing) => (
              <li className="standing-row" key={standing.batch_id}>
                <strong>{standing.label}</strong>
                <span>{standing.course_label ?? "Batch"}</span>
                <span>{standing.points} pts</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-public">
            <p className="eyebrow">{unavailable ? "Connection pending" : "Results pending"}</p>
            <h2>The points table awaits its first result.</h2>
            <p>
              {unavailable
                ? "The public results service is not configured, so no unverified score data is displayed."
                : "Final results have not been published yet. The leaderboard will populate automatically once a result is confirmed."}
            </p>
          </div>
        )}

        {/* Podium Celebration & Winner Media Showcase */}
        {results.length > 0 && (
          <section className="podium-showcase-section">
            <div className="public-section-heading">
              <div>
                <p className="eyebrow">Champions Wall</p>
                <h2>Podium Celebrations</h2>
              </div>
              <p>Official trophy lifting photos, medal presentations, and victory moments from the ground.</p>
            </div>

            <div className="podium-showcase-grid">
              {results.map((item) => (
                <article key={item.event_id} className="podium-card">
                  {item.podium_photo_url ? (
                    <div className="podium-card-image-box">
                      <span className="podium-card-category">{item.category}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.podium_photo_url}
                        alt={`${item.event_title} Celebration`}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : (
                    <div className="podium-card-image-box podium-card-placeholder">
                      <span className="podium-card-category">{item.category}</span>
                      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><path d="M42 22h36v16c0 16-8 28-18 31-10-3-18-15-18-31V22Z" fill="#f1d89b" stroke="#735c35" strokeWidth="3"/><path d="M42 31H27c0 18 8 28 22 29M78 31h15c0 18-8 28-22 29M60 69v16m-17 12h34M49 85h22v12H49z" stroke="#735c35" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="m60 31 3.8 7.6 8.4 1.2-6.1 5.9 1.4 8.3-7.5-3.9-7.5 3.9 1.4-8.3-6.1-5.9 8.4-1.2L60 31Z" fill="#c68163"/></svg>
                      <span>Official podium</span>
                    </div>
                  )}

                  <div className="podium-card-body">
                    <h3 className="podium-card-title">{item.event_title}</h3>
                    {item.podium_caption && (
                      <p className="podium-card-caption">✦ {item.podium_caption}</p>
                    )}
                    {item.positions.length > 0 && (
                      <div className="podium-card-placings">
                        {item.positions.map((pos) => (
                          <div key={pos.placing} className="podium-row-item">
                            <span className="rank-label">
                              {pos.placing === 1
                                ? "🥇 1st Place"
                                : pos.placing === 2
                                ? "🥈 2nd Place"
                                : pos.placing === 3
                                ? "🥉 3rd Place"
                                : `#${pos.placing}`}
                            </span>
                            <span className="batch-name">
                              {pos.winner_name || (pos.batch_label === "2021" ? "Interns" : `Batch ${pos.batch_label}`)}
                              {pos.participant_category && pos.participant_category !== "ug" ? (
                                <span style={{ opacity: 0.8, fontSize: "0.85em", marginLeft: 4 }}>
                                  ({pos.participant_category.toUpperCase()})
                                </span>
                              ) : pos.winner_name && pos.batch_label ? (
                                <span style={{ opacity: 0.8, fontSize: "0.85em", marginLeft: 4 }}>
                                  ({pos.batch_label === "2021" ? "Interns" : `Batch ${pos.batch_label}`})
                                </span>
                              ) : null}
                              {pos.points > 0 && (
                                <span style={{ color: "#d4af37", fontWeight: 600, marginLeft: 6 }}>
                                  +{pos.points} pts
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {item.event_slug && (
                      <Link className="podium-view-event" href={`/events/${item.event_slug}`}>
                        View event details →
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        <Suspense fallback={null}><SponsorPlacement placement="standings-footer" /></Suspense>
      </section>

      <footer className="public-footer">
        <span>ASMC Firozabad · SPANDAN 4.0</span>
        <Link href="/notices">Read official notices →</Link>
      </footer>
    </main>
  );
}
