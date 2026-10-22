"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import styles from "./share-feedback-modal.module.css";

export type FeedbackAuthStatus = {
  loggedIn: boolean;
  name: string;
};

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  authStatus: FeedbackAuthStatus;
  editionId?: string;
};

type ButtonProps = {
  authStatus: FeedbackAuthStatus;
  editionId?: string;
};

const RATING_OPTIONS = [
  { value: 5, label: "Excellent", stars: "★★★★★" },
  { value: 4, label: "Good", stars: "★★★★" },
  { value: 3, label: "Okay", stars: "★★★" },
  { value: 2, label: "Needs Work", stars: "★★" },
  { value: 1, label: "Poor", stars: "★" },
];

const CATEGORIES = [
  "General Fest",
  "Sports Fixtures",
  "Cultural & Stage",
  "Literary & Quiz",
  "Sound & Venues",
  "Schedule & Timings",
];

export function ShareFeedbackModal({ isOpen, onClose, authStatus, editionId }: ModalProps) {
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState("General Fest");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Close on ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editionId) {
      setStatus({ ok: false, message: "Festival edition is currently not loaded. Please try again." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const formattedComment = comment.trim()
      ? `[${category}] ${comment.trim()}`
      : `[${category}] Rating submission`;

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId,
          rating,
          comment: formattedComment,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (response.ok) {
        setStatus({
          ok: true,
          message: `Thank you, ${authStatus.name || "Student"}! Your feedback has been sent to the organizing council.`,
        });
        try {
          localStorage.setItem("spandan_feedback_submitted", "true");
        } catch {
          // ignore localStorage errors
        }
      } else {
        setStatus({
          ok: false,
          message: data.error || "Unable to save your feedback. Please try again.",
        });
      }
    } catch {
      setStatus({ ok: false, message: "Network error. Please check your connection." });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    onClose();
    setStatus(null);
  }

  if (!isOpen) return null;

  return (
    <div className={styles.modalBackdrop} onClick={handleClose}>
      <div
        className={styles.modalContent}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={handleClose}
          aria-label="Close feedback dialog"
        >
          ✕
        </button>

        <div className={styles.modalHeader}>
          <p className={styles.modalSubtitle}>ASMC Firozabad · Council Desk</p>
          <h3 id="feedback-dialog-title">Festival Feedback</h3>
        </div>

        {!authStatus.loggedIn ? (
          <div>
            <p className={styles.unauthBody}>
              Feedback is open to all enrolled ASMC Firozabad students. Sign in with your MBBS batch and roll number to share suggestions, rate festival fixtures, and help the council improve Spandan 4.0.
            </p>
            <div className={styles.actionRow}>
              <button
                type="button"
                onClick={handleClose}
                className={styles.secondaryBtn}
              >
                Cancel
              </button>
              <Link href="/account" className={styles.primaryBtn}>
                Sign In to Spandan →
              </Link>
            </div>
          </div>
        ) : status?.ok ? (
          <div>
            <div className={`${styles.statusMessage} ${styles.statusSuccess}`}>
              {status.message}
            </div>
            <div className={styles.actionRow}>
              <button
                type="button"
                onClick={handleClose}
                className={styles.primaryBtn}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {status && !status.ok && (
              <div className={`${styles.statusMessage} ${styles.statusError}`}>
                {status.message}
              </div>
            )}

            <div className={styles.ratingGroup}>
              <span className={styles.fieldLabel}>Festival Experience</span>
              <div className={styles.starRow}>
                {RATING_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    className={`${styles.starBtn} ${rating === opt.value ? styles.starBtnSelected : ""}`}
                    onClick={() => setRating(opt.value)}
                  >
                    <span>{opt.value}★</span>
                    <span className={styles.starLabel}>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.categoryGroup}>
              <span className={styles.fieldLabel}>Topic / Category</span>
              <div className={styles.categoryPills}>
                {CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    className={`${styles.catPill} ${category === cat ? styles.catPillActive : ""}`}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.commentGroup}>
              <label htmlFor="feedback-comment" className={styles.fieldLabel}>
                Comments or Suggestions (Optional)
              </label>
              <textarea
                id="feedback-comment"
                className={styles.commentTextarea}
                placeholder="Tell us what you liked or how we can improve venues, sound, scheduling or coordination..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
              />
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                onClick={handleClose}
                className={styles.secondaryBtn}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting…" : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function ShareFeedbackButton({ authStatus, editionId }: ButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.feedbackTriggerBtn}
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        title="Share your thoughts with the organizing council"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Share Feedback</span>
      </button>

      <ShareFeedbackModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        authStatus={authStatus}
        editionId={editionId}
      />
    </>
  );
}
