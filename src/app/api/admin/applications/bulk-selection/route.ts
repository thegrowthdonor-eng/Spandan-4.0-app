import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { bulkSoloSelectionSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid bulk selection request." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check the selection payload and try again." }, { status: 400, headers });
  }

  const parsed = bulkSoloSelectionSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) {
    return NextResponse.json(
      { error: parsed.error?.issues[0]?.message ?? "Bulk selection is currently unavailable." },
      { status: 400, headers }
    );
  }

  const denied = NextResponse.json({ error: "Not authorised to select these participants." }, { status: 403, headers });
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)),
      },
    }
  );

  if (!(await client.auth.getUser()).data.user) return denied;

  const { data: count, error } = await client.rpc("bulk_solo_selection", {
    p_application_ids: parsed.data.applicationIds,
    p_selection_state: parsed.data.state,
    p_reason: parsed.data.reason || null,
  });

  if (error) {
    if (error.code === "42501") return denied;
    if (error.code === "22023") {
      return NextResponse.json({ error: "Invalid bulk selection parameters." }, { status: 400, headers });
    }
    return NextResponse.json({ error: "Unable to process bulk selection right now." }, { status: 503, headers });
  }

  return NextResponse.json({ ok: true, processedCount: count }, { headers });
}
