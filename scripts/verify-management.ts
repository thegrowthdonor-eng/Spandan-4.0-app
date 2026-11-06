import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { QA_PASSWORD } from "./qa-data";
import { requireQaEnvironment, requireQaPublicEnvironment, failIfError } from "./qa-guard";
import { toPrivateAuthEmail } from "../src/server/auth/identity";
import type { EventDetails } from "../src/lib/event-setup";

export async function verifyManagement() {
  const admin=requireQaEnvironment(), client=requireQaPublicEnvironment();
  const pepper=process.env.AUTH_IDENTITY_PEPPER!;
  async function login(roll:string,batch="2023"){
    await client.auth.signOut({scope:"local"});
    failIfError((await client.auth.signInWithPassword({email:toPrivateAuthEmail({batch,rollNumber:roll},pepper),password:QA_PASSWORD})).error,"Management QA login");
  }
  const {data:edition}=await admin.from("editions").select("id").single();
  const {data:students}=await admin.from("profiles").select("id").eq("participant_category","ug").limit(4);
  assert.ok(edition&&students&&students.length===4);
  const probeIds:string[]=[];
  const details:EventDetails={title:"QA Management "+Date.now(),category:"other",format:"solo",scoreTemplate:"generic",summary:"QA only",rules:"Follow organiser instructions.",venue:"QA room",capacity:null,waitlistEnabled:false,reportingAt:"2026-12-01T03:30:00.000Z",startsAt:"2026-12-01T04:00:00.000Z",endsAt:"2026-12-01T05:00:00.000Z",rosterLockAt:"2026-11-30T04:00:00.000Z",eligibility:{division:"open"},applicationQuestions:[{key:"position",label:"Preferred position",type:"select",required:true,options:["A","B"]}],groupMinSize:null,groupMaxSize:null,batchRestricted:false,posterUrl:null};
  try {
    await login("100");
    const summary=await client.rpc("get_management_summary");failIfError(summary.error,"Editor workspace summary");
    assert.equal(summary.data.canCreate,true);assert.equal(summary.data.events.length,0);assert.equal(summary.data.canVerify,false);
    const created=await client.rpc("save_management_event",{p_event_id:null,p_edition_id:edition.id,p_details:details});
    failIfError(created.error,"Atomic event draft creation");assert.equal(created.data.state,"draft");probeIds.push(created.data.id);
    assert.equal(created.data.application_questions[0].options.length,2);
    assert.equal(created.data.reporting_at,details.reportingAt.replace(".000Z","+00:00"));
    assert.equal(new Date(created.data.ends_at).getTime(),new Date(details.endsAt!).getTime());
    const changed={...details,category:"sport",format:"pair",groupMinSize:2,groupMaxSize:2};
    failIfError((await client.rpc("save_management_event",{p_event_id:created.data.id,p_edition_id:null,p_details:changed})).error,"Empty draft structural update");
    const solo=await client.rpc("save_management_event",{p_event_id:created.data.id,p_edition_id:null,p_details:details});
    failIfError(solo.error,"Restore empty solo draft");
    const {data:apps,error:appError}=await admin.from("applications").insert(students.map(s=>({event_id:created.data.id,student_id:s.id,idempotency_key:randomUUID()}))).select("id");
    failIfError(appError,"Create temporary QA requests");assert.ok(apps);
    const locked=await client.rpc("save_management_event",{p_event_id:created.data.id,p_edition_id:null,p_details:changed});
    assert.equal(locked.error?.code,"55000");
    const deniedReview=await client.rpc("review_application",{p_application_id:apps[0].id,p_state:"approved",p_reason:null});
    assert.equal(deniedReview.error?.code,"42501");
    await login("91");
    const incomplete=await client.rpc("save_management_event",{p_event_id:null,p_edition_id:edition.id,p_details:{...details,title:details.title+" Incomplete",rules:""}});
    failIfError(incomplete.error,"Admin also creates drafts");probeIds.push(incomplete.data.id);assert.equal(incomplete.data.state,"draft");
    assert.equal((await client.rpc("set_admin_event_state",{p_event_id:incomplete.data.id,p_state:"open"})).error?.code,"22023");
    const approved=await client.rpc("review_application",{p_application_id:apps[0].id,p_state:"approved",p_reason:null});
    failIfError(approved.error,"Approve solo participant");assert.equal(approved.data.selection_state,"selected");
    failIfError((await client.rpc("select_solo_application",{p_application_id:apps[0].id,p_state:"reserve",p_reason:null})).error,"Set reserve");
    assert.equal((await client.rpc("review_application",{p_application_id:apps[0].id,p_state:"approved",p_reason:null})).data.selection_state,"reserve");
    const bulk=await client.rpc("bulk_review_applications",{p_application_ids:[apps[1].id,randomUUID()],p_state:"approved",p_reason:null});
    assert.ok(bulk.error);
    assert.equal((await admin.from("applications").select("review_state").eq("id",apps[1].id).single()).data?.review_state,"submitted");
    const teamEvent=await client.rpc("save_management_event",{p_event_id:null,p_edition_id:edition.id,p_details:{...changed,title:details.title+" Teams"}});
    failIfError(teamEvent.error,"Create team event");probeIds.push(teamEvent.data.id);
    const {data:teamApps,error:teamAppsError}=await admin.from("applications").insert(students.slice(0,2).map(s=>({event_id:teamEvent.data.id,student_id:s.id,idempotency_key:randomUUID()}))).select("id");
    failIfError(teamAppsError,"Create team applications");assert.ok(teamApps);
    for(const a of teamApps){
      const approval=await client.rpc("review_application",{p_application_id:a.id,p_state:"approved",p_reason:null});
      failIfError(approval.error,"Team applicant approval");assert.equal(approval.data.selection_state,"unselected");
    }
    const teamArgs={p_event_id:teamEvent.data.id,p_name:"QA Pair",p_batch_id:null,p_captain_id:null};
    const failedTeam=await client.rpc("publish_management_team",{...teamArgs,p_application_ids:[teamApps[0].id]});
    assert.ok(failedTeam.error);
    assert.equal((await admin.from("participant_groups").select("*",{head:true,count:"exact"}).eq("event_id",teamEvent.data.id)).count,0);
    const published=await client.rpc("publish_management_team",{...teamArgs,p_application_ids:teamApps.map(a=>a.id)});
    failIfError(published.error,"Atomic team publication");assert.equal(published.data.state,"published");
    const teams=await client.rpc("get_management_teams",{p_event_id:teamEvent.data.id});
    failIfError(teams.error,"Read managed team members");assert.equal(teams.data[0].members.length,2);
    await login("95");
    assert.equal((await client.rpc("save_management_event",{p_event_id:created.data.id,p_edition_id:null,p_details:details})).error?.code,"42501");
    assert.equal((await client.rpc("get_management_teams",{p_event_id:teamEvent.data.id})).error?.code,"42501");
    await login("1","2021");
    assert.equal((await client.rpc("can_use_management")).data,false);
    assert.equal((await client.rpc("get_management_summary")).data.events.length,0);
    console.log("Management QA passed: role visibility, atomic event save, draft-only creation, schedule retention, structure locks, approval/roster parity, team rollback and scoped access.");
  } finally {
    await login("91");
    for(const id of probeIds.reverse())failIfError((await client.rpc("delete_owned_event",{p_event_id:id})).error,"Clean up management QA probe");
    await client.auth.signOut({scope:"local"});
  }
}
