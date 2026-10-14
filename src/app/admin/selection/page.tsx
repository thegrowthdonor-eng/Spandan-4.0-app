import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { SelectionActions } from "./selection-actions";
import "../review/review.css";

export const dynamic = "force-dynamic";
type Event = { id: string; title: string; format: string };
type Row = { application_id: string; full_name: string; batch_label: string; course_label: string | null; roll_canonical: string; review_state: string; selection_state: string; submitted_at: string };
export default async function SelectionPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) return <main className="review-page"><section className="review-empty">Organiser selection setup is not connected.</section></main>;
  const client = await createRequestClient(); if (!(await client.auth.getUser()).data.user) redirect("/account");
  const { data: managed } = await client.rpc("list_managed_events"); const events = ((managed ?? []) as Event[]).filter((event) => event.format === "solo");
  if (!events.length) return <main className="review-page"><section className="review-empty">No assigned solo events are available. Pair, group and sport selection is handled through squad/group publishing.</section></main>;
  const wanted = (await searchParams).event; const selected = events.find((event) => event.id === wanted) ?? events[0];
  const { data, error } = await client.rpc("list_event_selection_queue", { p_event_id: selected.id }); const queue = (data ?? []) as Row[];
  return <main className="review-page"><header className="review-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/admin/review">Review queue</Link></header><section className="review-intro"><p className="eyebrow">Event-head workspace</p><h1>Select solo<br /><em>participants.</em></h1><p>Only approved solo applications appear here. This changes final selection without altering the prior approval record.</p></section><nav className="event-picker" aria-label="Managed solo events">{events.map((event) => <Link aria-current={event.id === selected.id ? "page" : undefined} key={event.id} href={`/admin/selection?event=${event.id}`}>{event.title}</Link>)}</nav>{error ? <p className="review-empty">The selection queue is temporarily unavailable.</p> : queue.length ? <section className="review-queue">{queue.map((row) => <article className="review-row" key={row.application_id}><div><p className="review-state">Approved · selection {row.selection_state}</p><h2>{row.full_name}</h2><p>{row.batch_label}{row.course_label ? ` · ${row.course_label}` : ""} · Roll {row.roll_canonical}</p></div><div><p>Approved application submitted {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(row.submitted_at))}</p><p>Selection state is visible to the student in My Fest.</p></div><SelectionActions applicationId={row.application_id} /></article>)}</section> : <p className="review-empty">No approved applications are ready for selection in {selected.title}.</p>}</main>;
}
