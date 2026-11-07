"use client";

import { useState } from "react";
import Link from "next/link";
import { PollWidget } from "./poll-widget";
import { HelpDesk, type HelpThread } from "./support-tools";
import styles from "./my-fest.module.css";

export type ApplicationItem = {
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

export type ActivityHubProps = {
  applications: ApplicationItem[];
  helpThreads: HelpThread[];
  editionId?: string;
  isActive: boolean;
};

function formatEventTime(value: string | null) {
  if (!value) return "Schedule to be confirmed";
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

export function ActivityHub({
  applications,
  helpThreads,
  editionId,
  isActive,
}: ActivityHubProps) {
  const [activeTab, setActiveTab] = useState<"registrations" | "teams" | "support">("registrations");

  return (
    <section className={styles.hubSection} aria-label="Participant Activity Hub">
      {/* Segmented Tab Controls */}
      <nav className={styles.tabNav} aria-label="Activity sections">
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "registrations" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("registrations")}
        >
          <span>Registrations</span>
          <span className={styles.tabBadge}>{applications.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "teams" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("teams")}
        >
          <span>Teams &amp; Squad</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "support" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("support")}
        >
          <span>Support &amp; Polls</span>
        </button>
      </nav>

      {/* Tab 1: Registrations */}
      {activeTab === "registrations" && (
        <div className={styles.registrationsList}>
          {applications.length > 0 ? (
            applications.map((app) => (
              <Link
                key={app.id}
                href={app.events?.slug ? `/events/${app.events.slug}` : "/events"}
                className={styles.eventTicket}
              >
                <div className={styles.ticketMain}>
                  <span className={styles.ticketCategory}>
                    {app.events?.category || "Competition"}
                  </span>
                  <h3 className={styles.ticketTitle}>
                    {app.events?.title || "Festival Event"}
                  </h3>
                  <div className={styles.ticketMeta}>
                    <span className={styles.ticketMetaItem}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {formatEventTime(app.events?.starts_at || null)}
                    </span>
                    {app.events?.venue && (
                      <span className={styles.ticketMetaItem}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {app.events.venue}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.ticketSide}>
                  <span
                    className={`${styles.statusChip} ${
                      app.review_state === "approved"
                        ? styles.statusApproved
                        : app.review_state === "rejected"
                        ? styles.statusRejected
                        : styles.statusPending
                    }`}
                  >
                    {app.review_state === "approved"
                      ? "Confirmed"
                      : app.review_state === "rejected"
                      ? "Declined"
                      : "Under Review"}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className={styles.emptyCard}>
              <h3 className={styles.emptyTitle}>No Event Registrations Yet</h3>
              <p className={styles.emptyDesc}>
                Explore official sports, cultural, and literary competitions. Apply individually or
                with your batch team to earn points.
              </p>
              <Link href="/events" className={styles.browseBtn}>
                Browse Competitions →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Teams & Invitations */}
      {activeTab === "teams" && (
        <div className={styles.teamOverviewCard}>
          <div className={styles.teamOverviewInfo}>
            <h3>My Teams &amp; Invitations</h3>
            <p>
              Manage your appointed sports squad, respond to pending pair invitations, and track
              official coordinator roster approval.
            </p>
          </div>
          <Link href="/my-fest/teams" className={styles.teamCtaBtn}>
            Open Team Hub →
          </Link>
        </div>
      )}

      {/* Tab 3: Support & Polls */}
      {activeTab === "support" && (
        <div className={styles.supportContainer}>
          <HelpDesk editionId={editionId} initialThreads={helpThreads} />
          <PollWidget editionId={editionId} active={isActive} />
        </div>
      )}
    </section>
  );
}
