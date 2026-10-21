"use client";

import { FormEvent, useEffect, useState } from "react";
import { ugBatches } from "@/lib/participants";
import { PasswordInput } from "@/components/password-input";
import { AccountHelpModal } from "./account-help-modal";

export function SignInForm({
  configured,
  returnTo,
  onSwitchToSignup,
}: {
  configured: boolean;
  returnTo?: string;
  onSwitchToSignup?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"ug" | "senior">("ug");
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#recovery") {
      setShowHelpModal(true);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || pending) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "senior" ? { mode, phone: form.get("phone"), password: form.get("password") } : {
          batch: form.get("batch"),
          rollNumber: form.get("rollNumber"),
          password: form.get("password"),
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Invalid credentials. Please verify batch, roll number, and password.");
        return;
      }
      const target = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/home";
      window.location.href = target;
    } catch {
      setError("Unable to sign in right now. Please check your network connection.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form className="account-form-inner" onSubmit={submit}>
        <div className="login-mode" role="group" aria-label="Account type">
          <button type="button" aria-pressed={mode === "ug"} disabled={pending} onClick={() => { setMode("ug"); setError(null); }}>UG / Interns</button>
          <button type="button" aria-pressed={mode === "senior"} disabled={pending} onClick={() => { setMode("senior"); setError(null); }}>PG / JR / Faculty</button>
        </div>
        {mode === "ug" ? <>
        <div className="field-group">
          <label htmlFor="signin-batch">
            <span className="label-text">Batch</span>
            <span className="label-hint">Interns: admission batch 2021</span>
          </label>
          <select
            id="signin-batch"
            name="batch"
            disabled={!configured || pending}
            defaultValue=""
            required
          ><option value="" disabled>Select your batch</option>{ugBatches.map((batch) => <option key={batch.value} value={batch.value}>{batch.label}</option>)}</select>
        </div>
        </> : <div className="field-group">
          <label htmlFor="signin-phone"><span className="label-text">Registered mobile number</span></label>
          <input id="signin-phone" name="phone" type="tel" inputMode="tel" autoComplete="username" placeholder="10-digit mobile" required disabled={!configured || pending} />
          <p className="label-hint">First visit? Use the personal setup link shared by the festival committee.</p>
        </div>}
        {mode === "ug" && <div className="field-group">
          <label htmlFor="signin-roll">
            <span className="label-text">Roll Number</span>
            <span className="label-hint">Official college roll number</span>
          </label>
          <input
            id="signin-roll"
            name="rollNumber"
            disabled={!configured || pending}
            placeholder="e.g. 23MBBS045"
            required
          />
        </div>}

        <div className="field-group">
          <label htmlFor="signin-password">
            <span className="label-text">Password</span>
            <button
              type="button"
              className="forgot-link"
              onClick={() => setShowHelpModal(true)}
              aria-haspopup="dialog"
            >
              Need help?
            </button>
          </label>
          <PasswordInput
            id="signin-password"
            name="password"
            disabled={!configured || pending}
            autoComplete="current-password"
            placeholder="Enter your account password"
            minLength={8}
            required
          />
        </div>

        <button type="submit" className="submit-btn primary-gold" disabled={!configured || pending}>
          {pending ? "Signing in…" : configured ? "Sign In to Spandan →" : "Portal Setup Pending"}
        </button>

        {error && (
          <p className="form-error-alert" role="alert">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </p>
        )}
      </form>

      <AccountHelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        onSwitchToSignup={onSwitchToSignup}
      />
    </>
  );
}
