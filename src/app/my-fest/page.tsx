import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { batchDisplay } from "@/lib/participants";
import { hasSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { SpandanLogo } from "@/components/spandan-branding";
import { FestivalNotificationBell } from "@/components/festival-notification-bell";
import { StudentPass } from "./student-pass";
import { ActivityHub, type ApplicationItem } from "./activity-hub";
import type { HelpThread } from "./support-tools";
import styles from "./my-fest.module.css";

export const metadata: Metadata = {
  title: "My Fest & Official Pass — Spandan 4.0 | ASMC Firozabad",
  description: "Official student delegate festival pass, college credentials, and competition applications for ASMC Firozabad.",
};

export const dynamic = "force-dynamic";

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
  const [
    profileResult,
    accessResult,
    applicationResult,
    activationPermission,
    noticePermission,
    managedEvents,
    helpThreadsResult,
    seniorEntriesResult,
  ] = await Promise.all([
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
      .select("id,review_state,selection_state,created_at,events(id,slug,title,category,format,starts_at,venue)")
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
    client.from("senior_event_registrations").select("id,created_at,events(id,slug,title,category,starts_at,venue)").eq("profile_id", auth.user.id).order("created_at", { ascending: false }),
  ]);

  if (profileResult.error || !profileResult.data) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <div className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>Profile Not Found</h2>
            <p className={styles.emptyDesc}>
              We could not load your student profile. Please sign in again with your batch and roll number.
            </p>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className={styles.browseBtn}>
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
  const batchLabel = batchDisplay(batch?.label ?? "Not assigned");
  const courseLabel = batch?.course_label ?? "MBBS";

  const access = accessResult.data;
  const applications = (senior ? (seniorEntriesResult.data ?? []).map(entry => ({ ...entry, review_state: "approved", selection_state: "unselected" })) : applicationResult.data ?? []) as unknown as ApplicationItem[];
  const rosters = !senior && applications.length ? await admin.from("participant_groups")
    .select("event_id,state,batch_id,proposed_application_ids").in("event_id", applications.flatMap(a => a.events ? [a.events.id] : [])).neq("state", "disbanded") : null;
  for (const application of applications) {
    application.proposed = rosters?.data?.some(g => g.state === "draft" && g.proposed_application_ids.includes(application.id));
    application.finalTeamPublished = application.events?.format === "sport" && rosters?.data?.some(g => g.event_id === application.events?.id && g.state === "published" && g.batch_id === profile.batch_id);
  }
  const helpThreads = (helpThreadsResult.data ?? []) as unknown as HelpThread[];
  const status = access?.state ?? "pending";

  const isOrganiser =
    activationPermission.data === true ||
    noticePermission.data === true ||
    (managedEvents.data?.length ?? 0) > 0;

  return (
    <main className={styles.page}>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <SpandanLogo size="medium" variant="dark" />

          <div className={styles.headerActions}>
            <FestivalNotificationBell />
            <Link href="/home" className={styles.homeBtn}>
              ← Home
            </Link>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {/* Intro Greeting */}
        <section className={styles.heroIntro}>
          <span className={styles.eyebrow}>
            <span>Official Credential</span>
            <span>·</span>
            <span>ASMC Firozabad</span>
          </span>
          <h1 className={styles.heroTitle}>
            My Fest &amp; <em>Delegate Pass</em>
          </h1>
          <p className={styles.heroSubtitle}>
            {senior ? "Your festival pass and confirmed event registrations." : "Your official digital festival credentials, registered events, team invitations, and venue clearance."}
          </p>
        </section>

        {/* The Signature VIP Digital Pass */}
        <StudentPass
          fullName={profile.full_name}
          festId={profile.fest_id}
          rollCanonical={profile.roll_canonical}
          batchLabel={batchLabel}
          courseLabel={courseLabel}
          department={profile.department}
          participantCategory={profile.participant_category}
          phoneE164={profile.phone_e164}
          accessStatus={status}
          ledgerReference={access?.ledger_reference}
        />

        {/* Activity Hub (Tabs: Registrations, Teams, Support) */}
        <ActivityHub
          applications={applications}
          helpThreads={helpThreads}
          editionId={access?.edition_id}
          isActive={status === "active"}
          senior={senior}
          registrationsError={senior ? !!seniorEntriesResult.error : !!(applicationResult.error || rosters?.error)}
        />

        {/* Quick Festival Action Links */}
        <section className={styles.hubSection} aria-label="Quick festival shortcuts">
          <div className={styles.quickActionsGrid}>
            <Link href="/schedule" className={styles.quickActionCard}>
              <div className={styles.quickActionIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className={styles.quickActionText}>
                <strong className={styles.quickActionTitle}>Schedule &amp; Fixtures</strong>
                <span className={styles.quickActionDesc}>Daily match calls &amp; venues</span>
              </div>
            </Link>

            <Link href="/standings" className={styles.quickActionCard}>
              <div className={styles.quickActionIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <div className={styles.quickActionText}>
                <strong className={styles.quickActionTitle}>Batch Standings</strong>
                <span className={styles.quickActionDesc}>Points tally &amp; podium tally</span>
              </div>
            </Link>

            <Link href="/merchandise" className={styles.quickActionCard}>
              <div className={styles.quickActionIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </div>
              <div className={styles.quickActionText}>
                <strong className={styles.quickActionTitle}>Official Merch</strong>
                <span className={styles.quickActionDesc}>T-shirts &amp; festival line</span>
              </div>
            </Link>

            <Link href="/sponsors" className={styles.quickActionCard}>
              <div className={styles.quickActionIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className={styles.quickActionText}>
                <strong className={styles.quickActionTitle}>Partners &amp; Sponsors</strong>
                <span className={styles.quickActionDesc}>Festival brand patrons</span>
              </div>
            </Link>

            {isOrganiser && (
              <Link href="/admin" className={`${styles.quickActionCard} ${styles.adminHighlight}`}>
                <div className={styles.quickActionIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div className={styles.quickActionText}>
                  <strong className={styles.quickActionTitle}>Organiser Portal ↗</strong>
                  <span className={styles.quickActionDesc}>Review, scoring &amp; admin</span>
                </div>
              </Link>
            )}
          </div>
        </section>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className={styles.signOutBtn}>
            Logout
          </button>
        </form>
      </div>
    </main>
  );
}
