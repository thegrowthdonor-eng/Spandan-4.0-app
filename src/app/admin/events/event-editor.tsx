"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImageUploadWidget } from "@/components/admin/image-upload-widget";
import { eventDetailsSchema, publicationMissing, toIstInput, fromIstInput, type EventDetails } from "@/lib/event-setup";

export type EventData = {
  structure_locked: boolean;
  event_id: string; title: string; category: EventDetails["category"]; format: EventDetails["format"];
  score_template: EventDetails["scoreTemplate"]; state: string; summary: string; rules_markdown: string;
  venue: string | null; application_capacity: number | null; waitlist_enabled: boolean;
  reporting_at: string | null; starts_at: string | null; ends_at: string | null; roster_lock_at: string | null;
  eligibility: Record<string, unknown>; application_questions: EventDetails["applicationQuestions"];
  group_min_size: number | null; group_max_size: number | null; batch_restricted: boolean; poster_url: string | null;
};
export type EditionData = { edition_id: string; name: string; registration_opens_at: string | null; registration_closes_at: string | null };
function detailsFrom(e?: EventData): EventDetails {
  return { title:e?.title??"", category:e?.category??"sport", format:e?.format??"solo", scoreTemplate:e?.score_template??"generic",
    summary:e?.summary??"", rules:e?.rules_markdown??"",venue:e?.venue??"",capacity:e?.application_capacity??null,
    waitlistEnabled:e?.waitlist_enabled??false,reportingAt:e?.reporting_at??null,startsAt:e?.starts_at??null,
    endsAt:e?.ends_at??null,rosterLockAt:e?.roster_lock_at??null,eligibility:e?.eligibility??{division:"open"},
    applicationQuestions:e?.application_questions??[],groupMinSize:e?.format==="pair"?2:e?.group_min_size??null,groupMaxSize:e?.format==="pair"?2:e?.group_max_size??null,
    batchRestricted:e?.batch_restricted??false,posterUrl:e?.poster_url??null };
}
const steps = ["Basics","Participation","Schedule & photo","Review"];
export function EventEditor({events,editions,isAdmin,selectedId,creating,initialFilter}:{
  events:EventData[];editions:EditionData[];isAdmin:boolean;selectedId?:string;creating?:boolean;initialFilter?:string;
}) {
  const router=useRouter();
  const current=creating?undefined:events.find(e=>e.event_id===selectedId);
  const showForm=Boolean(creating||current);
  const [details,setDetails]=useState<EventDetails>(()=>detailsFrom(current));
  const [step,setStep]=useState(0);
  const [dirty,setDirty]=useState(false);
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState<{text:string;error?:boolean}|null>(null);
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState(initialFilter??"all");
  const [editionId,setEditionId]=useState(editions[0]?.edition_id??"");
  const deleteDialog=useRef<HTMLDialogElement>(null);
  const [deleteTitle,setDeleteTitle]=useState("");
  const errorBox=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{
    if(!dirty)return;
    const leave=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    const links=(event:MouseEvent)=>{
      const link=(event.target as HTMLElement).closest("a");
      if(link&&link.href!==window.location.href&&!window.confirm("Leave without saving your event changes?"))event.preventDefault();
    };
    window.addEventListener("beforeunload",leave);document.addEventListener("click",links,true);
    return()=>{window.removeEventListener("beforeunload",leave);document.removeEventListener("click",links,true);};
  },[dirty]);
  function change<K extends keyof EventDetails>(key:K,value:EventDetails[K]) {setDetails(v=>({...v,[key]:value,...(key==="format"&&value==="pair"?{groupMinSize:2,groupMaxSize:2}:key==="format"&&value==="solo"?{groupMinSize:null,groupMaxSize:null}:{})}));setDirty(true);}
  function numeric(value:string){return value?Number(value):null;}
  async function save(){
    if(pending)return;
    const parsed=eventDetailsSchema.safeParse(details);
    if(!parsed.success){setMessage({text:parsed.error.issues[0].message,error:true});errorBox.current?.focus();return;}
    setPending(true);setMessage(null);
    try{
      const response=await fetch("/api/admin/events",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({eventId:current?.event_id??null,editionId:editionId||null,details:parsed.data})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"Unable to save.");
      setDirty(false);setMessage({text:"Event saved. Main Admin can review and publish it."});
      if(!current)router.replace("/admin/events?event="+result.eventId);
      router.refresh();
    }catch(error){setMessage({text:error instanceof Error?error.message:"Unable to save. Please retry.",error:true});}
    finally{setPending(false);}
  }
  async function lifecycle(state:string){
    if(dirty){setMessage({text:"Save your changes before changing event status.",error:true});return;}
    const missing=publicationMissing(details);
    if(["published","open"].includes(state)&&missing.length){setMessage({text:"Complete "+missing.join(", ")+" before publishing.",error:true});return;}
    setPending(true);
    try{
      const response=await fetch("/api/admin/festival",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"setEventState",eventId:current?.event_id,state})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setMessage({text:"Event status updated to "+state+"."});router.refresh();
    }catch(error){setMessage({text:error instanceof Error?error.message:"Unable to change status.",error:true});}finally{setPending(false);}
  }
  async function remove(){
    if(!current||deleteTitle!==current.title||pending)return;
    setPending(true);
    try{
      const response=await fetch("/api/admin/festival",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"deleteEvent",eventId:current.event_id})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setDirty(false);deleteDialog.current?.close();router.replace("/admin/events");router.refresh();
    }catch(error){setMessage({text:error instanceof Error?error.message:"Deletion failed.",error:true});deleteDialog.current?.close();}finally{setPending(false);}
  }
  const visible=events.filter(e=>(filter==="all"||e.state===filter)&&e.title.toLowerCase().includes(query.toLowerCase()));
  return <div className="portal-events">
    <section className="portal-heading"><div><p className="portal-eyebrow">{isAdmin?"Festival catalogue":"Event Editor"}</p><h1>{creating?"Create event":current?current.title:"Events"}</h1><p>{showForm?"Complete the steps and save your event. Drafts stay private until Main Admin publishes them.":"Find a draft or create your next event."}</p></div>
      <Link href={showForm?"/admin/events":"/admin/events?create=1"} className="portal-primary">{showForm?"← All events":"+ Create event"}</Link></section>
    {message&&<p ref={errorBox} tabIndex={-1} className={"portal-message"+(message.error?" portal-error":"")} role={message.error?"alert":"status"}>{message.text}</p>}
    {!showForm?<>
      <div className="portal-list-controls"><input type="search" aria-label="Search editable events" placeholder="Search events" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Event status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{["draft","published","open","closed","ongoing","completed","cancelled"].map(s=><option key={s}>{s}</option>)}</select></div>
      <div className="portal-event-grid">{visible.map(e=><Link key={e.event_id} href={"/admin/events?event="+e.event_id} className="portal-event"><span className="portal-badge">{e.state}</span><h3>{e.title}</h3><p>{e.category} · {e.format}</p><span>Edit event →</span></Link>)}</div>
      {!visible.length&&<p className="portal-message">No events match. Create a draft or change your filters.</p>}
    </>:<>
      {current&&<p><span className="portal-badge">{current.state}</span> {dirty?"Unsaved changes":"Saved event"}</p>}
      <nav className="portal-steps" aria-label="Event setup steps">{steps.map((name,i)=><button type="button" key={name} aria-current={step===i?"step":undefined} onClick={()=>setStep(i)}>{i+1}. {name}</button>)}</nav>
      <form className="portal-form" onSubmit={e=>{e.preventDefault();void save();}} noValidate>
        <fieldset disabled={pending}>
        {step===0&&<><legend>Event basics</legend>
          {creating&&<label>Festival edition<select value={editionId} onChange={e=>setEditionId(e.target.value)}>{editions.map(e=><option key={e.edition_id} value={e.edition_id}>{e.name}</option>)}</select></label>}
          <label>Event title<input value={details.title} onChange={e=>change("title",e.target.value)} maxLength={160} required placeholder="e.g. Inter-batch football"/></label>
          <label>Category<select disabled={current?.structure_locked} value={details.category} onChange={e=>change("category",e.target.value as EventDetails["category"])}>{Object.entries({sport:"Sports",cultural:"Cultural",literary:"Literary",creative:"Arts & Creative",other:"Other"}).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label>Participation format<select disabled={current?.structure_locked} value={details.format} onChange={e=>change("format",e.target.value as EventDetails["format"])}><option value="solo">Individual / solo</option><option value="pair">Pair / doubles</option><option value="group">Group performance</option><option value="sport">Sports team / squad</option></select><small>Choose Individual for singles, races and other individual sports. This determines the participant and winner workflow.</small></label>
          {details.category==="sport"&&<label>Sport discipline<select value={String(details.eligibility.sub_category??"")} onChange={e=>change("eligibility",{...details.eligibility,sub_category:e.target.value})}><option value="">General sport</option><option value="field">Field sport</option><option value="racket">Racket sport</option><option value="athletics">Athletics</option><option value="indoor">Indoor</option><option value="strength">Strength</option></select></label>}
          <label>Scoring<select disabled={current?.structure_locked} value={details.scoreTemplate} onChange={e=>change("scoreTemplate",e.target.value as EventDetails["scoreTemplate"])}>{Object.entries({generic:"Standard",cricket:"Cricket",football:"Football",basketball:"Basketball",set_based:"Set-based sport",badminton:"Badminton"}).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
          {current&&<small>Category, format and scoring can change only while this is a draft without any registrations or competition records.</small>}
          <label>Division<select value={String(details.eligibility.division??"open")} onChange={e=>change("eligibility",{...details.eligibility,division:e.target.value})}><option value="open">Open / mixed</option><option value="boys">Boys</option><option value="girls">Girls</option></select></label>
        </>}
        {step===1&&<><legend>Participation & rules</legend>
          <label>Short description<textarea rows={3} maxLength={600} value={details.summary} onChange={e=>change("summary",e.target.value)}/><small>{details.summary.length}/600 characters</small></label>
          <label>Official rules<textarea rows={8} maxLength={20000} value={details.rules} onChange={e=>change("rules",e.target.value)}/></label>
          <label>Registration capacity<input type="number" min={1} value={details.capacity??""} onChange={e=>change("capacity",numeric(e.target.value))}/><small>Leave blank for unlimited registrations.</small></label>
          <label className="portal-check"><input type="checkbox" checked={details.waitlistEnabled} onChange={e=>change("waitlistEnabled",e.target.checked)}/>Enable waitlist</label>
          {details.format==="pair"&&<p className="portal-message">Exactly two partners. Pairing requires an invitation and the other student&apos;s acceptance; no captain is appointed.</p>}
          {(["group","sport"].includes(details.format))&&<div className="field-pair"><label>Minimum {details.format==="group"?"group":"team"} size<input type="number" min={1} value={details.groupMinSize??""} onChange={e=>change("groupMinSize",numeric(e.target.value))}/></label><label>Maximum {details.format==="group"?"group":"team"} size<input type="number" min={1} value={details.groupMaxSize??""} onChange={e=>change("groupMaxSize",numeric(e.target.value))}/></label></div>}
          {details.format!=="solo"&&<label className="portal-check"><input type="checkbox" checked={details.batchRestricted} onChange={e=>change("batchRestricted",e.target.checked)}/>Members must be from the same batch</label>}
          {details.category==="sport"&&<><label>Match format<input maxLength={160} value={String(details.eligibility.match_format??"")} onChange={e=>change("eligibility",{...details.eligibility,match_format:e.target.value})} placeholder="e.g. 7-a-side · 20 minutes each half"/></label><label>Squad / participation notes<textarea maxLength={1000} rows={3} value={String(details.eligibility.squad_details??"")} onChange={e=>change("eligibility",{...details.eligibility,squad_details:e.target.value})}/></label></>}
          <h2>Registration questions</h2><small>Name, roll, batch and other identity details are already collected.</small>
          {details.applicationQuestions.map((q,i)=><div key={q.key} className="portal-question">
            <label>Question {i+1}<input value={q.label} maxLength={200} onChange={e=>change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,label:e.target.value}:v))}/></label>
            <label>Answer type<select value={q.type} onChange={e=>change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,type:e.target.value as "text"|"select",options:e.target.value==="select"?["Option 1"]:undefined}:v))}><option value="text">Written answer</option><option value="select">Choose an option</option></select></label>
            {q.type==="select"&&<label>Choices — one per line<textarea value={q.options?.join("\n")??""} onChange={e=>change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,options:e.target.value.split("\n")}:v))}/></label>}
            <label className="portal-check"><input type="checkbox" checked={q.required} onChange={e=>change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,required:e.target.checked}:v))}/>Required answer</label>
            <button type="button" className="portal-secondary" onClick={()=>change("applicationQuestions",details.applicationQuestions.filter((_,j)=>j!==i))}>Remove question {i+1}</button>
          </div>)}
          <button type="button" className="portal-secondary" onClick={()=>change("applicationQuestions",[...details.applicationQuestions,{key:"question_"+crypto.randomUUID().slice(0,8),label:"",type:"text",required:false}])}>+ Add question</button>
        </>}
        {step===2&&<><legend>Schedule & poster</legend><label>Venue<input value={details.venue} maxLength={160} onChange={e=>change("venue",e.target.value)}/></label>
          {([["reportingAt","Reporting time"],["startsAt","Start time"],["endsAt","End time"],["rosterLockAt","Roster deadline"]] as const).map(([key,label])=><label key={key}>{label} (IST)<input type="datetime-local" value={toIstInput(details[key])} onChange={e=>change(key,fromIstInput(e.target.value))}/></label>)}
          <small>Registration opening and closing dates follow the festival window set by Main Admin.</small>
          {current?<ImageUploadWidget eventId={current.event_id} folder="posters" label="Choose poster photo" onUploadSuccess={url=>change("posterUrl",url)}/>:<p className="portal-message">Save your draft first to attach a compressed poster. Your event stays private.</p>}
          {details.posterUrl&&<><Image unoptimized width={1200} height={800} className="portal-preview" src={details.posterUrl} alt="Event poster preview"/><button type="button" className="portal-secondary" onClick={()=>change("posterUrl",null)}>Remove poster</button></>}
        </>}
        {step===3&&<><legend>Review event</legend><h2>{details.title||"Untitled event"}</h2><p>{details.category} · {details.format} · {String(details.eligibility.division)}</p><p>{details.summary||"Description not added yet."}</p><p>{details.venue||"Venue not set"} · {details.startsAt?new Date(details.startsAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):"Start not set"} (IST)</p><p>{details.applicationQuestions.length} registration questions</p><p className="portal-message">{publicationMissing(details).length?"Still needed before publication: "+publicationMissing(details).join(", "):"Event details are ready for Main Admin review."}</p></>}
        </fieldset>
        <div className="portal-form-actions">{step>0&&<button type="button" className="portal-secondary" onClick={()=>setStep(v=>v-1)} disabled={pending}>Back</button>}{step<3&&<button type="button" className="portal-secondary" onClick={()=>setStep(v=>v+1)} disabled={pending}>Continue →</button>}<button type="submit" className="portal-primary" disabled={pending||(!current&&!editionId)}>{pending?"Saving…":current?"Save changes":"Save draft"}</button></div>
      </form>
      {isAdmin&&current&&<section className="portal-form portal-section"><h2>Publication & event status</h2><p>Saving details does not publish the event. Students can register only when it is open.</p><div className="portal-event-actions">{["published","open","closed","ongoing","completed","cancelled"].filter(s=>s!==current.state).map(s=><button key={s} className="portal-secondary" type="button" disabled={pending||dirty} onClick={()=>void lifecycle(s)}>{({published:"Publish listing",open:"Open registrations",closed:"Close registrations",ongoing:"Mark ongoing",completed:"Mark completed",cancelled:"Cancel event"} as Record<string,string>)[s]}</button>)}</div></section>}
      {current&&<details className="portal-danger"><summary>Danger zone</summary><p>Permanent deletion removes this event and its registrations, teams, fixtures, results and gallery moments.</p><button type="button" className="portal-secondary" onClick={()=>deleteDialog.current?.showModal()}>Delete this event</button></details>}
      <dialog className="portal-dialog" ref={deleteDialog}><h2>Delete event permanently?</h2><p>All associated records will be removed. Type <strong>{current?.title}</strong> to confirm.</p><label>Confirm event title<input value={deleteTitle} onChange={e=>setDeleteTitle(e.target.value)}/></label><div className="portal-form-actions"><button type="button" className="portal-secondary" onClick={()=>deleteDialog.current?.close()} disabled={pending}>Keep event</button><button type="button" className="portal-primary" disabled={pending||deleteTitle!==current?.title} onClick={()=>void remove()}>Delete permanently</button></div></dialog>
    </>}
  </div>;
}
