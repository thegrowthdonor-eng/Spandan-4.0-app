"use client";

import { useEffect, useState } from "react";
import { fromISTInput, toISTInput } from "@/lib/match-clock";
import { participantLabels, type ParticipantCategory } from "@/lib/participants";

type SignupLink = { id: string; edition_id: string; expires_at: string; max_accounts: number; used_count: number; closed_at: string | null };
type Account = { id: string; fullName: string; phone: string; category: ParticipantCategory; department: string; linkId: string; state: string };
export function SeniorSignupLinks({ editions }: { editions: { edition_id: string; name: string; status: string }[] }) {
  const [links, setLinks] = useState<SignupLink[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [browserAccounts, setBrowserAccounts] = useState<{ id: string; fullName: string; festId: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [privateLink, setPrivateLink] = useState("");
  async function load() {
    const response = await fetch("/api/admin/senior-signup", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load signup links.");
    setLinks(body.links); setAccounts(body.accounts); setBrowserAccounts(body.browserAccounts ?? []);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/senior-signup", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setLinks(body.links); setAccounts(body.accounts); setBrowserAccounts(body.browserAccounts ?? []);
    }).catch(error => { if (error.name !== "AbortError") setMessage("Unable to load signup links."); });
    return () => controller.abort();
  }, []);
  async function command(payload: Record<string, unknown>) {
    setBusy(true); setMessage(""); setPrivateLink("");
    try {
      const response = await fetch("/api/admin/senior-signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save.");
      if (body.setupPath) setPrivateLink(window.location.origin + body.setupPath);
      setMessage("Saved."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save."); }
    finally { setBusy(false); }
  }
  function accountCommand(action: string, profileId: string) {
    const reason = window.prompt(action === "reset_browser" ? "Reason for allowing another signup on this person's browser:" : "Reason for this access change:");
    if (reason?.trim()) void command({ action, profileId, reason });
  }
  async function recovery(profileId: string) {
    setBusy(true); setMessage(""); setPrivateLink("");
    try {
      const response = await fetch("/api/admin/recovery/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId, reason: "Main Admin account recovery" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Recovery unavailable.");
      setPrivateLink(`${window.location.origin}/account/recover#${body.token}`);
      setMessage("Recovery link expires in 30 minutes. Share privately with this person.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Recovery unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="control-panel">
    <h2>PG / JR / FMG / Faculty signup</h2>
    <p className="control-copy">Share the common link privately. Signup activates access and voting immediately. Browser limits reduce duplicates but do not verify college identity.</p>
    <form className="committee-form" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void command({ action: "create", editionId: form.get("editionId"), expiresAt: fromISTInput(String(form.get("expiresAt"))), maxAccounts: form.get("maxAccounts") });
    }}>
      <label>Festival<select name="editionId" required>{editions.filter(e => e.status !== "archived").map(e => <option key={e.edition_id} value={e.edition_id}>{e.name}</option>)}</select></label>
      <label>Expiry (IST)<input name="expiresAt" type="datetime-local" required /></label>
      <label>Maximum accounts<input name="maxAccounts" type="number" min={1} max={10000} required /></label>
      <button className="primary-control" disabled={busy || !editions.length}>Create private signup link</button>
    </form>
    {message && <p role="status">{message}</p>}
    {privateLink && <label className="committee-form">Copy this private link now<input readOnly value={privateLink} onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => navigator.clipboard.writeText(privateLink).catch(() => setMessage("Select and copy the link manually."))}>Copy link</button></label>}
    <ul className="committee-list">{links.map(link => <li key={link.id}><div>
      <strong>{link.used_count} / {link.max_accounts} accounts · {link.closed_at ? "Closed" : "Expiry: " + toISTInput(link.expires_at).replace("T", " ") + " IST"}</strong>
      <button type="button" disabled={busy || !!link.closed_at} onClick={() => { if (window.confirm("Close this link to new signups? Existing accounts keep their access.")) void command({ action: "close", linkId: link.id }); }}>Close link</button>
      <details><summary>Regenerate link</summary><p>The previous link stops working. Existing accounts remain available.</p><form className="committee-form" onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        if (window.confirm("Replace the old signup link?")) void command({ action: "regenerate", linkId: link.id, expiresAt: fromISTInput(String(form.get("expiresAt"))), maxAccounts: form.get("maxAccounts") });
      }}><label>Expiry (IST)<input name="expiresAt" type="datetime-local" required defaultValue={toISTInput(link.expires_at)} /></label><label>Total account limit<input name="maxAccounts" type="number" min={Math.max(1, link.used_count)} max={10000} required defaultValue={link.max_accounts} /></label><button disabled={busy}>Regenerate</button></form></details>
      <details><summary>Accounts created ({accounts.filter(account => account.linkId === link.id).length})</summary><ul className="committee-list">{accounts.filter(account => account.linkId === link.id).map(account => <li key={account.id}><div>
        <strong>{account.fullName}</strong><span>{participantLabels[account.category]} · {account.department} · {account.phone} · {account.state}</span>
        <button type="button" disabled={busy} onClick={() => accountCommand(account.state === "active" ? "suspend" : "activate", account.id)}>{account.state === "active" ? "Suspend account" : "Activate account"}</button>
        <button type="button" disabled={busy} onClick={() => accountCommand("reset_browser", account.id)}>Reset browser restriction</button>
        <button type="button" disabled={busy} onClick={() => void recovery(account.id)}>Issue recovery link</button>
      </div></li>)}</ul></details>
    </div></li>)}</ul>
    <details><summary>Shared browser help</summary><form className="committee-form" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void command({ action: "reset_browser", profileId: form.get("profileId"), reason: form.get("reason") });
    }}><label>Registered person<select name="profileId" required defaultValue=""><option value="" disabled>Choose the person who used this browser</option>{browserAccounts.map(account => <option key={account.id} value={account.id}>{account.fullName} · {account.festId}</option>)}</select></label><label>Reason<input name="reason" required maxLength={500} /></label><button disabled={busy || !browserAccounts.length}>Reset browser restriction</button></form></details>
  </section>;
}
