import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pollVoteSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Polls service unavailable." }, { status: 503, headers });
  }

  const url = new URL(request.url);
  const editionId = url.searchParams.get("editionId");

  if (!editionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editionId)) {
    return NextResponse.json({ error: "Valid edition ID required." }, { status: 400, headers });
  }

  const denied = NextResponse.json({ error: "Please sign in to view polls." }, { status: 401, headers });
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

  const { data, error } = await client.rpc("get_active_polls", { p_edition_id: editionId });
  if (error) {
    return NextResponse.json({ error: "Unable to load festival polls." }, { status: 500, headers });
  }

  return NextResponse.json({ ok: true, polls: data ?? [] }, { headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid voting request." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check vote payload and try again." }, { status: 400, headers });
  }

  const parsed = pollVoteSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) {
    return NextResponse.json(
      { error: parsed.error?.issues[0]?.message ?? "Poll voting is currently unavailable." },
      { status: 400, headers }
    );
  }

  const denied = NextResponse.json({ error: "Please sign in with an active account to vote." }, { status: 401, headers });
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

  const { data, error } = await client.rpc("cast_poll_vote", {
    p_poll_id: parsed.data.pollId,
    p_option_id: parsed.data.optionId,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Your account is not active for voting." }, { status: 403, headers });
    }
    if (error.code === "22023") {
      return NextResponse.json({ error: error.message || "This poll is closed or option is invalid." }, { status: 400, headers });
    }
    return NextResponse.json({ error: "Unable to submit your vote right now." }, { status: 503, headers });
  }

  return NextResponse.json({ ok: true, vote: data }, { headers });
}
