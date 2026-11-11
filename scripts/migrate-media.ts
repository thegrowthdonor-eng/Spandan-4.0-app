/** Resumable copy/verify/cutover; never deletes any source or target object. See docs/COMPETITION-ROLLOUT.md. */
import { readFile,rename,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash,randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PutObjectCommand,S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { optimiseMedia,MAX_MEDIA_BYTES } from "../src/server/media/image";
import { mediaColumns,validateMediaManifest,type MediaManifest,type MediaReference } from "../src/lib/media-migration";

async function main() {
  const [action,filename,limitArgument="10"]=process.argv.slice(2);
  if (!["plan","copy","verify","switch","rollback"].includes(action) || !filename) throw new Error("Usage: migrate-media.ts plan|copy|verify|switch|rollback manifest.json [limit 1..100]");
  const limit=Number(limitArgument);if (!Number.isInteger(limit) || limit<1 || limit>100) throw new Error("Use a bounded batch size between 1 and 100.");
  const projectUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectUrl || !service) throw new Error("Secure project credentials required.");
  const admin=createClient(projectUrl,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const path=resolve(filename);
  let manifest:MediaManifest;
  try { manifest=JSON.parse(await readFile(path,"utf8")); }
  catch(error) { if ((error as NodeJS.ErrnoException).code!=="ENOENT" || action!=="plan") throw error;manifest={version:1,projectUrl,targetBase:null,createdAt:new Date().toISOString(),items:[]}; }
  validateMediaManifest(manifest,projectUrl);
  const save=async()=>{await writeFile(`${path}.tmp`,JSON.stringify(manifest,null,2));await rename(`${path}.tmp`,path);};
  if (action==="plan") {
    const bySource=new Map(manifest.items.map(item=>[item.sourceUrl,item]));
    for (const [table,columns] of Object.entries(mediaColumns)) for (const column of columns) {
      for (let offset=0;;offset+=500) {
        const {data,error}=await admin.from(table).select(`id,${column}`).order("id").range(offset,offset+499);if (error) throw error;
        for (const row of data ?? []) {
          const record=row as unknown as Record<string,string>;const original=record[column];if (!original) continue;
          const sourceUrl=table === "gallery_moments" ? `${projectUrl}/storage/v1/object/public/fest-media/${original}` : original;
          if (!sourceUrl.startsWith(`${projectUrl}/storage/v1/object/public/fest-media/`)) continue;
          let item=bySource.get(sourceUrl);
          if (!item) { const id=randomUUID();item={id,sourceUrl,key:table === "gallery_moments" ? original : `migration/${id}.webp`,references:[],state:"pending"};manifest.items.push(item);bySource.set(sourceUrl,item); }
          if (!item.references.some(ref=>ref.id===record.id && ref.table===table && ref.column===column)) item.references.push({table:table as MediaReference["table"],id:record.id,column,original});
        }
        if ((data?.length ?? 0)<500) break;
      }
    }
    validateMediaManifest(manifest,projectUrl);await save();console.log(JSON.stringify({action,items:manifest.items.length,path}));return;
  }
  const target=process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/,"");
  if (!target || new URL(target).protocol!=="https:" || (process.env.R2_ENVIRONMENT!=="staging" && new URL(target).hostname.endsWith("r2.dev"))) throw new Error("An approved HTTPS R2 media domain is required.");
  if (manifest.targetBase && manifest.targetBase!==target) throw new Error("Target domain differs from the saved manifest.");
  manifest.targetBase=target;
  if (["switch","rollback"].includes(action) && process.env.MEDIA_REFERENCE_APPROVAL!==new URL(projectUrl).hostname.split(".")[0]) throw new Error("Reference changes require explicit project-scoped MEDIA_REFERENCE_APPROVAL.");
  let processed=0;
  for (const item of manifest.items) {
    if (processed>=limit) break;
    if (action==="copy" && item.state==="pending") {
      const {R2_ACCOUNT_ID,R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_PUBLIC_BUCKET}=process.env;
      if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_BUCKET) throw new Error("R2 credentials and approved bucket required.");
      const source=await fetch(item.sourceUrl,{redirect:"error"});if (!source.ok) throw new Error(`Source unavailable: ${item.id}`);
      const length=Number(source.headers.get("content-length"));if (length>MAX_MEDIA_BYTES) throw new Error(`Oversized source: ${item.id}`);
      const bytes=new Uint8Array(await source.arrayBuffer());const image=await optimiseMedia(bytes,source.headers.get("content-type")?.split(";")[0] ?? "");
      const client=new S3Client({region:"auto",endpoint:`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:R2_ACCESS_KEY_ID,secretAccessKey:R2_SECRET_ACCESS_KEY}});
      const variants:Record<string,string>={};for (const [variant,body] of [["full",image.full],["thumb",image.thumb]] as const) {const key=`${item.key}/${variant}.webp`;await client.send(new PutObjectCommand({Bucket:R2_PUBLIC_BUCKET,Key:key,Body:body,ContentType:"image/webp",CacheControl:"public,max-age=31536000,immutable"}));variants[variant]=`${target}/${key}`;}
      const existing=await admin.from("media_assets").select("id,purpose").eq("object_key",item.key).maybeSingle();if (existing.error) throw existing.error;if (existing.data && existing.data.purpose!=="migration") throw new Error("Target key already belongs to a different upload.");
      const actor=await admin.from("staff_assignments").select("profile_id").eq("role","main_admin").is("revoked_at",null).limit(1).single();if (actor.error) throw actor.error;
      const assetId=existing.data?.id ?? randomUUID();
      const registered=await admin.from("media_assets").upsert({id:assetId,owner_id:actor.data.profile_id,purpose:"migration",provider:"r2",object_key:item.key,state:"validated",input_mime:source.headers.get("content-type")?.split(";")[0],input_size:bytes.length,expires_at:new Date().toISOString(),public_url:variants.full,variants,sha256:image.sha256,width:image.width,height:image.height,bytes:image.full.length},{onConflict:"object_key"});if (registered.error) throw registered.error;
      Object.assign(item,{assetId,state:"copied",targetUrl:variants.full,sha256:image.sha256,originalSha256:createHash("sha256").update(bytes).digest("hex"),width:image.width,height:image.height,bytes:image.full.length});
    } else if (action==="verify" && item.state==="copied") {
      const response=await fetch(item.targetUrl!,{redirect:"error"});if (!response.ok) throw new Error(`Destination unavailable: ${item.id}`);const bytes=Buffer.from(await response.arrayBuffer());const metadata=await sharp(bytes).metadata();
      if (createHash("sha256").update(bytes).digest("hex")!==item.sha256 || metadata.width!==item.width || metadata.height!==item.height || metadata.format!=="webp") throw new Error(`Verification mismatch: ${item.id}`);
      item.state="verified";
    } else if (action==="switch" && item.state==="verified" || action==="rollback" && ["switched","verified"].includes(item.state)) {
      const forward=action==="switch";
      for (const ref of item.references) {
        if (ref.table==="gallery_moments") continue;
        const before=forward ? ref.original : item.targetUrl;const after=forward ? item.targetUrl : ref.original;
        const current=await admin.from(ref.table).select(ref.column).eq("id",ref.id).single();if (current.error) throw current.error;
        const value=(current.data as unknown as Record<string,string>)[ref.column];if (value===after) continue;if (value!==before) throw new Error(`Reference changed since manifest discovery: ${ref.table}/${ref.id}`);
        const updated=await admin.from(ref.table).update({[ref.column]:after}).eq("id",ref.id).eq(ref.column,before!).select("id").single();if (updated.error) throw updated.error;
      }
      const registered=await admin.from("media_assets").update({state:forward ? "public" : "validated"}).eq("id",item.assetId!);if (registered.error) throw registered.error;
      item.state=forward ? "switched" : "rolled_back";
    } else continue;
    processed++;await save();console.log(JSON.stringify({item:item.id,state:item.state,bytes:item.bytes}));
  }
  console.log(JSON.stringify({action,processed,states:manifest.items.reduce((counts,item)=>({...counts,[item.state]:(counts[item.state] ?? 0)+1}),{} as Record<string,number>)}));
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Migration failed.");process.exitCode=1;});
