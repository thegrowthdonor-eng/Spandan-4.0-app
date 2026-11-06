import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { AdminEventPicker } from "@/components/admin/event-picker";
import { GroupComposer, type Team } from "./group-composer";
import "./groups.css";

export const dynamic = "force-dynamic";
type Event = { id: string; title: string; category?: string; format: string; state?: string };
type CandidateRow = { event_id: string; event_title: string; event_format: string; batch_restricted: boolean; group_min_size: number | null; group_max_size: number | null; application_id: string; student_id: string; full_name: string; batch_id: string; batch_label: string; course_label: string | null; roll_canonical: string };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) return <main className="groups-page"><section className="groups-empty">Organiser group setup is not connected.</section></main>;
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");
  const { data: managed } = await client.rpc("list_managed_events");
  const events = ((managed ?? []) as Event[]).filter((event) => event.format !== "solo");
  if (!events.length) return <main className="groups-page"><header className="groups-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/admin">Organiser Hub</Link></header><section className="groups-empty-state"><p className="eyebrow">Squads &amp; Captains</p><h2>No Assigned Group Events</h2><p>No pair, group, or sports events are currently assigned to your organiser profile.</p><div className="empty-actions"><Link href="/admin" className="empty-action-primary">← Return to Organiser Hub</Link></div></section></main>;

  const wanted = (await searchParams).event;
  if (wanted && !events.some(event => event.id === wanted)) return <main className="portal-unavailable"><h1>Event unavailable</h1><p>Select an assigned team event.</p><Link href="/admin/groups">My team events</Link></main>;
  const selected = events.find((event) => event.id === wanted) ?? events[0];
  const [{ data: candidateData, error }, { data: groupData, error: groupError }, { data: rulesData, error: rulesError }] = await Promise.all([
    client.rpc("list_group_selection_candidates", { p_event_id: selected.id }),
    client.rpc("get_management_teams", { p_event_id: selected.id }),
    client.rpc("get_management_team_rules", { p_event_id: selected.id }),
  ]);
  const candidates = (candidateData ?? []) as CandidateRow[];
  const groups = (groupData ?? []) as Team[];
  const config = rulesData as Pick<CandidateRow, "event_format" | "batch_restricted" | "group_min_size" | "group_max_size"> | null;

  return <main className="groups-page">
    <header className="groups-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/admin/review">Review queue</Link></header>
    <section className="groups-intro"><p className="eyebrow">Event-head workspace</p><h1>Groups &amp; captains</h1><p>Only approved, not-yet-selected students can be placed in a group. Publishing finalises their selection.</p></section>
    <AdminEventPicker events={events} selectedId={selected.id} basePath="/admin/groups" label="Managed group events" />
    {error || groupError || rulesError ? <p className="groups-empty">The eligible candidate list is temporarily unavailable.</p> : <GroupComposer key={selected.id} teams={groups} eventId={selected.id} format={config?.event_format ?? selected.format} batchRestricted={config?.batch_restricted ?? false} minSize={config?.group_min_size ?? null} maxSize={config?.group_max_size ?? null} candidates={candidates.map((row) => ({ applicationId: row.application_id, studentId: row.student_id, fullName: row.full_name, batchId: row.batch_id, batchLabel: row.batch_label, courseLabel: row.course_label, roll: row.roll_canonical }))} />}
  </main>;
}
