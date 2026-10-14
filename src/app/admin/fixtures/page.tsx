import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { FixtureForm } from "./fixture-form";
import "./fixtures.css";

export const dynamic = "force-dynamic";
type Event = { id: string; title: string };
type Fixture = { fixture_id: string; stage: string; participant_a_label: string; participant_b_label: string; venue: string | null; reporting_at: string | null; starts_at: string | null; state: string; schedule_version: number; score_version: number; score_status: string | null };
function time(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "To be scheduled"; }
export default async function FixturesPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) return <main className="fixtures-page"><section className="fixture-empty">Fixture setup is not connected.</section></main>;
  const client = await createRequestClient(); if (!(await client.auth.getUser()).data.user) redirect("/account");
  const { data: eventData } = await client.rpc("list_managed_events"); const events = (eventData ?? []) as Event[]; if (!events.length) return <main className="fixtures-page"><section className="fixture-empty">No assigned events are available.</section></main>;
  const wanted = (await searchParams).event; const selected = events.find((event) => event.id === wanted) ?? events[0]; const { data, error } = await client.rpc("list_event_fixtures", { p_event_id: selected.id }); const fixtures = (data ?? []) as Fixture[];
  return <main className="fixtures-page"><header className="fixtures-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/admin/review">Review queue</Link></header><section className="fixtures-intro"><p className="eyebrow">Event-head workspace</p><h1>Make the<br /><em>draw.</em></h1><p>Create fixtures only after the participant/roster decision is ready. Any later schedule change must carry a reason and correct schedule version.</p></section><nav className="fixture-picker" aria-label="Managed events">{events.map((event) => <Link aria-current={event.id === selected.id ? "page" : undefined} key={event.id} href={`/admin/fixtures?event=${event.id}`}>{event.title}</Link>)}</nav><section className="fixture-layout"><FixtureForm eventId={selected.id} /><div>{error ? <p className="fixture-empty">Fixtures are temporarily unavailable.</p> : fixtures.length ? <div className="fixture-list">{fixtures.map((fixture) => <article className="fixture-card" key={fixture.fixture_id}><p className="fixture-state">{fixture.state} · schedule v{fixture.schedule_version}{fixture.score_version ? ` · score v${fixture.score_version}` : ""}</p><h2>{fixture.participant_a_label} <em>vs</em> {fixture.participant_b_label}</h2><p>{fixture.stage} · {fixture.venue ?? "Venue to be announced"}</p><p>Reporting: {time(fixture.reporting_at)} · Starts: {time(fixture.starts_at)}{fixture.score_status ? ` · Score ${fixture.score_status}` : ""}</p></article>)}</div> : <p className="fixture-empty">No fixtures have been created for {selected.title}.</p>}</div></section></main>;
}
