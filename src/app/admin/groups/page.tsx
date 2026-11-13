import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { AdminEventPicker } from "@/components/admin/event-picker";
import { TeamWorkspace } from "@/components/participation/team-workspace";
import { participationTools } from "@/lib/event-participation";
import type { TeamWorkspaceData } from "@/lib/team-contracts";

export const dynamic = "force-dynamic";
type ManagedEvent = { id: string; title: string; category: string; format: string; state: string };
export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) return <p>Participation workspace is not connected.</p>;
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account?next=/admin/groups");
  const { data: managed, error: managedError } = await client.rpc("list_managed_events");
  if (managedError) return <p role="alert">Your events could not be loaded. Refresh to try again.</p>;
  const events = ((managed ?? []) as ManagedEvent[]).filter(e => ["pair","group","sport"].includes(e.format));
  const wanted = (await searchParams).event;
  const requested = ((managed ?? []) as ManagedEvent[]).find(e => e.id === wanted);
  if (requested?.format === "solo") redirect("/admin/selection?event=" + requested.id);
  if (wanted && !events.some(e => e.id === wanted)) return <main className="portal-unavailable"><h1>Event unavailable</h1><p>Select an assigned pair, group or team event.</p><Link href="/admin/groups">My assigned events</Link></main>;
  if (!events.length) return <main className="portal-unavailable"><h1>No assigned pair, group or team events</h1><p>Solo events use the participant roster, without captains or team creation.</p><Link href="/admin/review">Review participants →</Link></main>;
  const selected = events.find(e => e.id === wanted) ?? events[0];
  const { data, error } = await client.rpc("get_team_workspace", { p_event_id: selected.id });
  const { data: event } = await client.from("events").select("operating_method").eq("id", selected.id).single();
  const tools = participationTools(selected.format, event?.operating_method);
  return <main className="groups-page">
    <section className="portal-heading"><div><p className="portal-eyebrow">Event participation</p><h1>{tools?.label}</h1><p>{selected.format === "pair" ? "Review mutually confirmed pairs. No captains or manual partner assignment." : tools?.noun === "performances" ? "Appoint a performance lead, including for solo entries. They propose the performance name and members; you review and approve the roster." : "Appoint a leader. They choose the initial name and squad; you review, edit and approve."}</p></div></section>
    <AdminEventPicker events={events} selectedId={selected.id} basePath="/admin/groups" />
    {error || !data ? <p role="alert">The participation workspace could not be loaded. Refresh to retry.</p> : <TeamWorkspace key={selected.id} data={{...data as TeamWorkspaceData, operatingMethod: event?.operating_method}} />}
  </main>;
}
