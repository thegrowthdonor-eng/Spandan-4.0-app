import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { QA_PASSWORD } from "./qa-data";
import { requireQaEnvironment, requireQaPublicEnvironment, failIfError } from "./qa-guard";
import { toPrivateAuthEmail } from "../src/server/auth/identity";

export async function verifyLaunchAdmin() {
  const admin=requireQaEnvironment(),owner=requireQaPublicEnvironment(),student=requireQaPublicEnvironment(),anon=requireQaPublicEnvironment();
  for(const [client,roll,batch] of [[owner,"91","2023"],[student,"1","2021"]] as const)failIfError((await client.auth.signInWithPassword({email:toPrivateAuthEmail({batch,rollNumber:roll},process.env.AUTH_IDENTITY_PEPPER!),password:QA_PASSWORD})).error,"Launch QA login");
  const edition=(await admin.from("editions").select("id").single()).data!;
  const user=(await student.auth.getUser()).data.user!;
  const profile=(await admin.from("profiles").select("batch_id").eq("id",user.id).single()).data!;
  const otherBatch=(await admin.from("batches").select("id").neq("id",profile.batch_id).limit(1).single()).data!;
  const ids:string[]=[];
  const details={title:"QA Launch "+randomUUID(),category:"other",format:"solo",registrationEnabled:false,scoreTemplate:"generic",summary:"An informational festival evening",rules:"",venue:"QA ground",capacity:null,waitlistEnabled:false,reportingAt:null,startsAt:"2026-12-01T12:00:00Z",endsAt:"2026-12-01T13:00:00Z",rosterLockAt:null,eligibility:{division:"open"},applicationQuestions:[],groupMinSize:null,groupMaxSize:null,batchRestricted:false,posterUrl:null};
  try{
    const created=await owner.rpc("save_management_event",{p_event_id:null,p_edition_id:edition.id,p_details:details});failIfError(created.error,"Create informational draft");const info=created.data;ids.push(info.id);assert.equal(info.registration_enabled,false);
    const projection=await owner.rpc("list_admin_event_editor_data");failIfError(projection.error,"Editor event projection");assert.equal(projection.data.find((e:{event_id:string})=>e.event_id===info.id).registration_enabled,false);
    assert.equal((await owner.rpc("can_manage_event",{p_event_id:info.id})).data,false);
    const published=await owner.rpc("set_admin_event_state",{p_event_id:info.id,p_state:"published"});failIfError(published.error,"Publish listing without competition rules");
    assert.equal((await owner.rpc("set_admin_event_state",{p_event_id:info.id,p_state:"open"})).error?.code,"22023");
    const publicInfo=await anon.from("events").select("id,registration_enabled").eq("id",info.id).single();failIfError(publicInfo.error,"Public informational read");assert.equal(publicInfo.data!.registration_enabled,false);
    assert.equal((await student.rpc("apply_to_event",{p_event_id:info.id,p_idempotency_key:randomUUID(),p_answers:{}})).error?.code,"22023");
    assert.equal((await student.rpc("pair_invitation_command",{p_event_id:info.id,p_action:"invite"})).error?.code,"22023");
    assert.equal((await owner.rpc("manage_team_proposal",{p_event_id:info.id,p_group_id:null,p_action:"appoint",p_details:{}})).error?.code,"22023");
    assert.equal((await admin.from("applications").insert({event_id:info.id,student_id:user.id,idempotency_key:randomUUID()})).error?.code,"22023","Informational record guard cannot be bypassed by another writer");
    const pointAttempt=await owner.rpc("set_event_point_rules",{p_event_id:info.id,p_rules:[{placing:1,points:10}]});assert.ok(pointAttempt.error,"Information-only points rejected");
    const managed=await owner.rpc("list_managed_events");failIfError(managed.error,"Managed competition list");assert.equal(managed.data.some((e:{id:string})=>e.id===info.id),false);
    const locked=await owner.rpc("save_management_event",{p_event_id:info.id,p_edition_id:null,p_details:{...details,registrationEnabled:true,rules:"Rules"}});assert.equal(locked.error?.code,"55000");
    const teamDetails={...details,title:"QA Batch "+randomUUID(),registrationEnabled:true,format:"sport",rules:"Rules",groupMinSize:2,groupMaxSize:4,capacity:12,waitlistEnabled:true,reportingAt:"2026-12-01T11:30:00Z",rosterLockAt:"2026-11-30T12:00:00Z"};
    const teamEvent=await owner.rpc("save_management_event",{p_event_id:null,p_edition_id:edition.id,p_details:teamDetails});failIfError(teamEvent.error,"Create sports event");ids.push(teamEvent.data.id);assert.equal(teamEvent.data.batch_restricted,true);
    assert.equal(teamEvent.data.application_capacity,12);assert.equal(teamEvent.data.waitlist_enabled,true);
    failIfError((await owner.rpc("set_admin_event_state",{p_event_id:teamEvent.data.id,p_state:"open"})).error,"Open sports registration");
    const app=await student.rpc("apply_to_event",{p_event_id:teamEvent.data.id,p_idempotency_key:randomUUID(),p_answers:{}});failIfError(app.error,"Create captain application");
    failIfError((await owner.rpc("review_application",{p_application_id:app.data.id,p_state:"approved",p_reason:null})).error,"Approve captain application");
    const appointment={p_event_id:teamEvent.data.id,p_group_id:null,p_action:"appoint",p_details:{leaderApplicationId:app.data.id}};
    assert.equal((await owner.rpc("manage_team_proposal",appointment)).error?.code,"22023","Sports batch is required");
    assert.equal((await owner.rpc("manage_team_proposal",{...appointment,p_details:{...appointment.p_details,batchId:otherBatch.id}})).error?.code,"22023","Captain/batch mismatch denied");
    const appointed=await owner.rpc("manage_team_proposal",{...appointment,p_details:{...appointment.p_details,batchId:profile.batch_id}});failIfError(appointed.error,"Appoint selected-batch captain");assert.equal(appointed.data.batch_id,profile.batch_id);
    failIfError((await admin.from("events").update({batch_restricted:false}).eq("id",teamEvent.data.id)).error,"Simulate historical sports configuration");
    const workspace=await student.rpc("get_team_workspace",{p_event_id:teamEvent.data.id});failIfError(workspace.error,"Historical sports workspace");assert.equal(workspace.data.batchRestricted,true);
    const otherApp=await owner.rpc("apply_to_event",{p_event_id:teamEvent.data.id,p_idempotency_key:randomUUID(),p_answers:{}});failIfError(otherApp.error,"Create other-batch probe application");
    failIfError((await owner.rpc("review_application",{p_application_id:otherApp.data.id,p_state:"approved",p_reason:null})).error,"Approve other-batch probe");
    const mixed=await student.rpc("manage_team_proposal",{p_event_id:teamEvent.data.id,p_group_id:appointed.data.id,p_action:"save",p_details:{version:appointed.data.roster_version,name:"QA mixed squad",applicationIds:[app.data.id,otherApp.data.id]}});assert.equal(mixed.error?.code,"22023","Legacy sports flag cannot bypass member batch restriction");
    const infoEdit=await owner.rpc("attach_event_poster",{p_event_id:info.id,p_path:null,p_url:null});assert.equal(infoEdit.error?.code,"22023","Poster RPC validates nullable input");
    assert.equal((await anon.rpc("attach_event_poster",{p_event_id:info.id,p_path:"bad",p_url:"bad"})).error?.code,"42501");
    console.log("Launch admin QA passed: informational public contract, registration/operation denial, lifecycle/type locks, batch/captain scope, existing hidden values and poster RPC guards.");
  }finally{
    for(const id of ids.reverse())failIfError((await owner.rpc("delete_owned_event",{p_event_id:id})).error,"Remove launch QA probe");
    await owner.auth.signOut({scope:"local"});await student.auth.signOut({scope:"local"});
  }
}
