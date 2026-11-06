import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { SelectionClient, SelectionRow } from "./selection-client";
import { AdminEventPicker } from "@/components/admin/event-picker";
import "../review/review.css";

export const dynamic = "force-dynamic";

type ManagedEvent = {
  id: string;
  title: string;
  format: string;
};

export default async function SelectionPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) {
    return (
      <main className="review-page">
        <section className="review-empty">Organiser selection setup is not connected.</section>
      </main>
    );
  }

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");

  const { data: managed } = await client.rpc("list_managed_events");
  const events = ((managed ?? []) as ManagedEvent[]).filter((event) => event.format === "solo");

  if (!events.length) {
    return (
      <main className="review-page">
        <header className="review-header">
          <Link className="wordmark" href="/">
            Spandan <span>4.0</span>
          </Link>
          <div className="header-nav-links">
            <Link href="/admin">Organiser Hub</Link>
          </div>
        </header>
        <section className="review-empty-state">
          <p className="eyebrow">Solo Selection Desk</p>
          <h3>No Assigned Solo Events</h3>
          <p>No assigned solo events are available for this account. Pairs use mutual invitations; groups and sports teams use leader proposals and coordinator approval.</p>
          <div className="empty-actions">
            <Link href="/admin" className="empty-action-primary">← Return to Organiser Hub</Link>
            <Link href="/admin/groups" className="empty-action-secondary">Pairs, groups &amp; teams →</Link>
          </div>
        </section>
      </main>
    );
  }

  const wanted = (await searchParams).event;
  if (wanted && !events.some(event => event.id === wanted)) return <main className="portal-unavailable"><h1>Event unavailable</h1><p>This event is outside your responsibility or has been removed.</p><Link href="/admin">Back to my workspace</Link></main>;
  const selected = events.find((event) => event.id === wanted) ?? events[0];

  const { data, error } = await client.rpc("list_event_selection_queue", { p_event_id: selected.id });
  const queue = (data ?? []) as SelectionRow[];

  return (
    <main className="review-page">
      <header className="review-header">
        <Link className="wordmark" href="/">
          Spandan <span>4.0</span>
        </Link>
        <div className="header-nav-links">
          <Link href="/admin">Organiser Hub</Link>
          <Link href={`/admin/review?event=${selected.id}`}>Review Queue</Link>
          <Link href="/my-fest">My Fest</Link>
        </div>
      </header>

      <section className="review-intro">
        <p className="eyebrow">Event-head workspace</p>
        <h1>Participant roster</h1>
        <p>
          New solo approvals are added to the roster automatically. Manage reserves, remove participants or add previously approved students here.
        </p>
      </section>

      <AdminEventPicker events={events} selectedId={selected.id} basePath="/admin/selection" label="Managed solo events" />

      {error ? (
        <p className="review-empty">The selection queue is temporarily unavailable.</p>
      ) : (
        <SelectionClient key={selected.id} event={selected} candidates={queue} />
      )}
    </main>
  );
}
