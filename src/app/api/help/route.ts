import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { helpThreadSchema } from "@/server/auth/contracts";
import { z } from "zod";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid help request." }, { status: 403, headers });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Check your message and try again." }, { status: 400, headers }); }
  const replySchema = z.object({ threadId: z.string().uuid(), message: z.string().trim().min(1).max(5000) });
  const reply = replySchema.safeParse(body);
  const parsed = helpThreadSchema.safeParse(body);
  if ((!parsed.success && !reply.success) || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Check your help request and try again." }, { status: 400, headers });
  const denied = NextResponse.json({ error: "Please sign in to contact the help desk." }, { status: 401, headers });
  const store = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" }, cookies: { getAll: () => store.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)) } });
  if (!(await client.auth.getUser()).data.user) return denied;
  let error;
  if (reply.success) {
    ({ error } = await client.rpc("add_help_message", { p_thread_id: reply.data.threadId, p_message: reply.data.message }));
  } else if (parsed.success) {
    ({ error } = await client.rpc("create_help_thread", { p_edition_id: parsed.data.editionId, p_event_id: null, p_subject: parsed.data.subject, p_message: parsed.data.message }));
  } else {
    return NextResponse.json({ error: "Check your help request and try again." }, { status: 400, headers });
  }
  if (error) { if (error.code === "42501") return NextResponse.json({ error: "Your current fest access cannot open a help request." }, { status: 403, headers }); return NextResponse.json({ error: "Unable to send your request. Please try again." }, { status: 503, headers }); }
  return NextResponse.json({ ok: true }, { headers });
}
