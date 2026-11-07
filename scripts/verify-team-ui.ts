import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { requireQaEnvironment, requireQaPublicEnvironment, failIfError } from "./qa-guard";
import { QA_PASSWORD } from "./qa-data";

const admin = requireQaEnvironment(); requireQaPublicEnvironment();
const loadModule = createRequire(process.cwd()+"/package.json");
const { chromium } = loadModule(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.QA_BROWSER_URL || "http://localhost:3001";
assert.ok(["localhost","127.0.0.1"].includes(new URL(base).hostname));

async function main() {
  const browser = await chromium.launch({ headless:true, ...(process.env.QA_CHROMIUM_PATH ? {executablePath:process.env.QA_CHROMIUM_PATH} : {}) });
  const probes: string[] = [];
  const errors: string[] = [];
  await mkdir("audit-artifacts/team-workflows",{recursive:true});
  async function session(roll:string,batch="2021") {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    assert.ok((await (await context.request.get(base+"/events")).text()).includes("Fictional visual-QA entry"),"Browser server must serve QA content before any login/write");
    assert.ok((await context.request.post(base+"/api/auth/login",{data:{batch,rollNumber:roll,password:QA_PASSWORD}})).ok());
    const page=await context.newPage();page.on("pageerror",(error:Error)=>errors.push(error.message));
    return {context,page};
  }
  try {
    const {data:edition}=await admin.from("editions").select("id").single();
    const {data:batch}=await admin.from("batches").select("id").eq("label","MBBS 2021").single();
    const {data:students}=await admin.from("profiles").select("id,roll_canonical").eq("batch_id",batch!.id).in("roll_canonical",["1","2"]);
    assert.equal(students?.length,2);
    async function event(format:string){
      const {data,error}=await admin.from("events").insert({edition_id:edition!.id,title:"QA UI "+format,slug:"qa-ui-team-"+randomUUID(),category:"other",format,state:"open",score_template:"generic",summary:"QA only",rules_markdown:"Follow instructions",venue:"QA room",application_opens_at:"2026-01-01T00:00:00Z",application_closes_at:"2026-12-01T00:00:00Z",roster_lock_at:"2026-12-02T00:00:00Z",eligibility:{division:"open"},group_min_size:format==="solo"?null:2,group_max_size:format==="solo"?null:2,batch_restricted:true,application_questions:[{key:"position",label:"Preferred position",type:"select",required:true,options:["A","B"]}]}).select("id").single();
      failIfError(error,"Create browser probe");probes.push(data!.id);return data!.id;
    }
    const sport=await event("sport"),pair=await event("pair"),solo=await event("solo");
    const {data:apps,error:appError}=await admin.from("applications").insert(students!.map(s=>({event_id:sport,student_id:s.id,idempotency_key:randomUUID(),review_state:"approved",reviewed_at:new Date().toISOString()}))).select("id,student_id");failIfError(appError,"Seed browser candidates");
    const organiser=await session("91","2023"),captain=await session("1"),partner=await session("2");
    const leaderApp=apps!.find(a=>a.student_id===students!.find(s=>s.roll_canonical==="1")!.id)!;
    await organiser.page.goto(`${base}/admin/groups?event=${sport}`,{waitUntil:"networkidle"});
    assert.equal(await organiser.page.getByLabel("Team name",{exact:true}).count(),0,"Staff cannot name an initial squad");
    await organiser.page.screenshot({path:"audit-artifacts/team-workflows/admin-initial-390.png",fullPage:true});
    await organiser.page.getByRole("combobox",{name:/^Team batch/}).selectOption(batch!.id);
    await organiser.page.getByRole("combobox",{name:/^Captain/}).selectOption(leaderApp.id);
    const appointment=organiser.page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/admin/groups"));
    await organiser.page.getByRole("button",{name:"Appoint Captain",exact:true}).click();assert.ok((await appointment).ok());
    await organiser.page.locator(".team-badge").filter({hasText:"Awaiting leader proposal"}).waitFor();
    assert.equal(await organiser.page.getByLabel("Team name",{exact:true}).count(),0);
    await captain.page.goto(`${base}/my-fest/teams?event=${sport}`,{waitUntil:"networkidle"});
    await captain.page.getByRole("button",{name:"Choose name & members",exact:true}).click();
    await captain.page.getByLabel("Team name",{exact:true}).fill("Captain Chosen Squad");
    await captain.page.getByRole("checkbox").filter({visible:true}).last().check();
    const save=captain.page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/teams"));
    await captain.page.getByRole("button",{name:"Save proposal",exact:true}).click();assert.ok((await save).ok());
    await captain.page.getByRole("button",{name:"Submit for coordinator approval",exact:true}).waitFor();
    for(const width of [360,390,1440]){
      await captain.page.setViewportSize({width,height:900});
      assert.ok(await captain.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Captain workspace overflow "+width);
      await captain.page.screenshot({path:`audit-artifacts/team-workflows/captain-${width}.png`,fullPage:true});
    }
    const submit=captain.page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/teams"));
    await captain.page.getByRole("button",{name:"Submit for coordinator approval",exact:true}).click();assert.ok((await submit).ok());
    await organiser.page.reload({waitUntil:"networkidle"});
    organiser.page.once("dialog",(d:{accept:()=>Promise<void>})=>d.accept());
    const publish=organiser.page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/admin/groups"));
    await organiser.page.getByRole("button",{name:"Approve & publish roster",exact:true}).click();assert.ok((await publish).ok());
    await organiser.page.getByText("Published · official roster",{exact:true}).waitFor();
    await organiser.page.screenshot({path:"audit-artifacts/team-workflows/coordinator-390.png",fullPage:true});
    await organiser.page.goto(`${base}/admin/groups?event=${solo}`,{waitUntil:"networkidle"});
    assert.ok(organiser.page.url().includes("/admin/selection?event="+solo),"Solo team URL redirects to roster");
    assert.equal(await organiser.page.getByRole("link",{name:"Teams",exact:true}).count(),0);
    await organiser.page.goto(`${base}/admin/groups?event=${pair}`,{waitUntil:"networkidle"});
    assert.equal(await organiser.page.getByRole("heading",{name:"Pairs",exact:true}).count(),1);
    assert.equal(await organiser.page.getByLabel("Captain",{exact:true}).count(),0);
    assert.equal(await organiser.page.getByLabel("Team name",{exact:true}).count(),0);
    await captain.page.setViewportSize({width:390,height:844});
    await captain.page.goto(`${base}/my-fest/teams?event=${pair}`,{waitUntil:"networkidle"});
    await captain.page.getByRole("combobox",{name:/^Partner batch/}).selectOption(batch!.id);
    await captain.page.getByLabel("Partner roll number",{exact:true}).fill("2");
    await captain.page.getByRole("button",{name:"Find partner",exact:true}).click();
    await captain.page.getByRole("combobox",{name:/^Preferred position/}).selectOption("A");
    const invitation=captain.page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/teams"));
    await captain.page.getByRole("button",{name:"Confirm & send invitation",exact:true}).click();assert.ok((await invitation).ok());
    await captain.page.getByText("Waiting for partner",{exact:true}).waitFor();
    await partner.page.goto(`${base}/my-fest/teams`,{waitUntil:"networkidle"});
    await partner.page.getByRole("link",{name:"QA UI pair",exact:true}).click();
    await partner.page.getByRole("combobox",{name:/^Preferred position/}).selectOption("B");
    await partner.page.screenshot({path:"audit-artifacts/team-workflows/pair-invitation-390.png",fullPage:true});
    const accepted=partner.page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/teams"));
    await partner.page.getByRole("button",{name:"Accept & confirm pair",exact:true}).click();assert.ok((await accepted).ok());
    await partner.page.getByText("Both partners confirmed",{exact:true}).waitFor();
    for(const width of [360,390,1440]){
      await partner.page.setViewportSize({width,height:900});
      assert.ok(await partner.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Pair workspace overflow "+width);
      await partner.page.screenshot({path:`audit-artifacts/team-workflows/pair-confirmed-${width}.png`,fullPage:true});
    }
    assert.equal(await partner.page.getByLabel("Captain",{exact:true}).count(),0);
    const anonymous=await browser.newContext();
    assert.equal((await anonymous.request.post(base+"/api/teams",{data:{action:"lookup",eventId:pair,batchId:batch!.id,roll:"1"}})).status(),401);
    assert.equal((await anonymous.request.post(base+"/api/teams",{headers:{origin:"https://unrelated.invalid"},data:{action:"lookup",eventId:pair,batchId:batch!.id,roll:"1"}})).status(),403);
    assert.equal((await organiser.context.request.post(base+"/api/admin/groups",{data:{action:"create",eventId:sport,name:"Bypass",batchId:batch!.id}})).status(),400);
    assert.deepEqual(errors,[],"No client rendering errors");
    console.log("Team UI QA passed: captain-owned naming/selection, coordinator approval, solo redirect, pair-only tools, invitation auto-registration, 360/390/1440px overflow checks, API authentication and legacy route denial.");
  } catch(error) {
    console.error("Browser workflow failure:",error);
    throw error;
  } finally {
    // The QA-only service client removes only the exact temporary probe IDs.
    try {
      for(const id of probes.reverse()){
        failIfError((await admin.from("participant_groups").delete().eq("event_id",id)).error,"Remove browser probe groups");
        const applications=await admin.from("applications").select("id").eq("event_id",id);failIfError(applications.error,"Read browser probe applications");
        if(applications.data?.length)failIfError((await admin.from("application_history").delete().in("application_id",applications.data.map(a=>a.id))).error,"Remove browser probe history");
        failIfError((await admin.from("applications").delete().eq("event_id",id)).error,"Remove browser probe applications");
        failIfError((await admin.from("events").delete().eq("id",id)).error,"Remove browser probe event");
      }
    } finally { await browser.close(); }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
