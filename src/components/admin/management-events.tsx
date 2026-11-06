"use client";

import Link from "next/link";
import { useState } from "react";
import type { WorkspaceEvent } from "@/lib/management";

export function ManagementEvents({events,editableIds=[],editing=false}:{events:WorkspaceEvent[];editableIds?:string[];editing?:boolean}){
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("all");
  const [limit,setLimit]=useState(6);
  const categories=[...new Set(events.map(e=>e.category))];
  const filtered=events.filter(e=>(category==="all"||category===e.category)&&(e.title+" "+e.state).toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="portal-list-controls"><input type="search" aria-label={editing?"Search editable events":"Search managed events"} placeholder="Find your event" value={query} onChange={e=>{setQuery(e.target.value);setLimit(6);}}/>{categories.length>1&&<select aria-label="Filter event category" value={category} onChange={e=>{setCategory(e.target.value);setLimit(6);}}><option value="all">All categories</option>{categories.map(c=><option value={c} key={c}>{c==="creative"?"Arts & Creative":c==="sport"?"Sports":c}</option>)}</select>}</div>
    <div className="portal-event-grid">{filtered.slice(0,limit).map(event=><article key={event.id} className="portal-event">
      <span className="portal-badge">{event.state}</span><h3>{event.title}</h3>
      {!editing&&<p>{event.pending??0} pending requests · {event.format==="solo"?"Individual":"Team"} participation</p>}
      <div className="portal-event-actions">{editing?<Link href={"/admin/events?event="+event.id}>Edit event →</Link>:<>
        <Link href={"/admin/review?event="+event.id}>Participants →</Link>
        {event.format!=="solo"&&<Link href={"/admin/groups?event="+event.id}>Teams</Link>}
        <Link href={"/admin/fixtures?event="+event.id}>Fixtures</Link><Link href={"/admin/results?event="+event.id}>Results</Link>
        {editableIds.includes(event.id)&&<Link href={"/admin/events?event="+event.id}>Edit event</Link>}
      </>}</div>
    </article>)}</div>
    {!filtered.length&&<p className="portal-message">No events match this search.</p>}
    {limit<filtered.length&&<button type="button" className="portal-secondary portal-section" onClick={()=>setLimit(n=>n+6)}>Show more events ({filtered.length-limit})</button>}
  </>;
}
