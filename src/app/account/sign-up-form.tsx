"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { PasswordInput } from "@/components/password-input";

type Batch = { id: string; label: string };

export function SignUpForm({
  configured,
}: {
  configured: boolean;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [batchState, setBatchState] = useState<"idle" | "loading" | "ready" | "error">(configured ? "loading" : "idle");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let ignore = false;
    if (!configured) return;

    fetch("/api/public/batches", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Batch list unavailable");
        return res.json() as Promise<{ batches?: Batch[] }>;
      })
      .then((data) => {
        if (!ignore) {
          setBatches(data.batches ?? []);
          setBatchState("ready");
        }
      })
      .catch(() => {
        if (!ignore) {
          setBatches([]);
          setBatchState("error");
        }
      });

    return () => {
      ignore = true;
    };
  }, [configured]);

  async function retryBatches() {
    if (!configured) return;
    setBatchState("loading");
    try {
      const response = await fetch("/api/public/batches", { cache: "no-store" });
      if (!response.ok) throw new Error("Batch list unavailable");
      const data = (await response.json()) as { batches?: Batch[] };
      setBatches(data.batches ?? []);
      setBatchState("ready");
    } catch {
      setBatches([]);
      setBatchState("error");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || pending) return;
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
        cache: "no-store",
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setMessage({ text: result.error ?? "Unable to create your profile. Please check the details.", isError: true });
        return;
      }
      setMessage({
        text: result.message ?? "Profile created successfully! Please visit the Student Council desk with your ID for pass activation.",
        isError: false,
      });
      formRef.current?.reset();
    } catch {
      setMessage({ text: "Network error while creating account. Please try again.", isError: true });
    } finally {
      setPending(false);
    }
  }

  const batchUnavailable = batchState === "error";

  return (
    <form ref={formRef} id="register" className="account-form-inner" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="signup-name">
          <span className="label-text">Full Name</span>
          <span className="label-hint">As printed on your college ID</span>
        </label>
        <input
          id="signup-name"
          name="fullName"
          disabled={!configured || pending}
          autoComplete="name"
          placeholder="e.g. Dr. Rohan Sharma"
          maxLength={100}
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="signup-batch">
          <span className="label-text">Academic Batch</span>
          <span className="label-hint">Official MBBS year batch</span>
        </label>
        <select
          id="signup-batch"
          name="batchId"
          disabled={!configured || pending || batchState !== "ready" || batches.length === 0}
          required
          defaultValue=""
        >
          <option value="">
            {batchState === "loading"
              ? "Loading eligible batches…"
              : batches.length
              ? "Select your MBBS batch"
              : "No eligible batches loaded"}
          </option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.label}
            </option>
          ))}
        </select>
        {batchUnavailable && (
          <p className="form-error-inline">
            Batches could not be loaded.{" "}
            <button type="button" className="retry-link-btn" onClick={() => void retryBatches()}>
              Retry
            </button>
          </p>
        )}
      </div>

      <div className="field-row-grid">
        <div className="field-group">
          <label htmlFor="signup-roll">
            <span className="label-text">Roll Number</span>
          </label>
          <input
            id="signup-roll"
            name="rollNumber"
            disabled={!configured || pending}
            autoComplete="off"
            placeholder="e.g. 23MBBS045"
            maxLength={80}
            required
          />
        </div>

        <div className="field-group">
          <label htmlFor="signup-phone">
            <span className="label-text">Phone Number</span>
          </label>
          <input
            id="signup-phone"
            name="phone"
            disabled={!configured || pending}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="10-digit mobile"
            required
          />
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="signup-gender">
          <span className="label-text">Gender</span>
          <span className="label-hint">Used only to enforce boys/girls event eligibility</span>
        </label>
        <select
          id="signup-gender"
          name="gender"
          disabled={!configured || pending}
          required
          defaultValue=""
        >
          <option value="" disabled>Select your gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
      </div>

      <div className="field-group">
        <label htmlFor="signup-password">
          <span className="label-text">Create Password</span>
          <span className="label-hint">Minimum 8 characters</span>
        </label>
        <PasswordInput
          id="signup-password"
          name="password"
          disabled={!configured || pending}
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
        />
      </div>

      <button
        type="submit"
        className="submit-btn primary-coral"
        disabled={!configured || pending || batchState !== "ready" || batches.length === 0}
      >
        {pending ? "Creating Profile…" : configured && batches.length ? "Create Student Profile →" : "Registration Offline"}
      </button>

      {message && (
        <div className={`form-feedback-banner ${message.isError ? "feedback-error" : "feedback-success"}`} role="status">
          <span className="feedback-icon">{message.isError ? "⚠️" : "✓"}</span>
          <p>{message.text}</p>
        </div>
      )}
    </form>
  );
}
