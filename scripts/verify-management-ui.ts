import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { requireQaPublicEnvironment } from "./qa-guard";
import { QA_PASSWORD } from "./qa-data";
requireQaPublicEnvironment();
const loadModule = createRequire(process.cwd()+"/package.json");
const { chromium } = loadModule(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.QA_BROWSER_URL || "http://localhost:3001";
assert.ok(["localhost","127.0.0.1"].includes(new URL(base).hostname),"Browser QA must target a local server using isolated QA data.");
async function main() {
const browser = await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_PATH?{executablePath:process.env.QA_CHROMIUM_PATH}:{})});
await mkdir("audit-artifacts/management",{recursive:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    assert.ok((await (await context.request.get(base+"/events")).text()).includes("Fictional visual-QA entry"),"Browser server must serve QA content before any login/write");
  const login=await context.request.post(base+"/api/auth/login",{data:{batch:"2023",rollNumber:"91",password:QA_PASSWORD}});
  assert.equal(login.ok(),true,"QA Main Admin login");
  const page=await context.newPage();
  const errors:string[]=[];page.on("pageerror",(e:Error)=>errors.push(e.message));
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const route of ["/admin","/admin/events","/admin/events?create=1","/admin/review","/admin/selection","/admin/groups","/admin/fixtures","/admin/results","/admin/activation","/admin/live","/admin/notices","/admin/gallery","/admin/help","/admin/control"]){
      const response=await page.goto(base+route,{waitUntil:"networkidle"});
      assert.equal(response?.status(),200,route);
      assert.ok(await page.locator("[data-management-portal]").count(),route+" shell");
      const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
      assert.ok(overflow.scroll<=overflow.width,route+" overflows at "+width+": "+JSON.stringify(overflow));
      if(width===390)await page.screenshot({path:"audit-artifacts/management/"+route.replace(/[^a-z0-9]/gi,"-")+".png",fullPage:true});
      if(width===1440&&route==="/admin")await page.screenshot({path:"audit-artifacts/management/management-desktop.png",fullPage:true});
    }
    console.log("Responsive management routes passed at "+width+"px.");
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+"/admin/review",{waitUntil:"networkidle"});
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole("button",{name:/Reject Selected/}).click();
  const modal=page.getByRole("dialog");
  assert.equal(await modal.count(),1);
  assert.equal(await modal.evaluate((node:HTMLElement)=>node.contains(document.activeElement)),true,"Dialog receives focus");
  await page.keyboard.press("Escape");assert.equal(await page.getByRole("dialog").count(),0);
  await page.goto(base+"/admin/events?create=1",{waitUntil:"networkidle"});
  await page.getByLabel("Event title",{exact:true}).fill("QA Browser draft "+Date.now());
  await page.getByRole("button",{name:"Continue →",exact:true}).click();
  await page.getByLabel("Short description").fill("Temporary browser QA draft.");
  await page.getByLabel("Official rules").fill("Follow organiser instructions.");
  await page.getByRole("button",{name:"Continue →",exact:true}).click();
  await page.getByLabel("Venue",{exact:true}).fill("QA room");
  await page.getByLabel("Start date & time (IST)",{exact:true}).fill("2026-12-01T09:00");
  await page.getByLabel("End date & time (IST)",{exact:true}).fill("2026-12-01T10:00");
  await page.getByRole("button",{name:"Continue →",exact:true}).click();
  await page.getByRole("button",{name:"Save draft",exact:true}).click();
  await page.waitForURL(/\/admin\/events\?event=/);
  const createdId=new URL(page.url()).searchParams.get("event");
  assert.ok(createdId);
  const publication=page.waitForResponse((response:{url:()=>string})=>response.url().endsWith("/api/admin/festival"));
  await page.getByRole("button",{name:"Open registrations",exact:true}).click();
  assert.ok((await publication).ok(),"Main Admin publishes completed draft");
  await page.getByText("☰ Menu",{exact:true}).click();
  await page.getByRole("navigation",{name:"Management navigation"}).filter({visible:true}).getByRole("link",{name:"Overview",exact:true}).click();
  const deletion=await context.request.post(base+"/api/admin/festival",{data:{action:"deleteEvent",eventId:createdId}});
  assert.ok(deletion.ok(),"Clean up temporary browser event");
  assert.deepEqual(errors,[],"No client rendering errors");
  await context.close();
  for(const role of [{roll:"100",yes:"Events",no:"Participants"},{roll:"95",yes:"Participants",no:"Administration"},{roll:"92",yes:"Student verification",no:"Events"},{roll:"96",yes:"Notices",no:"Results"}]){
    const scoped=await browser.newContext({viewport:{width:390,height:844}});
    assert.ok((await scoped.request.post(base+"/api/auth/login",{data:{batch:"2023",rollNumber:role.roll,password:QA_PASSWORD}})).ok());
    const rolePage=await scoped.newPage();await rolePage.goto(base+"/admin",{waitUntil:"networkidle"});
    await rolePage.getByText("☰ Menu",{exact:true}).click();
    const nav=rolePage.getByRole("navigation",{name:"Management navigation"}).filter({visible:true});
    assert.ok(await nav.getByRole("link",{name:role.yes,exact:true}).count(),role.roll+" expected tool");
    assert.equal(await nav.getByRole("link",{name:role.no,exact:true}).count(),0,role.roll+" forbidden tool");
    if(role.roll==="100"){
      await rolePage.goto(base+"/admin/events?create=1",{waitUntil:"networkidle"});
      await rolePage.getByLabel("Event title",{exact:true}).fill("QA Editor browser draft "+Date.now());
      await rolePage.getByRole("button",{name:"Continue →",exact:true}).click();
      await rolePage.getByLabel("Short description").fill("QA editor event");
      await rolePage.getByLabel("Official rules").fill("Follow instructions");
      await rolePage.getByRole("button",{name:"Continue →",exact:true}).click();
      await rolePage.getByLabel("Venue",{exact:true}).fill("QA room");
      await rolePage.getByLabel("Start date & time (IST)",{exact:true}).fill("2026-12-01T09:00");
      await rolePage.getByLabel("End date & time (IST)",{exact:true}).fill("2026-12-01T10:00");
      await rolePage.getByRole("button",{name:"Continue →",exact:true}).click();
      await rolePage.getByRole("button",{name:"Save draft",exact:true}).click();
      await rolePage.waitForURL(/\/admin\/events\?event=/);
      const ownedId=new URL(rolePage.url()).searchParams.get("event");
      assert.ok(ownedId);
      const poster=await scoped.request.post(base+"/api/admin/upload",{multipart:{folder:"posters",eventId:ownedId}});
      assert.equal(poster.status(),400,"Editor passes poster authorization before file validation");
      const podium=await scoped.request.post(base+"/api/admin/upload",{multipart:{folder:"podiums",eventId:ownedId}});
      assert.equal(podium.status(),403,"Editor cannot upload operational result media");
      assert.ok((await scoped.request.post(base+"/api/admin/festival",{data:{action:"deleteEvent",eventId:ownedId}})).ok());
    }
    await scoped.close();
  }
  console.log("Browser QA passed: 56 responsive route checks, accessible dialogs, full draft creation/publication and role navigation.");
} finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
