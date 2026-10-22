import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { createRequestClient } from "@/server/supabase/server";
import { ApplyButton, WithdrawButton } from "../apply-button";
import { FestTopNav } from "@/components/spandan-branding";
import "../events.css";

export const dynamic = "force-dynamic";

type Question = { key: string; label: string; type: "text" | "select"; required: boolean; options?: string[] };
type EventDetail = {
  id: string;
  slug: string;
  title: string;
  category: string;
  format: string;
  summary: string;
  rules_markdown: string;
  venue: string | null;
  state: string;
  starts_at: string | null;
  reporting_at: string | null;
  application_opens_at: string | null;
  application_closes_at: string | null;
  roster_lock_at: string | null;
  waitlist_enabled: boolean;
  application_capacity: number | null;
  application_questions: Question[];
  poster_url: string | null;
  eligibility?: {
    division?: "boys" | "girls" | "open" | string;
    sub_category?: string;
    match_format?: string;
    squad_details?: string;
  } | null;
  group_min_size?: number | null;
  group_max_size?: number | null;
};

type PublishedResult = {
  publication_id: string;
  podium_photo_url: string | null;
  podium_caption: string | null;
  positions: Array<{
    placing: number;
    batch_label: string;
    points: number;
    note: string | null;
  }>;
};

function datetime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value))
    : "To be announced";
}

async function getEventResult(eventId: string): Promise<PublishedResult | null> {
  if (!hasPublicSupabaseConfiguration()) return null;
  try {
    const { data, error } = await createPublicClient()
      .from("result_publications")
      .select("id, podium_photo_url, podium_caption, result_positions(placing, note, batches(label))")
      .eq("event_id", eventId)
      .eq("state", "published")
      .maybeSingle();

    if (error || !data) return null;

    type RawPos = { placing: number; note: string | null; batches: { label: string } | null };
    const rawPositions = ((data.result_positions ?? []) as unknown as RawPos[]);
    const positions = rawPositions
      .map((p) => ({
        placing: p.placing,
        batch_label: p.batches?.label ? `Batch ${p.batches.label}` : "Batch",
        points: 0,
        note: p.note,
      }))
      .sort((a, b) => a.placing - b.placing);

    return {
      publication_id: data.id,
      podium_photo_url: (data as { podium_photo_url?: string | null }).podium_photo_url ?? null,
      podium_caption: (data as { podium_caption?: string | null }).podium_caption ?? null,
      positions,
    };
  } catch {
    return null;
  }
}

async function getEvent(slug: string): Promise<EventDetail | null> {
  if (!hasPublicSupabaseConfiguration()) return null;
  try {
    const { data, error } = await createPublicClient()
      .from("events")
      .select("id,slug,title,category,format,summary,rules_markdown,venue,state,starts_at,reporting_at,application_opens_at,application_closes_at,roster_lock_at,waitlist_enabled,application_capacity,application_questions,poster_url,eligibility,group_min_size,group_max_size")
      .eq("slug", slug)
      .maybeSingle();

    if (!error && data) return data as EventDetail;

    // Resilient fallback if poster_url migration is not yet applied
    const fallback = await createPublicClient()
      .from("events")
      .select("id,slug,title,category,format,summary,rules_markdown,venue,state,starts_at,reporting_at,application_opens_at,application_closes_at,roster_lock_at,waitlist_enabled,application_capacity,application_questions,eligibility,group_min_size,group_max_size")
      .eq("slug", slug)
      .maybeSingle();
    return fallback.data ? { ...fallback.data, poster_url: null } as EventDetail : null;
  } catch {
    return null;
  }
}

