"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { participationTools } from "@/lib/event-participation";
import type { Squad, SquadMember, TeamCommand, TeamWorkspaceData } from "@/lib/team-contracts";
import "./team-workspace.css";

type Command = (command: TeamCommand) => Promise<boolean>;
const identity = (m: SquadMember) => `${m.fullName} · ${m.roll ? "Roll " + m.roll + " · " : ""}${m.batchLabel ?? "Participant"}`;

export function TeamWorkspace({ data, participantView = false }: { data: TeamWorkspaceData; participantView?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [leader, setLeader] = useState("");
  const [batchId, setBatchId] = useState("");
  const tools = participationTools(data.format, data.operatingMethod);
  const performance = tools?.noun === "performances";
  const command: Command = async body => {
    if (pending) return false;
    setPending(true); setMessage("");
    try {
      const response = await fetch(data.staff ? "/api/admin/groups" : "/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save. Try again.");
      setMessage("Saved successfully."); router.refresh(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection lost. Your saved proposal is preserved."); return false; }
    finally { setPending(false); }
  };
  return <div className="team-workspace" aria-busy={pending}>
    {data.locked && <p className="team-status">This roster is locked. You can view it, but no changes can be made.</p>}
    <p className="team-status" role="status" aria-live="polite">{message}</p>
    {data.staff && tools?.leader && !data.locked && <section className="team-panel">
      <p className="team-eyebrow">Start with a leader</p><h2>Appoint {tools.leader === "Captain" ? "a captain" : performance ? "a performance lead" : "a group leader"}</h2>
      <p>The appointed student chooses the name and initial members in My Fest. You review and edit their proposal afterwards.</p>
      <form onSubmit={e => { e.preventDefault(); void command({ action: "appoint", eventId: data.eventId, groupId: null, leaderApplicationId: leader, batchId:data.format==="sport"?batchId:null }); }}>
        {data.format==="sport"&&<label>Team batch<select required value={batchId} onChange={e=>{setBatchId(e.target.value);setLeader("");}} disabled={pending}><option value="">Select batch first</option>{data.batches.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</select></label>}
        <label>{tools.leader}<select required value={leader} onChange={e => setLeader(e.target.value)} disabled={pending||(data.format==="sport"&&!batchId)}><option value="">Choose an approved event participant</option>{data.candidates.filter(c => (data.format!=="sport"||c.batchId===batchId)&&!data.groups.some(g => g.captainId === c.studentId)).map(c => <option value={c.applicationId} key={c.applicationId}>{identity(c)}</option>)}</select></label>
        <button type="submit" disabled={pending || !leader}>Appoint {tools.leader}</button>
      </form>
      {!data.candidates.length && <p>No eligible approved participants yet. <Link href={`/admin/review?event=${data.eventId}`}>Review event registrations →</Link></p>}
    </section>}
    {data.format === "pair" && (!data.staff || participantView) && <PairInvitations key={JSON.stringify(data.invitations) + data.registered} data={data} command={command} pending={pending} />}
    <section className="team-section" aria-label={tools?.label ?? "Participation"}>
      <h2>{data.staff ? "Event " : "My "}{tools?.noun ?? "participation"}</h2>
      {!data.groups.length && <div className="team-panel"><h3>{data.format === "pair" ? "No confirmed pairs yet" : performance ? "No performances yet" : "No squad yet"}</h3><p>{data.format === "pair" ? "A pair appears here after the invited partner accepts. Both registrations must be approved before publication." : performance ? "Register individually, then your coordinator appoints a performance lead. The lead proposes the name and members for approval. For a solo entry, select only yourself." : data.staff ? "Appoint a captain or group leader above. Their proposal will appear here." : "Your coordinator will appoint a captain or group leader. Register for the event to be considered."}</p></div>}
      {data.groups.map(group => <SquadCard key={`${group.id}:${group.version}`} group={group} data={data} command={command} pending={pending} />)}
    </section>
    <p className="team-footnote">{data.format === "pair" ? "Pending invitations never reserve a partner. Only one mutually confirmed pair is allowed per event." : performance ? "Each student can join one final performance per event. Only the coordinator-approved roster is final; this does not publish stage results." : "Squad proposals do not reserve players. Only the coordinator-published roster is final."}</p>
  </div>;
}

function SquadCard({ group, data, command, pending }: { group: Squad; data: TeamWorkspaceData; command: Command; pending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [replacement, setReplacement] = useState("");
  const tools = participationTools(data.format, data.operatingMethod);
  const performance = tools?.noun === "performances";
  const ownLeader = group.captainId === data.userId;
  const editable = !data.locked && tools?.leader && ((ownLeader && group.state === "draft" && group.proposalState !== "submitted") || (data.staff && group.ready));
  const leader = [...group.members, ...data.candidates].find(m => m.studentId === group.captainId);
  const status = group.state === "published" ? "Published · official roster" : !group.ready ? "Awaiting leader proposal" : group.proposalState === "submitted" ? "Under coordinator review" : group.proposalState === "changes_requested" ? "Changes requested" : "Draft proposal";
  return <article className="team-panel">
    <span className="team-badge">{status}</span><h3>{group.name}</h3>
    {group.batchId&&<p><strong>Batch:</strong> {data.batches.find(b=>b.id===group.batchId)?.label??"Assigned batch"}</p>}
    {tools?.leader && <p><strong>{tools.leader}:</strong> {leader?.fullName ?? "Not assigned — coordinator appointment needed"}</p>}
    {group.note && <p className="team-status"><strong>Coordinator note:</strong> {group.note}</p>}
    <ul className="team-members">{group.members.map(m => <li key={m.applicationId}><strong>{m.fullName}{m.studentId === group.captainId ? ` · ${tools?.leader ?? ""}` : ""}</strong><small>{m.roll ? `Roll ${m.roll} · ` : ""}{m.batchLabel ?? "Participant"}{m.reviewState && m.reviewState !== "approved" ? ` · Registration ${m.reviewState}` : ""}</small></li>)}</ul>
    {!group.members.length && <p>The appointed leader has not proposed members yet.</p>}
    {editable && <button type="button" className="team-secondary" disabled={pending} onClick={() => setEditing(!editing)}>{editing ? "Close editor" : group.ready ? "Edit proposal / roster" : "Choose name & members"}</button>}
    {editing && editable && <SquadEditor group={group} data={data} command={command} pending={pending} />}
    {ownLeader && !data.staff && !data.locked && group.ready && group.state === "draft" && group.proposalState !== "submitted" && <button type="button" disabled={pending} onClick={() => void command({ action: "submit", eventId: data.eventId, groupId: group.id, version: group.version })}>Submit for coordinator approval</button>}
    {ownLeader && data.staff && !data.locked && group.ready && group.state === "draft" && group.proposalState !== "submitted" && <button type="button" disabled={pending} onClick={() => void command({ action: "submit", eventId: data.eventId, groupId: group.id, version: group.version })}>Submit leader proposal</button>}
    {data.staff && !data.locked && <>
      {group.proposalState === "submitted" && group.state === "draft" && <button type="button" disabled={pending} onClick={() => { if (confirm(`Publish ${group.name} as the official roster?`)) void command({ action: "publish", eventId: data.eventId, groupId: group.id, version: group.version }); }}>Approve & publish {tools?.noun === "pairs" ? "pair" : performance ? "performance roster" : "roster"}</button>}
      {(group.ready || !group.captainId) && <details className="team-review"><summary>Review & correction options</summary>
        <label>Reason / instructions<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={pending} /></label>
        {group.state === "draft" && group.ready && <button type="button" className="team-secondary" disabled={pending || !reason.trim()} onClick={() => void command({ action: "return", eventId: data.eventId, groupId: group.id, version: group.version, reason })}>{data.format === "pair" ? "Add review instructions" : "Return with instructions"}</button>}
        {data.format === "pair" && <button type="button" className="team-danger" disabled={pending || !reason.trim()} onClick={() => { if (confirm("Release both partners? Any new pairing will require a fresh invitation. Existing result snapshots will not change.")) void command({ action: "dissolve", eventId: data.eventId, groupId: group.id, version: group.version, reason }); }}>Release pair for fresh invitations</button>}
      </details>}
      {tools?.leader && <details className="team-review"><summary>{group.captainId ? `Change ${tools.leader}` : `Appoint ${tools.leader}`}</summary><form onSubmit={e => { e.preventDefault(); void command({ action: "appoint", eventId: data.eventId, groupId: group.id, leaderApplicationId: replacement, batchId:group.batchId }); }}><label>{tools.leader}<select required value={replacement} onChange={e => setReplacement(e.target.value)} disabled={pending}><option value="">Choose approved participant</option>{data.candidates.filter(c => (!data.batchRestricted || c.batchId === group.batchId) && (group.state !== "published" || group.members.some(m => m.applicationId === c.applicationId))).map(c => <option key={c.applicationId} value={c.applicationId}>{identity(c)}</option>)}</select></label><button type="submit" disabled={pending || !replacement}>Confirm appointment</button></form></details>}
    </>}
  </article>;
}

function SquadEditor({ group, data, command, pending }: { group: Squad; data: TeamWorkspaceData; command: Command; pending: boolean }) {
  const performance = data.format === "group" && data.operatingMethod === "programme";
  const [name, setName] = useState(group.ready ? group.name : "");
  const [selected, setSelected] = useState(group.members.length ? group.members.map(m => m.applicationId) : data.candidates.filter(m => m.studentId === group.captainId).map(m => m.applicationId));
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const members = [...new Map([...data.candidates, ...group.members].map(m => [m.applicationId, m])).values()].filter(m => !data.batchRestricted || m.batchId === group.batchId);
  const visible = members.filter(m => identity(m).toLowerCase().includes(query.toLowerCase()));
  return <form className="team-editor" onSubmit={e => { e.preventDefault(); void command({ action: "save", eventId: data.eventId, groupId: group.id, version: group.version, name, applicationIds: selected, reason }); }}>
    <label>{performance ? "Performance" : data.format === "group" ? "Group" : "Team"} name<input value={name} required maxLength={160} disabled={pending} onChange={e => setName(e.target.value)} placeholder="Choose your official name" /></label>
    <p>{selected.length} selected · {data.minSize}–{data.maxSize} members{data.batchRestricted ? " · Same batch" : ""}</p>
    <label>Find approved event participants<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, roll or batch" /></label>
    <fieldset className="team-candidates"><legend>Proposed members</legend>{visible.slice(0,100).map(m => <label key={m.applicationId} className="team-check"><input type="checkbox" checked={selected.includes(m.applicationId)} disabled={pending || m.studentId === group.captainId} onChange={() => setSelected(ids => ids.includes(m.applicationId) ? ids.filter(id => id !== m.applicationId) : [...ids,m.applicationId])} /><span><strong>{m.fullName}</strong><small>{m.roll ? `Roll ${m.roll} · ` : ""}{m.batchLabel ?? "Participant"}{m.studentId === group.captainId ? " · Appointed leader" : ""}</small></span></label>)}</fieldset>
    {visible.length > 100 && <p>Showing 100 matches. Narrow your search.</p>}
    {performance && <p>For solo, keep only yourself selected. For duo or group, include all performers within the event size limits.</p>}
    {!visible.length && <p>No matching approved participants. Missing participants must register and complete event review first.</p>}
    {group.state === "published" && <label>Correction reason<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={pending} /></label>}
    <button type="submit" disabled={pending || !selected.length || selected.length > data.maxSize}>{pending ? "Saving…" : group.state === "published" ? "Save official roster correction" : "Save proposal"}</button>
    <p className="team-footnote">Missing a participant? Share the event registration link. Nobody can answer registration questions on another student&apos;s behalf.</p>
  </form>;
}

function PairInvitations({ data, command, pending }: { data: TeamWorkspaceData; command: Command; pending: boolean }) {
  const [batchId, setBatchId] = useState("");
  const [roll, setRoll] = useState("");
  const [partner, setPartner] = useState<{ id: string; fullName: string; roll: string; batchLabel: string } | null>(null);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string,string>>({});
  const accepted = data.invitations.some(i => i.state === "accepted");
  async function lookup() {
    if (finding) return;
    setFinding(true); setError(""); setPartner(null);
    try {
      const response = await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lookup", eventId: data.eventId, batchId, roll }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not find partner.");
      if (!result.data) throw new Error("No eligible verified student found. Check exact roll and batch.");
      setPartner(result.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not find partner."); }
    finally { setFinding(false); }
  }
  function questions(prefix: string) {
    return !data.registered && data.questions.length > 0 ? <fieldset><legend>Complete your event registration</legend>{data.questions.map(q => <label key={q.key} htmlFor={`${prefix}-${q.key}`}>{q.label}{q.required ? " *" : ""}{q.type === "select" ? <select id={`${prefix}-${q.key}`} required={q.required} value={answers[q.key] ?? ""} onChange={e => setAnswers(a => ({ ...a,[q.key]:e.target.value }))} disabled={pending}><option value="">Choose an option</option>{q.options?.map(o => <option key={o}>{o}</option>)}</select> : <input id={`${prefix}-${q.key}`} required={q.required} maxLength={500} value={answers[q.key] ?? ""} onChange={e => setAnswers(a => ({ ...a,[q.key]:e.target.value }))} disabled={pending} />}</label>)}</fieldset> : null;
  }
  return <section className="team-section"><h2>Partner invitations</h2>
    {!data.invitations.length && <p>No pending partner invitations.</p>}
    {data.invitations.map(i => <article className="team-panel" key={i.id}><span className="team-badge">{i.state === "accepted" ? "Both partners confirmed" : i.incoming ? "Invitation received" : "Waiting for partner"}</span><h3>{i.partnerName}</h3><p>{i.partnerRoll ? `Roll ${i.partnerRoll} · ` : ""}{i.partnerBatch ?? "Participant"}</p>
      {!data.locked && i.state === "pending" && (i.incoming ? <><form onSubmit={e => { e.preventDefault(); void command({ action: "accept", eventId: data.eventId, invitationId: i.id, answers }); }}>{questions(i.id)}<p>Accepting confirms your partner choice and event rules. Your registration is created here if needed; organiser approval is still required.</p><button type="submit" disabled={pending}>Accept & confirm pair</button></form><button type="button" className="team-secondary" disabled={pending} onClick={() => void command({ action: "decline", eventId: data.eventId, invitationId: i.id })}>Decline invitation</button></> : <button type="button" className="team-secondary" disabled={pending} onClick={() => void command({ action: "cancel", eventId: data.eventId, invitationId: i.id })}>Cancel invitation</button>)}
      {!data.locked && i.state === "accepted" && data.groups.find(g => g.id === i.groupId)?.state === "draft" && <button type="button" className="team-danger" disabled={pending} onClick={() => { if (confirm("Leave this pair? Both students can then choose a new partner through a fresh invitation.")) void command({ action: "leave", eventId: data.eventId, invitationId: i.id }); }}>Leave pair</button>}
    </article>)}
    {!accepted && !data.locked && <div className="team-panel"><h3>Invite your partner</h3><p>Find your partner using their exact batch and college roll. An invitation does not reserve them.</p>
      <form onSubmit={e => { e.preventDefault(); void lookup(); }}><label>Partner batch<select required value={batchId} onChange={e => { setBatchId(e.target.value); setPartner(null); }} disabled={finding}><option value="">Choose batch</option>{data.batches.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label><label>Partner roll number<input required maxLength={30} value={roll} onChange={e => { setRoll(e.target.value); setPartner(null); }} disabled={finding} /></label><button type="submit" className="team-secondary" disabled={finding || pending}>{finding ? "Finding…" : "Find partner"}</button></form>
      {error && <p role="status">{error}</p>}
      {partner && <form onSubmit={e => { e.preventDefault(); void command({ action: "invite", eventId: data.eventId, partnerId: partner.id, answers }); }}><p><strong>{partner.fullName}</strong> · Roll {partner.roll} · {partner.batchLabel}</p>{questions("invite")}<p>Sending confirms that you want to pair with this student and agree to the event rules. They must accept before a pair is formed.</p><button type="submit" disabled={pending}>Confirm & send invitation</button></form>}
    </div>}
  </section>;
}
