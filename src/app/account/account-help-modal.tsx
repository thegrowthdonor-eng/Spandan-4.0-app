"use client";

import React, { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/password-input";

interface AccountHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignup?: () => void;
}

export function AccountHelpModal({
  isOpen,
  onClose,
  onSwitchToSignup,
}: AccountHelpModalProps) {
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleTokenReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanToken = token.trim();
    if (!cleanToken) {
      setErrorMsg("Please enter the 43-character recovery token issued to you.");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please verify.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/recovery/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: cleanToken,
          password: newPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setErrorMsg(data.error ?? "Invalid or expired token. Visit the help desk for a fresh token.");
      } else {
        setSuccessMsg(data.message ?? "Password reset successfully! You can now sign in.");
        setToken("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="account-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="account-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-help-title"
      >
        {/* Header */}
        <div className="account-modal-header">
          <div className="account-modal-title-wrap">
            <span className="account-modal-badge">SPANDAN 4.0 · ACCESS ASSISTANCE</span>
            <h3 id="account-help-title">Need Help Signing In?</h3>
          </div>
          <button
            type="button"
            className="account-modal-close"
            onClick={onClose}
            aria-label="Close help modal"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        <div className="account-modal-body">
          {/* Card 1: Password Recovery for UG Students */}
          <div className="help-topic-card primary">
            <div className="help-topic-title">
              <span className="help-topic-icon" aria-hidden="true">🔑</span>
              <span>Forgot Your Password? (UG / Interns)</span>
            </div>
            <p className="help-topic-desc">
              For student identity security, password resets are processed offline.
              Visit the <strong>Registration &amp; Help Desk</strong> with your official <strong>College ID card</strong>.
              The desk staff will verify your student identity and provide a single-use 43-character Recovery Token.
            </p>

            <div className="help-topic-actions">
              <button
                type="button"
                className="help-action-btn primary"
                onClick={() => setShowTokenForm(!showTokenForm)}
              >
                {showTokenForm ? "▲ Hide Token Form" : "▼ Enter Recovery Token"}
              </button>
              <Link
                href="/account/recover"
                className="help-action-btn secondary"
                onClick={onClose}
              >
                Open Full Reset Page ↗
              </Link>
            </div>

            {/* Quick Token Reset Form inside Modal */}
            {showTokenForm && (
              <form className="modal-token-reset-box" onSubmit={handleTokenReset}>
                <label>
                  <span>Recovery Token (from Help Desk)</span>
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste your 43-character token"
                    required
                    disabled={pending}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>

                <label>
                  <span>New Password (minimum 8 characters)</span>
                  <PasswordInput
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                    disabled={pending}
                    autoComplete="new-password"
                  />
                </label>

                <label>
                  <span>Confirm New Password</span>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    minLength={8}
                    required
                    disabled={pending}
                    autoComplete="new-password"
                  />
                </label>

                <button
                  type="submit"
                  className="submit-btn primary-gold"
                  disabled={pending}
                  style={{ marginTop: "4px" }}
                >
                  {pending ? "Resetting Password…" : "Reset My Password"}
                </button>

                {errorMsg && (
                  <p className="form-error-alert" role="alert" style={{ marginTop: "6px" }}>
                    <span className="error-icon">⚠️</span>
                    <span>{errorMsg}</span>
                  </p>
                )}

                {successMsg && (
                  <div
                    className="form-feedback-banner feedback-success"
                    role="status"
                    style={{ marginTop: "6px" }}
                  >
                    <span className="feedback-icon">✓</span>
                    <div>
                      <p><strong>{successMsg}</strong></p>
                      <button
                        type="button"
                        className="help-action-btn primary"
                        style={{ marginTop: "8px" }}
                        onClick={onClose}
                      >
                        Sign In Now →
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Card 2: New Students */}
          <div className="help-topic-card">
            <div className="help-topic-title">
              <span className="help-topic-icon" aria-hidden="true">🎓</span>
              <span>First Time Visiting? Create Profile</span>
            </div>
            <p className="help-topic-desc">
              If you haven&apos;t registered your festival account yet, sign-in will not work until your profile is created.
            </p>
            {onSwitchToSignup ? (
              <button
                type="button"
                className="help-action-btn secondary"
                onClick={() => {
                  onClose();
                  onSwitchToSignup();
                }}
              >
                Go to Create Profile →
              </button>
            ) : (
              <Link
                href="/account?mode=signup"
                className="help-action-btn secondary"
                onClick={onClose}
              >
                Go to Create Profile →
              </Link>
            )}
          </div>

          {/* Card 3: Senior Delegates & Faculty */}
          <div className="help-topic-card">
            <div className="help-topic-title">
              <span className="help-topic-icon" aria-hidden="true">🩺</span>
              <span>PG / JR / Faculty Member?</span>
            </div>
            <p className="help-topic-desc">
              PGs, Junior Residents, and Faculty accounts are created via direct committee invitations.
              If you need your setup link reissued or updated, please contact the festival registration desk or organising secretariat.
            </p>
          </div>

          {/* Card 4: General FAQs */}
          <div className="help-topic-card">
            <div className="help-topic-title">
              <span className="help-topic-icon" aria-hidden="true">💡</span>
              <span>Festival Rules &amp; FAQs</span>
            </div>
            <p className="help-topic-desc">
              Have questions regarding event registrations, scores, schedules, or festival passes?
            </p>
            <Link
              href="/faqs"
              className="help-action-btn secondary"
              onClick={onClose}
            >
              Browse Festival FAQs →
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="account-modal-footer">
          <button
            type="button"
            className="help-action-btn secondary"
            onClick={onClose}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
