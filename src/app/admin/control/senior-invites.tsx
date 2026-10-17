"use client";
import { useEffect, useState } from "react";
type Invite = { id:string; full_name:string; phone:string; category:string; department:string; profile_id:string|null; expires_at:string; revoked_at:string|null; used_at:string|null };
export function SeniorInvites({editions}:{editions:{edition_id:string;name:string;status:string}[]}) {
 const [invites,setInvites]=useState<Invite[]>([]),[pending,setPending]=useState(false),[message,setMessage]=useState(""),[link,setLink]=useState("");
 const [nowMs] = useState(() => Date.now());
 async function load() { const r=await fetch("/api/admin/invites",{cache:"no-store"}); const b=await r.json(); if(!r.ok) throw new Error(b.error); setInvites(b.invites); }
 useEffect(()=>{
  let ignore = false;
  fetch("/api/admin/invites",{cache:"no-store"})
   .then(r=>r.json())
   .then(b=>{ if(!ignore && b.invites) setInvites(b.invites); })
   .catch(()=>{ if(!ignore) setMessage("Unable to load invitations."); });
  return () => { ignore = true; };
 },[]);
 async function command(body:Record<string,unknown>) {
  setPending(true);setMessage("");setLink("");
  try { const r=await fetch("/api/admin/invites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const b=await r.json(); if(!r.ok) throw new Error(b.error);
   if(b.setupPath) setLink(window.location.origin+b.setupPath);
   setMessage("Saved. Share setup links only with the verified recipient.");await load();
  } catch(e) {setMessage(e instanceof Error?e.message:"Request failed.");} finally {setPending(false);}
 }
 async function recovery(profileId:string) {
  setPending(true);setLink("");
  try {const r=await fetch("/api/admin/recovery/issue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profileId,reason:"Committee verified senior account recovery"})});const b=await r.json();if(!r.ok)throw new Error("Recovery unavailable.");
   setLink(window.location.origin+"/account/recover#"+b.token);setMessage("Recovery link expires in 30 minutes. Share privately.");
  } catch(e){setMessage(e instanceof Error?e.message:"Recovery unavailable.");} finally {setPending(false);}
 }
 return <section className="control-panel">
  <h2>PG / JR / Faculty accounts</h2><p className="control-copy">Verify identity and mobile first. An invite activates participation, not organiser permissions.</p>
  <form className="committee-form" onSubmit={e=>{e.preventDefault();void command({action:"issue",...Object.fromEntries(new FormData(e.currentTarget))});}}>
   <label>Festival<select name="editionId" required>{editions.filter(e=>e.status!=="archived").map(e=><option key={e.edition_id} value={e.edition_id}>{e.name}</option>)}</select></label>
   <label>Full name<input name="fullName" required maxLength={100}/></label>
   <label>Verified mobile<input name="phone" type="tel" required maxLength={20}/></label>
   <label>Category<select name="category"><option value="pg">PG</option><option value="jr">JR</option><option value="faculty">Faculty</option></select></label>
   <label>Department<input name="department" required maxLength={120}/></label>
   <button className="primary-control" disabled={pending || !editions.length}>Create 48-hour invite</button>
  </form>
  {message && <p role="status">{message}</p>}
  {link && <label className="committee-form">Private one-use link<input readOnly value={link} onFocus={e=>e.currentTarget.select()}/><button type="button" onClick={()=>navigator.clipboard.writeText(link).catch(()=>setMessage("Select and copy the link manually."))}>Copy link</button></label>}
  <ul className="committee-list">{invites.map(i=><li key={i.id}><div><strong>{i.full_name}</strong><span>{i.category.toUpperCase()} · {i.department} · {i.phone}</span><small>{i.profile_id?"Active account":i.revoked_at?"Revoked":nowMs>0&&new Date(i.expires_at).getTime()<nowMs?"Expired":i.used_at?"Setup attempted":"Awaiting setup"}</small>
   {i.profile_id?<details><summary>Account help / verified changes</summary><form className="committee-form" onSubmit={e=>{e.preventDefault();if(window.confirm("Have you verified these account changes with the person?"))void command({action:"update",profileId:i.profile_id,...Object.fromEntries(new FormData(e.currentTarget))});}}>
    <label>Mobile<input name="phone" defaultValue={i.phone} type="tel" required/></label><label>Category<select name="category" defaultValue={i.category}><option value="pg">PG</option><option value="jr">JR</option><option value="faculty">Faculty</option></select></label><label>Department<input name="department" defaultValue={i.department} required maxLength={120}/></label><button disabled={pending}>Save verified changes</button>
   </form><button type="button" disabled={pending} onClick={()=>{if(window.confirm("Have you verified this recovery request?"))void recovery(i.profile_id!);}}>Issue password reset link</button></details>:<div><button type="button" disabled={pending} onClick={()=>void command({action:"reissue",inviteId:i.id})}>Reissue</button>{" "}<button type="button" disabled={pending || !!i.revoked_at} onClick={()=>void command({action:"revoke",inviteId:i.id})}>Revoke</button></div>}
  </div></li>)}</ul>
 </section>;
}
