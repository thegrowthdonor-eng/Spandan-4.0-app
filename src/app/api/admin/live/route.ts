import { NextResponse } from "next/server";
import { z } from "zod";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const command = z.object({
  entryId: z.string().uuid(),
  status: z.enum(["scheduled","live","paused","completed","cancelled"]),
  updateNote: z.string().trim().max(500).default(""),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  venue: z.string().trim().max(160).default(""),
}).strict();

export async function POST(request:Request){
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"Invalid request origin."},{status:403,headers:noStore});
  if(!hasPublicSupabaseConfiguration())return NextResponse.json({error:"Live desk unavailable."},{status:503,headers:noStore});
  let input:unknown;try{input=await request.json()}catch{return NextResponse.json({error:"Invalid live desk request."},{status:400,headers:noStore})}
  const parsed=command.safeParse(input);if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid live desk request."},{status:400,headers:noStore});
  const client=await createRequestClient();if(!(await client.auth.getUser()).data.user)return NextResponse.json({error:"Sign in again."},{status:401,headers:noStore});
  const data=parsed.data;const result=await client.rpc("manage_programme_live_entry",{p_schedule_entry_id:data.entryId,p_status:data.status,p_update_note:data.updateNote||null,p_starts_at:data.startsAt,p_ends_at:data.endsAt,p_venue:data.venue||null});
  if(result.error){if(result.error.code==="42501")return NextResponse.json({error:"Only the central live desk can update this programme."},{status:403,headers:noStore});return NextResponse.json({error:result.error.code==="22023"?result.error.message:"Unable to save the programme update."},{status:result.error.code==="22023"?400:503,headers:noStore})}
  return NextResponse.json({ok:true,data:result.data},{headers:noStore});
}
