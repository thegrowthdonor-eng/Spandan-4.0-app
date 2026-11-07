import assert from "node:assert/strict";
import { test } from "node:test";
import { countRolePeople, eventCategoryLabel } from "./event-categories";
import { eventDetailsSchema, eventStepError, publicationMissing } from "./event-setup";
import { maxPosterBytes, validPosterUpload } from "./poster-image";

const details = eventDetailsSchema.parse({title:"Bonfire",category:"other",format:"solo",registrationEnabled:false,scoreTemplate:"generic",summary:"An evening together",rules:"",venue:"Campus ground",capacity:null,waitlistEnabled:false,reportingAt:null,startsAt:"2026-12-01T12:00:00Z",endsAt:"2026-12-01T13:00:00Z",rosterLockAt:null,eligibility:{division:"open"},applicationQuestions:[],groupMinSize:null,groupMaxSize:null,batchRestricted:false,posterUrl:null});
test("informational event does not require competition rules; wizard still requires all visible details",()=>{
  assert.deepEqual(publicationMissing(details),[]);
  assert.equal(eventStepError({...details,title:""},0),"Enter an event title.");
  assert.equal(eventStepError({...details,summary:""},1),"Enter a short description.");
  assert.ok(eventStepError({...details,endsAt:null},2));
  assert.ok(eventStepError({...details,endsAt:details.startsAt},2));
  assert.ok(publicationMissing({...details,registrationEnabled:true}).includes("rules"));
});
test("choice question options are separate, trimmed, unique and limited to 2–20",()=>{
  const question={key:"position",label:"Playing position",type:"select",required:true};
  for(const options of [["A"],["A",""],[" A ","A"],Array.from({length:21},(_,i)=>String(i))])assert.equal(eventDetailsSchema.safeParse({...details,registrationEnabled:true,applicationQuestions:[{...question,options}]}).success,false);
  assert.equal(eventDetailsSchema.safeParse({...details,applicationQuestions:[{...question,options:[" A "," B "]}]}).success,true);
});
test("role counts deduplicate the same coordinator's event assignments",()=>{
  const members=[{profile_id:"a",role:"event_coordinator"},{profile_id:"a",role:"event_coordinator"},{profile_id:"b",role:"event_coordinator"},{profile_id:"a",role:"main_admin"}];
  assert.equal(countRolePeople(members,"event_coordinator"),2);assert.equal(countRolePeople(members,"main_admin"),1);assert.equal(countRolePeople(members,"treasurer"),0);
  assert.equal(eventCategoryLabel("other"),"Gaming & Specials");assert.equal(eventCategoryLabel("creative"),"Arts");
});
test("poster boundary rejects MIME spoofing, wrong signatures and oversize WebP",()=>{
  const bytes=new TextEncoder().encode("RIFF0000WEBPpayload");
  assert.equal(validPosterUpload(bytes,"image/webp",bytes.length),true);
  assert.equal(validPosterUpload(bytes,"image/png",bytes.length),false);
  assert.equal(validPosterUpload(bytes,"image/webp",maxPosterBytes+1),false);
  assert.equal(validPosterUpload(new Uint8Array(20),"image/webp",20),false);
});
