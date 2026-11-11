import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status:403,headers });
  const parsed = z.object({ pollId:z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error:"Invalid voting round." },{status:400,headers});
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) return NextResponse.json({ error:"Sign in with your active festival account to vote." },{status:401,headers});
  const token = randomBytes(32).toString("hex");
  const { data,error } = await client.rpc("register_competition_vote_grant", { p_poll_id:parsed.data.pollId,p_hash:createHash("sha256").update(token).digest("hex") });
  if (error) return NextResponse.json({ error:["22023","42501","28000"].includes(error.code) ? error.message : "Voting permission unavailable. Retry shortly." },{status:error.code === "42501" ? 403 : 400,headers});
  return NextResponse.json(data.optionId ? { optionId:data.optionId } : { token,expiresAt:data.expiresAt },{headers});
}
