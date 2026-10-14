"use client";

import { FormEvent, useEffect, useState } from "react";

type Batch = { id: string; label: string };

export function SignUpForm({ configured }: { configured: boolean }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!configured) return;
    fetch("/api/public/batches", { cache: "no-store" }).then((response) => response.json()).then((data: { batches?: Batch[] }) => setBatches(data.batches ?? [])).catch(() => setBatches([]));
  }, [configured]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || pending) return;
    setPending(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)), cache: "no-store" });
      const result = await response.json() as { message?: string; error?: string };
      setMessage(result.message ?? result.error ?? "Unable to create an account.");
      if (response.ok) event.currentTarget.reset();
    } catch { setMessage("Unable to create an account."); } finally { setPending(false); }
  }
  return <form className="account-panel signup-panel" onSubmit={submit}><p className="eyebrow">New student</p><h2>Create your profile.</h2><label>Full name<input name="fullName" disabled={!configured || pending} maxLength={100} required /></label><label>Eligible batch<select name="batchId" disabled={!configured || pending || batches.length === 0} required defaultValue=""><option value="">{batches.length ? "Choose your batch" : "Batches will appear after setup"}</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.label}</option>)}</select></label><label>Roll number<input name="rollNumber" disabled={!configured || pending} maxLength={80} required /></label><label>Phone number<input name="phone" disabled={!configured || pending} inputMode="tel" placeholder="9876543210" required /></label><label>Password<input name="password" disabled={!configured || pending} type="password" minLength={12} autoComplete="new-password" required /></label><button type="submit" disabled={!configured || pending || batches.length === 0}>{pending ? "Creating profile…" : configured && batches.length ? "Create profile" : "Profile setup is not configured"}</button>{message ? <p className="form-message" role="status">{message}</p> : null}</form>;
}
