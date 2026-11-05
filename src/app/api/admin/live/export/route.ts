import { NextResponse } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";

export const dynamic="force-dynamic";
export async function GET(){
  if(!hasPublicSupabaseConfiguration())return NextResponse.json({error:"Export unavailable."},{status:503});
  const client=await createRequestClient();if(!(await client.auth.getUser()).data.user)return NextResponse.json({error:"Sign in again."},{status:401});
  const{data,error}=await client.rpc("export_live_ground_data");if(error)return NextResponse.json({error:error.code==="42501"?"Main administrator access required.":"Unable to create export."},{status:error.code==="42501"?403:503});
  return new NextResponse(JSON.stringify(data,null,2),{headers:{"Content-Type":"application/json","Content-Disposition":`attachment; filename="spandan-live-ground-${new Date().toISOString().slice(0,10)}.json"`,"Cache-Control":"no-store"}});
}
