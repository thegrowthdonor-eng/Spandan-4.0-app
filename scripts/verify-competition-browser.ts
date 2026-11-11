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

export async function verifyCompetitionBrowser({base,measurementId,matchId,votingId,futureFixture,families}:{base:string;measurementId:string;matchId:string;votingId:string;futureFixture:string;families:Array<{eventId:string;title:string}>}) {
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
    await page.getByRole("heading",{name:"QA final",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Competition workspace overflows mobile width");
    if (process.env.QA_SCREENSHOTS === "true") await page.screenshot({path:"scratch/competition-mobile.png",fullPage:true});
    await page.getByText("Enter measurements & confirm official places",{exact:true}).click();
    await page.getByLabel(/^Correction reason/).fill("QA keyboard-submitted correction");
    const measurement=page.getByLabel(/attempt 1$/).first();await measurement.fill("5.125");
    const saved=page.waitForRequest((request:{url:()=>string;method:()=>string;postDataJSON:()=>{action?:string}})=>request.url().endsWith("/api/competition") && request.method()==="POST" && request.postDataJSON().action==="session_results");
    await measurement.press("Enter");const mutation=await saved;assert.equal(mutation.postDataJSON().data.results[0].attempts[0],5125,"Enter submitted a stale unblurred measurement");
    await page.getByText("Saved.",{exact:true}).waitFor();
    await page.getByText("Operation history & corrections",{exact:true}).click();await page.getByRole("button",{name:"Load history",exact:true}).click();
    await page.getByRole("button",{name:"Load detailed changes",exact:true}).first().click();
    await page.getByText("Previous values",{exact:true}).first().click();await page.getByText(/5\.000 m/).first().waitFor();
    for (const family of families) {await page.goto(`${base}/admin/fixtures?event=${family.eventId}`);await page.getByRole("heading",{name:family.title,exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${family.title} overflows mobile width`);}
    await page.goto(`${base}/competition/${votingId}`);
    await page.getByRole("heading",{name:"QA work 1",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Voting gallery overflows mobile width");
    if (process.env.QA_SCREENSHOTS === "true") await page.screenshot({path:"scratch/voting-mobile.png",fullPage:true});
    await page.getByRole("button",{name:"Submit / manage entry"}).click();
    await page.getByLabel("Approved entrant").waitFor();
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
    await page.goto(`${base}/admin/fixtures?event=${matchId}`);await page.getByRole("heading",{name:"Match schedule",exact:true}).waitFor();
    await page.setViewportSize({width:1440,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.goto(`${base}/schedule`);
    await page.getByRole("button",{name:"Festival Notifications",exact:true}).waitFor();
    await page.waitForTimeout(1000);await page.clock.install();
    const bellRequests:string[]=[];page.on("request",(request:{url:()=>string;headers:()=>Record<string,string>})=>{if(request.url().endsWith("/api/public/notifications")){bellRequests.push(request.url());assert.equal(request.headers().cookie,undefined,"Public feed sent user cookies");}});
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{value:true,configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
    await page.clock.fastForward(301_000);await page.waitForTimeout(50);assert.equal(bellRequests.length,0,"Hidden bell kept polling");
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{value:false,configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
    await page.waitForResponse((response:{url:()=>string})=>response.url().endsWith("/api/public/notifications"));assert.equal(bellRequests.length,1);
    assert.deepEqual(errors,[],"Browser runtime errors");
  } finally {await browser.close();}
}
