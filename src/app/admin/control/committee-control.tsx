"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = { profile_id: string; full_name: string; fest_id: string; batch_label: string };
type Member = { assignment_id: string; profile_id: string; full_name: string; fest_id: string; batch_label: string; role: "main_admin" | "treasurer" | "event_head" | "notice_publisher"; event_id: string | null; event_title: string | null; granted_at: string };
type EventRow = { event_id: string; title: string; category: string; state: string };
const roleLabels = { main_admin: "Main Admin", treasurer: "Treasurer", event_head: "Event Head", notice_publisher: "Notice Publisher" };

export function CommitteeControl({ candidates, members, events }: { candidates: Candidate[]; members: Member[]; events: EventRow[] }) {
  const router = useRouter(); const [profileId, setProfileId] = useState(""); const [role, setRole] = useState<Member["role"]>("treasurer"); const [eventId, setEventId] = useState(""); const [message, setMessage] = useState<string | null>(null); const [pending, setPending] = useState(false);
  const selected = useMemo(() => candidates.find((candidate) => candidate.profile_id === profileId), [candidates, profileId]);
  async function command(body: Record<string, unknown>) { setPending(true); setMessage(null); try { const response = await fetch("/api/admin/committee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json() as { error?: string }; if (!response.ok) { setMessage(result.error ?? "Unable to update committee access."); return; } setMessage("Committee access updated."); router.refresh(); } catch { setMessage("Unable to update committee access."); } finally { setPending(false); } }
  return <div className="control-grid">
    <section className="control-panel"><div><p className="eyebrow">Committee access</p><h2>Assign a role</h2><p className="control-copy">Only active participant accounts appear here. Every change is recorded.</p></div>
      {candidates.length ? <form onSubmit={(event) => { event.preventDefault(); void command({ action: "assign", profileId, role, eventId: role === "event_head" ? eventId || null : null }); }} className="committee-form">
        <label>Committee member<select required value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">Choose active participant</option>{candidates.map((candidate) => <option key={candidate.profile_id} value={candidate.profile_id}>{candidate.full_name} · {candidate.batch_label} · {candidate.fest_id}</option>)}</select></label>
        <label>Responsibility<select value={role} onChange={(event) => setRole(event.target.value as Member["role"])}><option value="treasurer">Treasurer — registration verification</option><option value="notice_publisher">Notice Publisher — official notices</option><option value="event_head">Event Head — assigned event only</option><option value="main_admin">Main Admin — full organiser control</option></select></label>
        {role === "event_head" ? <label>Assigned event<select required value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="">Choose one event</option>{events.map((festivalEvent) => <option key={festivalEvent.event_id} value={festivalEvent.event_id}>{festivalEvent.title} · {festivalEvent.state}</option>)}</select>{!events.length ? <small>Create an event first, then assign its Event Head.</small> : null}</label> : null}
        <button className="primary-control" disabled={pending || !profileId || (role === "event_head" && !eventId)}>{pending ? "Updating…" : `Give ${roleLabels[role]} access`}</button>
      </form> : <p className="empty-control">No active accounts yet. Activate a registered student first; then their committee responsibility can be assigned here.</p>}
      {message ? <p className="control-message" role="status">{message}</p> : null}
    </section>
    <section className="control-panel"><div><p className="eyebrow">Live access</p><h2>Current committee</h2><p className="control-copy">Revoking access removes the workspace immediately. The final Main Admin cannot be removed.</p></div>
      {members.length ? <ul className="committee-list">{members.map((member) => <li key={member.assignment_id}><div><strong>{member.full_name}</strong><span>{roleLabels[member.role]}{member.event_title ? ` · ${member.event_title}` : ""}</span><small>{member.batch_label} · {member.fest_id}</small></div><button type="button" className="revoke-button" disabled={pending} onClick={() => void command({ action: "revoke", assignmentId: member.assignment_id })}>Remove</button></li>)}</ul> : <p className="empty-control">No committee roles assigned yet. Your initial Main Admin assignment will appear after the first refresh.</p>}
    </section>
    {selected ? <p className="selection-hint">Giving access to <strong>{selected.full_name}</strong>. They keep their existing participant login; committee access does not require a separate account.</p> : null}
  </div>;
}
