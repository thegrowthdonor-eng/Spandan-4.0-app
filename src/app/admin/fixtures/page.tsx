import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { FixturesClient, FixtureItem } from "./fixtures-client";
import { AdminEventPicker } from "@/components/admin/event-picker";
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

  const { data: eventData } = await client.rpc("list_managed_events");
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
  const selected = events.find((event) => event.id === wanted) ?? events[0];

  const { data, error } = await client.rpc("list_event_fixtures", { p_event_id: selected.id });
  const fixtures = (data ?? []) as FixtureItem[];

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
        <h1>Fixtures & scores</h1>
        <p>
          Create fixtures, manage live scoring with templates (Cricket, Football, Badminton, Generic), and reschedule
          with mandatory audit reasons and version bumping. Participants receive schedule reminders automatically.
        </p>
      </section>

      <AdminEventPicker events={events} selectedId={selected.id} basePath="/admin/fixtures" />

      {error ? (
        <p className="fixture-empty">Fixtures are temporarily unavailable.</p>
      ) : (
        <FixturesClient event={selected} fixtures={fixtures} />
      )}
    </main>
  );
}
