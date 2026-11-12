"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eventCategoryLabels } from "@/lib/event-categories";

type Candidate = { profile_id: string; full_name: string; fest_id: string; batch_label: string };
type StaffRole = "main_admin" | "treasurer" | "event_editor" | "event_head" | "notice_publisher" | "event_coordinator";
type Member = { assignment_id: string; profile_id: string; full_name: string; fest_id: string; batch_label: string; role: StaffRole; event_id: string | null; event_title: string | null; event_category: "sport" | "cultural" | "literary" | "creative" | "other" | null; granted_at: string };
type EventRow = { event_id: string; title: string; category: string; state: string };
type AssignmentRecord = { id: string; profile_id: string; role: StaffRole; event_id: string | null; event_category: Member["event_category"]; granted_at: string };
const roleLabels: Record<StaffRole, string> = { main_admin: "Main Admin", treasurer: "Treasurer", event_editor: "Event Editor", event_coordinator: "Event Coordinator", event_head: "Event Head", notice_publisher: "Notice Publisher" };
const categoryLabels = eventCategoryLabels;

export function CommitteeControl({ candidates, members, events }: { candidates: Candidate[]; members: Member[]; events: EventRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [prevMembers, setPrevMembers] = useState(members);
  const [memberList, setMemberList] = useState(members);
  if (members !== prevMembers) {
    setPrevMembers(members);
    setMemberList(members);
  }
  const [profileId, setProfileId] = useState("");
  const [role, setRole] = useState<StaffRole>("treasurer");
  const [eventId, setEventId] = useState("");
  const [eventCategory, setEventCategory] = useState<keyof typeof categoryLabels>("sport");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const visibleCandidates = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    return candidates.filter((candidate) => !query || `${candidate.full_name} ${candidate.fest_id}`.toLowerCase().includes(query));
  }, [candidateSearch, candidates]);
  const visibleEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    return events.filter((event) => !query || `${event.title} ${event.category} ${event.state}`.toLowerCase().includes(query));
  }, [eventSearch, events]);
  const selected = useMemo(() => candidates.find((candidate) => candidate.profile_id === profileId), [candidates, profileId]);

  async function command(body: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/committee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { ok?: boolean; error?: string; assignment?: AssignmentRecord; revokedAssignmentId?: string };
      if (!response.ok) return setMessage(result.error ?? "Unable to update committee access.");
      if (body.action === "assign" && result.assignment) {
        const assignment = result.assignment;
        const candidate = candidates.find((item) => item.profile_id === assignment.profile_id);
        const assignedEvent = assignment.event_id ? events.find((item) => item.event_id === assignment.event_id) : undefined;
        const nextMember: Member = {
          assignment_id: assignment.id,
          profile_id: assignment.profile_id,
          full_name: candidate?.full_name ?? "Committee member",
          fest_id: candidate?.fest_id ?? "",
          batch_label: candidate?.batch_label ?? "2023",
          role: assignment.role,
          event_id: assignment.event_id ?? null,
          event_title: assignedEvent?.title ?? null,
          event_category: assignment.event_category ?? null,
          granted_at: assignment.granted_at,
        };
        setMemberList((prev) =>
          [...prev.filter((item) => item.assignment_id !== nextMember.assignment_id), nextMember].sort((a, b) =>
            a.full_name.localeCompare(b.full_name) ||
            a.role.localeCompare(b.role) ||
            (a.event_title ?? "").localeCompare(b.event_title ?? "") ||
            (a.event_category ?? "").localeCompare(b.event_category ?? "")
          )
        );
      } else if (body.action === "revoke") {
        const revokedId = result.revokedAssignmentId ?? (typeof body.assignmentId === "string" ? body.assignmentId : "");
        if (revokedId) setMemberList((prev) => prev.filter((item) => item.assignment_id !== revokedId));
      }
      setMessage("Committee access updated.");
      startTransition(() => { router.refresh(); });
    } catch {
      setMessage("Unable to update committee access.");
    } finally {
      setPending(false);
    }
  }

  return <div className="control-grid">
    <section className="control-panel">
      <div><p className="eyebrow">App controllers · 2023 batch</p><h2>Assign a role</h2><p className="control-copy">Only active, verified 2023-batch accounts can receive app controls. Search by name or Fest ID.</p></div>
      {candidates.length ? <form onSubmit={(event) => { event.preventDefault(); void command({ action: "assign", profileId, role, eventId: role === "event_coordinator" ? eventId || null : null, eventCategory: role === "event_head" ? eventCategory : null }); }} className="committee-form">
        <label>Search controller candidate<input type="search" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Name or Fest ID" /></label>
        <label>Committee member<select required value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">Choose verified 2023 student</option>{visibleCandidates.map((candidate) => <option key={candidate.profile_id} value={candidate.profile_id}>{candidate.full_name} · {candidate.fest_id}</option>)}</select></label>
        <label>Responsibility<select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}><option value="event_editor">Event Editor — create and edit own events</option><option value="event_coordinator">Event Coordinator — assigned event operations</option><option value="event_head">Event Head — all events in one category</option><option value="treasurer">Treasurer — registration verification</option><option value="notice_publisher">Notice Publisher — official notices</option><option value="main_admin">Main Admin — full organiser control</option></select></label>
        {role === "event_coordinator" ? <><label>Search event<input type="search" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Title, category or status" /></label><label>Assigned event<select required value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="">Choose one event</option>{visibleEvents.map((festivalEvent) => <option key={festivalEvent.event_id} value={festivalEvent.event_id}>{festivalEvent.title} · {festivalEvent.state}</option>)}</select></label></> : null}
        {role === "event_head" ? <label>Managed category<select value={eventCategory} onChange={(event) => setEventCategory(event.target.value as keyof typeof categoryLabels)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
        <button className="primary-control" disabled={pending || !profileId || (role === "event_coordinator" && !eventId)}>{pending ? "Updating…" : `Give ${roleLabels[role]} access`}</button>
      </form> : <p className="empty-control">No active 2023-batch account is available. Activate the student first, then assign their responsibility here.</p>}
      {message ? <p className="control-message" role="status">{message}</p> : null}
    </section>
    <section className="control-panel"><div><p className="eyebrow">Live access</p><h2>Current app controllers</h2><p className="control-copy">Remove access when a responsibility ends. The final Main Admin is protected.</p></div>
      {memberList.length ? <ul className="committee-list">{memberList.map((member) => <li key={member.assignment_id}><div><strong>{member.full_name}</strong><span>{roleLabels[member.role]}{member.event_title ? ` · ${member.event_title}` : member.event_category ? ` · ${categoryLabels[member.event_category]}` : ""}</span><small>{member.batch_label} · {member.fest_id}</small></div><button type="button" className="revoke-button" disabled={pending} onClick={() => { if (window.confirm("Remove "+roleLabels[member.role]+" access from "+member.full_name+"?")) void command({ action: "revoke", assignmentId: member.assignment_id }); }}>Remove access</button></li>)}</ul> : <p className="empty-control">No committee roles assigned yet.</p>}
    </section>
    {selected ? <p className="selection-hint">Giving access to <strong>{selected.full_name}</strong>. Staff responsibilities are available only to active, verified 2023-batch students.</p> : null}
  </div>;
}
