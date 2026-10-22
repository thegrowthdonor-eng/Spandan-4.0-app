const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const {createClient}=require('@supabase/supabase-js');
const {createServerClient}=require('@supabase/ssr');
const {chromium}=require('C:/Users/ADMIN/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const out=path.join(process.cwd(),'audit-artifacts');fs.mkdirSync(out,{recursive:true});
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const report={pages:[],api:[],cleanup:[]};const users=[];let edition,batch,event,browser;
async function ok(p){const r=await p;if(r.error)throw Error(r.error.message);return r.data;}
async function visit(page,role,route){const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);try{const r=await page.goto('http://localhost:3000'+route,{waitUntil:'networkidle',timeout:25000});const body=await page.locator('body').innerText();const row={role,route,status:r.status(),finalPath:new URL(page.url()).pathname,heading:await page.locator('h1').allTextContents(),restricted:/area is restricted|not authorised|not authorized|Only.*Admin|No Assigned/i.test(body),warning:/temporarily unavailable|could not be loaded|Application error|Profile Not Found/i.test(body),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors};report.pages.push(row);console.log(JSON.stringify(row));if(route==='/admin'||route==='/account'||route==='/events')await page.screenshot({path:path.join(out,role+route.replaceAll('/','-')+'.png'),fullPage:true});}catch(e){report.pages.push({role,route,error:e.message});}finally{page.off('pageerror',listener);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));}}
(async()=>{try{
browser=await chromium.launch({headless:true,executablePath:'C:/Users/ADMIN/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
const guest=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});let page=await guest.newPage();
for(const route of ['/','/home','/guest','/events','/schedule','/live','/standings','/notices','/sponsors','/gallery','/merchandise','/committee','/faqs','/account','/account/recover','/account/invite','/my-fest','/admin','/setup','/offline'])await visit(page,'guest',route);
for(const [url,method,data] of [['/api/applications','POST',{eventId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()}],['/api/admin/fixtures','POST',null],['/api/admin/committee','POST',{action:'assign',profileId:crypto.randomUUID(),role:'main_admin',eventId:null}],['/api/auth/login','POST',{}]]){const r=await page.request.fetch('http://localhost:3000'+url,{method,data,headers:{'Content-Type':'application/json'}});report.api.push({url,method,status:r.status(),body:(await r.text()).slice(0,300)});}
edition=await ok(admin.from('editions').insert({name:'AUDIT TEMP '+Date.now(),status:'draft'}).select().single());batch=await ok(admin.from('batches').insert({edition_id:edition.id,label:'AUDIT-'+Date.now(),course_label:'AUDIT'}).select().single());event=await ok(admin.from('events').insert({edition_id:edition.id,title:'AUDIT TEMP EVENT',slug:'audit-temp-'+Date.now(),category:'cultural',format:'solo',state:'draft'}).select().single());
for(const role of ['participant','treasurer','event_head','event_coordinator','notice_publisher','main_admin','pending']){
const password=crypto.randomBytes(24).toString('base64url');const email='audit-'+crypto.randomUUID()+'@example.invalid';const u=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(u.user.id);
await ok(admin.from('profiles').insert({id:u.user.id,full_name:'AUDIT '+role,batch_id:batch.id,roll_canonical:String(users.length),phone_e164:'+919999999999',fest_id:'SPD-'+crypto.randomBytes(6).toString('hex').toUpperCase(),gender:'male'}));
await ok(admin.from('access_records').insert({edition_id:edition.id,profile_id:u.user.id,state:role==='pending'?'pending':'active',verified_at:role==='pending'?null:new Date().toISOString()}));
if(!['participant','pending'].includes(role))await ok(admin.from('staff_assignments').insert({profile_id:u.user.id,role,event_id:role==='event_head'?event.id:null}));
const jar=[];const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>jar,setAll:entries=>{for(const e of entries){const i=jar.findIndex(v=>v.name===e.name);if(i>=0)jar[i]=e;else jar.push(e);}}}});await ok(client.auth.signInWithPassword({email,password}));
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await ctx.addCookies(jar.filter(x=>x.value).map(x=>({name:x.name,value:x.value,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax',secure:false})));page=await ctx.newPage();
for(const route of ['/my-fest','/admin','/admin/activation','/admin/events','/admin/review','/admin/selection','/admin/groups','/admin/fixtures','/admin/results','/admin/help','/admin/notices','/admin/control'])await visit(page,role,route);
if(role==='participant'){const r=await page.request.get('http://localhost:3000/api/admin/results?eventId='+event.id);report.api.push({role,url:'/api/admin/results',status:r.status(),body:await r.json()});}
await client.auth.signOut();await ctx.close();}
}catch(e){report.fatal=e.message;console.error(e);}finally{
if(browser)await browser.close();
if(event){const r=await admin.from('events').delete().eq('id',event.id);report.cleanup.push({object:'event',error:r.error?.message});}
for(const uid of users){await admin.from('staff_assignments').delete().eq('profile_id',uid);const r=await admin.auth.admin.deleteUser(uid);report.cleanup.push({object:'test_user',error:r.error?.message});}
if(edition){const r=await admin.from('editions').delete().eq('id',edition.id);report.cleanup.push({object:'edition',error:r.error?.message});}
fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));console.log('FINISHED',JSON.stringify({pages:report.pages.length,api:report.api,cleanup:report.cleanup,fatal:report.fatal}));}
})();
