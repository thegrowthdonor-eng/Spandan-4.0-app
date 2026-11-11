import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { FixturesClient, FixtureItem } from "./fixtures-client";
import { AdminEventPicker } from "@/components/admin/event-picker";
import { CompetitionWorkspacePanel } from "@/components/admin/competition-workspace";
import type { CompetitionWorkspace } from "@/lib/competition";
import "./fixtures.css";

export const dynamic = "force-dynamic";

type ManagedEvent = {
  id: string;
  title: string;
  category: string;
  format: string;
  state: string;
  score_template?: string;
};

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  if (!hasPublicSupabaseConfiguration()) {
    return (
      <main className="fixtures-page">
        <section className="fixture-empty">Fixture setup is not connected.</section>
      </main>
    );
  }

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");

  const { data: eventData } = await client.rpc("list_competition_events");
  const events = (eventData ?? []) as ManagedEvent[];

  if (!events.length) {
    return (
      <main className="fixtures-page">
        <header className="fixtures-header">
          <Link className="wordmark" href="/">
            Spandan <span>4.0</span>
          </Link>
          <div className="header-nav-links">
            <Link href="/admin">Organiser Hub</Link>
          </div>
        </header>
        <section className="fixture-empty-state">
          <p className="eyebrow">Fixtures & Live Scores</p>
          <h2>No Assigned Events</h2>
          <p>You do not currently have any events assigned to your organiser profile. As an organiser or event head, your assigned events will show up here once configured.</p>
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

  const [
    { data, error },
    mainAdmin,
    { data: batchesData },
    { data: groupsData },
    { data: soloData },
    { data: eventDetails },
    { data: startData, error: startError },
  ] = await Promise.all([
    client.rpc("list_event_fixtures", { p_event_id: selected.id }),
    client.rpc("is_main_admin"),
    client.rpc("list_event_eligible_batches", { p_event_id: selected.id }),
    client.rpc("list_event_participant_groups", { p_event_id: selected.id }),
    client.rpc("list_event_selection_queue", { p_event_id: selected.id }),
    client.from("events").select("venue, starts_at, ends_at, score_template,operating_method").eq("id", selected.id).single(),
    client.from("fixtures").select("id, actual_started_at").eq("event_id", selected.id),
  ]);
  const fixtures = ((data ?? []) as FixtureItem[]).map(f => ({ ...f, actual_started_at: startData?.find(s => s.id === f.fixture_id)?.actual_started_at ?? null }));
  const batches = (batchesData ?? []) as Array<{ batch_id: string; label: string; course_label?: string | null }>;
  const groups = (groupsData ?? []) as Array<{ group_id: string; name: string; batch_id: string; state: string }>;
  const soloStudents = (soloData ?? []) as Array<{ application_id: string; student_id: string; full_name: string; batch_label: string; course_label?: string | null; roll_canonical: string }>;
  const defaultVenue = eventDetails?.venue ?? "";
  const { data: workspace, error: workspaceError } = await client.rpc("competition_workspace", { p_event_id: selected.id });

  return (
    <main className="fixtures-page">
      <header className="fixtures-header">
        <Link className="wordmark" href="/">
          Spandan <span>4.0</span>
        </Link>
        <div className="header-nav-links">
          <Link href="/admin">Organiser Hub</Link>
          <Link href={`/admin/review?event=${selected.id}`}>Review Queue</Link>
          <Link href="/my-fest">My Fest</Link>
        </div>
      </header>

      <section className="fixtures-intro">
        <p className="eyebrow">Competition operations</p>
        <h1>Competition &amp; Schedule</h1>
        <p>Fixtures, final results or public voting — the controls your event needs.</p>
      </section>

      <AdminEventPicker events={events} selectedId={selected.id} basePath="/admin/fixtures" compact />

      {workspaceError && <p role="alert">Competition settings unavailable. Existing match operations remain accessible.</p>}
      {
        <CompetitionWorkspacePanel key={selected.id} initial={(workspace ?? { event: { ...selected,operating_method:eventDetails?.operating_method, registration_enabled:true },staff:true,settings:null,candidates:[],sessions:[],entries:[],rounds:[],placements:[] }) as CompetitionWorkspace}>
        {error || startError ? <p role="alert">Match operations unavailable. Refresh to retry.</p> :
        <FixturesClient
          key={selected.id}
          event={{
            ...selected,
            operating_method:eventDetails?.operating_method,
            score_template: eventDetails?.score_template ?? selected.score_template,
            venue: defaultVenue,
            starts_at: eventDetails?.starts_at ?? null,
            ends_at: eventDetails?.ends_at ?? null,
          }}
          fixtures={fixtures}
          eligibleBatches={batches}
          registeredGroups={groups}
          soloStudents={soloStudents}
          isMainAdmin={mainAdmin.data === true}
        />}
        </CompetitionWorkspacePanel>
      }
    </main>
  );
}
