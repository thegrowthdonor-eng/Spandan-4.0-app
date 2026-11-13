import assert from "node:assert/strict";
import test from "node:test";
import { eventDetailsSchema, managementEventSchema, eventStepError, fromIstInput, toIstInput, publicationMissing, type EventDetails } from "./event-setup";
import { managementLinks, canEnterManagement, type ManagementSummary } from "./management";

const draft:EventDetails={registrationEnabled:true,title:"Chess",category:"sport",format:"solo",scoreTemplate:"generic",summary:"",rules:"",venue:"",capacity:null,waitlistEnabled:false,reportingAt:null,startsAt:null,endsAt:null,rosterLockAt:null,eligibility:{division:"open"},applicationQuestions:[],groupMinSize:null,groupMaxSize:null,batchRestricted:false,posterUrl:null};

test("one programme event supports solo, duo and groups through the existing size range", () => {
  const details: EventDetails = {...draft, title:"Singing", category:"cultural", format:"group", operatingMethod:"programme", groupMinSize:1, groupMaxSize:8, summary:"Stage performances", rules:"One performance per student", venue:"Stage", startsAt:"2026-12-01T04:00:00Z", endsAt:"2026-12-01T06:00:00Z"};
  assert.equal(eventDetailsSchema.safeParse(details).success, true);
  assert.deepEqual(publicationMissing(details), []);
  assert.equal(eventStepError(details, 1), null);
  assert.equal(details.registrationEnabled, true);
  assert.equal(eventDetailsSchema.safeParse({...details, groupMinSize:0}).success, false);
  assert.equal(eventDetailsSchema.safeParse({...details, groupMaxSize:0}).success, false);
});
test("drafts allow incomplete content while publication identifies required fields",()=>{
  assert.equal(eventDetailsSchema.safeParse(draft).success,true);
  assert.deepEqual(publicationMissing(draft),["summary","rules","venue","start time","end time"]);
  assert.ok(publicationMissing({...draft,format:"sport"}).includes("team sizes"));
});
test("event schedule and choice questions reject inconsistent input",()=>{
  assert.equal(eventDetailsSchema.safeParse({...draft,startsAt:"2026-12-01T04:00:00.000Z",endsAt:"2026-12-01T03:00:00.000Z"}).success,false);
  assert.equal(eventDetailsSchema.safeParse({...draft,applicationQuestions:[{key:"q",label:"Preferred position",type:"select",required:true,options:["A","A"]}]}).success,false);
  assert.equal(eventDetailsSchema.safeParse({...draft,applicationQuestions:[{key:"roll",label:"Roll number",type:"text",required:true}]}).success,false);
});
test("IST event input round-trips independently of device timezone",()=>{
  assert.equal(fromIstInput("2026-12-01T09:30"),"2026-12-01T04:00:00.000Z");
  assert.equal(toIstInput("2026-12-01T04:00:00.000Z"),"2026-12-01T09:30");
  assert.equal(fromIstInput(""),null);
});
test("editing saved offset timestamps normalizes all schedule fields without changing instants",()=>{
  const details={...draft,title:"Volleyball",summary:"Updated description",rules:"Rules",venue:"Ground",startsAt:"2026-12-01T04:00:00+00:00",endsAt:"2026-12-01T10:30:00+05:30",reportingAt:"2026-12-01T09:15:00+05:30",rosterLockAt:"2026-11-30T23:00:00+00:00",posterUrl:"https://media.auraserve.in/poster.webp"};
  const result=managementEventSchema.parse({eventId:"00000000-0000-4000-8000-000000000001",editionId:null,details});
  assert.equal(result.details.startsAt,"2026-12-01T04:00:00.000Z");
  assert.equal(result.details.endsAt,"2026-12-01T05:00:00.000Z");
  assert.equal(result.details.reportingAt,"2026-12-01T03:45:00.000Z");
  assert.equal(result.details.rosterLockAt,"2026-11-30T23:00:00.000Z");
  assert.equal(eventStepError(details,2),null);
  assert.deepEqual(eventDetailsSchema.parse({...result.details,title:"New title"}).startsAt,result.details.startsAt);
});
test("event times reject invalid and timezone-less input with field-specific errors",()=>{
  for(const field of ["startsAt","endsAt","reportingAt","rosterLockAt"] as const){
    for(const value of ["2026-12-01T09:30:00","2026-02-30T09:30:00Z","not a date"]){
      const result=eventDetailsSchema.safeParse({...draft,[field]:value});
      assert.equal(result.success,false);
      if(!result.success)assert.ok(result.error.issues.some(issue=>issue.path[0]===field && !issue.message.includes("ISO")));
    }
  }
});
test("schedule comparisons use instants rather than timezone-offset spelling",()=>{
  const details={...draft,venue:"Ground",startsAt:"2026-12-01T10:00:00+05:30",endsAt:"2026-12-01T05:00:00Z"};
  assert.equal(eventStepError(details,2),null);
  assert.equal(eventDetailsSchema.safeParse({...details,endsAt:"2026-12-01T04:00:00Z"}).success,false);
  assert.equal(eventDetailsSchema.safeParse({...details,reportingAt:"2026-12-01T11:00:00+05:30"}).success,false);
});
test("pair setup has exactly two partners, without configurable team sizes",()=>{
  assert.equal(eventDetailsSchema.safeParse({...draft,format:"pair",groupMinSize:2,groupMaxSize:2}).success,true);
  assert.equal(eventDetailsSchema.safeParse({...draft,format:"pair",groupMinSize:2,groupMaxSize:3}).success,false);
});
test("management navigation exposes the union of responsibilities without editor operations",()=>{
  const base:ManagementSummary={isAdmin:false,canVerify:false,canCreate:false,canNotice:false,canGallery:false,canLive:false,canHelp:false,roles:[],events:[],editableEvents:[],pendingVerification:null};
  assert.equal(canEnterManagement(base),false);
  assert.deepEqual(managementLinks({...base,canCreate:true}).map(v=>v.label),["Overview","Events"]);
  const mixed={...base,canCreate:true,canNotice:true,events:[{id:"event",title:"Chess",category:"sport",format:"solo",state:"open"}]};
  assert.ok(managementLinks(mixed).some(v=>v.label==="Participants"));
  assert.ok(managementLinks(mixed).some(v=>v.label==="Notices"));
  assert.equal(managementLinks(mixed).some(v=>v.label==="Administration"),false);
  assert.equal(managementLinks(mixed).some(v=>v.href==="/admin/groups"),false);
});
test("future events do not resolve to ongoing when start date has not arrived", () => {
  const futureStart = new Date(Date.now() + 86400000).toISOString();
  const pastStart = new Date(Date.now() - 86400000).toISOString();
  const resolveEffectiveState = (state: string, startsAt: string | null, regEnabled: boolean) => {
    const isFuture = startsAt ? new Date() < new Date(startsAt) : false;
    return (state === "ongoing" && isFuture) ? (regEnabled ? "open" : "published") : state;
  };
  assert.equal(resolveEffectiveState("ongoing", futureStart, true), "open");
  assert.equal(resolveEffectiveState("ongoing", futureStart, false), "published");
  assert.equal(resolveEffectiveState("ongoing", pastStart, true), "ongoing");
});
