import assert from "node:assert/strict";
import { createHash,randomBytes,randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { requireQaEnvironment,requireQaPublicEnvironment,failIfError } from "./qa-guard";
import { QA_PASSWORD } from "./qa-data";
import { toPrivateAuthEmail } from "../src/server/auth/identity";

async function main() {
  if (process.argv.includes("--browser")) process.env.QA_BROWSER_VERIFY="true";
  const networkFetch=globalThis.fetch;
  globalThis.fetch=(input,init)=>networkFetch(input,{...init,signal:init?.signal ?? AbortSignal.timeout(20_000)});
  const admin=requireQaEnvironment(),anon=requireQaPublicEnvironment();
  const base=process.env.QA_APP_URL ?? "http://localhost:3002";
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Use the local isolated QA application.");
  const login=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({batch:"2023",rollNumber:"91",password:QA_PASSWORD})});
  assert.equal(login.status,200,await login.text());
  const cookie=login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  const api=async(path:string,data:unknown,expected=200)=>{const response=await fetch(`${base}${path}`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie,Origin:base},body:JSON.stringify(data)});const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;};
  const command=async(eventId:string,action:string,data:unknown,expected=200)=>{try{return await api("/api/competition",{eventId,action,data},expected);}catch(error){throw new Error(`Competition ${action}: ${error instanceof Error ? error.message : String(error)}`);}};
  const workspace=async(eventId:string)=>{const response=await fetch(`${base}/api/competition?event=${eventId}`,{headers:{Cookie:cookie}});assert.equal(response.status,200);return (await response.json()).workspace;};
  const {data:source,error:sourceError}=await admin.from("events").select("*").eq("format","solo").eq("registration_enabled",true).limit(1).single();failIfError(sourceError,"Read QA source event");
  const {data:apps,error:appError}=await admin.from("applications").select("*").eq("event_id",source!.id).eq("review_state","approved").neq("selection_state","not_selected").limit(3);failIfError(appError,"Read QA approved entrants");assert.equal(apps?.length,3);
  const owner=(await admin.from("staff_assignments").select("profile_id").eq("role","main_admin").is("revoked_at",null).limit(1).single()).data!.profile_id;
  const ids:string[]=[];const reports:unknown[]=[];
  async function event(title:string,scoreTemplate="generic",registrationEnabled=true) {const id=randomUUID();ids.push(id);const created=await admin.from("events").insert({...source,id,slug:`qa-competition-${id}`,title:`QA ${title} ${id}`,state:registrationEnabled ? "open" : "published",score_template:scoreTemplate,registration_enabled:registrationEnabled});failIfError(created.error,"Create QA event");const entrants=registrationEnabled ? apps!.map(app=>({...app,id:randomUUID(),event_id:id,idempotency_key:randomUUID()})) : [];if(entrants.length)failIfError((await admin.from("applications").insert(entrants)).error,"Create QA entrants");return {id,entrants};}
  try {
    const measurement=await event("measurement");
    await command(measurement.id,"settings",{schedule_mode:"flight",result_mode:"distance",attempts:3,measurement_method:"QA measuring tape",submission_closes_at:null,version:0});
    await command(measurement.id,"sessions",{sessions:[{title:"QA final",venue:"QA field",starts_at:new Date().toISOString(),reporting_at:null,ends_at:null,is_final:true,entrants:measurement.entrants.map((app,i)=>({application_id:app.id,group_id:null,position:i+1}))}]});
    let w=await workspace(measurement.id);let s=w.sessions[0];
    await command(measurement.id,"session_state",{session_id:s.id,version:s.version,state:"scheduled"});w=await workspace(measurement.id);s=w.sessions[0];
    await command(measurement.id,"session_state",{session_id:s.id,version:s.version,state:"live"});w=await workspace(measurement.id);s=w.sessions[0];
    const liveResponse=await fetch(`${base}/api/public/live`,{credentials:"omit"});assert.equal(liveResponse.status,200);assert.equal(liveResponse.headers.get("set-cookie"),null);assert.match(liveResponse.headers.get("cache-control") ?? "",/s-maxage=60/);
    const ground=await liveResponse.json();assert.ok(ground.live.some((item:{id:string;kind:string})=>item.id===s.id && item.kind==="competition"),"Live Ground omitted the live measurement session");
    await command(measurement.id,"session_results",{session_id:s.id,version:s.version,reason:"",results:s.entrants.map((row:{id:string},i:number)=>({id:row.id,status:"valid",attempts:[5000-i*100,null,4800],placing:i+1,note:"Confirmed by official"}))});
    w=await workspace(measurement.id);s=w.sessions[0];await command(measurement.id,"session_state",{session_id:s.id,version:s.version,state:"completed"});
    assert.equal((await anon.rpc("public_competition",{p_event_id:measurement.id})).data.sessions[0].state,"completed");
    reports.push({check:"measurement and final session API",ok:true});
    const families:Array<{eventId:string;title:string}>=[];
    for (const [scheduleMode,resultMode] of [["heat","time"],["session","count"],["running_order","faculty_places"],["information","none"]] as const) {
      const item=await event(scheduleMode,"generic",scheduleMode!=="information");
      await command(item.id,"settings",{schedule_mode:scheduleMode,result_mode:resultMode,attempts:1,submission_closes_at:null,version:0});
      const title=`QA ${scheduleMode} final`;
      await command(item.id,"sessions",{sessions:[{title,venue:"QA venue",starts_at:new Date().toISOString(),reporting_at:null,ends_at:null,is_final:resultMode!=="none",entrants:item.entrants.map((app,i)=>({application_id:app.id,group_id:null,position:i+1}))}]});
      let current=(await workspace(item.id)).sessions[0];
      for (const state of ["scheduled","live"]) {await command(item.id,"session_state",{session_id:current.id,version:current.version,state});current=(await workspace(item.id)).sessions[0];}
      if (resultMode!=="none") {await command(item.id,"session_results",{session_id:current.id,version:current.version,reason:"",results:current.entrants.map((row:{id:string},i:number)=>({id:row.id,status:"valid",attempts:resultMode==="faculty_places" ? [] : [resultMode==="time" ? 12000+i*100 : 30-i],placing:i+1,note:"Official confirmation"}))});current=(await workspace(item.id)).sessions[0];}
      await command(item.id,"session_state",{session_id:current.id,version:current.version,state:"completed"});families.push({eventId:item.id,title});
    }
    reports.push({check:"heats/time, challenges/count, faculty places and information-only sessions",ok:true});

    const match=await event("atomic start","football");
    const fixture=await api("/api/admin/fixtures",{action:"create",eventId:match.id,stage:"QA atomic start",participantALabel:"QA A",participantBLabel:"QA B",venue:"QA ground",reportingAt:null,startsAt:new Date().toISOString()});
    const fixtureId=fixture.fixture?.id ?? fixture.fixtureId ?? fixture.id ?? (await admin.from("fixtures").select("id").eq("event_id",match.id).single()).data!.id;
    const device=randomUUID();
    await api("/api/admin/fixtures/prepare-offline",{fixtureId,deviceId:device},400);
    const started=await api("/api/admin/fixtures/prepare-offline",{fixtureId,deviceId:device,start:true});assert.ok(started.fixture.actualStartedAt);
    const snapshotsBefore=(await admin.from("score_snapshots").select("id").eq("fixture_id",fixtureId)).data!.length;
    await api("/api/admin/fixtures/prepare-offline",{fixtureId,deviceId:device,start:true});
    assert.equal((await admin.from("score_snapshots").select("id").eq("fixture_id",fixtureId)).data!.length,snapshotsBefore,"Double Start created a second snapshot");
    await api("/api/admin/fixtures/prepare-offline",{fixtureId,deviceId:randomUUID(),start:true},409);
    reports.push({check:"explicit start, double start and lease conflict",ok:true});

    const voting=await event("public voting");
    await command(voting.id,"settings",{schedule_mode:"submission",result_mode:"public_vote",attempts:1,submission_closes_at:new Date(Date.now()-120_000).toISOString(),version:0});
    const entries=[];
    const publicImage=(await admin.from("events").select("poster_url").not("poster_url","is",null).limit(1).single()).data!.poster_url;
    for (const [index,app] of voting.entrants.entries()) {
      const assetId=randomUUID();failIfError((await admin.from("media_assets").insert({id:assetId,owner_id:owner,event_id:voting.id,purpose:"competition",provider:"supabase",object_key:`qa-mock/${voting.id}/${index}`,state:"public",input_mime:"image/webp",input_size:100,expires_at:new Date().toISOString(),public_url:publicImage})).error,"Create explicitly mocked media fixture");
      const entry=await admin.from("competition_entries").insert({event_id:voting.id,application_id:app.id,title:`QA work ${index+1}`,media_id:assetId,public_media_url:publicImage,submitted_by:owner,state:"approved"}).select().single();failIfError(entry.error,"Create approved QA entry");entries.push(entry.data!);
    }
    const roundWindow=()=>({opens_at:new Date(Date.now()-60_000).toISOString(),closes_at:new Date(Date.now()+300_000).toISOString()});
    await api("/api/admin/results",{action:"setPointRules",eventId:voting.id,rules:[{placing:1,points:10},{placing:2,points:7},{placing:3,points:5}]});
    await command(voting.id,"voting_round",roundWindow());
    w=await workspace(voting.id);let round=w.rounds[0];
    if (process.env.QA_BROWSER_VERIFY === "true") {
      const {verifyBrowserVoting}=await import("./verify-competition-browser");
      await verifyBrowserVoting({base,votingId:voting.id});
    }
    let publicData=(await anon.rpc("public_competition",{p_event_id:voting.id})).data;
    assert.ok(publicData.rounds[0].options.every((o:{votes:number|null})=>o.votes===null),"Hidden totals leaked");
    assert.ok((await anon.from("poll_options").select("vote_count")).error,"Raw counters leaked");
    assert.ok((await anon.rpc("cast_competition_vote",{p_token:"0".repeat(64),p_option_id:publicData.rounds[0].options[0].id})).error,"Invalid capability accepted");
    const grant=await api("/api/competition/voting",{pollId:round.id});assert.equal(grant.token.length,64);
    for (const concurrency of [1,4,8]) {
      const latencies:number[]=[];const outcomes=await Promise.all(Array.from({length:concurrency},async()=>{const start=performance.now();const result=await anon.rpc("cast_competition_vote",{p_token:grant.token,p_option_id:publicData.rounds[0].options[0].id});latencies.push(performance.now()-start);assert.equal(result.error,null,JSON.stringify(result.error));assert.equal(result.data.optionId,publicData.rounds[0].options[0].id);return result.data.receiptId;}));
      assert.equal(new Set(outcomes).size,1);latencies.sort((a,b)=>a-b);reports.push({check:"duplicate-vote retry ramp",concurrency,requests:concurrency,errors:0,minMs:Math.round(latencies[0]),p95Ms:Math.round(latencies[Math.ceil(latencies.length*.95)-1])});
    }
    let expectedVotes=process.env.QA_BROWSER_VERIFY === "true" ? 2 : 1;
    const voterFixtures=Array.from({length:13},(_,index)=>({batch:index<8 ? "2022" : "2024",rollNumber:String(index<8 ? index+1 : index-7)}));
    let fixtureOffset=0;
    for (const concurrency of [1,4,8]) {
      const capabilities=await Promise.all(voterFixtures.slice(fixtureOffset,fixtureOffset+concurrency).map(async identity=>{
        const voter=requireQaPublicEnvironment();failIfError((await voter.auth.signInWithPassword({email:toPrivateAuthEmail(identity,process.env.AUTH_IDENTITY_PEPPER!),password:QA_PASSWORD})).error,"Sign into a fictional stress voter");
        const token=randomBytes(32).toString("hex");failIfError((await voter.rpc("register_competition_vote_grant",{p_poll_id:round.id,p_hash:createHash("sha256").update(token).digest("hex")})).error,"Prepare scoped QA voting capability");return {token,voter};
      }));
      fixtureOffset+=concurrency;
      const latencies:number[]=[];
      const outcomes=await Promise.all(capabilities.map(async({token})=>{const start=performance.now();const result=await anon.rpc("cast_competition_vote",{p_token:token,p_option_id:publicData.rounds[0].options[0].id});latencies.push(performance.now()-start);failIfError(result.error,"Concurrent fresh vote");return result.data.receiptId;}));
      assert.equal(new Set(outcomes).size,concurrency);expectedVotes+=concurrency;latencies.sort((a,b)=>a-b);
      reports.push({check:"distinct active-voter insertion ramp; shared option-counter hotspot",concurrency,requests:concurrency,errors:0,minMs:Math.round(latencies[0]),p95Ms:Math.round(latencies[Math.ceil(latencies.length*.95)-1])});
      await Promise.all(capabilities.map(({voter})=>voter.auth.signOut()));
    }
    assert.equal((await admin.from("poll_votes").select("id").eq("poll_id",round.id)).data!.length,expectedVotes);
    assert.equal((await admin.from("poll_options").select("vote_count").eq("poll_id",round.id)).data!.reduce((n,row)=>n+row.vote_count,0),expectedVotes);
    failIfError((await admin.from("polls").update({closes_at:new Date(Date.now()-1_000).toISOString()}).eq("id",round.id)).error,"Close QA round");
    await command(voting.id,"verify_votes",{},400);
    await command(voting.id,"voting_round",{...roundWindow(),entry_ids:[entries[1].id]},400);
    await command(voting.id,"voting_round",{...roundWindow(),entry_ids:entries.slice(1).map(e=>e.id)});
    publicData=(await anon.rpc("public_competition",{p_event_id:voting.id})).data;round=publicData.rounds[1];
    const runoff=await api("/api/competition/voting",{pollId:round.id});failIfError((await anon.rpc("cast_competition_vote",{p_token:runoff.token,p_option_id:round.options[0].id})).error,"Cast runoff vote");
    failIfError((await admin.from("polls").update({closes_at:new Date(Date.now()-1_000).toISOString()}).eq("id",round.id)).error,"Close runoff");
    await command(voting.id,"verify_votes",{});w=await workspace(voting.id);assert.equal(w.placements.length,3);
    await api("/api/admin/results",{action:"setPointRules",eventId:voting.id,rules:[{placing:1,points:10},{placing:2,points:7},{placing:3,points:5}]},409);
    await api("/api/admin/results",{action:"publish",eventId:voting.id,positions:w.placements.map((place:{placing:number;entry_id:string})=>({placing:place.placing,applicationId:entries.find(entry=>entry.id===place.entry_id)!.application_id})),reason:"QA verified voting integration"});
    const publication=(await admin.from("result_publications").select("id").eq("event_id",voting.id).eq("state","published").single()).data!;
    assert.equal((await admin.from("points_ledger").select("points").eq("publication_id",publication.id)).data!.reduce((sum,row)=>sum+row.points,0),22);
    reports.push({check:"hidden totals, immutable receipts, atomic counters, podium runoff and official points",ok:true});
    if (process.env.QA_BROWSER_VERIFY === "true") {
      for (const [stage,offset] of [["QA browser scoring",0],["QA future bookmark",86_400_000]] as const) await api("/api/admin/fixtures",{action:"create",eventId:match.id,stage,participantALabel:"QA Browser A",participantBLabel:"QA Browser B",venue:"QA ground",reportingAt:null,startsAt:new Date(Date.now()+offset).toISOString()});
      const future=(await admin.from("fixtures").select("id").eq("event_id",match.id).eq("stage","QA future bookmark").single()).data!.id;
      const {verifyCompetitionBrowser}=await import("./verify-competition-browser");
      await verifyCompetitionBrowser({base,measurementId:measurement.id,matchId:match.id,votingId:voting.id,futureFixture:future,families});
      reports.push({check:"mobile competition, direct metadata, pre-start bookmark, one-action scorer and offline checkpoint",ok:true});
    }
    console.log(JSON.stringify({project:"isolated QA",media:"mock registry; not R2 staging verification",reports},null,2));
  } finally {
    // Only newly-created, explicitly tracked fictional QA event IDs are removed. No existing fixtures/media are touched.
    for (const id of ids) {
      const publications=(await admin.from("result_publications").select("id").eq("event_id",id)).data ?? [];
      if (publications.length) for(const table of ["points_ledger","result_positions"]) failIfError((await admin.from(table).delete().in("publication_id",publications.map(p=>p.id))).error,`Remove QA ${table}`);
      for (const table of ["polls","result_publications","point_rules","competition_placements","competition_entries","competition_sessions","fixtures","media_assets","applications","competition_settings","events"]) failIfError((await admin.from(table).delete().eq(table==="events" ? "id" : "event_id",id)).error,`Clean new QA ${table}`);
    }
  }
}
main().catch(error=>{console.error(error instanceof Error ? error.message : error);process.exitCode=1;});
