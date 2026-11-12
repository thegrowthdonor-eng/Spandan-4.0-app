import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { validPosterUpload } from "@/lib/poster-image";

// Exercise the real handler without creating users, objects or event changes in production.
function handler({ signedIn=true, permitted=true, attachmentFails=false }={}) {
  const calls:string[]=[];
  const modules:Record<string,unknown>={
    "next/server":{NextResponse:{json:Response.json}},
    "next/headers":{cookies:async()=>({getAll:()=>[]})},
    "next/cache":{revalidateTag:()=>calls.push("invalidate")},
    "@/server/supabase/programme-fetch":{programmeCacheTag:"public-programme"},
    "@supabase/ssr":{createServerClient:()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:"owner"}:null}})},rpc:async(name:string)=>{
      if(name==="attach_event_poster"){calls.push("attach");return {error:attachmentFails?{message:"unavailable"}:null};}
      return {data:permitted,error:null};
    }})},
    "@/server/env":{hasSupabaseConfiguration:()=>true},
    "@/lib/poster-image":{validPosterUpload},
    "@/server/media/storage":{
      storePublicMedia:async()=>{calls.push("store");return {key:"new-key",publicUrl:"https://media.auraserve.in/new.webp",provider:"r2"};},
      archiveMedia:async(keys:string[])=>{assert.deepEqual(Array.from(keys),["new-key"]);calls.push("archive");return {error:null};},
    },
  };
  const exports:Record<string,unknown>={};
  const code=ts.transpileModule(readFileSync(new URL("./route.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Script(code).runInNewContext({exports,require:(name:string)=>{assert.ok(name in modules,`Unexpected dependency ${name}`);return modules[name];},process,crypto,console,Buffer,URL});
  return {post:exports.POST as (request:Request)=>Promise<Response>,calls};
}
function request(file=new File(["RIFF0000WEBPtest"],"poster.webp",{type:"image/webp"}),origin="https://spandan.test"){
  const form=new FormData();form.set("file",file);form.set("folder","posters");form.set("eventId","e800dfbe-511e-41e6-adbf-d9b70bcb6f89");form.set("attach","true");
  return new Request("https://spandan.test/api/admin/upload",{method:"POST",headers:{origin},body:form});
}
test("poster upload rejects missing authentication, event permission and foreign origins without writes",async()=>{
  for(const [options,origin,status] of [[{signedIn:false},"https://spandan.test",401],[{permitted:false},"https://spandan.test",403],[{},"https://foreign.test",403]] as const){
    const h=handler(options);assert.equal((await h.post(request(undefined,origin))).status,status);assert.deepEqual(h.calls,[]);
  }
});
test("poster MIME and size failures never reach storage",async()=>{
  for(const file of [new File(["fake"],"fake.jpg",{type:"image/jpeg"}),new File([new Uint8Array(5*1024*1024+1)],"large.webp",{type:"image/webp"})]){
    const h=handler();assert.equal((await h.post(request(file))).status,400);assert.deepEqual(h.calls,[]);
  }
});
test("failed attachment archives only the new reference and does not invalidate or claim success",async()=>{
  const h=handler({attachmentFails:true});const response=await h.post(request());
  assert.equal(response.status,503);assert.match((await response.json()).error,/previous poster is unchanged/);assert.deepEqual(h.calls,["store","attach","archive"]);
});
test("successful R2 poster attachment invalidates public programme after saving",async()=>{
  const h=handler();const response=await h.post(request());
  assert.equal(response.status,200);assert.equal((await response.json()).provider,"r2");assert.deepEqual(h.calls,["store","attach","invalidate"]);
});
