import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClient } from "@/server/supabase/server";
import { privateMediaUrl,type MediaAsset } from "@/server/media/storage";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({error:"Image unavailable."},{status:404,headers});
  const client=await createRequestClient();
  if (!(await client.auth.getUser()).data.user) return NextResponse.json({error:"Sign in required."},{status:401,headers});
  const {data,error}=await client.rpc("competition_media_access",{p_media_id:id});
  if (error || !data) return NextResponse.json({error:"Image unavailable."},{status:403,headers});
  try { return NextResponse.redirect(await privateMediaUrl(data as MediaAsset),{status:302,headers}); }
  catch { return NextResponse.json({error:"Image preview unavailable."},{status:503,headers}); }
}
