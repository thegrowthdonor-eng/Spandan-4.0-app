import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SponsorPlacement } from "@/components/sponsor-placement";
import { FestTopNav } from "@/components/spandan-branding";
import { PodiumCard } from "@/components/podium-card";
import {
  batchName,
  groupStandings,
  resultIdentity,
  placingLabel,
  type PublishedEventResult,
  type Standing,
} from "@/lib/results";
import { getPublishedResults } from "@/lib/published-results";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import "../public-info.css";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Results & Standings | SPANDAN 4.0",
  description: "Official Spandan 4.0 event winners, podium finishes, and interactive batch championship standings.",
};

export default async function StandingsPage() {
  let standings: Standing[] = [];
  let results: PublishedEventResult[] = [];
  let unavailable = !hasPublicSupabaseConfiguration();

  if (!unavailable) {
    const client = createPublicClient();
    const [standingsResponse, eventResults] = await Promise.all([
      client.from("published_batch_standing_board").select("batch_id,label,course_label,points")
        .order("points", { ascending: false }).order("label"),
      getPublishedResults(client),
    ]);
    unavailable = Boolean(standingsResponse.error);
    standings = (standingsResponse.data ?? []) as Standing[];
    results = eventResults;
  }

  const standingsWithFinishes = groupStandings(standings, results);

  return (
    <main className="public-page">
      <FestTopNav activePage="standings" />

      <section className="public-hero">
        <span className="fest-hero-badge">🏆 Official Results</span>
        <h1>Results &amp; <em>Standings</em></h1>
        <p>Meet the winners, revisit every podium, and explore the batch championship.</p>
      </section>

      <section className="public-content standings-content">
        {standingsWithFinishes.length > 0 ? (
          <details className="standings-disclosure">
            <summary className="standings-trigger">
              <span className="standings-trigger-icon" aria-hidden="true">🏆</span>
              <span className="standings-trigger-copy">
                <strong>View batch standings</strong>
                <small>Rankings, winners and event-wise points</small>
              </span>
              <span className="standings-trigger-count">{standingsWithFinishes.length} batches</span>
              <span className="standings-trigger-chevron" aria-hidden="true">＋</span>
            </summary>

            <div className="standings-panel">
              <div className="standings-panel-heading">
                <div><p className="eyebrow">Batch championship</p><h2>Verified standings</h2></div>
                <p>Open a batch to see who placed in each event and how its points were earned.</p>
              </div>

              <ol className="batch-standing-list">
                {standingsWithFinishes.map((standing, index) => (
                  <li key={standing.batch_id}>
                    <details className="batch-standing-item">
                      <summary className="batch-standing-summary">
                        <span className="batch-standing-rank">{String(index + 1).padStart(2, "0")}</span>
                        <span className="batch-standing-name"><strong>{batchName(standing.label)}</strong><small>{standing.course_label ?? "Official batch"}</small></span>
                        <span className="batch-standing-points">{standing.points} pts</span>
                        <span className="batch-standing-chevron" aria-hidden="true">＋</span>
                      </summary>

                      <div className="batch-finish-list">
                        {standing.finishes.length > 0 ? standing.finishes.map((finish) => {
                          const identity = resultIdentity(finish);
                          return (
                            <article className="batch-finish-row" key={`${finish.event_id}-${finish.placing}`}>
                              <span className={`batch-finish-place place-${Math.min(finish.placing, 4)}`}>{placingLabel(finish.placing)}</span>
                              <span className="batch-finish-event">
                                {finish.event_slug ? <Link href={`/events/${finish.event_slug}`}>{finish.event_title}</Link> : <strong>{finish.event_title}</strong>}
                                <small>{identity.primary} · {identity.secondary}</small>
                              </span>
                              {finish.points > 0 && <span className="result-points">+{finish.points} pts</span>}
                            </article>
                          );
                        }) : <p className="batch-finish-empty">No published podium details are available for this batch yet.</p>}
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        ) : (
          <div className="standings-pending" role="status">
            <span aria-hidden="true">🏆</span>
            <div><strong>Batch standings pending</strong><small>{unavailable ? "The public results service is not configured." : "Rankings will appear after the first verified result."}</small></div>
          </div>
        )}

        {results.length > 0 ? (
          <section className="podium-showcase-section">
            <div className="public-section-heading">
              <div><p className="eyebrow">Champions wall</p><h2>Podium celebrations</h2></div>
              <p>Official winners, placements and victory moments from across SPANDAN 4.0.</p>
            </div>

            <div className="podium-showcase-grid">
              {results.map((result) => <PodiumCard key={result.event_id} result={result} />)}
            </div>
          </section>
        ) : !unavailable && (
          <div className="empty-public results-empty"><p className="eyebrow">Results pending</p><h2>The champions wall awaits its first result.</h2><p>Published winners and podium celebrations will appear here automatically.</p></div>
        )}

        <Suspense fallback={null}><SponsorPlacement placement="standings-footer" /></Suspense>
      </section>

      <footer className="public-footer"><span>ASMC Firozabad · SPANDAN 4.0</span><Link href="/notices">Read official notices →</Link></footer>
    </main>
  );
}
