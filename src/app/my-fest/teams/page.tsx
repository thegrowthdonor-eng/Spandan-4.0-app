import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createRequestClient } from "@/server/supabase/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { TeamWorkspace } from "@/components/participation/team-workspace";
import type { TeamWorkspaceData } from "@/lib/team-contracts";
import "@/components/participation/team-workspace.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Teams & Invitations | Spandan 4.0" };
export default async function MyTeamsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) redirect("/account");
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account?next=/my-fest/teams");
  const { data: eventData, error: eventError } = await client.rpc("get_my_team_events");
  const events = (eventData ?? []) as { id: string; title: string }[];
  const wanted = (await searchParams).event;
  const eventId = wanted ?? events[0]?.id;
  const workspace = eventId ? await client.rpc("get_team_workspace", { p_event_id: eventId }) : null;
  const event = workspace?.data ? await client.from("events").select("operating_method").eq("id", eventId!).single() : null;
  return <main className="student-team-page"><header><Link href="/my-fest">← My Fest</Link><h1>My Teams & Invitations</h1><p>Choose your partner, manage your appointed squad, and track coordinator approval.</p></header>
    <nav className="student-team-tabs" aria-label="My participation events">{events.map(e => <Link key={e.id} href={`/my-fest/teams?event=${e.id}`} aria-current={e.id === eventId ? "page" : undefined}>{e.title}</Link>)}</nav>
    {eventError || workspace?.error ? <section className="team-panel"><h2>Workspace unavailable</h2><p>An active verified festival account is required. If your access is active, refresh to try again.</p><Link href="/my-fest">Check my access →</Link></section> : workspace?.data ? <TeamWorkspace key={eventId} data={{...workspace.data as TeamWorkspaceData, operatingMethod: event?.data?.operating_method}} participantView /> : <section className="team-panel"><h2>No invitations or teams yet</h2><p>Register for an event to get started. For pair events, open the event and invite your partner.</p><Link href="/events">Browse events →</Link></section>}
  </main>;
}
