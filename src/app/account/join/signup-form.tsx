"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/password-input";

export function SeniorSignupForm() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let ignore = false;
    const value = window.location.hash.slice(1);
    fetch("/api/auth/senior", { cache: "no-store", headers: { "X-Signup-Token": value } }).then(async response => {
      const body = await response.json();
      if (ignore) return;
      setToken(value);
      if (!response.ok) setMessage(body.error ?? "Signup unavailable.");
      else if (!/^[A-Za-z0-9_-]{43}$/.test(value)) setMessage("Open the private signup link shared by the festival team.");
      else setReady(true);
    }).catch(() => { if (!ignore) setMessage("Unable to open signup. Reload to retry."); });
    return () => { ignore = true; };
  }, []);
  if (created) return <div role="status"><p>Account created. Sign in with your mobile number and password.</p><Link className="submit-btn primary-gold" href="/account?mode=senior">Continue to Sign In</Link></div>;
  return <form className="account-form-inner" onSubmit={async event => {
    event.preventDefault();
    if (!ready || busy) return;
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) { setMessage("Passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/senior", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(form), token }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create this account.");
      setCreated(true);
      const login = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "senior", phone: form.get("phone"), password: form.get("password") }) });
      if (login.ok) {
        // Reload the document so the session menu reads the newly set cookies.
        window.location.replace(new URL("/my-fest", window.location.origin).href);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to continue. Check your connection."); }
    finally { setBusy(false); }
  }}>
    <fieldset className="account-form-inner" disabled={!ready || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="field-group"><label htmlFor="senior-name">Full name</label><input id="senior-name" name="fullName" autoComplete="name" required maxLength={100} /></div>
      <div className="field-group"><label htmlFor="senior-phone">Mobile number</label><input id="senior-phone" name="phone" type="tel" autoComplete="tel" required maxLength={20} /></div>
      <div className="field-group"><label htmlFor="senior-category">Category</label><select id="senior-category" name="category" required defaultValue=""><option value="" disabled>Select category</option><option value="pg">PG</option><option value="jr">JR</option><option value="fmg">FMG</option><option value="faculty">Faculty</option></select></div>
      <div className="field-group"><label htmlFor="senior-department">Department / unit</label><input id="senior-department" name="department" required maxLength={120} /></div>
      <div className="field-group"><label htmlFor="senior-gender">Gender</label><select id="senior-gender" name="gender" required defaultValue=""><option value="" disabled>Select gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></div>
      <div className="field-group"><label htmlFor="senior-password">Password</label><PasswordInput id="senior-password" name="password" autoComplete="new-password" required minLength={8} maxLength={256} /></div>
      <div className="field-group"><label htmlFor="senior-confirm">Confirm password</label><PasswordInput id="senior-confirm" name="confirm" autoComplete="new-password" required minLength={8} maxLength={256} /></div>
      <button className="submit-btn primary-gold" disabled={!ready || busy}>{busy ? "Creating account…" : "Create my account"}</button>
    </fieldset>
    {message && <p className="form-error-alert" role="alert">{message}</p>}
  </form>;
}
