import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { ResultsClient, PointRule, ResultPublication, ResultParticipant } from "./results-client";
import { AdminEventPicker } from "@/components/admin/event-picker";
import "./results.css";
import type { CompetitionWorkspace } from "@/lib/competition";

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
  if (wanted && !events.some(event => event.id === wanted)) return <main className="portal-unavailable"><h1>Event unavailable</h1><p>This event is outside your responsibility or has been removed.</p><Link href="/admin">Back to my workspace</Link></main>;
  const selected = events.find((event) => event.id === wanted) ?? events[0];

  const [{ data: ruleData }, { data: resultData }, { data: participantData }] = await Promise.all([
    client.rpc("list_event_point_rules", { p_event_id: selected.id }),
    client.rpc("list_event_results", { p_event_id: selected.id }),
    client.rpc("list_result_participants", { p_event_id: selected.id }),
  ]);

  const pointRules = (ruleData ?? []) as PointRule[];
  const results = (resultData ?? []) as ResultPublication[];
  const participants = (participantData ?? []) as ResultParticipant[];
  const {data:operations}=await client.rpc("competition_workspace",{p_event_id:selected.id});
  const workspace=operations as CompetitionWorkspace|null;
  const confirmedPositions=(workspace?.settings?.result_mode === "public_vote" && workspace.settings.verified ? workspace.placements.map(place=>{const entry=workspace.entries.find(entry=>entry.id === place.entry_id)!;return {placing:place.placing,targetKey:entry.application_id ? `application:${entry.application_id}` : `group:${entry.group_id}`,note:"Verified public voting"};}) : workspace?.sessions.filter(session=>session.is_final && session.state === "completed").flatMap(session=>session.entrants.filter(row=>row.placing!==null).map(row=>({placing:row.placing!,targetKey:row.application_id ? `application:${row.application_id}` : `group:${row.group_id}`,note:row.note}))) ?? []).sort((a,b)=>a.placing-b.placing);

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
        key={selected.id}
        event={selected}
        pointRules={pointRules}
        results={results}
        participants={participants}
        isMainAdmin={isAdmin === true}
        confirmedPositions={confirmedPositions}
        competitionPointsLocked={Boolean(workspace?.rounds.length)}
      />
    </main>
  );
}
