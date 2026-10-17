import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pollCreateSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid poll creation request." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check payload and try again." }, { status: 400, headers });
  }

  const parsed = pollCreateSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) {
    return NextResponse.json(
      { error: parsed.error?.issues[0]?.message ?? "Poll creation is currently unavailable." },
      { status: 400, headers }
    );
  }

  const denied = NextResponse.json({ error: "Not authorised to create festival polls." }, { status: 403, headers });
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

  const { data, error } = await client.rpc("create_admin_poll", {
    p_edition_id: parsed.data.editionId,
    p_question: parsed.data.question,
    p_opens_at: parsed.data.opensAt,
    p_closes_at: parsed.data.closesAt,
    p_options: parsed.data.options,
    p_show_totals: parsed.data.showTotals,
  });

  if (error) {
    if (error.code === "42501" || error.code === "28000") return denied;
    if (error.code === "22023") {
      return NextResponse.json({ error: "Invalid poll parameters or timeframe." }, { status: 400, headers });
    }
    return NextResponse.json({ error: "Unable to create poll right now." }, { status: 503, headers });
  }

  return NextResponse.json({ ok: true, poll: data }, { headers });
}
