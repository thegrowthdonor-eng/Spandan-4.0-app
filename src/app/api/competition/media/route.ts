import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { authoriseMediaUpload,finaliseMedia,r2Enabled,type MediaAsset } from "@/server/media/storage";

export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"Invalid origin."},{status:403,headers});
  const client=await createRequestClient(); const user=(await client.auth.getUser()).data.user;
  if (!user) return NextResponse.json({error:"Sign in required."},{status:401,headers});
  const body=await request.json().catch(()=>null);
  try {
    if (!r2Enabled()) throw new Error("Private competition uploads need R2 staging configuration. Existing uploaded media remains unchanged.");
    if (body?.action === "finalise") {
      const id=z.string().uuid().parse(body.mediaId);
      const {data,error}=await client.rpc("competition_media_access",{p_media_id:id});
      if (error || !data || data.owner_id !== user.id) return NextResponse.json({error:"Upload unavailable."},{status:403,headers});
      const asset=await finaliseMedia(data as MediaAsset);
      return NextResponse.json({ok:true,mediaId:asset.id},{headers});
    }
    const parsed=z.object({eventId:z.string().uuid(),mime:z.enum(["image/jpeg","image/png","image/webp"]),size:z.number().int().min(1).max(5*1024*1024)}).parse(body);
    const {data:w,error}=await client.rpc("competition_workspace",{p_event_id:parsed.eventId});
    if (error || !w?.candidates?.length || w.settings?.result_mode !== "public_vote" || !w.settings.submission_closes_at || Date.parse(w.settings.submission_closes_at)<=Date.now() || w.rounds?.length) return NextResponse.json({error:"Approved registration and open submissions are required."},{status:403,headers});
    const asset={id:crypto.randomUUID(),owner_id:user.id,event_id:parsed.eventId,purpose:"competition",provider:"r2",object_key:`competition/${parsed.eventId}/${crypto.randomUUID()}`,state:"uploading",input_mime:parsed.mime,input_size:parsed.size,expires_at:new Date(Date.now()+300_000).toISOString(),public_url:null,variants:{}} as MediaAsset;
    const usage=await createAdminClient().from("media_assets").select("id",{count:"exact",head:true}).eq("owner_id",user.id).gte("created_at",new Date(Date.now()-3_600_000).toISOString());
    if (usage.error || (usage.count ?? 0)>=20) return NextResponse.json({error:"Upload allowance reached. Retry later or contact the organiser."},{status:429,headers});
    const uploadUrl=await authoriseMediaUpload(asset);
    const saved=await createAdminClient().from("media_assets").insert(asset);
    if (saved.error) throw new Error("Unable to authorise this upload.");
    return NextResponse.json({ok:true,mediaId:asset.id,uploadUrl},{headers});
  } catch(error) { return NextResponse.json({error:error instanceof z.ZodError ? "Choose a valid image under 5 MB." : error instanceof Error ? error.message : "Media service unavailable."},{status:400,headers}); }
}
