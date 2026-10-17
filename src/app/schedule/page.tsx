import Link from "next/link";
import { Suspense } from "react";
import { HappeningNowRadar } from "@/components/happening-now-radar";
import { SponsorPlacement } from "@/components/sponsor-placement";
import { FestTopNav } from "@/components/spandan-branding";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import "../public-info.css";

export const dynamic = "force-dynamic";

type Fixture = {
  id: string;
  stage: string;
  participant_a_label: string;
  participant_b_label: string;
  venue: string | null;
  reporting_at: string | null;
  starts_at: string | null;
  state: string;
  events: { title: string; slug: string } | null;
};

function time(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Time to be announced";
}

export default async function SchedulePage() {
  let fixtures: Fixture[] = [];
  let unavailable = !hasPublicSupabaseConfiguration();

  if (!unavailable) {
    const { data, error } = await createPublicClient()
      .from("fixtures")
      .select(
        "id,stage,participant_a_label,participant_b_label,venue,reporting_at,starts_at,state,events(title,slug)",
      )
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("created_at");

    unavailable = Boolean(error);
    fixtures = (data ?? []) as unknown as Fixture[];
  }

  return (
    <main className="public-page">
      <FestTopNav activePage="schedule" />
      <section className="public-hero">
        <span className="fest-hero-badge">📅 Official Timetable &amp; Fixtures</span>
        <h1>
          Festival Schedule &amp; <em>Campus Feed</em>
        </h1>
        <p>Match fixtures, reporting times, live ground radar, and stage line-ups in IST.</p>
      </section>

      <section className="public-content">
        <HappeningNowRadar />
        <div className="public-section-heading">
          <h2>Programme</h2>
          <p>Confirm reporting time before leaving for the venue.</p>
        </div>

        {fixtures.length ? (
          <ol className="fixture-list">
            {fixtures.map((fixture) => (
              <li className="fixture-row" key={fixture.id}>
                <div className="fixture-when">
                  <span>{time(fixture.starts_at)}</span>
                  {fixture.reporting_at && (
                    <>
                      <br />
                      Report: {time(fixture.reporting_at)}
                    </>
                  )}
                </div>
                <div className="fixture-main">
                  <h2>
                    {fixture.participant_a_label} <em>vs</em> {fixture.participant_b_label}
                  </h2>
                  <p>
                    {fixture.events?.slug ? (
                      <Link href={`/events/${fixture.events.slug}`}>
                        {fixture.events.title} · {fixture.stage}
                      </Link>
                    ) : (
                      `${fixture.events?.title ?? "Festival fixture"} · ${fixture.stage}`
                    )}
                  </p>
                </div>
                <div className="fixture-meta">
                  <span>{fixture.venue ?? "Venue TBA"}</span>
                  <span>{fixture.state.replaceAll("_", " ")}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-public">
            <p className="eyebrow">
              {unavailable ? "Connection pending" : "Schedule being prepared"}
            </p>
            <h2>The programme will land here.</h2>
            <p>
              {unavailable
                ? "The public programme service is not configured, so no unverified timetable is displayed."
                : "Organisers have not published a fixture yet. Please check back after the programme is confirmed."}
            </p>
          </div>
        )}

        <Suspense fallback={null}>
          <SponsorPlacement placement="schedule-footer" />
        </Suspense>
      </section>

      <footer className="public-footer">
        <span>ASMC Firozabad · SPANDAN 4.0</span>
        <Link href="/my-fest">Go to My Fest →</Link>
      </footer>
    </main>
  );
}
