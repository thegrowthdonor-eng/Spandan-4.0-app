import Link from "next/link";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import "./events.css";

export const dynamic = "force-dynamic";
type EventCard = { id: string; title: string; slug: string; category: string; format: string; summary: string; state: string; starts_at: string | null };
function stateLabel(state: string) { return state === "open" ? "Applications open" : state === "ongoing" ? "In progress" : state === "completed" ? "Completed" : "Programme"; }
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Date to be announced"; }
export default async function EventsPage() {
  let events: EventCard[] = []; let unavailable = !hasPublicSupabaseConfiguration();
  if (!unavailable) { const { data, error } = await createPublicClient().from("events").select("id,title,slug,category,format,summary,state,starts_at").order("starts_at", { ascending: true, nullsFirst: false }).order("title"); unavailable = Boolean(error); events = (data ?? []) as EventCard[]; }
  return <main className="events-page"><header className="events-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/account">My Fest</Link></header><section className="events-hero"><p className="eyebrow">Public programme</p><h1>Find your <em>moment.</em></h1><p>Rules, schedules and registration availability appear here only after the organising committee publishes them.</p></section>{events.length ? <section className="event-grid" aria-label="Published events">{events.map((event) => <Link className="event-card" key={event.id} href={`/events/${event.slug}`}><div><p>{event.category} · {event.format}</p><h2>{event.title}</h2><p>{event.summary || "Details will be published by the organiser."}</p></div><div className="event-meta"><span>{stateLabel(event.state)}</span><span>{dateLabel(event.starts_at)}</span></div></Link>)}</section> : <section className="events-empty"><p className="eyebrow">{unavailable ? "Programme connection pending" : "No published events yet"}</p><h2>The line-up will appear here.</h2><p>{unavailable ? "The public programme service has not been configured. No unverified event information is shown." : "The committee has not published an event yet. Check back once the programme is confirmed."}</p></section>}</main>;
}
