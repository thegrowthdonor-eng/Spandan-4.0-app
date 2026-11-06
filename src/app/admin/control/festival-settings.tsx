"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toIstInput, fromIstInput } from "@/lib/event-setup";
type Edition = { edition_id:string; name:string; registration_opens_at?:string|null; registration_closes_at?:string|null };
export function FestivalSettings({editions}:{editions:Edition[]}) {
  const router=useRouter();
  const [editionId,setEditionId]=useState(editions[0]?.edition_id??"");
  const [opens,setOpens]=useState(toIstInput(editions[0]?.registration_opens_at??null));
  const [closes,setCloses]=useState(toIstInput(editions[0]?.registration_closes_at??null));
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState("");
  async function save(event:React.FormEvent){
    event.preventDefault();if(pending)return;
    if(!opens||!closes||closes<=opens){setMessage("Closing time must be after opening time.");return;}
    setPending(true);
    try{
      const response=await fetch("/api/admin/festival",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"setRegistrationWindow",editionId,applicationOpensAt:fromIstInput(opens),applicationClosesAt:fromIstInput(closes)})});
      const result=await response.json();setMessage(response.ok?"Registration window saved for all events.":result.error??"Unable to save.");if(response.ok)router.refresh();
    }catch{setMessage("Connection failed. Your dates are preserved; try again.");}finally{setPending(false);}
  }
  return <form className="portal-form" onSubmit={save}><h2>Festival registration window</h2><p>These dates apply to every event. Event publishing and registration dates are separate controls.</p>
    <label>Festival edition<select value={editionId} onChange={e=>{const edition=editions.find(v=>v.edition_id===e.target.value);setEditionId(e.target.value);setOpens(toIstInput(edition?.registration_opens_at??null));setCloses(toIstInput(edition?.registration_closes_at??null));}}>{editions.map(e=><option key={e.edition_id} value={e.edition_id}>{e.name}</option>)}</select></label>
    <label>Registration opens (IST)<input type="datetime-local" value={opens} onChange={e=>setOpens(e.target.value)} required/></label>
    <label>Registration closes (IST)<input type="datetime-local" value={closes} onChange={e=>setCloses(e.target.value)} required/></label>
    <button className="portal-primary" disabled={pending||!editionId}>{pending?"Saving…":"Save registration window"}</button>{message&&<p className="portal-message" role="status">{message}</p>}
  </form>;
}
