"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export type Candidate = { applicationId: string; studentId: string; fullName: string; batchId: string; batchLabel: string; courseLabel: string | null; roll: string };
export type Team = { group_id:string; name:string; state:string; captain_id:string|null; batch_id:string|null; members:Candidate[] };

export function GroupComposer({eventId,format,batchRestricted,minSize,maxSize,candidates,teams=[]}:{
  eventId:string;format:string;batchRestricted:boolean;minSize:number|null;maxSize:number|null;candidates:Candidate[];teams?:Team[];
}) {
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]);
  const [name,setName]=useState("");
  const [captain,setCaptain]=useState("");
  const [query,setQuery]=useState("");
  const [draft,setDraft]=useState<Team|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  const confirmation=useRef<HTMLDialogElement>(null);
  const existingIds=new Set(draft?.members.map(m=>m.applicationId)??[]);
  const available=useMemo(()=>[...new Map([...candidates,...(draft?.members??[])].map(c=>[c.applicationId,c])).values()],[candidates,draft]);
  const chosen=available.filter(c=>selected.includes(c.applicationId));
  const visible=available.filter(c=>(c.fullName+" "+c.roll+" "+c.batchLabel).toLowerCase().includes(query.toLowerCase()));
  const selectedBatch=chosen[0]?.batchId??null;
  function toggle(candidate:Candidate){
    if(existingIds.has(candidate.applicationId))return;
    if(batchRestricted&&selectedBatch&&selectedBatch!==candidate.batchId&&!selected.includes(candidate.applicationId)){setMessage("All members must belong to the same batch.");return;}
    setSelected(v=>v.includes(candidate.applicationId)?v.filter(id=>id!==candidate.applicationId):[...v,candidate.applicationId]);
    if(captain===candidate.studentId)setCaptain("");
    setMessage(null);
  }
  function review(){
    if(!name.trim()||chosen.length<(minSize??1)||(maxSize&&chosen.length>maxSize)){setMessage("Enter a team name and choose between "+(minSize??1)+" and "+(maxSize??"the allowed number of")+" members.");return;}
    if(format==="sport"&&!chosen.some(c=>c.studentId===captain)){setMessage("Choose a captain from selected members.");return;}
    confirmation.current?.showModal();
  }
  async function command(body:unknown){
    const response=await fetch("/api/admin/groups",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not publish team.");return result;
  }
  async function publish(){
    if(pending)return;setPending(true);setMessage(null);
    try{
      if(draft){
        for(const candidate of chosen.filter(c=>!existingIds.has(c.applicationId)))await command({action:"add",groupId:draft.group_id,applicationId:candidate.applicationId});
        await command({action:"publish",groupId:draft.group_id,captainId:format==="sport"?captain:null});
      }else await command({action:"publishTeam",eventId,name:name.trim(),batchId:batchRestricted?selectedBatch:null,applicationIds:selected,captainId:format==="sport"?captain:null});
      setMessage("Team published. Its members are now on the final roster.");setSelected([]);setName("");setCaptain("");setDraft(null);router.refresh();
    }catch(error){setMessage((error instanceof Error?error.message:"Could not publish.")+(draft?" Reopen this saved draft to continue; existing members are preserved.":" Your choices are preserved; retry when ready."));router.refresh();}
    finally{confirmation.current?.close();setPending(false);}
  }
  function resume(team:Team){setDraft(team);setName(team.name);setSelected(team.members.map(m=>m.applicationId));setCaptain(team.captain_id??"");setMessage(null);}
  return <>
    <section className="portal-section"><h2>Event teams</h2><div className="portal-event-grid">{teams.map(team=><article className="portal-event" key={team.group_id}>
      <span className="portal-badge">{team.state}</span><h3>{team.name}</h3><p>{team.members.length} members</p>
      <details><summary>View members & captain</summary><ul>{team.members.map(m=><li key={m.applicationId}><strong>{m.fullName}{m.studentId===team.captain_id?" · Captain":""}</strong><p>Roll {m.roll||"—"} · {m.batchLabel}</p></li>)}</ul></details>
      {team.state==="draft"&&<button className="portal-secondary" type="button" onClick={()=>resume(team)} disabled={pending}>Continue draft →</button>}
    </article>)}</div>{!teams.length&&<p>No teams published yet. Choose approved participants below.</p>}</section>
    <section className="portal-form portal-section">
      <h2>{draft?"Continue "+draft.name:"Build a team"}</h2><p>{minSize??1} minimum{maxSize?" · "+maxSize+" maximum":""}{batchRestricted?" · Same batch required":""}</p>
      <label>Team name<input value={name} disabled={pending||Boolean(draft)} maxLength={160} onChange={e=>setName(e.target.value)} placeholder="Official team name"/></label>
      <label>Find approved students<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, roll or batch"/></label>
      <p><strong>{chosen.length}</strong> members selected</p>
      <div className="group-candidates">{visible.slice(0,100).map(c=><label className="portal-check" key={c.applicationId}><input type="checkbox" checked={selected.includes(c.applicationId)} disabled={pending||existingIds.has(c.applicationId)} onChange={()=>toggle(c)}/><span><strong>{c.fullName}</strong><small>Roll {c.roll||"—"} · {c.batchLabel}{existingIds.has(c.applicationId)?" · already in draft":""}</small></span></label>)}</div>
      {visible.length>100&&<p>Showing 100 matches. Search by name or batch to narrow the list.</p>}
      {!visible.length&&<p>No approved candidates match. Approve requests in Participants first.</p>}
      {format==="sport"&&<label>Captain<select value={captain} onChange={e=>setCaptain(e.target.value)} disabled={pending}><option value="">Choose from selected members</option>{chosen.map(c=><option key={c.studentId} value={c.studentId}>{c.fullName}</option>)}</select></label>}
      <div className="portal-form-actions"><button className="portal-primary" type="button" onClick={review} disabled={pending||!chosen.length}>Review team →</button>{draft&&<button type="button" className="portal-secondary" onClick={()=>{setDraft(null);setSelected([]);setName("");setCaptain("");}} disabled={pending}>New team instead</button>}</div>
      {message&&<p role="status" className="portal-message">{message}</p>}
    </section>
    <dialog className="portal-dialog" ref={confirmation}><h2>Publish {name}?</h2><p>These {chosen.length} participants will join the final roster.</p><ul>{chosen.map(c=><li key={c.applicationId}>{c.fullName} · {c.batchLabel}{captain===c.studentId?" · Captain":""}</li>)}</ul><div className="portal-form-actions"><button type="button" className="portal-secondary" onClick={()=>confirmation.current?.close()} disabled={pending}>Back to edit</button><button type="button" className="portal-primary" onClick={()=>void publish()} disabled={pending}>{pending?"Publishing…":"Publish team"}</button></div></dialog>
  </>;
}
