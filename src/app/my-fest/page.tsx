import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import "./my-fest.css";

export const dynamic = "force-dynamic";

type Application = { id: string; review_state: string; selection_state: string; events: { title: string; starts_at: string | null } | null };

export default async function MyFestPage() {
  if (!hasSupabaseConfiguration()) return <main className="my-fest-page"><p className="eyebrow">My Fest</p><h1>Your festival space is being prepared.</h1><p>Account setup is not configured yet. No fest data is shown until the organiser connects the live, protected service.</p><Link href="/account">Back to account →</Link></main>;
  const client = await createRequestClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/account");
  const [profileResult, accessResult, applicationResult] = await Promise.all([
    client.from("profiles").select("full_name,fest_id,batches(label,course_label)").eq("id", auth.user.id).maybeSingle(),
    client.from("access_records").select("state,reason,verified_at").eq("profile_id", auth.user.id).maybeSingle(),
    client.from("applications").select("id,review_state,selection_state,events(title,starts_at)").eq("student_id", auth.user.id).order("created_at", { ascending: false }),
  ]);
  if (profileResult.error || !profileResult.data) return <main className="my-fest-page"><p className="eyebrow">My Fest</p><h1>We could not load your fest profile.</h1><p>Please sign out and sign in again. If this continues, contact the authorised fest help desk.</p><Link href="/account">Back to account →</Link></main>;
  const profile = profileResult.data;
  const batch = profile.batches as unknown as { label?: string; course_label?: string | null } | null;
  const access = accessResult.data;
  const applications = (applicationResult.data ?? []) as unknown as Application[];
  const status = access?.state ?? "pending";
  return <main className="my-fest-page">
    <header className="my-fest-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><form action="/api/auth/logout" method="post"><button type="submit" className="text-button">Sign out</button></form></header>
    <section className="my-fest-intro"><p className="eyebrow">My Fest · {profile.fest_id}</p><h1>Hello, <em>{profile.full_name.split(" ")[0]}.</em></h1><p>{batch?.label ?? "Your batch"}{batch?.course_label ? ` · ${batch.course_label}` : ""}</p></section>
    <section className="fest-status" aria-label="Registration status"><div><p className="eyebrow">Registration access</p><strong className={`status-${status}`}>{status}</strong></div><p>{status === "active" ? "Your registration access is active. Event rules and windows still apply." : status === "pending" ? "Your profile is pending college identity and offline contribution verification." : "Your registration access needs organiser review. Contact the authorised fest help desk."}</p></section>
    <section className="applications-section"><div className="section-heading"><p className="eyebrow">Your applications</p><h2>Track every entry.</h2></div>{applicationResult.error ? <p className="load-message">Applications are temporarily unavailable. Your account data remains protected.</p> : applications.length ? <ul className="application-list">{applications.map((application) => <li key={application.id}><div><strong>{application.events?.title ?? "Fest event"}</strong><p>{application.events?.starts_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(application.events.starts_at)) : "Schedule will be published by the organiser."}</p></div><div className="application-state"><span>Review: {application.review_state}</span><span>Selection: {application.selection_state}</span></div></li>)}</ul> : <p className="load-message">You have not applied to an event yet. Published event applications will appear here after organiser setup.</p>}</section>
  </main>;
}
