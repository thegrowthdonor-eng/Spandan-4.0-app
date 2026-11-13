import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasPublicSupabaseConfiguration, hasSupabaseConfiguration } from "@/server/env";
import { coalesceCached, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { createAdminClient } from "@/server/supabase/admin";
import { programmeCacheTag } from "@/server/supabase/programme-fetch";
import { createPublicClient } from "@/server/supabase/public";
import { createRequestClient } from "@/server/supabase/server";
import { ApplyButton } from "../apply-button";
import Link from "next/link";
import { eventCategoryLabel } from "@/lib/event-categories";
import { EventRegistrationDock } from "../event-registration-dock";
import { EventParticipantsDialog } from "../event-participants-dialog";
import { FestTopNav } from "@/components/spandan-branding";
import "../events.css";
import { finalValueLabel, type OperatingMethod } from "@/lib/event-operations";
import { themeRosterPolicy } from "@/lib/theme-roster";
import { registrationStatus, registrationTime } from "@/lib/registration-status";

export const dynamic = "force-dynamic";

type Question = { key: string; label: string; type: "text" | "select"; required: boolean; options?: string[] };
type EventDetail = {
  id: string;
  edition_id: string;
  slug: string;
  title: string;
  category: string;
  format: string;
  registration_enabled: boolean;
  operating_method: OperatingMethod;
  summary: string;
  rules_markdown: string;
  venue: string | null;
  state: string;
  starts_at: string | null;
  ends_at: string | null;
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
    theme_roster_policy?: unknown;
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
    winner_name?: string | null;
    final_value?: string | number | null;
    value_unit?: string | null;
  }>;
};

type EventManager = {
  profile_id: string;
  full_name: string;
  batch_label: string | null;
};

type EventManagers = {
  coordinators: EventManager[];
  heads: EventManager[];
};

type PublicParticipant = {
  profile_id: string;
  full_name: string;
  batch_label: string;
};

function datetime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value))
    : "To be announced";
}

async function getEventResult(eventId: string): Promise<PublishedResult | null> {
  if (!hasPublicSupabaseConfiguration()) return null;
  try {
    return await coalesceCached(
      `event-result:${eventId}`,
      [PUBLIC_CACHE_TAGS.eventDetail, programmeCacheTag],
      30,
      async () => {
        const { data, error } = await createPublicClient()
          .from("result_publications")
          .select("id, podium_photo_url, podium_caption, result_positions(placing, note, winner_name,awarded_points,final_value,value_unit,batches(label))")
          .eq("event_id", eventId)
          .eq("state", "published")
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) return null;

        type RawPos = { placing: number; note: string | null; winner_name:string|null;awarded_points:number;final_value:string|number|null;value_unit:string|null;batches: { label: string } | null };
        const rawPositions = ((data.result_positions ?? []) as unknown as RawPos[]);
        const positions = rawPositions
          .map((p) => ({
            placing: p.placing,
            batch_label: p.batches?.label ? `Batch ${p.batches.label}` : "Batch",
            points: p.awarded_points,
            winner_name:p.winner_name,final_value:p.final_value,value_unit:p.value_unit,
            note: p.note,
          }))
          .sort((a, b) => a.placing - b.placing);

        return {
          publication_id: data.id,
          podium_photo_url: (data as { podium_photo_url?: string | null }).podium_photo_url ?? null,
          podium_caption: (data as { podium_caption?: string | null }).podium_caption ?? null,
          positions,
        };
      },
    );
  } catch {
    return null;
  }
}

async function getEvent(slug: string): Promise<EventDetail | null> {
  if (!hasPublicSupabaseConfiguration()) return null;
  try {
    return await coalesceCached(
      `event-detail:${slug}`,
      [PUBLIC_CACHE_TAGS.eventDetail, programmeCacheTag],
      30,
      async () => {
        const { data, error } = await createPublicClient()
          .from("events")
          .select("id,edition_id,slug,title,category,format,registration_enabled,operating_method,summary,rules_markdown,venue,state,starts_at,ends_at,reporting_at,application_opens_at,application_closes_at,roster_lock_at,waitlist_enabled,application_capacity,application_questions,poster_url,eligibility,group_min_size,group_max_size")
          .eq("slug", slug)
          .maybeSingle();

        if (!error && data) return data as EventDetail;

        // Resilient fallback if poster_url migration is not yet applied
        const fallback = await createPublicClient()
          .from("events")
          .select("id,edition_id,slug,title,category,format,registration_enabled,operating_method,summary,rules_markdown,venue,state,starts_at,ends_at,reporting_at,application_opens_at,application_closes_at,roster_lock_at,waitlist_enabled,application_capacity,application_questions,eligibility,group_min_size,group_max_size")
          .eq("slug", slug)
          .maybeSingle();
        if (fallback.error) throw new Error(fallback.error.message);
        return fallback.data ? { ...fallback.data, poster_url: null } as EventDetail : null;
      },
    );
  } catch {
    return null;
  }
}

