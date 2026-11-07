import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { requireQaEnvironment, requireQaPublicEnvironment, failIfError } from "./qa-guard";
import { QA_PASSWORD } from "./qa-data";

const admin=requireQaEnvironment();requireQaPublicEnvironment();
const loadModule=createRequire(process.cwd()+"/package.json");
const {chromium}=loadModule(process.env.PLAYWRIGHT_MODULE||"playwright");
const base=process.env.QA_BROWSER_URL||"http://localhost:3001";
assert.ok(["localhost","127.0.0.1"].includes(new URL(base).hostname));
async function main(){
  const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_PATH?{executablePath:process.env.QA_CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  const ids:string[]=[];const errors:string[]=[];
  await mkdir("audit-artifacts/launch-admin",{recursive:true});
  try{
    assert.ok((await (await context.request.get(base+"/events")).text()).includes("Fictional visual-QA entry"),"Browser server must serve QA content before any login/write");
    assert.ok((await context.request.post(base+"/api/auth/login",{data:{batch:"2023",rollNumber:"91",password:QA_PASSWORD}})).ok());
    const page=await context.newPage();page.on("pageerror",(e:Error)=>errors.push(e.message));
    let saveRequests=0;
    page.on("request",(r:{url:()=>string;method:()=>string})=>{if(r.url().endsWith("/api/admin/events")&&r.method()==="POST")saveRequests++;});
    const title="QA Launch UI "+randomUUID();
    await page.goto(base+"/admin/events?create=1",{waitUntil:"networkidle"});
    assert.equal(await page.getByRole("button",{name:"Save draft",exact:true}).count(),0);
    await page.getByRole("button",{name:"4. Review",exact:true}).click();
    assert.ok(await page.getByRole("alert").count(),"Empty steps cannot be skipped");
    await page.getByLabel("Event title",{exact:true}).fill(title);
    const png=await page.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=1800;canvas.height=2400;const c=canvas.getContext("2d")!;c.fillStyle="#fff9ee";c.fillRect(0,0,1800,2400);c.fillStyle="#52265c";c.fillRect(0,0,1800,380);c.fillStyle="white";c.font="bold 100px sans-serif";c.fillText("SPANDAN 4.0",120,200);c.fillStyle="#35203e";for(let i=0;i<28;i++){c.font="38px sans-serif";c.fillText(`Festival event information ${i+1} · Readable poster details`,110,490+i*60);}return canvas.toDataURL("image/png").split(",")[1];});
    await page.getByLabel("Choose event poster file",{exact:true}).setInputFiles({name:"readable-poster.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
    await page.getByRole("button",{name:"Replace poster",exact:true}).waitFor();
    await page.waitForFunction(()=>{const img=document.querySelector<HTMLImageElement>('img[alt="Event poster preview"]');return img?.complete&&img.naturalWidth>0;});
    const dimensions=await page.getByAltText("Event poster preview").evaluate((img:HTMLImageElement)=>({width:img.naturalWidth,height:img.naturalHeight,src:img.src}));
    assert.ok(dimensions.width<=1600&&dimensions.height<=1600&&dimensions.src.startsWith("blob:"));
    await page.screenshot({path:"audit-artifacts/launch-admin/poster-390.png",fullPage:true});
    await page.getByRole("button",{name:"Continue →",exact:true}).click();
    assert.equal(await page.getByLabel("Registration capacity",{exact:true}).count(),0);
    await page.getByLabel("Short description").fill("Readable festival competition.");await page.getByLabel("Official rules").fill("Follow the organiser briefing.");
    await page.getByRole("button",{name:"+ Add question",exact:true}).click();await page.getByLabel("Question 1",{exact:true}).fill("Preferred position");
    await page.getByRole("combobox",{name:/^Answer type/}).selectOption("select");await page.getByRole("combobox",{name:/^Number of options/}).selectOption("3");
    for(let i=1;i<=3;i++)await page.getByLabel("Option "+i,{exact:true}).fill("Choice "+i);
    page.once("dialog",(d:{dismiss:()=>Promise<void>})=>d.dismiss());await page.getByRole("combobox",{name:/^Number of options/}).selectOption("2");assert.equal(await page.getByLabel("Option 3",{exact:true}).count(),1);
    page.once("dialog",(d:{accept:()=>Promise<void>})=>d.accept());await page.getByRole("combobox",{name:/^Number of options/}).selectOption("2");assert.equal(await page.getByLabel("Option 3",{exact:true}).count(),0);
    await page.getByRole("button",{name:"Continue →",exact:true}).click();
    assert.equal(await page.getByLabel("Reporting time",{exact:false}).count(),0);assert.equal(await page.getByLabel("Roster deadline",{exact:false}).count(),0);assert.equal(await page.getByRole("button",{name:/poster/i}).count(),0);
    await page.getByLabel("Venue",{exact:true}).fill("QA campus");await page.getByLabel("Start date & time (IST)",{exact:true}).fill("2026-12-01T09:00");await page.getByLabel("End date & time (IST)",{exact:true}).fill("2026-12-01T08:00");
    await page.getByRole("button",{name:"Continue →",exact:true}).click();assert.equal(await page.getByRole("button",{name:"Save draft",exact:true}).count(),0);
    await page.getByLabel("End date & time (IST)",{exact:true}).fill("2026-12-01T10:00");await page.getByRole("button",{name:"Continue →",exact:true}).click();
    assert.equal(saveRequests,0,"Continue must not submit a draft when it becomes the Review save button");
    // Back/forward navigation must preserve the already-compressed local file.
    await page.getByRole("button",{name:"1. Basics",exact:true}).click();await page.getByRole("button",{name:"Replace poster",exact:true}).waitFor();await page.getByRole("button",{name:"4. Review",exact:true}).click();
    await page.route("**/api/admin/upload",(route:{fulfill:(v:unknown)=>Promise<void>})=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Simulated upload failure"})}));
    const [firstResponse]=await Promise.all([page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/admin/events")),page.getByRole("button",{name:"Save draft",exact:true}).click()]);const first=await firstResponse.json();assert.ok(first.eventId,JSON.stringify(first));ids.push(first.eventId);
    await page.getByRole("alert").filter({hasText:"retry uses the same event"}).waitFor();
    assert.equal((await admin.from("events").select("*",{head:true,count:"exact"}).eq("title",title)).count,1);
    await page.unroute("**/api/admin/upload");
    const [retry]=await Promise.all([page.waitForResponse((r:{url:()=>string})=>r.url().endsWith("/api/admin/events")),page.getByRole("button",{name:"Save draft",exact:true}).click()]);assert.equal((await retry.json()).eventId,first.eventId);
    await page.waitForURL(new RegExp("/admin/events\\?event="+first.eventId));
    const saved=(await admin.from("events").select("poster_url,application_questions,application_capacity,waitlist_enabled").eq("id",first.eventId).single()).data!;
    assert.ok(saved.poster_url);assert.equal(saved.application_questions[0].options.length,2);assert.equal(saved.application_capacity,null);assert.equal(saved.waitlist_enabled,false);
    const image=await context.request.get(saved.poster_url);assert.ok(image.ok());assert.match(image.headers()["content-type"],/image\/webp/);assert.ok((await image.body()).length<=500*1024);
    const invalid=await context.request.post(base+"/api/admin/upload",{multipart:{folder:"posters",eventId:first.eventId,file:{name:"fake.webp",mimeType:"image/webp",buffer:Buffer.from("not an image")}}});assert.equal(invalid.status(),400);
    for(const width of [360,390,1440]){await page.setViewportSize({width,height:900});await page.goto(base+"/admin/control",{waitUntil:"networkidle"});assert.equal(await page.getByRole("region",{name:"Committee role counts"}).count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`audit-artifacts/launch-admin/roles-${width}.png`,fullPage:true});}
    const edition=(await admin.from("editions").select("id").single()).data!;
    const infoTitle="QA Bonfire "+randomUUID();
    const info=await context.request.post(base+"/api/admin/events",{data:{eventId:null,editionId:edition.id,details:{title:infoTitle,category:"other",format:"solo",registrationEnabled:false,scoreTemplate:"generic",summary:"A festival evening; no registration needed.",rules:"",venue:"QA campus",capacity:null,waitlistEnabled:false,reportingAt:null,startsAt:"2026-12-01T12:00:00Z",endsAt:"2026-12-01T13:00:00Z",rosterLockAt:null,eligibility:{division:"open"},applicationQuestions:[],groupMinSize:null,groupMaxSize:null,batchRestricted:false,posterUrl:null}}});assert.ok(info.ok());const infoId=(await info.json()).eventId;ids.push(infoId);
    assert.ok((await context.request.post(base+"/api/admin/festival",{data:{action:"setEventState",eventId:infoId,state:"published"}})).ok());
    await page.goto(`${base}/admin/events?event=${infoId}`,{waitUntil:"networkidle"});assert.equal(await page.getByRole("button",{name:"Open registrations",exact:true}).count(),0);assert.equal(await page.getByRole("combobox",{name:/^Participation format/}).count(),0);
    const slug=(await admin.from("events").select("slug").eq("id",infoId).single()).data!.slug;
    await page.goto(base+"/events/"+slug,{waitUntil:"networkidle"});assert.ok(await page.getByText("No registration required",{exact:true}).count());assert.equal(await page.getByRole("button",{name:"Register now",exact:true}).count(),0);assert.equal(await page.getByText("Individual / Solo",{exact:true}).count(),0);
    await page.screenshot({path:"audit-artifacts/launch-admin/information-public.png",fullPage:true});
    for(const route of ["/admin/review","/admin/selection","/admin/groups","/admin/fixtures","/admin/results"]){await page.goto(base+route,{waitUntil:"networkidle"});assert.equal(await page.getByRole("navigation",{name:"Selected event tools"}).count(),0);}
    assert.deepEqual(errors,[],"No browser runtime errors");
    console.log("Launch UI QA passed: review-only saving, step validation, numbered choices/deletion consent, local poster retention/compression, failed-upload retry without duplicates, real Storage attachment, role counts, info-only public/admin views and removed navigation.");
  }catch(error){
    for(const page of context.pages()){console.error((await page.locator("body").innerText()).slice(-10000));await page.screenshot({path:"audit-artifacts/launch-admin/failure.png",fullPage:true});}
    throw error;
  }finally{
    try{for(const id of ids.reverse()){
      const objects=await admin.storage.from("fest-media").list("posters/"+id);failIfError(objects.error,"Read exact QA poster folder");
      if(objects.data?.length)failIfError((await admin.storage.from("fest-media").remove(objects.data.map(o=>"posters/"+id+"/"+o.name))).error,"Remove QA probe poster");
      const removed=await context.request.post(base+"/api/admin/festival",{data:{action:"deleteEvent",eventId:id}});assert.ok(removed.ok(),"Remove exact launch UI event");
    }}finally{await browser.close();}
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
