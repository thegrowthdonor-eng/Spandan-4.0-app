import "server-only";
import { GetObjectCommand,PutObjectCommand,S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createAdminClient } from "@/server/supabase/admin";
import { optimiseMedia } from "./image";

export type MediaAsset = { id:string;owner_id:string;event_id:string|null;purpose:string;provider:"r2"|"supabase";object_key:string;state:string;input_mime:string;input_size:number;expires_at:string;public_url:string|null;variants:Record<string,string> };
export function r2Enabled() { return process.env.MEDIA_PROVIDER === "r2"; }
function configuration() {
  const {R2_ACCOUNT_ID,R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_PRIVATE_BUCKET,R2_PUBLIC_BUCKET,R2_PUBLIC_BASE_URL} = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PRIVATE_BUCKET || !R2_PUBLIC_BUCKET || !R2_PUBLIC_BASE_URL) throw new Error("R2 storage is not configured. Ask the administrator to configure staging credentials.");
  if (R2_PRIVATE_BUCKET === R2_PUBLIC_BUCKET || !/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID)) throw new Error("Use a valid R2 account and separate private/public buckets.");
  const base = new URL(R2_PUBLIC_BASE_URL);
  if (base.protocol !== "https:" || (process.env.R2_ENVIRONMENT !== "staging" && base.hostname.endsWith("r2.dev"))) throw new Error("Production media requires an HTTPS custom domain, not r2.dev.");
  return { client:new S3Client({region:"auto",endpoint:`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:R2_ACCESS_KEY_ID,secretAccessKey:R2_SECRET_ACCESS_KEY}}),privateBucket:R2_PRIVATE_BUCKET,publicBucket:R2_PUBLIC_BUCKET,base:base.toString().replace(/\/$/,"") };
}
export async function authoriseMediaUpload(asset: MediaAsset) {
  const {client,privateBucket} = configuration();
  return getSignedUrl(client,new PutObjectCommand({Bucket:privateBucket,Key:`staging/${asset.object_key}`,ContentType:asset.input_mime,ContentLength:asset.input_size}),{expiresIn:300});
}
export async function finaliseMedia(asset: MediaAsset) {
  if (asset.state !== "uploading") return asset;
  if (Date.parse(asset.expires_at) <= Date.now()) throw new Error("Upload authorisation expired. Choose the file again.");
  const {client,privateBucket} = configuration();
  const input = await client.send(new GetObjectCommand({Bucket:privateBucket,Key:`staging/${asset.object_key}`}));
  if (input.ContentLength !== asset.input_size || input.ContentType !== asset.input_mime || !input.Body) throw new Error("Uploaded file does not match its authorisation.");
  const optimised = await optimiseMedia(await input.Body.transformToByteArray(),asset.input_mime);
  const variants:Record<string,string>={};
  for (const [variant,body] of [["full",optimised.full],["thumb",optimised.thumb]] as const) {
    const key=`validated/${asset.object_key}/${optimised.sha256}/${variant}.webp`;
    await client.send(new PutObjectCommand({Bucket:privateBucket,Key:key,Body:body,ContentType:"image/webp",CacheControl:"private, no-store"}));
    variants[`private_${variant}`]=key;
  }
  const { data,error } = await createAdminClient().from("media_assets").update({state:"validated",variants,sha256:optimised.sha256,width:optimised.width,height:optimised.height,bytes:optimised.full.length}).eq("id",asset.id).eq("state","uploading").select().single();
  if (error) throw new Error("Unable to finalise the upload. Retry safely.");
  return data as MediaAsset;
}
export async function privateMediaUrl(asset: MediaAsset) {
  if (asset.state === "public" && asset.public_url) return asset.public_url;
  if (asset.state !== "validated") throw new Error("Image is not ready for review.");
  const {client,privateBucket} = configuration();
  return getSignedUrl(client,new GetObjectCommand({Bucket:privateBucket,Key:asset.variants.private_full,ResponseContentType:"image/webp",ResponseCacheControl:"private, no-store"}),{expiresIn:60});
}
export async function publishMedia(asset: MediaAsset) {
  if (asset.state === "public" && asset.public_url) return asset;
  if (asset.state !== "validated") throw new Error("Validate the image before publishing.");
  const {client,privateBucket,publicBucket,base} = configuration();
  const variants:Record<string,string> = {};
  for (const variant of ["full","thumb"]) {
    const key = `${asset.object_key}/${variant}.webp`;
    const input = await client.send(new GetObjectCommand({Bucket:privateBucket,Key:asset.variants[`private_${variant}`]}));
    if (!input.Body) throw new Error("Validated image unavailable.");
    await client.send(new PutObjectCommand({Bucket:publicBucket,Key:key,Body:await input.Body.transformToByteArray(),ContentType:"image/webp",CacheControl:"public,max-age=31536000,immutable"}));
    variants[variant] = `${base}/${key}`;
  }
  const {data,error} = await createAdminClient().from("media_assets").update({state:"public",public_url:variants.full,variants}).eq("id",asset.id).eq("state","validated").select().single();
  if (error) throw new Error("Image uploaded but publication registration failed. Retry safely.");
  return data as MediaAsset;
}

export async function storePublicMedia({bytes,mime,key,ownerId,eventId,purpose}:{bytes:Uint8Array;mime:string;key:string;ownerId:string;eventId:string|null;purpose:string}) {
  const optimised = await optimiseMedia(bytes,mime);
  const admin = createAdminClient();
  if (!r2Enabled()) {
    const path = key.replace(/\.[^.]+$/, ".webp");
    const {error} = await admin.storage.from("fest-media").upload(path,optimised.full,{contentType:"image/webp",cacheControl:"31536000",upsert:false});
    if (error) throw new Error("Image upload failed.");
    return { provider:"supabase" as const,key:path,publicUrl:admin.storage.from("fest-media").getPublicUrl(path).data.publicUrl };
  }
  const {client,publicBucket,base} = configuration();
  const objectKey = key;
  const variants:Record<string,string> = {};
  for (const [variant,body] of [["full",optimised.full],["thumb",optimised.thumb]] as const) { const path = `${objectKey}/${variant}.webp`;await client.send(new PutObjectCommand({Bucket:publicBucket,Key:path,Body:body,ContentType:"image/webp",CacheControl:"public,max-age=31536000,immutable"}));variants[variant]=`${base}/${path}`; }
  const {error} = await admin.from("media_assets").insert({owner_id:ownerId,event_id:eventId,purpose,provider:"r2",object_key:objectKey,state:"public",input_mime:mime,input_size:bytes.length,expires_at:new Date().toISOString(),public_url:variants.full,variants,sha256:optimised.sha256,width:optimised.width,height:optimised.height,bytes:optimised.full.length});
  if (error) throw new Error("Image uploaded but media reference could not be saved.");
  return {provider:"r2" as const,key:objectKey,publicUrl:variants.full};
}

export async function archiveMedia(keys:string[]) {
  // Retain objects for rollback; cleanup is a separate explicitly approved operation.
  if (!keys.length) return {error:null};
  return createAdminClient().from("media_assets").update({state:"archived"}).in("object_key",keys);
}