async function getEventManagers(eventId: string, category: string): Promise<EventManagers> {
  if (!hasSupabaseConfiguration()) return { coordinators: [], heads: [] };
  try {
    return await coalesceCached(
      `event-managers:${eventId}:${category}`,
      [PUBLIC_CACHE_TAGS.eventDetail, programmeCacheTag],
      60,
      async () => {
        const admin = createAdminClient();
        const [coordinatorResult, headResult] = await Promise.all([
          admin.from("staff_assignments").select("profile_id").eq("event_id", eventId).eq("role", "event_coordinator").is("revoked_at", null),
          admin.from("staff_assignments").select("profile_id").eq("event_category", category).eq("role", "event_head").is("revoked_at", null),
        ]);
        const assignments = [...(coordinatorResult.data ?? []), ...(headResult.data ?? [])];
        const assignmentError = coordinatorResult.error ?? headResult.error;

        if (assignmentError) throw new Error(assignmentError.message);
        if (!assignments.length) return { coordinators: [], heads: [] };
        const profileIds = [...new Set(assignments.map((assignment) => assignment.profile_id))];
        const { data: profiles, error: profileError } = await admin
          .from("profiles")
          .select("id,full_name,batches(label)")
          .in("id", profileIds)
          .order("full_name");

        if (profileError || !profiles) throw new Error(profileError?.message ?? "Profiles unavailable");
        const managers = profiles.map((profile) => {
          const batch = profile.batches as unknown as { label?: string | null } | null;
          return {
            profile_id: profile.id,
            full_name: profile.full_name,
            batch_label: batch?.label ?? null,
          };
        });
        const coordinatorIds = new Set((coordinatorResult.data ?? []).map((assignment) => assignment.profile_id));
        const headIds = new Set((headResult.data ?? []).map((assignment) => assignment.profile_id));
        return {
          coordinators: managers.filter((manager) => coordinatorIds.has(manager.profile_id)),
          heads: managers.filter((manager) => headIds.has(manager.profile_id)),
        };
      },
    );
  } catch {
    return { coordinators: [], heads: [] };
  }
}

