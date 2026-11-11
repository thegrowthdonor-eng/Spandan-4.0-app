import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {QA_PASSWORD} from "./qa-data";

export async function verifyBrowserVoting({base,votingId}:{base:string;votingId:string}) {
  const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {})});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const login=await context.request.post(`${base}/api/auth/login`,{data:{batch:"2021",rollNumber:"1",password:QA_PASSWORD}});assert.equal(login.status(),200);
    const page=await context.newPage();await page.goto(`${base}/competition/${votingId}`);
    await page.getByRole("heading",{name:"QA work 1",exact:true}).waitFor();
    const writes:string[]=[];page.on("request",(request:{url:()=>string;method:()=>string})=>{if(request.method()==="POST")writes.push(request.url());});
    page.once("dialog",(dialog:{accept:()=>Promise<void>})=>void dialog.accept());
    await page.locator("article").filter({has:page.getByRole("heading",{name:"QA work 1",exact:true})}).getByRole("button",{name:/^Vote for Entry/}).click();
    await page.getByRole("button",{name:"✓ Vote registered",exact:true}).waitFor();
    assert.equal(writes.filter(url=>url===`${base}/api/competition/voting`).length,1);
    assert.equal(writes.filter(url=>url.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL!) && url.endsWith("/rest/v1/rpc/cast_competition_vote")).length,1,"Actual browser vote did not bypass Vercel");
    assert.equal(await page.getByRole("button",{name:"✓ Vote registered",exact:true}).isDisabled(),true);
  } finally {await browser.close();}
}

