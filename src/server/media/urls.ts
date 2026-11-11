import "server-only";
import { createPublicClient } from "@/server/supabase/public";

export async function mediaUrls(keys:string[]) {
  const client=createPublicClient();
  const {data,error}=keys.length ? await client.rpc("public_media_urls",{p_keys:keys}) : {data:[],error:null};
  if (error) throw new Error("Media references unavailable; retry shortly.");
  const urls=new Map<string,string>((data ?? []).map((row:{object_key:string;public_url:string})=>[row.object_key,row.public_url]));
  return (key:string)=>urls.get(key) ?? client.storage.from("fest-media").getPublicUrl(key).data.publicUrl;
}
