import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { ResultsClient, PointRule, EligibleBatch, ResultPublication } from "./results-client";
import { AdminEventPicker } from "@/components/admin/event-picker";
import "./results.css";

export const dynamic = "force-dynamic";

type ManagedEvent = {
  id: string;
  title: string;
  category: string;
  format: string;
  state: string;
  score_template?: string;
};

export default async function AdminResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  if (!hasPublicSupabaseConfiguration()) {
    return (
      <main className="results-page">
        <section className="results-empty">Results setup is not connected.</section>
      </main>
    );
  }

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");

  const [{ data: eventData }, { data: isAdmin }] = await Promise.all([
    client.rpc("list_managed_events"),
    client.rpc("is_main_admin"),
  ]);

  const events = (eventData ?? []) as ManagedEvent[];
  if (!events.length) {
    return (
      <main className="results-page">
        <header className="results-header">
          <Link className="wordmark" href="/">
            Spandan <span>4.0</span>
          </Link>
          <div className="header-nav-links">
            <Link href="/admin">Organiser Hub</Link>
          </div>
        </header>
        <section className="results-empty-state">
          <p className="eyebrow">Results & Podium Tally</p>
          <h2>No Assigned Events</h2>
          <p>No assigned events are currently available for this account. Once events are active and assigned, official podium positions and batch points can be recorded here.</p>
          <div className="empty-actions">
            <Link href="/admin" className="empty-action-primary">← Return to Organiser Hub</Link>
            <Link href="/admin/events" className="empty-action-secondary">Event Catalogue & Rules →</Link>
          </div>
        </section>
      </main>
    );
  }

  const wanted = (await searchParams).event;
  const selected = events.find((event) => event.id === wanted) ?? events[0];

  const [{ data: batchData }, { data: ruleData }, { data: resultData }, { data: participantData }] = await Promise.all([
    client.rpc("list_event_eligible_batches", { p_event_id: selected.id }),
    client.rpc("list_event_point_rules", { p_event_id: selected.id }),
    client.rpc("list_event_results", { p_event_id: selected.id }),
    client.rpc("list_result_participants", { p_event_id: selected.id }),
  ]);

  const batches = (batchData ?? []) as EligibleBatch[];
  const pointRules = (ruleData ?? []) as PointRule[];
  const results = (resultData ?? []) as ResultPublication[];
  const participants = (participantData ?? []) as Array<{
    target_id: string;
    target_kind: "application" | "group";
    label: string;
    category: string;
    batch_id: string | null;
  }>;

  return (
    <main className="results-page">
      <header className="results-header">
        <Link className="wordmark" href="/">
          Spandan <span>4.0</span>
        </Link>
        <div className="header-nav-links">
          <Link href="/admin">Organiser Hub</Link>
          <Link href={`/admin/fixtures?event=${selected.id}`}>Fixtures</Link>
          <Link href="/standings">Public Standings</Link>
          <Link href="/my-fest">My Fest</Link>
        </div>
      </header>

      <section className="results-intro">
        <p className="eyebrow">Competition operations</p>
        <h1>Results & podium</h1>
        <p>
          Configure point rules and publish final event positions to update the batch leaderboard. Any later correction
          supersedes the prior version with an audited reason.
        </p>
      </section>

      <AdminEventPicker events={events} selectedId={selected.id} basePath="/admin/results" />

      <ResultsClient
        event={selected}
        batches={batches}
        pointRules={pointRules}
        results={results}
        participants={participants}
        isMainAdmin={isAdmin === true}
      />
    </main>
  );
}