async function getPublicParticipants(eventId: string): Promise<PublicParticipant[]> {
  if (!hasSupabaseConfiguration()) return [];
  try {
    return await coalesceCached(
      `event-participants:${eventId}`,
      [PUBLIC_CACHE_TAGS.eventDetail, programmeCacheTag],
      30,
      async () => {
        const admin = createAdminClient();
        const { data: applications, error: applicationError } = await admin
          .from("applications")
          .select("student_id")
          .eq("event_id", eventId)
          .eq("review_state", "approved")
          .eq("selection_state", "selected");

        if (applicationError) throw new Error(applicationError.message);
        if (!applications?.length) return [];
        const profileIds = [...new Set(applications.map((application) => application.student_id))];
        const { data: profiles, error: profileError } = await admin
          .from("profiles")
          .select("id,full_name,participant_category,batches(label)")
          .in("id", profileIds)
          .order("full_name");

        if (profileError || !profiles) throw new Error(profileError?.message ?? "Participants unavailable");
        return profiles
          .map((profile) => {
            const batch = profile.batches as unknown as { label?: string | null } | null;
            return {
              profile_id: profile.id,
              full_name: profile.full_name,
              batch_label: batch?.label ?? profile.participant_category?.toUpperCase() ?? "Participant",
            };
          })
          .sort((a, b) => a.batch_label.localeCompare(b.batch_label) || a.full_name.localeCompare(b.full_name));
      },
    );
  } catch {
    return [];
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

  const [eventResult, eventManagers, publicParticipants] = await Promise.all([
    getEventResult(event.id),
    getEventManagers(event.id, event.category),
    getPublicParticipants(event.id),
  ]);

  const now = new Date();
  const effectiveState = event.state;
  const registration = registrationStatus(event, now);
  const appOpen = registration === "open";

  // Check if the current user has already applied & detect schedule clashes (Doc 03)
  let existingApplication: { id: string; review_state: string; selection_state: string } | null = null;
  let senior = false;
  let seniorConfirmed = false;
  let userAccessState: string | null = null;
  let userGender: string | null = null;
  let isAuthenticated = false;
  let accessLoadFailed = false;
  let clashWarning: string | null = null;
  try {
    const cookieStore = await cookies();
    if (cookieStore.getAll().some((c) => c.name.startsWith("sb-"))) {
      const client = await createRequestClient();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError) accessLoadFailed = true;
      if (user) {
      isAuthenticated = true;
      const [appResult, accessResult, profileResult, otherAppsResult, seniorResult] = await Promise.all([
        client.from("applications").select("id,review_state,selection_state").eq("event_id", event.id).eq("student_id", user.id).maybeSingle(),
        client.from("access_records").select("state,verified_at").eq("profile_id", user.id).eq("edition_id", event.edition_id).maybeSingle(),
        client.from("profiles").select("gender,participant_category").eq("id", user.id).maybeSingle(),
        client.from("applications").select("id,events(id,title,starts_at)").eq("student_id", user.id).neq("review_state", "rejected").neq("review_state", "withdrawn"),
        client.from("senior_event_registrations").select("id").eq("event_id", event.id).eq("profile_id", user.id).maybeSingle(),
      ]);
      existingApplication = appResult.data;
      accessLoadFailed = !!(appResult.error || accessResult.error || profileResult.error || seniorResult.error || !profileResult.data);
      userAccessState = accessResult.data?.state ?? null;
      userGender = profileResult.data?.gender ?? null;
      senior = !!profileResult.data && profileResult.data.participant_category !== "ug";
      if (!senior && userAccessState === "active" && !accessResult.data?.verified_at) userAccessState = "pending";
      seniorConfirmed = !!seniorResult.data;

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
    }
  } catch {
    accessLoadFailed = true;
  }

  const questions: Question[] = Array.isArray(event.application_questions) ? event.application_questions : [];
  const division = event.eligibility?.division?.toLowerCase() ?? "open";
  const requiredProfileGender = division === "boys" ? "male" : division === "girls" ? "female" : null;
  const divisionTitle = division === "boys" ? "👦 Boys Division" : division === "girls" ? "👧 Girls Division" : "👥 Open / Mixed";
  const performance = event.format === "group" && event.operating_method === "programme";
  const showFormatBadge = event.format.trim().toLowerCase() !== event.category.trim().toLowerCase();

  let dockStatus = "Registrations open";
  let dockLabel = "Register now";
  let dockHref: string | null = "#event-registration";
  let dockTone = "open";

  if (effectiveState === "cancelled") {
    dockStatus = "Programme update";
    dockLabel = "Event cancelled";
    dockHref = null;
    dockTone = "inactive";
  } else if (effectiveState === "completed") {
    dockStatus = "Event completed";
    dockLabel = eventResult ? "View results" : "Browse events";
    dockHref = eventResult ? "#event-results" : "/events";
    dockTone = "status";
  } else if (!event.registration_enabled) {
    dockStatus = "Information only"; dockLabel = "No registration required"; dockHref = null; dockTone = "status";
  } else if (seniorConfirmed) {
    dockStatus = "Confirmed"; dockLabel = "View in My Fest"; dockHref = "/my-fest"; dockTone = "status";
  } else if (existingApplication) {
    dockStatus = `Application ${existingApplication.review_state.replaceAll("_", " ")}`;
    dockLabel = "View application";
    dockHref = "/my-fest";
    dockTone = "status";
  } else if (!appOpen) {
    dockStatus = registration === "scheduled" ? "Scheduled" : registration === "closed" ? "Closed" : "Registration unavailable";
    dockLabel = registration === "scheduled" ? `Opens ${registrationTime(event.application_opens_at)}` : "Registration unavailable";
    dockHref = null;
    dockTone = "inactive";
  } else if (accessLoadFailed) {
    dockStatus = "Unable to load registration access";
    dockLabel = "Refresh to retry";
    dockHref = `/events/${event.slug}`;
    dockTone = "status";
  } else if (!isAuthenticated) {
    dockStatus = "Registrations open";
    dockLabel = "Sign in to register";
    dockHref = `/account?next=/events/${event.slug}`;
  } else if (userAccessState === "pending" || userAccessState == null) {
    dockStatus = "Account verification pending";
    dockLabel = "Check verification";
    dockHref = "/my-fest";
    dockTone = "status";
  } else if (userAccessState === "rejected" || userAccessState === "suspended") {
    dockStatus = "Registration restricted";
    dockLabel = "Get help";
    dockHref = "/my-fest";
    dockTone = "inactive";
  } else if (requiredProfileGender && userGender == null) {
    dockStatus = "Gender details incomplete";
    dockLabel = "Get profile help";
    dockHref = "/my-fest?tab=support";
    dockTone = "status";
  } else if (requiredProfileGender && userGender !== requiredProfileGender) {
    dockStatus = "Outside your division";
    dockLabel = "Browse eligible events";
    dockHref = "/events";
    dockTone = "inactive";
  }

  return (
    <main className="event-detail">
      <FestTopNav activePage="events" showBack backFallbackHref="/events" />

      {/* State banner */}
      {effectiveState === "cancelled" && <div className="event-state-banner banner-cancelled">This event has been cancelled.</div>}
      {effectiveState === "completed" && <div className="event-state-banner banner-completed">This event is complete. Published results appear below when available.</div>}
      {effectiveState === "closed" && <div className="event-state-banner banner-closed">Registration is closed. Check My Fest for your application status.</div>}
      {effectiveState === "open" && appOpen && <div className="event-state-banner banner-open">Registrations open. Apply individually before {registrationTime(event.application_closes_at)}.</div>}
      {registration === "scheduled" && <div className="event-state-banner">Registration opens {registrationTime(event.application_opens_at)} and closes {registrationTime(event.application_closes_at)}.</div>}

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
        <div className="event-detail-hero-topline">
          <div className="event-detail-badge-strip">
            {event.registration_enabled&&<span className={`division-pill division-pill-${division}`}>
              {divisionTitle}
            </span>}
            <span className="event-category-pill">{eventCategoryLabel(event.category)}</span>
            {event.registration_enabled&&showFormatBadge && <span className="event-format-pill">{performance ? (event.group_min_size === 1 ? (event.group_max_size === 2 ? "Solo / duo" : "Solo / duo / group") : "Performance") : event.format}</span>}
          </div>
          {event.registration_enabled&&<EventParticipantsDialog eventTitle={event.title} participants={publicParticipants} />}
        </div>

        <h1>{event.title}</h1>
        <p className="event-summary">{event.summary || "Official event details will be published by the organiser."}</p>

        {/* Specifications highlight card */}
        {event.registration_enabled&&<div className="event-specs-banner">
          <div className="spec-card">
            <span className="spec-label">Division</span>
            <strong className="spec-val highlight-gold">{divisionTitle}</strong>
          </div>
          <div className="spec-card">
            <span className="spec-label">{performance ? "Participation format" : "Match Format"}</span>
            <strong className="spec-val">
              {event.slug === "football-boys-7v7"
                ? "7v7 Playing on Pitch"
                : performance ? (event.group_min_size === 1 ? (event.group_max_size === 2 ? "Solo / duo" : "Solo / duo / group") : "Performance") : event.eligibility?.match_format || event.format}
            </strong>
          </div>
          <div className="spec-card">
            <span className="spec-label">{performance ? "Performance size" : "Squad Capacity"}</span>
            <strong className="spec-val highlight-gold">
              {performance && event.group_min_size && event.group_max_size
                ? `${event.group_min_size === event.group_max_size ? event.group_min_size : `${event.group_min_size}–${event.group_max_size}`} performers per performance`
                : event.slug === "football-boys-7v7"
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
        </div>}

        <dl className="event-facts">
          <div>
            <dt>Schedule</dt>
            <dd>{datetime(event.starts_at)}{event.ends_at?` – ${datetime(event.ends_at)}`:""}</dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{event.venue ?? "To be announced"}</dd>
          </div>
          <div>
            <dt>{event.registration_enabled?"Applications":"Attendance"}</dt>
            <dd>
              {!event.registration_enabled?"No registration required":appOpen
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
        <section className="event-results-showcase" id="event-results">
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
                  <strong className="place-batch">{pos.winner_name??pos.batch_label}</strong>
                  {pos.final_value!=null&&<span className="place-note">{finalValueLabel(pos.final_value,pos.value_unit)}</span>}
                  {pos.note && <span className="place-note">{pos.note}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {event.registration_enabled&&<section className="event-rules">
        <p className="eyebrow">Official rules</p>
        <h2>Know before you enter.</h2>
        <div className="rules-copy-container">
          {renderMarkdownRules(event.rules_markdown)}
        </div>
      </section>}

      {(eventManagers.heads.length > 0 || eventManagers.coordinators.length > 0) && (
        <section className="event-managed-by" aria-labelledby="event-managed-by-title">
          <div className="event-managed-by-heading">
            <p className="eyebrow">Managed by</p>
            <h2 id="event-managed-by-title">Event team.</h2>
          </div>
          <div className="event-manager-groups">
            {[
              { title: `${eventCategoryLabel(event.category)} Head`, managers: eventManagers.heads },
              { title: "Event Coordinator", managers: eventManagers.coordinators },
            ].filter((group) => group.managers.length > 0).map((group) => (
              <div className="event-manager-group" key={group.title}>
                <h3>{group.title}</h3>
                <ul className="event-manager-list">
                  {group.managers.map((manager) => (
                    <li key={manager.profile_id}>
                      <span className="event-manager-monogram" aria-hidden="true">
                        {manager.full_name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="event-manager-copy">
                        <strong>{manager.full_name}</strong>
                        <small>{group.title}{manager.batch_label ? ` · Batch ${manager.batch_label}` : ""}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="event-managed-by"><div className="event-managed-by-heading"><p className="eyebrow">Event updates</p><h2>{event.operating_method==="voting"?"Entries & public voting":"Schedule & official updates"}</h2><p>{event.operating_method==="voting"?"View approved work, submit your entry and vote during the announced window.":event.operating_method==="programme"?"Find the programme details and follow festival gallery updates.":"Check your event timings and published award positions."}</p><Link href={event.operating_method==="voting"?`/competition/${event.id}`:"/schedule"}>{event.operating_method==="voting"?"Open entries & voting →":"View schedule →"}</Link>{event.operating_method==="programme"&&<Link href="/gallery">Open gallery →</Link>}</div></section>
      {!senior&&event.registration_enabled&&event.format === "pair" && <section className="event-managed-by"><div className="event-managed-by-heading"><p className="eyebrow">Choose your partner</p><h2>Register first, then pair up.</h2><p>Both students register individually, then choose each other through an invitation. Both registrations and the final pair need coordinator approval.</p><Link href={`/my-fest/teams?event=${event.id}`}>Invite partner / View invitations →</Link></div></section>}
      {(!senior&&event.registration_enabled&&["sport", "group"].includes(event.format)) && <section className="event-managed-by"><div className="event-managed-by-heading"><p className="eyebrow">{performance ? "Your performance" : "Your squad"}</p><p>{performance ? "Every performer registers individually. After approval, the coordinator appoints a performance lead, who proposes the performance name and members for final roster approval. Solo performers select only themselves. Each student can join one final performance per event. Stage results are not published in the app." : "Register to be considered. The appointed captain or group leader proposes members; the coordinator confirms the final roster."}</p><Link href={`/my-fest/teams?event=${event.id}`}>{performance ? "My performance / Lead workspace \u2192" : "My team / Leader workspace \u2192"}</Link></div></section>}
      {event.registration_enabled&&<EventRegistrationDock
        eventTitle={event.title}
        status={dockStatus}
        label={dockLabel}
        href={dockHref}
        tone={dockTone}
        questionCount={questions.length}
      >
        {dockHref === "#event-registration" && (
          <>
            {!senior && <p className="event-registration-sheet-note">
              Applying does not guarantee approval or final selection. Review your answers carefully before submitting.
            </p>}
            {clashWarning && <div className="event-registration-sheet-warning">{clashWarning}</div>}
            <ApplyButton eventId={event.id} senior={senior} questions={questions} themePolicy={senior ? undefined : themeRosterPolicy(event.eligibility?.theme_roster_policy)} />
          </>
        )}
      </EventRegistrationDock>}
    </main>
  );
}
