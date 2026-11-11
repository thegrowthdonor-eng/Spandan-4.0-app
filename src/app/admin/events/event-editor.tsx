"use client";

import Link from "next/link";
import { eventCategoryLabels, eventCategoryLabel } from "@/lib/event-categories";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PosterPicker } from "@/components/admin/poster-picker";
import { eventDetailsSchema, publicationMissing, eventStepError, toIstInput, fromIstInput, type EventDetails } from "@/lib/event-setup";
import { operatingLabels, operatingMethods, suggestedOperations, suggestedScoreTemplate, suggestedUnit, valueUnits, type OperatingMethod, type ValueUnit } from "@/lib/event-operations";

export type EventData = {
  operating_method?: OperatingMethod; entry_format?: "image" | "text"; result_unit?: ValueUnit | null; operations_locked?: boolean;
  structure_locked: boolean;
  registration_enabled: boolean;
  event_id: string; title: string; category: EventDetails["category"]; format: EventDetails["format"];
  score_template: EventDetails["scoreTemplate"]; state: string; summary: string; rules_markdown: string;
  venue: string | null; application_capacity: number | null; waitlist_enabled: boolean;
  reporting_at: string | null; starts_at: string | null; ends_at: string | null; roster_lock_at: string | null;
  eligibility: Record<string, unknown>; application_questions: EventDetails["applicationQuestions"];
  group_min_size: number | null; group_max_size: number | null; batch_restricted: boolean; poster_url: string | null;
};
export type EditionData = { edition_id: string; name: string; registration_opens_at: string | null; registration_closes_at: string | null };
function detailsFrom(e?: EventData): EventDetails {
  return { operatingMethod:e?.operating_method??suggestedOperations(e?.title??"",e?.registration_enabled),entryFormat:e?.entry_format??"image",resultUnit:e?.result_unit??null,registrationEnabled:e?.registration_enabled??true,title:e?.title??"", category:e?.category??"sport", format:e?.format??"solo", scoreTemplate:e?.score_template??"generic",
    summary:e?.summary??"", rules:e?.rules_markdown??"",venue:e?.venue??"",capacity:e?.application_capacity??null,
    waitlistEnabled:e?.waitlist_enabled??false,reportingAt:e?.reporting_at??null,startsAt:e?.starts_at??null,
    endsAt:e?.ends_at??null,rosterLockAt:e?.roster_lock_at??null,eligibility:e?.eligibility??{division:"open"},
    applicationQuestions:(e?.application_questions??[]).map(q=>({...q,type:q.type??"text",required:q.required??false})),groupMinSize:e?.format==="pair"?2:e?.group_min_size??null,groupMaxSize:e?.format==="pair"?2:e?.group_max_size??null,
    batchRestricted:e?.format==="sport"?true:e?.batch_restricted??false,posterUrl:e?.poster_url??null };
}
const steps = ["Basics","Participation / Details","Schedule","Review"];
export function EventEditor({events,editions,isAdmin,selectedId,creating,initialFilter}:{
  events:EventData[];editions:EditionData[];isAdmin:boolean;selectedId?:string;creating?:boolean;initialFilter?:string;
}) {
  const router=useRouter();
  const current=creating?undefined:events.find(e=>e.event_id===selectedId);
  const methodChosen=useRef(Boolean(current));
  const showForm=Boolean(creating||current);
  const [details,setDetails]=useState<EventDetails>(()=>detailsFrom(current));
  const [step,setStep]=useState(0);
  const [posterFile,setPosterFile]=useState<File|null>(null);
  const [imageBusy,setImageBusy]=useState(false);
  const savedId=useRef<string|null>(current?.event_id??null);
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
  function change<K extends keyof EventDetails>(key:K,value:EventDetails[K]) {
    if(key==="operatingMethod")methodChosen.current=true;
    setDetails(v=>({...v,[key]:value,...(key==="format"&&value==="pair"?{groupMinSize:2,groupMaxSize:2}:key==="format"&&value==="solo"?{groupMinSize:null,groupMaxSize:null}:key==="format"&&value==="sport"?{batchRestricted:true}:{}),
      ...(key==="title"&&!current&&!methodChosen.current?{operatingMethod:suggestedOperations(String(value)),scoreTemplate:suggestedScoreTemplate(String(value)),resultUnit:suggestedUnit(String(value))}:{}),
      ...(key==="registrationEnabled"&&value===false?{operatingMethod:"programme" as const,format:"solo" as const,scoreTemplate:"generic" as const,applicationQuestions:[],groupMinSize:null,groupMaxSize:null,batchRestricted:false,eligibility:{...v.eligibility,division:"open"}}:{}),
      ...(key==="startsAt"&&typeof value==="string"&&v.startsAt&&v.reportingAt?{reportingAt:new Date(new Date(value).getTime()+new Date(v.reportingAt).getTime()-new Date(v.startsAt).getTime()).toISOString()}:{}),
    }));setDirty(true);
  }
  function goStep(target:number){
    if(pending||imageBusy)return;
    for(let i=0;i<target;i++){const error=eventStepError(details,i);if(error){setMessage({text:error,error:true});setStep(i);requestAnimationFrame(()=>errorBox.current?.focus());return;}}
    setMessage(null);setStep(target);
  }
  function numeric(value:string){return value?Number(value):null;}
  async function save(){
    if(pending||imageBusy)return;
    if(step!==3){goStep(step+1);return;}
    for(let i=0;i<3;i++){if(eventStepError(details,i)){goStep(3);return;}}
    const parsed=eventDetailsSchema.safeParse(details);
    if(!parsed.success){setMessage({text:parsed.error.issues[0].message,error:true});errorBox.current?.focus();return;}
    setPending(true);setMessage(null);
    try{
      const response=await fetch("/api/admin/events",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({eventId:savedId.current,editionId:editionId||null,details:parsed.data})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"Unable to save.");
      savedId.current=result.eventId;
      let posterUrl=details.posterUrl;
      if(posterFile){
        const form=new FormData();form.append("file",posterFile);form.append("folder","posters");form.append("eventId",result.eventId);form.append("attach","true");
        const upload=await fetch("/api/admin/upload",{method:"POST",body:form});const uploaded=await upload.json();
        if(!upload.ok)throw new Error((uploaded.error??"Poster upload failed.")+" The event details are saved; retry uses the same event and preserves the selected poster.");
        posterUrl=uploaded.url;setPosterFile(null);
      }
      setDetails(v=>({...v,posterUrl}));setDirty(false);setMessage({text:"Event published successfully to the festival catalogue."});
      if(!current)router.replace("/admin/events?event="+result.eventId);
      router.refresh();
    }catch(error){setMessage({text:error instanceof Error?error.message:"Unable to save. Please retry.",error:true});}
    finally{setPending(false);}
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
    <section className="portal-heading"><div><p className="portal-eyebrow">{isAdmin?"Festival catalogue":"Event Editor"}</p><h1>{creating?"Create event":current?current.title:"Events"}</h1><p>{showForm?"Complete the steps and publish your event directly to the festival catalogue.":"Manage and publish events in the festival catalogue."}</p></div>
      <Link href={showForm?"/admin/events":"/admin/events?create=1"} className="portal-primary">{showForm?"← All events":"+ Create event"}</Link></section>
    {message&&<p ref={errorBox} tabIndex={-1} className={"portal-message"+(message.error?" portal-error":"")} role={message.error?"alert":"status"}>{message.text}</p>}
    {!showForm?<>
      <div className="portal-list-controls"><input type="search" aria-label="Search editable events" placeholder="Search events" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Event status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{["draft","published","open","closed","ongoing","completed","cancelled"].map(s=><option key={s}>{s}</option>)}</select></div>
      <div className="portal-event-grid">{visible.map(e=><Link key={e.event_id} href={"/admin/events?event="+e.event_id} className="portal-event"><span className="portal-badge">{e.state}</span><h3>{e.title}</h3><p>{eventCategoryLabel(e.category)} · {e.registration_enabled?e.format:"Information only"}</p><span>Edit event →</span></Link>)}</div>
      {!visible.length&&<p className="portal-message">No events match. Create an event or change your filters.</p>}
    </>:<>
      {current&&<p><span className="portal-badge">{current.state}</span> {dirty?"Unsaved changes":"Saved event"}</p>}
      {current && <p><Link href={`/admin/fixtures?event=${current.event_id}`}>Open event workspace →</Link></p>}
      <nav className="portal-steps" aria-label="Event setup steps">{steps.map((name,i)=><button type="button" key={name} aria-current={step===i?"step":undefined} onClick={()=>goStep(i)}>{i+1}. {name}</button>)}</nav>
      <form className="portal-form" onSubmit={e=>{e.preventDefault();if(step<3)goStep(step+1);else void save();}} noValidate>
        <fieldset disabled={pending}>
        {step===0&&<><legend>Event basics</legend>
          {creating&&<label>Festival edition<select value={editionId} onChange={e=>setEditionId(e.target.value)}>{editions.map(e=><option key={e.edition_id} value={e.edition_id}>{e.name}</option>)}</select></label>}
          <label>Event title<input value={details.title} onChange={e=>change("title",e.target.value)} maxLength={160} required placeholder="e.g. Inter-batch football"/></label>
          <label>Category<select disabled={current?.structure_locked} value={details.category} onChange={e=>change("category",e.target.value as EventDetails["category"])}>{Object.entries(eventCategoryLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label>Event type<select disabled={current?.structure_locked} value={details.registrationEnabled?"competition":"information"} onChange={e=>change("registrationEnabled",e.target.value==="competition")}><option value="competition">Competition — registration enabled</option><option value="information">Information only — no registration</option></select></label>
          <label>How will this event be managed?<select disabled={current?.operations_locked || !details.registrationEnabled} value={details.operatingMethod} onChange={e=>change("operatingMethod",e.target.value as OperatingMethod)}>{operatingMethods.map(method=><option key={method} value={method}>{operatingLabels[method]}</option>)}</select><small>Stage performances use Information & gallery. For art/literary events, choose Public voting or Publish final results.</small></label>
          {details.operatingMethod==="voting"&&<label>Submission format<select disabled={current?.operations_locked} value={details.entryFormat} onChange={e=>change("entryFormat",e.target.value as "image"|"text")}><option value="image">Image — artwork or photography</option><option value="text">Written work — optional image</option></select><small>Submission deadline and voting dates are managed in the event workspace.</small></label>}
          {["results_only","fixtures_only"].includes(details.operatingMethod??"")&&<label>Optional final value<select disabled={current?.operations_locked} value={details.resultUnit??""} onChange={e=>change("resultUnit",(e.target.value||null) as ValueUnit|null)}><option value="">Positions only — no value field</option>{valueUnits.map(unit=><option key={unit} value={unit}>{unit==="seconds"?"Final time (seconds)":unit==="minutes"?"Final time (minutes)":unit==="metres"?"Final distance (metres)":unit==="count"?"Final count":"Final marks"}</option>)}</select></label>}
          <PosterPicker currentUrl={details.posterUrl} selectedFile={posterFile} onBusy={setImageBusy} onChange={file=>{setPosterFile(file);setDirty(true);}} onRemove={()=>{setPosterFile(null);change("posterUrl",null);}}/>
          {details.registrationEnabled&&<>
          <label>Participation format<select disabled={current?.structure_locked} value={details.format} onChange={e=>change("format",e.target.value as EventDetails["format"])}><option value="solo">Individual / solo</option><option value="pair">Pair / doubles</option><option value="group">Group performance</option><option value="sport">Sports team / squad</option></select><small>Choose Individual for singles, races and other individual sports. This determines the participant and winner workflow.</small></label>
          {details.category==="sport"&&<label>Sport discipline<select value={String(details.eligibility.sub_category??"")} onChange={e=>change("eligibility",{...details.eligibility,sub_category:e.target.value})}><option value="">General sport</option><option value="field">Field sport</option><option value="racket">Racket sport</option><option value="athletics">Athletics</option><option value="indoor">Indoor</option><option value="strength">Strength</option></select></label>}
          {details.operatingMethod==="live_matches"&&<label>Scoreboard style<select disabled={current?.structure_locked} value={details.scoreTemplate} onChange={e=>change("scoreTemplate",e.target.value as EventDetails["scoreTemplate"])}>{Object.entries({generic:"Score / rounds",cricket:"Cricket",football:"Football",basketball:"Basketball",set_based:"Points or games & sets",badminton:"Badminton"}).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>}
          {current&&<small>Category, format and scoring can change only while this event has no registrations or competition records.</small>}
          <label>Division<select value={String(details.eligibility.division??"open")} onChange={e=>change("eligibility",{...details.eligibility,division:e.target.value})}><option value="open">Open / mixed</option><option value="boys">Boys</option><option value="girls">Girls</option></select></label>
          </>}
        </>}
        {step===1&&<><legend>{details.registrationEnabled?"Participation & rules":"Event details"}</legend>
          <label>Short description<textarea rows={3} maxLength={600} value={details.summary} onChange={e=>change("summary",e.target.value)}/><small>{details.summary.length}/600 characters</small></label>
          {details.registrationEnabled&&<>
          <label>Official rules<textarea rows={8} maxLength={20000} value={details.rules} onChange={e=>change("rules",e.target.value)}/></label>


          {details.format==="pair"&&<p className="portal-message">Exactly two partners. Pairing requires an invitation and the other student&apos;s acceptance; no captain is appointed.</p>}
          {(["group","sport"].includes(details.format))&&<div className="field-pair"><label>Minimum {details.format==="group"?"group":"team"} size<input type="number" min={1} value={details.groupMinSize??""} onChange={e=>change("groupMinSize",numeric(e.target.value))}/></label><label>Maximum {details.format==="group"?"group":"team"} size<input type="number" min={1} value={details.groupMaxSize??""} onChange={e=>change("groupMaxSize",numeric(e.target.value))}/></label></div>}
          {details.format!=="solo"&&details.format!=="sport"&&<label className="portal-check"><input type="checkbox" checked={details.batchRestricted} onChange={e=>change("batchRestricted",e.target.checked)}/>Members must be from the same batch</label>}
          <h2>Registration questions</h2><small>Name, roll, batch and other identity details are already collected.</small>
          {details.applicationQuestions.map((q,i)=><div key={q.key} className="portal-question">
            <label>Question {i+1}<input value={q.label} maxLength={200} onChange={e=>change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,label:e.target.value}:v))}/></label>
            <label>Answer type<select value={q.type} onChange={e=>change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,type:e.target.value as "text"|"select",options:e.target.value==="select"?["",""]:undefined}:v))}><option value="text">Written answer</option><option value="select">Choose an option</option></select></label>
            {q.type==="select"&&<><label>Number of options<select value={q.options?.length??2} onChange={e=>{const count=Number(e.target.value);if(count<(q.options?.length??0)&&q.options?.slice(count).some(o=>o.trim())&&!confirm("Remove the filled choices beyond option "+count+"?"))return;change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,options:Array.from({length:count},(_,n)=>v.options?.[n]??"")}:v));}}>{Array.from({length:19},(_,n)=>n+2).map(n=><option key={n} value={n}>{n} options</option>)}</select></label>{(q.options??["",""]).map((option,n)=><label key={n}>Option {n+1}<input value={option} maxLength={200} required onChange={e=>change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,options:v.options?.map((o,k)=>k===n?e.target.value:o)}:v))}/></label>)}</>}
            <label className="portal-check"><input type="checkbox" checked={q.required} onChange={e=>change("applicationQuestions",details.applicationQuestions.map((v,j)=>j===i?{...v,required:e.target.checked}:v))}/>Required answer</label>
            <button type="button" className="portal-secondary" onClick={()=>change("applicationQuestions",details.applicationQuestions.filter((_,j)=>j!==i))}>Remove question {i+1}</button>
          </div>)}
          <button type="button" className="portal-secondary" onClick={()=>change("applicationQuestions",[...details.applicationQuestions,{key:"question_"+crypto.randomUUID().slice(0,8),label:"",type:"text",required:false}])}>+ Add question</button>
          </>}
        </>}
        {step===2&&<><legend>Schedule</legend><label>Venue<input value={details.venue} maxLength={160} onChange={e=>change("venue",e.target.value)}/></label>
          {([["startsAt","Start date & time"],["endsAt","End date & time"]] as const).map(([key,label])=><label key={key}>{label} (IST)<input type="datetime-local" value={toIstInput(details[key])} onChange={e=>change(key,fromIstInput(e.target.value))}/></label>)}



        </>}
        {step===3&&<><legend>Review event</legend><h2>{details.title||"Untitled event"}</h2><p>{eventCategoryLabel(details.category)} · {details.registrationEnabled?details.format:"Information only"}{details.registrationEnabled?` · ${String(details.eligibility.division)}`:""}</p><p>{details.summary||"Description not added yet."}</p><p>{details.venue||"Venue not set"} · {details.startsAt?new Date(details.startsAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):"Start not set"} (IST)</p><p>{details.registrationEnabled?`${details.applicationQuestions.length} registration questions`:"No registration required"}</p><p className="portal-message">{publicationMissing(details).length?"Still needed before publication: "+publicationMissing(details).join(", "):"Event details are complete and ready to publish."}</p></>}
        </fieldset>
        <div className="portal-form-actions">{step>0&&<button type="button" className="portal-secondary" onClick={()=>goStep(step-1)} disabled={pending||imageBusy}>Back</button>}{step<3?<button type="submit" className="portal-primary" disabled={pending||imageBusy}>Continue →</button>:<button type="submit" className="portal-primary" disabled={pending||imageBusy||(!current&&!editionId)}>{pending?"Publishing…":current?"Save & Publish":"Publish event"}</button>}</div>
      </form>
      {current&&<details className="portal-danger"><summary>Danger zone</summary><p>Permanent deletion removes this event and its registrations, teams, fixtures, results and gallery moments.</p><button type="button" className="portal-secondary" onClick={()=>deleteDialog.current?.showModal()}>Delete this event</button></details>}
      <dialog className="portal-dialog" ref={deleteDialog}><h2>Delete event permanently?</h2><p>All associated records will be removed. Type <strong>{current?.title}</strong> to confirm.</p><label>Confirm event title<input value={deleteTitle} onChange={e=>setDeleteTitle(e.target.value)}/></label><div className="portal-form-actions"><button type="button" className="portal-secondary" onClick={()=>deleteDialog.current?.close()} disabled={pending}>Keep event</button><button type="button" className="portal-primary" disabled={pending||deleteTitle!==current?.title} onClick={()=>void remove()}>Delete permanently</button></div></dialog>
    </>}
  </div>;
}
