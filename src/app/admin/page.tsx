import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { SpandanLogo } from "@/components/spandan-branding";
import { AssignedEventsList } from "./assigned-events-list";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";
type ManagedEvent = { id: string; title: string; category: string; state: string };
type ActivationRow = { access_state: string };
type Tool = {
  href: string;
  title: string;
  subtitle: string;
  badge: string;
  actionText: string;
  icon: string;
  group: string;
  accent: "coral" | "gold" | "cyan" | "indigo" | "emerald" | "purple";
  urgent?: boolean;
};

const GROUPS = [
  { id: "ground", title: "Ground & Desk Operations", number: "01", icon: "⚡" },
  { id: "events", title: "Event Coordination", number: "02", icon: "📋" },
  { id: "admin", title: "Support & System Control", number: "03", icon: "🛡️" },
];

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function EmptyWorkspace({ title, copy }: { title: string; copy: string }) {
  return (
    <main className={styles.empty}>
      <SpandanLogo variant="light" />
      <section>
        <p className={styles.roleTag}>Organiser Workspace</p>
        <h1>{title}</h1>
        <p>{copy}</p>
        <Link href="/my-fest">Return to My Fest <span aria-hidden>→</span></Link>
      </section>
    </main>
  );
}

export default async function AdminPage() {
  if (!hasPublicSupabaseConfiguration()) {
    return <EmptyWorkspace title="Workspace setup is pending." copy="The organiser workspace will be available once setup is complete." />;
  }

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");

  const [accessCheck, eventsResult, activationResult, noticeCheck, mainAdminCheck] = await Promise.all([
    client.rpc("can_manage_access"),
    client.rpc("list_managed_events"),
    client.rpc("list_activation_queue"),
    client.rpc("can_publish_notices"),
    client.rpc("is_main_admin"),
  ]);

  const events = (eventsResult.data ?? []) as ManagedEvent[];
  const canActivate = accessCheck.data === true;
  const canPublishNotices = noticeCheck.data === true;
  const isMainAdmin = mainAdminCheck.data === true;
  const activationQueue = (activationResult.data ?? []) as ActivationRow[];

  if (!canActivate && !events.length && !canPublishNotices && !isMainAdmin) {
    return <EmptyWorkspace title="This area is restricted." copy="Your account does not currently have an organiser assignment." />;
  }

  const pendingCount = activationResult.error ? null : activationQueue.filter((row) => row.access_state === "pending").length;
  const hasLoadError = Boolean(accessCheck.error || eventsResult.error || noticeCheck.error || mainAdminCheck.error);

  const tools: Tool[] = [
    // PRIORITY 1: GROUND & COUNTER OPERATIONS
    ...(canActivate ? [
      {
        href: "/admin/activation",
        title: "Student Verification",
        subtitle: "Verify student ID, cash fee & activate official festival passes",
        badge: pendingCount && pendingCount > 0 ? `${pendingCount} PENDING` : "DESK ACTIVE",
        actionText: "Open Desk",
        accent: "coral" as const,
        urgent: Boolean(pendingCount && pendingCount > 0),
        group: "ground",
        icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      }
    ] : []),
    ...(events.length || isMainAdmin ? [
      {
        href: "/admin/fixtures",
        title: "Fixtures & Live Scores",
        subtitle: "Pitch, stage & court matches with real-time live scoring",
        badge: "GROUND LIVE",
        actionText: "Score Pitch",
        accent: "gold" as const,
        group: "ground",
        icon: "M8 2v4m8-4v4M4 9h16M4 4h16v17H4V4Zm4 9h2m4 0h2m-8 4h2m4 0h2"
      },
    ] : []),
    ...(canPublishNotices ? [
      {
        href: "/admin/notices",
        title: "Broadcast Notices",
        subtitle: "Publish urgent campus alerts, schedule changes & venue calls",
        badge: "FLASH ALERTS",
        actionText: "Post Notice",
        accent: "cyan" as const,
        group: "ground",
        icon: "m3 10 17-6v15L3 13v-3Zm5 4 2 7h4l-2-6M20 9h2m-2 5h2"
      }
    ] : []),
    ...(events.length || isMainAdmin ? [
      {
        href: "/admin/results",
        title: "Results & Podium Tally",
        subtitle: "Confirm official podium winners & award batch points",
        badge: "POINTS TALLY",
        actionText: "Declare Winners",
        accent: "gold" as const,
        group: "ground",
        icon: "M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-4 2h8"
      },
    ] : []),

    // PRIORITY 2: EVENT COORDINATION
    ...(isMainAdmin ? [
      {
        href: "/admin/events",
        title: "Event Editor & Rules",
        subtitle: "Configure event catalogue, category rules, registrations & deadlines",
        badge: "CATALOGUE & RULES",
        actionText: "Configure Events",
        accent: "indigo" as const,
        group: "events",
        icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      }
    ] : []),
    ...(events.length || isMainAdmin ? [
      {
        href: "/admin/review",
        title: "Application Review",
        subtitle: "Check candidate registrations, verify eligibility & approve rosters",
        badge: "ROSTER DESK",
        actionText: "Review Entries",
        accent: "indigo" as const,
        group: "events",
        icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      },
      {
        href: "/admin/groups",
        title: "Squads & Captains",
        subtitle: "Batch team rosters, official captain contacts & player lineups",
        badge: "TEAM DIRECTORY",
        actionText: "View Squads",
        accent: "emerald" as const,
        group: "events",
        icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      },
    ] : []),

    // PRIORITY 3: SUPPORT & SYSTEM CONTROL
    ...((canActivate || isMainAdmin || events.length > 0) ? [
      {
        href: "/admin/help",
        title: "Helpdesk & Queries",
        subtitle: "Resolve student queries, lost & found items and reporting",
        badge: "STUDENT SUPPORT",
        actionText: "Open Tickets",
        accent: "purple" as const,
        group: "admin",
        icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
      }
    ] : []),
    ...(isMainAdmin ? [
      {
        href: "/admin/control",
        title: "Master Control Centre",
        subtitle: "Global festival settings, access privileges & master overrides",
        badge: "SYSTEM ROOT",
        actionText: "Launch Console",
        accent: "purple" as const,
        group: "admin",
        icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      }
    ] : []),
  ];

  const visibleGroups = GROUPS.filter((g) => tools.some((t) => t.group === g.id));
  const role = isMainAdmin ? "Main Administrator" : "Festival Organiser";
  const priority = canActivate && pendingCount !== null && pendingCount > 0;
  const primaryLink = priority ? "/admin/activation" : (events.length || isMainAdmin) ? "/admin/fixtures" : canPublishNotices ? "/admin/notices" : "/admin/activation";
  const primaryLabel = priority ? "Verify Pending Students" : (events.length || isMainAdmin) ? "Update Live Scores" : canPublishNotices ? "Post Notice" : "Open Desk";

  return (
    <main className={styles.dashboard} data-admin-dashboard>
      <a className={styles.skip} href="#dashboard-content">Skip to dashboard</a>

      {/* Desktop Navigation Sidebar */}
      <aside className={styles.sidebar}>
        <SpandanLogo variant="dark" />
        <p className={styles.workspaceLabel}>Organiser Portal</p>
        <nav aria-label="Dashboard sections">
          <Link href="/admin" className={styles.activeNav} aria-current="page">
            <Icon path="M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z" />
            Overview
          </Link>
          {visibleGroups.map((group) => (
            <a key={group.id} href={`#${group.id}`}>
              <span className={styles.navNumber}>{group.number}</span>
              {group.title}
            </a>
          ))}
          <a href="#assigned-events">
            <Icon path="M4 4h16v16H4V4Zm4 4h8m-8 4h8m-8 4h4" />
            My Events
          </a>
        </nav>
        <div className={styles.sidebarFooter}>
          <span className={styles.roleDot} />
          <div>
            <strong>{role}</strong>
            <small>SPANDAN 4.0 · ASMC FIROZABAD</small>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <span>Organiser Portal <span aria-hidden>/</span> <strong>Dashboard</strong></span>
          <div>
            <Link href="/">← Festival Home</Link>
            <Link href="/my-fest">My Fest Pass</Link>
          </div>
        </header>

        <div className={styles.content} id="dashboard-content">
          {/* Compact Heading */}
          <section className={styles.heading}>
            <div>
              <div className={styles.roleTag}>
                <span className={styles.rolePulse} />
                <span>{role} · ASMC Firozabad</span>
              </div>
              <h1>Operations Hub</h1>
            </div>
            <Link href={primaryLink} className={styles.primary}>
              ⚡ {primaryLabel} →
            </Link>
          </section>

          {hasLoadError && (
            <p className={styles.warning} role="status">
              Some workspace information could not be loaded. Refresh this page to try again.
            </p>
          )}

          {/* Metrics Row */}
          <section className={styles.metrics} aria-label="Workspace summary">
            {canActivate && (
              <Link
                href="/admin/activation"
                className={`${styles.metric} ${pendingCount && pendingCount > 0 ? styles.metricAlert : styles.metricGold}`}
              >
                <span>Pending Verification</span>
                <strong>{pendingCount ?? 0}</strong>
                <small>{pendingCount && pendingCount > 0 ? "Awaiting cash verification" : "Queue is clear"}</small>
              </Link>
            )}
            <a href="#assigned-events" className={styles.metric}>
              <span>My Assigned Events</span>
              <strong>{hasLoadError ? "—" : events.length.toString().padStart(2, "0")}</strong>
              <small>Events in scope</small>
            </a>
            <div className={styles.metric}>
              <span>Ground Status</span>
              <strong style={{ fontSize: "20px", color: "#5eba7d" }}>ACTIVE</strong>
              <small>Live festival mode</small>
            </div>
          </section>

          <div className={styles.columns}>
            {/* Tool Groups (Priority-Ordered) */}
            <div id="workspace-tools" className={styles.tools}>
              {visibleGroups.map((group) => (
                <section id={group.id} className={styles.toolGroup} key={group.id} aria-labelledby={`heading-${group.id}`}>
                  <div className={styles.sectionHeading}>
                    <div className={styles.sectionHeaderLeft}>
                      <span className={styles.groupIcon} aria-hidden>{group.icon}</span>
                      <span className={styles.groupNumber}>{group.number}</span>
                      <h2 id={`heading-${group.id}`}>{group.title}</h2>
                    </div>
                    <span className={styles.groupCount}>
                      {tools.filter((t) => t.group === group.id).length} Modules
                    </span>
                  </div>
                  <div className={styles.toolGrid}>
                    {tools.filter((t) => t.group === group.id).map((tool) => (
                      <Link
                        href={tool.href}
                        className={`${styles.premiumCard} ${styles[`accent_${tool.accent}`]} ${tool.urgent ? styles.cardUrgent : ""}`}
                        key={tool.href}
                      >
                        <div className={styles.cardHeader}>
                          <div className={styles.cardIconBox}>
                            <Icon path={tool.icon} />
                          </div>
                          <span className={styles.cardBadge}>{tool.badge}</span>
                        </div>

                        <div className={styles.cardBody}>
                          <h3 className={styles.cardTitle}>{tool.title}</h3>
                          <p className={styles.cardSub}>{tool.subtitle}</p>
                        </div>

                        <div className={styles.cardFooter}>
                          <span className={styles.cardAction}>{tool.actionText}</span>
                          <span className={styles.cardArrow} aria-hidden>→</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Assigned Events Panel */}
            <aside className={styles.eventPanel} id="assigned-events" aria-labelledby="assigned-title">
              <div className={styles.eventHeading}>
                <div>
                  <h2 id="assigned-title">My Assigned Events</h2>
                  <p className={styles.eventSub}>Roster review & pitch management</p>
                </div>
                <span className={styles.eventCount}>{hasLoadError ? "—" : events.length}</span>
              </div>
              {hasLoadError ? (
                <p className={styles.panelEmpty}>Event assignments unavailable.</p>
              ) : events.length ? (
                <><AssignedEventsList events={events} /><div className={styles.legacyEventGrid} aria-hidden="true">
                  {events.map((event) => (
                    <Link
                      key={event.id}
                      href={`/admin/review?event=${encodeURIComponent(event.id)}`}
                      className={styles.eventCard}
                    >
                      <div className={styles.eventCardTop}>
                        <span className={styles.eventCategory}>{event.category.replaceAll("_", " ")}</span>
                        <span className={styles.status} data-state={event.state}>
                          {event.state.replaceAll("_", " ")}
                        </span>
                      </div>
                      <h3 className={styles.eventTitle}>{event.title}</h3>
                      <div className={styles.eventActionRow}>
                        <span>Review Applications</span>
                        <span className={styles.eventActionArrow} aria-hidden>→</span>
                      </div>
                    </Link>
                  ))}
                </div></>
              ) : (
                <div className={styles.panelEmpty}>
                  <span className={styles.emptyIcon} aria-hidden>📋</span>
                  <strong>No direct events assigned</strong>
                  <p>General operations tools on the left are ready for use.</p>
                </div>
              )}
              <p className={styles.panelNote}>Tap any event card to review candidate rosters & details.</p>
            </aside>
          </div>

          <footer className={styles.footer}>
            <span>ASMC Firozabad · Spandan 4.0</span>
            <span>Organiser Operations Portal</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
