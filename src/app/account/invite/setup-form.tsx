"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/password-input";

export function InviteSetup({ recovery = false }: { recovery?: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [hashToken, setHashToken] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace(/^#/, "").trim();
      if (hash) setHashToken(hash);
    }
  }, []);

  if (done) {
    return (
      <div role="status" className="auth-form-shell">
        <div className="form-feedback-banner feedback-success" style={{ marginBottom: "16px" }}>
          <span className="feedback-icon">✓</span>
          <p>
            {recovery
              ? "Password reset successfully. Sign in with your new password."
              : "Account activated successfully. Sign in using your mobile number and new password."}
          </p>
        </div>
        <Link href="/account" className="submit-btn primary-gold" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          Proceed to Sign In →
        </Link>
      </div>
    );
  }

  return (
    <form
      className="account-form-inner"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        const form = new FormData(e.currentTarget);
        const pass = form.get("password") as string;
        const confirm = form.get("confirm") as string;
        const tokenVal = ((form.get("token") as string) || hashToken || (typeof window !== "undefined" ? window.location.hash.replace(/^#/, "").trim() : "")).trim();

        if (!tokenVal) {
          setMessage("Please provide the recovery / invite token issued by the committee desk.");
          return;
        }
        if (pass.length < 8) {
          setMessage("Password must be at least 8 characters.");
          return;
        }
        if (pass !== confirm) {
          setMessage("Passwords do not match.");
          return;
        }

        setPending(true);
        setMessage("");
        try {
          const res = await fetch(recovery ? "/api/auth/recovery/redeem" : "/api/auth/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: tokenVal, password: pass }),
          });
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            setMessage(body.error ?? "Setup unavailable. Please ask the committee desk for a new token.");
          } else {
            if (typeof window !== "undefined") {
              window.history.replaceState(null, "", window.location.pathname);
            }
            setDone(true);
          }
        } catch {
          setMessage("Connection failed. Contact the committee if setup was interrupted.");
        } finally {
          setPending(false);
        }
      }}
    >
      {!hashToken && (
        <div className="field-group">
          <label htmlFor="invite-token">
            <span className="label-text">{recovery ? "Recovery Token" : "Invitation Token"}</span>
            <span className="label-hint">43-character code</span>
          </label>
          <input
            id="invite-token"
            name="token"
            type="text"
            placeholder="Paste your token from the help desk"
            required
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      <div className="field-group">
        <label htmlFor="invite-password">
          <span className="label-text">Create password</span>
          <span className="label-hint">Minimum 8 characters</span>
        </label>
        <PasswordInput
          id="invite-password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={256}
          placeholder="At least 8 characters"
          required
          disabled={pending}
        />
      </div>

      <div className="field-group">
        <label htmlFor="invite-confirm">
          <span className="label-text">Confirm password</span>
        </label>
        <PasswordInput
          id="invite-confirm"
          name="confirm"
          autoComplete="new-password"
          minLength={8}
          maxLength={256}
          placeholder="Re-enter your password"
          required
          disabled={pending}
        />
      </div>

      <button className="submit-btn primary-gold" disabled={pending}>
        {pending ? "Saving…" : recovery ? "Reset password" : "Activate my account"}
      </button>

      {message && (
        <p className="form-error-alert" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{message}</span>
        </p>
      )}

      <div style={{ textAlign: "center", marginTop: "12px" }}>
        <Link href="/account" className="forgot-link">
          ← Back to Sign In
        </Link>
      </div>
    </form>
  );
}