export async function verifyCompetitionBrowser({base,measurementId,matchId,votingId,futureFixture,families,boardFixture,countId,stageId,racketIds}:{base:string;measurementId:string;matchId:string;votingId:string;futureFixture:string;families:Array<{eventId:string;title:string}>;boardFixture:string;countId:string;stageId:string;racketIds:Array<{id:string;games:boolean}>}) {
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {})});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const login=await context.request.post(`${base}/api/auth/login`,{data:{batch:"2023",rollNumber:"91",password:QA_PASSWORD}});assert.equal(login.status(),200);
    const page=await context.newPage();const errors:string[]=[];
    page.on("pageerror",(error:Error)=>errors.push(error.message));
    await page.goto(`${base}/admin/fixtures?event=${measurementId}`);
    await page.getByRole("heading",{name:"Competition & Schedule",exact:true}).waitFor();
    await page.getByRole("heading",{name:"Publish final results",exact:true}).waitFor();
    assert.equal(await page.getByText("Start session",{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Workspace overflows mobile");
    await page.getByRole("link",{name:"Enter & publish results →",exact:true}).click();
    await page.getByRole("heading",{name:"Official results · v1",exact:true}).waitFor();
    await page.getByLabel(/Final distance/).first().fill("5.125");
    await page.getByLabel("Reason for correction (required)",{exact:true}).fill("QA keyboard correction");
    await page.getByRole("button",{name:"Review results →",exact:true}).click();
    await page.getByRole("heading",{name:"Check before publishing",exact:true}).waitFor();
    const saved=page.waitForRequest((request:{url:()=>string;method:()=>string;postDataJSON:()=>{action?:string}})=>request.url().endsWith("/api/admin/results")&&request.method()==="POST"&&request.postDataJSON().action==="publish");
    await page.getByRole("button",{name:"Confirm & publish",exact:true}).click();
    const mutation=await saved;assert.equal(mutation.postDataJSON().positions[0].finalValue,"5.125");
    assert.equal(mutation.postDataJSON().expectedVersion,1);
    await page.getByText("Official results published. Batch standings have been updated.",{exact:true}).waitFor();
    await page.getByText(/Publication history/).click();await page.getByText(/5.125 m/).first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Results overflow mobile");
    if(process.env.QA_SCREENSHOTS==="true")await page.screenshot({path:"scratch/results-mobile.png",fullPage:true});
    await page.goto(`${base}/admin/results?event=${countId}`);
    const winnerSelectors=page.getByLabel(/^Participant \/ team for position/);assert.equal(await winnerSelectors.first().inputValue(),"","New winners were preselected");
    await page.goto(`${base}/scorer?fixture=${boardFixture}`);await page.getByText("This event has no live scoring. Open its fixtures or final results.",{exact:true}).waitFor();
    assert.equal(await page.getByLabel("Match status").count(),0);
    await page.goto(`${base}/admin/results?event=${stageId}`);
    await page.getByText("This event uses information and gallery updates. There are no new official result publications.",{exact:true}).waitFor();
    for (const family of families) {await page.goto(`${base}/admin/fixtures?event=${family.eventId}`);await page.getByRole("heading",{name:family.title,exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${family.title} overflows mobile width`);}
    await page.goto(`${base}/competition/${votingId}`);
    await page.getByRole("heading",{name:"QA work 1",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Voting gallery overflows mobile width");
    if (process.env.QA_SCREENSHOTS === "true") await page.screenshot({path:"scratch/voting-mobile.png",fullPage:true});
    await page.getByRole("button",{name:"Submit / manage entry"}).click();
    await page.getByLabel("Participant / team",{exact:true}).waitFor();
    await page.goto(`${base}/scorer?fixture=${futureFixture}`);
    await page.getByRole("button",{name:"Locked until match day",exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Locked until match day",exact:true}).isDisabled(),true);
    assert.equal(await page.getByLabel("Match status").count(),0,"Scoring appeared before explicit start");
    await page.goto(`${base}/admin/scoring`);
    const card=page.locator("article").filter({hasText:"QA browser scoring"});
    await card.getByRole("button",{name:"Start & Score",exact:true}).click();
    await page.waitForURL(/\/scorer\?fixture=/);
    await page.getByLabel("Match status").waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Scorer overflows mobile width");
    await page.waitForTimeout(1500);
    const requests:string[]=[];const capture=(request:{url:()=>string})=>{if(request.url().includes("/api/"))requests.push(request.url());};page.on("request",capture);
    const clock=page.getByText("Match clock",{exact:true}).locator("..").locator("strong");const before=await clock.textContent();
    await page.waitForTimeout(2200);page.off("request",capture);assert.deepEqual(requests,[],"Local clock ticks triggered requests");assert.notEqual(await clock.textContent(),before,"Match clock is not ticking");
    await context.setOffline(true);
    await page.getByRole("button",{name:"+1",exact:true}).first().click();
    await page.getByText("1 local checkpoint waiting",{exact:true}).waitFor();
    await context.setOffline(false);
    await page.getByText("All changes synced",{exact:true}).waitFor({timeout:20_000});
    await page.evaluate((id:string)=>window.history.pushState(null,"",`/scorer?fixture=${id}`),boardFixture);
    await page.getByText("This event has no live scoring. Open its fixtures or final results.",{exact:true}).waitFor();
    assert.equal(await page.getByLabel("Match status").count(),0,"Previous match controls survived navigation to a non-scored fixture");
    for(const racket of racketIds){await page.goto(`${base}/scorer?fixture=${racket.id}`);await page.getByRole("button",{name:"Start & Score",exact:true}).click();await page.getByText(racket.games?"Current set · games":"Current set · points",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Finish current set",exact:true}).isDisabled(),true);await page.getByRole("button",{name:"+1",exact:true}).first().click();await page.getByRole("button",{name:"Finish current set",exact:true}).click();await page.getByText("1–0",{exact:true}).waitFor();}
    await page.goto(`${base}/admin/fixtures?event=${matchId}`);await page.getByRole("heading",{name:"Match schedule",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.goto(`${base}/schedule?day=2026-12-03`);
    await page.getByRole("heading",{name:"Your festival, day by day.",exact:true}).waitFor();
    await page.getByRole("heading",{name:"Thursday, 3 December",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Schedule overflows mobile");
    await page.getByRole("button",{name:"Fri 04 Dec",exact:true}).click();
    await page.waitForURL(/day=2026-12-04/);
    await page.goBack();await page.getByRole("heading",{name:"Thursday, 3 December",exact:true}).waitFor();
    const searchTerm=(await page.locator("ol li h3").first().innerText()).trim();
    await page.getByLabel("Search events, teams or venues").fill(searchTerm);
    await page.waitForURL((url:URL)=>url.searchParams.get("q")===searchTerm);
    assert.ok(await page.locator("ol li").count()>0,"Schedule search lost a published item");
    await page.reload();assert.equal(await page.getByLabel("Search events, teams or venues").inputValue(),searchTerm,"Search not preserved after reload");
    await page.getByLabel("Search events, teams or venues").fill("");
    if(process.env.QA_SCREENSHOTS==="true")await page.screenshot({path:"scratch/schedule-mobile.png",fullPage:true});

    await page.getByRole("button",{name:"Festival Notifications",exact:true}).waitFor();
    await page.waitForTimeout(1000);await page.clock.install();
    const bellRequests:string[]=[];page.on("request",(request:{url:()=>string;headers:()=>Record<string,string>})=>{if(request.url().endsWith("/api/public/notifications")){bellRequests.push(request.url());assert.equal(request.headers().cookie,undefined,"Public feed sent user cookies");}});
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{value:true,configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
    await page.clock.fastForward(301_000);await page.waitForTimeout(50);assert.equal(bellRequests.length,0,"Hidden bell kept polling");
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{value:false,configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
    await page.waitForResponse((response:{url:()=>string})=>response.url().endsWith("/api/public/notifications"));assert.equal(bellRequests.length,1);
    await page.setViewportSize({width:1440,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[],"Browser runtime errors");
  } finally {await browser.close();}
}
