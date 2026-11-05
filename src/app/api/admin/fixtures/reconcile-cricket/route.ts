import { NextResponse } from "next/server";
import { z } from "zod";
import { isCricHeroesUrl } from "@/server/competition/offline-score";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const schema = z.object({ fixtureId: z.string().uuid(), url: z.string().url().refine(isCricHeroesUrl, "Use an official CricHeroes HTTPS link.") }).strict();

export async function POST(request: Request) {
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"Invalid request origin."},{status:403,headers:noStore});
  if(!hasPublicSupabaseConfiguration())return NextResponse.json({error:"Scoring service unavailable."},{status:503,headers:noStore});
  let input:unknown;try{input=await request.json()}catch{return NextResponse.json({error:"Invalid request."},{status:400,headers:noStore})}
  const parsed=schema.safeParse(input);if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid CricHeroes link."},{status:400,headers:noStore});
  const client=await createRequestClient();if(!(await client.auth.getUser()).data.user)return NextResponse.json({error:"Sign in again."},{status:401,headers:noStore});
  const{error}=await client.rpc("reconcile_cricket_score",{p_fixture_id:parsed.data.fixtureId,p_cricheroes_url:parsed.data.url});
  if(error)return NextResponse.json({error:error.code==="42501"?"You are not assigned to this fixture.":error.message},{status:error.code==="42501"?403:400,headers:noStore});
  return NextResponse.json({ok:true},{headers:noStore});
}