function renderMarkdownRules(markdown: string) {
  if (!markdown) return <p className="rules-empty">The organiser has not published event rules yet.</p>;

  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];

  function flushList() {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="rules-bullet-list">
          {currentList}
        </ul>
      );
      currentList = [];
    }
  }

  function formatInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="rules-strong">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={`h3-${index}`} className="rules-section-heading">
          {line.replace("### ", "")}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={`h2-${index}`} className="rules-section-heading">
          {line.replace("## ", "")}
        </h3>
      );
    } else if (line.startsWith("* ") || line.startsWith("- ")) {
      const content = line.replace(/^[* -]\s+/, "").trim();
      currentList.push(
        <li key={`li-${index}`} className="rules-bullet-item">
          {formatInline(content)}
        </li>
      );
    } else {
      flushList();
      elements.push(
        <p key={`p-${index}`} className="rules-paragraph">
          {formatInline(line)}
        </p>
      );
    }
  });

  flushList();
  return <div className="rules-formatted">{elements}</div>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const event = await getEvent((await params).slug);
  return {
    title: event ? `${event.title} | SPANDAN 4.0` : "Event | SPANDAN 4.0",
    description: event?.summary || "Spandan 4.0 festival event details.",
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getEvent((await params).slug);
  if (!event) notFound();

  const eventResult = await getEventResult(event.id);

  const now = new Date();
  const appOpen = event.state === "open"
    && event.application_opens_at != null
    && now >= new Date(event.application_opens_at)
    && event.application_closes_at != null
    && now < new Date(event.application_closes_at);

  // Check if the current user has already applied & detect schedule clashes (Doc 03)
  let existingApplication: { id: string; review_state: string; selection_state: string } | null = null;
  let userAccessState: string | null = null;
  let userGender: string | null = null;
  let isAuthenticated = false;
  let clashWarning: string | null = null;
  try {
    const client = await createRequestClient();
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      isAuthenticated = true;
      const [appResult, accessResult, profileResult, otherAppsResult] = await Promise.all([
        client.from("applications").select("id,review_state,selection_state").eq("event_id", event.id).eq("student_id", user.id).maybeSingle(),
        client.from("access_records").select("state").eq("profile_id", user.id).maybeSingle(),
        client.from("profiles").select("gender").eq("id", user.id).maybeSingle(),
        client.from("applications").select("id,events(id,title,starts_at)").eq("student_id", user.id).neq("review_state", "rejected").neq("review_state", "withdrawn"),
      ]);
      existingApplication = appResult.data;
      userAccessState = accessResult.data?.state ?? null;
      userGender = profileResult.data?.gender ?? null;

      if (!existingApplication && event.starts_at && otherAppsResult.data) {
        const thisStart = new Date(event.starts_at).getTime();
        for (const app of otherAppsResult.data) {
          const otherEvt = app.events as unknown as { id?: string; title?: string; starts_at?: string | null } | null;
          if (otherEvt && otherEvt.id !== event.id && otherEvt.starts_at) {
            const otherStart = new Date(otherEvt.starts_at).getTime();
            const diffHours = Math.abs(thisStart - otherStart) / (1000 * 60 * 60);
            if (diffHours < 3) {
              clashWarning = `⚠️ Schedule Clash Notice: This event starts around ${datetime(event.starts_at)}, which conflicts with your entry for "${otherEvt.title}" (${datetime(otherEvt.starts_at)}). You may still submit, but ensure your reporting times do not overlap.`;
              break;
            }
          }
        }
      }
    }
  } catch {
    // Public visitor — ignore
  }

  const questions: Question[] = Array.isArray(event.application_questions) ? event.application_questions : [];
  const division = event.eligibility?.division?.toLowerCase() ?? "open";
  const divisionTitle = division === "boys" ? "👦 Boys Division" : division === "girls" ? "👧 Girls Division" : "👥 Open / Mixed";

  function applicationGuidance(evt: EventDetail): React.ReactNode {
    if (evt.state === "cancelled") {
      return (
        <aside className="event-apply-note">
          <strong>This event has been cancelled.</strong>
          <p>No further applications or changes are possible. Contact the organiser for information about affected registrations.</p>
        </aside>
      );
    }
    if (evt.state === "completed") {
      return (
        <aside className="event-apply-note">
          <strong>This event has concluded.</strong>
          <p>Results and standings will be published by the organiser. Check the public standings page.</p>
          <Link href="/standings">View results &amp; standings →</Link>
        </aside>
      );
    }
    if (!isAuthenticated) {
      return (
        <aside className="event-apply-note">
          <strong>{appOpen ? "Applications are open." : "Applications are not open."}</strong>
          <p>Sign in with your fest account to apply. Registration requires an active student account verified by the organiser.</p>
          <Link href={`/account?next=/events/${evt.slug}`}>Sign in / Register →</Link>
        </aside>
      );
    }
    if (userAccessState === "pending") {
      return (
        <aside className="event-apply-note">
          <strong>Account verification pending.</strong>
          <p>Your account is awaiting verification by the organiser. You cannot apply until your account is activated. Check My Fest for your current status.</p>
          <Link href="/my-fest">My Fest →</Link>
        </aside>
      );
    }
    if (userAccessState === "rejected" || userAccessState === "suspended") {
      return (
        <aside className="event-apply-note">
          <strong>Registration access restricted.</strong>
          <p>Your account access has been restricted. Contact the organiser through the help desk in My Fest for assistance.</p>
          <Link href="/my-fest">My Fest →</Link>
        </aside>
      );
    }
    const requiredGender = division === "boys" ? "male" : division === "girls" ? "female" : null;
    if (requiredGender && userGender !== requiredGender) {
      return <aside className="event-apply-note"><strong>This event is outside your registered division.</strong><p>Your verified profile gender does not match this event&apos;s eligibility. Open and mixed events remain available.</p><Link href="/events">Browse eligible events →</Link></aside>;
    }
    if (existingApplication) {
      if (existingApplication.review_state === "withdrawn") {
        return <aside className="event-apply-note"><strong>Your previous application was withdrawn.</strong><p>You may submit a new application if registration is still open.</p>{appOpen && <ApplyButton eventId={evt.id} questions={questions} />}</aside>;
      }
      if (existingApplication.review_state === "rejected") {
        return <aside className="event-apply-note"><strong>This application was not approved.</strong><p>Check My Fest for the organiser&apos;s update. Contact the help desk only if you need clarification.</p><Link href="/my-fest">View in My Fest →</Link></aside>;
      }
      return (
        <aside className="event-apply-note">
          <strong>You have already applied to this event.</strong>
          <p>Your application is {existingApplication.review_state.replaceAll("_", " ")}. Selection status: {existingApplication.selection_state.replaceAll("_", " ")}.</p>
          <Link href="/my-fest">View in My Fest →</Link>
          <WithdrawButton applicationId={existingApplication.id} />
        </aside>
      );
    }
    if (!appOpen) {
      return (
        <aside className="event-apply-note">
          <strong>Applications are not currently open.</strong>
          <p>
            {evt.application_opens_at && now < new Date(evt.application_opens_at)
              ? `Registration opens on ${datetime(evt.application_opens_at)}.`
              : evt.state === "closed"
                ? "Registration for this event has closed."
                : "Check back once the organiser opens registration."}
          </p>
          <Link href="/my-fest">My Fest →</Link>
        </aside>
      );
    }
    return (
      <aside className="event-apply-note">
        <strong>Applications are open{evt.waitlist_enabled ? " (waitlist available if full)" : ""}.</strong>
        <p>
          Applying does not guarantee approval or final selection. The organiser reviews all applications.
          {evt.application_closes_at && ` Registration closes ${datetime(evt.application_closes_at)}.`}
          {evt.application_capacity && ` Capacity: ${evt.application_capacity} applicants.`}
        </p>
        {clashWarning && (
          <div style={{ background: "rgba(246, 198, 103, 0.12)", border: "1px solid #f6c667", color: "#f5f0e8", padding: "12px 14px", borderRadius: "4px", margin: "14px 0", fontSize: "13px", lineHeight: "1.5" }}>
            {clashWarning}
          </div>
        )}
        <ApplyButton eventId={evt.id} questions={questions} />
      </aside>
    );
  }

  return (
    <main className="event-detail">
      <FestTopNav activePage="events" showBack backFallbackHref="/events" />

      {/* State banner */}
      {event.state === "cancelled" && <div className="event-state-banner banner-cancelled">This event has been cancelled.</div>}
      {event.state === "completed" && <div className="event-state-banner banner-completed">This event is complete. Published results appear below when available.</div>}
      {event.state === "closed" && <div className="event-state-banner banner-closed">Registration is closed. Check My Fest for your application status.</div>}
      {event.state === "open" && appOpen && <div className="event-state-banner banner-open">Applications are open. Apply below before {datetime(event.application_closes_at)}.</div>}

      {/* Official Event Poster Banner */}
      {event.poster_url && (
        <div className="event-poster-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.poster_url}
            alt={`${event.title} Official Poster`}
            loading="lazy"
            decoding="async"
          />
        </div>
      )}

      <section className="event-detail-hero">
        {/* Badges strip */}
        <div className="event-detail-badge-strip">
          <span className={`division-pill division-pill-${division}`}>
            {divisionTitle}
          </span>
          <span className="event-category-pill">{event.category}</span>
          <span className="event-format-pill">{event.format}</span>
        </div>

        <h1>{event.title}</h1>
        <p className="event-summary">{event.summary || "Official event details will be published by the organiser."}</p>

        {/* Specifications highlight card */}
        <div className="event-specs-banner">
          <div className="spec-card">
            <span className="spec-label">Division</span>
            <strong className="spec-val highlight-gold">{divisionTitle}</strong>
          </div>
          <div className="spec-card">
            <span className="spec-label">Match Format</span>
            <strong className="spec-val">
              {event.slug === "football-boys-7v7"
                ? "7v7 Playing on Pitch"
                : event.eligibility?.match_format || event.format}
            </strong>
          </div>
          <div className="spec-card">
            <span className="spec-label">Squad Capacity</span>
            <strong className="spec-val highlight-gold">
              {event.slug === "football-boys-7v7"
                ? "10–11 Players (7 on pitch + 3–4 substitutes)"
                : event.eligibility?.squad_details
                  ? event.eligibility.squad_details
                  : event.group_min_size && event.group_max_size
                    ? `${event.group_min_size === event.group_max_size ? event.group_min_size : `${event.group_min_size}–${event.group_max_size}`} Players`
                    : "Individual / Solo"}
            </strong>
          </div>
          <div className="spec-card">
            <span className="spec-label">Venue</span>
            <strong className="spec-val">{event.venue ?? "To be announced"}</strong>
          </div>
        </div>

        <dl className="event-facts">
          <div>
            <dt>Schedule</dt>
            <dd>{datetime(event.starts_at)}</dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{event.venue ?? "To be announced"}</dd>
          </div>
          <div>
            <dt>Applications</dt>
            <dd>
              {appOpen
                ? `Closes ${datetime(event.application_closes_at)}${event.waitlist_enabled ? " · waitlist possible" : ""}`
                : event.application_opens_at && now < new Date(event.application_opens_at)
                  ? `Opens ${datetime(event.application_opens_at)}`
                  : "Not open"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Official Results & Podium Showcase */}
      {eventResult && (eventResult.positions.length > 0 || eventResult.podium_photo_url) && (
        <section className="event-results-showcase">
          <div className="results-showcase-header">
            <p className="eyebrow">Official Competition Results</p>
            <h2>🏆 Champions &amp; Podium Placements</h2>
          </div>

          {eventResult.podium_photo_url && (
            <div className="event-podium-photo-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={eventResult.podium_photo_url}
                alt={`${event.title} Winner Celebration`}
                loading="lazy"
                decoding="async"
              />
              {eventResult.podium_caption && (
                <p className="event-podium-caption">✦ {eventResult.podium_caption}</p>
              )}
            </div>
          )}

          {eventResult.positions.length > 0 && (
            <div className="event-podium-places">
              {eventResult.positions.map((pos) => (
                <div key={pos.placing} className={`podium-badge place-${pos.placing}`}>
                  <span className="place-rank">
                    {pos.placing === 1 ? "🥇 1st Place" : pos.placing === 2 ? "🥈 2nd Place" : pos.placing === 3 ? "🥉 3rd Place" : `#${pos.placing}`}
                  </span>
                  <strong className="place-batch">{pos.batch_label}</strong>
                  {pos.note && <span className="place-note">{pos.note}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="event-rules">
        <p className="eyebrow">Official rules</p>
        <h2>Know before you enter.</h2>
        <div className="rules-copy-container">
          {renderMarkdownRules(event.rules_markdown)}
        </div>
        {applicationGuidance(event)}
      </section>
    </main>
  );
}
