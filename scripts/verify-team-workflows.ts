import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { QA_PASSWORD } from "./qa-data";
import { requireQaEnvironment, requireQaPublicEnvironment, failIfError } from "./qa-guard";
import { toPrivateAuthEmail } from "../src/server/auth/identity";

export async function verifyTeamWorkflows() {
  const admin = requireQaEnvironment();
  async function login(roll: string, batch = "2021") {
    const client = requireQaPublicEnvironment();
    failIfError((await client.auth.signInWithPassword({ email: toPrivateAuthEmail({ batch, rollNumber: roll }, process.env.AUTH_IDENTITY_PEPPER!), password: QA_PASSWORD })).error, "Team QA login");
    return client;
  }
  const [owner, one, two, three, four, coordinator, editor, inactive] = await Promise.all([login("91","2023"),login("1"),login("2"),login("3"),login("4"),login("95","2023"),login("100","2023"),login("99","2023")]);
  const extraPerformers = await Promise.all(["5","6","7","8"].map(roll => login(roll)).concat(["1","2","3","4","5","6","7"].map(roll => login(roll,"2022"))));
  const users = await Promise.all([one,two,three,four].map(async c => (await c.auth.getUser()).data.user!.id));
  const { data: edition } = await admin.from("editions").select("id").single();
  const batchId=(await admin.from("profiles").select("batch_id").eq("id",users[0]).single()).data!.batch_id;
  const probeIds: string[] = [];
  async function event(format: string) {
    const { data, error } = await admin.from("events").insert({ edition_id: edition!.id, slug: "qa-team-"+randomUUID(), title: "QA Team Workflow "+format, category: "other", format, state: "open", summary: "QA only", rules_markdown: "Follow instructions", venue: "QA room", score_template: "generic", application_opens_at: "2026-01-01T00:00:00Z", application_closes_at: "2026-12-01T00:00:00Z", roster_lock_at: "2026-12-02T00:00:00Z", eligibility: {division:"open"}, group_min_size: format === "solo" ? null : 2, group_max_size: format === "pair" ? 2 : format === "solo" ? null : 4, batch_restricted: true, application_questions: [{key:"position",label:"Preferred position",type:"select",required:true,options:["A","B"]}] }).select("id").single();
    failIfError(error,"Create team workflow probe"); probeIds.push(data!.id); return data!.id as string;
  }
  const team = (client: typeof owner, eventId: string, groupId: string | null, action: string, details: Record<string,unknown> = {}) => client.rpc("manage_team_proposal",{p_event_id:eventId,p_group_id:groupId,p_action:action,p_details:{batchId,...details}});
  const pair = (client: typeof owner, eventId: string, action: string, invitationId: string | null = null, partnerId: string | null = null, answers: Record<string,string> = {}) => client.rpc("pair_invitation_command",{p_event_id:eventId,p_action:action,p_invitation_id:invitationId,p_partner_id:partnerId,p_answers:answers});
  try {
    const sport = await event("sport"), pairs = await event("pair"), solo = await event("solo"), groupEvent = await event("group");
    const apps: string[] = [];
    for (const c of [one,two,three,four]) {
      const applied = await c.rpc("apply_to_event",{p_event_id:sport,p_idempotency_key:randomUUID(),p_answers:{position:"A"}});
      failIfError(applied.error,"Register squad candidate"); apps.push(applied.data.id);
      failIfError((await owner.rpc("review_application",{p_application_id:applied.data.id,p_state:"approved",p_reason:null})).error,"Approve squad candidate");
    }
    assert.equal((await team(coordinator,sport,null,"appoint",{leaderApplicationId:apps[0]})).error?.code,"42501","Unassigned coordinator denied");
    assert.equal((await team(editor,sport,null,"appoint",{leaderApplicationId:apps[0]})).error?.code,"42501","Editor cannot appoint");
    assert.equal((await inactive.rpc("get_team_workspace",{p_event_id:sport})).error?.code,"42501");
    assert.equal((await owner.rpc("get_team_workspace",{p_event_id:solo})).error?.code,"42501","Solo has no team workspace");
    assert.equal((await team(owner,pairs,null,"appoint",{leaderApplicationId:apps[0]})).error?.code,"42501","Pairs have no captain appointment");
    const appointed = await team(owner,sport,null,"appoint",{leaderApplicationId:apps[0]}); failIfError(appointed.error,"Appoint captain");
    let g = appointed.data;
    assert.equal(g.proposal_ready,false);
    assert.equal((await team(owner,sport,g.id,"save",{version:g.roster_version,name:"Staff cannot start",applicationIds:apps.slice(0,2)})).error?.code,"22023");
    assert.equal((await team(two,sport,g.id,"save",{version:g.roster_version,name:"Not my team",applicationIds:apps.slice(0,2)})).error?.code,"42501");
    const personal = await one.rpc("get_team_workspace",{p_event_id:sport}); failIfError(personal.error,"Captain workspace"); assert.equal(personal.data.groups.length,1);
    const hidden = await two.rpc("get_team_workspace",{p_event_id:sport}); failIfError(hidden.error,"Non-leader workspace"); assert.equal(hidden.data.groups.length,0); assert.equal(hidden.data.candidates.length,0);
    const saved = await team(one,sport,g.id,"save",{version:g.roster_version,name:"Captain's XI",applicationIds:apps.slice(0,2)}); failIfError(saved.error,"Captain initial proposal"); g=saved.data;
    assert.equal((await admin.from("group_memberships").select("*",{head:true,count:"exact"}).eq("group_id",g.id).is("removed_at",null)).count,0,"Draft proposals reserve nobody");
    assert.equal((await team(one,sport,g.id,"save",{version:0,name:"Stale",applicationIds:apps.slice(0,2)})).error?.code,"55000");
    assert.equal((await team(owner,sport,g.id,"publish",{version:g.roster_version})).error?.code,"22023","Cannot publish before leader submission");
    const submitted = await team(one,sport,g.id,"submit",{version:g.roster_version}); failIfError(submitted.error,"Captain submits"); g=submitted.data;
    assert.equal((await team(one,sport,g.id,"publish",{version:g.roster_version})).error?.code,"42501");
    const returned=await team(owner,sport,g.id,"return",{version:g.roster_version,reason:"Include a substitute"});failIfError(returned.error,"Return roster");g=returned.data;
    const changed=await team(one,sport,g.id,"save",{version:g.roster_version,name:"Captain's XI",applicationIds:apps.slice(0,3)});failIfError(changed.error,"Captain responds");g=changed.data;
    g=(await team(one,sport,g.id,"submit",{version:g.roster_version})).data;
    const published=await team(owner,sport,g.id,"publish",{version:g.roster_version});failIfError(published.error,"Approve captain squad");g=published.data;assert.equal(g.state,"published");
    assert.equal((await team(one,sport,g.id,"save",{version:g.roster_version,name:"Silent edit",applicationIds:apps.slice(0,2)})).error?.code,"22023");
    assert.equal((await team(owner,sport,g.id,"save",{version:g.roster_version,name:g.name,applicationIds:[apps[0],apps[3]]})).error?.code,"22023","Published correction requires reason");
    const corrected=await team(owner,sport,g.id,"save",{version:g.roster_version,name:"Captain's XI Updated",applicationIds:[apps[0],apps[3]],reason:"Player replacement after organiser review"});failIfError(corrected.error,"Coordinator edits proposed team");g=corrected.data;
    assert.equal((await admin.from("applications").select("selection_state").eq("id",apps[1]).single()).data?.selection_state,"unselected");
    assert.equal((await admin.from("applications").select("selection_state").eq("id",apps[3]).single()).data?.selection_state,"selected");
    assert.equal((await one.rpc("withdraw_application",{p_application_id:apps[0]})).error?.code,"22023");
    // Group leaders use the same proposal flow without requiring a sports event.
    const ga=await one.rpc("apply_to_event",{p_event_id:groupEvent,p_idempotency_key:randomUUID(),p_answers:{position:"B"}});failIfError(ga.error,"Group registration");
    failIfError((await owner.rpc("review_application",{p_application_id:ga.data.id,p_state:"approved",p_reason:null})).error,"Approve group leader");
    failIfError((await team(owner,groupEvent,null,"appoint",{leaderApplicationId:ga.data.id})).error,"Appoint group leader");
    // One mixed-size stage event reuses the group workflow, including single-member rosters.
    const performanceEvent = await event("group");
    failIfError((await admin.from("events").update({operating_method:"programme",group_min_size:1,group_max_size:8,batch_restricted:false}).eq("id",performanceEvent)).error,"Configure stage performances");
    const performers = [one,two,three,four,...extraPerformers];
    const performanceApps: string[] = [];
    for (const performer of performers) {
      const applied = await performer.rpc("apply_to_event",{p_event_id:performanceEvent,p_idempotency_key:randomUUID(),p_answers:{position:"A"}});
      failIfError(applied.error,"Register performer"); performanceApps.push(applied.data.id);
    }
    for (const id of performanceApps.slice(0,-1)) failIfError((await owner.rpc("review_application",{p_application_id:id,p_state:"approved",p_reason:null})).error,"Approve performer");
    const first = await team(owner,performanceEvent,null,"appoint",{leaderApplicationId:performanceApps[0]}); failIfError(first.error,"Appoint solo performance lead");
    assert.equal((await team(one,performanceEvent,first.data.id,"save",{version:first.data.roster_version,name:"Unapproved member",applicationIds:[performanceApps[0],performanceApps.at(-1)]})).error?.code,"22023");
    failIfError((await owner.rpc("review_application",{p_application_id:performanceApps.at(-1),p_state:"approved",p_reason:null})).error,"Approve remaining performer");
    let offset = 0;
    for (const size of [1,2,3,8]) {
      const appointed = offset === 0 ? first : await team(owner,performanceEvent,null,"appoint",{leaderApplicationId:performanceApps[offset]}); failIfError(appointed.error,"Appoint performance lead");
      let roster = appointed.data;
      if (size === 8) assert.equal((await team(performers[offset],performanceEvent,roster.id,"save",{version:roster.roster_version,name:"Too many performers",applicationIds:performanceApps.slice(6,15)})).error?.code,"22023","Nine performers rejected");
      const saved = await team(performers[offset],performanceEvent,roster.id,"save",{version:roster.roster_version,name:`Performance ${size}`,applicationIds:performanceApps.slice(offset,offset+size)}); failIfError(saved.error,"Save performance"); roster=saved.data;
      const submitted = await team(performers[offset],performanceEvent,roster.id,"submit",{version:roster.roster_version}); failIfError(submitted.error,"Submit performance");
      const published = await team(owner,performanceEvent,roster.id,"publish",{version:submitted.data.roster_version}); failIfError(published.error,"Publish performance roster");
      assert.equal(published.data.state,"published");
      assert.equal((await admin.from("group_memberships").select("*",{head:true,count:"exact"}).eq("group_id",roster.id).is("removed_at",null)).count,size);
      offset += size;
    }
    const conflict = await team(owner,performanceEvent,null,"appoint",{leaderApplicationId:performanceApps[14]}); failIfError(conflict.error,"Appoint duplicate-membership probe lead");
    const conflictingSave = await team(performers[14],performanceEvent,conflict.data.id,"save",{version:conflict.data.roster_version,name:"Conflicting performance",applicationIds:[performanceApps[14],performanceApps[0]]}); failIfError(conflictingSave.error,"Draft membership does not reserve performers");
    const conflictingSubmit = await team(performers[14],performanceEvent,conflict.data.id,"submit",{version:conflictingSave.data.roster_version}); failIfError(conflictingSubmit.error,"Submit conflicting draft");
    assert.equal((await team(owner,performanceEvent,conflict.data.id,"publish",{version:conflictingSubmit.data.roster_version})).error?.code,"22023","One final performance per student");
    const stageResults = await owner.rpc("publish_unified_results",{p_event_id:performanceEvent,p_positions:[]});
    assert.equal(stageResults.error?.code,"22023"); assert.match(stageResults.error!.message,/without official results/);
    failIfError((await admin.from("events").update({roster_lock_at:"2026-01-01T00:00:00Z"}).eq("id",performanceEvent)).error,"Lock performance roster");
    assert.equal((await team(performers[14],performanceEvent,conflict.data.id,"save",{version:conflictingSubmit.data.roster_version,name:"Locked",applicationIds:[performanceApps[14]]})).error?.code,"22023");
    assert.equal((await pair(one,pairs,"invite",null,users[1])).error?.code,"22023","Required questions cannot be skipped");
    assert.equal((await admin.from("applications").select("*",{head:true,count:"exact"}).eq("event_id",pairs)).count,0,"Failed invite registration is atomic");
    const inv=await pair(one,pairs,"invite",null,users[1],{position:"A"});failIfError(inv.error,"Invite intended partner");
    const competing=await pair(three,pairs,"invite",null,users[1],{position:"B"});failIfError(competing.error,"Pending invite does not reserve partner");
    const senderAttempt=await pair(one,pairs,"accept",inv.data.id);assert.equal(senderAttempt.error?.code,"42501");
    assert.equal((await pair(two,pairs,"accept",inv.data.id)).error?.code,"22023","Recipient required answers enforced");
    const competingAcceptance=await Promise.all([pair(two,pairs,"accept",inv.data.id,null,{position:"B"}),pair(two,pairs,"accept",competing.data.id,null,{position:"B"})]);
    assert.equal(competingAcceptance.filter(r=>!r.error).length,1,"Concurrent accepts produce exactly one pair");
    const confirmed=competingAcceptance.find(r=>!r.error)!.data;
    const acceptedGroup=(await admin.from("participant_groups").select("*").eq("id",confirmed.group_id).single()).data!;
    assert.equal(acceptedGroup.captain_id,null);assert.equal(acceptedGroup.state,"draft");
    assert.equal((await two.rpc("get_my_team_events")).data.some((e:{id:string})=>e.id===pairs),true);
    assert.equal((await pair(four,pairs,"invite",null,users[1],{position:"A"})).error?.code,"22023","Confirmed pair prevents partner theft");
    assert.equal((await team(owner,pairs,acceptedGroup.id,"publish",{version:acceptedGroup.roster_version})).error?.code,"22023","Both applications need approval");
    const pa=(await admin.from("applications").select("id").eq("event_id",pairs)).data!;
    for(const a of pa)failIfError((await owner.rpc("review_application",{p_application_id:a.id,p_state:"approved",p_reason:null})).error,"Approve pair application");
    const ownApp=(await admin.from("applications").select("id").eq("event_id",pairs).eq("student_id",users[1]).single()).data!;
    assert.equal((await two.rpc("withdraw_application",{p_application_id:ownApp.id})).error?.code,"22023","Cannot leave a ghost pair by withdrawing");
    const pp=await team(owner,pairs,acceptedGroup.id,"publish",{version:acceptedGroup.roster_version});failIfError(pp.error,"Publish consented pair");
    assert.equal((await pair(two,pairs,"leave",confirmed.id)).error?.code,"22023","Published pair requires organiser correction");
    const released=await team(owner,pairs,acceptedGroup.id,"dissolve",{version:pp.data.roster_version,reason:"Partner change requested"});failIfError(released.error,"Audited pair release");
    assert.equal((await admin.from("group_memberships").select("*",{head:true,count:"exact"}).eq("group_id",acceptedGroup.id).is("removed_at",null)).count,0);
    const again=await pair(one,pairs,"invite",null,users[1]);failIfError(again.error,"Existing registration reused");
    const againAccept=await pair(two,pairs,"accept",again.data.id);failIfError(againAccept.error,"Fresh mutual consent after correction");
    failIfError((await pair(two,pairs,"leave",again.data.id)).error,"Leave before publication");
    failIfError((await admin.from("events").update({roster_lock_at:"2026-01-01T00:00:00Z"}).eq("id",sport)).error,"Lock roster");
    assert.equal((await team(owner,sport,g.id,"save",{version:g.roster_version,name:g.name,applicationIds:[apps[0],apps[3]],reason:"Too late"})).error?.code,"22023");
    const anon=requireQaPublicEnvironment();
    for(const rpc of ["get_my_team_events","get_team_workspace","manage_team_proposal","pair_invitation_command","find_pair_partner"]){
      const args=rpc==="get_my_team_events"?{}:rpc==="get_team_workspace"?{p_event_id:pairs}:rpc==="find_pair_partner"?{p_event_id:pairs,p_batch_id:randomUUID(),p_roll:"1"}:rpc==="manage_team_proposal"?{p_event_id:sport,p_group_id:g.id,p_action:"publish",p_details:{}}:{p_event_id:pairs,p_action:"invite"};
      assert.equal((await anon.rpc(rpc,args)).error?.code,"42501",rpc+" anon denied");
    }
    console.log("Team/pair QA passed: captain-only initial roster, staff corrections, privacy, consent, automatic registration, concurrency, exclusivity, withdrawal guards, locks and legacy bypass denial.");
  } finally {
    for(const id of probeIds.reverse())failIfError((await owner.rpc("delete_owned_event",{p_event_id:id})).error,"Clean up team workflow probe");
    await Promise.all([owner,one,two,three,four,coordinator,editor,inactive,...extraPerformers].map(c=>c.auth.signOut({scope:"local"})));
  }
}
