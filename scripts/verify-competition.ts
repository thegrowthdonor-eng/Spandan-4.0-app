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
  const ids:string[]=[];const reports:unknown[]=[];
  async function event(title:string,scoreTemplate="generic",registrationEnabled=true,method:"live_matches"|"fixtures_only"|"results_only"|"voting"|"programme"="results_only",unit:"seconds"|"metres"|"count"|null=null,entryFormat:"image"|"text"="image") {const id=randomUUID();ids.push(id);const created=await admin.from("events").insert({...source,id,slug:`qa-competition-${id}`,title:`QA ${title} ${id}`,state:registrationEnabled ? "open" : "published",score_template:scoreTemplate,registration_enabled:registrationEnabled,operating_method:method,result_unit:unit,entry_format:entryFormat});failIfError(created.error,"Create QA event");const entrants=registrationEnabled ? apps!.map(app=>({...app,id:randomUUID(),event_id:id,idempotency_key:randomUUID()})) : [];if(entrants.length)failIfError((await admin.from("applications").insert(entrants)).error,"Create QA entrants");return {id,entrants};}
  try {
    const saved=await api("/api/admin/events",{eventId:null,editionId:source!.edition_id,details:{title:"QA configured literary "+randomUUID(),category:"literary",format:"solo",registrationEnabled:true,scoreTemplate:"generic",operatingMethod:"voting",entryFormat:"text",resultUnit:null,summary:"QA event configuration",rules:"QA only",venue:"QA room",capacity:null,waitlistEnabled:false,reportingAt:null,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3_600_000).toISOString(),rosterLockAt:null,eligibility:{division:"open"},applicationQuestions:[],groupMinSize:null,groupMaxSize:null,batchRestricted:false,posterUrl:null}});
    ids.push(saved.eventId);
    const configured=(await admin.from("events").select("operating_method,entry_format").eq("id",saved.eventId).single()).data!;
    assert.deepEqual(configured,{operating_method:"voting",entry_format:"text"});
    const measurement=await event("manual results","generic",true,"results_only","metres");
    const rules=[{placing:1,points:10},{placing:2,points:7},{placing:3,points:5}];
    await api("/api/admin/results",{action:"setPointRules",eventId:measurement.id,rules});
    const manualPositions=measurement.entrants.map((app,index)=>({placing:index+1,applicationId:app.id,finalValue:String(5-index*.1)}));
    await api("/api/admin/results",{action:"publish",eventId:measurement.id,positions:manualPositions,expectedVersion:0});
    await api("/api/admin/results",{action:"publish",eventId:measurement.id,positions:manualPositions,expectedVersion:0,reason:"Stale attempt"},409);
    assert.equal((await admin.from("result_positions").select("final_value,value_unit").eq("application_id",measurement.entrants[0].id).single()).data!.value_unit,"metres");
    await command(measurement.id,"sessions",{sessions:[]},400);
    const stage=await event("Stage performance","generic",true,"programme");
    await api("/api/admin/results",{action:"publish",eventId:stage.id,positions:manualPositions},400);
    const board=await event("Chess pairings","generic",true,"fixtures_only");
    await api("/api/admin/fixtures",{action:"create",eventId:board.id,stage:"QA board pairing",participantALabel:"QA A",participantBLabel:"QA B",venue:"QA room",reportingAt:null,startsAt:new Date().toISOString()});
    const boardFixture=(await admin.from("fixtures").select("id").eq("event_id",board.id).single()).data!.id;
    await api("/api/admin/fixtures/prepare-offline",{fixtureId:boardFixture,deviceId:randomUUID(),start:true},400);
    const count=await event("Count challenge","generic",true,"results_only","count");
    await api("/api/admin/results",{action:"setPointRules",eventId:count.id,rules});
    await api("/api/admin/results",{action:"publish",eventId:count.id,positions:[{placing:1,applicationId:count.entrants[0].id,finalValue:"1.5"}]},400);
    const families=[{eventId:count.id,title:"Publish final results"},{eventId:board.id,title:"Fixtures only"},{eventId:stage.id,title:"Information & gallery"}];
    reports.push({check:"manual values without sessions, stale correction, stage result prohibition, chess pairings without scoring",ok:true});
    let w:Awaited<ReturnType<typeof workspace>>;
    const match=await event("atomic start","football",true,"live_matches");
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
    const racketIds:Array<{id:string;games:boolean}>=[];
    for(const [title,games] of [["Lawn tennis",true],["Table tennis",false]] as const){
      const racket=await event(title,"set_based",true,"live_matches");
      await api("/api/admin/fixtures",{action:"create",eventId:racket.id,stage:"QA racket",participantALabel:"QA Racket A",participantBLabel:"QA Racket B",venue:"QA court",reportingAt:null,startsAt:new Date().toISOString()});
      const f=(await admin.from("fixtures").select("id").eq("event_id",racket.id).single()).data!;
      racketIds.push({id:f.id,games});
    }

    const voting=await event("written voting","generic",true,"voting",null,"text");
    await command(voting.id,"settings",{schedule_mode:"submission",result_mode:"public_vote",attempts:1,submission_closes_at:new Date(Date.now()+120_000).toISOString(),version:1});
    const entries:Array<{id:string;application_id:string}>=[];
    for (const [index,app] of voting.entrants.entries()) {
      await command(voting.id,"entry",{application_id:app.id,group_id:null,title:`QA work ${index+1}`,description:"First line\\nSecond line <script>literal text</script>",media_id:null,submit:true,version:0});
      const entry=(await admin.from("competition_entries").select("id,version,application_id").eq("event_id",voting.id).eq("application_id",app.id).single()).data!;
      await command(voting.id,"review_entry",{entry_id:entry.id,version:entry.version,state:"approved",reason:""});
      entries.push(entry);
    }
    failIfError((await admin.from("competition_settings").update({submission_closes_at:new Date(Date.now()-120_000).toISOString()}).eq("event_id",voting.id)).error,"Close written submissions");
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
    failIfError((await admin.from("polls").update({closes_at:new Date(Date.now()-30_000).toISOString()}).eq("id",round.id)).error,"Close QA round");
    await command(voting.id,"verify_votes",{},400);
    await command(voting.id,"voting_round",{...roundWindow(),entry_ids:[entries[1].id]},400);
    await command(voting.id,"voting_round",{...roundWindow(),entry_ids:entries.slice(1).map(e=>e.id)});
    publicData=(await anon.rpc("public_competition",{p_event_id:voting.id})).data;round=publicData.rounds[1];
    const runoff=await api("/api/competition/voting",{pollId:round.id});failIfError((await anon.rpc("cast_competition_vote",{p_token:runoff.token,p_option_id:round.options[0].id})).error,"Cast runoff vote");
    failIfError((await admin.from("polls").update({closes_at:new Date(Date.now()-30_000).toISOString()}).eq("id",round.id)).error,"Close runoff");
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
      await verifyCompetitionBrowser({base,measurementId:measurement.id,matchId:match.id,votingId:voting.id,futureFixture:future,families,boardFixture,countId:count.id,stageId:stage.id,racketIds});
      reports.push({check:"mobile competition, direct metadata, pre-start bookmark, one-action scorer and offline checkpoint",ok:true});
    }
    console.log(JSON.stringify({project:"isolated QA",media:"real text-only submissions; image uploads await R2 staging",reports},null,2));
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
