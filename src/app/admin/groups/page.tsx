import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { GroupComposer } from "./group-composer";
import "./groups.css";

export const dynamic = "force-dynamic";
type Event = { id: string; title: string; format: string };
type CandidateRow = { event_id: string; event_title: string; event_format: string; batch_restricted: boolean; group_min_size: number | null; group_max_size: number | null; application_id: string; student_id: string; full_name: string; batch_id: string; batch_label: string; course_label: string | null; roll_canonical: string };
type Group = { group_id: string; name: string; state: string; member_count: number };
export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) return <main className="groups-page"><section className="groups-empty">Organiser group setup is not connected.</section></main>;
  const client = await createRequestClient(); if (!(await client.auth.getUser()).data.user) redirect("/account");
  const { data: managed } = await client.rpc("list_managed_events"); const events = ((managed ?? []) as Event[]).filter((event) => event.format !== "solo");
  if (!events.length) return <main className="groups-page"><section className="groups-empty">No assigned pair, group or sports events are available.</section></main>;
  const wanted = (await searchParams).event; const selected = events.find((event) => event.id === wanted) ?? events[0];
  const [{ data: candidateData, error }, { data: groupData }] = await Promise.all([client.rpc("list_group_selection_candidates", { p_event_id: selected.id }), client.rpc("list_event_participant_groups", { p_event_id: selected.id })]);
  const candidates = (candidateData ?? []) as CandidateRow[]; const groups = (groupData ?? []) as Group[]; const config = candidates[0];
  return <main className="groups-page"><header className="groups-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/admin/review">Review queue</Link></header><section className="groups-intro"><p className="eyebrow">Event-head workspace</p><h1>Build the<br /><em>team.</em></h1><p>Only approved, not-yet-selected students can be placed in a group. Publishing finalises their selection; sports squads remain batch-wise and require a participant captain.</p></section><nav className="group-picker" aria-label="Managed group events">{events.map((event) => <Link aria-current={event.id === selected.id ? "page" : undefined} key={event.id} href={`/admin/groups?event=${event.id}`}>{event.title}</Link>)}</nav>{groups.length ? <p className="groups-empty">Existing groups: {groups.map((group) => `${group.name} (${group.member_count}, ${group.state})`).join(" · ")}</p> : null}{error ? <p className="groups-empty">The eligible candidate list is temporarily unavailable.</p> : candidates.length && config ? <GroupComposer eventId={selected.id} format={config.event_format} batchRestricted={config.batch_restricted} minSize={config.group_min_size} maxSize={config.group_max_size} candidates={candidates.map((row) => ({ applicationId: row.application_id, studentId: row.student_id, fullName: row.full_name, batchId: row.batch_id, batchLabel: row.batch_label, courseLabel: row.course_label, roll: row.roll_canonical }))} /> : <p className="groups-empty">No approved, unselected candidates are ready for group selection in {selected.title}.</p>}</main>;
}
