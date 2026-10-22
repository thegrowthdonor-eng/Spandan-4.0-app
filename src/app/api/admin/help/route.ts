import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { helpStaffSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Help desk service unavailable." }, { status: 503, headers });
  }

  const denied = NextResponse.json({ error: "Not authorised for staff help desk." }, { status: 403, headers });
  const store = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)),
      },
    }
  );

  if (!(await client.auth.getUser()).data.user) return denied;

  const threadId = new URL(request.url).searchParams.get("threadId");
  if (threadId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) {
    return NextResponse.json({ error: "Valid help thread ID required." }, { status: 400, headers });
  }
  const { data, error } = threadId
    ? await client.rpc("get_help_thread_messages", { p_thread_id: threadId })
    : await client.rpc("list_help_threads_for_staff");
  if (error) {
    if (error.code === "42501" || error.code === "28000") return denied;
    return NextResponse.json({ error: "Unable to load help desk threads." }, { status: 500, headers });
  }

  return NextResponse.json(threadId ? { ok: true, messages: data ?? [] } : { ok: true, threads: data ?? [] }, { headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid help action." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check payload and try again." }, { status: 400, headers });
  }

  const parsed = helpStaffSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) {
    return NextResponse.json(
      { error: parsed.error?.issues[0]?.message ?? "Help desk service unavailable." },
      { status: 400, headers }
    );
  }

  const denied = NextResponse.json({ error: "Not authorised to manage this help thread." }, { status: 403, headers });
  const store = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)),
      },
    }
  );

  if (!(await client.auth.getUser()).data.user) return denied;

  const { data, error } = await client.rpc("manage_help_thread", {
    p_thread_id: parsed.data.threadId,
    p_action: parsed.data.action,
    p_reply: parsed.data.reply || null,
  });

  if (error) {
    if (error.code === "42501" || error.code === "28000") return denied;
    if (error.code === "22023") {
      return NextResponse.json({ error: "Invalid action parameters for help thread." }, { status: 400, headers });
    }
    return NextResponse.json({ error: "Unable to update help thread right now." }, { status: 503, headers });
  }

  return NextResponse.json({ ok: true, data }, { headers });
}
