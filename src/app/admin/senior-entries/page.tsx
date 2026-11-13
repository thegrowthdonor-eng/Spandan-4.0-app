import Link from "next/link";
import { createRequestClient } from "@/server/supabase/server";
import { participantLabels, type ParticipantCategory } from "@/lib/participants";

export const dynamic = "force-dynamic";
export default async function SeniorEntriesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const pageValue = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 100000) : 1;
  const client = await createRequestClient();
  const result = await client.from("senior_event_registrations").select("id,full_name,category,department,phone,gender,answers,additional_details,created_at,events(title,application_questions)", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((page - 1) * 50, page * 50 - 1);
  const entries = result.data ?? [];
  const now = new Date().getTime();
  const recent = entries.filter(entry => now - Date.parse(entry.created_at) < 24 * 60 * 60 * 1000).length;
  return <main className="portal-dashboard">
    <header className="portal-heading"><div><p className="portal-eyebrow">Private coordinator inbox</p><h1>PG / JR / FMG / Faculty entries</h1><p>{recent} new on this page in the last 24 hours. Contact participants and manage arrangements offline.</p></div><a href="/admin/senior-entries" className="portal-primary">Refresh</a></header>
    {result.error ? <p role="alert">Entries unavailable. Refresh to retry.</p> : !entries.length ? <p>No entries for your assigned events yet.</p> : <div className="senior-inbox">{entries.map(entry => {
      const event = entry.events as unknown as { title: string; application_questions?: { key: string; label: string }[] } | null;
      return <article className="portal-event" key={entry.id}>
        <h2>{event?.title ?? "Festival event"}</h2><strong>{entry.full_name}</strong>
        {now - Date.parse(entry.created_at) < 86400000 && <span className="senior-new">New</span>}
        <p>{participantLabels[entry.category as ParticipantCategory]} · {entry.department} · {entry.gender.replaceAll("_", " ")}</p>
        <p><a href={`tel:${entry.phone}`}>{entry.phone}</a></p>
        <p>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(entry.created_at))} IST</p>
        {Object.entries(entry.answers as Record<string, string>).map(([question, answer]) => <p key={question}><strong>{event?.application_questions?.find(q => q.key === question)?.label ?? question}: </strong>{answer}</p>)}
        {entry.additional_details && <p><strong>Additional details: </strong>{entry.additional_details}</p>}
      </article>;
    })}</div>}
    <nav className="portal-event-actions" aria-label="Entry pages">{page > 1 && <Link href={`/admin/senior-entries?page=${page - 1}`}>Previous</Link>}{page * 50 < (result.count ?? 0) && <Link href={`/admin/senior-entries?page=${page + 1}`}>Next</Link>}<Link href="/admin">Back to organiser workspace</Link></nav>
  </main>;
}
