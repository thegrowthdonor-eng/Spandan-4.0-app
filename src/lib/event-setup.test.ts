import assert from "node:assert/strict";
import test from "node:test";
import { eventDetailsSchema, fromIstInput, toIstInput, publicationMissing, type EventDetails } from "./event-setup";
import { managementLinks, canEnterManagement, type ManagementSummary } from "./management";

const draft:EventDetails={registrationEnabled:true,title:"Chess",category:"sport",format:"solo",scoreTemplate:"generic",summary:"",rules:"",venue:"",capacity:null,waitlistEnabled:false,reportingAt:null,startsAt:null,endsAt:null,rosterLockAt:null,eligibility:{division:"open"},applicationQuestions:[],groupMinSize:null,groupMaxSize:null,batchRestricted:false,posterUrl:null};
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
