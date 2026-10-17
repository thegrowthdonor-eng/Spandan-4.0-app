"use client";
import { useState } from "react";
import Link from "next/link";
export function InviteSetup({ recovery = false }: { recovery?: boolean }) {
 const [pending,setPending] = useState(false), [message,setMessage] = useState(""), [done,setDone] = useState(false);
 if (done) return <div role="status"><p>{recovery ? "Password reset. Sign in with your new password." : "Account activated. Sign in using PG / JR / Faculty, your mobile number and new password."}</p><Link href="/account">Sign in</Link></div>;
 return <form className="account-form-inner" onSubmit={async e => {
  e.preventDefault(); if(pending) return;
  const form = new FormData(e.currentTarget);
  if(form.get("password") !== form.get("confirm")) { setMessage("Passwords do not match."); return; }
  setPending(true); setMessage("");
  try {
   const token = window.location.hash.slice(1);
   const res = await fetch(recovery ? "/api/auth/recovery/redeem" : "/api/auth/invite", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ token,password:form.get("password") }) });
   const body = await res.json();
   if(!res.ok) setMessage(body.error ?? "Setup unavailable."); else { window.history.replaceState(null,"",window.location.pathname); setDone(true); }
  } catch { setMessage("Connection failed. Contact the committee if setup was interrupted."); } finally { setPending(false); }
 }}>
  <div className="field-group"><label htmlFor="invite-password">Create password</label><input id="invite-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={pending}/></div>
  <div className="field-group"><label htmlFor="invite-confirm">Confirm password</label><input id="invite-confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={pending}/></div>
  <button className="submit-btn primary-gold" disabled={pending}>{pending ? "Saving…" : recovery ? "Reset password" : "Activate my account"}</button>
  {message && <p role="alert">{message}</p>}
 </form>;
}
