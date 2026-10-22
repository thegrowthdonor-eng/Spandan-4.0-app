"use client";

import { useEffect, useState } from "react";
import { ShareFeedbackModal, type FeedbackAuthStatus } from "./share-feedback-modal";
import styles from "./automated-feedback-banner.module.css";

type Props = {
  authStatus: FeedbackAuthStatus;
  editionId?: string;
};

const SNOOZE_HOURS = 48;
const SESSION_TIMER_SECONDS = 35;
const VISITS_TRIGGER_THRESHOLD = 3;

export function AutomatedFeedbackBanner({ authStatus, editionId }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Only logged in students can submit council feedback
    if (!authStatus.loggedIn) return;

    try {
      // 1. If already submitted, never show
      const hasSubmitted = localStorage.getItem("spandan_feedback_submitted");
      if (hasSubmitted === "true") return;

      // 2. If snoozed recently, don't show
      const snoozedUntil = localStorage.getItem("spandan_feedback_snoozed_until");
      if (snoozedUntil && Date.now() < Number(snoozedUntil)) return;

      // 3. Increment session visit count if not counted in this tab session
      let visitCount = Number(localStorage.getItem("spandan_visit_count") || "0");
      if (!sessionStorage.getItem("spandan_session_visited")) {
        visitCount += 1;
        localStorage.setItem("spandan_visit_count", String(visitCount));
        sessionStorage.setItem("spandan_session_visited", "true");
      }

      // 4. Trigger check: either 3+ visits or timer on this session
      if (visitCount >= VISITS_TRIGGER_THRESHOLD) {
        // Immediate show after brief gentle delay
        const visitTimer = window.setTimeout(() => setIsVisible(true), 2500);
        return () => window.clearTimeout(visitTimer);
      } else {
        // Show after active usage time in this session
        const durationTimer = window.setTimeout(() => {
          setIsVisible(true);
        }, SESSION_TIMER_SECONDS * 1000);
        return () => window.clearTimeout(durationTimer);
      }
    } catch {
      // Ignore storage restrictions
    }
  }, [authStatus.loggedIn]);

  function handleDismiss() {
    setIsVisible(false);
    try {
      const snoozeExpiry = Date.now() + SNOOZE_HOURS * 60 * 60 * 1000;
      localStorage.setItem("spandan_feedback_snoozed_until", String(snoozeExpiry));
    } catch {
      // ignore
    }
  }

  function handleOpenFeedback() {
    setIsVisible(false);
    setIsModalOpen(true);
  }

  return (
    <>
      {isVisible && (
        <aside
          className={styles.bannerWrapper}
          role="region"
          aria-label="Share Festival Feedback Banner"
        >
          <div className={styles.bannerCard}>
            <div className={styles.bannerHeader}>
              <p className={styles.bannerEyebrow}>✦ COUNCIL DESK · SPANDAN 4.0</p>
              <button
                type="button"
                className={styles.bannerDismissBtn}
                onClick={handleDismiss}
                aria-label="Dismiss feedback prompt"
              >
                ✕
              </button>
            </div>
            <h4 className={styles.bannerTitle}>Enjoying the festival?</h4>
            <p className={styles.bannerCopy}>
              Help the council make this edition memorable. Tell us how the fixtures, stage & arrangements are going.
            </p>
            <div className={styles.bannerActions}>
              <button
                type="button"
                className={styles.openModalBtn}
                onClick={handleOpenFeedback}
              >
                Share Feedback →
              </button>
              <button
                type="button"
                className={styles.laterBtn}
                onClick={handleDismiss}
              >
                Maybe later
              </button>
            </div>
          </div>
        </aside>
      )}

      <ShareFeedbackModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        authStatus={authStatus}
        editionId={editionId}
      />
    </>
  );
}
