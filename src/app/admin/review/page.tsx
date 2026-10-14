import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { ReviewActions } from "./review-actions";
import "./review.css";

export const dynamic = "force-dynamic";
type Event = { id: string; title: string; category: string; format: string; state: string };
type Row = { application_id: string; full_name: string; batch_label: string; course_label: string | null; roll_canonical: string; review_state: string; selection_state: string; submitted_at: string };
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) return <main className="review-page"><section className="review-empty">Organiser review setup is not connected.</section></main>;
  const client = await createRequestClient(); if (!(await client.auth.getUser()).data.user) redirect("/account");
  const { data: eventData } = await client.rpc("list_managed_events"); const events = (eventData ?? []) as Event[];
  if (!events.length) return <main className="review-page"><section className="review-empty">No event-head or main-admin assignment is available for this account.</section></main>;
  const wanted = (await searchParams).event; const selected = events.find((event) => event.id === wanted) ?? events[0];
  const { data: queueData, error } = await client.rpc("list_event_review_queue", { p_event_id: selected.id }); const queue = (queueData ?? []) as Row[];
  return <main className="review-page"><header className="review-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/my-fest">My Fest</Link></header><section className="review-intro"><p className="eyebrow">Event-head workspace</p><h1>Review with<br /><em>care.</em></h1><p>You can review applications only for events assigned to you. Approval and final participant selection remain separate decisions.</p></section><nav className="event-picker" aria-label="Managed events">{events.map((event) => <Link aria-current={event.id === selected.id ? "page" : undefined} key={event.id} href={`/admin/review?event=${event.id}`}>{event.title}</Link>)}</nav>{error ? <p className="review-empty">Applications are temporarily unavailable.</p> : queue.length ? <section className="review-queue" aria-label={`${selected.title} applications`}>{queue.map((row) => <article className="review-row" key={row.application_id}><div><p className="review-state">{row.review_state} · selection {row.selection_state}</p><h2>{row.full_name}</h2><p>{row.batch_label}{row.course_label ? ` · ${row.course_label}` : ""} · Roll {row.roll_canonical}</p></div><div><p>Submitted {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(row.submitted_at))}</p><p>Review does not itself select the student into a group or squad.</p></div><ReviewActions applicationId={row.application_id} /></article>)}</section> : <p className="review-empty">No applications are waiting for review in {selected.title}.</p>}</main>;
}
