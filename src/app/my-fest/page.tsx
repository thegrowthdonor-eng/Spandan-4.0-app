import Image from "next/image";
import { batchDisplay, participantLabels, type ParticipantCategory } from "@/lib/participants";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { SpandanLogo } from "@/components/spandan-branding";
import { SignOutForm } from "@/components/sign-out-form";
import { PollWidget } from "./poll-widget";
import { HelpDesk, type HelpThread } from "./support-tools";
import "./my-fest.css";

export const metadata = {
  title: "My Fest & Student Pass — Spandan 4.0 | ASMC Firozabad",
  description: "Official student festival pass, college credentials, and event applications for ASMC Firozabad MBBS students.",
};

export const dynamic = "force-dynamic";

type Application = {
  id: string;
  review_state: string;
  selection_state: string;
  created_at: string;
  events: {
    id: string;
    slug: string;
    title: string;
    category: string;
    starts_at: string | null;
    venue: string | null;
  } | null;
};

type Reminder = {
  id: string;
  title: string;
  body: string | null;
  due_at: string;
  dismissed_at: string | null;
  events: { title: string } | null;
};

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function humanState(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function MyFestPage() {
  if (!hasSupabaseConfiguration()) {
    redirect("/account");
  }

  const client = await createRequestClient();
  const { data: auth, error: authError } = await client.auth.getUser();

  if (authError || !auth?.user) {
    redirect("/account");
  }

  const admin = createAdminClient();
  const [profileResult, accessResult, applicationResult, activationPermission, noticePermission, managedEvents, helpThreadsResult, remindersResult] =
    await Promise.all([
      admin
        .from("profiles")
        .select("full_name,participant_category,department,fest_id,roll_canonical,phone_e164,created_at,batch_id,batches(label,course_label)")
        .eq("id", auth.user.id)
        .maybeSingle(),
      client
        .from("access_records")
        .select("edition_id,state,reason,verified_at,ledger_reference")
        .eq("profile_id", auth.user.id)
        .maybeSingle(),
      client
        .from("applications")
        .select("id,review_state,selection_state,created_at,events(id,slug,title,category,starts_at,venue)")
        .eq("student_id", auth.user.id)
        .order("created_at", { ascending: false }),
      client.rpc("can_manage_access"),
      client.rpc("can_publish_notices"),
      client.rpc("list_managed_events"),
      client
        .from("help_threads")
        .select("id,subject,state,created_at,updated_at,help_messages(id,author_id,body,created_at,profiles(full_name))")
        .eq("owner_id", auth.user.id)
        .order("updated_at", { ascending: false }),
      client
        .from("reminders")
        .select("id,title,body,due_at,dismissed_at,events(title)")
        .eq("profile_id", auth.user.id)
        .is("dismissed_at", null)
        .order("due_at", { ascending: true })
        .limit(20),
    ]);

  if (profileResult.error || !profileResult.data) {
    return (
      <main className="my-fest-page">
        <header className="my-fest-header">
          <SpandanLogo size="medium" variant="light" />
          <Link href="/" className="header-home-btn">← Home</Link>
        </header>
        <div className="my-fest-content">
          <div className="empty-state-box">
            <h2>Profile Not Found</h2>
            <p>We could not load your student profile. Please sign in again with your batch and roll number.</p>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="browse-events-btn">
                Sign In Again →
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const profile = profileResult.data;
  let batch = profile.batches as unknown as { label?: string; course_label?: string | null } | null;

  // Resilient fallback: If batches join was not populated due to RLS, query directly by batch_id
  if ((!batch || !batch.label) && profile.batch_id) {
    try {
      const { data: directBatch } = await admin
        .from("batches")
        .select("label,course_label")
        .eq("id", profile.batch_id)
        .maybeSingle();

      if (directBatch?.label) {
        batch = directBatch;
      }
    } catch {
      // Continue gracefully
    }
  }

  const senior = profile.participant_category !== "ug";
  const categoryLabel = participantLabels[profile.participant_category as ParticipantCategory] ?? "Participant";
  const batchLabel = batchDisplay(batch?.label ?? "Not assigned");
  const courseLabel = batch?.course_label ?? "MBBS";
  const formattedBatch = `${courseLabel} ${batchLabel}`;

  const access = accessResult.data;
  const applications = (applicationResult.data ?? []) as unknown as Application[];
  const helpThreads = (helpThreadsResult.data ?? []) as unknown as HelpThread[];
  const reminders = (remindersResult.data ?? []) as unknown as Reminder[];
  const status = access?.state ?? "pending";
  const isOrganiser =
    activationPermission.data === true ||
    noticePermission.data === true ||
    (managedEvents.data?.length ?? 0) > 0;

  const studentInitials = (profile.full_name || "Student")
    .trim()
    .split(/\s+/)
    .map((word: string) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SP";

  return (
    <main className="my-fest-page">
      {/* Top Header */}
      <header className="my-fest-header">
        <SpandanLogo size="medium" variant="light" />
        <div className="my-fest-header-actions">
          <Link href="/home" className="header-home-btn">
            ← Home
          </Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="header-signout-btn">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <div className="my-fest-content">
        {/* ------------------------------------------------------------------
            OFFICIAL STUDENT FEST PASS (PHYSICAL ID BADGE STYLE)
            ------------------------------------------------------------------ */}
        <section className="student-id-card" aria-label="Student Festival Pass">
          {/* Lanyard Clip Punch Slot for authentic physical badge vibe */}
          <div className="card-lanyard-slot" aria-hidden="true">
            <span className="lanyard-hole"></span>
          </div>

          <div className="card-banner">
            <div className="card-banner-org">
              <Image
                src="/spandan-logo.png"
                alt="Spandan 4.0 Emblem"
                width={42}
                height={42}
                className="card-crest"
                priority
              />
              <div className="card-org-names">
                <span className="card-college-name">ASMC FIROZABAD</span>
                <span className="card-fest-title">SPANDAN 4.0 · PARTICIPANT PASS</span>
              </div>
            </div>
          </div>

          <div className="card-credentials-body">
            {/* Student Identity: Facebook-style Avatar + Name + Fest ID */}
            <div className="student-profile-header-row">
              {/* Facebook-style ID Avatar with silhouette + initials + verified tick */}
              <div className="student-avatar-frame" aria-label={`Profile icon for ${profile.full_name}`}>
                <div className="student-avatar-canvas">
                  <svg className="fb-silhouette-icon" width="76" height="76" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="40" cy="40" r="40" fill="#241225" />
                    <circle cx="40" cy="30" r="14" fill="#d9c5b2" />
                    <path d="M16 68C16 53 26 48 40 48C54 48 64 53 64 68C64 73 60 76 55 76H25C20 76 16 73 16 68Z" fill="#d9c5b2" />
                  </svg>
                  <span className="student-initials-badge">{studentInitials}</span>
                  <span className="avatar-verified-tick" title="Official Verified Student">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.2 5.6l-4 4.5a.75.75 0 01-1.1 0l-2-2.2a.75.75 0 011.1-1l1.45 1.6 3.45-3.9a.75.75 0 111.1 1z" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Student Name & Core Info */}
              <div className="student-primary-details">
                <div className="student-name-meta">
                  <h2>{profile.full_name}</h2>
                  <div className="student-tags-row">
                    <span className="student-course-pill">
                      {senior ? `${categoryLabel} · ${profile.department}` : `${courseLabel} · ${batchLabel}`}
                    </span>
                    <span className="student-role-pill">Verified</span>
                  </div>
                </div>

                <div className="student-fest-id-chip">
                  <span className="fest-id-label">OFFICIAL FEST ID</span>
                  <div className="fest-id-value-wrap">
                    <span className="fest-id-chip-icon">⚡</span>
                    <span className="fest-id-value">{profile.fest_id}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Meta Grid with all student credentials */}
            <div className="profile-meta-grid">
              <div className="meta-item">
                <span className="meta-label">{senior ? "Category" : "College Roll Number"}</span>
                <span className="meta-val">{senior ? categoryLabel : profile.roll_canonical}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">{senior ? "Department" : "Academic batch"}</span>
                <span className="meta-val">{senior ? profile.department : formattedBatch}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Registered Mobile</span>
                <span className="meta-val">{profile.phone_e164 || "Not Provided"}</span>
              </div>
            </div>

            {/* Counter Verification Status Note - Short & Concise */}
            <div className={`card-verification-note ${status === "active" ? "verified" : "pending"}`}>
              {status === "active" ? (
                <p>
                  <strong>Verified:</strong> Counter verification complete.{access?.ledger_reference ? ` (Ref: ${access.ledger_reference})` : ""}
                </p>
              ) : (
                <p>
                  <strong>Pending:</strong> Counter verification pending. Visit help counter with college ID.
                </p>
              )}
            </div>

            {/* Authentic Barcode / Pass Serial Stripe */}
            <div className="card-barcode-strip" aria-hidden="true">
              <svg className="barcode-svg" width="220" height="24" viewBox="0 0 240 24" fill="currentColor">
                <rect x="0" y="0" width="3" height="24" />
                <rect x="5" y="0" width="1" height="24" />
                <rect x="8" y="0" width="4" height="24" />
                <rect x="14" y="0" width="2" height="24" />
                <rect x="18" y="0" width="1" height="24" />
                <rect x="22" y="0" width="5" height="24" />
                <rect x="30" y="0" width="2" height="24" />
                <rect x="34" y="0" width="3" height="24" />
                <rect x="40" y="0" width="1" height="24" />
                <rect x="43" y="0" width="4" height="24" />
                <rect x="50" y="0" width="2" height="24" />
                <rect x="54" y="0" width="1" height="24" />
                <rect x="58" y="0" width="6" height="24" />
                <rect x="67" y="0" width="2" height="24" />
                <rect x="71" y="0" width="3" height="24" />
                <rect x="77" y="0" width="1" height="24" />
                <rect x="81" y="0" width="5" height="24" />
                <rect x="89" y="0" width="2" height="24" />
                <rect x="94" y="0" width="4" height="24" />
                <rect x="101" y="0" width="1" height="24" />
                <rect x="105" y="0" width="3" height="24" />
                <rect x="111" y="0" width="5" height="24" />
                <rect x="119" y="0" width="2" height="24" />
                <rect x="123" y="0" width="1" height="24" />
                <rect x="127" y="0" width="4" height="24" />
                <rect x="134" y="0" width="2" height="24" />
                <rect x="138" y="0" width="6" height="24" />
                <rect x="147" y="0" width="1" height="24" />
                <rect x="151" y="0" width="3" height="24" />
                <rect x="156" y="0" width="5" height="24" />
                <rect x="164" y="0" width="2" height="24" />
                <rect x="169" y="0" width="4" height="24" />
                <rect x="175" y="0" width="1" height="24" />
                <rect x="179" y="0" width="3" height="24" />
                <rect x="185" y="0" width="5" height="24" />
                <rect x="193" y="0" width="2" height="24" />
                <rect x="198" y="0" width="4" height="24" />
                <rect x="205" y="0" width="1" height="24" />
                <rect x="209" y="0" width="3" height="24" />
                <rect x="215" y="0" width="5" height="24" />
                <rect x="223" y="0" width="2" height="24" />
                <rect x="227" y="0" width="4" height="24" />
                <rect x="234" y="0" width="2" height="24" />
                <rect x="238" y="0" width="2" height="24" />
              </svg>
              <span className="barcode-serial">
                SPANDAN 4.0 · ASMC FIROZABAD · SECURE DIGITAL PASS · {profile.fest_id}
              </span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            MY EVENT APPLICATIONS & PARTICIPATION
            ------------------------------------------------------------------ */}
        <section className="section-block" aria-labelledby="applications-title">
          <div className="section-head">
            <h2 id="applications-title">My Event Registrations</h2>
          </div>

          {applications.length > 0 ? (
            <div className="applications-list">
              {applications.map((app) => (
                <article key={app.id} className="app-card">
                  <div className="app-info">
                    <h3>{app.events?.title ?? "Festival Competition"}</h3>
                    <p>
                      {app.events?.category ? `${app.events.category} · ` : ""}
                      {app.events?.starts_at ? formatDateTime(app.events.starts_at) : "Schedule to be confirmed"}
                      {app.events?.venue ? ` · Venue: ${app.events.venue}` : ""}
                    </p>
                  </div>
                  <div className="app-badges">
                    <span className={`status-chip ${app.review_state === "approved" ? "approved" : "pending"}`}>
                      {humanState(app.review_state)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state-box">
              <span className="empty-icon" aria-hidden="true">🏆</span>
              <h3>No Event Registrations Yet</h3>
              <p>You have not registered for any sports, cultural, or literary competition events yet.</p>
              <Link href="/events" className="browse-events-btn">
                Browse Events &amp; Apply →
              </Link>
            </div>
          )}
        </section>

        <section className="section-block" aria-labelledby="reminders-title">
          <div className="section-head">
            <h2 id="reminders-title">Schedule reminders</h2>
          </div>
          {reminders.length ? (
            <div className="reminder-list">
              {reminders.map((reminder) => (
                <article key={reminder.id} className="reminder-card">
                  <div>
                    <h3>{reminder.title}</h3>
                    {reminder.body ? <p>{reminder.body}</p> : null}
                    <small>{reminder.events?.title ?? "Festival fixture"}</small>
                  </div>
                  <time dateTime={reminder.due_at}>{formatDateTime(reminder.due_at)}</time>
                </article>
              ))}
            </div>
          ) : (
            <p className="section-empty-note">No upcoming schedule reminders.</p>
          )}
        </section>

        <section className="section-block" aria-labelledby="polls-title">
          <div className="section-head">
            <h2 id="polls-title">Festival polls</h2>
          </div>
          <PollWidget editionId={access?.edition_id} active={status === "active"} />
        </section>

        <section className="section-block" aria-labelledby="support-title">
          <div className="section-head">
            <h2 id="support-title">Help desk</h2>
          </div>
          <HelpDesk editionId={access?.edition_id} initialThreads={helpThreads} />
        </section>

        {/* ------------------------------------------------------------------
            QUICK ACCESS FESTIVAL LINKS
            ------------------------------------------------------------------ */}
        <section className="section-block">
          <div className="section-head">
            <h2>Quick Navigation</h2>
          </div>
          <div className="quick-nav-grid">
            <Link href="/schedule" className="quick-nav-card">
              <div className="quick-nav-icon">📅</div>
              <div className="quick-nav-info">
                <h3>Festival Match Schedule &amp; Timings</h3>
                <p>Daily pitch, stage, and court fixtures with reporting calls.</p>
              </div>
              <span className="quick-nav-arrow">→</span>
            </Link>
            <Link href="/standings" className="quick-nav-card">
              <div className="quick-nav-icon">📊</div>
              <div className="quick-nav-info">
                <h3>Batch Leaderboard &amp; Results</h3>
                <p>Track your MBBS batch points tally, podium medals, and rankings.</p>
              </div>
              <span className="quick-nav-arrow">→</span>
            </Link>
            <Link href="/sponsors" className="quick-nav-card">
              <div className="quick-nav-icon">🤝</div>
              <div className="quick-nav-info">
                <h3>Sponsors &amp; Partners</h3>
                <p>Official brand sponsors, title partners, and festival associates.</p>
              </div>
              <span className="quick-nav-arrow">→</span>
            </Link>
            {isOrganiser ? (
              <Link href="/admin" className="quick-nav-card admin-highlight">
                <div className="quick-nav-icon">🛠️</div>
                <div className="quick-nav-info">
                  <h3>Organiser Workspace</h3>
                  <p>Access committee review dashboard, attendance verification, and results desk.</p>
                </div>
                <span className="quick-nav-arrow">↗</span>
              </Link>
            ) : null}
          </div>
        </section>

        {/* Account Session */}
        <section className="my-fest-session" aria-label="Account session">
          <div className="session-info">
            <h2>Account Session</h2>
            <p>Signed in as <strong>{profile.full_name}</strong> ({profile.fest_id}) on this device.</p>
          </div>
          <SignOutForm />
        </section>
      </div>
    </main>
  );
}
