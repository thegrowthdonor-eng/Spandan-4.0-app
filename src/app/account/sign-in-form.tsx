"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function SignInForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || pending) return;
    setPending(true); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch: form.get("batch"), rollNumber: form.get("rollNumber"), password: form.get("password") }), cache: "no-store" });
      if (!result.ok) throw new Error("sign in failed");
      router.push("/my-fest");
    } catch { setError("Unable to sign in with those credentials."); } finally { setPending(false); }
  }
  return <form className="account-panel" onSubmit={submit}><p className="eyebrow">Sign in</p><h2>Welcome back.</h2><label>Batch<input name="batch" disabled={!configured || pending} autoComplete="username" placeholder="Your eligible batch" required /></label><label>Roll number<input name="rollNumber" disabled={!configured || pending} placeholder="Your canonical roll number" required /></label><label>Password<input name="password" disabled={!configured || pending} type="password" autoComplete="current-password" placeholder="••••••••••••" minLength={12} required /></label><button type="submit" disabled={!configured || pending}>{pending ? "Signing in…" : configured ? "Sign in" : "Account setup is not configured"}</button>{error ? <p className="form-error" role="alert">{error}</p> : null}<a href="#recovery">Need help signing in?</a></form>;
}
